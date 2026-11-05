// AI canvas editing: the assistant proposes semantic changes; this module turns
// them into collaboration ops (with ids and positions) the client can preview,
// apply and undo. Also includes a rule-based interpreter for demo mode.

import { CATALOG_BY_TYPE } from "./catalog";
import type { Graph, GraphNode, StageData } from "./model";
import type { Op } from "./ops";

export interface Change {
  action: "add" | "update" | "remove" | "connect" | "disconnect" | "rename_board";
  /** Temporary id for a node created in this batch, e.g. "new1". */
  ref: string | null;
  /** Existing node id (update/remove). */
  id: string | null;
  /** Catalog type for "add". */
  type: string | null;
  label: string | null;
  notes: string | null;
  budget: number | null;
  cpc: number | null;
  visitors: number | null;
  conversionRate: number | null;
  price: number | null;
  /** add: the step this comes after. connect/disconnect: source. */
  from: string | null;
  /** connect/disconnect: target. */
  to: string | null;
  weight: number | null;
  name: string | null;
}

export interface ChangeSet {
  summary: string;
  changes: Change[];
}

const NUMS = ["budget", "cpc", "visitors", "conversionRate", "price"] as const;
let seq = 0;
const uid = (p: string) => `${p}_ai${Date.now().toString(36)}${(seq++).toString(36)}`;

export const blankChange = (c: Partial<Change>): Change => ({
  action: "update", ref: null, id: null, type: null, label: null, notes: null,
  budget: null, cpc: null, visitors: null, conversionRate: null, price: null,
  from: null, to: null, weight: null, name: null, ...c,
});

/** Converts changes to ops. Invalid references are skipped and reported. */
export function changesToOps(graph: Graph, changes: Change[]): { ops: Op[]; warnings: string[]; described: string[] } {
  const ops: Op[] = [];
  const warnings: string[] = [];
  const described: string[] = [];
  const nodes = new Map(graph.nodes.map((n) => [n.id, structuredClone(n)]));
  const refs = new Map<string, string>();
  const resolve = (x: string | null) => (x ? refs.get(x) ?? (nodes.has(x) ? x : null) : null);
  const label = (id: string) => nodes.get(id)?.data.label ?? id;
  const maxX = Math.max(0, ...graph.nodes.map((n) => n.position?.x ?? 0));
  let looseY = 0;

  for (const c of changes) {
    switch (c.action) {
      case "add": {
        const item = c.type ? CATALOG_BY_TYPE[c.type] : null;
        if (!item || item.kind === "note") {
          warnings.push(`Unknown step type "${c.type}"`);
          break;
        }
        const after = resolve(c.from);
        const afterNode = after ? nodes.get(after) : null;
        const siblings = after ? [...graph.edges, ...ops.flatMap((o) => (o.t === "edge.put" ? [o.edge] : []))].filter((e) => e.source === after).length : 0;
        const position = afterNode?.position
          ? { x: afterNode.position.x + 320, y: afterNode.position.y + siblings * 150 }
          : { x: maxX + 320, y: (looseY += 160) };
        const data: StageData = { type: item.type, kind: item.kind, label: c.label || item.label, ...item.defaults };
        if (c.notes) data.notes = c.notes;
        for (const k of NUMS) if (c[k] != null) data[k] = c[k]!;
        if (item.kind === "integration") data.integration = { status: "not_connected" };
        const id = uid("n");
        if (c.ref) refs.set(c.ref, id);
        const node: GraphNode = { id, position, data };
        nodes.set(id, node);
        ops.push({ t: "node.put", node });
        if (after) ops.push({ t: "edge.put", edge: { id: uid("e"), source: after, target: id, data: {} } });
        described.push(`Add ${data.label}${after ? ` after ${label(after)}` : ""}`);
        break;
      }
      case "update": {
        const id = resolve(c.id);
        if (!id) {
          warnings.push(`Can't find step "${c.id}" to update`);
          break;
        }
        const n = nodes.get(id)!;
        const before = { ...n.data };
        if (c.label) n.data.label = c.label;
        if (c.notes) n.data.notes = c.notes;
        const parts: string[] = [];
        for (const k of NUMS)
          if (c[k] != null) {
            n.data[k] = c[k]!;
            parts.push(`${k === "conversionRate" ? "conversion" : k} ${fmt(k, before[k] as number | undefined)} → ${fmt(k, c[k]!)}`);
          }
        ops.push({ t: "node.put", node: n });
        described.push(`Update ${before.label}${c.label && c.label !== before.label ? ` (rename to ${c.label})` : ""}${parts.length ? `: ${parts.join(", ")}` : ""}`);
        break;
      }
      case "remove": {
        const id = resolve(c.id);
        if (!id) {
          warnings.push(`Can't find step "${c.id}" to remove`);
          break;
        }
        described.push(`Remove ${label(id)}`);
        nodes.delete(id);
        ops.push({ t: "node.del", id });
        break;
      }
      case "connect": {
        const from = resolve(c.from), to = resolve(c.to);
        if (!from || !to || from === to) {
          warnings.push(`Can't connect "${c.from}" → "${c.to}"`);
          break;
        }
        ops.push({ t: "edge.put", edge: { id: uid("e"), source: from, target: to, data: c.weight != null ? { weight: c.weight } : {} } });
        described.push(`Connect ${label(from)} → ${label(to)}`);
        break;
      }
      case "disconnect": {
        const from = resolve(c.from), to = resolve(c.to);
        const edges = graph.edges.filter((e) => e.source === from && e.target === to);
        if (!edges.length) {
          warnings.push(`No connection ${c.from} → ${c.to}`);
          break;
        }
        for (const e of edges) ops.push({ t: "edge.del", id: e.id });
        described.push(`Disconnect ${label(from!)} → ${label(to!)}`);
        break;
      }
      case "rename_board":
        if (c.name) {
          ops.push({ t: "meta", patch: { name: c.name } });
          described.push(`Rename board to “${c.name}”`);
        }
        break;
    }
  }
  return { ops, warnings, described };
}

