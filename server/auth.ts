// Authentication, sessions, workspaces, memberships, invites and audit log.
//
// Sessions: random 256-bit token in an HttpOnly, SameSite=Lax cookie; only its
// SHA-256 hash is stored. Passwords: scrypt. Mutating requests must come from
// our own origin (CSRF defense on top of SameSite).

import express, { type NextFunction, type Request, type Response } from "express";
import { PLANS, roleAtLeast, type PlanId, type Role } from "../shared/plans";
import { decrypt, encrypt, hashPassword, newId, randomToken, sha256, sign, verifyPassword, verifySigned } from "./crypto";
import { generateSecret, otpauthUrl, recoveryCodes, verifyTotp } from "./totp";
import { db, ms, type Db } from "./db";
import { sendEmail } from "./email";
import { serverEvent } from "./analytics";

export const TERMS_VERSION = "2026-11-05";
const COOKIE = "adc_session";
const SESSION_DAYS = 30;

export interface Branding {
  name?: string;
  color?: string;
  logo?: string;
  hidePoweredBy?: boolean;
}

export interface AuthCtx {
  sessionId: string;
  user: { id: string; email: string; name: string };
  workspace: { id: string; name: string; plan: PlanId; subscriptionStatus: string | null; branding: Branding | null };
  role: Role;
}

declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthCtx;
    /** Signed in with a password but the second factor hasn't been entered yet. */
    mfaPending?: { sessionId: string; userId: string };
  }
}

export const billingEnabled = () => !!process.env.STRIPE_SECRET_KEY && process.env.BILLING_ENABLED !== "false";
export const effectivePlan = (plan: PlanId) => (billingEnabled() ? PLANS[plan] ?? PLANS.free : PLANS.unlimited);

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const appUrl = (req: Request) => process.env.APP_URL ?? `${req.protocol}://${req.get("host")}`;
const secureCookies = () => process.env.NODE_ENV === "production" || (process.env.APP_URL ?? "").startsWith("https://");

function parseCookies(header?: string) {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setSessionCookie(res: Response, token: string | null) {
  const attrs = [`${COOKIE}=${token ?? ""}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${token ? SESSION_DAYS * 86400 : 0}`];
  if (secureCookies()) attrs.push("Secure");
  res.append("Set-Cookie", attrs.join("; "));
}

export async function audit(req: Request | null, action: string, target?: string, meta?: object, ws?: string) {
  await db()
    .query(`INSERT INTO audit_log (workspace_id, user_id, action, target, meta, ip) VALUES ($1,$2,$3,$4,$5,$6)`, [
      ws ?? req?.auth?.workspace.id ?? null,
      req?.auth?.user.id ?? null,
      action,
      target ?? null,
      meta ? JSON.stringify(meta) : null,
      req?.ip ?? null,
    ])
    .catch((e) => console.error("[audit]", e.message));
}

// ── Middleware ──

/** Attaches req.auth when a valid session cookie is present. */
export async function sessionMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return next();
  try {
    const [row] = await db().query(
      `SELECT s.id AS sid, s.expires_at, s.workspace_id, s.mfa_pending, u.id AS uid, u.email, u.name
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $1`,
      [sha256(token)],
    );
    if (!row || new Date(row.expires_at as string) < new Date()) {
      setSessionCookie(res, null);
      return next();
    }
    if (row.mfa_pending) {
      req.mfaPending = { sessionId: row.sid as string, userId: row.uid as string };
      return next();
    }
    // Resolve the current workspace (fall back to the user's first membership).
    let [m] = await db().query(
      `SELECT w.id, w.name, w.plan, w.subscription_status, w.branding, m.role FROM memberships m JOIN workspaces w ON w.id = m.workspace_id
       WHERE m.user_id = $1 AND m.workspace_id = $2`,
      [row.uid, row.workspace_id],
    );
    if (!m) {
      [m] = await db().query(
        `SELECT w.id, w.name, w.plan, w.subscription_status, w.branding, m.role FROM memberships m JOIN workspaces w ON w.id = m.workspace_id
         WHERE m.user_id = $1 ORDER BY m.created_at LIMIT 1`,
        [row.uid],
      );
      if (m) await db().query(`UPDATE sessions SET workspace_id=$2 WHERE id=$1`, [row.sid, m.id]);
    }
    if (!m) return next();
    req.auth = {
      sessionId: row.sid as string,
      user: { id: row.uid as string, email: row.email as string, name: row.name as string },
      workspace: { id: m.id as string, name: m.name as string, plan: m.plan as PlanId, subscriptionStatus: (m.subscription_status as string) ?? null, branding: (m.branding as Branding) ?? null },
      role: m.role as Role,
    };
    // Sliding expiry: extend sessions that are more than halfway through.
    if (ms(row.expires_at as Date)! - Date.now() < (SESSION_DAYS / 2) * 86400e3) {
      await db().query(`UPDATE sessions SET expires_at = now() + interval '${SESSION_DAYS} days' WHERE id=$1`, [row.sid]);
      setSessionCookie(res, token);
    }
  } catch (e) {
    return next(e);
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(new HttpError(401, "Please sign in."));
  next();
}

export const requireRole = (min: Role) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.auth) return next(new HttpError(401, "Please sign in."));
  if (!roleAtLeast(req.auth.role, min)) return next(new HttpError(403, `This needs ${min} access or higher.`));
  next();
};

