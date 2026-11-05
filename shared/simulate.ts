import { CATALOG_BY_TYPE } from "./catalog";
import type { Graph, NodeResult, SimulationResult } from "./model";

/**
 * Forecasts how traffic moves through the funnel.
 *
 * Traffic nodes emit visitors (fixed count, or budget / CPC). Each page/action
 * converts `conversionRate`% of its inflow and passes them along outgoing
 * edges, split by edge weight. Nodes with a `price` book revenue on their
 * conversions. Integrations and notes are not part of the flow. Back-edges
 * (loops such as retargeting) are ignored so the forecast always terminates.
 */
export function simulate(graph: Graph): SimulationResult {
  const flowNodes = graph.nodes.filter((n) => n.data.kind !== "integration" && n.data.kind !== "note");
  const ids = new Set(flowNodes.map((n) => n.id));
  const flowEdges = graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target));

  const outgoing = new Map<string, typeof flowEdges>();
  const indeg = new Map<string, number>();
  for (const n of flowNodes) {
    outgoing.set(n.id, []);
    indeg.set(n.id, 0);
  }
  for (const e of flowEdges) {
    outgoing.get(e.source)!.push(e);
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  }

  // Kahn's algorithm; anything left over sits on a cycle and is processed last
  // with whatever inflow has reached it (its back-edges are dropped).
  const order: string[] = [];
  const queue = flowNodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  const remaining = new Map(indeg);
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const e of outgoing.get(id)!) {
      const d = remaining.get(e.target)! - 1;
      remaining.set(e.target, d);
      if (d === 0) queue.push(e.target);
    }
  }
  for (const n of flowNodes) if (!order.includes(n.id)) order.push(n.id);
  const rank = new Map(order.map((id, i) => [id, i]));

  const byId = new Map(flowNodes.map((n) => [n.id, n]));
  const results: Record<string, NodeResult> = {};
  const edgeFlow: Record<string, number> = {};
  const inflow = new Map<string, number>();

  let visitors = 0, leads = 0, customers = 0;

  for (const id of order) {
    const d = byId.get(id)!.data;
    const defaults = CATALOG_BY_TYPE[d.type]?.defaults ?? {};
    let inn = inflow.get(id) ?? 0;
    let spend = 0;
    let out: number;

    if (d.kind === "traffic") {
      const budget = d.budget ?? defaults.budget ?? 0;
      const cpc = d.cpc ?? defaults.cpc ?? 0;
      const fixed = d.visitors ?? defaults.visitors;
      spend = budget;
      const generated = fixed != null && !(budget && cpc) ? fixed : cpc > 0 ? budget / cpc : 0;
      inn += generated;
      out = inn;
      visitors += generated;
    } else {
      const cr = (d.conversionRate ?? defaults.conversionRate ?? 100) / 100;
      out = inn * cr;
    }

    const price = d.price ?? defaults.price ?? 0;
    const revenue = price > 0 ? out * price : 0;
    if (CATALOG_BY_TYPE[d.type]?.role === "lead") leads += out;

    results[id] = { inflow: inn, outflow: out, spend, revenue };

    const forward = outgoing.get(id)!.filter((e) => rank.get(e.target)! > rank.get(id)!);
    const totalWeight = forward.reduce((s, e) => s + (e.data?.weight ?? 1), 0);
    for (const e of outgoing.get(id)!) {
      const isForward = forward.includes(e);
      const flow = isForward && totalWeight > 0 ? (out * (e.data?.weight ?? 1)) / totalWeight : 0;
      edgeFlow[e.id] = flow;
      if (isForward) inflow.set(e.target, (inflow.get(e.target) ?? 0) + flow);
    }
  }

  // Customers = people who complete a "customer" step (checkout, closed-won,
  // subscription). Upsells don't add new customers. A generic "Purchase" event
  // only counts when no more specific customer step exists, to avoid double-counting.
  const isCustomer = (t: string) => CATALOG_BY_TYPE[t]?.role === "customer";
  const primary = flowNodes.filter((n) => isCustomer(n.data.type) && n.data.type !== "purchase");
  const customerNodes = primary.length ? primary : flowNodes.filter((n) => n.data.type === "purchase");
  customers = customerNodes.reduce((s, n) => s + (results[n.id]?.outflow ?? 0), 0);

  const spend = Object.values(results).reduce((s, r) => s + r.spend, 0);
  const revenue = Object.values(results).reduce((s, r) => s + r.revenue, 0);
  return {
    nodes: results,
    edges: edgeFlow,
    totals: {
      spend,
      revenue,
      visitors,
      leads,
      customers,
      roas: spend > 0 ? revenue / spend : 0,
      cpa: customers > 0 ? spend / customers : 0,
      profit: revenue - spend,
    },
  };
}
