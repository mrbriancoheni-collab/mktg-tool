// Live ad-platform connectors: Google Ads, Google Analytics 4, Meta Marketing API.
// Metrics are pulled for the current month. Nodes are matched to platform
// data by the campaign IDs linked on each node (Google Ads / Meta) or by UTM
// parameters (GA4).
//
// API versions are configured by env (GOOGLE_ADS_API_VERSION, META_GRAPH_VERSION)
// because both platforms retire versions regularly.

import { defaultUtm, type AdPack } from "../../shared/adpack";
import type { Actuals, GraphNode } from "../../shared/model";
import type { ConnectionCtx, Connector, DailyRow } from "./index";
import { accessToken, appSecretProof, graphVersion } from "./oauth";
import { ACCOUNT_LISTERS_2, CAMPAIGN_LISTERS_2 } from "./providers2";

const num = (v: unknown) => Number(v ?? 0) || 0;

// ── Google Ads ──────────────────────────────────────────────────────

function adsBase() {
  const v = process.env.GOOGLE_ADS_API_VERSION;
  if (!v) throw new Error("Set GOOGLE_ADS_API_VERSION to a supported Google Ads API version (see developers.google.com/google-ads/api/docs/release-notes).");
  return `https://googleads.googleapis.com/${v}`;
}

async function adsHeaders(ctx: ConnectionCtx) {
  const dev = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!dev) throw new Error("Set GOOGLE_ADS_DEVELOPER_TOKEN.");
  const h: Record<string, string> = { authorization: `Bearer ${await accessToken("google", ctx)}`, "developer-token": dev, "content-type": "application/json" };
  const login = (ctx.meta.loginCustomerId as string) ?? process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  if (login) h["login-customer-id"] = String(login).replace(/-/g, "");
  return h;
}

async function gfetch(url: string, init: RequestInit) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: { message?: string } })?.error?.message ?? JSON.stringify(data).slice(0, 300);
    throw new Error(`Google API ${res.status}: ${msg}`);
  }
  return data;
}

const cid = (ctx: ConnectionCtx) => {
  if (!ctx.account) throw new Error("Choose a Google Ads account first.");
  return ctx.account.replace(/-/g, "");
};

export async function gaql(ctx: ConnectionCtx, query: string) {
  const batches = (await gfetch(`${adsBase()}/customers/${cid(ctx)}/googleAds:searchStream`, {
    method: "POST",
    headers: await adsHeaders(ctx),
    body: JSON.stringify({ query }),
  })) as { results?: Record<string, Record<string, unknown>>[] }[];
  return batches.flatMap((b) => b.results ?? []);
}