/** CSRF defense: state-changing requests must come from our own origin. */
export function originCheck(req: Request, _res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  if (!origin) return next(); // non-browser clients; SameSite=Lax still protects cookies
  const allowed = new Set([`${req.protocol}://${req.get("host")}`]);
  if (process.env.APP_URL) allowed.add(new URL(process.env.APP_URL).origin);
  if (process.env.NODE_ENV !== "production") allowed.add("http://localhost:5173");
  if (!allowed.has(origin)) return next(new HttpError(403, "Cross-origin request blocked."));
  next();
}

/**
 * Fixed-window rate limiter. With Postgres, counts are shared by every app
 * instance; with the embedded database they're kept in memory.
 */
export function rateLimit(name: string, limit: number, windowMs: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  const tooMany = () => new HttpError(429, "Too many attempts. Please wait a minute and try again.");
  return (req: Request, _res: Response, next: NextFunction) => {
    const key = `${name}:${req.ip}`;
    if (db().kind === "postgres") {
      db()
        .query<{ count: number }>(
          `INSERT INTO rate_limits (key, count, reset_at) VALUES ($1, 1, now() + ($2 || ' milliseconds')::interval)
           ON CONFLICT (key) DO UPDATE SET
             count = CASE WHEN rate_limits.reset_at < now() THEN 1 ELSE rate_limits.count + 1 END,
             reset_at = CASE WHEN rate_limits.reset_at < now() THEN EXCLUDED.reset_at ELSE rate_limits.reset_at END
           RETURNING count`,
          [key, String(windowMs)],
        )
        .then(([r]) => next(Number(r.count) > limit ? tooMany() : undefined))
        .catch(next);
      return;
    }
    const now = Date.now();
    const h = hits.get(key);
    if (!h || h.reset < now) hits.set(key, { n: 1, reset: now + windowMs });
    else if (++h.n > limit) return next(tooMany());
    if (hits.size > 10000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    next();
  };
}

// ── Helpers ──

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanEmail = (e: unknown) => String(e ?? "").trim().toLowerCase();
function checkPassword(p: unknown) {
  const s = String(p ?? "");
  if (s.length < 10) throw new HttpError(400, "Use a password of at least 10 characters.");
  if (s.length > 200) throw new HttpError(400, "Password is too long.");
  return s;
}

async function createSession(req: Request, res: Response, userId: string, workspaceId: string | null) {
  const [u] = await db().query(`SELECT mfa_enabled FROM users WHERE id=$1`, [userId]);
  const mfaPending = !!u?.mfa_enabled;
  const token = randomToken();
  await db().query(
    `INSERT INTO sessions (id, user_id, workspace_id, expires_at, user_agent, ip, mfa_pending) VALUES ($1,$2,$3, now() + interval '${mfaPending ? "1 hour" : `${SESSION_DAYS} days`}', $4, $5, $6)`,
    [sha256(token), userId, workspaceId, (req.get("user-agent") ?? "").slice(0, 300), req.ip ?? null, mfaPending],
  );
  setSessionCookie(res, token);
  return { mfaRequired: mfaPending };
}

async function createWorkspace(q: Db["query"], name: string, ownerId: string) {
  const id = newId();
  await q(`INSERT INTO workspaces (id, name, plan) VALUES ($1,$2,'free')`, [id, name.slice(0, 80) || "My workspace"]);
  await q(`INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1,$2,'owner')`, [id, ownerId]);
  return id;
}

async function memberCount(ws: string) {
  const [r] = await db().query(`SELECT (SELECT count(*) FROM memberships WHERE workspace_id=$1) + (SELECT count(*) FROM invites WHERE workspace_id=$1 AND accepted_at IS NULL AND expires_at > now()) AS n`, [ws]);
  return Number(r.n);
}

async function findInvite(token: string) {
  const [inv] = await db().query(
    `SELECT i.*, w.name AS workspace_name, u.name AS inviter FROM invites i JOIN workspaces w ON w.id = i.workspace_id LEFT JOIN users u ON u.id = i.invited_by
     WHERE i.token_hash = $1 AND i.accepted_at IS NULL AND i.expires_at > now()`,
    [sha256(token)],
  );
  return inv;
}

async function acceptInvite(token: string, userId: string, email: string) {
  const inv = await findInvite(token);
  if (!inv) throw new HttpError(400, "This invite is invalid or has expired.");
  if ((inv.email as string).toLowerCase() !== email.toLowerCase()) throw new HttpError(403, `This invite was sent to ${inv.email}. Sign in with that email to accept it.`);
  await db().tx(async (q) => {
    await q(`INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT (workspace_id, user_id) DO NOTHING`, [inv.workspace_id, userId, inv.role]);
    await q(`UPDATE invites SET accepted_at = now() WHERE token_hash=$1`, [sha256(token)]);
  });
  return inv.workspace_id as string;
}

// ── Routes ──

export const authRouter = express.Router();
const wrap = (fn: (req: Request, res: Response) => unknown) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res))
    .then((out) => out !== undefined && !res.headersSent && res.json(out))
    .catch(next);

