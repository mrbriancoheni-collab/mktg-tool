import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ASSET_LABELS, CATALOG, CATALOG_BY_TYPE, type AssetKind } from "../shared/catalog";
import type { Graph, GraphNode, SimulationResult } from "../shared/model";
import { simulate } from "../shared/simulate";
import { AD_SPECS, formatFor, type AdPack } from "../shared/adpack";
import { AdPackSchema, AnalysisSchema, MockupSchema, PlanSchema, type Analysis, type MockupSet, type Plan } from "./schemas";
import * as demo from "./demo";

export const MODEL = process.env.ADCANVAS_MODEL ?? "claude-opus-5-5";
// Re-run a declined request on Anthropic's recommended fallback model.
export const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

function hasCredentials() {
  if (process.env.ADCANVAS_DEMO === "1") return false;
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return true;
  // `ant auth login` stores a profile the SDK picks up automatically.
  return fs.existsSync(path.join(os.homedir(), ".config", "anthropic"));
}

export const LIVE = hasCredentials();
export const client = LIVE ? new Anthropic() : null;

export class AIError extends Error {}

// ── Shared context ────────────────────────────────────────────────

export const SYSTEM = `You are AdCanvas, a senior performance-marketing strategist embedded in a visual campaign-planning canvas.
Users map campaigns as flows: traffic sources → pages → actions → revenue, plus integrations (analytics, CRM, payments) attached for tracking.
Be specific and quantitative. Use realistic industry benchmarks, name the assumption when you use one, and tie advice to node names on the canvas.
Write for a busy marketer: plain language, no filler, no hype.

Available node types (type · kind · audience · typical conversion %):
${CATALOG.filter((c) => c.kind !== "note")
  .map((c) => `- ${c.type} · ${c.kind}/${c.group} · ${c.segment}${c.benchmark ? ` · ${c.benchmark[0]}-${c.benchmark[1]}%` : ""}: ${c.label} — ${c.description}`)
  .join("\n")}

Pick channels, pages and tools that fit the business model: B2B funnels usually run through lead capture, qualification (MQL/SDR), sales calls and Closed Won; B2C funnels usually run through product/landing pages, cart, checkout, upsells, and recovery flows (abandoned cart, retargeting). Steps with role "customer" (checkout, closed_won, subscription, purchase) count customers.`;

function fmt(n: number) {
  return Math.round(n).toLocaleString("en-US");
}

/** Compact, model-readable description of the canvas plus its forecast. */
export function describeGraph(graph: Graph, sim: SimulationResult = simulate(graph)) {
  const lines = [`Campaign: ${graph.name}`];
  if (graph.goal) lines.push(`Goal: ${graph.goal}`);
  lines.push("", "Nodes:");
  for (const n of graph.nodes) {
    const d = n.data;
    if (d.kind === "note") {
      lines.push(`- [${n.id}] sticky note: ${d.label}${d.notes ? ` — ${d.notes}` : ""}`);
      continue;
    }
    const r = sim.nodes[n.id];
    const parts = [`[${n.id}] ${d.label} (${d.type})`];
    if (d.budget != null) parts.push(`budget $${fmt(d.budget)}`);
    if (d.cpc != null) parts.push(`CPC $${d.cpc}`);
    if (d.visitors != null) parts.push(`visitors ${fmt(d.visitors)}`);
    if (d.conversionRate != null) parts.push(`CR ${d.conversionRate}%`);
    if (d.price) parts.push(`price $${d.price}`);
    if (r) parts.push(`forecast in ${fmt(r.inflow)} → out ${fmt(r.outflow)}${r.revenue ? `, revenue $${fmt(r.revenue)}` : ""}`);
    if (d.actuals && Object.values(d.actuals).some((v) => v != null)) parts.push(`ACTUALS ${JSON.stringify(d.actuals)}`);
    if (d.integration) parts.push(`integration ${d.integration.status}`);
    if (d.notes) parts.push(`notes: ${d.notes}`);
    lines.push("- " + parts.join(" | "));
  }
  lines.push("", "Connections:");
  const label = (id: string) => graph.nodes.find((n) => n.id === id)?.data.label ?? id;
  for (const e of graph.edges) {
    lines.push(`- ${label(e.source)} → ${label(e.target)}${sim.edges[e.id] != null ? ` (${fmt(sim.edges[e.id])} people)` : ""}`);
  }
  const t = sim.totals;
  lines.push(
    "",
    `Forecast totals: spend $${fmt(t.spend)}, visitors ${fmt(t.visitors)}, leads ${fmt(t.leads)}, customers ${fmt(t.customers)}, revenue $${fmt(t.revenue)}, ROAS ${t.roas.toFixed(2)}x, CPA $${fmt(t.cpa)}, profit $${fmt(t.profit)}`,
  );
  return lines.join("\n");
}

