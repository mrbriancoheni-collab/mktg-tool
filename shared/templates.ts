// Starter funnels. Used as instant templates in the client and as the
// offline "AI" planner in demo mode.
import type { PlanSpec } from "./model";

type N = PlanSpec["nodes"][number];
const node = (id: string, type: string, label: string, notes: string, extra: Partial<N> = {}): N => ({
  id, type, label, notes,
  budget: null, cpc: null, visitors: null, conversionRate: null, price: null,
  ...extra,
});

export type TemplateId = "ecom" | "b2b" | "webinar";

export const TEMPLATES: { id: TemplateId; name: string; description: string }[] = [
  { id: "ecom", name: "E-commerce launch", description: "Paid social + PMax → product page → checkout → upsell, with cart recovery" },
  { id: "b2b", name: "B2B demo pipeline", description: "LinkedIn + Search → lead magnet → nurture → booked demo → close" },
  { id: "webinar", name: "Webinar funnel", description: "Meta + YouTube → registration → live masterclass → checkout → VIP upsell" },
];

export function buildTemplate(id: TemplateId, budget = 10000, product = "your offer"): PlanSpec {
  switch (id) {
    case "b2b":
      return {
        name: "B2B Demo Pipeline",
        summary: `Drive qualified demo bookings for ${product}. LinkedIn targets decision-makers by title and company size; Google Search captures in-market intent and goes straight to a demo request. A lead magnet lowers the first ask for colder traffic, then email nurture moves those leads to a booked call. Sales runs demos and closes annual contracts.`,
        nodes: [
          node("n1", "linkedin_ads", "LinkedIn – Decision Makers", "Job titles: Head of / VP / Director in target function; company size 50-1000.", { budget: Math.round(budget * 0.55), cpc: 7 }),
          node("n2", "google_search", "Google – High-Intent Keywords", "Exact/phrase match on '[category] software', competitor alternatives.", { budget: Math.round(budget * 0.35), cpc: 4.5 }),
          node("n3", "retargeting", "Retargeting – Site Visitors", "30-day visitors who didn't book; case-study creative.", { budget: Math.round(budget * 0.1), cpc: 2 }),
          node("n4", "lead_magnet", "Lead Magnet – ROI Guide", "Gated guide / calculator; asks for work email only.", { conversionRate: 22 }),
          node("n5", "email_sequence", "5-Day Nurture", "Value emails ending each with a soft book-a-demo CTA.", { conversionRate: 9 }),
          node("n12", "booking", "Book a Call (nurtured)", "Direct calendar link for warm leads from nurture.", { conversionRate: 40 }),
          node("n6", "demo_request", "Request a Demo", "Short form + Calendly embed; 3 qualifying questions.", { conversionRate: 6 }),
          node("n7", "sales_call", "Demo Call", "AE runs discovery + tailored demo.", { conversionRate: 50 }),
          node("n10", "closed_won", "Closed Won", "Annual contract signed.", { conversionRate: 30, price: 12000 }),
          node("n8", "hubspot", "HubSpot CRM", "Leads, lifecycle stages, deal pipeline."),
          node("n9", "ga4", "Google Analytics 4", "Track lead + booking conversions; import to Google Ads."),
          node("n11", "linkedin_insight", "LinkedIn Insight Tag", "Lead + demo-booked conversions for LinkedIn optimization."),
        ],
        edges: [
          { source: "n1", target: "n4", weight: null },
          { source: "n2", target: "n6", weight: 1 },
          { source: "n2", target: "n4", weight: 2 },
          { source: "n3", target: "n6", weight: null },
          { source: "n4", target: "n5", weight: null },
          { source: "n5", target: "n12", weight: null },
          { source: "n12", target: "n7", weight: null },
          { source: "n6", target: "n7", weight: null },
          { source: "n7", target: "n10", weight: null },
          { source: "n4", target: "n8", weight: null },
          { source: "n6", target: "n9", weight: null },
          { source: "n1", target: "n11", weight: null },
        ],
      };
    case "webinar":
      return {
        name: "Webinar Funnel",
        summary: `Register cold traffic into a free masterclass for ${product}, then sell the core program at the end of the session with an order bump and a one-click upsell. Replay + email nurture recovers no-shows.`,
        nodes: [
          node("n1", "meta_ads", "Meta – Masterclass Promo", "Broad + interest stacks; video ad teasing the #1 insight.", { budget: Math.round(budget * 0.7), cpc: 1.4 }),
          node("n2", "youtube_ads", "YouTube – In-Stream", "Skippable 60s pre-roll on topic channels.", { budget: Math.round(budget * 0.3), cpc: 0.9 }),
          node("n3", "optin_page", "Masterclass Registration", "Date/time, 3 bullets on what they'll learn.", { conversionRate: 32 }),
          node("n4", "email_sequence", "Show-up Reminders", "Confirmation, 24h, 1h, live-now emails + SMS.", { conversionRate: 40 }),
          node("n5", "webinar", "Live Masterclass", "60 min teach + 15 min pitch.", { conversionRate: 15 }),
          node("n6", "checkout", "Program Checkout", "Core program + order bump.", { conversionRate: 55, price: 497 }),
          node("n7", "upsell", "VIP Coaching Upsell", "Group coaching add-on.", { conversionRate: 18, price: 997 }),
          node("n8", "stripe", "Stripe", "Payments + payment plans."),
          node("n9", "meta_pixel", "Meta Pixel / CAPI", "Lead + Purchase events with value."),
          node("n10", "zoom", "Zoom Webinars", "Hosts the live masterclass; attendance synced to email."),
        ],
        edges: [
          { source: "n1", target: "n3", weight: null },
          { source: "n2", target: "n3", weight: null },
          { source: "n3", target: "n4", weight: null },
          { source: "n4", target: "n5", weight: null },
          { source: "n5", target: "n6", weight: null },
          { source: "n6", target: "n7", weight: null },
          { source: "n6", target: "n8", weight: null },
          { source: "n3", target: "n9", weight: null },
          { source: "n5", target: "n10", weight: null },
        ],
      };
    default:
    return {
      name: "E-commerce Launch",
      summary: `Sell ${product} direct-to-consumer. Meta and TikTok generate cold demand with UGC-style creative, Performance Max captures search and shopping intent, and retargeting plus abandoned-cart email recover the rest. A post-purchase upsell lifts average order value.`,
      nodes: [
        node("n1", "meta_ads", "Meta – Cold UGC", "Advantage+ audiences; 3-5 UGC creatives testing hooks.", { budget: Math.round(budget * 0.45), cpc: 1.1 }),
        node("n2", "tiktok_ads", "TikTok – Spark Ads", "Creator content boosted as Spark Ads.", { budget: Math.round(budget * 0.2), cpc: 0.7 }),
        node("n3", "google_pmax", "Performance Max – Shopping", "Feed-driven; brand terms excluded.", { budget: Math.round(budget * 0.25), cpc: 1.2 }),
        node("n4", "retargeting", "Retargeting – Viewers & Carts", "7-day product viewers + cart abandoners; offer reminder.", { budget: Math.round(budget * 0.1), cpc: 0.6 }),
        node("n5", "product_page", "Product Page", "Benefit-led hero, reviews above the fold, sticky add-to-cart.", { conversionRate: 9 }),
        node("n6", "checkout", "Checkout", "Shop Pay / Apple Pay; free shipping threshold.", { conversionRate: 55, price: 68 }),
        node("n7", "upsell", "Post-Purchase Bundle", "One-click add-on at 20% off.", { conversionRate: 15, price: 29 }),
        node("n8", "abandoned_cart", "Abandoned Cart Flow", "3 emails over 48h; last one includes incentive.", { conversionRate: 8 }),
        node("n9", "shopify", "Shopify", "Store + product feed."),
        node("n10", "klaviyo", "Klaviyo", "Cart abandonment + post-purchase flows."),
        node("n11", "meta_pixel", "Meta Pixel / CAPI", "ViewContent, AddToCart, Purchase with value."),
          node("n12", "meta_ads_mgr", "Meta Ads Manager", "Pull spend & results into the canvas."),
      ],
      edges: [
        { source: "n1", target: "n5", weight: null },
        { source: "n2", target: "n5", weight: null },
        { source: "n3", target: "n5", weight: null },
        { source: "n4", target: "n5", weight: null },
        { source: "n5", target: "n6", weight: 3 },
        { source: "n5", target: "n8", weight: 1 },
        { source: "n8", target: "n6", weight: null },
        { source: "n6", target: "n7", weight: null },
        { source: "n6", target: "n9", weight: null },
        { source: "n8", target: "n10", weight: null },
        { source: "n5", target: "n11", weight: null },
      ],
    };
  }
}