const authLimiter = rateLimit("auth", Number(process.env.AUTH_RATE_LIMIT ?? 10), 60_000);

authRouter.post("/auth/signup", authLimiter, wrap(async (req, res) => {
  const { name, workspaceName, acceptTerms, invite } = req.body ?? {};
  const email = cleanEmail(req.body?.email);
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "Enter a valid email address.");
  const password = checkPassword(req.body?.password);
  if (acceptTerms !== true) throw new HttpError(400, "Please accept the Terms of Service and Privacy Policy.");
  const [exists] = await db().query(`SELECT 1 FROM users WHERE email=$1`, [email]);
  if (exists) throw new HttpError(409, "An account with this email already exists. Try signing in.");
  const userId = newId();
  const hash = await hashPassword(password);
  let ws: string;
  await db().query(`INSERT INTO users (id, email, name, password_hash, terms_version, terms_accepted_at) VALUES ($1,$2,$3,$4,$5, now())`, [
    userId,
    email,
    String(name ?? "").trim().slice(0, 80),
    hash,
    TERMS_VERSION,
  ]);
  if (invite) ws = await acceptInvite(String(invite), userId, email);
  else ws = await db().tx((q) => createWorkspace(q, String(workspaceName ?? "").trim() || `${String(name ?? "").trim() || email.split("@")[0]}'s workspace`, userId));
  await createSession(req, res, userId, ws);
  await audit(req, "user.signup", userId, { termsVersion: TERMS_VERSION }, ws);
  serverEvent("signup", userId, ws, { invited: !!invite });
  return { ok: true };
}));

authRouter.post("/auth/login", authLimiter, wrap(async (req, res) => {
  const email = cleanEmail(req.body?.email);
  const [u] = await db().query(`SELECT id, password_hash FROM users WHERE email=$1`, [email]);
  // Always run a hash comparison so response time doesn't reveal whether the email exists.
  const ok = await verifyPassword(String(req.body?.password ?? ""), (u?.password_hash as string) ?? "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  if (!u || !ok) {
    await audit(req, "user.login_failed", email);
    throw new HttpError(401, "Email or password is incorrect.");
  }
  const { mfaRequired } = await createSession(req, res, u.id as string, null);
  await audit(req, mfaRequired ? "user.login_password_ok_mfa_pending" : "user.login", u.id as string);
  if (req.body?.invite) await acceptInvite(String(req.body.invite), u.id as string, email).catch(() => {});
  return { ok: true, mfaRequired };
}));

