// Platform-ready ad packs: structured copy with character limits and exports
// to bulk-import formats. Shared by server (generation) and client (preview/export).

export type AdFormat = "search" | "social" | "linkedin" | "video";

export interface AdPack {
  format: AdFormat;
  campaign: string;
  finalUrl: string;
  adGroups: {
    name: string;
    headlines: string[];
    descriptions: string[];
    primaryTexts: string[];
    keywords: string[];
    cta: string;
  }[];
}

interface Spec {
  label: string;
  headline: { max: number; count: number };
  description: { max: number; count: number };
  primary: { max: number; count: number };
  keywords: number;
  ctas: string[];
  exportLabel: string;
}

export const AD_SPECS: Record<AdFormat, Spec> = {
  search: {
    label: "Responsive search ad",
    headline: { max: 30, count: 15 },
    description: { max: 90, count: 4 },
    primary: { max: 0, count: 0 },
    keywords: 15,
    ctas: [],
    exportLabel: "Google Ads Editor CSV",
  },
  social: {
    label: "Single image / video ad",
    headline: { max: 40, count: 5 },
    description: { max: 30, count: 3 },
    primary: { max: 125, count: 5 },
    keywords: 0,
    ctas: ["LEARN_MORE", "SHOP_NOW", "SIGN_UP", "GET_OFFER", "BOOK_NOW", "DOWNLOAD", "SUBSCRIBE", "CONTACT_US", "GET_QUOTE", "APPLY_NOW"],
    exportLabel: "Meta bulk-import CSV",
  },
  linkedin: {
    label: "Sponsored content",
    headline: { max: 70, count: 5 },
    description: { max: 100, count: 2 },
    primary: { max: 150, count: 5 },
    keywords: 0,
    ctas: ["Learn more", "Download", "Register", "Request demo", "Sign up", "Apply", "Get quote", "Join", "Subscribe"],
    exportLabel: "LinkedIn ads CSV",
  },
  video: {
    label: "Short-form video ad",
    headline: { max: 40, count: 5 },
    description: { max: 0, count: 0 },
    primary: { max: 100, count: 5 },
    keywords: 0,
    ctas: ["Learn more", "Shop now", "Sign up", "Download", "Book now", "Order now"],
    exportLabel: "Video ads CSV (TikTok / YouTube)",
  },
};

/** Which ad format a traffic node uses, or null if ad packs don't apply. */
export function formatFor(type: string): AdFormat | null {
  if (["google_search", "microsoft_ads", "apple_search_ads", "amazon_ads"].includes(type)) return "search";
  if (["linkedin_ads", "abm_ads"].includes(type)) return "linkedin";
  if (["tiktok_ads", "youtube_ads", "snapchat_ads", "ctv"].includes(type)) return "video";
  if (["meta_ads", "instagram_ads", "pinterest_ads", "x_ads", "reddit_ads", "retargeting", "google_display", "google_pmax", "native_ads", "programmatic", "quora_ads"].includes(type)) return "social";
  return null;
}

