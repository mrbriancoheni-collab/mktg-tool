import { CATALOG_BY_TYPE } from "../../shared/catalog";
import type { PlanSpec, StageData } from "../../shared/model";
import type { FlowEdge, StageNode } from "./store";

const COL = 320;
const ROW = 170;

/**
 * Lays a plan out left-to-right by funnel depth (longest path from a traffic
 * source). Integrations go in a row beneath the step they're attached to.
 */
export function layoutPlan(plan: PlanSpec): { nodes: StageNode[]; edges: FlowEdge[] } {
  const prefix = `p${Date.now().toString(36)}_`;
  const kindOf = (type: string) => CATALOG_BY_TYPE[type]?.kind ?? "page";
  const flow = plan.nodes.filter((n) => kindOf(n.type) !== "integration");
  const integ = plan.nodes.filter((n) => kindOf(n.type) === "integration");
  const flowIds = new Set(flow.map((n) => n.id));

  const depth = new Map<string, number>(flow.map((n) => [n.id, 0]));
  // Relax edges repeatedly (bounded, so cycles can't loop forever).
  for (let i = 0; i < flow.length; i++) {
    let changed = false;
    for (const e of plan.edges) {
      if (!flowIds.has(e.source) || !flowIds.has(e.target)) continue;
      const d = (depth.get(e.source) ?? 0) + 1;
      if (d > (depth.get(e.target) ?? 0) && d < flow.length) {
        depth.set(e.target, d);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const columns = new Map<number, string[]>();
  for (const n of flow) {
    const d = depth.get(n.id)!;
    columns.set(d, [...(columns.get(d) ?? []), n.id]);
  }
  const maxRows = Math.max(1, ...[...columns.values()].map((c) => c.length));
  const pos = new Map<string, { x: number; y: number }>();
  for (const [d, ids] of columns) {
    const offset = ((maxRows - ids.length) * ROW) / 2;
    ids.forEach((id, i) => pos.set(id, { x: d * COL, y: offset + i * ROW }));
  }

  // If an edge skips over a column, nudge that column's nodes off the straight
  // line so the skipping edge stays visible (e.g. Product → Checkout passing
  // an Abandoned Cart step).
  for (const e of plan.edges) {
    const a = pos.get(e.source), b = pos.get(e.target);
    if (!a || !b || !flowIds.has(e.source) || !flowIds.has(e.target) || b.x - a.x <= COL) continue;
    for (const [d, ids] of columns) {
      if (d * COL <= a.x || d * COL >= b.x) continue;
      for (const id of ids) {
        const p = pos.get(id)!;
        if (Math.abs(p.y - a.y) < ROW / 2 && Math.abs(p.y - b.y) < ROW / 2) p.y += ROW * 0.8;
      }
    }
  }

  const baseY = Math.max(...[...pos.values()].map((p) => p.y), 0) + ROW + 60;
  const usedX = new Map<number, number>();
  for (const n of integ) {
    const link = plan.edges.find((e) => (e.source === n.id && flowIds.has(e.target)) || (e.target === n.id && flowIds.has(e.source)));
    const anchor = link ? pos.get(link.source === n.id ? link.target : link.source) : undefined;
    let x = anchor?.x ?? 0;
    while (usedX.has(x)) x += COL / 2;
    usedX.set(x, 1);
    pos.set(n.id, { x, y: baseY });
  }

  const nodes: StageNode[] = plan.nodes.map((n) => {
    const kind = kindOf(n.type);
    const data: StageData = { type: n.type, kind, label: n.label, notes: n.notes };
    for (const k of ["budget", "cpc", "visitors", "conversionRate", "price"] as const) {
      if (n[k] != null) data[k] = n[k]!;
    }
    if (kind === "integration") data.integration = { status: "not_connected" };
    return { id: prefix + n.id, type: "stage", position: pos.get(n.id) ?? { x: 0, y: 0 }, data };
  });

  const edges: FlowEdge[] = plan.edges
    .filter((e) => plan.nodes.some((n) => n.id === e.source) && plan.nodes.some((n) => n.id === e.target))
    .map((e, i) => ({
      id: `${prefix}e${i}`,
      source: prefix + e.source,
      target: prefix + e.target,
      type: "flow",
      data: e.weight != null ? { weight: e.weight } : {},
    }));

  return { nodes, edges };
}
