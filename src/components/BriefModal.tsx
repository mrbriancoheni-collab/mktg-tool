import { useMemo, useState } from "react";
import { CATALOG_BY_TYPE } from "../../shared/catalog";
import { simulate } from "../../shared/simulate";
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
  const boardId = useStore((s) => s.boardId);
  const [seg, setSeg] = useState<"all" | "b2b" | "b2c">("all");
  const [goal, setGoal] = useState("All goals");
  const goals = ["All goals", ...new Set(TEMPLATES.map((t) => t.goal))];
  const shown = TEMPLATES.filter((t) => (seg === "all" || t.segment === seg) && (goal === "All goals" || t.goal === goal));
  const roas = useMemo(() => Object.fromEntries(TEMPLATES.map((t) => [t.id, forecastRoas(t.id)])), []);
  /** Keep a copy of the current board in version history before replacing it. */
  const keepCopy = async () => {
    if (hasNodes && boardId) await api.saveVersion(boardId, "Before replacing with a new plan").catch(() => {});
  };

  const generate = async () => {
    if (!brief.trim()) return;
    if (hasNodes && !(await confirmDialog("Replace this board?", { message: "The AI campaign will replace what's on the canvas. You can undo, and version history keeps a copy.", confirmLabel: "Replace" }))) return;
    setBusy(true);
    setError("");
    try {
      await keepCopy();
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
        <div className="divider">or start from a proven template</div>
        <div className="row wrap template-filters">
          <div className="seg seg-sm">
            {(["all", "b2b", "b2c"] as const).map((x) => (
              <button key={x} className={seg === x ? "on" : ""} onClick={() => setSeg(x)}>
                {x === "all" ? "All" : x.toUpperCase()}
              </button>
            ))}
          </div>
          <select value={goal} onChange={(e) => setGoal(e.target.value)} aria-label="Goal">
            {goals.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </div>
        <div className="templates">
          {shown.map((t) => (
            <button
              key={t.id}
              className="template"
              disabled={busy}
              onClick={async () => {
                if (hasNodes && !(await confirmDialog("Replace this board?", { message: "The template will replace what's on the canvas. You can undo, and version history keeps a copy.", confirmLabel: "Replace" }))) return;
                await keepCopy();
                loadPlan(buildTemplate(t.id));
                track("board_built", { via: "template", template: t.id });
                onDone(true);
              }}
            >
              <b>{t.name}</b>
              <span>{t.description}</span>
              <span className="template-tags">
                <i>{t.industry}</i>
                <i>{t.goal}</i>
                <i className="roas">~{roas[t.id].toFixed(1)}x ROAS</i>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Forecast ROAS for a template at the default $10k budget (shown on cards). */
function forecastRoas(id: Parameters<typeof buildTemplate>[0]) {
  const p = buildTemplate(id);
  const g = {
    name: p.name,
    nodes: p.nodes.map((n) => ({ id: n.id, data: { ...Object.fromEntries(Object.entries(n).filter(([, v]) => v !== null)), kind: CATALOG_BY_TYPE[n.type]?.kind ?? "page" } })),
    edges: p.edges.map((e, i) => ({ id: `e${i}`, source: e.source, target: e.target, data: e.weight ? { weight: e.weight } : {} })),
  };
  return simulate(g as never).totals.roas;
}
