import fs from "node:fs";
import path from "node:path";
import express, { type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { ASSET_LABELS, type AssetKind } from "../shared/catalog";
import type { Graph } from "../shared/model";
import { AIError, LIVE, analyzeFunnel, chat, generateAdPack, generateAsset, planCampaign, type ChatTurn } from "./ai";
import * as integrations from "./integrations";
import { buildReport, detectAnomalies, sendReport, startScheduler } from "./reports";
import { createBoard, heartbeat, newId, publicBoard, repo, type Board, type ReportSchedule } from "./store";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "5mb" }));
app.use((_req, res, next) => {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
  next();
});

const APP_URL = process.env.APP_URL; // public URL, used for links in reports

function sendError(res: Response, err: unknown) {
  console.error(err);
  let status = 500;
  let message = "Something went wrong.";
  if (err instanceof AIError) {
    status = 422;
    message = err.message;
  } else if (err instanceof Anthropic.AuthenticationError) {
    status = 401;
    message = "Anthropic API key is invalid.";
  } else if (err instanceof Anthropic.RateLimitError) {
    status = 429;
    message = "Rate limited by the AI provider — try again shortly.";
  } else if (err instanceof Anthropic.APIError) {
    status = 502;
    message = `AI provider error: ${err.message}`;
  } else if (err instanceof Error) {
    status = (err as Error & { status?: number }).status ?? 400;
    message = err.message;
  }
  if (res.headersSent) res.end(`\n\n**Error:** ${message}`);
  else res.status(status).json({ error: message });
}

const wrap = (fn: (req: Request, res: Response) => unknown) => async (req: Request, res: Response) => {
  try {
    const out = await fn(req, res);
    if (out !== undefined && !res.headersSent) res.json(out);
  } catch (err) {
    sendError(res, err);
  }
};

async function streamText(res: Response, gen: AsyncGenerator<string>) {
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.setHeader("cache-control", "no-cache");
  res.setHeader("x-accel-buffering", "no");
  try {
    for await (const chunk of gen) res.write(chunk);
    res.end();
  } catch (err) {
    sendError(res, err);
  }
}

function mustGet(id: string): Board {
  const b = repo.get(id);
  if (!b) throw Object.assign(new Error("Board not found"), { status: 404 });
  return b;
}

app.get("/api/status", (_req, res) => res.json({ ai: LIVE ? "live" : "demo" }));

// ── AI ──
app.post("/api/ai/plan", wrap(async (req) => {
  const brief = String(req.body?.brief ?? "").trim();
  if (!brief) throw new Error("Describe the campaign first.");
  return planCampaign(brief);
}));
app.post("/api/ai/asset", async (req, res) => {
  const { graph, nodeId, kind, instructions } = req.body as { graph: Graph; nodeId: string; kind: AssetKind; instructions?: string };
  if (!graph || !nodeId || !(kind in ASSET_LABELS)) return void res.status(400).json({ error: "Invalid request" });
  await streamText(res, generateAsset(graph, nodeId, kind, instructions));
});
app.post("/api/ai/analyze", wrap((req) => analyzeFunnel(req.body.graph as Graph)));
app.post("/api/ai/adpack", wrap((req) => {
  const { graph, nodeId, finalUrl, instructions } = req.body as { graph: Graph; nodeId: string; finalUrl: string; instructions?: string };
  return generateAdPack(graph, nodeId, finalUrl ?? "", instructions);
}));
app.post("/api/ai/chat", async (req, res) => {
  const { graph, history } = req.body as { graph: Graph; history: ChatTurn[] };
  if (!graph || !history?.length) return void res.status(400).json({ error: "Invalid request" });
  await streamText(res, chat(graph, history.slice(-20)));
});

// ── Boards ──
app.get("/api/boards", wrap(() => repo.list()));
app.post("/api/boards", wrap((req) => {
  const { name, goal, summary, graph, analysis } = req.body ?? {};
  return createBoard({
    ...(name && { name }),
    ...(goal && { goal }),
    ...(summary && { summary }),
    ...(graph && { graph }),
    ...(analysis && { analysis }),
  });
}));
app.get("/api/boards/:id", wrap((req) => mustGet(req.params.id as string)));
/** Save board content. `baseUpdatedAt` guards against overwriting someone else's newer save. */
app.put("/api/boards/:id", wrap((req, res) => {
  const b = mustGet(req.params.id as string);
  const { name, goal, summary, graph, analysis, baseUpdatedAt, force } = req.body ?? {};
  if (!force && baseUpdatedAt && baseUpdatedAt < b.updatedAt) {
    res.status(409).json({ error: "This board was changed by someone else.", board: b });
    return;
  }
  Object.assign(b, { name: name ?? b.name, goal: goal ?? b.goal, summary: summary ?? b.summary, graph: graph ?? b.graph, analysis: analysis === undefined ? b.analysis : analysis, updatedAt: Date.now() });
  repo.save(b);
  return { updatedAt: b.updatedAt };
}));
app.get("/api/boards/:id/meta", wrap((req) => {
  const b = mustGet(req.params.id as string);
  return { updatedAt: b.updatedAt, comments: b.comments.length };
}));
app.delete("/api/boards/:id", wrap((req) => {
  repo.delete(req.params.id as string);
  return { ok: true };
}));
app.post("/api/boards/:id/duplicate", wrap((req) => {
  const b = mustGet(req.params.id as string);
  return createBoard({ name: `${b.name} (copy)`, goal: b.goal, summary: b.summary, graph: structuredClone(b.graph), analysis: b.analysis });
}));

