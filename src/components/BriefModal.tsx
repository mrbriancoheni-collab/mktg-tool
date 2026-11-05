import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import { TEMPLATES, buildTemplate } from "../../shared/templates";
import { api } from "../lib/api";
import { useStore } from "../lib/store";
import { confirmDialog } from "./Confirm";
import { track } from "../lib/track";

const EXAMPLES = [
  "Launch a $40 eco-friendly water bottle to US millennials. $15k/month budget, goal: 3x ROAS within 60 days.",
  "B2B SaaS for HR teams (500-5000 employees). $20k/month to book 60 qualified demos. ACV $12k.",
  "Online course teaching freelancers to price their services. $497 program, $8k/month ad budget, webinar-led.",
];

export function BriefModal({ onClose, onDone }: { onClose: () => void; onDone: (fit: boolean) => void }) {
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const loadPlan = useStore((s) => s.loadPlan);
  const hasNodes = useStore((s) => s.nodes.length > 0);

  const generate = async () => {
    if (!brief.trim()) return;
    if (hasNodes && !(await confirmDialog("Replace this board?", { message: "The AI campaign will replace what's on the canvas. You can undo, and version history keeps a copy.", confirmLabel: "Replace" }))) return;
    setBusy(true);
    setError("");
    try {
      const plan = await api.plan(brief);
      loadPlan(plan, brief);
      track("board_built", { via: "ai" });
      onDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal" role="dialog" aria-label="Build campaign with AI">
        <header>
          <h2>
            <Sparkles size={18} /> Build a campaign with AI
          </h2>
          <button className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <p className="muted">
          Describe the product, audience, budget and goal. The AI maps out traffic sources, pages, follow-ups, and tracking —
          with budgets and conversion assumptions you can tweak on the canvas.
        </p>
        <textarea
          autoFocus
          rows={6}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="e.g. We sell premium dog food subscriptions in the UK…"
          onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && generate()}
        />
        <div className="examples">
          {EXAMPLES.map((ex) => (
            <button key={ex} className="chip" onClick={() => setBrief(ex)}>
              {ex.slice(0, 48)}…
            </button>
          ))}
        </div>
        {error && <div className="error">{error}</div>}
        <footer>
          <button className="btn primary" onClick={generate} disabled={busy || !brief.trim()}>
            {busy ? <span className="spinner" /> : <Sparkles size={16} />}
            {busy ? "Designing your funnel…" : "Generate campaign"}
          </button>
        </footer>
        <div className="divider">or start from a template</div>
        <div className="templates">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              className="template"
              disabled={busy}
              onClick={async () => {
                if (hasNodes && !(await confirmDialog("Replace this board?", { message: "The template will replace what's on the canvas. You can undo.", confirmLabel: "Replace" }))) return;
                loadPlan(buildTemplate(t.id));
                track("board_built", { via: "template", template: t.id });
                onDone(true);
              }}
            >
              <b>{t.name}</b>
              <span>{t.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
