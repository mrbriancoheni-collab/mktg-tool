// In-app confirmation dialogs (replace window.confirm / prompt).
import { useEffect, useState } from "react";
import { create } from "zustand";

interface Req {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  /** Require typing this text to enable the confirm button. */
  typeToConfirm?: string;
  resolve: (ok: boolean) => void;
}

const useConfirm = create<{ req: Req | null; set: (r: Req | null) => void }>((set) => ({ req: null, set: (req) => set({ req }) }));

export function confirmDialog(title: string, opts: Omit<Req, "title" | "resolve"> = {}): Promise<boolean> {
  return new Promise((resolve) => useConfirm.getState().set({ title, ...opts, resolve }));
}

export function ConfirmHost() {
  const req = useConfirm((s) => s.req);
  const set = useConfirm((s) => s.set);
  const [typed, setTyped] = useState("");
  useEffect(() => {
    setTyped("");
  }, [req]);
  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && done(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  if (!req) return null;
  const done = (ok: boolean) => {
    req.resolve(ok);
    set(null);
  };
  const blocked = !!req.typeToConfirm && typed !== req.typeToConfirm;
  return (
    <div className="modal-backdrop confirm-backdrop" onMouseDown={(e) => e.target === e.currentTarget && done(false)}>
      <div className="modal confirm" role="alertdialog" aria-label={req.title}>
        <h2>{req.title}</h2>
        {req.message && <p className="muted">{req.message}</p>}
        {req.typeToConfirm && (
          <label className="field">
            <span>
              Type <b>{req.typeToConfirm}</b> to confirm
            </span>
            <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} />
          </label>
        )}
        <footer className="row">
          <div className="spacer" />
          <button className="btn" onClick={() => done(false)}>
            Cancel
          </button>
          <button className={`btn ${req.danger ? "danger-solid" : "primary"}`} disabled={blocked} autoFocus={!req.typeToConfirm} onClick={() => done(true)}>
            {req.confirmLabel ?? "Confirm"}
          </button>
        </footer>
      </div>
    </div>
  );
}
