import type { AssetKind } from "../../shared/catalog";
import type { AdPack } from "../../shared/adpack";
import type { Actuals, Graph, PlanSpec } from "../../shared/model";
import type { BoardRecord, Comment } from "./store";

export interface Analysis {
  headline: string;
  healthScore: number;
  findings: {
    nodeId: string | null;
    severity: "critical" | "warning" | "opportunity";
    title: string;
    detail: string;
    recommendation: string;
  }[];
  experiments: { nodeId: string | null; hypothesis: string; test: string; expectedImpact: string }[];
}

export interface IntegrationInfo {
  type: string;
  live: boolean;
  fields: { key: string; label: string; secret?: boolean; placeholder?: string }[];
  canNotify: boolean;
  canSync: boolean;
  connected: boolean;
  account: string | null;
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public data: Record<string, unknown>) {
    super(message);
  }
}

async function json<T>(url: string, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(url, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status, data);
  return data as T;
}

/** POSTs and calls `onText` with the accumulated text as the stream arrives. */
async function stream(url: string, body: unknown, onText: (full: string) => void, signal?: AbortSignal) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    full += decoder.decode(value, { stream: true });
    onText(full);
  }
  return full;
}

export const api = {
  status: () => json<{ ai: "live" | "demo" }>("/api/status"),
  plan: (brief: string) => json<PlanSpec>("/api/ai/plan", { brief }),
  analyze: (graph: Graph) => json<Analysis>("/api/ai/analyze", { graph }),
  asset: (graph: Graph, nodeId: string, kind: AssetKind, instructions: string, onText: (t: string) => void, signal?: AbortSignal) =>
    stream("/api/ai/asset", { graph, nodeId, kind, instructions }, onText, signal),
  chat: (graph: Graph, history: { role: string; content: string }[], onText: (t: string) => void, signal?: AbortSignal) =>
    stream("/api/ai/chat", { graph, history }, onText, signal),

  adPack: (graph: Graph, nodeId: string, finalUrl: string, instructions?: string) =>
    json<AdPack>("/api/ai/adpack", { graph, nodeId, finalUrl, instructions }),

  boards: () => json<BoardSummary[]>("/api/boards"),
  createBoard: (b: Partial<BoardRecord> = {}) => json<BoardRecord>("/api/boards", b),
  getBoard: (id: string) => json<BoardRecord>(`/api/boards/${id}`),
  saveBoard: (id: string, body: Record<string, unknown>) => json<{ updatedAt: number }>(`/api/boards/${id}`, body, "PUT"),
  boardMeta: (id: string) => json<{ updatedAt: number; comments: number }>(`/api/boards/${id}/meta`),
  deleteBoard: (id: string) => json(`/api/boards/${id}`, undefined, "DELETE"),
  duplicateBoard: (id: string) => json<BoardRecord>(`/api/boards/${id}/duplicate`, {}),
  presence: (id: string, clientId: string, name: string) => json<{ others: string[] }>(`/api/boards/${id}/presence`, { clientId, name }),
  share: (id: string, enabled: boolean) => json<{ shareToken: string | null }>(`/api/boards/${id}/share`, { enabled }),
  shared: (token: string) => json<BoardRecord>(`/api/shared/${token}`),
  comments: (id: string) => json<Comment[]>(`/api/boards/${id}/comments`),
  addComment: (target: { boardId?: string | null; shareToken?: string | null }, c: { nodeId: string | null; author: string; text: string }) =>
    json<Comment>(target.shareToken ? `/api/shared/${target.shareToken}/comments` : `/api/boards/${target.boardId}/comments`, c),
  resolveComment: (id: string, cid: string, resolved: boolean) => json<Comment>(`/api/boards/${id}/comments/${cid}`, { resolved }, "PATCH"),
  deleteComment: (id: string, cid: string) => json(`/api/boards/${id}/comments/${cid}`, undefined, "DELETE"),
  getSchedule: async (id: string) => ((await json<BoardRecord & { schedule: Schedule | null }>(`/api/boards/${id}`)).schedule),
  setSchedule: (id: string, s: Schedule) => json<Schedule>(`/api/boards/${id}/schedule`, s, "PUT"),
  previewReport: (id: string) => json<{ text: string; alerts: unknown[] }>(`/api/boards/${id}/report`),
  sendReport: (id: string) => json<{ text: string; failed: string[] }>(`/api/boards/${id}/report/send`, {}),
  deleteAllData: () => json("/api/privacy/data", undefined, "DELETE"),

  integrations: () => json<IntegrationInfo[]>("/api/integrations"),
  connect: (type: string, creds: Record<string, string>) => json(`/api/integrations/${type}/connect`, creds),
  disconnect: (type: string) => json(`/api/integrations/${type}/disconnect`, {}),
  notify: (type: string, text: string) => json(`/api/integrations/${type}/notify`, { text }),
  sync: (graph: Graph) => json<{ actuals: Record<string, Actuals>; sources: string[]; sample: boolean }>("/api/integrations/sync", { graph }),
};

export interface BoardSummary {
  id: string;
  name: string;
  updatedAt: number;
  createdAt: number;
  nodeCount: number;
  shared: boolean;
}

export interface Schedule {
  enabled: boolean;
  frequency: "daily" | "weekly";
  hour: number;
  weekday: number;
  channels: string[];
  syncFirst: boolean;
  lastSentAt?: number;
}
