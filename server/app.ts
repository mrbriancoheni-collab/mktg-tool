import fs from "node:fs";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import * as Sentry from "@sentry/node";
import type { AdPack } from "../shared/adpack";
import { ASSET_LABELS, type AssetKind } from "../shared/catalog";
import type { Graph } from "../shared/model";
import { validOps } from "../shared/ops";
import { roleAtLeast } from "../shared/plans";
import { AIError, LIVE, analyzeFunnel, chat, generateAdPack, generateAsset, planCampaign, type ChatTurn } from "./ai";
import { audit, authRouter, billingEnabled, effectivePlan, HttpError, originCheck, rateLimit, requireAuth, requireRole, sessionMiddleware } from "./auth";
import { billingRouter, stripeWebhook } from "./billing";
import { db } from "./db";
import * as integrations from "./integrations";
import { authorizeUrl, exchangeCode, providerConfigured, readState } from "./integrations/oauth";
import { ACCOUNT_LISTERS, CAMPAIGN_LISTERS, googleAds, metaAds } from "./integrations/providers";
import { broadcast, closeRoom, subscribe } from "./realtime";
import { buildReport, detectAnomalies, sendReport } from "./reports";
import * as store from "./store";
import { assertAiQuota, meter } from "./usage";
import { activationFunnel, recordEvents } from "./analytics";

const appUrl = (req: Request) => process.env.APP_URL ?? `${req.protocol}://${req.get("host")}`;

type Handler = (req: Request, res: Response) => unknown;
const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res))
    .then((out) => out !== undefined && !res.headersSent && res.json(out))
    .catch(next);

function errorStatus(err: unknown): [number, string] {
  if (err instanceof HttpError) return [err.status, err.message];
  if (err instanceof AIError) return [422, err.message];
  if (err instanceof Anthropic.AuthenticationError) return [502, "The AI provider rejected our credentials."];
  if (err instanceof Anthropic.RateLimitError) return [429, "The AI service is busy — try again shortly."];
  if (err instanceof Anthropic.APIError) return [502, `AI provider error: ${err.message}`];
  const status = (err as { status?: number })?.status;
  if (status && status >= 400 && status < 500) return [status, (err as Error).message];
  if (err instanceof SyntaxError && "body" in (err as object)) return [400, "Malformed JSON."];
  if (err instanceof Error && !status) return [500, "Something went wrong."];
  return [500, "Something went wrong."];
}

function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const [status, message] = errorStatus(err);
  if (status >= 500) {
    console.error(err);
    Sentry.captureException(err);
  }
  if (res.headersSent) return void res.end(`\n\n**Error:** ${message}`);
  res.status(status).json({ error: message });
}

async function streamText(res: Response, gen: AsyncGenerator<string>) {
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.setHeader("cache-control", "no-cache");
  res.setHeader("x-accel-buffering", "no");
  for await (const chunk of gen) res.write(chunk);
  res.end();
}

async function mustBoard(req: Request) {
  const b = await store.getBoard(req.auth!.workspace.id, String(req.params.id));
  if (!b) throw new HttpError(404, "Board not found");
  return b;
}

