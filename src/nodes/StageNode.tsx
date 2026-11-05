import { createContext, memo, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { suggestNext } from "../../shared/suggest";
import { CATALOG } from "../../shared/catalog";
import { track } from "../lib/track";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CATALOG_BY_TYPE } from "../../shared/catalog";
import type { SimulationResult } from "../../shared/model";
import { ItemIcon } from "../lib/icons";
import { num, pct, usd } from "../lib/format";
import { useStore, type StageNode as StageNodeT } from "../lib/store";

export const SimContext = createContext<SimulationResult | null>(null);

function StageNodeImpl({ id, data, selected }: NodeProps<StageNodeT>) {
  const sim = useContext(SimContext);
  const view = useStore((s) => s.view);
  const readOnly = useStore((s) => s.readOnly);
  const analysis = useStore((s) => s.analysis);
  const openComments = useStore((s) => s.comments.reduce((n, c) => n + (c.nodeId === id && !c.resolved ? 1 : 0), 0));
  const findings = analysis?.findings.filter((f) => f.nodeId === id) ?? [];
  const item = CATALOG_BY_TYPE[data.type];
  const color = item?.color ?? "#64748b";
  const r = sim?.nodes[id];
  const a = data.actuals;
  const worst = findings.find((f) => f.severity === "critical") ?? findings.find((f) => f.severity === "warning") ?? findings[0];

  let stats: [string, string][] = [];
  if (data.kind === "integration") {
    stats = [["Status", data.integration?.status === "connected" ? "Connected" : "Not connected"]];
  } else if (view === "build") {
    if (data.kind === "traffic") {
      stats = data.budget ? [["Budget", usd(data.budget)], ["CPC", `$${data.cpc ?? "—"}`]] : [["Visitors", num(data.visitors)]];
    } else {
      stats = [["Conv.", pct(data.conversionRate, 0)]];
      if (data.price) stats.push(["Price", usd(data.price)]);
    }
  } else if (r) {
    stats = [
      ["In", num(r.inflow)],
      ["Out", num(r.outflow)],
    ];
    if (r.spend) stats.push(["Spend", usd(r.spend)]);
    if (r.revenue) stats.push(["Rev", usd(r.revenue)]);
  }

  const hasActuals = a && Object.values(a).some((v) => v != null);

  return (
    <div className={`stage ${selected ? "selected" : ""} kind-${data.kind}`} style={{ "--accent": color } as React.CSSProperties}>
      <Handle type="target" position={Position.Left} />
      <div className="stage-head">
        <ItemIcon item={item} size={30} />
        <div className="stage-title">
          <div className="stage-label">{data.label}</div>
          <div className="stage-type">{item?.label ?? data.type}</div>
        </div>
        {data.kind === "integration" && (
          <span className={`dot ${data.integration?.status === "connected" ? "on" : ""}`} title={data.integration?.status} />
        )}
      </div>
      {stats.length > 0 && (
        <div className="stage-stats">
          {stats.map(([k, v]) => (
            <div key={k}>
              <span>{k}</span>
              <b>{v}</b>
            </div>
          ))}
        </div>
      )}
      {view === "analyze" && hasActuals && (
        <div className="stage-actuals">
          Actual: {a!.spend != null && `${usd(a!.spend)} · `}
          {a!.clicks != null && `${num(a!.clicks)} clicks · `}
          {a!.conversions != null && `${num(a!.conversions)} conv`}
          {a!.clicks && a!.conversions != null ? ` (${pct((a!.conversions / a!.clicks) * 100)})` : ""}
        </div>
      )}
      <div className="stage-badges">
        {openComments > 0 && <span className="badge comment" title="Open comments">💬 {openComments}</span>}
        {!!data.assets?.length && <span className="badge" title="AI assets">✦ {data.assets.length}</span>}
        {worst && (
          <span className={`badge sev-${worst.severity}`} title={worst.title}>
            {worst.severity === "opportunity" ? "◆" : "!"} {findings.length}
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
      {selected && data.kind !== "integration" && !readOnly && <QuickAdd fromId={id} type={data.type} />}
    </div>
  );
}

function QuickAdd({ fromId, type }: { fromId: string; type: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const btn = useRef<HTMLButtonElement>(null);
  const addNext = useStore((s) => s.addNextStep);
  const suggestions = suggestNext(type).map((t) => CATALOG.find((c) => c.type === t)!);
  const search = q.trim().toLowerCase();
  const results = search ? CATALOG.filter((c) => c.kind !== "note" && c.kind !== "integration" && c.label.toLowerCase().includes(search)).slice(0, 8) : suggestions;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !(e.target as HTMLElement).closest(".quick-add-menu, .quick-add-btn") && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const toggle = () => {
    const r = btn.current!.getBoundingClientRect();
    // Render the menu at normal size in a portal so it stays readable at any zoom level.
    setPos({ left: Math.min(r.right + 8, window.innerWidth - 250), top: Math.min(Math.max(8, r.top - 20), window.innerHeight - 330) });
    setQ("");
    setOpen(!open);
  };
  const add = (t: string) => {
    addNext(fromId, t);
    track("node_added", { via: "quick_add", type: t });
    setOpen(false);
  };
  return (
    <div className="quick-add nodrag nopan" onPointerDown={(e) => e.stopPropagation()}>
      <button ref={btn} className="quick-add-btn" title="Add next step" aria-label="Add next step" onClick={toggle}>
        <Plus size={14} />
      </button>
      {open &&
        createPortal(
          <div className="quick-add-menu" style={{ left: pos.left, top: pos.top }} role="menu">
            <input autoFocus placeholder="Search steps…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => (e.key === "Escape" ? setOpen(false) : e.key === "Enter" && results[0] && add(results[0].type))} />
            <div className="quick-add-label">{search ? "Results" : "Suggested next steps"}</div>
            {results.map((c) => (
              <button key={c.type} className="quick-add-item" onClick={() => add(c.type)} role="menuitem">
                <ItemIcon item={c} size={22} />
                <span>{c.label}</span>
              </button>
            ))}
            {!results.length && <span className="muted small">No matches</span>}
          </div>,
          document.body,
        )}
    </div>
  );
}

export const StageNode = memo(StageNodeImpl);
