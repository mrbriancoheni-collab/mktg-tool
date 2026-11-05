import type { SimulationResult } from "../../shared/model";
import { num, usd } from "../lib/format";

export function KpiBar({ sim }: { sim: SimulationResult }) {
  const t = sim.totals;
  const items: [string, string, string?][] = [
    ["Spend", usd(t.spend)],
    ["Visitors", num(t.visitors)],
    ["Leads", num(t.leads)],
    ["Customers", num(t.customers)],
    ["Revenue", usd(t.revenue)],
    ["ROAS", `${t.roas.toFixed(2)}x`, t.spend ? (t.roas >= 1 ? "good" : "bad") : undefined],
    ["CPA", t.customers ? usd(t.cpa) : "—"],
    ["Profit", usd(t.profit), t.spend ? (t.profit >= 0 ? "good" : "bad") : undefined],
  ];
  return (
    <div className="kpis" aria-label="Monthly forecast">
      <span className="kpis-title">Monthly forecast</span>
      {items.map(([k, v, tone]) => (
        <div key={k} className={`kpi ${tone ?? ""}`}>
          <span>{k}</span>
          <b>{v}</b>
        </div>
      ))}
    </div>
  );
}
