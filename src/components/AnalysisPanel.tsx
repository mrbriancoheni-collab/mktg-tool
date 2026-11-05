import { useState } from "react";
import { AlertTriangle, FlaskConical, Gem, OctagonAlert, RefreshCw, Send, Sparkles } from "lucide-react";
import { api, type IntegrationInfo } from "../lib/api";
import { toGraph, useStore } from "../lib/store";
import { Markdown } from "./Markdown";
import { track } from "../lib/track";

const SEV = {
  critical: { icon: OctagonAlert, label: "Critical" },
  warning: { icon: AlertTriangle, label: "Warning" },
  opportunity: { icon: Gem, label: "Opportunity" },
};

export function AnalysisPanel({ integrations }: { integrations: IntegrationInfo[] }) {
  const analysis = useStore((s) => s.analysis);
  const setAnalysis = useStore((s) => s.setAnalysis);
  const setView = useStore((s) => s.setView);
  const select = useStore((s) => s.select);
  const nodes = useStore((s) => s.nodes);
  const summary = useStore((s) => s.summary);
  const readOnly = useStore((s) => s.readOnly);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");
  const notifiers = integrations.filter((i) => i.canNotify && i.connected);

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      setAnalysis(await api.analyze(toGraph(useStore.getState())));
      track("analysis_run");
      setView("analyze");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const share = async (type: string) => {
    if (!analysis) return;
    const text = [
      `*${useStore.getState().name}* — funnel health ${Math.round(analysis.healthScore)}/100`,
      analysis.headline,
      ...analysis.findings.slice(0, 5).map((f) => `• [${f.severity}] ${f.title}: ${f.recommendation}`),
    ].join("\n");
    try {
      await api.notify(type, text);
      setSent(`Sent to ${type}.`);
    } catch (e) {
      setSent((e as Error).message);
    }
  };

  const nodeLabel = (id: string | null) => (id ? nodes.find((n) => n.id === id)?.data.label : null);

  return (
    <div className="analysis">
      {summary && (
        <section className="strategy">
          <h4>Strategy</h4>
          <Markdown text={summary} />
        </section>
      )}
      {!readOnly && <button className="btn primary full" onClick={run} disabled={busy || !nodes.length}>
        {busy ? <span className="spinner" /> : analysis ? <RefreshCw size={14} /> : <Sparkles size={14} />}
        {busy ? "Analyzing funnel…" : analysis ? "Re-run analysis" : "Analyze funnel with AI"}
      </button>}
      {readOnly && !analysis && <p className="muted small">No analysis has been run on this board yet.</p>}
      {!nodes.length && <p className="muted small">Add some steps to the canvas first.</p>}
      {error && <div className="error">{error}</div>}

      {analysis && (
        <>
          <div className="score">
            <div className="score-ring" style={{ "--v": analysis.healthScore } as React.CSSProperties}>
              <b>{Math.round(analysis.healthScore)}</b>
            </div>
            <p>{analysis.headline}</p>
          </div>

          <h4>Findings</h4>
          {analysis.findings.length === 0 && <p className="muted small">No issues found.</p>}
          {analysis.findings.map((f, i) => {
            const S = SEV[f.severity];
            return (
              <div key={i} className={`finding sev-${f.severity}`}>
                <div className="finding-head">
                  <S.icon size={15} />
                  <b>{f.title}</b>
                </div>
                {f.nodeId && nodeLabel(f.nodeId) && (
                  <button className="link small" onClick={() => select(f.nodeId)}>
                    → {nodeLabel(f.nodeId)}
                  </button>
                )}
                <p>{f.detail}</p>
                <p className="rec">
                  <b>Do:</b> {f.recommendation}
                </p>
              </div>
            );
          })}

          <h4>
            <FlaskConical size={14} /> Experiments to run
          </h4>
          {analysis.experiments.map((x, i) => (
            <div key={i} className="experiment">
              <b>{x.hypothesis}</b>
              {x.nodeId && nodeLabel(x.nodeId) && (
                <button className="link small" onClick={() => select(x.nodeId)}>
                  → {nodeLabel(x.nodeId)}
                </button>
              )}
              <p>{x.test}</p>
              <span className="impact">{x.expectedImpact}</span>
            </div>
          ))}

          <p className="ai-note">AI analysis is based on your assumptions and imported data, and can be wrong. Verify before changing budgets.</p>
          {!readOnly && notifiers.length > 0 && (
            <div className="row wrap">
              {notifiers.map((n) => (
                <button key={n.type} className="btn" onClick={() => share(n.type)}>
                  <Send size={14} /> Share to {n.type}
                </button>
              ))}
              {sent && <span className="small muted">{sent}</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
