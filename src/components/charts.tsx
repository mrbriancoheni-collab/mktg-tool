// Small SVG chart kit for the dashboard. Follows the house data-viz rules:
// one y-axis, thin 2px lines, recessive grid, legend + direct end labels,
// crosshair tooltip on hover, text in text colors (never series colors).

import { useEffect, useMemo, useRef, useState } from "react";

export const SERIES = ["#2a78d6", "#eb6834"]; // validated categorical slots 1–2
export const PLAN_COLOR = "#8a8f9e";

export interface Series {
  name: string;
  color: string;
  values: (number | null)[];
  dashed?: boolean;
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

const shortDay = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function LineChart({ labels, series, format, height = 220, ariaLabel }: { labels: string[]; series: Series[]; format: (v: number) => string; height?: number; ariaLabel: string }) {
  // Draw at the container's real pixel width so text stays 11px at any size.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  const H = height, M = { l: 52, r: 76, t: 12, b: 26 };
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const max = useMemo(() => niceMax(Math.max(0, ...series.flatMap((s) => s.values.map((v) => v ?? 0)))), [series]);
  const n = labels.length;
  const x = (i: number) => M.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - M.l - M.r));
  const y = (v: number) => M.t + (1 - v / max) * (H - M.t - M.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const xTicks = n <= 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];
  // End labels: nudge apart so converging lines don't overlap.
  const ends = series
    .map((s) => {
      const last = [...s.values].reverse().findIndex((v) => v != null);
      const li = last < 0 ? -1 : n - 1 - last;
      return { name: s.name, li, y: li >= 0 ? y(s.values[li]!) + 4 : 0 };
    })
    .filter((e) => e.li >= 0)
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;

  const onMove = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - M.l) / (W - M.l - M.r)) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  };

  return (
    <div className="chart">
      {series.length > 1 && (
        <div className="legend">
          {series.map((s) => (
            <span key={s.name}>
              <i style={{ background: s.dashed ? "transparent" : s.color, borderColor: s.color }} className={s.dashed ? "dashed" : ""} /> {s.name}
            </span>
          ))}
        </div>
      )}
      <div className="chart-plot" ref={box}>
        <svg ref={ref} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className="grid" />
              <text x={M.l - 8} y={y(t) + 4} textAnchor="end" className="axis">
                {format(t)}
              </text>
            </g>
          ))}
          {xTicks.map((i) => (
            <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="axis">
              {labels[i] ? shortDay(labels[i]) : ""}
            </text>
          ))}
          {series.map((s) => {
            const pts = s.values.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`)).filter(Boolean);
            return <polyline key={s.name} points={pts.join(" ")} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? "5 4" : undefined} />;
          })}
          {ends.map((e) => (
            <text key={e.name} x={x(e.li) + 8} y={e.y} className="end-label">
              {e.name}
            </text>
          ))}
          {hover != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={H - M.b} className="crosshair" />
              {series.map((s) =>
                s.values[hover] == null ? null : <circle key={s.name} cx={x(hover)} cy={y(s.values[hover]!)} r={4.5} fill={s.color} stroke="var(--panel)" strokeWidth={2} />,
              )}
            </g>
          )}
        </svg>
        {hover != null && (
          <div className="chart-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
            <b>{shortDay(labels[hover])}</b>
            {series.map((s) => (
              <div key={s.name}>
                <i style={{ background: s.color }} /> {s.name}: <b>{s.values[hover] == null ? "—" : format(s.values[hover]!)}</b>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Horizontal single-series bars with value labels; extra columns as text. */
export function BarList({ rows, format, color = SERIES[0] }: { rows: { label: string; value: number; extra?: string }[]; format: (v: number) => string; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="barlist" role="list">
      {rows.map((r) => (
        <div key={r.label} className="barlist-row" role="listitem" title={`${r.label}: ${format(r.value)}${r.extra ? ` · ${r.extra}` : ""}`}>
          <span className="barlist-label">{r.label}</span>
          <span className="barlist-track">
            <span className="barlist-bar" style={{ width: `${(r.value / max) * 100}%`, background: color }} />
          </span>
          <span className="barlist-value">{format(r.value)}</span>
          {r.extra && <span className="barlist-extra">{r.extra}</span>}
        </div>
      ))}
    </div>
  );
}
