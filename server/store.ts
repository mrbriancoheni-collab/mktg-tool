// Board persistence, scoped to a workspace. Every query that takes a board id
// also filters by workspace_id so one workspace can never read another's data.

import type { Graph } from "../shared/model";
import { applyOps, type Op } from "../shared/ops";
import { newId, randomToken } from "./crypto";
import { db, ms } from "./db";

export interface Comment {
  id: string;
  nodeId: string | null;
  author: string;
  text: string;
  createdAt: number;
  resolved: boolean;
}

export interface ReportSchedule {
  enabled: boolean;
  frequency: "daily" | "weekly";
  hour: number;
  weekday: number;
  channels: string[];
  syncFirst: boolean;
  lastSentAt?: number;
}

export interface Board {
  id: string;
  workspaceId: string;
  name: string;
  goal: string;
  summary: string;
  graph: Graph;
  analysis: unknown;
  comments: Comment[];
  shareToken: string | null;
  schedule: ReportSchedule | null;
  version: number;
  createdAt: number;
  updatedAt: number;
}

type Row = Record<string, unknown>;

const toBoard = (r: Row, comments: Comment[] = []): Board => ({
  id: r.id as string,
  workspaceId: r.workspace_id as string,
  name: r.name as string,
  goal: r.goal as string,
  summary: r.summary as string,
  graph: r.graph as Graph,
  analysis: r.analysis ?? null,
  comments,
  shareToken: (r.share_token as string) ?? null,
  schedule: (r.schedule as ReportSchedule) ?? null,
  version: r.version as number,
  createdAt: ms(r.created_at as Date)!,
  updatedAt: ms(r.updated_at as Date)!,
});

const toComment = (r: Row): Comment => ({
  id: r.id as string,
  nodeId: (r.node_id as string) ?? null,
  author: r.author_name as string,
  text: r.text as string,
  resolved: r.resolved as boolean,
  createdAt: ms(r.created_at as Date)!,
});

export async function listBoards(ws: string) {
  const rows = await db().query(
    `SELECT id, name, created_at, updated_at, share_token IS NOT NULL AS shared, jsonb_array_length(graph->'nodes') AS node_count
     FROM boards WHERE workspace_id = $1 ORDER BY updated_at DESC`,
    [ws],
  );
  return rows.map((r) => ({ id: r.id as string, name: r.name as string, createdAt: ms(r.created_at as Date)!, updatedAt: ms(r.updated_at as Date)!, shared: r.shared as boolean, nodeCount: Number(r.node_count) }));
}

export async function countBoards(ws: string) {
  return Number((await db().query(`SELECT count(*)::int AS c FROM boards WHERE workspace_id = $1`, [ws]))[0].c);
}

async function comments(boardId: string) {
  return (await db().query(`SELECT * FROM comments WHERE board_id = $1 ORDER BY created_at`, [boardId])).map(toComment);
}

export async function getBoard(ws: string, id: string): Promise<Board | null> {
  const [r] = await db().query(`SELECT * FROM boards WHERE id = $1 AND workspace_id = $2`, [id, ws]);
  return r ? toBoard(r, await comments(id)) : null;
}

/** Unscoped lookup — only for the scheduler and internal jobs. */
export async function getBoardInternal(id: string): Promise<Board | null> {
  const [r] = await db().query(`SELECT * FROM boards WHERE id = $1`, [id]);
  return r ? toBoard(r, await comments(id)) : null;
}

export async function getByShareToken(token: string): Promise<Board | null> {
  if (!token || token.length < 16) return null;
  const [r] = await db().query(`SELECT * FROM boards WHERE share_token = $1`, [token]);
  return r ? toBoard(r, await comments(r.id as string)) : null;
}

