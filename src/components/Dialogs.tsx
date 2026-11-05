import { useEffect, useState } from "react";
import { BellRing, Check, Copy, Download, Link2, Send, ShieldCheck, Trash2, X } from "lucide-react";
import { api, type IntegrationInfo, type Schedule } from "../lib/api";
import { useStore } from "../lib/store";
import { newBoard } from "../lib/sync";
import { Markdown } from "./Markdown";
import { confirmDialog } from "./Confirm";
import { track } from "../lib/track";

function Modal({ title, icon, onClose, children }: { title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title}>
        <header>
          <h2>
            {icon} {title}
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function ShareDialog({ onClose }: { onClose: () => void }) {
  const boardId = useStore((s) => s.boardId)!;
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getBoard(boardId).then((b) => setToken((b as unknown as { shareToken: string | null }).shareToken));
  }, [boardId]);

  const url = token ? `${location.origin}/?share=${token}` : "";
  const toggle = async (enabled: boolean) => {
    setBusy(true);
    setToken((await api.share(boardId, enabled)).shareToken);
    if (enabled) track("shared", { via: "link" });
    setBusy(false);
  };

  return (
    <Modal title="Share board" icon={<Link2 size={18} />} onClose={onClose}>
      <p className="muted">
        Anyone with the link can <b>view</b> this board and <b>leave comments</b>. They can't edit it or see your integrations. Turning the link off revokes access immediately.
      </p>
      {token === undefined ? (
        <span className="spinner" />
      ) : token ? (
        <>
          <div className="share-row">
            <input readOnly value={url} onFocus={(e) => e.target.select()} />
            <button
              className="btn primary"
              onClick={() => {
                navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          <button className="btn" disabled={busy} onClick={() => toggle(false)}>
            Turn off link
          </button>
        </>
      ) : (
        <button className="btn primary" disabled={busy} onClick={() => toggle(true)}>
          <Link2 size={15} /> Create share link
        </button>
      )}
      <p className="muted small" style={{ marginTop: 16 }}>
        Teammates who should edit can open the same board from the board menu. Edits sync automatically; if two people save at once you'll be asked which version to keep.
      </p>
    </Modal>
  );
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function ReportsDialog({ onClose, integrations }: { onClose: () => void; integrations: IntegrationInfo[] }) {
  const boardId = useStore((s) => s.boardId)!;
  const [s, setS] = useState<Schedule>({ enabled: false, frequency: "weekly", hour: 9, weekday: 1, channels: [], syncFirst: true });
  const [preview, setPreview] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const notifiers = integrations.filter((i) => i.canNotify);

  useEffect(() => {
    api.getSchedule(boardId).then((x) => x && setS(x));
    api.previewReport(boardId).then((r) => setPreview(r.text));
  }, [boardId]);

  const save = async (next: Schedule) => {
    setS(next);
    try {
      setS(await api.setSchedule(boardId, next));
      setMsg("Saved.");
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <Modal title="Reports & alerts" icon={<BellRing size={18} />} onClose={onClose}>
      <p className="muted">
        Get a scheduled summary of plan vs. actual performance, with alerts for overspend, CPC spikes, under-delivery and conversion drops.
      </p>
      <label className="check">
        <input type="checkbox" checked={s.enabled} onChange={(e) => save({ ...s, enabled: e.target.checked })} /> Send scheduled reports
      </label>
      <div className="grid3">
        <label className="field">
          <span>Frequency</span>
          <select value={s.frequency} onChange={(e) => save({ ...s, frequency: e.target.value as Schedule["frequency"] })}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </label>
        {s.frequency === "weekly" && (
          <label className="field">
            <span>Day</span>
            <select value={s.weekday} onChange={(e) => save({ ...s, weekday: Number(e.target.value) })}>
              {DAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          <span>Time (server)</span>
          <select value={s.hour} onChange={(e) => save({ ...s, hour: Number(e.target.value) })}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="field">
        <span>Deliver to</span>
        <div className="chips">
          {notifiers.map((n) => (
            <button
              key={n.type}
              className={`chip ${s.channels.includes(n.type) ? "active" : ""}`}
              onClick={() => save({ ...s, channels: s.channels.includes(n.type) ? s.channels.filter((c) => c !== n.type) : [...s.channels, n.type] })}
              title={n.connected ? "" : "Not connected yet — add it to the canvas and connect it"}
            >
              {n.type} {n.connected ? "" : "(not connected)"}
            </button>
          ))}
        </div>
        <p className="muted small">Connect Slack, Zapier, Make or a Webhook by adding it to the canvas. Use Zapier or Make to route reports to email, Teams, or anywhere else.</p>
      </div>
      <label className="check">
        <input type="checkbox" checked={s.syncFirst} onChange={(e) => save({ ...s, syncFirst: e.target.checked })} /> Sync metrics from connected integrations before each report
      </label>
      {s.lastSentAt && <p className="muted small">Last sent {new Date(s.lastSentAt).toLocaleString()}</p>}

      <h4 style={{ marginTop: 16 }}>Preview</h4>
      <div className="report-preview">
        <Markdown text={preview.replace(/\*([^*]+)\*/g, "**$1**").replace(/<([^|>]+)\|([^>]+)>/g, "[$2]($1)")} />
      </div>
      <footer className="row">
        {msg && <span className="small muted">{msg}</span>}
        <div className="spacer" />
        <button
          className="btn primary"
          disabled={busy || !s.channels.length}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await api.sendReport(boardId);
              setMsg(r.failed.length ? `Sent, but failed for: ${r.failed.join("; ")}` : "Report sent.");
            } catch (e) {
              setMsg((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Send size={15} /> Send now
        </button>
      </footer>
    </Modal>
  );
}

export function PrivacyDialog({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Privacy & data" icon={<ShieldCheck size={18} />} onClose={onClose}>
      <p className="muted">
        You can download everything stored in this workspace or permanently delete it. Read the <a href="/legal/privacy" target="_blank">Privacy Policy</a>,{" "}
        <a href="/legal/terms" target="_blank">Terms</a>, <a href="/legal/subprocessors" target="_blank">Subprocessors</a> and{" "}
        <a href="/legal/data-deletion" target="_blank">data deletion</a> pages for details.
      </p>
      <section className="privacy-row">
        <div>
          <b>Export all data</b>
          <p className="muted small">All boards, comments, assets and the list of connected integrations (credentials are never exported).</p>
        </div>
        <a className="btn" href="/api/privacy/export" download>
          <Download size={15} /> Export JSON
        </a>
      </section>
      <section className="privacy-row">
        <div>
          <b>Delete all data</b>
          <p className="muted small">Permanently deletes every board and disconnects all integrations, removing stored credentials. This cannot be undone.</p>
        </div>
        <button
          className="btn danger"
          disabled={busy}
          onClick={async () => {
            if (!(await confirmDialog("Delete all workspace data?", { message: "Every board, comment and integration credential in this workspace will be permanently erased.", typeToConfirm: "DELETE", confirmLabel: "Delete everything", danger: true }))) return;
            setBusy(true);
            await api.deleteAllData();
            await newBoard();
            setBusy(false);
            onClose();
          }}
        >
          <Trash2 size={15} /> Delete everything
        </button>
      </section>
      <p className="muted small">
        AI features send board content to our AI provider to generate results. Don't put sensitive personal data (e.g. customer lists) into notes or prompts.
      </p>
    </Modal>
  );
}
