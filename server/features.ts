// Experiments, version history and notifications.
import express, { type NextFunction, type Request, type Response } from "express";
import { newId } from "./crypto";
import { db, ms } from "./db";
import { HttpError, requireAuth, requireRole } from "./auth";
import * as store from "./store";

export const featuresRouter = express.Router();
const wrap = (fn: (req: Request, res: Response) => unknown) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res))
    .then((out) => out !== undefined && !res.headersSent && res.json(out))
    .catch(next);

async function board(req: Request) {
  const b = await store.getBoard(req.auth!.workspace.id, String(req.params.id));
  if (!b) throw new HttpError(404, "Board not found");
  return b;
}

// ── Notifications ─────────────────────────────────────────────

export async function notifyUsers(userIds: string[], n: { workspaceId: string | null; kind: string; title: string; body?: string; link?: string }) {
  for (const u of [...new Set(userIds)])
    await db().query(`INSERT INTO notifications (user_id, workspace_id, kind, title, body, link) VALUES ($1,$2,$3,$4,$5,$6)`, [u, n.workspaceId, n.kind, n.title.slice(0, 200), n.body?.slice(0, 1000) ?? null, n.link ?? null]);
}

/** Finds workspace members @mentioned in text (by first name, full name without spaces, or email prefix). */
export async function mentionedMembers(workspaceId: string, text: string) {
  const handles = new Set([...text.matchAll(/@([\w.-]{2,40})/g)].map((m) => m[1].toLowerCase()));
  if (!handles.size) return [];
  const members = await db().query<{ id: string; name: string; email: string }>(
    `SELECT u.id, u.name, u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1`,
    [workspaceId],
  );
  return members.filter((m) => {
    const keys = [m.email.split("@")[0], m.name.split(" ")[0], m.name.replace(/\s+/g, "")].map((k) => k.toLowerCase()).filter(Boolean);
    return keys.some((k) => handles.has(k));
  });
}

export async function adminsOf(workspaceId: string) {
  return (await db().query<{ user_id: string }>(`SELECT user_id FROM memberships WHERE workspace_id=$1 AND role IN ('owner','admin')`, [workspaceId])).map((r) => r.user_id);
}

featuresRouter.get("/notifications", requireAuth, wrap(async (req) => {
  const rows = await db().query(
    `SELECT id, kind, title, body, link, read_at, created_at FROM notifications WHERE user_id=$1 AND (workspace_id IS NULL OR workspace_id=$2) ORDER BY created_at DESC LIMIT 50`,
    [req.auth!.user.id, req.auth!.workspace.id],
  );
  return {
    unread: rows.filter((r) => !r.read_at).length,
    items: rows.map((r) => ({ id: String(r.id), kind: r.kind, title: r.title, body: r.body, link: r.link, read: !!r.read_at, createdAt: ms(r.created_at as Date) })),
  };
}));
featuresRouter.post("/notifications/read", requireAuth, wrap(async (req) => {
  const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  if (ids.length) await db().query(`UPDATE notifications SET read_at=now() WHERE user_id=$1 AND id = ANY($2::bigint[])`, [req.auth!.user.id, ids]);
  else await db().query(`UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL`, [req.auth!.user.id]);
  return { ok: true };
}));

// ── Version history ───────────────────────────────────────────

export async function snapshot(boardId: string, label: string, userId: string | null) {
  const [b] = await db().query(`SELECT name, goal, summary, graph, analysis FROM boards WHERE id=$1`, [boardId]);
  if (!b) return;
  await db().query(`INSERT INTO board_versions (board_id, label, snapshot, created_by) VALUES ($1,$2,$3,$4)`, [boardId, label.slice(0, 120), JSON.stringify(b), userId]);
  // Keep the newest 100 versions per board.
  await db().query(`DELETE FROM board_versions WHERE board_id=$1 AND id NOT IN (SELECT id FROM board_versions WHERE board_id=$1 ORDER BY created_at DESC LIMIT 100)`, [boardId]);
}

/** Called after edits: takes an automatic snapshot at most every 30 minutes of activity. */
export async function autoSnapshot(boardId: string, userId: string | null) {
  const [last] = await db().query(`SELECT created_at FROM board_versions WHERE board_id=$1 ORDER BY created_at DESC LIMIT 1`, [boardId]);
  if (!last || Date.now() - ms(last.created_at as Date)! > 30 * 60e3) await snapshot(boardId, "Autosave", userId);
}