export const googleAds = {
  async accounts(ctx: ConnectionCtx) {
    const r = (await gfetch(`${adsBase()}/customers:listAccessibleCustomers`, { headers: await adsHeaders(ctx) })) as { resourceNames?: string[] };
    return (r.resourceNames ?? []).map((rn) => {
      const id = rn.split("/")[1];
      return { id, name: `Customer ${id.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3")}` };
    });
  },
  async campaigns(ctx: ConnectionCtx) {
    const rows = await gaql(ctx, "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type FROM campaign WHERE campaign.status != 'REMOVED' ORDER BY campaign.name");
    return rows.map((r) => ({ id: String(r.campaign.id), name: String(r.campaign.name), status: String(r.campaign.status), channel: String(r.campaign.advertisingChannelType ?? "") }));
  },
  async metrics(nodes: GraphNode[], ctx: ConnectionCtx) {
    const rows = await gaql(
      ctx,
      "SELECT campaign.id, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date DURING THIS_MONTH",
    );
    const byCampaign = new Map(rows.map((r) => [String(r.campaign.id), r.metrics]));
    return sumByLinkedCampaigns(nodes, "google_ads_mgr", (id) => {
      const m = byCampaign.get(id);
      return m && { spend: num(m.costMicros) / 1e6, impressions: num(m.impressions), clicks: num(m.clicks), conversions: num(m.conversions), revenue: num(m.conversionsValue) };
    });
  },
  async daily(nodes: GraphNode[], ctx: ConnectionCtx, from: string, to: string): Promise<DailyRow[]> {
    const rows = await gaql(
      ctx,
      `SELECT campaign.id, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN '${from}' AND '${to}'`,
    );
    return dailyByLinkedCampaigns(nodes, "google_ads_mgr", rows.map((r) => ({
      campaignId: String(r.campaign.id),
      day: String(r.segments.date),
      m: { spend: num(r.metrics.costMicros) / 1e6, impressions: num(r.metrics.impressions), clicks: num(r.metrics.clicks), conversions: num(r.metrics.conversions), revenue: num(r.metrics.conversionsValue) },
    })));
  },
  /** Creates PAUSED ad groups with responsive search ads + phrase keywords in an existing campaign. */
  async publish(ctx: ConnectionCtx, campaignId: string, pack: AdPack) {
    if (pack.format !== "search") throw new Error("Google Ads publishing supports search ad packs.");
    const c = cid(ctx);
    const headers = await adsHeaders(ctx);
    const created: string[] = [];
    for (const g of pack.adGroups) {
      const ag = (await gfetch(`${adsBase()}/customers/${c}/adGroups:mutate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ operations: [{ create: { name: `${g.name} (AdCanvas draft ${new Date().toISOString().slice(0, 10)})`, campaign: `customers/${c}/campaigns/${campaignId}`, status: "PAUSED", type: "SEARCH_STANDARD" } }] }),
      })) as { results: { resourceName: string }[] };
      const adGroup = ag.results[0].resourceName;
      await gfetch(`${adsBase()}/customers/${c}/adGroupAds:mutate`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          operations: [
            {
              create: {
                adGroup,
                status: "PAUSED",
                ad: {
                  finalUrls: [pack.finalUrl],
                  responsiveSearchAd: { headlines: g.headlines.map((text) => ({ text })), descriptions: g.descriptions.map((text) => ({ text })) },
                },
              },
            },
          ],
        }),
      });
      if (g.keywords.length)
        await gfetch(`${adsBase()}/customers/${c}/adGroupCriteria:mutate`, {
          method: "POST",
          headers,
          body: JSON.stringify({ operations: g.keywords.map((text) => ({ create: { adGroup, status: "ENABLED", keyword: { text, matchType: "PHRASE" } } })) }),
        });
      created.push(adGroup);
    }
    return { created, note: "Ad groups and ads were created PAUSED. Review and enable them in Google Ads." };
  },
};

// ── Google Analytics 4 ─────────────────────────────────────────────

export const ga4 = {
  async accounts(ctx: ConnectionCtx) {
    const r = (await gfetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200", {
      headers: { authorization: `Bearer ${await accessToken("google", ctx)}` },
    })) as { accountSummaries?: { displayName: string; propertySummaries?: { property: string; displayName: string }[] }[] };
    return (r.accountSummaries ?? []).flatMap((a) => (a.propertySummaries ?? []).map((p) => ({ id: p.property.split("/")[1], name: `${a.displayName} › ${p.displayName}` })));
  },
  /** Matches traffic nodes by UTM source (+ campaign when set). Paid nodes get revenue only; unpaid nodes also get sessions/key events. */
  async metrics(nodes: GraphNode[], ctx: ConnectionCtx) {
    if (!ctx.account) throw new Error("Choose a GA4 property first.");
    const now = new Date();
    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const r = (await gfetch(`https://analyticsdata.googleapis.com/v1beta/properties/${ctx.account}:runReport`, {
      method: "POST",
      headers: { authorization: `Bearer ${await accessToken("google", ctx)}`, "content-type": "application/json" },
      body: JSON.stringify({
        dateRanges: [{ startDate: start, endDate: "today" }],
        dimensions: [{ name: "sessionSource" }, { name: "sessionCampaignName" }],
        metrics: [{ name: "sessions" }, { name: "keyEvents" }, { name: "totalRevenue" }],
        limit: 10000,
      }),
    })) as { rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[] };
    const out: Record<string, Actuals> = {};
    for (const n of nodes) {
      const src = (n.data.utm?.source ?? defaultUtm(n.data.type).source).toLowerCase();
      const camp = (n.data.utm?.campaign ?? "").toLowerCase();
      const match = (r.rows ?? []).filter((row) => row.dimensionValues[0].value.toLowerCase() === src && (!camp || row.dimensionValues[1].value.toLowerCase() === camp));
      if (!match.length) continue;
      const sessions = match.reduce((s, x) => s + num(x.metricValues[0].value), 0);
      const keyEvents = match.reduce((s, x) => s + num(x.metricValues[1].value), 0);
      const revenue = match.reduce((s, x) => s + num(x.metricValues[2].value), 0);
      out[n.id] = n.data.budget ? { revenue } : { clicks: sessions, conversions: keyEvents, revenue };
    }
    return out;
  },
};

// ── Meta Marketing API ─────────────────────────────────────────────