authRouter.post("/auth/logout", wrap(async (req, res) => {
  if (req.auth) await db().query(`DELETE FROM sessions WHERE id=$1`, [req.auth.sessionId]);
  setSessionCookie(res, null);
  return { ok: true };
}));

authRouter.get("/auth/me", requireAuth, wrap(async (req) => {
  const a = req.auth!;
  const workspaces = await db().query(
    `SELECT w.id, w.name, m.role FROM memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.user_id=$1 ORDER BY w.name`,
    [a.user.id],
  );
  const plan = effectivePlan(a.workspace.plan);
  const [usage] = await db().query(
    `SELECT (SELECT count(*) FROM ai_usage WHERE workspace_id=$1 AND created_at >= date_trunc('month', now())) AS ai,
            (SELECT count(*) FROM boards WHERE workspace_id=$1) AS boards,
            (SELECT count(*) FROM memberships WHERE workspace_id=$1) AS members`,
    [a.workspace.id],
  );
  const lim = (n: number) => (Number.isFinite(n) ? n : null);
  const [mf] = await db().query(`SELECT mfa_enabled, password_hash IS NOT NULL AS has_password, google_sub IS NOT NULL AS google FROM users WHERE id=$1`, [a.user.id]);
  return {
    user: { ...a.user, mfaEnabled: !!mf?.mfa_enabled, hasPassword: !!mf?.has_password, googleLinked: !!mf?.google },
    workspace: { ...a.workspace, plan: plan.id },
    role: a.role,
    workspaces,
    billingEnabled: billingEnabled(),
    usage: {
      ai: Number(usage.ai),
      aiLimit: lim(plan.aiPerMonth),
      boards: Number(usage.boards),
      boardLimit: lim(plan.boards),
      members: Number(usage.members),
      memberLimit: lim(plan.members),
    },
    features: { scheduledReports: plan.scheduledReports, liveConnectors: plan.liveConnectors },
  };
}));

authRouter.post("/auth/switch", requireAuth, wrap(async (req) => {
  const [m] = await db().query(`SELECT 1 FROM memberships WHERE user_id=$1 AND workspace_id=$2`, [req.auth!.user.id, req.body?.workspaceId]);
  if (!m) throw new HttpError(403, "You're not a member of that workspace.");
  await db().query(`UPDATE sessions SET workspace_id=$2 WHERE id=$1`, [req.auth!.sessionId, req.body.workspaceId]);
  return { ok: true };
}));

authRouter.post("/auth/forgot", authLimiter, wrap(async (req) => {
  const email = cleanEmail(req.body?.email);
  const [u] = await db().query(`SELECT id FROM users WHERE email=$1`, [email]);
  if (u) {
    const token = randomToken();
    await db().query(`INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1,$2, now() + interval '1 hour')`, [sha256(token), u.id]);
    await sendEmail(email, "Reset your AdCanvas password", `Reset your password (link valid for 1 hour):\n\n${appUrl(req)}/reset?token=${token}\n\nIf you didn't ask for this, you can ignore this email.`);
    await audit(req, "user.password_reset_requested", u.id as string);
  }
  return { ok: true }; // same response either way (no account enumeration)
}));

authRouter.post("/auth/reset", authLimiter, wrap(async (req, res) => {
  const password = checkPassword(req.body?.password);
  const [r] = await db().query(`SELECT user_id FROM password_resets WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now()`, [sha256(String(req.body?.token ?? ""))]);
  if (!r) throw new HttpError(400, "This reset link is invalid or has expired.");
  await db().query(`UPDATE users SET password_hash=$2 WHERE id=$1`, [r.user_id, await hashPassword(password)]);
  await db().query(`UPDATE password_resets SET used_at=now() WHERE token_hash=$1`, [sha256(String(req.body.token))]);
  await db().query(`DELETE FROM sessions WHERE user_id=$1`, [r.user_id]); // sign out everywhere
  await createSession(req, res, r.user_id as string, null);
  await audit(req, "user.password_reset", r.user_id as string);
  return { ok: true };
}));

