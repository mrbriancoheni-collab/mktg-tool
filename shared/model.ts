import type { AssetKind, NodeKind, PlanningInputs } from "./catalog";

export interface Actuals {
  spend?: number;
  impressions?: number;
  clicks?: number;
  conversions?: number;
  revenue?: number;
}

export interface Asset {
  id: string;
  kind: AssetKind;
  content: string;
  createdAt: number;
}

export interface StageData extends Partial<PlanningInputs> {
  [key: string]: unknown;
  type: string;
  kind: NodeKind;
  label: string;
  notes?: string;
  actuals?: Actuals;
  assets?: Asset[];
  integration?: { status: "connected" | "not_connected"; account?: string };
  /** Destination URL (pages) or landing URL used for ads/UTMs (traffic). */
  url?: string;
  /** UTM parameters for traffic nodes; also used to match revenue imports. */
  utm?: { source?: string; medium?: string; campaign?: string; content?: string };
}

export interface EdgeData {
  [key: string]: unknown;
  /** Relative weight when a node has several outgoing paths. Defaults to 1. */
  weight?: number;
  label?: string;
}

/** Minimal graph shape exchanged with the server and used by the simulator. */
export interface GraphNode {
  id: string;
  data: StageData;
  position?: { x: number; y: number };
}
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  data?: EdgeData;
}
export interface Graph {
  name: string;
  goal?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface NodeResult {
  inflow: number; // people arriving at this step
  outflow: number; // people completing this step (moving on)
  spend: number;
  revenue: number;
}

export interface SimulationResult {
  nodes: Record<string, NodeResult>;
  edges: Record<string, number>; // people travelling along each edge
  totals: {
    spend: number;
    revenue: number;
    visitors: number;
    leads: number;
    customers: number;
    roas: number;
    cpa: number;
    profit: number;
  };
}

/** A campaign plan as produced by the AI planner or a template, before layout. */
export interface PlanSpec {
  name: string;
  summary: string;
  nodes: {
    id: string;
    type: string;
    label: string;
    notes: string;
    budget: number | null;
    cpc: number | null;
    visitors: number | null;
    conversionRate: number | null;
    price: number | null;
  }[];
  edges: { source: string; target: string; weight: number | null }[];
}
