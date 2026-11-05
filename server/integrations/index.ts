// Integration registry.
//
// Each connector declares the credentials it needs and implements whichever
// capabilities apply: `fetchMetrics` (pull actuals onto canvas nodes) and/or
// `notify` (push a message out). Slack and Webhook are fully working.
// Ad-platform connectors currently return labelled SAMPLE data so the
// analytics loop can be exercised end-to-end; replace `fetchMetrics` with a
// real API client (OAuth app + reporting API) to go live.

import fs from "node:fs";
import path from "node:path";
import { CATALOG } from "../../shared/catalog";
import type { Actuals, Graph, GraphNode } from "../../shared/model";

export interface Credentials {
  [key: string]: string;
}

export interface Connector {
  type: string;
  fields: { key: string; label: string; secret?: boolean; placeholder?: string }[];
  /** For traffic connectors: which canvas node types this account reports on. */
  reportsOn?: string[];
  live: boolean;
  fetchMetrics?(nodes: GraphNode[], creds: Credentials): Promise<Record<string, Actuals>>;
  notify?(text: string, creds: Credentials): Promise<void>;
}

function sampleMetrics(nodes: GraphNode[]): Record<string, Actuals> {
  const out: Record<string, Actuals> = {};
  for (const n of nodes) {
    const budget = n.data.budget ?? 0;
    const cpc = n.data.cpc ?? 1;
    // Pretend we're ~40% through the month with realistic noise.
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

const adConnector = (type: string, reportsOn: string[]): Connector => ({
  type,
  live: false,
  reportsOn,
  fields: [
    { key: "account", label: "Ad account ID", placeholder: "act_123456789" },
    { key: "token", label: "Access token", secret: true },
  ],
  async fetchMetrics(nodes) {
    return sampleMetrics(nodes);
  },
});

const postJSON = async (url: string, body: unknown) => {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Request failed: ${res.status} ${await res.text().catch(() => "")}`);
};

const SPECIFIC: Record<string, Connector> = {
  google_ads_mgr: adConnector("google_ads_mgr", ["google_search", "google_pmax", "google_shopping", "google_display", "youtube_ads"]),
  meta_ads_mgr: adConnector("meta_ads_mgr", ["meta_ads", "instagram_ads", "retargeting"]),
  tiktok_ads_mgr: adConnector("tiktok_ads_mgr", ["tiktok_ads"]),
  linkedin_cm: adConnector("linkedin_cm", ["linkedin_ads"]),
  ga4: adConnector("ga4", ["microsoft_ads", "organic", "social_organic", "direct", "email_list", "referral", "affiliate"]),
  gtm: { type: "gtm", live: false, fields: [{ key: "container", label: "Container ID", placeholder: "GTM-XXXX" }] },
  salesforce: { type: "salesforce", live: false, fields: [{ key: "instance", label: "Instance URL" }, { key: "token", label: "Access token", secret: true }] },
  shopify: { type: "shopify", live: false, fields: [{ key: "shop", label: "Shop domain", placeholder: "mystore.myshopify.com" }, { key: "token", label: "Admin API token", secret: true }] },
  zapier: {
    type: "zapier",
    live: true,
    fields: [{ key: "url", label: "Catch hook URL", placeholder: "https://hooks.zapier.com/..." }],
    notify: (text, c) => postJSON(c.url, { text }),
  },
  make: {
    type: "make",
    live: true,
    fields: [{ key: "url", label: "Webhook URL", placeholder: "https://hook.make.com/..." }],
    notify: (text, c) => postJSON(c.url, { text }),
  },
  slack: {
    type: "slack",
    live: true,
    fields: [{ key: "url", label: "Incoming webhook URL", secret: true, placeholder: "https://hooks.slack.com/services/..." }],
    notify: (text, c) => postJSON(c.url, { text }),
  },
  webhook: {
    type: "webhook",
    live: true,
    fields: [{ key: "url", label: "Endpoint URL", placeholder: "https://example.com/hook" }],
    notify: (text, c) => postJSON(c.url, { text, source: "adcanvas" }),
  },
};

/** Every integration in the catalog gets a connector; unspecified ones take an API key. */
export const CONNECTORS: Record<string, Connector> = Object.fromEntries(
  CATALOG.filter((c) => c.kind === "integration").map((c) => [
    c.type,
    SPECIFIC[c.type] ?? { type: c.type, live: false, fields: [{ key: "token", label: "API key / access token", secret: true }] },
  ]),
);

// ── Connection storage (local JSON file; swap for a DB + secrets manager in production) ──

const DATA_DIR = path.resolve("data");
const FILE = path.join(DATA_DIR, "connections.json");

type Store = Record<string, Credentials>;
function load(): Store {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
}
function save(s: Store) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(s, null, 2), { mode: 0o600 });
}

export function listConnections() {
  const store = load();
  return Object.values(CONNECTORS).map((c) => ({
    type: c.type,
    live: c.live,
    fields: c.fields,
    canNotify: !!c.notify,
    canSync: !!c.fetchMetrics,
    connected: !!store[c.type],
    account: store[c.type]?.account ?? store[c.type]?.shop ?? null,
  }));
}

export function connect(type: string, creds: Credentials) {
  const c = CONNECTORS[type];
  if (!c) throw new Error(`Unknown integration: ${type}`);
  for (const f of c.fields) if (!creds[f.key]) throw new Error(`Missing ${f.label}`);
  const store = load();
  store[type] = creds;
  save(store);
}

export function disconnect(type: string) {
  const store = load();
  delete store[type];
  save(store);
}

export async function notify(type: string, text: string) {
  const c = CONNECTORS[type];
  const creds = load()[type];
  if (!c?.notify) throw new Error(`${type} can't send messages`);
  if (!creds) throw new Error(`${type} isn't connected`);
  await c.notify(text, creds);
}

/** Pulls actuals for every traffic node covered by a connected integration. */
export async function syncMetrics(graph: Graph) {
  const store = load();
  const actuals: Record<string, Actuals> = {};
  const sources: string[] = [];
  let sample = false;
  for (const c of Object.values(CONNECTORS)) {
    if (!c.fetchMetrics || !c.reportsOn || !store[c.type]) continue;
    const nodes = graph.nodes.filter((n) => c.reportsOn!.includes(n.data.type));
    if (!nodes.length) continue;
    Object.assign(actuals, await c.fetchMetrics(nodes, store[c.type]));
    sources.push(c.type);
    if (!c.live) sample = true;
  }
  return { actuals, sources, sample };
}

export function disconnectAll() {
  save({});
}
