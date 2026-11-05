// Real-time board collaboration over Server-Sent Events.
//
// Each open board holds an SSE stream. Edits arrive as element-level ops
// (POST /ops), are applied in a transaction, and are broadcast to every other
// viewer. With real Postgres, a NOTIFY fans events out to other app instances,
// whose clients resync — so horizontal scaling works without sticky sessions.

import crypto from "node:crypto";
import type { Request, Response } from "express";
import { db } from "./db";

interface Client {
  res: Response;
  clientId: string;
  name: string;
  editor: boolean;
}

const rooms = new Map<string, Set<Client>>();
const INSTANCE = crypto.randomBytes(6).toString("hex");
const CHANNEL = "adcanvas_board";

function send(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function presence(boardId: string) {
  const room = rooms.get(boardId);
  if (!room) return;
  const people = [...room].map((c) => ({ clientId: c.clientId, name: c.name, editor: c.editor }));
  for (const c of room) send(c.res, "presence", people.filter((p) => p.clientId !== c.clientId));
}

/** Opens an SSE stream for a board. */
export function subscribe(req: Request, res: Response, boardId: string, info: { clientId: string; name: string; editor: boolean; version: number }) {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  res.write(`retry: 3000\n\n`);
  const client: Client = { res, clientId: info.clientId.slice(0, 40), name: info.name.slice(0, 60) || "Guest", editor: info.editor };
  const room = rooms.get(boardId) ?? new Set();
  room.add(client);
  rooms.set(boardId, room);
  send(res, "hello", { version: info.version });
  presence(boardId);
  const ping = setInterval(() => res.write(`: ping\n\n`), 25_000);
  req.on("close", () => {
    clearInterval(ping);
    room.delete(client);
    if (!room.size) rooms.delete(boardId);
    else presence(boardId);
  });
}

/** Sends an event to everyone on the board except the originating client. */
export function broadcast(boardId: string, event: string, data: unknown, exceptClientId?: string) {
  for (const c of rooms.get(boardId) ?? []) if (c.clientId !== exceptClientId) send(c.res, event, data);
  db()
    .notify?.(CHANNEL, JSON.stringify({ boardId, event, origin: INSTANCE }))
    .catch((e) => console.error("[realtime notify]", e.message));
}

/** Closes all streams for a board (e.g. deleted or share link revoked). */
export function closeRoom(boardId: string, reason: string) {
  for (const c of rooms.get(boardId) ?? []) {
    send(c.res, "closed", { reason });
    c.res.end();
  }
  rooms.delete(boardId);
}

/** Cross-instance fan-out: other instances tell their clients to resync. */
export async function startRealtime() {
  await db().listen?.(CHANNEL, (payload) => {
    try {
      const m = JSON.parse(payload) as { boardId: string; event: string; origin: string };
      if (m.origin === INSTANCE) return;
      for (const c of rooms.get(m.boardId) ?? []) send(c.res, m.event === "comments" ? "comments-changed" : "resync", {});
    } catch {
      /* ignore malformed */
    }
  });
}
