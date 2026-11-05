import { create } from "zustand";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import { nanoid } from "nanoid";
import { CATALOG_BY_TYPE } from "../../shared/catalog";
import type { Actuals, Asset, EdgeData, Graph, PlanSpec, StageData } from "../../shared/model";
import { layoutPlan } from "./layout";
import type { Analysis } from "./api";

export type StageNode = Node<StageData>;
export type FlowEdge = Edge<EdgeData>;
export type View = "build" | "analyze";
export type Panel = "inspector" | "analysis" | "chat" | "comments" | null;
export type SaveState = "idle" | "saving" | "saved" | "conflict" | "error" | "offline";

export interface Comment {
  id: string;
  nodeId: string | null;
  author: string;
  text: string;
  createdAt: number;
  resolved: boolean;
}

/** Board record as stored on the server. */
export interface BoardRecord {
  id: string;
  name: string;
  goal: string;
  summary: string;
  graph: Graph;
  analysis: Analysis | null;
  comments: Comment[];
  updatedAt: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Snapshot {
  nodes: StageNode[];
  edges: FlowEdge[];
  name: string;
}

interface State {
  boardId: string | null;
  /** Server `updatedAt` of the version this client last loaded/saved. */
  baseUpdatedAt: number;
  readOnly: boolean;
  shareToken: string | null;
  saveState: SaveState;
  conflict: BoardRecord | null;
  comments: Comment[];
  others: string[];
  commentFilter: string | null;
  name: string;
  goal: string;
  summary: string;
  nodes: StageNode[];
  edges: FlowEdge[];
  view: View;
  panel: Panel;
  analysis: Analysis | null;
  chat: ChatMessage[];
  past: Snapshot[];
  future: Snapshot[];

  loadBoard(b: BoardRecord, opts?: { readOnly?: boolean; shareToken?: string | null }): void;
  setSync(patch: Partial<Pick<State, "saveState" | "baseUpdatedAt" | "conflict" | "others" | "comments" | "commentFilter">>): void;
  setName(name: string): void;
  setGoal(goal: string): void;
  setView(v: View): void;
  setPanel(p: Panel): void;
  setAnalysis(a: Analysis | null): void;
  setChat(c: ChatMessage[]): void;

  onNodesChange(changes: NodeChange<StageNode>[]): void;
  onEdgesChange(changes: EdgeChange<FlowEdge>[]): void;
  onConnect(c: Connection): void;

  checkpoint(): void;
  undo(): void;
  redo(): void;

