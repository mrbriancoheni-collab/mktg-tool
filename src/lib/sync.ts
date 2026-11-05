// Keeps the open board in sync with the server: loads it, autosaves edits,
// detects conflicting saves, refreshes when someone else saves, and reports
// presence ("who else is here").

import { useEffect } from "react";
import { api, ApiError } from "./api";
import { LEGACY_KEY, toGraph, useStore, type BoardRecord } from "./store";

const BOARD_KEY = "adcanvas-current-board";
const NAME_KEY = "adcanvas-user-name";
const CLIENT_KEY = "adcanvas-client-id";

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

export const userName = () => ls.get(NAME_KEY) ?? "";
export const setUserName = (n: string) => ls.set(NAME_KEY, n.trim().slice(0, 60));
const clientId = () => {
  let id = ls.get(CLIENT_KEY);
  if (!id) {
    id = Math.random().toString(36).slice(2, 12);
    ls.set(CLIENT_KEY, id);
  }
  return id;
};

/** What gets saved — compared as a string so selection/drag noise doesn't trigger saves. */
function snapshot() {
  const s = useStore.getState();
  return JSON.stringify({ name: s.name, goal: s.goal, summary: s.summary, graph: toGraph(s), analysis: s.analysis });
}

let lastSaved = "";
let saving = false;

export function markLoaded() {
  lastSaved = snapshot();
}

export async function openBoard(id: string) {
  const b = await api.getBoard(id);
  useStore.getState().loadBoard(b);
  markLoaded();
  ls.set(BOARD_KEY, b.id);
  const url = new URL(location.href);
  url.searchParams.set("board", b.id);
  url.searchParams.delete("share");
  history.replaceState(null, "", url);
  return b;
}

export async function newBoard(init: Partial<BoardRecord> = {}) {
  const b = await api.createBoard(init);
  return openBoard(b.id);
}

export async function saveNow(force = false) {
  const s = useStore.getState();
  if (!s.boardId || s.readOnly || saving) return;
  const snap = snapshot();
  if (snap === lastSaved && !force) return;
  saving = true;
  s.setSync({ saveState: "saving" });
  try {
    const { updatedAt } = await api.saveBoard(s.boardId, { ...JSON.parse(snap), baseUpdatedAt: s.baseUpdatedAt, force });
    lastSaved = snap;
    useStore.getState().setSync({ saveState: "saved", baseUpdatedAt: updatedAt, conflict: null });
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      useStore.getState().setSync({ saveState: "conflict", conflict: e.data.board as BoardRecord });
    } else {
      useStore.getState().setSync({ saveState: e instanceof ApiError ? "error" : "offline" });
    }
  } finally {
    saving = false;
  }
}

/** Resolve a save conflict: keep mine (overwrite) or take theirs. */
export async function resolveConflict(keep: "mine" | "theirs") {
  const s = useStore.getState();
  if (keep === "mine") await saveNow(true);
  else if (s.conflict) {
    s.loadBoard(s.conflict);
    markLoaded();
  }
}

// Shared across React StrictMode's double-mount so a first visit creates only one board.
let initialLoadPromise: Promise<void> | null = null;
const initialLoad = () => (initialLoadPromise ??= doInitialLoad());

async function doInitialLoad() {
  const params = new URLSearchParams(location.search);
  const share = params.get("share");
  if (share) {
    const b = await api.shared(share);
    useStore.getState().loadBoard(b, { readOnly: true, shareToken: share });
    return;
  }
  const wanted = params.get("board") ?? ls.get(BOARD_KEY);
  if (wanted) {
    try {
      await openBoard(wanted);
      return;
    } catch {
      /* fall through: board deleted or unknown */
    }
  }
  // Migrate the single board from the first version, if present.
  const legacy = ls.get(LEGACY_KEY);
  if (legacy) {
    try {
      const st = JSON.parse(legacy).state;
      if (st?.nodes?.length) {
        await newBoard({ name: st.name, goal: st.goal, summary: st.summary, analysis: st.analysis, graph: toGraph(st) });
        ls.del(LEGACY_KEY);
        return;
      }
    } catch {
      /* ignore corrupt legacy data */
    }
    ls.del(LEGACY_KEY);
  }
  const boards = await api.boards();
  if (boards.length) await openBoard(boards[0].id);
  else await newBoard();
}

/** Mount once at the app root. */
export function useBoardSync(onError: (msg: string) => void) {
  useEffect(() => {
    initialLoad().catch((e) => {
      onError(`Couldn't load board: ${(e as Error).message}`);
      useStore.getState().setSync({ saveState: "offline" });
    });

    // Debounced autosave on content changes.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useStore.subscribe((s, prev) => {
      if (s.readOnly || !s.boardId) return;
      if (s.nodes === prev.nodes && s.edges === prev.edges && s.name === prev.name && s.goal === prev.goal && s.summary === prev.summary && s.analysis === prev.analysis) return;
      clearTimeout(timer);
      timer = setTimeout(() => saveNow(), 800);
    });

    // Presence + live refresh when someone else saves (and we have no unsaved edits).
    const poll = async () => {
      const s = useStore.getState();
      if (!s.boardId || document.hidden) return;
      try {
        if (s.readOnly && s.shareToken) {
          const b = await api.shared(s.shareToken);
          if (b.updatedAt > s.baseUpdatedAt || b.comments.length !== s.comments.length) s.loadBoard(b, { readOnly: true, shareToken: s.shareToken });
          return;
        }
        const [{ others }, meta] = await Promise.all([api.presence(s.boardId, clientId(), userName()), api.boardMeta(s.boardId)]);
        s.setSync({ others });
        const unsaved = snapshot() !== lastSaved;
        if (meta.updatedAt > s.baseUpdatedAt && !unsaved && !saving) {
          const b = await api.getBoard(s.boardId);
          const keep = { view: s.view, panel: s.panel };
          s.loadBoard(b);
          useStore.setState(keep);
          markLoaded();
        } else if (meta.comments !== s.comments.length) {
          s.setSync({ comments: await api.comments(s.boardId) });
        }
        if (s.saveState === "offline") s.setSync({ saveState: "saved" });
      } catch {
        /* transient; next poll retries */
      }
    };
    const interval = setInterval(poll, 8000);
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (snapshot() !== lastSaved && !useStore.getState().readOnly) {
        saveNow();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      unsub();
      clearInterval(interval);
      clearTimeout(timer);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [onError]);
}
