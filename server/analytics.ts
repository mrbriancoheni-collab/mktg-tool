// Product analytics: first-party event log (no third-party trackers), plus an
// activation funnel for the internal admin view. Optional forwarding to
// PostHog when POSTHOG_API_KEY is set.

import type { Request } from "express";
import { db } from "./db";

const ALLOWED = /^[a-z][a-z0-9_]{1,40}$/;

export async function recordEvents(req: Request, events: { event: string; props?: Record<string, unknown>; at?: number }[]) {
  const a = req.auth;
  const clean = events
    .filter((e) => ALLOWED.test(String(e.event)))
    .slice(0, 50)
    .map((e) => ({ event: e.event, props: JSON.stringify(e.props ?? {}).slice(0, 2000), at: new Date(Math.min(Date.now(), Number(e.at) || Date.now())) }));
  for (const e of clean)
    await db().query(`INSERT INTO events (workspace_id, user_id, event, props, created_at) VALUES ($1,$2,$3,$4,$5)`, [a?.workspace.id ?? null, a?.user.id ?? null, e.event, e.props, e.at]);
  forward(a?.user.id ?? "anonymous", clean);
}

/** Server-side events (signups etc.). */
export function serverEvent(event: string, userId: string | null, workspaceId: string | null, props: object = {}) {
  db()
    .query(`INSERT INTO events (workspace_id, user_id, event, props) VALUES ($1,$2,$3,$4)`, [workspaceId, userId, event, JSON.stringify(props)])
    .catch(() => {});
  forward(userId ?? "anonymous", [{ event, props: JSON.stringify(props), at: new Date() }]);
}

function forward(distinctId: string, events: { event: string; props: string; at: Date }[]) {
  const key = process.env.POSTHOG_API_KEY;
  if (!key || !events.length) return;
  fetch(`${process.env.POSTHOG_HOST ?? "https://us.i.posthog.com"}/batch/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ api_key: key, batch: events.map((e) => ({ event: e.event, distinct_id: distinctId, properties: JSON.parse(e.props), timestamp: e.at.toISOString() })) }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}

/** Activation funnel: of users who signed up in the window, how many reached each step. */
export async function activationFunnel(days = 30) {
  const steps = ["signup", "board_built", "node_edited", "asset_generated", "data_connected", "analysis_run", "shared"];
  const rows = await db().query<{ event: string; users: number }>(
    `WITH cohort AS (SELECT DISTINCT user_id FROM events WHERE event='signup' AND created_at > now() - ($1 || ' days')::interval)
     SELECT e.event, count(DISTINCT e.user_id)::int AS users FROM events e JOIN cohort c USING (user_id) WHERE e.event = ANY($2) GROUP BY e.event`,
    [String(days), steps],
  );
  const by = new Map(rows.map((r) => [r.event, Number(r.users)]));
  const top = by.get("signup") ?? 0;
  const [wau] = await db().query(`SELECT count(DISTINCT user_id)::int AS n FROM events WHERE created_at > now() - interval '7 days'`);
  return { days, weeklyActiveUsers: Number(wau.n), steps: steps.map((s) => ({ step: s, users: by.get(s) ?? 0, rate: top ? (by.get(s) ?? 0) / top : 0 })) };
}
