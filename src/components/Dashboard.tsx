// Performance dashboard: date range, KPI tiles vs. previous period, daily
// trends, budget pacing against plan, and channel breakdown.

import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Database, RefreshCcw, Table2 } from "lucide-react";
import { CATALOG_BY_TYPE } from "../../shared/catalog";
import { api, type Metrics, type MetricTotals } from "../lib/api";
import { num, usd } from "../lib/format";
import { ItemIcon } from "../lib/icons";
import { useStore } from "../lib/store";
import { BarList, LineChart, PLAN_COLOR, SERIES } from "./charts";

type Range = "7" | "30" | "90" | "mtd" | "custom";
const iso = (d: Date) => d.toISOString().slice(0, 10);

function rangeDates(r: Range, custom: { from: string; to: string }) {
  const today = new Date();
  if (r === "custom") return custom;
  if (r === "mtd") return { from: iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))), to: iso(today) };
  return { from: iso(new Date(Date.now() - (Number(r) - 1) * 86400e3)), to: iso(today) };
}

const money = (v: number) => (Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `$${Math.round(v)}`);

export function Dashboard({ onSync, syncing }: { onSync: () => void; syncing: boolean }) {
  const boardId = useStore((s) => s.boardId);
  const nodes = useStore((s) => s.nodes);
  const readOnly = useStore((s) => s.readOnly);
  const [range, setRange] = useState<Range>("30");
  const [custom, setCustom] = useState(() => rangeDates("30", { from: "", to: "" }));
  const [data, setData] = useState<Metrics | null>(null);
  const [error, setError] = useState("");
  const [table, setTable] = useState(false);
  const [tick, setTick] = useState(0);
  const { from, to } = rangeDates(range, custom);

  useEffect(() => {
    if (!boardId) return;
    setError("");
    api
      .metrics(boardId, from, to)
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [boardId, from, to, tick, syncing]);

  // Fill missing days with zero so lines are continuous.
  const labels = useMemo(() => {
    const out: string[] = [];
    for (let d = new Date(from + "T00:00:00Z"); d <= new Date(to + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) out.push(iso(d));
    return out;
  }, [from, to]);
  const byDay = new Map((data?.days ?? []).map((d) => [d.day, d]));
  const t = data?.totals;
  const p = data?.previous;
  const hasData = !!data && (data.days.length > 0 || !!data.available.first);

  const trafficNodes = nodes.filter((n) => n.data.kind === "traffic");
  const plannedDaily = trafficNodes.reduce((s, n) => s + (n.data.budget ?? 0), 0) / 30;
  let cum = 0;
  const cumulative = labels.map((d) => (cum += byDay.get(d)?.spend ?? 0));
  const plan = labels.map((_, i) => plannedDaily * (i + 1));

  const channel = (data?.byNode ?? [])
    .map((r) => ({ ...r, node: nodes.find((n) => n.id === r.nodeId) }))
    .filter((r) => r.node && r.spend > 0)
    .sort((a, b) => b.spend - a.spend);

  return (
    <div className="dashboard">
      <div className="dash-filters">
        <div className="seg seg-sm">
          {(["7", "30", "90", "mtd", "custom"] as Range[]).map((r) => (
            <button key={r} className={range === r ? "on" : ""} onClick={() => setRange(r)}>
              {r === "mtd" ? "Month to date" : r === "custom" ? "Custom" : `Last ${r} days`}
            </button>
          ))}
        </div>
        {range === "custom" && (
          <div className="row">
            <input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} aria-label="From" />
            <span className="muted">→</span>
            <input type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} aria-label="To" />
          </div>
        )}
        <div className="spacer" />
        <button className="btn" onClick={() => setTable(!table)} aria-pressed={table}>
          <Table2 size={15} /> {table ? "Charts" : "Table"}
        </button>
        {!readOnly && (
          <button className="btn primary" onClick={onSync} disabled={syncing}>
            <RefreshCcw size={15} className={syncing ? "spin" : ""} /> Sync latest data
          </button>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      {data && !hasData && (
        <div className="dash-empty">
          <Database size={30} />
          <h2>No performance data yet</h2>
          <p className="muted">
            Connect an ad account in <b>Settings → Integrations</b>, link campaigns to your steps (the ✨ wand button matches them automatically), then click <b>Sync latest data</b>. You can also import a CSV with a <code>date</code> column.
          </p>
          {!readOnly && (
            <button
              className="btn"
              onClick={async () => {
                await api.sampleMetrics(boardId!);
                setTick(tick + 1);
              }}
            >
              Try it with sample data
            </button>
          )}
        </div>
      )}

      {data && hasData && t && p && (
        <>
          <div className="kpi-tiles">
            <Kpi label="Spend" value={usd(t.spend)} cur={t.spend} prev={p.spend} lowerIsBetter />
            <Kpi label="Revenue" value={usd(t.revenue)} cur={t.revenue} prev={p.revenue} />
            <Kpi label="ROAS" value={t.spend ? `${(t.revenue / t.spend).toFixed(2)}x` : "—"} cur={t.spend ? t.revenue / t.spend : 0} prev={p.spend ? p.revenue / p.spend : 0} />
            <Kpi label="Conversions" value={num(t.conversions)} cur={t.conversions} prev={p.conversions} />
            <Kpi label="Cost per conversion" value={t.conversions ? usd(t.spend / t.conversions) : "—"} cur={t.conversions ? t.spend / t.conversions : 0} prev={p.conversions ? p.spend / p.conversions : 0} lowerIsBetter />
            <Kpi label="Click-through rate" value={t.impressions ? `${((t.clicks / t.impressions) * 100).toFixed(2)}%` : "—"} cur={t.impressions ? t.clicks / t.impressions : 0} prev={p.impressions ? p.clicks / p.impressions : 0} />
          </div>
          <p className="muted small">
            {from} → {to}, compared with the previous {labels.length} days. Sources: {(data.available.sources ?? []).map((s) => (s === "sample" ? "Sample data" : s === "csv" ? "CSV import" : CATALOG_BY_TYPE[s]?.label ?? s)).join(", ") || "—"}.
          </p>

          {table ? (
            <table className="table dash-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Spend</th>
                  <th>Revenue</th>
                  <th>ROAS</th>
                  <th>Clicks</th>
                  <th>Conversions</th>
                </tr>
              </thead>
              <tbody>
                {labels.map((d) => {
                  const r = byDay.get(d);
                  return (
                    <tr key={d}>
                      <td>{d}</td>
                      <td>{usd(r?.spend ?? 0)}</td>
                      <td>{usd(r?.revenue ?? 0)}</td>
                      <td>{r?.spend ? `${(r.revenue / r.spend).toFixed(2)}x` : "—"}</td>
                      <td>{num(r?.clicks ?? 0)}</td>
                      <td>{num(r?.conversions ?? 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="dash-grid">
              <div className="dash-card wide">
                <h3>Spend and revenue per day</h3>
                <LineChart
                  ariaLabel="Daily spend and revenue"
                  labels={labels}
                  format={money}
                  series={[
                    { name: "Spend", color: SERIES[0], values: labels.map((d) => byDay.get(d)?.spend ?? 0) },
                    { name: "Revenue", color: SERIES[1], values: labels.map((d) => byDay.get(d)?.revenue ?? 0) },
                  ]}
                />
              </div>
              <div className="dash-card">
                <h3>Budget pacing</h3>
                <p className="muted small">Cumulative spend vs. your plan ({usd(plannedDaily * 30)}/month)</p>
                <LineChart
                  ariaLabel="Cumulative spend versus plan"
                  labels={labels}
                  format={money}
                  height={200}
                  series={[
                    { name: "Actual", color: SERIES[0], values: cumulative },
                    { name: "Plan", color: PLAN_COLOR, values: plan, dashed: true },
                  ]}
                />
                <Pacing actual={cumulative.at(-1) ?? 0} plan={plan.at(-1) ?? 0} />
              </div>
              <div className="dash-card">
                <h3>Spend by channel</h3>
                <p className="muted small">With return on ad spend and cost per conversion</p>
                {channel.length ? (
                  <BarList
                    format={money}
                    rows={channel.map((r) => ({
                      label: r.node!.data.label,
                      value: r.spend,
                      extra: `${r.spend ? (r.revenue / r.spend).toFixed(1) : "0"}x · ${r.conversions ? usd(r.spend / r.conversions) : "—"}`,
                    }))}
                  />
                ) : (
                  <p className="muted small">No channel-level spend in this range.</p>
                )}
              </div>
            </div>
          )}

          <div className="dash-card">
            <h3>Plan vs. actual by step</h3>
            <table className="table dash-table">
              <thead>
                <tr>
                  <th>Step</th>
                  <th>Planned spend</th>
                  <th>Actual spend</th>
                  <th>Clicks</th>
                  <th>Conversions</th>
                  <th>Revenue</th>
                  <th>ROAS</th>
                </tr>
              </thead>
              <tbody>
                {(data.byNode as (MetricTotals & { nodeId: string })[])
                  .map((r) => ({ r, n: nodes.find((x) => x.id === r.nodeId) }))
                  .filter((x) => x.n)
                  .map(({ r, n }) => (
                    <tr key={r.nodeId}>
                      <td>
                        <span className="row">
                          <ItemIcon item={CATALOG_BY_TYPE[n!.data.type]} size={20} /> {n!.data.label}
                        </span>
                      </td>
                      <td>{n!.data.budget ? usd(((n!.data.budget ?? 0) / 30) * labels.length) : "—"}</td>
                      <td>{usd(r.spend)}</td>
                      <td>{num(r.clicks)}</td>
                      <td>{num(r.conversions)}</td>
                      <td>{usd(r.revenue)}</td>
                      <td>{r.spend ? `${(r.revenue / r.spend).toFixed(2)}x` : "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, cur, prev, lowerIsBetter }: { label: string; value: string; cur: number; prev: number; lowerIsBetter?: boolean }) {
  const delta = prev ? (cur - prev) / prev : null;
  const good = delta == null ? null : lowerIsBetter ? delta <= 0 : delta >= 0;
  return (
    <div className="kpi-tile">
      <span>{label}</span>
      <b>{value}</b>
      {delta != null && Math.abs(delta) >= 0.005 ? (
        <em className={good ? "good" : "bad"}>
          {delta >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
          {Math.abs(Math.round(delta * 100))}% vs previous
        </em>
      ) : (
        <em className="flat">{delta == null ? "no previous data" : "flat vs previous"}</em>
      )}
    </div>
  );
}

function Pacing({ actual, plan }: { actual: number; plan: number }) {
  if (!plan) return null;
  const r = actual / plan;
  const status = r > 1.15 ? ["Overspending", "bad"] : r < 0.8 ? ["Underspending", "warn"] : ["On pace", "good"];
  return (
    <p className={`pacing ${status[1]}`}>
      <b>{status[0]}</b> · {Math.round(r * 100)}% of planned spend for this period
    </p>
  );
}
