// Static, self-contained SVG of the funnel for reports and slide decks.
import { CATALOG_BY_TYPE } from "../../shared/catalog";
import type { Graph, SimulationResult } from "../../shared/model";

const NW = 210, NH = 64;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const short = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : Math.round(n).toLocaleString("en-US"));

/** Returns SVG markup (string) so it can be printed, embedded, or rasterized for slides. */
export function funnelSvg(graph: Graph, sim?: SimulationResult, opts: { accent?: string } = {}) {
  const nodes = graph.nodes.filter((n) => n.data.kind !== "note");
  if (!nodes.length) return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="80"><text x="10" y="40" font-family="sans-serif" fill="#6b7185">Empty board</text></svg>`;
  const xs = nodes.map((n) => n.position?.x ?? 0), ys = nodes.map((n) => n.position?.y ?? 0);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const W = Math.max(...xs) - minX + NW + 40, H = Math.max(...ys) - minY + NH + 40;
  const pos = new Map(nodes.map((n) => [n.id, { x: (n.position?.x ?? 0) - minX + 20, y: (n.position?.y ?? 0) - minY + 20 }]));
  const edges = graph.edges
    .filter((e) => pos.has(e.source) && pos.has(e.target))
    .map((e) => {
      const a = pos.get(e.source)!, b = pos.get(e.target)!;
      const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2, mx = (x1 + x2) / 2;
      const tracking = [e.source, e.target].some((id) => graph.nodes.find((n) => n.id === id)?.data.kind === "integration");
      const flow = sim?.edges[e.id] ?? 0;
      const max = Math.max(1, ...Object.values(sim?.edges ?? {}));
      const w = tracking ? 1.2 : 1.5 + 6 * Math.sqrt(flow / max);
      return `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke="${tracking ? "#c4c8d6" : opts.accent ?? "#8b93ad"}" stroke-opacity="${tracking ? 1 : 0.55}" stroke-width="${w}" ${tracking ? 'stroke-dasharray="4 4"' : ""}/>`;
    });
  const boxes = nodes.map((n) => {
    const p = pos.get(n.id)!;
    const item = CATALOG_BY_TYPE[n.data.type];
    const r = sim?.nodes[n.id];
    const stat = n.data.kind === "integration" ? "Tracking / tool" : r ? `${short(r.inflow)} in → ${short(r.outflow)} out${r.revenue ? ` · $${short(r.revenue)}` : ""}` : "";
    return `<g>
      <rect x="${p.x}" y="${p.y}" width="${NW}" height="${NH}" rx="10" fill="#ffffff" stroke="#e4e6ef"/>
      <rect x="${p.x}" y="${p.y}" width="6" height="${NH}" rx="3" fill="${item?.color ?? "#64748b"}"/>
      <text x="${p.x + 16}" y="${p.y + 24}" font-family="Inter,Arial,sans-serif" font-size="13" font-weight="600" fill="#161a2b">${esc(n.data.label.slice(0, 30))}</text>
      <text x="${p.x + 16}" y="${p.y + 42}" font-family="Inter,Arial,sans-serif" font-size="11" fill="#6b7185">${esc(item?.label ?? "")}</text>
      <text x="${p.x + 16}" y="${p.y + 56}" font-family="Inter,Arial,sans-serif" font-size="10.5" fill="#52514e">${esc(stat)}</text>
    </g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${edges.join("")}${boxes.join("")}</svg>`;
}

/** Rasterizes SVG markup to a PNG data URL (for PowerPoint). */
export async function svgToPng(svg: string, maxWidth = 2400): Promise<{ data: string; w: number; h: number }> {
  const m = svg.match(/width="(\d+(?:\.\d+)?)" height="(\d+(?:\.\d+)?)"/);
  const w = Number(m?.[1] ?? 800), h = Number(m?.[2] ?? 400);
  const scale = Math.min(2, maxWidth / w);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return { data: c.toDataURL("image/png"), w, h };
}