authRouter.patch("/account", requireAuth, wrap(async (req) => {
  const a = req.auth!;
  if (typeof req.body?.name === "string") await db().query(`UPDATE users SET name=$2 WHERE id=$1`, [a.user.id, req.body.name.trim().slice(0, 80)]);
  if (req.body?.newPassword) {
    const [u] = await db().query(`SELECT password_hash FROM users WHERE id=$1`, [a.user.id]);
    if (!(await verifyPassword(String(req.body.currentPassword ?? ""), u.password_hash as string))) throw new HttpError(400, "Current password is incorrect.");
    await db().query(`UPDATE users SET password_hash=$2 WHERE id=$1`, [a.user.id, await hashPassword(checkPassword(req.body.newPassword))]);
    await db().query(`DELETE FROM sessions WHERE user_id=$1 AND id<>$2`, [a.user.id, a.sessionId]);
    await audit(req, "user.password_changed", a.user.id);
  }
  return { ok: true };
}));

/** Deletes the account. Workspaces where the user is the only owner are deleted too. */
authRouter.delete("/account", requireAuth, wrap(async (req, res) => {
  const a = req.auth!;
  const [u] = await db().query(`SELECT password_hash FROM users WHERE id=$1`, [a.user.id]);
  const ok = u.password_hash ? await verifyPassword(String(req.body?.password ?? ""), u.password_hash as string) : String(req.body?.password ?? "").toLowerCase() === a.user.email;
  if (!ok) throw new HttpError(400, u.password_hash ? "Password is incorrect." : "Type your email address to confirm.");
  const solo = await db().query(
    `SELECT m.workspace_id FROM memberships m WHERE m.user_id=$1 AND m.role='owner'
     AND NOT EXISTS (SELECT 1 FROM memberships o WHERE o.workspace_id=m.workspace_id AND o.role='owner' AND o.user_id<>$1)`,
    [a.user.id],
  );
  await db().tx(async (q) => {
    for (const w of solo) await q(`DELETE FROM workspaces WHERE id=$1`, [w.workspace_id]);
    await q(`DELETE FROM users WHERE id=$1`, [a.user.id]);
  });
  await audit(null, "user.deleted", a.user.id, { deletedWorkspaces: solo.length });
  setSessionCookie(res, null);
  return { ok: true };
}));

// Workspaces
authRouter.post("/workspaces", requireAuth, wrap(async (req) => {
  const id = await db().tx((q) => createWorkspace(q, String(req.body?.name ?? "").trim() || "New workspace", req.auth!.user.id));
  await db().query(`UPDATE sessions SET workspace_id=$2 WHERE id=$1`, [req.auth!.sessionId, id]);
  await audit(req, "workspace.created", id, undefined, id);
  return { id };
}));

authRouter.patch("/workspace", requireRole("admin"), wrap(async (req) => {
  await db().query(`UPDATE workspaces SET name=$2 WHERE id=$1`, [req.auth!.workspace.id, String(req.body?.name ?? "").trim().slice(0, 80) || req.auth!.workspace.name]);
  return { ok: true };
}));

/** White-label branding for share links, reports and exports. */
authRouter.put("/workspace/branding", requireRole("admin"), wrap(async (req) => {
  const b = req.body ?? {};
  const color = /^#[0-9a-f]{6}$/i.test(String(b.color ?? "")) ? String(b.color) : undefined;
  const logo = typeof b.logo === "string" && /^data:image\/(png|jpeg|svg\+xml|webp);base64,/.test(b.logo) && b.logo.length < 300_000 ? b.logo : undefined;
  if (b.logo && !logo) throw new HttpError(400, "Logo must be a PNG, JPG, SVG or WebP under 200 KB.");
  const canHide = effectivePlan(req.auth!.workspace.plan).id !== "free";
  const branding: Branding = { name: String(b.name ?? "").trim().slice(0, 60) || undefined, color, logo, hidePoweredBy: canHide && !!b.hidePoweredBy };
  await db().query(`UPDATE workspaces SET branding=$2 WHERE id=$1`, [req.auth!.workspace.id, JSON.stringify(branding)]);
  await audit(req, "workspace.branding_updated");
  return branding;
}));

authRouter.delete("/workspace", requireRole("owner"), wrap(async (req) => {
  if (req.body?.confirm !== req.auth!.workspace.name) throw new HttpError(400, "Type the workspace name to confirm.");
  await audit(req, "workspace.deleted", req.auth!.workspace.id);
  await db().query(`DELETE FROM workspaces WHERE id=$1`, [req.auth!.workspace.id]);
  return { ok: true };
}));