async function meta(ctx: ConnectionCtx, path: string, params: Record<string, string> = {}, method: "GET" | "POST" = "GET") {
  const token = await accessToken("meta", ctx);
  const q = new URLSearchParams({ ...params, access_token: token, appsecret_proof: appSecretProof(token) });
  const url = `https://graph.facebook.com/${graphVersion()}/${path}`;
  const res = await fetch(method === "GET" ? `${url}?${q}` : url, {
    method,
    ...(method === "POST" ? { body: q, headers: { "content-type": "application/x-www-form-urlencoded" } } : {}),
    signal: AbortSignal.timeout(30000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
  if (!res.ok || data.error) throw new Error(`Meta API: ${data.error?.message ?? res.status}`);
  return data;
}

const act = (ctx: ConnectionCtx) => {
  if (!ctx.account) throw new Error("Choose a Meta ad account first.");
  return ctx.account.startsWith("act_") ? ctx.account : `act_${ctx.account}`;
};

/** Meta action types counted as conversions; override with META_CONVERSION_ACTIONS (comma-separated). */
const conversionActions = () => (process.env.META_CONVERSION_ACTIONS ?? "purchase,lead,complete_registration").split(",").map((s) => s.trim());

export const metaAds = {
  async accounts(ctx: ConnectionCtx) {
    const r = (await meta(ctx, "me/adaccounts", { fields: "id,name,account_status", limit: "200" })) as { data?: { id: string; name: string }[] };
    return (r.data ?? []).map((a) => ({ id: a.id, name: a.name }));
  },
  async pages(ctx: ConnectionCtx) {
    const r = (await meta(ctx, "me/accounts", { fields: "id,name", limit: "200" })) as { data?: { id: string; name: string }[] };
    return r.data ?? [];
  },
  async campaigns(ctx: ConnectionCtx) {
    const r = (await meta(ctx, `${act(ctx)}/campaigns`, { fields: "id,name,status,objective", limit: "500" })) as { data?: { id: string; name: string; status: string; objective: string }[] };
    return (r.data ?? []).map((c) => ({ id: c.id, name: c.name, status: c.status, channel: c.objective }));
  },
  async metrics(nodes: GraphNode[], ctx: ConnectionCtx) {
    const r = (await meta(ctx, `${act(ctx)}/insights`, {
      level: "campaign",
      date_preset: "this_month",
      fields: "campaign_id,spend,impressions,clicks,actions,action_values",
      limit: "500",
    })) as { data?: { campaign_id: string; spend: string; impressions: string; clicks: string; actions?: { action_type: string; value: string }[]; action_values?: { action_type: string; value: string }[] }[] };
    const types = new Set(conversionActions());
    const byCampaign = new Map(
      (r.data ?? []).map((row) => [
        row.campaign_id,
        {
          spend: num(row.spend),
          impressions: num(row.impressions),
          clicks: num(row.clicks),
          conversions: (row.actions ?? []).filter((a) => types.has(a.action_type)).reduce((s, a) => s + num(a.value), 0),
          revenue: (row.action_values ?? []).filter((a) => a.action_type === "purchase").reduce((s, a) => s + num(a.value), 0),
        },
      ]),
    );
    return sumByLinkedCampaigns(nodes, "meta_ads_mgr", (id) => byCampaign.get(id));
  },
  async daily(nodes: GraphNode[], ctx: ConnectionCtx, from: string, to: string): Promise<DailyRow[]> {
    const types = new Set(conversionActions());
    const out: { campaignId: string; day: string; m: Actuals }[] = [];
    let after: string | undefined;
    for (let page = 0; page < 20; page++) {
      const r = (await meta(ctx, `${act(ctx)}/insights`, {
        level: "campaign",
        time_increment: "1",
        time_range: JSON.stringify({ since: from, until: to }),
        fields: "campaign_id,spend,impressions,clicks,actions,action_values,date_start",
        limit: "500",
        ...(after ? { after } : {}),
      })) as { data?: { campaign_id: string; date_start: string; spend: string; impressions: string; clicks: string; actions?: { action_type: string; value: string }[]; action_values?: { action_type: string; value: string }[] }[]; paging?: { cursors?: { after?: string }; next?: string } };
      for (const row of r.data ?? [])
        out.push({
          campaignId: row.campaign_id,
          day: row.date_start,
          m: {
            spend: num(row.spend),
            impressions: num(row.impressions),
            clicks: num(row.clicks),
            conversions: (row.actions ?? []).filter((a) => types.has(a.action_type)).reduce((s, a) => s + num(a.value), 0),
            revenue: (row.action_values ?? []).filter((a) => a.action_type === "purchase").reduce((s, a) => s + num(a.value), 0),
          },
        });
      if (!r.paging?.next || !r.paging.cursors?.after) break;
      after = r.paging.cursors.after;
    }
    return dailyByLinkedCampaigns(nodes, "meta_ads_mgr", out);
  },
  /** Creates ad creatives (not live ads) from an ad pack. Attach them to ad sets in Ads Manager. */
  async publish(ctx: ConnectionCtx, pageId: string, pack: AdPack) {
    if (!pageId) throw new Error("Choose the Facebook Page the ads will run from.");
    const created: string[] = [];
    for (const g of pack.adGroups) {
      for (let i = 0; i < g.primaryTexts.length; i++) {
        const spec = {
          page_id: pageId,
          link_data: {
            link: pack.finalUrl,
            message: g.primaryTexts[i],
            name: g.headlines[i % Math.max(1, g.headlines.length)] ?? "",
            description: g.descriptions[i % Math.max(1, g.descriptions.length)] ?? "",
            ...(g.cta ? { call_to_action: { type: g.cta, value: { link: pack.finalUrl } } } : {}),
          },
        };
        const r = (await meta(ctx, `${act(ctx)}/adcreatives`, { name: `${g.name} – V${i + 1} (AdCanvas)`, object_story_spec: JSON.stringify(spec) }, "POST")) as { id: string };
        created.push(r.id);
      }
    }
    return { created, note: "Ad creatives were created in your ad account. Attach them to ad sets in Ads Manager to run them." };
  },
};

/** Sums per-day campaign metrics into per-day node rows via each node's linked campaigns. */
function dailyByLinkedCampaigns(nodes: GraphNode[], connector: string, rows: { campaignId: string; day: string; m: Actuals }[]): DailyRow[] {
  const owner = new Map<string, string>();
  for (const n of nodes) for (const id of (n.data.platformCampaigns as Record<string, string[]> | undefined)?.[connector] ?? []) owner.set(id, n.id);
  const acc = new Map<string, DailyRow>();
  for (const r of rows) {
    const nodeId = owner.get(r.campaignId);
    if (!nodeId) continue;
    const k = `${nodeId}|${r.day}`;
    const row = acc.get(k) ?? { nodeId, day: r.day, spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 };
    for (const f of ["spend", "impressions", "clicks", "conversions", "revenue"] as const) row[f] = Math.round(((row[f] ?? 0) + (r.m[f] ?? 0)) * 100) / 100;
    acc.set(k, row);
  }
  return [...acc.values()];
}

/** Sums platform metrics across the campaign IDs linked on each node. */
function sumByLinkedCampaigns(nodes: GraphNode[], connector: string, get: (campaignId: string) => Actuals | undefined) {
  const out: Record<string, Actuals> = {};
  for (const n of nodes) {
    const ids = (n.data.platformCampaigns as Record<string, string[]> | undefined)?.[connector] ?? [];
    if (!ids.length) continue;
    const sum: Required<Actuals> = { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 };
    let found = false;
    for (const id of ids) {
      const m = get(id);
      if (!m) continue;
      found = true;
      for (const k of Object.keys(sum) as (keyof Actuals)[]) sum[k] += m[k] ?? 0;
    }
    if (found) out[n.id] = { ...sum, spend: Math.round(sum.spend * 100) / 100, revenue: Math.round(sum.revenue * 100) / 100 };
  }
  return out;
}

const GOOGLE_TRAFFIC = ["google_search", "google_pmax", "google_shopping", "google_display", "youtube_ads"];
const META_TRAFFIC = ["meta_ads", "instagram_ads", "retargeting"];
const UTM_TRAFFIC = ["microsoft_ads", "organic", "social_organic", "direct", "email_list", "sms_list", "referral", "affiliate", "influencer", "pinterest_ads", "reddit_ads", "x_ads", "linkedin_ads", "tiktok_ads", "native_ads", "sponsored_newsletter", "cold_email", "community", "pr"];

export const PROVIDER_CONNECTORS: Record<string, Connector> = {
  google_ads_mgr: { type: "google_ads_mgr", live: true, oauth: "google", fields: [], reportsOn: GOOGLE_TRAFFIC, fetchMetrics: googleAds.metrics, fetchDaily: googleAds.daily },
  ga4: { type: "ga4", live: true, oauth: "google", fields: [], reportsOn: [...GOOGLE_TRAFFIC, ...META_TRAFFIC, ...UTM_TRAFFIC], fetchMetrics: ga4.metrics },
  meta_ads_mgr: { type: "meta_ads_mgr", live: true, oauth: "meta", fields: [], reportsOn: META_TRAFFIC, fetchMetrics: metaAds.metrics, fetchDaily: metaAds.daily },
};

export const ACCOUNT_LISTERS: Record<string, (ctx: ConnectionCtx) => Promise<{ id: string; name: string }[]>> = {
  google_ads_mgr: googleAds.accounts,
  ga4: ga4.accounts,
  meta_ads_mgr: metaAds.accounts,
  ...ACCOUNT_LISTERS_2,
};

export const CAMPAIGN_LISTERS: Record<string, (ctx: ConnectionCtx) => Promise<{ id: string; name: string; status: string; channel: string }[]>> = {
  google_ads_mgr: googleAds.campaigns,
  meta_ads_mgr: metaAds.campaigns,
  ...CAMPAIGN_LISTERS_2,
};
