// Integration registry and per-workspace connection storage.
//
// Connectors declare their credentials and capabilities:
//  - `notify`: push a message (Slack, Zapier, Make, Webhook) — live.
//  - `fetchMetrics`: pull actuals onto canvas nodes. OAuth providers (Google
//    Ads, GA4, Meta) call the real reporting APIs (see ./providers); other ad
//    connectors return clearly-labelled SAMPLE data until implemented.
// Credentials are stored encrypted (AES-256-GCM) in the `connections` table.

import { CATALOG } from "../../shared/catalog";
import type { Actuals, Graph, GraphNode } from "../../shared/model";
import { decrypt, encrypt } from "../crypto";
import { db } from "../db";
import { postJSON } from "../net";
import { PROVIDER_CONNECTORS } from "./providers";
import { PROVIDER_CONNECTORS_2 } from "./providers2";

export interface Credentials {
  [key: string]: string;
}

export interface DailyRow extends Actuals {
  nodeId: string;
  day: string;
}

export interface ConnectionCtx {
  workspaceId: string;
  creds: Credentials;
  account: string | null;
  meta: Record<string, unknown>;
  /** Persist refreshed tokens. */
  saveCreds(creds: Credentials): Promise<void>;
}

export interface Connector {
  type: string;
  fields: { key: string; label: string; secret?: boolean; placeholder?: string }[];
  /** Connect via OAuth instead of pasted credentials. */
  oauth?: "google" | "meta" | "linkedin" | "tiktok";
  /** Canvas node types this account reports on. */
  reportsOn?: string[];
  live: boolean;
  fetchMetrics?(nodes: GraphNode[], ctx: ConnectionCtx): Promise<Record<string, Actuals>>;
  /** Day-by-day metrics for [from, to] (YYYY-MM-DD), used for history and the dashboard. */
  fetchDaily?(nodes: GraphNode[], ctx: ConnectionCtx, from: string, to: string): Promise<DailyRow[]>;
  notify?(text: string, creds: Credentials): Promise<void>;
}

/** Deterministic pseudo-random sample history so previews look stable between syncs. */
export function sampleDaily(nodes: GraphNode[], from: string, to: string): DailyRow[] {
  const rows: DailyRow[] = [];
  for (const n of nodes) {
    const daily = (n.data.budget ?? 0) / 30;
    const cpc = n.data.cpc ?? 1;
    let seed = [...n.id].reduce((a, c) => a + c.charCodeAt(0), 0);
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let d = new Date(from + "T00:00:00Z"); d <= new Date(to + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
      const weekend = [0, 6].includes(d.getUTCDay()) ? 0.8 : 1.05;
      const spend = daily * weekend * (0.8 + rnd() * 0.4);
      const clicks = spend / (cpc * (0.85 + rnd() * 0.35));
      rows.push({ nodeId: n.id, day: d.toISOString().slice(0, 10), spend: Math.round(spend * 100) / 100, clicks: Math.round(clicks), impressions: Math.round(clicks / (0.01 + rnd() * 0.01)), conversions: Math.round(clicks * (0.02 + rnd() * 0.04)) });
    }
  }
  return rows;
}

const hook = (type: string, label: string, placeholder: string, secret = false): Connector => ({
  type,
  live: true,
  fields: [{ key: "url", label, placeholder, secret }],
  notify: (text, c) => postJSON(c.url, type === "webhook" ? { text, source: "adcanvas" } : { text }),
});

const SPECIFIC: Record<string, Connector> = {
  ...PROVIDER_CONNECTORS,
  ...PROVIDER_CONNECTORS_2,
  gtm: { type: "gtm", live: false, fields: [{ key: "container", label: "Container ID", placeholder: "GTM-XXXX" }] },
  zapier: hook("zapier", "Catch hook URL", "https://hooks.zapier.com/..."),
  make: hook("make", "Webhook URL", "https://hook.make.com/..."),
  slack: hook("slack", "Incoming webhook URL", "https://hooks.slack.com/services/...", true),
  webhook: hook("webhook", "Endpoint URL", "https://example.com/hook"),
};

export const CONNECTORS: Record<string, Connector> = Object.fromEntries(
  CATALOG.filter((c) => c.kind === "integration").map((c) => [
    c.type,
    SPECIFIC[c.type] ?? { type: c.type, live: false, fields: [{ key: "token", label: "API key / access token", secret: true }] },
  ]),
);

// ── Storage ──

interface Row {
  type: string;
  credentials_enc: string;
  account: string | null;
  meta: Record<string, unknown> | null;
}

async function rows(ws: string) {
  return db().query<Row>(`SELECT type, credentials_enc, account, meta FROM connections WHERE workspace_id=$1`, [ws]);
}

export async function getConnection(ws: string, type: string): Promise<ConnectionCtx | null> {
  const [r] = await db().query<Row>(`SELECT type, credentials_enc, account, meta FROM connections WHERE workspace_id=$1 AND type=$2`, [ws, type]);
  if (!r) return null;
  return {
    workspaceId: ws,
    creds: decrypt<Credentials>(r.credentials_enc),
    account: r.account,
    meta: r.meta ?? {},
    saveCreds: async (creds) => {
      await db().query(`UPDATE connections SET credentials_enc=$3 WHERE workspace_id=$1 AND type=$2`, [ws, type, encrypt(creds)]);
    },
  };
}