authRouter.get("/workspace/members", requireAuth, wrap(async (req) => {
  const members = await db().query(
    `SELECT u.id, u.name, u.email, m.role, m.created_at FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1 ORDER BY m.created_at`,
    [req.auth!.workspace.id],
  );
  const invites = roleAtLeast(req.auth!.role, "admin")
    ? await db().query(`SELECT token_hash AS id, email, role, expires_at FROM invites WHERE workspace_id=$1 AND accepted_at IS NULL AND expires_at > now() ORDER BY created_at`, [req.auth!.workspace.id])
    : [];
  return { members, invites };
}));

authRouter.patch("/workspace/members/:userId", requireRole("admin"), wrap(async (req) => {
  const role = String(req.body?.role) as Role;
  if (!["viewer", "member", "admin", "owner"].includes(role)) throw new HttpError(400, "Invalid role");
  if (role === "owner" && req.auth!.role !== "owner") throw new HttpError(403, "Only owners can make someone an owner.");
  const ws = req.auth!.workspace.id;
  const [target] = await db().query(`SELECT role FROM memberships WHERE workspace_id=$1 AND user_id=$2`, [ws, req.params.userId]);
  if (!target) throw new HttpError(404, "Member not found");
  if (target.role === "owner" && req.auth!.role !== "owner") throw new HttpError(403, "Only owners can change an owner's role.");
  if (target.role === "owner" && role !== "owner") {
    const [o] = await db().query(`SELECT count(*)::int AS n FROM memberships WHERE workspace_id=$1 AND role='owner'`, [ws]);
    if (Number(o.n) <= 1) throw new HttpError(400, "A workspace needs at least one owner.");
  }
  await db().query(`UPDATE memberships SET role=$3 WHERE workspace_id=$1 AND user_id=$2`, [ws, req.params.userId, role]);
  await audit(req, "member.role_changed", req.params.userId as string, { role });
  return { ok: true };
}));

authRouter.delete("/workspace/members/:userId", requireAuth, wrap(async (req) => {
  const a = req.auth!;
  const self = req.params.userId === a.user.id;
  if (!self && !roleAtLeast(a.role, "admin")) throw new HttpError(403, "Only admins can remove members.");
  const [target] = await db().query(`SELECT role FROM memberships WHERE workspace_id=$1 AND user_id=$2`, [a.workspace.id, req.params.userId]);
  if (!target) throw new HttpError(404, "Member not found");
  if (target.role === "owner") {
    if (!self && a.role !== "owner") throw new HttpError(403, "Only owners can remove an owner.");
    const [o] = await db().query(`SELECT count(*)::int AS n FROM memberships WHERE workspace_id=$1 AND role='owner'`, [a.workspace.id]);
    if (Number(o.n) <= 1) throw new HttpError(400, "Transfer ownership before leaving — a workspace needs an owner.");
  }
  await db().query(`DELETE FROM memberships WHERE workspace_id=$1 AND user_id=$2`, [a.workspace.id, req.params.userId]);
  await db().query(`DELETE FROM sessions WHERE user_id=$1 AND workspace_id=$2`, [req.params.userId, a.workspace.id]);
  await audit(req, self ? "member.left" : "member.removed", req.params.userId as string);
  return { ok: true };
}));

authRouter.post("/workspace/invites", requireRole("admin"), rateLimit("invite", 30, 3600_000), wrap(async (req) => {
  const a = req.auth!;
  const email = cleanEmail(req.body?.email);
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "Enter a valid email address.");
  const role = String(req.body?.role ?? "member") as Role;
  if (!["viewer", "member", "admin"].includes(role)) throw new HttpError(400, "Invite as viewer, member or admin.");
  const plan = effectivePlan(a.workspace.plan);
  if ((await memberCount(a.workspace.id)) >= plan.members) throw new HttpError(402, `Your ${plan.name} plan allows ${plan.members} members. Upgrade to invite more.`);
  const token = randomToken();
  await db().query(`INSERT INTO invites (token_hash, workspace_id, email, role, invited_by, expires_at) VALUES ($1,$2,$3,$4,$5, now() + interval '7 days')`, [
    sha256(token),
    a.workspace.id,
    email,
    role,
    a.user.id,
  ]);
  const url = `${appUrl(req)}/invite/${token}`;
  const emailed = await sendEmail(email, `${a.user.name || a.user.email} invited you to ${a.workspace.name} on AdCanvas`, `You've been invited to join "${a.workspace.name}" as ${role}.\n\nAccept the invite (valid for 7 days):\n${url}`);
  await audit(req, "member.invited", email, { role });
  return { url, emailed };
}));

