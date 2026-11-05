import type { AdPack } from "../../shared/adpack";
import type { AssetKind } from "../../shared/catalog";
import type { Actuals, Graph, PlanSpec } from "../../shared/model";
import type { Op } from "../../shared/ops";
import type { PlanId, Role } from "../../shared/plans";
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
  oauth: "google" | "meta" | "linkedin" | "tiktok" | null;
  oauthConfigured: boolean | null;
  fields: { key: string; label: string; secret?: boolean; placeholder?: string }[];
  canNotify: boolean;
  canSync: boolean;
  connected: boolean;
  account: string | null;
  needsAccount: boolean;
}

export interface Me {
  user: { id: string; email: string; name: string; mfaEnabled?: boolean; hasPassword?: boolean; googleLinked?: boolean };
  workspace: { id: string; name: string; plan: PlanId; subscriptionStatus: string | null; branding: Branding | null };
  role: Role;
  workspaces: { id: string; name: string; role: Role }[];
  billingEnabled: boolean;
  usage: { ai: number; aiLimit: number | null; boards: number; boardLimit: number | null; members: number; memberLimit: number | null };
  features: { scheduledReports: boolean; liveConnectors: boolean };
}

export interface Branding {
  name?: string;
  color?: string;
  logo?: string;
  hidePoweredBy?: boolean;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public data: Record<string, unknown>) {
    super(message);
  }
}

/** Fired when the server says the session is gone, so the app can show the login page. */
export const onUnauthorized = new EventTarget();

async function json<T>(url: string, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(url, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.startsWith("/api/auth/")) onUnauthorized.dispatchEvent(new Event("401"));
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status, data);
  return data as T;
}