/** Called with token usage after each live AI request (for metering). */
export type OnUsage = (usage: { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } | undefined, model: string) => void;

function checkRefusal(msg: { stop_reason: string | null }) {
  if (msg.stop_reason === "refusal") throw new AIError("The model declined this request. Try rephrasing the brief.");
}

// ── 1. Build a campaign from a brief ──────────────────────────────

export async function planCampaign(brief: string, onUsage?: OnUsage): Promise<Plan> {
  if (!client) return demo.plan(brief);
  const msg = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    output_config: { effort: "high", format: betaZodOutputFormat(PlanSchema) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Design a complete ad campaign funnel for this brief. Include 1-4 traffic sources sized to the budget, the pages and follow-up actions that turn visitors into revenue, a retargeting or nurture path where it helps, and the integrations needed to track and operate it (connect integrations to the steps they track). Set realistic CPCs and conversion rates for this market; put price only on steps where money changes hands.

<brief>
${brief}
</brief>`,
      },
    ],
  });
  onUsage?.(msg.usage, msg.model);
  checkRefusal(msg);
  if (!msg.parsed_output) throw new AIError("Could not parse the campaign plan. Please try again.");
  return msg.parsed_output;
}

// ── 2. Generate creative / copy for a node (streamed) ─────────────

export async function* generateAsset(graph: Graph, nodeId: string, kind: AssetKind, instructions?: string, onUsage?: OnUsage) {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) throw new AIError("Node not found");
  if (!client) {
    yield* demo.asset(graph, node, kind);
    return;
  }
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    ...FALLBACK,
    output_config: { effort: "medium" },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `<canvas>
${describeGraph(graph)}
</canvas>

Create: **${ASSET_LABELS[kind]}** for the node "${node.data.label}" (${CATALOG_BY_TYPE[node.data.type]?.label ?? node.data.type}, id ${node.id}).
Fit it to where this step sits in the funnel — what the person saw before and where they go next.
${assetGuidance(kind)}
${instructions ? `\nAdditional direction from the user: ${instructions}` : ""}
Return ready-to-use Markdown with no preamble.`,
      },
    ],
  });
  for await (const ev of stream) {
    if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") yield ev.delta.text;
  }
  const final = await stream.finalMessage();
  onUsage?.(final.usage, final.model);
  checkRefusal(final);
}

function assetGuidance(kind: AssetKind) {
  switch (kind) {
    case "ad_copy":
      return "Give 5 variants, each with a distinct angle (pain, outcome, proof, curiosity, offer). For each: primary text, headline, description, CTA. Respect the platform's character limits and note them.";
    case "creative_brief":
      return "Cover: objective, audience insight, single-minded message, 3 visual concepts with hook for the first 2 seconds, formats/sizes, do/don't.";
    case "audience":
      return "Define cold, warm and hot audiences with platform-specific targeting settings, exclusions, lookalike/seed suggestions and expected audience sizes.";
    case "landing_copy":
      return "Write section by section: hero (headline, subhead, CTA), problem, solution, proof, offer, FAQ, final CTA. Include 2 headline alternatives for A/B testing.";
    case "email_sequence":
      return "Write 5 emails with send timing, subject line + preview text, body, and CTA. Each email has one job.";
    case "sms_sequence":
      return "Write 4 short SMS messages (<160 chars) with send timing and compliance opt-out text.";
    case "video_script":
      return "Write 2 scripts (15s and 30s) with a scene-by-scene table: time, visual, voiceover/on-screen text. Strong hook in the first 2 seconds.";
    case "tracking_plan":
      return "List events, parameters, where they fire, which platforms receive them (pixel/CAPI/GA4), UTM conventions, and how to verify each.";
    case "offer":
      return "Propose 3 offer structures (price, bonuses, guarantee, urgency) with the reasoning and which audience each suits.";
    case "outreach_sequence":
      return "Write a 5-touch multichannel outbound sequence (email, LinkedIn, call) with day, channel, subject/opener, personalization hook, and call script/voicemail where relevant. Keep emails under 90 words.";
    case "seo_brief":
      return "Give target keyword + 5 secondary keywords with search intent, suggested title/meta, H2 outline, questions to answer, internal links, and the conversion CTA.";
    case "chatbot_script":
      return "Write a qualification chatbot flow: greeting, 3-5 branching qualifying questions, routing rules (book call / self-serve / nurture), and fallback replies.";
  }
}

// ── 3. Analyze the funnel ─────────────────────────────────────────

export async function analyzeFunnel(graph: Graph, onUsage?: OnUsage): Promise<Analysis> {
  const sim = simulate(graph);
  if (!client) return demo.analysis(graph, sim);
  const msg = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    output_config: { effort: "high", format: betaZodOutputFormat(AnalysisSchema) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `<canvas>
${describeGraph(graph, sim)}
</canvas>

Analyze this funnel. Where nodes have ACTUALS, compare them against the plan and weight them above forecasts. Identify the biggest leaks and wasted spend, steps whose conversion rates are off-benchmark, missing tracking/integrations, and structural gaps (e.g. no retargeting, no nurture for non-buyers). Rank findings by expected revenue impact. Propose 3-5 experiments. Use node ids from the canvas in nodeId.`,
      },
    ],
  });
  onUsage?.(msg.usage, msg.model);
  checkRefusal(msg);
  if (!msg.parsed_output) throw new AIError("Could not parse the analysis. Please try again.");
  return msg.parsed_output;
}

// ── 4. Platform-ready ad pack (structured, within character limits) ──

export async function generateAdPack(graph: Graph, nodeId: string, finalUrl: string, instructions?: string, onUsage?: OnUsage): Promise<AdPack> {
  const node = graph.nodes.find((n) => n.id === nodeId);
  const format = node && formatFor(node.data.type);
  if (!node || !format) throw new AIError("Ad packs are available for paid ad channels.");
  const spec = AD_SPECS[format];
  let pack: AdPack;
  if (!client) {
    pack = demo.adPack(graph, node, format, finalUrl);
  } else {
    const limits = [
      spec.headline.count && `${spec.headline.count} headlines, each ≤ ${spec.headline.max} characters`,
      spec.description.count && `${spec.description.count} descriptions, each ≤ ${spec.description.max} characters`,
      spec.primary.count && `${spec.primary.count} primary texts, each ≤ ${spec.primary.max} characters`,
      spec.keywords && `${spec.keywords} phrase-match keywords per ad group`,
      spec.ctas.length && `cta must be exactly one of: ${spec.ctas.join(", ")}`,
    ].filter(Boolean);
    const msg = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      ...FALLBACK,
      output_config: { effort: "medium", format: betaZodOutputFormat(AdPackSchema) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `<canvas>\n${describeGraph(graph)}\n</canvas>\n\nWrite a platform-ready ${spec.label} pack for "${node.data.label}" (${node.data.type}). Create 2-3 ad groups, each targeting a distinct angle or audience. Per ad group: ${limits.join("; ")}. Character limits are hard limits — count carefully. Leave unused arrays empty.${instructions ? `\nDirection: ${instructions}` : ""}`,
        },
      ],
    });
    onUsage?.(msg.usage, msg.model);
  checkRefusal(msg);
    if (!msg.parsed_output) throw new AIError("Could not parse the ad pack. Please try again.");
    pack = { ...msg.parsed_output, format, finalUrl };
  }
  // Enforce counts; flag (don't silently cut) anything over the limit — the UI highlights it.
  pack.adGroups = pack.adGroups.map((g) => ({
    ...g,
    headlines: g.headlines.slice(0, spec.headline.count || 0),
    descriptions: g.descriptions.slice(0, spec.description.count || 0),
    primaryTexts: g.primaryTexts.slice(0, spec.primary.count || 0),
    keywords: g.keywords.slice(0, spec.keywords),
  }));
  return pack;
}

// ── Ad creative mockups (design specs rendered client-side as SVG) ──

const HEX = /^#[0-9a-f]{6}$/i;
export async function generateMockups(graph: Graph, nodeId: string, brandColor: string | undefined, onUsage?: OnUsage): Promise<MockupSet> {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) throw new AIError("Node not found");
  let set: MockupSet;
  if (!client) set = demo.mockups(graph, node, brandColor);
  else {
    const msg = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      ...FALLBACK,
      output_config: { effort: "medium", format: betaZodOutputFormat(MockupSchema) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `<canvas>\n${describeGraph(graph)}\n</canvas>\n\nDesign 4 distinct static ad creatives for "${node.data.label}" (${node.data.type}), one per layout: bold-type, split-image, testimonial, offer-badge. Each must have a scroll-stopping headline (≤40 chars), a supporting line (≤90 chars), a CTA (≤18 chars), and colors with strong text contrast${brandColor ? ` built around the brand color ${brandColor}` : ""}. Write an imagePrompt describing the photo or visual for the image area. Keep claims truthful and compliant with ad policies.`,
        },
      ],
    });
    onUsage?.(msg.usage, msg.model);
    checkRefusal(msg);
    if (!msg.parsed_output) throw new AIError("Could not parse the mockups. Please try again.");
    set = msg.parsed_output;
  }
  // Enforce limits and safe colors.
  set.variants = set.variants.slice(0, 4).map((v) => ({
    ...v,
    headline: v.headline.slice(0, 48),
    primary: v.primary.slice(0, 110),
    cta: v.cta.slice(0, 22),
    badge: v.badge?.slice(0, 14) ?? null,
    quote: v.quote?.slice(0, 140) ?? null,
    bg: HEX.test(v.bg) ? v.bg : "#111827",
    fg: HEX.test(v.fg) ? v.fg : "#ffffff",
    accent: HEX.test(v.accent) ? v.accent : brandColor ?? "#6d5efc",
  }));
  return set;
}

// ── 5. Chat with the canvas as context (streamed) ─────────────────

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export async function* chat(graph: Graph, history: ChatTurn[], onUsage?: OnUsage) {
  if (!client) {
    yield* demo.chat(graph, history);
    return;
  }
  const last = history[history.length - 1];
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.slice(0, -1).map((t) => ({ role: t.role, content: t.content })),
    {
      role: "user",
      content: `<canvas snapshot="current">\n${describeGraph(graph)}\n</canvas>\n\n${last.content}`,
    },
  ];
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    ...FALLBACK,
    output_config: { effort: "medium" },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages,
  });
  for await (const ev of stream) {
    if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") yield ev.delta.text;
  }
  const final = await stream.finalMessage();
  onUsage?.(final.usage, final.model);
  checkRefusal(final);
}

export type { GraphNode };
