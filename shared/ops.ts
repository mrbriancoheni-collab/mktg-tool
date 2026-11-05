// Board edit operations for real-time collaboration. Clients diff their local
// state into element-level ops; the server applies them and broadcasts them to
// everyone else. Conflicts resolve per element (last write wins), so two people
// editing different nodes never clobber each other.

import type { GraphEdge, GraphNode } from "./model";

export interface BoardMeta {
  name?: string;
  goal?: string;
  summary?: string;
  analysis?: unknown;
}

export type Op =
  | { t: "node.put"; node: GraphNode }
  | { t: "node.del"; id: string }
  | { t: "edge.put"; edge: GraphEdge }
  | { t: "edge.del"; id: string }
  | { t: "meta"; patch: BoardMeta };

export interface BoardState {
  name: string;
  goal: string;
  summary: string;
  analysis: unknown;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function applyOps<S extends BoardState>(state: S, ops: Op[]): S {
  const nodes = new Map(state.nodes.map((n) => [n.id, n]));
  const edges = new Map(state.edges.map((e) => [e.id, e]));
  const meta: BoardMeta = {};
  for (const op of ops) {
    switch (op.t) {
      case "node.put":
        nodes.set(op.node.id, op.node);
        break;
      case "node.del":
        nodes.delete(op.id);
        break;
      case "edge.put":
        edges.set(op.edge.id, op.edge);
        break;
      case "edge.del":
        edges.delete(op.id);
        break;
      case "meta":
        Object.assign(meta, op.patch);
        break;
    }
  }
  // Drop edges whose endpoints no longer exist.
  for (const [id, e] of edges) if (!nodes.has(e.source) || !nodes.has(e.target)) edges.delete(id);
  return { ...state, ...meta, nodes: [...nodes.values()], edges: [...edges.values()] };
}

const key = (v: unknown) => JSON.stringify(v);

/** Element-level diff between two board states. */
export function diffStates(prev: BoardState, next: BoardState): Op[] {
  const ops: Op[] = [];
  const pn = new Map(prev.nodes.map((n) => [n.id, key(n)]));
  const nn = new Set(next.nodes.map((n) => n.id));
  for (const n of next.nodes) if (pn.get(n.id) !== key(n)) ops.push({ t: "node.put", node: n });
  for (const id of pn.keys()) if (!nn.has(id)) ops.push({ t: "node.del", id });
  const pe = new Map(prev.edges.map((e) => [e.id, key(e)]));
  const ne = new Set(next.edges.map((e) => e.id));
  for (const e of next.edges) if (pe.get(e.id) !== key(e)) ops.push({ t: "edge.put", edge: e });
  for (const id of pe.keys()) if (!ne.has(id)) ops.push({ t: "edge.del", id });
  const patch: BoardMeta = {};
  for (const k of ["name", "goal", "summary", "analysis"] as const) if (key(prev[k]) !== key(next[k])) patch[k] = next[k] as never;
  if (Object.keys(patch).length) ops.push({ t: "meta", patch });
  return ops;
}

/** Basic shape validation for ops arriving from clients. */
export function validOps(ops: unknown): ops is Op[] {
  if (!Array.isArray(ops) || ops.length > 2000) return false;
  return ops.every((o) => {
    if (!o || typeof o !== "object") return false;
    const op = o as Record<string, unknown>;
    switch (op.t) {
      case "node.put":
        return typeof (op.node as GraphNode)?.id === "string" && typeof (op.node as GraphNode)?.data === "object";
      case "edge.put":
        return typeof (op.edge as GraphEdge)?.id === "string" && typeof (op.edge as GraphEdge)?.source === "string";
      case "node.del":
      case "edge.del":
        return typeof op.id === "string";
      case "meta":
        return typeof op.patch === "object" && op.patch !== null;
      default:
        return false;
    }
  });
}
