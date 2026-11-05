// Internal product analytics (ADMIN_EMAILS only): activation funnel + WAU.
import { useEffect, useState } from "react";
import { BarList } from "../components/charts";

const LABEL: Record<string, string> = {
  signup: "Signed up",
  board_built: "Built a funnel",
  node_edited: "Adjusted an assumption",
  asset_generated: "Created AI ads/copy",
  data_connected: "Brought in real data",
  analysis_run: "Ran AI analysis",
  shared: "Invited or shared",
};

export function Admin() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<{ weeklyActiveUsers: number; steps: { step: string; users: number; rate: number }[] } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`/api/admin/metrics?days=${days}`)
      .then(async (r) => (r.ok ? setData(await r.json()) : setError((await r.json()).error)))
      .catch((e) => setError(String(e)));
  }, [days]);
  return (
    <div className="report-page">
      <h1>Product analytics</h1>
      <p className="muted">Activation funnel for users who signed up in the last {days} days. Events are first-party (no third-party trackers); set POSTHOG_API_KEY to also forward them to PostHog.</p>
      <div className="seg seg-sm" style={{ maxWidth: 300 }}>
        {[7, 30, 90].map((d) => (
          <button key={d} className={days === d ? "on" : ""} onClick={() => setDays(d)}>
            {d} days
          </button>
        ))}
      </div>
      {error && <div className="error">{error}</div>}
      {data && (
        <>
          <div className="report-kpis" style={{ margin: "16px 0" }}>
            <div>
              <span>Weekly active users</span>
              <b>{data.weeklyActiveUsers}</b>
            </div>
            <div>
              <span>Signups</span>
              <b>{data.steps[0]?.users ?? 0}</b>
            </div>
            <div>
              <span>Activated (got real data)</span>
              <b>{Math.round((data.steps.find((s) => s.step === "data_connected")?.rate ?? 0) * 100)}%</b>
            </div>
          </div>
          <h2>Activation funnel</h2>
          <BarList format={(v) => String(Math.round(v))} rows={data.steps.map((s) => ({ label: LABEL[s.step] ?? s.step, value: s.users, extra: `${Math.round(s.rate * 100)}%` }))} />
        </>
      )}
    </div>
  );
}