export function overLimit(format: AdFormat, field: "headline" | "description" | "primary", text: string) {
  const max = AD_SPECS[format][field].max;
  return max > 0 && text.length > max;
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const csv = (rows: string[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\n");

/** Builds a bulk-import CSV for the pack's platform. Review in the platform's editor before publishing. */
export function exportCSV(pack: AdPack): { filename: string; text: string } {
  const slug = pack.campaign.replace(/\W+/g, "-").toLowerCase();
  if (pack.format === "search") {
    const header = ["Campaign", "Ad group", "Ad type", ...Array.from({ length: 15 }, (_, i) => `Headline ${i + 1}`), ...Array.from({ length: 4 }, (_, i) => `Description ${i + 1}`), "Final URL", "Keyword", "Criterion Type"];
    const rows: string[][] = [header];
    for (const g of pack.adGroups) {
      rows.push([pack.campaign, g.name, "Responsive search ad", ...pad(g.headlines, 15), ...pad(g.descriptions, 4), pack.finalUrl, "", ""]);
      for (const k of g.keywords) rows.push([pack.campaign, g.name, "", ...pad([], 19), "", k, "Phrase"]);
    }
    return { filename: `${slug}-google-ads-editor.csv`, text: csv(rows) };
  }
  if (pack.format === "social") {
    const rows = [["Campaign Name", "Ad Set Name", "Ad Name", "Body", "Title", "Link Description", "Call to Action", "Link"]];
    for (const g of pack.adGroups)
      g.primaryTexts.forEach((p, i) =>
        rows.push([pack.campaign, g.name, `${g.name} – V${i + 1}`, p, g.headlines[i % g.headlines.length] ?? "", g.descriptions[i % Math.max(1, g.descriptions.length)] ?? "", g.cta, pack.finalUrl]),
      );
    return { filename: `${slug}-meta-bulk.csv`, text: csv(rows) };
  }
  const rows = [["Campaign", "Ad group", "Ad name", "Intro / ad text", "Headline", "Description", "CTA", "Destination URL"]];
  for (const g of pack.adGroups)
    g.primaryTexts.forEach((p, i) =>
      rows.push([pack.campaign, g.name, `${g.name} – V${i + 1}`, p, g.headlines[i % g.headlines.length] ?? "", g.descriptions[i % Math.max(1, g.descriptions.length)] ?? "", g.cta, pack.finalUrl]),
    );
  return { filename: `${slug}-${pack.format}-ads.csv`, text: csv(rows) };
}

function pad(a: string[], n: number) {
  return Array.from({ length: n }, (_, i) => a[i] ?? "");
}

/** UTM-tagged destination URL for a traffic node. */
export function trackingUrl(base: string, utm: { source?: string; medium?: string; campaign?: string; content?: string }) {
  if (!base) return "";
  try {
    const u = new URL(base.includes("://") ? base : `https://${base}`);
    if (utm.source) u.searchParams.set("utm_source", utm.source);
    if (utm.medium) u.searchParams.set("utm_medium", utm.medium);
    if (utm.campaign) u.searchParams.set("utm_campaign", utm.campaign);
    if (utm.content) u.searchParams.set("utm_content", utm.content);
    return u.toString();
  } catch {
    return "";
  }
}

/** Sensible default utm_source / utm_medium per traffic type. */
export function defaultUtm(type: string): { source: string; medium: string } {
  const map: Record<string, [string, string]> = {
    meta_ads: ["facebook", "paid_social"], instagram_ads: ["instagram", "paid_social"], tiktok_ads: ["tiktok", "paid_social"],
    linkedin_ads: ["linkedin", "paid_social"], pinterest_ads: ["pinterest", "paid_social"], snapchat_ads: ["snapchat", "paid_social"],
    x_ads: ["x", "paid_social"], reddit_ads: ["reddit", "paid_social"], quora_ads: ["quora", "paid_social"],
    google_search: ["google", "cpc"], google_pmax: ["google", "pmax"], google_shopping: ["google", "shopping"], google_display: ["google", "display"],
    youtube_ads: ["youtube", "paid_video"], microsoft_ads: ["bing", "cpc"], amazon_ads: ["amazon", "cpc"], apple_search_ads: ["apple", "cpc"],
    retargeting: ["retargeting", "paid_social"], email_list: ["newsletter", "email"], sms_list: ["sms", "sms"], cold_email: ["outbound", "email"],
    affiliate: ["affiliate", "affiliate"], referral: ["referral", "referral"], influencer: ["influencer", "influencer"], organic: ["google", "organic"],
    social_organic: ["social", "organic_social"], native_ads: ["native", "native"], programmatic: ["dsp", "display"], sponsored_newsletter: ["newsletter", "sponsorship"],
  };
  const [source, medium] = map[type] ?? [type.replace(/_ads?$/, ""), "paid"];
  return { source, medium };
}