export async function saveConnection(ws: string, type: string, creds: Credentials, account: string | null, meta: Record<string, unknown> = {}) {
  await db().query(
    `INSERT INTO connections (workspace_id, type, credentials_enc, account, meta) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (workspace_id, type) DO UPDATE SET credentials_enc=EXCLUDED.credentials_enc, account=EXCLUDED.account, meta=EXCLUDED.meta`,
    [ws, type, encrypt(creds), account, JSON.stringify(meta)],
  );
}

export async function setConnectionAccount(ws: string, type: string, account: string, meta?: Record<string, unknown>) {
  await db().query(`UPDATE connections SET account=$3, meta=COALESCE($4, meta) WHERE workspace_id=$1 AND type=$2`, [ws, type, account, meta ? JSON.stringify(meta) : null]);
}

export async function listConnections(ws: string) {
  const connected = new Map((await rows(ws)).map((r) => [r.type, r]));
  return Object.values(CONNECTORS).map((c) => ({
    type: c.type,
    live: c.live,
    oauth: c.oauth ?? null,
    fields: c.oauth ? [] : c.fields,
    canNotify: !!c.notify,
    canSync: !!c.fetchMetrics,
    connected: connected.has(c.type),
    account: connected.get(c.type)?.account ?? null,
    needsAccount: !!c.oauth && connected.has(c.type) && !connected.get(c.type)?.account,
  }));
}

export async function connect(ws: string, type: string, creds: Credentials) {
  const c = CONNECTORS[type];
  if (!c) throw new Error(`Unknown integration: ${type}`);
  if (c.oauth) throw new Error(`${type} connects with OAuth — use the Connect button.`);
  const clean: Credentials = {};
  for (const f of c.fields) {
    const v = String(creds[f.key] ?? "").trim();
    if (!v) throw new Error(`Missing ${f.label}`);
    clean[f.key] = v.slice(0, 2000);
  }
  if (c.notify && clean.url) {
    const { assertPublicUrl } = await import("../net");
    await assertPublicUrl(clean.url);
  }
  await saveConnection(ws, type, clean, clean.account ?? clean.shop ?? null);
}

export async function disconnect(ws: string, type: string) {
  await db().query(`DELETE FROM connections WHERE workspace_id=$1 AND type=$2`, [ws, type]);
}

export async function disconnectAll(ws: string) {
  await db().query(`DELETE FROM connections WHERE workspace_id=$1`, [ws]);
}

export async function notify(ws: string, type: string, text: string) {
  const c = CONNECTORS[type];
  const conn = await getConnection(ws, type);
  if (!c?.notify) throw new Error(`${type} can't send messages`);
  if (!conn) throw new Error(`${type} isn't connected`);
  await c.notify(text.slice(0, 35000), conn.creds);
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

async function storeDaily(ws: string, boardId: string, source: string, rows: DailyRow[]) {
  for (const r of rows)
    await db().query(
      `INSERT INTO metrics_daily (workspace_id, board_id, node_id, day, source, spend, impressions, clicks, conversions, revenue)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (board_id, node_id, day, source) DO UPDATE SET spend=EXCLUDED.spend, impressions=EXCLUDED.impressions, clicks=EXCLUDED.clicks, conversions=EXCLUDED.conversions, revenue=EXCLUDED.revenue`,
      [ws, boardId, r.nodeId, r.day, source, r.spend ?? null, r.impressions ?? null, r.clicks ?? null, r.conversions ?? null, r.revenue ?? null],
    );
}

/** Imports dated rows (e.g. from a CSV with a date column). */
export async function importDaily(ws: string, boardId: string, rows: DailyRow[], source = "csv") {
  await storeDaily(ws, boardId, source, rows.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.day)).slice(0, 20000));
}

/** Month-to-date totals per node from rows. */
function monthToDate(rows: DailyRow[]) {
  const month = iso(new Date()).slice(0, 7);
  const out: Record<string, Actuals> = {};
  for (const r of rows) {
    if (!r.day.startsWith(month)) continue;
    const a = (out[r.nodeId] ??= {});
    for (const k of ["spend", "impressions", "clicks", "conversions", "revenue"] as const) if (r[k] != null) a[k] = Math.round(((a[k] ?? 0) + r[k]!) * 100) / 100;
  }
  return out;
}

/**
 * Pulls actuals for every node covered by a connected integration. With a
 * boardId, connectors that support it also store 90 days of daily history.
 */
export async function syncMetrics(ws: string, graph: Graph, boardId?: string) {
  const actuals: Record<string, Actuals> = {};
  const sources: string[] = [];
  const errors: string[] = [];
  let sample = false;
  const connected = new Set((await rows(ws)).map((r) => r.type));
  for (const c of Object.values(CONNECTORS)) {
    if (!c.fetchMetrics || !c.reportsOn || !connected.has(c.type)) continue;
    const nodes = graph.nodes.filter((n) => c.reportsOn!.includes(n.data.type));
    if (!nodes.length) continue;
    const ctx = (await getConnection(ws, c.type))!;
    try {
      let got: Record<string, Actuals>;
      if (boardId && c.fetchDaily) {
        const to = new Date();
        const from = new Date(Date.now() - 89 * 86400e3);
        const rows = await c.fetchDaily(nodes, ctx, iso(from), iso(to));
        await storeDaily(ws, boardId, c.type, rows);
        got = monthToDate(rows);
      } else got = await c.fetchMetrics(nodes, ctx);
      for (const [id, a] of Object.entries(got)) actuals[id] = { ...actuals[id], ...a };
      sources.push(c.type);
      if (!c.live) sample = true;
    } catch (e) {
      errors.push(`${c.type}: ${(e as Error).message}`);
    }
  }
  return { actuals, sources, sample, errors };
}
