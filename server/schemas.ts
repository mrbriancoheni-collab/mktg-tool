import { z } from "zod/v4";
import { FLOW_TYPES } from "../shared/catalog";

// Structured-output schemas. Nullable (not optional) fields keep every key
// present so the model always makes an explicit choice.

export const PlanSchema = z.object({
  name: z.string().describe("Short campaign name"),
  summary: z.string().describe("2-4 sentence strategy summary: audience, angle, offer, why this funnel shape"),
  nodes: z.array(
    z.object({
      id: z.string().describe("Unique short id, e.g. n1"),
      type: z.enum(FLOW_TYPES as [string, ...string[]]),
      label: z.string().describe("Specific name, e.g. 'Meta – Cold Lookalikes' rather than just 'Meta Ads'"),
      notes: z.string().describe("What happens at this step: targeting, message, offer, or tracking role"),
      budget: z.number().nullable().describe("Traffic only: monthly USD budget"),
      cpc: z.number().nullable().describe("Traffic only: expected cost per click in USD"),
      visitors: z.number().nullable().describe("Unpaid traffic only: expected monthly visitors"),
      conversionRate: z.number().nullable().describe("Pages/actions: % of arrivals who continue (0-100)"),
      price: z.number().nullable().describe("Revenue per conversion in USD, only on steps where money changes hands"),
    }),
  ),
  edges: z.array(
    z.object({
      source: z.string(),
      target: z.string(),
      weight: z.number().nullable().describe("Relative split when a node has several outgoing paths"),
    }),
  ),
});
export type Plan = z.infer<typeof PlanSchema>;

export const AnalysisSchema = z.object({
  headline: z.string().describe("One-sentence verdict on the funnel"),
  healthScore: z.number().describe("0-100 overall funnel health"),
  findings: z.array(
    z.object({
      nodeId: z.string().nullable().describe("Canvas node id this applies to, or null for funnel-wide"),
      severity: z.enum(["critical", "warning", "opportunity"]),
      title: z.string(),
      detail: z.string().describe("What the numbers show and why it matters"),
      recommendation: z.string().describe("Concrete next action"),
    }),
  ),
  experiments: z.array(
    z.object({
      nodeId: z.string().nullable(),
      hypothesis: z.string(),
      test: z.string().describe("How to run it: variants, metric, duration"),
      expectedImpact: z.string(),
    }),
  ),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

export const AdPackSchema = z.object({
  campaign: z.string(),
  adGroups: z.array(
    z.object({
      name: z.string().describe("Ad group / ad set name describing the theme or audience"),
      headlines: z.array(z.string()),
      descriptions: z.array(z.string()),
      primaryTexts: z.array(z.string()).describe("Primary/body text variants; empty for search ads"),
      keywords: z.array(z.string()).describe("Search keywords; empty for non-search formats"),
      cta: z.string(),
    }),
  ),
});

export const MockupSchema = z.object({
  variants: z.array(
    z.object({
      layout: z.enum(["bold-type", "split-image", "testimonial", "offer-badge"]).describe("Visual layout of the ad"),
      headline: z.string().describe("On-image headline, max 40 characters"),
      primary: z.string().describe("Supporting line, max 90 characters"),
      cta: z.string().describe("Button text, max 18 characters"),
      badge: z.string().nullable().describe("Short badge like '50% OFF' or 'NEW', or null"),
      quote: z.string().nullable().describe("Customer quote for testimonial layout (max 110 chars), else null"),
      bg: z.string().describe("Background color hex like #0f172a"),
      fg: z.string().describe("Text color hex with strong contrast against bg"),
      accent: z.string().describe("Accent/button color hex"),
      imagePrompt: z.string().describe("Prompt for an image generator describing the photo/visual to place in the image area"),
    }),
  ),
});
export type MockupSet = z.infer<typeof MockupSchema>;
