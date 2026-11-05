// Offline responses used when no Anthropic credentials are configured, so the
// whole app can be explored without an API key. The analyzer is rule-based
// against common benchmarks; plans and copy are templated from the brief.

import { ASSET_LABELS, CATALOG, CATALOG_BY_TYPE, type AssetKind } from "../shared/catalog";
import type { Graph, GraphNode, SimulationResult } from "../shared/model";
import type { Analysis, Plan } from "./schemas";
import { buildTemplate } from "../shared/templates";
import { AD_SPECS, type AdFormat, type AdPack } from "../shared/adpack";
import type { ChatTurn } from "./ai";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function budgetFrom(brief: string) {
  const text = brief.replace(/,/g, "");
  // Prefer explicit dollar amounts ("$15k", "$20000"), then "15k" / "15000 budget".
  const m = text.match(/\$\s?(\d+(?:\.\d+)?)\s?(k)?/i) ?? text.match(/\b(\d+(?:\.\d+)?)\s?(k)\b/i) ?? text.match(/\b(\d{3,})\b/);
  if (!m) return 10000;
  const v = parseFloat(m[1]) * (m[2] ? 1000 : 1);
  return v >= 500 ? v : 10000;
}

export async function plan(brief: string): Promise<Plan> {
  await sleep(900);
  const b = brief.toLowerCase();
  const product = brief.split(/[.\n]/)[0].slice(0, 60) || "your offer";
  const id = /b2b|saas|software|enterprise|agency|consult|demo/.test(b)
    ? "b2b"
    : /webinar|course|coach|info|training|masterclass/.test(b) ? "webinar" : "ecom";
  return buildTemplate(id, budgetFrom(brief), product);
}

export async function* asset(graph: Graph, n: GraphNode, kind: AssetKind) {
  const label = n.data.label;
  const platform = CATALOG_BY_TYPE[n.data.type]?.label ?? "this channel";
  const text = `> **Demo mode** — set \`ANTHROPIC_API_KEY\` to generate tailored ${ASSET_LABELS[kind].toLowerCase()} with Claude. This is a template showing the output format.

## ${ASSET_LABELS[kind]} — ${label}

${template(kind, platform, graph.name)}`;
  for (const chunk of text.match(/[\s\S]{1,24}/g) ?? []) {
    await sleep(12);
    yield chunk;
  }
}

function template(kind: AssetKind, platform: string, campaign: string) {
  switch (kind) {
    case "ad_copy":
      return [
        ["Pain", "Still wasting hours on [problem]?", "There's a faster way.", "Learn More"],
        ["Outcome", "Get [result] in [timeframe]", "Join 2,000+ who already have.", "Get Started"],
        ["Proof", "★★★★★ “Changed how we work”", "See why customers switch.", "See Reviews"],
        ["Curiosity", "The [category] mistake nobody talks about", "And the 2-minute fix.", "Watch Now"],
        ["Offer", "[Offer] — this week only", "Free shipping + 30-day guarantee.", "Shop Now"],
      ]
        .map(([angle, h, d, c], i) => `### Variant ${i + 1} · ${angle}\n- **Primary text:** ${h} ${d}\n- **Headline:** ${h}\n- **Description:** ${d}\n- **CTA:** ${c}`)
        .join("\n\n") + `\n\n_Character limits for ${platform} apply: headlines ≤ 40, primary text ≤ 125 before truncation._`;
    case "email_sequence":
      return [1, 2, 3, 4, 5]
        .map((i) => `### Email ${i} — Day ${i === 1 ? 0 : i * 2 - 2}\n- **Subject:** [Subject line ${i}]\n- **Preview:** [Preview text]\n- **Body:** One idea, one story, one call to action.\n- **CTA:** [Button text]`)
        .join("\n\n");
    case "landing_copy":
      return `### Hero\n**Headline:** [Outcome] without [pain]\n**Subhead:** [Who it's for] get [result] in [time].\n**CTA:** [Primary action]\n\n### Problem\n### Solution\n### Proof\n### Offer\n### FAQ\n### Final CTA\n\n**A/B headline alternatives:**\n1. [Alt headline A]\n2. [Alt headline B]`;
    case "audience":
      return `| Temperature | Definition | ${platform} settings |\n|---|---|---|\n| Cold | Interest / lookalike 1-3% of purchasers | Broad, Advantage+ |\n| Warm | 30-day engagers & site visitors | Exclude purchasers |\n| Hot | Add-to-cart / checkout 7-day | Frequency cap 3/day |`;
    case "video_script":
      return `### 15s\n| Time | Visual | VO / text |\n|---|---|---|\n| 0-2s | Pattern-interrupt hook | “[Hook]” |\n| 2-10s | Product in use | Key benefit |\n| 10-15s | Logo + offer | CTA |\n\n### 30s\nSame structure with a problem → demo → proof → CTA arc.`;
    case "tracking_plan":
      return `| Event | Fires on | Parameters | Destinations |\n|---|---|---|---|\n| page_view | All pages | utm_* | GA4, Pixel |\n| generate_lead | Opt-in submit | value, form_id | GA4, Pixel/CAPI, CRM |\n| purchase | Thank-you page | value, currency, order_id | GA4, Pixel/CAPI |\n\n**UTMs:** utm_source={platform}, utm_medium=paid, utm_campaign=${campaign.toLowerCase().replace(/\W+/g, "-")}`;
    default:
      return `- [Point 1]\n- [Point 2]\n- [Point 3]`;
  }
}