authRouter.delete("/workspace/invites/:id", requireRole("admin"), wrap(async (req) => {
  await db().query(`DELETE FROM invites WHERE token_hash=$1 AND workspace_id=$2`, [req.params.id, req.auth!.workspace.id]);
  return { ok: true };
}));

authRouter.get("/invites/:token", wrap(async (req) => {
  const inv = await findInvite(String(req.params.token));
  if (!inv) throw new HttpError(404, "This invite is invalid or has expired.");
  return { workspace: inv.workspace_name, inviter: inv.inviter, email: inv.email, role: inv.role };
}));

authRouter.post("/invites/:token/accept", requireAuth, wrap(async (req) => {
  const ws = await acceptInvite(String(req.params.token), req.auth!.user.id, req.auth!.user.email);
  await db().query(`UPDATE sessions SET workspace_id=$2 WHERE id=$1`, [req.auth!.sessionId, ws]);
  await audit(req, "member.joined", req.auth!.user.id, undefined, ws);
  const admins = (await db().query<{ user_id: string }>(`SELECT user_id FROM memberships WHERE workspace_id=$1 AND role IN ('owner','admin') AND user_id<>$2`, [ws, req.auth!.user.id])).map((r) => r.user_id);
  for (const u of admins)
    await db().query(`INSERT INTO notifications (user_id, workspace_id, kind, title) VALUES ($1,$2,'member_joined',$3)`, [u, ws, `${req.auth!.user.name || req.auth!.user.email} joined the workspace`]);
  return { ok: true };
}));

authRouter.get("/workspace/audit", requireRole("admin"), wrap(async (req) => {
  const rows = await db().query(
    `SELECT a.action, a.target, a.meta, a.ip, a.created_at, u.email FROM audit_log a LEFT JOIN users u ON u.id=a.user_id
     WHERE a.workspace_id=$1 ORDER BY a.created_at DESC LIMIT 200`,
    [req.auth!.workspace.id],
  );
  return rows;
}));

// ── Two-factor authentication (TOTP) ──

authRouter.post("/auth/mfa", authLimiter, wrap(async (req) => {
  const p = req.mfaPending;
  if (!p) throw new HttpError(400, "No sign-in is waiting for a code.");
  const [u] = await db().query(`SELECT mfa_secret_enc, mfa_recovery FROM users WHERE id=$1`, [p.userId]);
  const code = String(req.body?.code ?? "").trim();
  let ok = !!u?.mfa_secret_enc && verifyTotp(decrypt<string>(u.mfa_secret_enc as string), code);
  if (!ok && code) {
    // Recovery codes are single-use.
    const hashes = (u?.mfa_recovery as string[] | null) ?? [];
    const h = sha256(code.toLowerCase());
    if (hashes.includes(h)) {
      ok = true;
      await db().query(`UPDATE users SET mfa_recovery=$2 WHERE id=$1`, [p.userId, JSON.stringify(hashes.filter((x) => x !== h))]);
      await audit(null, "user.mfa_recovery_code_used", p.userId);
    }
  }
  if (!ok) {
    await audit(null, "user.mfa_failed", p.userId);
    throw new HttpError(401, "That code isn't valid. Check your authenticator app and try again.");
  }
  await db().query(`UPDATE sessions SET mfa_pending=false, expires_at = now() + interval '${SESSION_DAYS} days' WHERE id=$1`, [p.sessionId]);
  await audit(null, "user.login", p.userId);
  return { ok: true };
}));

authRouter.post("/account/mfa/setup", requireAuth, wrap(async (req) => {
  const secret = generateSecret();
  await db().query(`UPDATE users SET mfa_secret_enc=$2 WHERE id=$1 AND NOT mfa_enabled`, [req.auth!.user.id, encrypt(secret)]);
  return { secret, otpauth: otpauthUrl(secret, req.auth!.user.email) };
}));

