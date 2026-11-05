// What-if scenarios, budget optimization and experiment statistics.
import type { Graph } from "./model";
import { simulate } from "./simulate";

export interface Scenario {
  /** % change in cost per click on paid channels (e.g. +30). */
  cpc: number;
  /** % change applied to every step's conversion rate (relative, e.g. -10). */
  conversion: number;
  /** % change in revenue per sale. */
  price: number;
  /** % change in every paid channel's budget. */
  budget: number;
}

export const NO_CHANGE: Scenario = { cpc: 0, conversion: 0, price: 0, budget: 0 };

export function applyScenario(graph: Graph, s: Scenario): Graph {
  const f = (p: number) => 1 + p / 100;
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      const d = { ...n.data };
      if (d.kind === "traffic") {
        if (d.cpc != null) d.cpc = Math.round(d.cpc * f(s.cpc) * 100) / 100;
        if (d.budget != null) d.budget = Math.round(d.budget * f(s.budget));
      } else if (d.kind === "page" || d.kind === "action") {
        if (d.conversionRate != null && d.conversionRate < 100) d.conversionRate = Math.min(100, Math.round(d.conversionRate * f(s.conversion) * 10) / 10);
        if (d.price) d.price = Math.round(d.price * f(s.price) * 100) / 100;
      }
      return { ...n, data: d };
    }),
  };
}

/**
 * Diminishing returns: the more you spend on a channel relative to its
 * current budget, the more each click costs (audiences saturate).
 * effective CPC = CPC × (budget / base)^elasticity
 */
function withSaturation(graph: Graph, budgets: Record<string, number>, base: Record<string, number>, elasticity: number): Graph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      if (!(n.id in budgets)) return n;
      const ratio = Math.max(0.05, budgets[n.id] / base[n.id]);
      return { ...n, data: { ...n.data, budget: budgets[n.id], cpc: (n.data.cpc ?? 1) * ratio ** elasticity } };
    }),
  };
}

export interface OptimizeResult {
  budgets: { nodeId: string; label: string; from: number; to: number }[];
  before: ReturnType<typeof simulate>["totals"];
  after: ReturnType<typeof simulate>["totals"];
  goal: "profit" | "revenue" | "customers";
}

/**
 * Reallocates the same total budget across paid channels to maximize the goal,
 * moving 2% of the total at a time to the channel with the best marginal return,
 * within 50%–200% of each channel's current budget.
 */
export function optimizeBudget(graph: Graph, goal: OptimizeResult["goal"] = "profit", elasticity = 0.3): OptimizeResult | null {
  const paid = graph.nodes.filter((n) => n.data.kind === "traffic" && (n.data.budget ?? 0) > 0 && (n.data.cpc ?? 0) > 0);
  if (paid.length < 2) return null;
  const base = Object.fromEntries(paid.map((n) => [n.id, n.data.budget!]));
  const total = Object.values(base).reduce((a, b) => a + b, 0);
  const step = total * 0.02;
  const score = (b: Record<string, number>) => {
    const t = simulate(withSaturation(graph, b, base, elasticity)).totals;
    return goal === "profit" ? t.profit : goal === "revenue" ? t.revenue : t.customers;
  };
  let cur = { ...base };
  let curScore = score(cur);
  for (let iter = 0; iter < 200; iter++) {
    let best: { b: Record<string, number>; s: number } | null = null;
    for (const from of paid) {
      if (cur[from.id] - step < base[from.id] * 0.5) continue;
      for (const to of paid) {
        if (to.id === from.id || cur[to.id] + step > base[to.id] * 2) continue;
        const b = { ...cur, [from.id]: cur[from.id] - step, [to.id]: cur[to.id] + step };
        const s = score(b);
        if (s > (best?.s ?? curScore) + 1e-6) best = { b, s };
      }
    }
    if (!best) break;
    cur = best.b;
    curScore = best.s;
  }
  return {
    goal,
    budgets: paid.map((n) => ({ nodeId: n.id, label: n.data.label, from: base[n.id], to: Math.round(cur[n.id]) })),
    before: simulate(withSaturation(graph, base, base, elasticity)).totals,
    after: simulate(withSaturation(graph, cur, base, elasticity)).totals,
  };
}

/** Two-proportion z-test: is variant B's conversion rate different from A's? */
export function abTest(a: { visitors: number; conversions: number }, b: { visitors: number; conversions: number }) {
  if (a.visitors <= 0 || b.visitors <= 0) return null;
  const pa = a.conversions / a.visitors, pb = b.conversions / b.visitors;
  const p = (a.conversions + b.conversions) / (a.visitors + b.visitors);
  const se = Math.sqrt(p * (1 - p) * (1 / a.visitors + 1 / b.visitors));
  const z = se > 0 ? (pb - pa) / se : 0;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  return { rateA: pa, rateB: pb, lift: pa > 0 ? (pb - pa) / pa : 0, pValue, significant: pValue < 0.05, confidence: 1 - pValue };
}

function normalCdf(x: number) {
  // Abramowitz–Stegun approximation
  const t = 1 / (1 + 0.2316419 * x);
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  return 1 - d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
}

/** Visitors needed per variant to detect a relative lift with 80% power at 95% confidence. */
export function sampleSizePerVariant(baselineRate: number, relativeLift: number) {
  const p1 = baselineRate, p2 = baselineRate * (1 + relativeLift);
  const za = 1.96, zb = 0.8416;
  const pBar = (p1 + p2) / 2;
  const n = (za * Math.sqrt(2 * pBar * (1 - pBar)) + zb * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2 / (p2 - p1) ** 2;
  return Math.ceil(n);
}