  addNode(type: string, position: { x: number; y: number }): string;
  updateNode(id: string, patch: Partial<StageData>): void;
  updateEdge(id: string, patch: Partial<EdgeData>): void;
  addAsset(nodeId: string, asset: Asset): void;
  updateAsset(nodeId: string, assetId: string, content: string): void;
  removeAsset(nodeId: string, assetId: string): void;
  select(id: string | null): void;
  duplicateSelected(): void;
  loadPlan(plan: PlanSpec, goal?: string): void;
  applyActuals(actuals: Record<string, Actuals>): void;
  clearBoard(): void;
  importGraph(g: Graph & { summary?: string }): void;
}

export const useStore = create<State>()((set, get) => ({
      boardId: null,
      baseUpdatedAt: 0,
      readOnly: false,
      shareToken: null,
      saveState: "idle",
      conflict: null,
      comments: [],
      others: [],
      commentFilter: null,
      name: "Untitled campaign",
      goal: "",
      summary: "",
      nodes: [],
      edges: [],
      view: "build",
      panel: null,
      analysis: null,
      chat: [],
      past: [],
      future: [],

      loadBoard: (b, opts = {}) =>
        set({
          boardId: b.id,
          baseUpdatedAt: b.updatedAt,
          readOnly: !!opts.readOnly,
          shareToken: opts.shareToken ?? null,
          saveState: "saved",
          conflict: null,
          name: b.name,
          goal: b.goal ?? "",
          summary: b.summary ?? "",
          nodes: b.graph.nodes.map((n) => ({
            id: n.id,
            type: n.data.kind === "note" ? "sticky" : "stage",
            position: n.position ?? { x: 0, y: 0 },
            data: n.data,
            ...(n.data.kind === "note" ? { style: (n.data.size as object) ?? { width: 200, height: 160 } } : {}),
          })),
          edges: b.graph.edges.map((e) => ({ ...e, type: "flow", data: e.data ?? {} })),
          analysis: b.analysis ?? null,
          comments: b.comments ?? [],
          chat: [],
          past: [],
          future: [],
          view: "build",
          panel: opts.readOnly ? "analysis" : null,
        }),
      setSync: (patch) => set(patch),
      setName: (name) => set({ name }),
      setGoal: (goal) => set({ goal }),
      setView: (view) => set({ view }),
      setPanel: (panel) => set({ panel }),
      setAnalysis: (analysis) => set({ analysis }),
      setChat: (chat) => set({ chat }),

      onNodesChange: (changes) => {
        // Record an undo point for structural changes (not drags/selection).
        if (changes.some((c) => c.type === "remove")) get().checkpoint();
        const nodes = applyNodeChanges(changes, get().nodes);
        const selected = nodes.find((n) => n.selected);
        const panel = get().panel;
        set({ nodes, panel: selected && panel === null ? "inspector" : panel });
      },
      onEdgesChange: (changes) => {
        if (changes.some((c) => c.type === "remove")) get().checkpoint();
        set({ edges: applyEdgeChanges(changes, get().edges) });
      },
      onConnect: (c) => {
        if (c.source === c.target) return;
        get().checkpoint();
        set({ edges: addEdge({ ...c, id: `e_${nanoid(6)}`, type: "flow", data: {} }, get().edges) });
      },

      checkpoint: () => {
        const { nodes, edges, name, past } = get();
        set({ past: [...past.slice(-49), { nodes, edges, name }], future: [] });
      },
      undo: () => {
        const { past, future, nodes, edges, name } = get();
        const prev = past[past.length - 1];
        if (!prev) return;
        set({ ...prev, past: past.slice(0, -1), future: [{ nodes, edges, name }, ...future] });
      },
      redo: () => {
        const { past, future, nodes, edges, name } = get();
        const next = future[0];
        if (!next) return;
        set({ ...next, future: future.slice(1), past: [...past, { nodes, edges, name }] });
      },

      addNode: (type, position) => {
        const item = CATALOG_BY_TYPE[type];
        if (!item) return "";
        get().checkpoint();
        const id = `n_${nanoid(6)}`;
        const node: StageNode = {
          id,
          type: item.kind === "note" ? "sticky" : "stage",
          position,
          selected: true,
          data: {
            type,
            kind: item.kind,
            label: item.kind === "note" ? "" : item.label,
            ...item.defaults,
            ...(item.kind === "note" ? { color: item.color } : {}),
          },
          ...(item.kind === "note" ? { style: { width: 200, height: 160 } } : {}),
        };
        set({
          nodes: [...get().nodes.map((n) => ({ ...n, selected: false })), node],
          panel: item.kind === "note" ? get().panel : "inspector",
        });
        return id;
      },
      updateNode: (id, patch) =>
        set({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)) }),
      updateEdge: (id, patch) =>
        set({ edges: get().edges.map((e) => (e.id === id ? { ...e, data: { ...e.data, ...patch } } : e)) }),
      addAsset: (nodeId, asset) =>
        set({
          nodes: get().nodes.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, assets: [asset, ...(n.data.assets ?? [])] } } : n,
          ),
        }),
      updateAsset: (nodeId, assetId, content) =>
        set({
          nodes: get().nodes.map((n) =>
            n.id === nodeId
              ? { ...n, data: { ...n.data, assets: (n.data.assets ?? []).map((a) => (a.id === assetId ? { ...a, content } : a)) } }
              : n,
          ),
        }),
      removeAsset: (nodeId, assetId) =>
        set({
          nodes: get().nodes.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, assets: (n.data.assets ?? []).filter((a) => a.id !== assetId) } } : n,
          ),
        }),
      select: (id) =>
        set({
          nodes: get().nodes.map((n) => ({ ...n, selected: n.id === id })),
          panel: id ? "inspector" : get().panel,
        }),
      duplicateSelected: () => {
        const sel = get().nodes.filter((n) => n.selected);
        if (!sel.length) return;
        get().checkpoint();
        const copies = sel.map((n) => ({
          ...n,
          id: `n_${nanoid(6)}`,
          position: { x: n.position.x + 40, y: n.position.y + 40 },
          data: structuredClone(n.data),
          selected: true,
        }));
        set({ nodes: [...get().nodes.map((n) => ({ ...n, selected: false })), ...copies] });
      },
      loadPlan: (plan, goal) => {
        get().checkpoint();
        const { nodes, edges } = layoutPlan(plan);
        set({ nodes, edges, name: plan.name, summary: plan.summary, goal: goal ?? get().goal, analysis: null, view: "build" });
      },
      applyActuals: (actuals) => {
        get().checkpoint();
        set({
          nodes: get().nodes.map((n) => (actuals[n.id] ? { ...n, data: { ...n.data, actuals: { ...n.data.actuals, ...actuals[n.id] } } } : n)),
        });
      },
      clearBoard: () => {
        get().checkpoint();
        set({ nodes: [], edges: [], name: "Untitled campaign", goal: "", summary: "", analysis: null, chat: [] });
      },
      importGraph: (g) => {
        get().checkpoint();
        set({
          name: g.name,
          goal: g.goal ?? "",
          summary: g.summary ?? "",
          nodes: g.nodes.map((n) => ({
            id: n.id,
            type: n.data.kind === "note" ? "sticky" : "stage",
            position: n.position ?? { x: 0, y: 0 },
            data: n.data,
          })),
          edges: g.edges.map((e) => ({ ...e, type: "flow", data: e.data ?? {} })),
          analysis: null,
        });
      },
    })
);

/** Old single-board localStorage key from v1, migrated to the server on first load. */
export const LEGACY_KEY = "adcanvas-board";


/** Serializable graph used for the simulator, API calls and saving. */
export function toGraph(s: Pick<State, "name" | "goal" | "nodes" | "edges">): Graph {
  return {
    name: s.name,
    goal: s.goal || undefined,
    nodes: s.nodes.map((n) => ({
      id: n.id,
      position: n.position,
      // Persist sticky-note dimensions so resizes survive reloads.
      data:
        n.data.kind === "note"
          ? { ...n.data, size: { width: n.width ?? n.measured?.width ?? 200, height: n.height ?? n.measured?.height ?? 160 } }
          : n.data,
    })),
    edges: s.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, data: e.data })),
  };
}
