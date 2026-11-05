import { useEffect, useRef, useState } from "react";
import { BellRing, Building2, Plug, ChevronDown, Copy, CreditCard, FilePlus2, LayoutDashboard, Link2, Settings, ShieldCheck, Trash2, Users } from "lucide-react";
import { roleAtLeast } from "../../shared/plans";
import { api, type BoardSummary } from "../lib/api";
import { useStore } from "../lib/store";
import { newBoard, openBoard, saveNow } from "../lib/sync";
import { confirmDialog } from "./Confirm";

export type Dialog = "share" | "reports" | "privacy" | null;

const ago = (t: number) => {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(t).toLocaleDateString();
};

export function BoardMenu({ onDialog, onError, onSettings }: { onDialog: (d: Dialog) => void; onError: (m: string) => void; onSettings: (t: "account" | "members" | "integrations" | "billing") => void }) {
  const [open, setOpen] = useState(false);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const boardId = useStore((s) => s.boardId);
  const me = useStore((s) => s.me);
  const canEdit = !!me && roleAtLeast(me.role, "member");
  const isAdmin = !!me && roleAtLeast(me.role, "admin");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    saveNow().then(() => api.boards().then(setBoards).catch(() => {}));
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const run = (fn: () => Promise<unknown>) => async () => {
    setOpen(false);
    try {
      await saveNow();
      await fn();
    } catch (e) {
      onError((e as Error).message);
    }
  };

  return (
    <div className="board-menu" ref={ref}>
      <button className="icon-btn wide" onClick={() => setOpen(!open)} title="Boards" aria-expanded={open}>
        <LayoutDashboard size={16} /> <ChevronDown size={14} />
      </button>
      {open && (
        <div className="dropdown">
          <div className="dropdown-label">Boards</div>
          <div className="board-list">
            {boards.map((b) => (
              <button key={b.id} className={`board-item ${b.id === boardId ? "current" : ""}`} onClick={run(() => openBoard(b.id))}>
                <b>{b.name}</b>
                <span>
                  {b.nodeCount} elements · {ago(b.updatedAt)}
                  {b.shared && " · shared"}
                </span>
              </button>
            ))}
          </div>
          <hr />
          {canEdit && <button className="menu-item" onClick={run(() => newBoard())}>
            <FilePlus2 size={15} /> New board
          </button>}
          {canEdit && <button className="menu-item" onClick={run(async () => boardId && openBoard((await api.duplicateBoard(boardId)).id))}>
            <Copy size={15} /> Duplicate this board
          </button>}
          {canEdit && <button className="menu-item" onClick={() => (setOpen(false), onDialog("share"))}>
            <Link2 size={15} /> Share…
          </button>}
          {canEdit && <button className="menu-item" onClick={() => (setOpen(false), onDialog("reports"))}>
            <BellRing size={15} /> Reports & alerts…
          </button>}
          {isAdmin && <button className="menu-item" onClick={() => (setOpen(false), onDialog("privacy"))}>
            <ShieldCheck size={15} /> Privacy & data…
          </button>}
          <hr />
          <div className="dropdown-label">Workspace</div>
          {me?.workspaces.map((w) => (
            <button
              key={w.id}
              className={`menu-item ${w.id === me.workspace.id ? "current" : ""}`}
              onClick={run(async () => {
                if (w.id === me.workspace.id) return;
                await api.switchWorkspace(w.id);
                localStorage.removeItem("adcanvas-current-board");
                location.href = "/";
              })}
            >
              <Building2 size={15} /> {w.name} <span className="muted small">{w.role}</span>
            </button>
          ))}
          <button className="menu-item" onClick={() => (setOpen(false), onSettings("members"))}>
            <Users size={15} /> Members & invites
          </button>
          <button className="menu-item" onClick={() => (setOpen(false), onSettings("integrations"))}>
            <Plug size={15} /> Integrations
          </button>
          <button className="menu-item" onClick={() => (setOpen(false), onSettings("billing"))}>
            <CreditCard size={15} /> Plan & usage
          </button>
          <button className="menu-item" onClick={() => (setOpen(false), onSettings("account"))}>
            <Settings size={15} /> Settings
          </button>
          {canEdit && <hr />}
          {canEdit && <button
            className="menu-item danger"
            onClick={run(async () => {
              if (!boardId || !(await confirmDialog("Delete this board?", { message: "The board, its comments and AI assets will be permanently deleted for everyone.", confirmLabel: "Delete board", danger: true }))) return;
              await api.deleteBoard(boardId);
              const rest = (await api.boards()).filter((b) => b.id !== boardId);
              if (rest.length) await openBoard(rest[0].id);
              else await newBoard();
            })}
          >
            <Trash2 size={15} /> Delete board
          </button>}
        </div>
      )}
    </div>
  );
}