function fmt(k: string, v: number | undefined) {
  if (v == null) return "—";
  if (k === "conversionRate") return `${v}%`;
  if (k === "visitors") return Math.round(v).toLocaleString("en-US");
  return `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

// ── Demo-mode interpreter (no API key) ─────────────────────────────

const ADDABLE: [RegExp, string, (g: Graph) => GraphNode | undefined][] = [
  [/retarget/, "retargeting", () => undefined],
  [/abandon(ed)? cart|cart recovery/, "abandoned_cart", (g) => byType(g, ["cart", "product_page", "checkout", "landing_page"])],
  [/upsell/, "upsell", (g) => byType(g, ["checkout"])],
  [/order bump/, "order_bump", (g) => byType(g, ["checkout"])],
  [/email|nurture/, "email_sequence", (g) => byType(g, ["optin_page", "lead_magnet", "landing_page", "webinar"])],
  [/sms|text message/, "sms", (g) => byType(g, ["optin_page", "checkout", "booking"])],
  [/tiktok/, "tiktok_ads", () => undefined],
  [/linkedin/, "linkedin_ads", () => undefined],
  [/google search|search ads/, "google_search", () => undefined],
  [/youtube/, "youtube_ads", () => undefined],
  [/thank ?you/, "thank_you", (g) => byType(g, ["checkout", "optin_page", "booking"])],
];

function byType(g: Graph, types: string[]) {
  for (const t of types) {
    const n = g.nodes.find((x) => x.data.type === t);
    if (n) return n;
  }
}

/** Understands a handful of common requests so demo mode can show the feature. */
export function interpretDemo(graph: Graph, text: string): ChangeSet | null {
  const t = text.toLowerCase();
  const pct = Number(t.match(/(\d+(?:\.\d+)?)\s*%/)?.[1] ?? NaN);
  const traffic = graph.nodes.filter((n) => n.data.kind === "traffic" && n.data.budget);

  if (/(cut|reduce|lower|decrease|trim).*(budget|spend)|(budget|spend).*(cut|reduce|lower|decrease)/.test(t) || /cheaper/.test(t)) {
    const f = 1 - (Number.isFinite(pct) ? pct : 20) / 100;
    return {
      summary: `Reduce every paid channel's budget by ${Math.round((1 - f) * 100)}%.`,
      changes: traffic.map((n) => blankChange({ action: "update", id: n.id, budget: Math.round((n.data.budget ?? 0) * f) })),
    };
  }
  if (/(increase|raise|scale|boost|double).*(budget|spend)/.test(t)) {
    const f = /double/.test(t) ? 2 : 1 + (Number.isFinite(pct) ? pct : 20) / 100;
    return {
      summary: `Increase every paid channel's budget by ${Math.round((f - 1) * 100)}%.`,
      changes: traffic.map((n) => blankChange({ action: "update", id: n.id, budget: Math.round((n.data.budget ?? 0) * f) })),
    };
  }
  if (/^(add|include|create|put)/.test(t.trim()) || /\badd\b/.test(t)) {
    for (const [re, type, anchor] of ADDABLE) {
      if (!re.test(t)) continue;
      const after = anchor(graph);
      const isTraffic = CATALOG_BY_TYPE[type]?.kind === "traffic";
      const entry = isTraffic ? graph.nodes.find((n) => n.data.kind === "page") : undefined;
      const changes = [blankChange({ action: "add", ref: "new1", type, from: after?.id ?? null })];
      if (isTraffic && entry) changes.push(blankChange({ action: "connect", from: "new1", to: entry.id }));
      return { summary: `Add ${CATALOG_BY_TYPE[type].label}${after ? ` after ${after.data.label}` : entry ? ` sending traffic to ${entry.data.label}` : ""}.`, changes };
    }
  }
  const rm = t.match(/(?:remove|delete|drop)\s+(?:the\s+)?(.+)/);
  if (rm) {
    const q = rm[1].replace(/[.!?]$/, "").trim();
    const n = graph.nodes.find((x) => x.data.label.toLowerCase().includes(q) || (CATALOG_BY_TYPE[x.data.type]?.label.toLowerCase() ?? "").includes(q));
    if (n) return { summary: `Remove ${n.data.label}.`, changes: [blankChange({ action: "remove", id: n.id })] };
  }
  return null;
}
