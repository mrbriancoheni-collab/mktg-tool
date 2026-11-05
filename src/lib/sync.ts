// Real-time board sync. Local edits are diffed into element-level ops and
// sent to the server (throttled); edits from others arrive over Server-Sent
// Events and are merged into the canvas. Presence and comments ride the same
// stream.

import { useEffect } from "react";
import { applyOps, diffStates, type BoardState, type Op } from "../../shared/ops";
import { api, ApiError } from "./api";
import { LEGACY_KEY, toGraph, useStore, type BoardRecord, type Comment, type Person } from "./store";

const BOARD_KEY = "adcanvas-current-board";
const NAME_KEY = "adcanvas-user-name";

const ls = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage unavailable */
    }
  },
  del: (k: string) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* storage unavailable */
    }
  },
};

export const userName = () => useStore.getState().me?.user.name || ls.get(NAME_KEY) || "";
export const setUserName = (n: string) => ls.set(NAME_KEY, n.trim().slice(0, 60));

const clientId = Math.random().toString(36).slice(2, 12);
let synced: BoardState | null = null;
let inflight = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let events: EventSource | null = null;
let notify: (msg: string) => void = () => {};

function current(): BoardState {
  const s = useStore.getState();
  const g = toGraph(s);
  return { name: s.name, goal: s.goal, summary: s.summary, analysis: s.analysis, nodes: g.nodes, edges: g.edges };
}

const pending = () => !!synced && diffStates(synced, current()).length > 0;

function schedule(delay = 200) {
  if (!timer) timer = setTimeout(() => ((timer = undefined), flush()), delay);
}

/** Sends local changes to the server. */
export async function flush() {
  const s = useStore.getState();
  if (s.readOnly || !s.boardId || !synced || inflight) return;
  const cur = current();
  const ops = diffStates(synced, cur);
  if (!ops.length) return;
  inflight = true;
  s.setSync({ saveState: "saving" });
  try {
    const { version } = await api.ops(s.boardId, clientId, ops);
    synced = cur;
    useStore.getState().setSync({ version, saveState: "saved" });
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 0;
    useStore.getState().setSync({ saveState: status && status < 500 ? "error" : "offline" });
    if (status === 403) notify("You have view-only access to this board.");
    else if (status === 404) notify("This board no longer exists.");
    else setTimeout(() => schedule(0), 3000); // retry when offline / server error
  } finally {
    inflight = false;
    if (pending()) schedule();
  }
}
export const saveNow = flush;

function loadInto(b: BoardRecord, opts: { readOnly?: boolean; shareToken?: string | null } = {}) {
  const keep = { view: useStore.getState().view, panel: useStore.getState().panel };
  const sameBoard = useStore.getState().boardId === b.id;
  useStore.getState().loadBoard(b, opts);
  if (sameBoard) useStore.setState(keep);
  synced = current();
}

function connect(url: string) {
  events?.close();
  const es = new EventSource(url);
  events = es;
  const on = <T,>(name: string, fn: (d: T) => void) => es.addEventListener(name, (e) => fn(JSON.parse((e as MessageEvent).data)));

  on<{ version: number }>("hello", async ({ version }) => {
    if (version > useStore.getState().version && !pending()) await reload();
  });
  on<{ ops: Op[]; version: number; clientId: string }>("ops", (d) => {
    if (d.clientId === clientId) return;
    useStore.getState().applyRemoteOps(d.ops);
    if (synced) synced = applyOps(synced, d.ops);
    useStore.getState().setSync({ version: Math.max(d.version, useStore.getState().version) });
  });
  on<Person[]>("presence", (others) => useStore.getState().setSync({ others }));
  on<{ comments: Comment[] }>("comments", ({ comments }) => useStore.getState().setSync({ comments }));
  on("comments-changed", async () => {
    const s = useStore.getState();
    if (s.boardId && !s.shareToken) s.setSync({ comments: await api.comments(s.boardId) });
    else await reload();
  });
  on("resync", async () => {
    await flush();
    await reload();
  });
  on<{ reason: string }>("closed", ({ reason }) => {
    es.close();
    notify(reason);
  });
  es.onerror = () => useStore.getState().setSync({ saveState: navigator.onLine ? useStore.getState().saveState : "offline" });
}

async function reload() {
  const s = useStore.getState();
  if (s.shareToken) loadInto(await api.shared(s.shareToken), { readOnly: true, shareToken: s.shareToken });
  else if (s.boardId) loadInto(await api.getBoard(s.boardId), { readOnly: s.readOnly });
}

export async function openBoard(id: string) {
  await flush();
  const b = await api.getBoard(id);
  const viewer = useStore.getState().me?.role === "viewer";
  loadInto(b, { readOnly: viewer });
  ls.set(BOARD_KEY, b.id);
  const url = new URL(location.href);
  url.searchParams.set("board", b.id);
  for (const k of ["share", "connected", "oauth_error", "billing"]) url.searchParams.delete(k);
  history.replaceState(null, "", url);
  connect(`/api/boards/${b.id}/events?clientId=${clientId}`);
  return b;
}

export async function newBoard(init: Partial<BoardRecord> = {}) {
  const b = await api.createBoard(init);
  return openBoard(b.id);
}

export async function openShared(token: string) {
  const b = await api.shared(token);
  useStore.getState().setSync({ shareBranding: b.branding ?? null });
  loadInto(b, { readOnly: true, shareToken: token });
  connect(`/api/shared/${token}/events?clientId=${clientId}&name=${encodeURIComponent(userName() || "Guest")}`);
}

let initial: Promise<void> | null = null;

async function initialLoad() {
  const params = new URLSearchParams(location.search);
  const share = params.get("share");
  if (share) return openShared(share);
  const wanted = params.get("board") ?? ls.get(BOARD_KEY);
  if (wanted) {
    try {
      await openBoard(wanted);
      return;
    } catch {
      /* board deleted or belongs to another workspace */
    }
  }
  // Migrate a board saved by the first, browser-only version.
  const legacy = ls.get(LEGACY_KEY);
  if (legacy) {
    ls.del(LEGACY_KEY);
    try {
      const st = JSON.parse(legacy).state;
      if (st?.nodes?.length && useStore.getState().me?.role !== "viewer") {
        await newBoard({ name: st.name, goal: st.goal, summary: st.summary, analysis: st.analysis, graph: toGraph(st) });
        return;
      }
    } catch {
      /* ignore corrupt legacy data */
    }
  }
  const boards = await api.boards();
  if (boards.length) await openBoard(boards[0].id);
  else if (useStore.getState().me?.role !== "viewer") await newBoard();
}

/** Mount once at the app root. */
export function useBoardSync(onMessage: (msg: string) => void) {
  useEffect(() => {
    notify = onMessage;
    (initial ??= initialLoad()).catch((e) => {
      onMessage(`Couldn't load board: ${(e as Error).message}`);
      useStore.getState().setSync({ saveState: "offline" });
    });
    const unsub = useStore.subscribe((s, prev) => {
      if (s.readOnly || !s.boardId) return;
      if (s.nodes === prev.nodes && s.edges === prev.edges && s.name === prev.name && s.goal === prev.goal && s.summary === prev.summary && s.analysis === prev.analysis) return;
      if (pending()) schedule();
    });
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (pending()) {
        flush();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      unsub();
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [onMessage]);
}
