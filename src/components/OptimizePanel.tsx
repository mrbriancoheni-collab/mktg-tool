// Optimize tab: what-if scenarios, budget optimizer, experiment tracker.
import { useEffect, useMemo, useRef, useState } from "react";
import { FlaskConical, Gauge, Plus, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { abTest, applyScenario, NO_CHANGE, optimizeBudget, sampleSizePerVariant, type OptimizeResult, type Scenario } from "../../shared/optimize";
import { simulate } from "../../shared/simulate";
import { api, type Experiment } from "../lib/api";
import { num, pct, usd } from "../lib/format";
import { toGraph, useStore } from "../lib/store";
import { track } from "../lib/track";
import { confirmDialog } from "./Confirm";
import { Tip } from "./Inspector";

const SLIDERS: { key: keyof Scenario; label: string; help: string }[] = [
  { key: "budget", label: "Ad budget", help: "Change every paid channel's monthly budget by this percentage." },
  { key: "cpc", label: "Cost per click", help: "Ad costs often rise in Q4 or in competitive markets. Model the impact here." },
  { key: "conversion", label: "Conversion rates", help: "Better or worse pages, offers and follow-up — applied to every step." },
  { key: "price", label: "Order value", help: "Price changes, bundles or upsells that change revenue per sale." },
];

export function OptimizePanel() {
  return (
    <div className="optimize">
      <WhatIf />
      <Optimizer />
      <Experiments />
    </div>
  );
}

function Delta({ a, b, money, lowerIsBetter }: { a: number; b: number; money?: boolean; lowerIsBetter?: boolean }) {
  const d = b - a;
  if (Math.abs(d) < 0.5) return <span className="muted">—</span>;
  const good = lowerIsBetter ? d < 0 : d > 0;
  return <span className={`delta ${good ? "good" : "bad"}`}>{d > 0 ? "+" : "−"}{money ? usd(Math.abs(d)) : num(Math.abs(d))}</span>;
}

function WhatIf() {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const name = useStore((s) => s.name);
  const ro = useStore((s) => s.readOnly);
  const [sc, setSc] = useState<Scenario>(NO_CHANGE);
  const graph = useMemo(() => toGraph({ nodes, edges, name, goal: "" }), [nodes, edges, name]);
  const base = useMemo(() => simulate(graph).totals, [graph]);
  const next = useMemo(() => simulate(applyScenario(graph, sc)).totals, [graph, sc]);
  const changed = Object.values(sc).some((v) => v !== 0);

  const apply = () => {
    const s = useStore.getState();
    s.checkpoint();
    const g = applyScenario(graph, sc);
    for (const n of g.nodes) s.updateNode(n.id, n.data);
    setSc(NO_CHANGE);
    track("scenario_applied");
  };

  const rows: [string, number, number, boolean, boolean?][] = [
    ["Spend", base.spend, next.spend, true, true],
    ["Revenue", base.revenue, next.revenue, true],
    ["Customers", base.customers, next.customers, false],
    ["Profit", base.profit, next.profit, true],
  ];
  return (
    <section>
      <h4>
        <Gauge size={14} /> What if…?
      </h4>
      <p className="muted small">Stress-test the plan. Nothing changes on the board until you apply it.</p>
      {SLIDERS.map((s) => (
        <div className="whatif-row" key={s.key}>
          <span>
            {s.label} <Tip text={s.help} />
          </span>
          <input type="range" min={-50} max={50} step={5} value={sc[s.key]} onChange={(e) => setSc({ ...sc, [s.key]: Number(e.target.value) })} aria-label={s.label} />
          <b className={sc[s.key] ? "" : "muted"}>{sc[s.key] > 0 ? "+" : ""}{sc[s.key]}%</b>
        </div>
      ))}
      <table className="pva">
        <thead>
          <tr>
            <th></th>
            <th>Today</th>
            <th>Scenario</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, a, b, money, lower]) => (
            <tr key={k}>
              <td>{k}</td>
              <td>{money ? usd(a) : num(a)}</td>
              <td>
                <b>{money ? usd(b) : num(b)}</b>
              </td>
              <td>
                <Delta a={a} b={b} money={money} lowerIsBetter={lower} />
              </td>
            </tr>
          ))}
          <tr>
            <td>ROAS</td>
            <td>{base.roas.toFixed(2)}x</td>
            <td>
              <b>{next.roas.toFixed(2)}x</b>
            </td>
            <td />
          </tr>
        </tbody>
      </table>
      {changed && (
        <div className="row">
          <button className="btn" onClick={() => setSc(NO_CHANGE)}>
            <RotateCcw size={14} /> Reset
          </button>
          {!ro && (
            <button className="btn primary" onClick={apply}>
              Apply to board
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function Optimizer() {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const ro = useStore((s) => s.readOnly);
  const [goal, setGoal] = useState<OptimizeResult["goal"]>("profit");
  const [res, setRes] = useState<OptimizeResult | null | undefined>(undefined);
  useEffect(() => setRes(undefined), [nodes, edges]);

  const run = () => setRes(optimizeBudget(toGraph({ nodes, edges, name: "", goal: "" }), goal));
  const apply = () => {
    if (!res) return;
    const s = useStore.getState();
    s.checkpoint();
    for (const b of res.budgets) s.updateNode(b.nodeId, { budget: b.to });
    setRes(undefined);
    track("budget_optimized", { goal });
  };
  return (
    <section>
      <h4>
        <Sparkles size={14} /> Budget optimizer{" "}
        <Tip text="Moves budget between your paid channels (same total) to maximize the goal. It assumes each channel gets more expensive as you spend more on it, and keeps every channel between 50% and 200% of today's budget." />
      </h4>
      <div className="row">
        <select value={goal} onChange={(e) => setGoal(e.target.value as OptimizeResult["goal"])} aria-label="Goal">
          <option value="profit">Maximize profit</option>
          <option value="revenue">Maximize revenue</option>
          <option value="customers">Maximize customers</option>
        </select>
        <button className="btn" onClick={run}>
          Optimize budget
        </button>
      </div>
      {res === null && <p className="muted small">Add at least two paid channels with a budget and cost per click.</p>}
      {res && (
        <>
          <table className="pva">
            <thead>
              <tr>
                <th>Channel</th>
                <th>Today</th>
                <th>Suggested</th>
              </tr>
            </thead>
            <tbody>
              {res.budgets.map((b) => (
                <tr key={b.nodeId}>
                  <td>{b.label}</td>
                  <td>{usd(b.from)}</td>
                  <td>
                    <b>{usd(b.to)}</b>{" "}
                    {b.to !== b.from && <span className={`delta ${b.to > b.from ? "good" : "bad"}`}>{b.to > b.from ? "+" : "−"}{pct((Math.abs(b.to - b.from) / b.from) * 100, 0)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small">
            Expected {goal}: <b>{goal === "customers" ? num(res.before.customers) : usd(goal === "profit" ? res.before.profit : res.before.revenue)}</b> →{" "}
            <b>{goal === "customers" ? num(res.after.customers) : usd(goal === "profit" ? res.after.profit : res.after.revenue)}</b> with the same total budget.
          </p>
          {res.budgets.every((b) => b.to === b.from) ? (
            <p className="muted small">Your current split is already close to optimal.</p>
          ) : (
            !ro && (
              <button className="btn primary" onClick={apply}>
                Apply suggested budgets
              </button>
            )
          )}
        </>
      )}
    </section>
  );
}

const STATUS_LABEL: Record<Experiment["status"], string> = { planned: "Planned", running: "Running", won: "Won", lost: "Lost", inconclusive: "Inconclusive" };

function Experiments() {
  const boardId = useStore((s) => s.boardId);
  const nodes = useStore((s) => s.nodes);
  const ro = useStore((s) => s.readOnly);
  const pendingExperiment = useStore((s) => s.pendingExperiment);
  const [list, setList] = useState<Experiment[]>([]);
  const [hyp, setHyp] = useState("");
  const [nodeId, setNodeId] = useState("");
  const load = async () => {
    if (boardId) await api.experiments(boardId).then(setList).catch(() => {});
  };
  useEffect(() => {
    load();
  }, [boardId]);
  useEffect(() => {
    if (pendingExperiment) {
      setHyp(pendingExperiment.hypothesis);
      setNodeId(pendingExperiment.nodeId ?? "");
      useStore.setState({ pendingExperiment: null });
    }
  }, [pendingExperiment]);

  const create = async () => {
    if (!hyp.trim() || !boardId) return;
    await api.createExperiment(boardId, { hypothesis: hyp, nodeId: nodeId || null });
    setHyp("");
    setNodeId("");
    track("experiment_created");
    load();
  };
  // Keep the latest edits in a ref so saves never send (or restore) stale values.
  const latest = useRef(list);
  latest.current = list;
  const update = async (e: Experiment, patch: Partial<Experiment>) => {
    const u = await api.updateExperiment(boardId!, e.id, patch);
    setList((cur) => cur.map((x) => (x.id === e.id ? { ...u, variants: patch.variants ? x.variants : u.variants } : x)));
  };
  const saveVariants = (e: Experiment) => update(e, { variants: latest.current.find((x) => x.id === e.id)!.variants });
  const setVariant = (e: Experiment, i: number, patch: Partial<Experiment["variants"][number]>) =>
    setList((cur) => cur.map((x) => (x.id === e.id ? { ...x, variants: x.variants.map((y, j) => (j === i ? { ...y, ...patch } : y)) } : x)));

  return (
    <section>
      <h4>
        <FlaskConical size={14} /> Experiments
      </h4>
      {!ro && (
        <div className="exp-new">
          <textarea rows={2} placeholder="Hypothesis, e.g. “A shorter form will lift demo requests by 20%”" value={hyp} onChange={(e) => setHyp(e.target.value)} />
          <div className="row">
            <select value={nodeId} onChange={(e) => setNodeId(e.target.value)} aria-label="Step">
              <option value="">Whole funnel</option>
              {nodes
                .filter((n) => n.data.kind !== "note" && n.data.kind !== "integration")
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.data.label}
                  </option>
                ))}
            </select>
            <button className="btn primary" disabled={!hyp.trim()} onClick={create}>
              <Plus size={14} /> Add
            </button>
          </div>
        </div>
      )}
      {!list.length && <p className="muted small">Track A/B tests here. Enter visitors and conversions per variant to see if a winner is statistically significant.</p>}
      {list.map((e) => {
        const [a, b] = e.variants;
        const stats = a && b ? abTest(a, b) : null;
        const need = a && a.visitors > 0 && a.conversions > 0 ? sampleSizePerVariant(a.conversions / a.visitors, 0.2) : null;
        return (
          <div key={e.id} className={`exp exp-${e.status}`}>
            <div className="exp-head">
              <b>{e.hypothesis}</b>
              {!ro && (
                <button
                  className="icon-btn danger"
                  title="Delete"
                  onClick={async () => (await confirmDialog("Delete this experiment?", { danger: true, confirmLabel: "Delete" })) && api.deleteExperiment(boardId!, e.id).then(load)}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
            {e.nodeId && <div className="muted small">On: {nodes.find((n) => n.id === e.nodeId)?.data.label ?? "deleted step"}</div>}
            <div className="exp-variants">
              {e.variants.map((v, i) => (
                <div key={i} className="exp-variant">
                  <input value={v.name} disabled={ro} onChange={(ev) => setVariant(e, i, { name: ev.target.value })} onBlur={() => saveVariants(e)} aria-label="Variant name" />
                  <label>
                    Visitors
                    <input type="number" min={0} disabled={ro} value={v.visitors || ""} onChange={(ev) => setVariant(e, i, { visitors: Number(ev.target.value) })} onBlur={() => saveVariants(e)} />
                  </label>
                  <label>
                    Conversions
                    <input type="number" min={0} disabled={ro} value={v.conversions || ""} onChange={(ev) => setVariant(e, i, { conversions: Number(ev.target.value) })} onBlur={() => saveVariants(e)} />
                  </label>
                  <span className="muted small">{v.visitors ? pct((v.conversions / v.visitors) * 100) : "—"}</span>
                </div>
              ))}
            </div>
            {stats && (
              <p className={`small exp-stat ${stats.significant ? (stats.lift > 0 ? "good" : "bad") : ""}`}>
                {stats.significant
                  ? `${b.name} is ${stats.lift > 0 ? "better" : "worse"} by ${pct(Math.abs(stats.lift) * 100, 0)} — statistically significant (${stats.confidence > 0.999 ? "99.9%+" : `${(stats.confidence * 100).toFixed(1)}%`} confidence).`
                  : `No clear winner yet (${Math.round(stats.confidence * 100)}% confidence; aim for 95%).${need ? ` To detect a 20% lift you need ~${num(need)} visitors per variant.` : ""}`}
              </p>
            )}
            <div className="row">
              <select value={e.status} disabled={ro} onChange={(ev) => update(e, { status: ev.target.value as Experiment["status"] })} aria-label="Status">
                {Object.entries(STATUS_LABEL).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
              <span className={`pill exp-pill-${e.status}`}>{STATUS_LABEL[e.status]}</span>
            </div>
          </div>
        );
      })}
    </section>
  );
}
