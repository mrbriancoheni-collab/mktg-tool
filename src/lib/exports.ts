// Client deliverables: PowerPoint deck (pptxgenjs, loaded on demand) and the
// print-ready report page (saved as PDF via the browser's print dialog).

import { CATALOG_BY_TYPE } from "../../shared/catalog";
import type { Graph } from "../../shared/model";
import { simulate } from "../../shared/simulate";
import { funnelSvg, svgToPng } from "../components/FunnelSvg";
import type { Analysis, Branding } from "./api";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export async function exportDeck(opts: { graph: Graph; name: string; summary: string; analysis: Analysis | null; branding: Branding | null; workspaceName: string }) {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
  const accent = (opts.branding?.color ?? "#6d5efc").replace("#", "");
  const brandName = opts.branding?.name || opts.workspaceName;
  const sim = simulate(opts.graph);
  const t = sim.totals;

  pptx.defineSlideMaster({
    title: "BRAND",
    background: { color: "FFFFFF" },
    objects: [
      { rect: { x: 0, y: 7.3, w: 13.33, h: 0.2, fill: { color: accent } } },
      ...(opts.branding?.logo ? [{ image: { data: opts.branding.logo, x: 12.1, y: 0.3, w: 0.9, h: 0.5, sizing: { type: "contain" as const, w: 0.9, h: 0.5 } } }] : []),
      { text: { text: brandName, options: { x: 0.5, y: 6.9, w: 8, h: 0.3, fontSize: 10, color: "6B7185" } } },
    ],
    slideNumber: { x: 12.6, y: 6.9, fontSize: 10, color: "6B7185" },
  });
  const title = (s: ReturnType<typeof pptx.addSlide>, text: string) => s.addText(text, { x: 0.5, y: 0.35, w: 11.3, h: 0.7, fontSize: 26, bold: true, color: "161A2B" });

  // 1. Cover
  const cover = pptx.addSlide({ masterName: "BRAND" });
  cover.background = { color: accent };
  cover.addText(opts.name, { x: 0.7, y: 2.4, w: 12, h: 1.2, fontSize: 40, bold: true, color: "FFFFFF" });
  cover.addText(`Campaign plan & performance · ${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}`, { x: 0.7, y: 3.6, w: 12, h: 0.6, fontSize: 18, color: "FFFFFF" });
  cover.addText(`Prepared by ${brandName}`, { x: 0.7, y: 4.3, w: 12, h: 0.5, fontSize: 14, color: "FFFFFF" });

  // 2. Strategy + forecast
  const s2 = pptx.addSlide({ masterName: "BRAND" });
  title(s2, "Strategy & monthly forecast");
  if (opts.summary) s2.addText(opts.summary, { x: 0.5, y: 1.2, w: 12.3, h: 1.4, fontSize: 15, color: "333333", valign: "top" });
  const kpis: [string, string][] = [
    ["Spend", money(t.spend)],
    ["Revenue", money(t.revenue)],
    ["ROAS", `${t.roas.toFixed(2)}x`],
    ["Customers", Math.round(t.customers).toLocaleString("en-US")],
    ["Cost per customer", t.customers ? money(t.cpa) : "—"],
    ["Profit", money(t.profit)],
  ];
  kpis.forEach(([k, v], i) => {
    const x = 0.5 + (i % 3) * 4.15, y = 2.9 + Math.floor(i / 3) * 1.75;
    s2.addShape(pptx.ShapeType.roundRect, { x, y, w: 3.9, h: 1.5, fill: { color: "F6F7FB" }, line: { color: "E4E6EF" }, rectRadius: 0.1 });
    s2.addText(k, { x: x + 0.25, y: y + 0.15, w: 3.4, h: 0.4, fontSize: 13, color: "6B7185" });
    s2.addText(v, { x: x + 0.25, y: y + 0.55, w: 3.4, h: 0.8, fontSize: 30, bold: true, color: "161A2B" });
  });

  // 3. Funnel diagram
  const s3 = pptx.addSlide({ masterName: "BRAND" });
  title(s3, "Campaign funnel");
  const png = await svgToPng(funnelSvg(opts.graph, sim, { accent: `#${accent}` }));
  const maxW = 12.3, maxH = 5.6;
  const ratio = Math.min(maxW / png.w, maxH / png.h);
  s3.addImage({ data: png.data, x: 0.5 + (maxW - png.w * ratio) / 2, y: 1.2, w: png.w * ratio, h: png.h * ratio });

  // 4. Channel plan
  const s4 = pptx.addSlide({ masterName: "BRAND" });
  title(s4, "Channel plan");
  const traffic = opts.graph.nodes.filter((n) => n.data.kind === "traffic");
  const head = ["Channel", "Monthly budget", "Cost per click", "Visitors", "Actual spend"].map((text) => ({ text, options: { bold: true, color: "FFFFFF", fill: { color: accent } } }));
  const rows = traffic.map((n) => [
    `${n.data.label} (${CATALOG_BY_TYPE[n.data.type]?.label ?? ""})`,
    n.data.budget ? money(n.data.budget) : "—",
    n.data.cpc ? `$${n.data.cpc}` : "—",
    Math.round(sim.nodes[n.id]?.outflow ?? 0).toLocaleString("en-US"),
    n.data.actuals?.spend != null ? money(n.data.actuals.spend) : "—",
  ]);
  s4.addTable([head, ...rows.map((r) => r.map((text) => ({ text })))], { x: 0.5, y: 1.2, w: 12.3, colW: [4.3, 2, 2, 2, 2], fontSize: 12, border: { type: "solid", color: "E4E6EF", pt: 1 }, autoPage: true });

  // 5. Findings & experiments
  if (opts.analysis) {
    const a = opts.analysis;
    const s5 = pptx.addSlide({ masterName: "BRAND" });
    title(s5, `Findings · health score ${Math.round(a.healthScore)}/100`);
    s5.addText(a.headline, { x: 0.5, y: 1.1, w: 12.3, h: 0.6, fontSize: 15, italic: true, color: "333333" });
    if (!a.findings.length) s5.addText("No issues found — the funnel's assumptions are within typical benchmarks.", { x: 0.5, y: 1.9, w: 12.3, h: 0.6, fontSize: 15, color: "161A2B" });
    else s5.addText(
      a.findings.slice(0, 6).map((f) => ({ text: `${f.title} — ${f.recommendation}`, options: { bullet: true, breakLine: true } })),
      { x: 0.5, y: 1.8, w: 12.3, h: 5, fontSize: 14, color: "161A2B", valign: "top", paraSpaceAfter: 6 },
    );
    if (a.experiments.length) {
      const s6 = pptx.addSlide({ masterName: "BRAND" });
      title(s6, "Next: experiments to run");
      s6.addText(
        a.experiments.slice(0, 5).map((x) => ({ text: `${x.hypothesis} (${x.expectedImpact})`, options: { bullet: { type: "number" }, breakLine: true } })),
        { x: 0.5, y: 1.2, w: 12.3, h: 5.5, fontSize: 15, color: "161A2B", valign: "top", paraSpaceAfter: 8 },
      );
    }
  }
  await pptx.writeFile({ fileName: `${opts.name.replace(/\W+/g, "-").toLowerCase() || "campaign"}.pptx` });
}