const BENCH: Record<string, [number, number]> = Object.fromEntries(
  CATALOG.filter((c) => c.benchmark).map((c) => [c.type, c.benchmark!]),
);

export async function analysis(graph: Graph, sim: SimulationResult): Promise<Analysis> {
  await sleep(700);
  const findings: Analysis["findings"] = [];
  const t = sim.totals;
  const flow = graph.nodes.filter((n) => n.data.kind !== "integration" && n.data.kind !== "note");

  if (t.spend > 0 && t.roas < 1)
    findings.push({ nodeId: null, severity: "critical", title: `Unprofitable: ROAS ${t.roas.toFixed(2)}x`, detail: `Forecast spend $${Math.round(t.spend).toLocaleString()} returns $${Math.round(t.revenue).toLocaleString()}.`, recommendation: "Raise conversion on the weakest step or increase AOV with an order bump/upsell before scaling spend." });

  for (const n of flow) {
    const b = BENCH[n.data.type];
    const actual = n.data.actuals;
    const cr = actual?.clicks && actual.conversions != null ? (actual.conversions / actual.clicks) * 100 : n.data.conversionRate;
    if (b && cr != null) {
      if (cr < b[0]) findings.push({ nodeId: n.id, severity: "warning", title: `${n.data.label} converts below benchmark`, detail: `${cr.toFixed(1)}% vs typical ${b[0]}-${b[1]}%.`, recommendation: "Test a sharper headline, fewer form fields, and stronger proof above the fold." });
      else if (cr > b[1] * 1.3) findings.push({ nodeId: n.id, severity: "opportunity", title: `${n.data.label} assumption looks optimistic`, detail: `${cr.toFixed(1)}% is above the typical ${b[0]}-${b[1]}% range.`, recommendation: "Validate with a small test budget before relying on this forecast." });
    }
    if (n.data.kind === "traffic" && sim.nodes[n.id]?.spend && !graph.edges.some((e) => e.source === n.id))
      findings.push({ nodeId: n.id, severity: "critical", title: `${n.data.label} goes nowhere`, detail: "Budget is allocated but the source isn't connected to a page.", recommendation: "Connect it to a landing page or remove the spend." });
  }

  if (!flow.some((n) => ["retargeting", "email_sequence", "abandoned_cart", "sms", "sdr_followup", "winback"].includes(n.data.type)))
    findings.push({ nodeId: null, severity: "opportunity", title: "No recovery path for non-converters", detail: "Most visitors leave on the first visit and nothing brings them back.", recommendation: "Add a retargeting audience and an email/SMS nurture for captured leads." });
  if (!graph.nodes.some((n) => CATALOG_BY_TYPE[n.data.type]?.group === "Analytics & attribution"))
    findings.push({ nodeId: null, severity: "warning", title: "No conversion tracking", detail: "Ad platforms can't optimize toward conversions they can't see.", recommendation: "Add GA4 and the relevant pixels/CAPI, and connect them to the conversion steps." });

  const score = Math.max(5, Math.min(98, Math.round(Math.min(88, 55 + Math.log2(Math.max(t.roas, 0.1)) * 12) - findings.filter((f) => f.severity === "critical").length * 15 - findings.filter((f) => f.severity === "warning").length * 5)));
  const weakest = flow.filter((n) => BENCH[n.data.type]).sort((a, b) => (a.data.conversionRate ?? 0) / BENCH[a.data.type][1] - (b.data.conversionRate ?? 0) / BENCH[b.data.type][1])[0];

  return {
    headline: `${t.roas >= 1 ? "Profitable" : "Not yet profitable"} at ${t.roas.toFixed(2)}x ROAS with ${Math.round(t.customers).toLocaleString()} forecast customers. (Demo-mode analysis — add an API key for Claude's full review.)`,
    healthScore: score,
    findings,
    experiments: [
      ...(weakest ? [{ nodeId: weakest.id, hypothesis: `Improving ${weakest.data.label} has the most headroom vs benchmark.`, test: "A/B test two headline + offer variants, 50/50 split, until 100 conversions per arm.", expectedImpact: "+10-25% step conversion" }] : []),
      { nodeId: null, hypothesis: "Creative fatigue limits scale more than audience size.", test: "Launch 3 new hooks weekly; kill ads under median CTR after 2,000 impressions.", expectedImpact: "-10-20% CPC" },
    ],
  };
}