authRouter.post("/account/mfa/enable", requireAuth, wrap(async (req) => {
  const [u] = await db().query(`SELECT mfa_secret_enc, mfa_enabled FROM users WHERE id=$1`, [req.auth!.user.id]);
  if (u.mfa_enabled) throw new HttpError(400, "Two-factor authentication is already on.");
  if (!u.mfa_secret_enc || !verifyTotp(decrypt<string>(u.mfa_secret_enc as string), String(req.body?.code ?? ""))) throw new HttpError(400, "That code doesn't match. Make sure your phone's time is correct and try again.");
  const codes = recoveryCodes();
  await db().query(`UPDATE users SET mfa_enabled=true, mfa_recovery=$2 WHERE id=$1`, [req.auth!.user.id, JSON.stringify(codes.map((c) => sha256(c)))]);
  await audit(req, "user.mfa_enabled", req.auth!.user.id);
  return { recoveryCodes: codes };
}));

authRouter.post("/account/mfa/disable", requireAuth, wrap(async (req) => {
  const [u] = await db().query(`SELECT password_hash, mfa_secret_enc FROM users WHERE id=$1`, [req.auth!.user.id]);
  const pwOk = u.password_hash ? await verifyPassword(String(req.body?.password ?? ""), u.password_hash as string) : false;
  const codeOk = !!u.mfa_secret_enc && verifyTotp(decrypt<string>(u.mfa_secret_enc as string), String(req.body?.code ?? ""));
  if (!pwOk && !codeOk) throw new HttpError(400, "Enter your password or a current authenticator code.");
  await db().query(`UPDATE users SET mfa_enabled=false, mfa_secret_enc=NULL, mfa_recovery=NULL WHERE id=$1`, [req.auth!.user.id]);
  await audit(req, "user.mfa_disabled", req.auth!.user.id);
  return { ok: true };
}));

// ── Sign in with Google (OpenID Connect) ──
// Uses GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET. Register the redirect URI
// {APP_URL}/api/auth/google/callback on the OAuth client.

export const googleLoginEnabled = () => !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_LOGIN !== "false";

authRouter.get("/auth/google", wrap(async (req, res) => {
  if (!googleLoginEnabled()) throw new HttpError(400, "Google sign-in isn't configured.");
  const state = sign({ n: randomToken(8), invite: req.query.invite ? String(req.query.invite) : undefined }, 600);
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${appUrl(req)}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}));

authRouter.get("/auth/google/callback", wrap(async (req, res) => {
  const fail = (m: string) => res.redirect(`/login?error=${encodeURIComponent(m)}`);
  const st = verifySigned<{ invite?: string }>(String(req.query.state ?? ""));
  if (!st || !req.query.code) return fail("Google sign-in expired — please try again.");
  const tok = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code: String(req.query.code), client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: `${appUrl(req)}/api/auth/google/callback`, grant_type: "authorization_code" }),
    signal: AbortSignal.timeout(15000),
  }).then((r) => r.json() as Promise<{ access_token?: string }>);
  if (!tok.access_token) return fail("Google sign-in failed.");
  const info = (await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${tok.access_token}` }, signal: AbortSignal.timeout(15000) }).then((r) => r.json())) as { sub?: string; email?: string; email_verified?: boolean; name?: string };
  if (!info.sub || !info.email || !info.email_verified) return fail("Your Google account email isn't verified.");
  const email = info.email.toLowerCase();
  let [u] = await db().query(`SELECT id FROM users WHERE google_sub=$1`, [info.sub]);
  if (!u) {
    [u] = await db().query(`SELECT id FROM users WHERE email=$1`, [email]);
    if (u) await db().query(`UPDATE users SET google_sub=$2 WHERE id=$1`, [u.id, info.sub]);
  }
  let ws: string | null = null;
  if (!u) {
    // New account via Google: the sign-in button states that continuing accepts the Terms and Privacy Policy.
    const id = newId();
    await db().query(`INSERT INTO users (id, email, name, google_sub, terms_version, terms_accepted_at) VALUES ($1,$2,$3,$4,$5, now())`, [id, email, (info.name ?? "").slice(0, 80), info.sub, TERMS_VERSION]);
    ws = st.invite ? await acceptInvite(st.invite, id, email).catch(() => null) : null;
    if (!ws) ws = await db().tx((q) => createWorkspace(q, `${info.name || email.split("@")[0]}'s workspace`, id));
    serverEvent("signup", id, ws, { via: "google" });
    await audit(req, "user.signup", id, { via: "google", termsVersion: TERMS_VERSION }, ws);
    u = { id };
  } else if (st.invite) ws = await acceptInvite(st.invite, u.id as string, email).catch(() => null);
  await createSession(req, res, u.id as string, ws);
  res.redirect("/");
}));
