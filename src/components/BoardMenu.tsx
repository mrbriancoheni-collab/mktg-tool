import { useEffect, useRef, useState } from "react";
import { BellRing, ChevronDown, Copy, FilePlus2, LayoutDashboard, Link2, ShieldCheck, Trash2 } from "lucide-react";
import { api, type BoardSummary } from "../lib/api";
import { useStore } from "../lib/store";
import { newBoard, openBoard, saveNow } from "../lib/sync";

export type Dialog = "share" | "reports" | "privacy" | null;

const ago = (t: number) => {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(t).toLocaleDateString();
};

export function BoardMenu({ onDialog, onError }: { onDialog: (d: Dialog) => void; onError: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const boardId = useStore((s) => s.boardId);
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
          <button className="menu-item" onClick={run(() => newBoard())}>
            <FilePlus2 size={15} /> New board
          </button>
          <button className="menu-item" onClick={run(async () => boardId && openBoard((await api.duplicateBoard(boardId)).id))}>
            <Copy size={15} /> Duplicate this board
          </button>
          <button className="menu-item" onClick={() => (setOpen(false), onDialog("share"))}>
            <Link2 size={15} /> Share…
          </button>
          <button className="menu-item" onClick={() => (setOpen(false), onDialog("reports"))}>
            <BellRing size={15} /> Reports & alerts…
          </button>
          <button className="menu-item" onClick={() => (setOpen(false), onDialog("privacy"))}>
            <ShieldCheck size={15} /> Privacy & data…
          </button>
          <hr />
          <button
            className="menu-item danger"
            onClick={run(async () => {
              if (!boardId || !confirm("Delete this board permanently? This can't be undone.")) return;
              await api.deleteBoard(boardId);
              const rest = (await api.boards()).filter((b) => b.id !== boardId);
              if (rest.length) await openBoard(rest[0].id);
              else await newBoard();
            })}
          >
            <Trash2 size={15} /> Delete board
          </button>
        </div>
      )}
    </div>
  );
}