export async function* chat(graph: Graph, history: ChatTurn[]) {
  const t = (await import("../shared/simulate")).simulate(graph).totals;
  const q = history[history.length - 1]?.content ?? "";
  const text = `**Demo mode** — I'm not connected to Claude yet, so here's what I can see on the canvas:\n\n- **${graph.nodes.length}** nodes, **${graph.edges.length}** connections\n- Forecast spend **$${Math.round(t.spend).toLocaleString()}** → revenue **$${Math.round(t.revenue).toLocaleString()}** (ROAS ${t.roas.toFixed(2)}x)\n- ${Math.round(t.visitors).toLocaleString()} visitors, ${Math.round(t.customers).toLocaleString()} customers, CPA $${Math.round(t.cpa).toLocaleString()}\n\nSet \`ANTHROPIC_API_KEY\` and restart the server to get a real answer to: _“${q.slice(0, 120)}”_`;
  for (const chunk of text.match(/[\s\S]{1,20}/g) ?? []) {
    await sleep(10);
    yield chunk;
  }
}

export function adPack(graph: Graph, n: GraphNode, format: AdFormat, finalUrl: string): AdPack {
  const spec = AD_SPECS[format];
  const fit = (t: string, max: number) => (max && t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t);
  const H = ["Save Hours Every Week", "Built for Busy Teams", "Try It Free Today", "Rated 4.8/5 by Users", "See Results in 30 Days", "No Credit Card Needed", "Join 2,000+ Customers", "Get Started in Minutes", "The Smarter Way to Grow", "Simple, Fast, Reliable", "Cut Costs by 30%", "Trusted by Top Brands", "Book Your Free Demo", "Limited-Time Offer", "Start Your Free Trial"];
  const D = ["Demo mode copy — add an API key for tailored ads. Replace with your offer.", "Everything you need in one place. Set up in minutes, see results fast.", "Loved by thousands of customers. Try it risk-free with our guarantee.", "Get expert help when you need it. Start today and see the difference."];
  const P = ["Still doing [task] the hard way? There's a faster path.", "Here's how [customer] got [result] in 30 days.", "Stop wasting budget on [problem]. Try [product] free.", "The [category] tool teams actually enjoy using.", "[Offer] ends Friday — don't miss it."];
  const group = (name: string, kw: string[]) => ({
    name,
    headlines: H.slice(0, spec.headline.count).map((h) => fit(h, spec.headline.max)),
    descriptions: D.slice(0, spec.description.count).map((d) => fit(d, spec.description.max)),
    primaryTexts: P.slice(0, spec.primary.count).map((p) => fit(p, spec.primary.max)),
    keywords: kw.slice(0, spec.keywords),
    cta: spec.ctas[0] ?? "",
  });
  return {
    format,
    finalUrl,
    campaign: `${graph.name} – ${n.data.label}`,
    adGroups: [
      group("Problem-aware", ["[category] software", "best [category] tool", "[problem] solution", "how to [solve problem]"]),
      group("Competitor alternatives", ["[competitor] alternative", "[competitor] vs", "cheaper than [competitor]"]),
    ],
  };
}

export function mockups(graph: Graph, n: GraphNode, brand?: string) {
  const accent = brand ?? "#6d5efc";
  const product = graph.name.replace(/ (launch|campaign|funnel|pipeline)$/i, "");
  return {
    variants: [
      { layout: "bold-type" as const, headline: "Stop guessing. Start growing.", primary: `${product}: the simpler way to get results — set up in minutes.`, cta: "Try it free", badge: null, quote: null, bg: "#0f172a", fg: "#ffffff", accent, imagePrompt: "Minimal abstract gradient background, soft light" },
      { layout: "split-image" as const, headline: "Built for busy teams", primary: "Everything in one place. Less admin, more of the work you love.", cta: "Learn more", badge: null, quote: null, bg: "#ffffff", fg: "#111827", accent, imagePrompt: `Lifestyle photo of a person happily using ${product} at a bright desk` },
      { layout: "testimonial" as const, headline: "Rated 4.8/5 by customers", primary: "Join thousands who switched this year.", cta: "See reviews", badge: null, quote: "“We cut our costs by a third in the first month. Wish we'd found it sooner.”", bg: "#f8fafc", fg: "#0f172a", accent, imagePrompt: "Friendly headshot of a smiling customer, natural light" },
      { layout: "offer-badge" as const, headline: "Your first month, half price", primary: "Limited-time offer for new customers. Cancel anytime.", cta: "Claim offer", badge: "50% OFF", quote: null, bg: accent, fg: "#ffffff", accent: "#facc15", imagePrompt: `Product shot of ${product} on a clean colored background` },
    ],
  };
}