export async function createBoard(ws: string, userId: string | null, p: Partial<Pick<Board, "name" | "goal" | "summary" | "graph" | "analysis">> = {}) {
  const id = newId();
  const name = p.name || "Untitled campaign";
  await db().query(
    `INSERT INTO boards (id, workspace_id, name, goal, summary, graph, analysis, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, ws, name, p.goal ?? "", p.summary ?? "", JSON.stringify(p.graph ?? { name, nodes: [], edges: [] }), p.analysis == null ? null : JSON.stringify(p.analysis), userId],
  );
  return (await getBoard(ws, id))!;
}

export async function deleteBoard(ws: string, id: string) {
  await db().query(`DELETE FROM boards WHERE id = $1 AND workspace_id = $2`, [id, ws]);
}

/** Applies collaborative edit ops atomically; returns the new version. */
export async function applyBoardOps(ws: string, id: string, ops: Op[]) {
  return db().tx(async (q) => {
    const [r] = await q(`SELECT name, goal, summary, analysis, graph, version FROM boards WHERE id = $1 AND workspace_id = $2 FOR UPDATE`, [id, ws]);
    if (!r) throw Object.assign(new Error("Board not found"), { status: 404 });
    const g = r.graph as Graph;
    const next = applyOps(
      { name: r.name as string, goal: r.goal as string, summary: r.summary as string, analysis: r.analysis ?? null, nodes: g.nodes, edges: g.edges },
      ops,
    );
    const version = (r.version as number) + 1;
    await q(
      `UPDATE boards SET name=$3, goal=$4, summary=$5, analysis=$6, graph=$7, version=$8, updated_at=now() WHERE id=$1 AND workspace_id=$2`,
      [id, ws, next.name, next.goal, next.summary, next.analysis == null ? null : JSON.stringify(next.analysis), JSON.stringify({ name: next.name, goal: next.goal, nodes: next.nodes, edges: next.edges }), version],
    );
    return version;
  });
}

/** Writes actuals onto nodes (used by scheduled syncs) without bumping user-visible content otherwise. */
export async function saveGraph(ws: string, id: string, graph: Graph) {
  await db().query(`UPDATE boards SET graph=$3, version=version+1, updated_at=now() WHERE id=$1 AND workspace_id=$2`, [id, ws, JSON.stringify(graph)]);
}

export async function setShare(ws: string, id: string, enabled: boolean) {
  const [r] = await db().query<{ share_token: string | null }>(
    `UPDATE boards SET share_token = CASE WHEN $3 THEN COALESCE(share_token, $4) ELSE NULL END WHERE id=$1 AND workspace_id=$2 RETURNING share_token`,
    [id, ws, enabled, randomToken(18)],
  );
  if (!r) throw Object.assign(new Error("Board not found"), { status: 404 });
  return r.share_token;
}

export async function setSchedule(ws: string, id: string, s: ReportSchedule | null) {
  await db().query(`UPDATE boards SET schedule=$3 WHERE id=$1 AND workspace_id=$2`, [id, ws, s ? JSON.stringify(s) : null]);
}

export async function scheduledBoards(): Promise<Board[]> {
  const rows = await db().query(`SELECT * FROM boards WHERE schedule IS NOT NULL AND (schedule->>'enabled')::boolean`);
  return Promise.all(rows.map(async (r) => toBoard(r, await comments(r.id as string))));
}

export async function addComment(boardId: string, c: { nodeId: string | null; author: string; userId: string | null; text: string }) {
  const id = newId(6);
  const [r] = await db().query(
    `INSERT INTO comments (id, board_id, node_id, author_name, author_user_id, text) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [id, boardId, c.nodeId, c.author, c.userId, c.text],
  );
  return toComment(r);
}

export async function updateComment(ws: string, boardId: string, cid: string, resolved: boolean) {
  const [r] = await db().query(
    `UPDATE comments c SET resolved=$4 FROM boards b WHERE c.id=$3 AND c.board_id=$2 AND b.id=c.board_id AND b.workspace_id=$1 RETURNING c.*`,
    [ws, boardId, cid, resolved],
  );
  if (!r) throw Object.assign(new Error("Comment not found"), { status: 404 });
  return toComment(r);
}

export async function deleteComment(ws: string, boardId: string, cid: string) {
  await db().query(`DELETE FROM comments c USING boards b WHERE c.id=$3 AND c.board_id=$2 AND b.id=c.board_id AND b.workspace_id=$1`, [ws, boardId, cid]);
}

export async function listComments(boardId: string) {
  return comments(boardId);
}

export async function exportWorkspace(ws: string) {
  const boards = await db().query(`SELECT id FROM boards WHERE workspace_id=$1`, [ws]);
  return Promise.all(boards.map((b) => getBoard(ws, b.id as string)));
}

export async function deleteWorkspaceContent(ws: string) {
  await db().query(`DELETE FROM boards WHERE workspace_id=$1`, [ws]);
  await db().query(`DELETE FROM connections WHERE workspace_id=$1`, [ws]);
}

/** Public view of a board for share links: no schedule or workspace details. */
export function publicBoard(b: Board) {
  const { schedule: _s, shareToken: _t, workspaceId: _w, ...rest } = b;
  return rest;
}