// Presence: heartbeat returns who else is viewing.
app.post("/api/boards/:id/presence", wrap((req) => ({ others: heartbeat(req.params.id as string, String(req.body?.clientId ?? ""), String(req.body?.name ?? "")) })));

// Sharing: an unguessable token gives view + comment access.
app.post("/api/boards/:id/share", wrap((req) => {
  const b = mustGet(req.params.id as string);
  b.shareToken = req.body?.enabled === false ? null : b.shareToken ?? newId(18);
  repo.save(b);
  return { shareToken: b.shareToken };
}));
app.get("/api/shared/:token", wrap((req) => {
  const b = repo.getByShareToken(req.params.token as string);
  if (!b) throw new Error("This share link is invalid or has been turned off.");
  return publicBoard(b);
}));

// Comments (stored separately from content saves so they never conflict).
function addComment(b: Board, body: { nodeId?: string | null; author?: string; text?: string }) {
  const text = String(body.text ?? "").trim().slice(0, 4000);
  if (!text) throw new Error("Comment is empty.");
  const c = { id: newId(6), nodeId: body.nodeId ?? null, author: String(body.author ?? "Guest").slice(0, 60) || "Guest", text, createdAt: Date.now(), resolved: false };
  b.comments.push(c);
  repo.save(b);
  return c;
}
app.get("/api/boards/:id/comments", wrap((req) => mustGet(req.params.id as string).comments));
app.post("/api/boards/:id/comments", wrap((req) => addComment(mustGet(req.params.id as string), req.body ?? {})));
app.post("/api/shared/:token/comments", wrap((req) => {
  const b = repo.getByShareToken(req.params.token as string);
  if (!b) throw new Error("This share link is invalid or has been turned off.");
  return addComment(b, req.body ?? {});
}));
app.patch("/api/boards/:id/comments/:cid", wrap((req) => {
  const b = mustGet(req.params.id as string);
  const c = b.comments.find((x) => x.id === req.params.cid);
  if (!c) throw new Error("Comment not found");
  if (typeof req.body?.resolved === "boolean") c.resolved = req.body.resolved;
  repo.save(b);
  return c;
}));
app.delete("/api/boards/:id/comments/:cid", wrap((req) => {
  const b = mustGet(req.params.id as string);
  b.comments = b.comments.filter((x) => x.id !== req.params.cid);
  repo.save(b);
  return { ok: true };
}));

// Reports & alerts
app.put("/api/boards/:id/schedule", wrap((req) => {
  const b = mustGet(req.params.id as string);
  const s = req.body as Partial<ReportSchedule>;
  b.schedule = {
    enabled: !!s.enabled,
    frequency: s.frequency === "daily" ? "daily" : "weekly",
    hour: Math.min(23, Math.max(0, Number(s.hour ?? 9))),
    weekday: Math.min(6, Math.max(0, Number(s.weekday ?? 1))),
    channels: (s.channels ?? []).filter((c) => integrations.CONNECTORS[c]?.notify),
    syncFirst: !!s.syncFirst,
    lastSentAt: b.schedule?.lastSentAt,
  };
  repo.save(b);
  return b.schedule;
}));
app.get("/api/boards/:id/report", wrap((req) => buildReport(mustGet(req.params.id as string), APP_URL)));
app.post("/api/boards/:id/report/send", wrap((req) => sendReport(mustGet(req.params.id as string), APP_URL)));
app.post("/api/anomalies", wrap((req) => detectAnomalies(req.body.graph as Graph)));

// ── Integrations ──
app.get("/api/integrations", (_req, res) => res.json(integrations.listConnections()));
app.post("/api/integrations/:type/connect", wrap((req) => {
  integrations.connect(req.params.type as string, req.body ?? {});
  return { ok: true };
}));
app.post("/api/integrations/:type/disconnect", wrap((req) => {
  integrations.disconnect(req.params.type as string);
  return { ok: true };
}));
app.post("/api/integrations/:type/notify", wrap(async (req) => {
  await integrations.notify(req.params.type as string, String(req.body?.text ?? ""));
  return { ok: true };
}));
app.post("/api/integrations/sync", wrap((req) => integrations.syncMetrics(req.body.graph as Graph)));

// ── Privacy: data export & deletion (GDPR/CCPA access + erasure) ──
app.get("/api/privacy/export", (_req, res) => {
  res.setHeader("content-disposition", `attachment; filename="adcanvas-export-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({
    exportedAt: new Date().toISOString(),
    boards: repo.all(),
    integrations: integrations.listConnections().filter((c) => c.connected).map((c) => ({ type: c.type, account: c.account })),
    note: "Integration credentials are not included in exports for security.",
  });
});
app.delete("/api/privacy/data", wrap(() => {
  repo.deleteAll();
  integrations.disconnectAll();
  return { ok: true };
}));

// ── Production: serve the built client ──
const dist = path.resolve("dist");
if (process.env.NODE_ENV === "production" && fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

startScheduler(APP_URL);

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(`AdCanvas API on http://localhost:${port}  (AI: ${LIVE ? "live — Claude" : "demo mode, set ANTHROPIC_API_KEY for live AI"})`);
});