function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
  if (req.secure || (process.env.APP_URL ?? "").startsWith("https://")) res.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains");
  if (process.env.NODE_ENV === "production" && !req.path.startsWith("/api"))
    res.setHeader(
      "content-security-policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
    );
  next();
}

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY !== "false") app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS ?? 1));
  app.use(securityHeaders);

  app.get("/healthz", wrap(async () => {
    await db().query("SELECT 1");
    return { ok: true };
  }));

  // Stripe needs the raw body to verify signatures — mount before the JSON parser.
  app.post("/api/billing/webhook", express.raw({ type: "application/json", limit: "1mb" }), stripeWebhook);

  app.use(express.json({ limit: "5mb" }));
  app.use(sessionMiddleware);
  app.use("/api", originCheck);

  // ── Public ──
  app.get("/api/status", (_req, res) =>
    res.json({ ai: LIVE ? "live" : "demo", billingEnabled: billingEnabled(), oauth: { google: providerConfigured("google"), meta: providerConfigured("meta") } }),
  );
  app.use("/api", authRouter);

  app.post("/api/client-errors", rateLimit("client-errors", 30, 60_000), (req, res) => {
    const { message, stack, url } = req.body ?? {};
    console.error("[client error]", String(message).slice(0, 500), String(url ?? "").slice(0, 200));
    Sentry.captureMessage(`Client error: ${String(message).slice(0, 300)}`, { level: "error", extra: { stack: String(stack ?? "").slice(0, 4000), url } });
    res.json({ ok: true });
  });

  app.post("/api/events", rateLimit("events", 120, 60_000), wrap(async (req) => {
    await recordEvents(req, Array.isArray(req.body?.events) ? req.body.events : []);
    return { ok: true };
  }));
  // Internal analytics for operators: set ADMIN_EMAILS (comma-separated).
  app.get("/api/admin/metrics", requireAuth, wrap(async (req) => {
    const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (!admins.includes(req.auth!.user.email)) throw new HttpError(403, "Admins only.");
    return activationFunnel(Number(req.query.days ?? 30));
  }));

  // Share links: view + comment without an account.
  app.get("/api/shared/:token", wrap(async (req) => {
    const b = await store.getByShareToken(String(req.params.token));
    if (!b) throw new HttpError(404, "This share link is invalid or has been turned off.");
    return store.publicBoard(b);
  }));
  app.get("/api/shared/:token/events", wrap(async (req, res) => {
    const b = await store.getByShareToken(String(req.params.token));
    if (!b) throw new HttpError(404, "This share link is invalid or has been turned off.");
    subscribe(req, res, b.id, { clientId: String(req.query.clientId ?? ""), name: String(req.query.name ?? "Guest"), editor: false, version: b.version });
  }));
  app.post("/api/shared/:token/comments", rateLimit("shared-comments", 20, 60_000), wrap(async (req) => {
    const b = await store.getByShareToken(String(req.params.token));
    if (!b) throw new HttpError(404, "This share link is invalid or has been turned off.");
    const c = await store.addComment(b.id, commentInput(req, null));
    broadcast(b.id, "comments", { comments: await store.listComments(b.id) });
    return c;
  }));

  // ── Everything below requires a signed-in user ──
  app.use("/api", billingRouter);
  app.use("/api", requireAuth);

  // AI
  app.post("/api/ai/plan", requireRole("member"), wrap(async (req) => {
    const brief = String(req.body?.brief ?? "").trim().slice(0, 8000);
    if (!brief) throw new HttpError(400, "Describe the campaign first.");
    await assertAiQuota(req);
    return planCampaign(brief, meter(req, "plan"));
  }));
  app.post("/api/ai/asset", requireRole("member"), wrap(async (req, res) => {
    const { graph, nodeId, kind, instructions } = req.body as { graph: Graph; nodeId: string; kind: AssetKind; instructions?: string };
    if (!graph || !nodeId || !(kind in ASSET_LABELS)) throw new HttpError(400, "Invalid request");
    await assertAiQuota(req);
    await streamText(res, generateAsset(graph, nodeId, kind, instructions?.slice(0, 2000), meter(req, `asset:${kind}`)));
  }));
  app.post("/api/ai/analyze", requireRole("member"), wrap(async (req) => {
    await assertAiQuota(req);
    return analyzeFunnel(req.body.graph as Graph, meter(req, "analyze"));
  }));
  app.post("/api/ai/adpack", requireRole("member"), wrap(async (req) => {
    const { graph, nodeId, finalUrl, instructions } = req.body as { graph: Graph; nodeId: string; finalUrl: string; instructions?: string };
    await assertAiQuota(req);
    return generateAdPack(graph, nodeId, finalUrl ?? "", instructions?.slice(0, 2000), meter(req, "adpack"));
  }));
  app.post("/api/ai/chat", requireRole("member"), wrap(async (req, res) => {
    const { graph, history } = req.body as { graph: Graph; history: ChatTurn[] };
    if (!graph || !history?.length) throw new HttpError(400, "Invalid request");
    await assertAiQuota(req);
    await streamText(res, chat(graph, history.slice(-20).map((t) => ({ role: t.role === "assistant" ? "assistant" : "user", content: String(t.content).slice(0, 20000) })), meter(req, "chat")));
  }));

  // Boards
  const assertBoardLimit = async (req: Request) => {
    const plan = effectivePlan(req.auth!.workspace.plan);
    if ((await store.countBoards(req.auth!.workspace.id)) >= plan.boards) throw new HttpError(402, `The ${plan.name} plan includes ${plan.boards} boards. Upgrade for unlimited boards.`);
  };
  app.get("/api/boards", wrap((req) => store.listBoards(req.auth!.workspace.id)));
  app.post("/api/boards", requireRole("member"), wrap(async (req) => {
    await assertBoardLimit(req);
    const { name, goal, summary, graph, analysis } = req.body ?? {};
    const b = await store.createBoard(req.auth!.workspace.id, req.auth!.user.id, { name, goal, summary, graph, analysis });
    await audit(req, "board.created", b.id);
    return b;
  }));
  app.get("/api/boards/:id", wrap(async (req) => {
    const b = await mustBoard(req);
    return roleAtLeast(req.auth!.role, "member") ? b : { ...b, schedule: null };
  }));
  app.delete("/api/boards/:id", requireRole("member"), wrap(async (req) => {
    const b = await mustBoard(req);
    await store.deleteBoard(req.auth!.workspace.id, b.id);
    closeRoom(b.id, "This board was deleted.");
    await audit(req, "board.deleted", b.id, { name: b.name });
    return { ok: true };
  }));
  app.post("/api/boards/:id/duplicate", requireRole("member"), wrap(async (req) => {
    await assertBoardLimit(req);
    const b = await mustBoard(req);
    return store.createBoard(req.auth!.workspace.id, req.auth!.user.id, { name: `${b.name} (copy)`, goal: b.goal, summary: b.summary, graph: structuredClone(b.graph), analysis: b.analysis });
  }));
  app.get("/api/boards/:id/events", wrap(async (req, res) => {
    const b = await mustBoard(req);
    subscribe(req, res, b.id, { clientId: String(req.query.clientId ?? ""), name: req.auth!.user.name || req.auth!.user.email, editor: roleAtLeast(req.auth!.role, "member"), version: b.version });
  }));
  app.post("/api/boards/:id/ops", requireRole("member"), wrap(async (req) => {
    const { ops, clientId } = req.body ?? {};
    if (!validOps(ops)) throw new HttpError(400, "Invalid operations");
    const version = await store.applyBoardOps(req.auth!.workspace.id, String(req.params.id), ops);
    broadcast(String(req.params.id), "ops", { ops, version, clientId, by: req.auth!.user.name || req.auth!.user.email }, clientId);
    return { version };
  }));
  app.post("/api/boards/:id/share", requireRole("member"), wrap(async (req) => {
    const b = await mustBoard(req);
    const token = await store.setShare(req.auth!.workspace.id, b.id, req.body?.enabled !== false);
    await audit(req, token ? "board.shared" : "board.unshared", b.id);
    return { shareToken: token };
  }));

  // Comments (viewers may comment; members moderate)
  function commentInput(req: Request, userId: string | null) {
    const text = String(req.body?.text ?? "").trim().slice(0, 4000);
    if (!text) throw new HttpError(400, "Comment is empty.");
    return { nodeId: req.body?.nodeId ?? null, author: String(req.body?.author ?? "Guest").trim().slice(0, 60) || "Guest", userId, text };
  }
  app.get("/api/boards/:id/comments", wrap(async (req) => store.listComments((await mustBoard(req)).id)));
  app.post("/api/boards/:id/comments", wrap(async (req) => {
    const b = await mustBoard(req);
    req.body.author = req.auth!.user.name || req.auth!.user.email;
    const c = await store.addComment(b.id, commentInput(req, req.auth!.user.id));
    broadcast(b.id, "comments", { comments: await store.listComments(b.id) });
    return c;
  }));
  app.patch("/api/boards/:id/comments/:cid", requireRole("member"), wrap(async (req) => {
    const c = await store.updateComment(req.auth!.workspace.id, String(req.params.id), String(req.params.cid), !!req.body?.resolved);
    broadcast(String(req.params.id), "comments", { comments: await store.listComments(String(req.params.id)) });
    return c;
  }));
  app.delete("/api/boards/:id/comments/:cid", requireRole("member"), wrap(async (req) => {
    await store.deleteComment(req.auth!.workspace.id, String(req.params.id), String(req.params.cid));
    broadcast(String(req.params.id), "comments", { comments: await store.listComments(String(req.params.id)) });
    return { ok: true };
  }));

  // Reports & alerts
  app.put("/api/boards/:id/schedule", requireRole("member"), wrap(async (req) => {
    const b = await mustBoard(req);
    const s = req.body ?? {};
    if (s.enabled && !effectivePlan(req.auth!.workspace.plan).scheduledReports) throw new HttpError(402, "Scheduled reports are available on Pro and Team plans.");
    const schedule: store.ReportSchedule = {
      enabled: !!s.enabled,
      frequency: s.frequency === "daily" ? "daily" : "weekly",
      hour: Math.min(23, Math.max(0, Number(s.hour ?? 9))),
      weekday: Math.min(6, Math.max(0, Number(s.weekday ?? 1))),
      channels: (Array.isArray(s.channels) ? s.channels : []).filter((c: string) => integrations.CONNECTORS[c]?.notify),
      syncFirst: !!s.syncFirst,
      lastSentAt: b.schedule?.lastSentAt,
    };
    await store.setSchedule(req.auth!.workspace.id, b.id, schedule);
    return schedule;
  }));
  app.get("/api/boards/:id/report", wrap(async (req) => buildReport(await mustBoard(req), appUrl(req))));
  app.post("/api/boards/:id/report/send", requireRole("member"), wrap(async (req) => sendReport(await mustBoard(req), appUrl(req))));
  app.post("/api/anomalies", wrap((req) => detectAnomalies(req.body.graph as Graph)));

  // Integrations
  const ws = (req: Request) => req.auth!.workspace.id;
  app.get("/api/integrations", wrap(async (req) => {
    const list = await integrations.listConnections(ws(req));
    return list.map((c) => ({ ...c, oauthConfigured: c.oauth ? providerConfigured(c.oauth) : null }));
  }));
  app.post("/api/integrations/:type/connect", requireRole("admin"), wrap(async (req) => {
    await integrations.connect(ws(req), String(req.params.type), req.body ?? {});
    await audit(req, "integration.connected", String(req.params.type));
    return { ok: true };
  }));
  app.post("/api/integrations/:type/disconnect", requireRole("admin"), wrap(async (req) => {
    await integrations.disconnect(ws(req), String(req.params.type));
    await audit(req, "integration.disconnected", String(req.params.type));
    return { ok: true };
  }));
  app.post("/api/integrations/:type/notify", requireRole("member"), wrap(async (req) => {
    await integrations.notify(ws(req), String(req.params.type), String(req.body?.text ?? ""));
    return { ok: true };
  }));
  app.post("/api/integrations/sync", requireRole("member"), wrap((req) => integrations.syncMetrics(ws(req), req.body.graph as Graph)));

  // OAuth connections (Google Ads, GA4, Meta)
  const requireLive = (req: Request) => {
    if (!effectivePlan(req.auth!.workspace.plan).liveConnectors) throw new HttpError(402, "Live platform connections are available on Pro and Team plans.");
  };
  app.get("/api/oauth/start", requireRole("admin"), wrap(async (req, res) => {
    requireLive(req);
    const type = String(req.query.type);
    const c = integrations.CONNECTORS[type];
    if (!c?.oauth) throw new HttpError(400, "This integration doesn't use OAuth.");
    res.redirect(authorizeUrl(c.oauth, type, ws(req), req.auth!.user.id, appUrl(req)));
  }));
  app.get("/api/oauth/callback", wrap(async (req, res) => {
    const st = readState(String(req.query.state ?? ""));
    const back = (q: string) => res.redirect(`/?${q}`);
    if (!st || st.u !== req.auth!.user.id || st.ws !== ws(req)) return back("oauth_error=" + encodeURIComponent("Connection expired or was started in another session — please try again."));
    if (req.query.error) return back("oauth_error=" + encodeURIComponent(String(req.query.error_description ?? req.query.error)));
    const creds = await exchangeCode(st.p, String(req.query.code ?? ""), appUrl(req));
    await integrations.saveConnection(st.ws, st.type, creds, null);
    await audit(req, "integration.connected", st.type, { oauth: st.p });
    back(`connected=${encodeURIComponent(st.type)}`);
  }));
  app.get("/api/integrations/:type/accounts", requireRole("admin"), wrap(async (req) => {
    const type = String(req.params.type);
    const ctx = await integrations.getConnection(ws(req), type);
    if (!ctx || !ACCOUNT_LISTERS[type]) throw new HttpError(400, "Connect this integration first.");
    return ACCOUNT_LISTERS[type](ctx);
  }));
  app.post("/api/integrations/:type/account", requireRole("admin"), wrap(async (req) => {
    const id = String(req.body?.id ?? "").trim();
    if (!id) throw new HttpError(400, "Choose an account.");
    await integrations.setConnectionAccount(ws(req), String(req.params.type), id, req.body?.loginCustomerId ? { loginCustomerId: String(req.body.loginCustomerId) } : undefined);
    return { ok: true };
  }));
  app.get("/api/integrations/:type/campaigns", requireRole("member"), wrap(async (req) => {
    const type = String(req.params.type);
    const ctx = await integrations.getConnection(ws(req), type);
    if (!ctx || !CAMPAIGN_LISTERS[type]) throw new HttpError(400, "Connect this integration first.");
    return CAMPAIGN_LISTERS[type](ctx);
  }));
  app.get("/api/integrations/meta_ads_mgr/pages", requireRole("member"), wrap(async (req) => {
    const ctx = await integrations.getConnection(ws(req), "meta_ads_mgr");
    if (!ctx) throw new HttpError(400, "Connect Meta Ads Manager first.");
    return metaAds.pages(ctx);
  }));
  app.post("/api/publish", requireRole("member"), wrap(async (req) => {
    requireLive(req);
    const { pack, target, campaignId, pageId } = req.body as { pack: AdPack; target: "google_ads_mgr" | "meta_ads_mgr"; campaignId?: string; pageId?: string };
    if (!pack?.adGroups?.length) throw new HttpError(400, "Nothing to publish.");
    const ctx = await integrations.getConnection(ws(req), target);
    if (!ctx) throw new HttpError(400, "Connect the ad platform first.");
    const out = target === "google_ads_mgr" ? await googleAds.publish(ctx, String(campaignId ?? ""), pack) : await metaAds.publish(ctx, String(pageId ?? ""), pack);
    await audit(req, "ads.published_draft", target, { count: out.created.length });
    return out;
  }));

  // Privacy: export & deletion for the current workspace
  app.get("/api/privacy/export", requireRole("admin"), wrap(async (req, res) => {
    res.setHeader("content-disposition", `attachment; filename="adcanvas-export-${new Date().toISOString().slice(0, 10)}.json"`);
    const members = await db().query(`SELECT u.name, u.email, m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1`, [ws(req)]);
    await audit(req, "privacy.exported");
    return {
      exportedAt: new Date().toISOString(),
      workspace: req.auth!.workspace,
      members,
      boards: await store.exportWorkspace(ws(req)),
      integrations: (await integrations.listConnections(ws(req))).filter((c) => c.connected).map((c) => ({ type: c.type, account: c.account })),
      note: "Integration credentials are never included in exports.",
    };
  }));
  app.delete("/api/privacy/data", requireRole("owner"), wrap(async (req) => {
    await store.deleteWorkspaceContent(ws(req));
    await audit(req, "privacy.workspace_content_deleted");
    return { ok: true };
  }));

  app.use("/api", (_req, _res, next) => next(new HttpError(404, "Not found")));

  // Production: serve the built client
  const dist = path.resolve("dist");
  if (process.env.NODE_ENV === "production" && fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: "1h" }));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
  }

  app.use(errorHandler);
  return app;
}
