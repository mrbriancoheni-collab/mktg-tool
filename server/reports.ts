// Scheduled performance reports + plan-vs-actual anomaly detection.

import { CATALOG_BY_TYPE } from "../shared/catalog";
import type { Graph } from "../shared/model";
import { simulate } from "../shared/simulate";
import * as integrations from "./integrations";
import { getBoardInternal, saveGraph, scheduledBoards, setSchedule, type Board } from "./store";

export interface Alert {
  nodeId: string;
  severity: "critical" | "warning" | "info";
  message: string;
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Compares imported/synced actuals against the plan on each node. */
export function detectAnomalies(graph: Graph, now = new Date()): Alert[] {
  const alerts: Alert[] = [];
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthElapsed = now.getDate() / daysInMonth;

  for (const n of graph.nodes) {
    const d = n.data;
    const a = d.actuals;
    if (!a) continue;
    const name = d.label;

    if (d.kind === "traffic") {
      if (a.spend != null && d.budget) {
        const expected = d.budget * monthElapsed;
        const pace = a.spend / Math.max(expected, 1);
        if (pace > 1.15) alerts.push({ nodeId: n.id, severity: pace > 1.4 ? "critical" : "warning", message: `${name} is overspending: ${money(a.spend)} vs ${money(expected)} expected by today (${Math.round(pace * 100)}% of pace).` });
        else if (pace < 0.7) alerts.push({ nodeId: n.id, severity: "warning", message: `${name} is underdelivering: ${money(a.spend)} vs ${money(expected)} expected — check bids, budgets or disapprovals.` });
      }
      if (a.spend && a.clicks && d.cpc) {
        const cpc = a.spend / a.clicks;
        if (cpc > d.cpc * 1.25) alerts.push({ nodeId: n.id, severity: cpc > d.cpc * 1.6 ? "critical" : "warning", message: `${name} CPC is $${cpc.toFixed(2)} vs $${d.cpc} planned (+${Math.round((cpc / d.cpc - 1) * 100)}%).` });
      }
      if (a.clicks && a.impressions) {
        const ctr = (a.clicks / a.impressions) * 100;
        if (ctr < 0.5) alerts.push({ nodeId: n.id, severity: "info", message: `${name} CTR is ${ctr.toFixed(2)}% — creative may be fatigued.` });
      }
    }

    const planned = d.conversionRate ?? CATALOG_BY_TYPE[d.type]?.defaults?.conversionRate;
    if (d.kind !== "traffic" && planned && a.clicks && a.conversions != null && a.clicks >= 50) {
      const cr = (a.conversions / a.clicks) * 100;
      if (cr < planned * 0.75) alerts.push({ nodeId: n.id, severity: cr < planned * 0.5 ? "critical" : "warning", message: `${name} converts at ${cr.toFixed(1)}% vs ${planned}% planned.` });
    }
  }
  const rank = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((x, y) => rank[x.severity] - rank[y.severity]);
}

export function buildReport(board: Board, appUrl?: string) {
  const g = board.graph;
  const t = simulate(g).totals;
  const actual = g.nodes.reduce(
    (s, n) => ({
      spend: s.spend + (n.data.actuals?.spend ?? 0),
      revenue: s.revenue + (n.data.actuals?.revenue ?? 0),
      conversions: s.conversions + (n.data.kind === "traffic" ? n.data.actuals?.conversions ?? 0 : 0),
    }),
    { spend: 0, revenue: 0, conversions: 0 },
  );
  const alerts = detectAnomalies(g);
  const icon = { critical: "🔴", warning: "🟠", info: "🔵" };
  const lines = [
    `*AdCanvas report — ${board.name}*`,
    `Plan (monthly): spend ${money(t.spend)} → revenue ${money(t.revenue)} · ROAS ${t.roas.toFixed(2)}x · CPA ${t.customers ? money(t.cpa) : "—"}`,
  ];
  if (actual.spend || actual.revenue)
    lines.push(`Actual to date: spend ${money(actual.spend)} · revenue ${money(actual.revenue)}${actual.spend ? ` · ROAS ${(actual.revenue / actual.spend).toFixed(2)}x` : ""} · ${actual.conversions} platform conversions`);
  else lines.push("_No actuals yet — connect a data source, sync, or import a CSV._");
  lines.push("", alerts.length ? `*${alerts.length} alert${alerts.length > 1 ? "s" : ""}*` : "✅ No anomalies against plan.");
  for (const a of alerts.slice(0, 8)) lines.push(`${icon[a.severity]} ${a.message}`);
  const open = board.comments.filter((c) => !c.resolved).length;
  if (open) lines.push("", `💬 ${open} open comment${open > 1 ? "s" : ""}`);
  if (appUrl) lines.push("", `<${appUrl}/?board=${board.id}|Open board>`);
  return { text: lines.join("\n"), alerts };
}

export async function sendReport(board: Board, appUrl?: string) {
  const s = board.schedule;
  const ws = board.workspaceId;
  if (s?.syncFirst) {
    const r = await integrations.syncMetrics(ws, board.graph, board.id);
    if (Object.keys(r.actuals).length) {
      for (const n of board.graph.nodes) if (r.actuals[n.id]) n.data.actuals = { ...n.data.actuals, ...r.actuals[n.id] };
      await saveGraph(ws, board.id, board.graph);
    }
  }
  const { text, alerts } = buildReport(board, appUrl);
  const channels = s?.channels?.length ? s.channels : [];
  if (!channels.length) throw new Error("Choose at least one delivery channel (Slack, webhook, Zapier or Make).");
  const results = await Promise.allSettled(channels.map((c) => integrations.notify(ws, c, text)));
  const failed = results.flatMap((r, i) => (r.status === "rejected" ? [`${channels[i]}: ${(r.reason as Error).message}`] : []));
  if (s) await setSchedule(ws, board.id, { ...s, lastSentAt: Date.now() });
  if (failed.length === channels.length) throw new Error(failed.join("; "));
  return { text, alerts, failed };
}

function isDue(s: NonNullable<Board["schedule"]>, now: Date) {
  if (!s.enabled || now.getHours() !== s.hour) return false;
  if (s.frequency === "weekly" && now.getDay() !== s.weekday) return false;
  const minGap = s.frequency === "daily" ? 20 * 3600e3 : 6 * 24 * 3600e3;
  return !s.lastSentAt || now.getTime() - s.lastSentAt > minGap;
}

/**
 * Checks every minute for reports that are due. With several app instances,
 * set RUN_SCHEDULER=true on exactly one of them.
 */
export function startScheduler(appUrl?: string) {
  if (process.env.RUN_SCHEDULER === "false") return;
  const tick = async () => {
    const now = new Date();
    for (const b of await scheduledBoards().catch(() => [])) {
      if (!b.schedule || !isDue(b.schedule, now)) continue;
      try {
        await sendReport((await getBoardInternal(b.id))!, appUrl);
        console.log(`[reports] sent "${b.name}"`);
      } catch (e) {
        console.error(`[reports] "${b.name}" failed:`, (e as Error).message);
      }
    }
  };
  setInterval(tick, 60_000).unref();
}