featuresRouter.get("/boards/:id/versions", requireAuth, wrap(async (req) => {
  const b = await board(req);
  const rows = await db().query(
    `SELECT v.id, v.label, v.created_at, u.name, u.email, jsonb_array_length(v.snapshot->'graph'->'nodes') AS nodes FROM board_versions v LEFT JOIN users u ON u.id=v.created_by WHERE v.board_id=$1 ORDER BY v.created_at DESC LIMIT 100`,
    [b.id],
  );
  return rows.map((r) => ({ id: String(r.id), label: r.label, createdAt: ms(r.created_at as Date), by: (r.name as string) || (r.email as string) || "System", nodes: Number(r.nodes) }));
}));
featuresRouter.post("/boards/:id/versions", requireRole("member"), wrap(async (req) => {
  const b = await board(req);
  await snapshot(b.id, String(req.body?.label ?? "").trim() || "Saved version", req.auth!.user.id);
  return { ok: true };
}));
featuresRouter.get("/boards/:id/versions/:vid", requireAuth, wrap(async (req) => {
  const b = await board(req);
  const [v] = await db().query(`SELECT snapshot FROM board_versions WHERE board_id=$1 AND id=$2`, [b.id, req.params.vid]);
  if (!v) throw new HttpError(404, "Version not found");
  return v.snapshot;
}));

// ── Experiments ───────────────────────────────────────────────

const EXP_STATUS = ["planned", "running", "won", "lost", "inconclusive"];
const toExp = (r: Record<string, unknown>) => ({
  id: r.id,
  nodeId: r.node_id,
  hypothesis: r.hypothesis,
  variants: r.variants,
  metric: r.metric,
  status: r.status,
  result: r.result,
  startedAt: ms(r.started_at as Date),
  endedAt: ms(r.ended_at as Date),
  createdAt: ms(r.created_at as Date),
});

featuresRouter.get("/boards/:id/experiments", requireAuth, wrap(async (req) => {
  const b = await board(req);
  return (await db().query(`SELECT * FROM experiments WHERE board_id=$1 ORDER BY created_at DESC`, [b.id])).map(toExp);
}));
featuresRouter.post("/boards/:id/experiments", requireRole("member"), wrap(async (req) => {
  const b = await board(req);
  const hyp = String(req.body?.hypothesis ?? "").trim().slice(0, 500);
  if (!hyp) throw new HttpError(400, "Describe the hypothesis.");
  const variants = (Array.isArray(req.body?.variants) && req.body.variants.length ? req.body.variants : [{ name: "Control" }, { name: "Variant B" }])
    .slice(0, 6)
    .map((v: { name?: string }) => ({ name: String(v.name ?? "Variant").slice(0, 60), visitors: 0, conversions: 0 }));
  const [r] = await db().query(
    `INSERT INTO experiments (id, board_id, node_id, hypothesis, variants, metric, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [newId(), b.id, req.body?.nodeId ?? null, hyp, JSON.stringify(variants), String(req.body?.metric ?? "conversion rate").slice(0, 60), req.auth!.user.id],
  );
  return toExp(r);
}));
featuresRouter.patch("/boards/:id/experiments/:eid", requireRole("member"), wrap(async (req) => {
  const b = await board(req);
  const [cur] = await db().query(`SELECT * FROM experiments WHERE id=$1 AND board_id=$2`, [req.params.eid, b.id]);
  if (!cur) throw new HttpError(404, "Experiment not found");
  const status = EXP_STATUS.includes(req.body?.status) ? req.body.status : cur.status;
  const variants = Array.isArray(req.body?.variants)
    ? req.body.variants.slice(0, 6).map((v: { name?: string; visitors?: number; conversions?: number }) => ({
        name: String(v.name ?? "Variant").slice(0, 60),
        visitors: Math.max(0, Number(v.visitors) || 0),
        conversions: Math.max(0, Number(v.conversions) || 0),
      }))
    : cur.variants;
  const [r] = await db().query(
    `UPDATE experiments SET status=$3, variants=$4, result=$5, hypothesis=$6,
       started_at = CASE WHEN $3='running' AND started_at IS NULL THEN now() ELSE started_at END,
       ended_at = CASE WHEN $3 IN ('won','lost','inconclusive') AND ended_at IS NULL THEN now() ELSE ended_at END
     WHERE id=$1 AND board_id=$2 RETURNING *`,
    [req.params.eid, b.id, status, JSON.stringify(variants), req.body?.result != null ? String(req.body.result).slice(0, 2000) : cur.result, req.body?.hypothesis ? String(req.body.hypothesis).slice(0, 500) : cur.hypothesis],
  );
  return toExp(r);
}));
featuresRouter.delete("/boards/:id/experiments/:eid", requireRole("member"), wrap(async (req) => {
  const b = await board(req);
  await db().query(`DELETE FROM experiments WHERE id=$1 AND board_id=$2`, [req.params.eid, b.id]);
  return { ok: true };
}));