/** POSTs and calls `onText` with the accumulated text as the stream arrives. */
async function stream(url: string, body: unknown, onText: (full: string) => void, signal?: AbortSignal) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status, data);
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
  status: () => json<{ ai: "live" | "demo"; billingEnabled: boolean; googleLogin: boolean; marketingUrl: string | null; oauth: Record<string, boolean> }>("/api/status"),

  // Auth & account
  me: () => json<Me>("/api/auth/me"),
  signup: (b: { name: string; email: string; password: string; workspaceName?: string; acceptTerms: boolean; invite?: string }) => json("/api/auth/signup", b),
  login: (b: { email: string; password: string; invite?: string }) => json<{ ok: boolean; mfaRequired?: boolean }>("/api/auth/login", b),
  mfa: (code: string) => json("/api/auth/mfa", { code }),
  mfaSetup: () => json<{ secret: string; otpauth: string }>("/api/account/mfa/setup", {}),
  mfaEnable: (code: string) => json<{ recoveryCodes: string[] }>("/api/account/mfa/enable", { code }),
  mfaDisable: (b: { password?: string; code?: string }) => json("/api/account/mfa/disable", b),
  logout: () => json("/api/auth/logout", {}),
  forgot: (email: string) => json("/api/auth/forgot", { email }),
  reset: (token: string, password: string) => json("/api/auth/reset", { token, password }),
  switchWorkspace: (workspaceId: string) => json("/api/auth/switch", { workspaceId }),
  updateAccount: (b: { name?: string; currentPassword?: string; newPassword?: string }) => json("/api/account", b, "PATCH"),
  deleteAccount: (password: string) => json("/api/account", { password }, "DELETE"),
  createWorkspace: (name: string) => json<{ id: string }>("/api/workspaces", { name }),
  renameWorkspace: (name: string) => json("/api/workspace", { name }, "PATCH"),
  setBranding: (b: Branding) => json<Branding>("/api/workspace/branding", b, "PUT"),
  deleteWorkspace: (confirm: string) => json("/api/workspace", { confirm }, "DELETE"),
  members: () => json<{ members: Member[]; invites: { id: string; email: string; role: Role; expires_at: string }[] }>("/api/workspace/members"),
  setRole: (userId: string, role: Role) => json(`/api/workspace/members/${userId}`, { role }, "PATCH"),
  removeMember: (userId: string) => json(`/api/workspace/members/${userId}`, undefined, "DELETE"),
  invite: (email: string, role: Role) => json<{ url: string; emailed: boolean }>("/api/workspace/invites", { email, role }),
  revokeInvite: (id: string) => json(`/api/workspace/invites/${encodeURIComponent(id)}`, undefined, "DELETE"),
  getInvite: (token: string) => json<{ workspace: string; inviter: string | null; email: string; role: Role }>(`/api/invites/${token}`),
  acceptInvite: (token: string) => json(`/api/invites/${token}/accept`, {}),
  audit: () => json<{ action: string; target: string | null; email: string | null; ip: string | null; created_at: string; meta: unknown }[]>("/api/workspace/audit"),

  // Billing
  checkout: (plan: PlanId) => json<{ url: string }>("/api/billing/checkout", { plan }),
  portal: () => json<{ url: string }>("/api/billing/portal", {}),

  // AI
  plan: (brief: string) => json<PlanSpec>("/api/ai/plan", { brief }),
  analyze: (graph: Graph) => json<Analysis>("/api/ai/analyze", { graph }),
  asset: (graph: Graph, nodeId: string, kind: AssetKind, instructions: string, onText: (t: string) => void, signal?: AbortSignal) =>
    stream("/api/ai/asset", { graph, nodeId, kind, instructions }, onText, signal),
  chat: (graph: Graph, history: { role: string; content: string }[], onText: (t: string) => void, signal?: AbortSignal) => stream("/api/ai/chat", { graph, history }, onText, signal),
  /** Streams assistant events (NDJSON): text deltas, then optional proposed changes. */
  assistant: async (graph: Graph, history: { role: string; content: string }[], onEvent: (ev: AssistantEvent) => void, signal?: AbortSignal) => {
    const res = await fetch("/api/ai/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ graph, history }), signal });
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => ({}));
      throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status, data);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) onEvent(JSON.parse(line));
      }
    }
  },
  adPack: (graph: Graph, nodeId: string, finalUrl: string, instructions?: string) => json<AdPack>("/api/ai/adpack", { graph, nodeId, finalUrl, instructions }),

  // Boards & collaboration
  boards: () => json<BoardSummary[]>("/api/boards"),
  createBoard: (b: Partial<BoardRecord> = {}) => json<BoardRecord>("/api/boards", b),
  getBoard: (id: string) => json<BoardRecord & { shareToken: string | null; schedule: Schedule | null }>(`/api/boards/${id}`),
  ops: (id: string, clientId: string, ops: Op[]) => json<{ version: number }>(`/api/boards/${id}/ops`, { clientId, ops }),
  deleteBoard: (id: string) => json(`/api/boards/${id}`, undefined, "DELETE"),
  duplicateBoard: (id: string) => json<BoardRecord>(`/api/boards/${id}/duplicate`, {}),
  share: (id: string, enabled: boolean) => json<{ shareToken: string | null }>(`/api/boards/${id}/share`, { enabled }),
  shared: (token: string) => json<BoardRecord & { branding: Branding | null }>(`/api/shared/${token}`),
  comments: (id: string) => json<Comment[]>(`/api/boards/${id}/comments`),
  addComment: (target: { boardId?: string | null; shareToken?: string | null }, c: { nodeId: string | null; author: string; text: string }) =>
    json<Comment>(target.shareToken ? `/api/shared/${target.shareToken}/comments` : `/api/boards/${target.boardId}/comments`, c),
  resolveComment: (id: string, cid: string, resolved: boolean) => json<Comment>(`/api/boards/${id}/comments/${cid}`, { resolved }, "PATCH"),
  deleteComment: (id: string, cid: string) => json(`/api/boards/${id}/comments/${cid}`, undefined, "DELETE"),
  getSchedule: async (id: string) => (await api.getBoard(id)).schedule,
  setSchedule: (id: string, s: Schedule) => json<Schedule>(`/api/boards/${id}/schedule`, s, "PUT"),
  previewReport: (id: string) => json<{ text: string; alerts: unknown[] }>(`/api/boards/${id}/report`),
  sendReport: (id: string) => json<{ text: string; failed: string[] }>(`/api/boards/${id}/report/send`, {}),
  deleteAllData: () => json("/api/privacy/data", undefined, "DELETE"),

  // Integrations
  integrations: () => json<IntegrationInfo[]>("/api/integrations"),
  connect: (type: string, creds: Record<string, string>) => json(`/api/integrations/${type}/connect`, creds),
  disconnect: (type: string) => json(`/api/integrations/${type}/disconnect`, {}),
  notify: (type: string, text: string) => json(`/api/integrations/${type}/notify`, { text }),
  sync: (graph: Graph, boardId?: string | null) =>
    json<{ actuals: Record<string, Actuals>; sources: string[]; sample: boolean; errors: string[] }>("/api/integrations/sync", { graph, boardId }),
  metrics: (boardId: string, from: string, to: string) => json<Metrics>(`/api/boards/${boardId}/metrics?from=${from}&to=${to}`),
  sampleMetrics: (boardId: string) => json(`/api/boards/${boardId}/metrics/sample`, {}),
  importMetrics: (boardId: string, rows: ({ nodeId: string; day: string } & Actuals)[]) => json(`/api/boards/${boardId}/metrics`, { rows }),
  accounts: (type: string) => json<{ id: string; name: string }[]>(`/api/integrations/${type}/accounts`),
  setAccount: (type: string, id: string, loginCustomerId?: string) => json(`/api/integrations/${type}/account`, { id, loginCustomerId }),
  campaigns: (type: string) => json<{ id: string; name: string; status: string; channel: string }[]>(`/api/integrations/${type}/campaigns`),
  automatch: (boardId: string) =>
    json<{ connector: string; suggestions: { nodeId: string; connector: string; campaigns: { id: string; name: string; score: number }[] }[]; error?: string }[]>(`/api/boards/${boardId}/automatch`, {}),
  metaPages: () => json<{ id: string; name: string }[]>("/api/integrations/meta_ads_mgr/pages"),
  publish: (b: { pack: AdPack; target: "google_ads_mgr" | "meta_ads_mgr"; campaignId?: string; pageId?: string }) => json<{ created: string[]; note: string }>("/api/publish", b),
  // Versions, experiments, notifications, mockups
  versions: (boardId: string) => json<{ id: string; label: string; createdAt: number; by: string; nodes: number }[]>(`/api/boards/${boardId}/versions`),
  saveVersion: (boardId: string, label: string) => json(`/api/boards/${boardId}/versions`, { label }),
  getVersion: (boardId: string, vid: string) => json<{ name: string; goal: string; summary: string; graph: Graph; analysis: Analysis | null }>(`/api/boards/${boardId}/versions/${vid}`),
  experiments: (boardId: string) => json<Experiment[]>(`/api/boards/${boardId}/experiments`),
  createExperiment: (boardId: string, e: { hypothesis: string; nodeId?: string | null; metric?: string; variants?: { name: string }[] }) => json<Experiment>(`/api/boards/${boardId}/experiments`, e),
  updateExperiment: (boardId: string, id: string, patch: Partial<Pick<Experiment, "status" | "variants" | "result" | "hypothesis">>) => json<Experiment>(`/api/boards/${boardId}/experiments/${id}`, patch, "PATCH"),
  deleteExperiment: (boardId: string, id: string) => json(`/api/boards/${boardId}/experiments/${id}`, undefined, "DELETE"),
  notifications: () => json<{ unread: number; items: { id: string; kind: string; title: string; body: string | null; link: string | null; read: boolean; createdAt: number }[] }>("/api/notifications"),
  markRead: (ids?: string[]) => json("/api/notifications/read", { ids }),
  mockups: (graph: Graph, nodeId: string) => json<{ variants: Mockup[] }>("/api/ai/mockups", { graph, nodeId }),
  oauthStartUrl: (type: string) => `/api/oauth/start?type=${encodeURIComponent(type)}`,
};

export interface MetricTotals {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
}
export interface Metrics {
  from: string;
  to: string;
  days: (MetricTotals & { day: string })[];
  byNode: (MetricTotals & { nodeId: string })[];
  totals: MetricTotals;
  previous: MetricTotals;
  available: { first: string | null; last: string | null; sources: string[] | null };
}

export type AssistantEvent =
  | { type: "text"; delta: string }
  | { type: "changes"; summary: string; ops: unknown[]; described: string[]; warnings: string[] }
  | { type: "error"; message: string };

export interface Experiment {
  id: string;
  nodeId: string | null;
  hypothesis: string;
  variants: { name: string; visitors: number; conversions: number }[];
  metric: string;
  status: "planned" | "running" | "won" | "lost" | "inconclusive";
  result: string | null;
  startedAt: number | null;
  endedAt: number | null;
  createdAt: number;
}

export interface Mockup {
  layout: "bold-type" | "split-image" | "testimonial" | "offer-badge";
  headline: string;
  primary: string;
  cta: string;
  badge: string | null;
  quote: string | null;
  bg: string;
  fg: string;
  accent: string;
  imagePrompt: string;
}

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
