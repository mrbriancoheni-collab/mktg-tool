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

export interface Credentials {
  [key: string]: string;
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
  oauth?: "google" | "meta";
  /** Canvas node types this account reports on. */
  reportsOn?: string[];
  live: boolean;
  fetchMetrics?(nodes: GraphNode[], ctx: ConnectionCtx): Promise<Record<string, Actuals>>;
  notify?(text: string, creds: Credentials): Promise<void>;
}

function sampleMetrics(nodes: GraphNode[]): Record<string, Actuals> {
  const out: Record<string, Actuals> = {};
  for (const n of nodes) {
    const budget = n.data.budget ?? 0;
    const cpc = n.data.cpc ?? 1;
    const spend = budget * 0.4 * (0.85 + Math.random() * 0.3);
    const clicks = spend / (cpc * (0.8 + Math.random() * 0.5));
    out[n.id] = {
      spend: Math.round(spend),
      impressions: Math.round(clicks / (0.008 + Math.random() * 0.012)),
      clicks: Math.round(clicks),
      conversions: Math.round(clicks * (0.02 + Math.random() * 0.05)),
    };
  }
  return out;
}

const sampleConnector = (type: string, reportsOn: string[]): Connector => ({
  type,
  live: false,
  reportsOn,
  fields: [
    { key: "account", label: "Ad account ID" },
    { key: "token", label: "Access token", secret: true },
  ],
  fetchMetrics: async (nodes) => sampleMetrics(nodes),
});

const hook = (type: string, label: string, placeholder: string, secret = false): Connector => ({
  type,
  live: true,
  fields: [{ key: "url", label, placeholder, secret }],
  notify: (text, c) => postJSON(c.url, type === "webhook" ? { text, source: "adcanvas" } : { text }),
});

const SPECIFIC: Record<string, Connector> = {
  ...PROVIDER_CONNECTORS,
  tiktok_ads_mgr: sampleConnector("tiktok_ads_mgr", ["tiktok_ads"]),
  linkedin_cm: sampleConnector("linkedin_cm", ["linkedin_ads"]),
  gtm: { type: "gtm", live: false, fields: [{ key: "container", label: "Container ID", placeholder: "GTM-XXXX" }] },
  salesforce: { type: "salesforce", live: false, fields: [{ key: "instance", label: "Instance URL" }, { key: "token", label: "Access token", secret: true }] },
  shopify: { type: "shopify", live: false, fields: [{ key: "shop", label: "Shop domain", placeholder: "mystore.myshopify.com" }, { key: "token", label: "Admin API token", secret: true }] },
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

/** Pulls actuals for every node covered by a connected integration. */
export async function syncMetrics(ws: string, graph: Graph) {
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
      const got = await c.fetchMetrics(nodes, ctx);
      for (const [id, a] of Object.entries(got)) actuals[id] = { ...actuals[id], ...a };
      sources.push(c.type);
      if (!c.live) sample = true;
    } catch (e) {
      errors.push(`${c.type}: ${(e as Error).message}`);
    }
  }
  return { actuals, sources, sample, errors };
}
