// Board storage. A small JSON-file repository behind an interface so it can be
// swapped for Postgres (or any DB) without touching the routes: implement
// `BoardRepo` and change `repo` below.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Graph } from "../shared/model";

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
  /** Hour of day (0-23, server time) to send. */
  hour: number;
  /** Day of week for weekly reports (0 = Sunday). */
  weekday: number;
  /** Integration types to deliver to (slack, webhook, zapier, make). */
  channels: string[];
  /** Pull fresh metrics from connected integrations before reporting. */
  syncFirst: boolean;
  lastSentAt?: number;
}

export interface Board {
  id: string;
  name: string;
  goal: string;
  summary: string;
  graph: Graph;
  analysis: unknown;
  comments: Comment[];
  shareToken: string | null;
  schedule: ReportSchedule | null;
  createdAt: number;
  updatedAt: number;
}

export type BoardSummary = Pick<Board, "id" | "name" | "createdAt" | "updatedAt"> & { nodeCount: number; shared: boolean };

export interface BoardRepo {
  list(): BoardSummary[];
  get(id: string): Board | null;
  getByShareToken(token: string): Board | null;
  save(board: Board): void;
  delete(id: string): void;
  deleteAll(): void;
  all(): Board[];
}

const DIR = path.resolve("data", "boards");
const SAFE_ID = /^[A-Za-z0-9_-]{6,64}$/;

class JsonFileRepo implements BoardRepo {
  constructor() {
    fs.mkdirSync(DIR, { recursive: true });
  }
  private file(id: string) {
    if (!SAFE_ID.test(id)) throw new Error("Invalid board id");
    return path.join(DIR, `${id}.json`);
  }
  all(): Board[] {
    return fs
      .readdirSync(DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as Board;
        } catch {
          return null;
        }
      })
      .filter((b): b is Board => !!b);
  }
  list() {
    return this.all()
      .map((b) => ({ id: b.id, name: b.name, createdAt: b.createdAt, updatedAt: b.updatedAt, nodeCount: b.graph.nodes.length, shared: !!b.shareToken }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }
  get(id: string) {
    try {
      return JSON.parse(fs.readFileSync(this.file(id), "utf8")) as Board;
    } catch {
      return null;
    }
  }
  getByShareToken(token: string) {
    return this.all().find((b) => b.shareToken && b.shareToken === token) ?? null;
  }
  save(board: Board) {
    const tmp = this.file(board.id) + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(board));
    fs.renameSync(tmp, this.file(board.id)); // atomic replace
  }
  delete(id: string) {
    fs.rmSync(this.file(id), { force: true });
  }
  deleteAll() {
    for (const f of fs.readdirSync(DIR)) if (f.endsWith(".json")) fs.rmSync(path.join(DIR, f), { force: true });
  }
}

export const repo: BoardRepo = new JsonFileRepo();

export const newId = (bytes = 9) => crypto.randomBytes(bytes).toString("base64url");

export function createBoard(partial: Partial<Board> = {}): Board {
  const now = Date.now();
  const board: Board = {
    id: newId(),
    name: "Untitled campaign",
    goal: "",
    summary: "",
    graph: { name: "Untitled campaign", nodes: [], edges: [] },
    analysis: null,
    comments: [],
    shareToken: null,
    schedule: null,
    ...partial,
    createdAt: now,
    updatedAt: now,
  };
  repo.save(board);
  return board;
}

/** Public view of a board for share links: no schedule/integration config. */
export function publicBoard(b: Board) {
  const { schedule: _s, shareToken: _t, ...rest } = b;
  return rest;
}

// ── Presence (in memory): who has a board open right now ──
const presence = new Map<string, Map<string, { name: string; seen: number }>>();
export function heartbeat(boardId: string, clientId: string, name: string) {
  const m = presence.get(boardId) ?? new Map();
  m.set(clientId, { name: name || "Guest", seen: Date.now() });
  presence.set(boardId, m);
  for (const [k, v] of m) if (Date.now() - v.seen > 30_000) m.delete(k);
  return [...m.entries()].filter(([k]) => k !== clientId).map(([, v]) => v.name);
}
