// More live connectors:
//  - LinkedIn Marketing API and TikTok Marketing API (ad metrics, OAuth)
//  - Shopify, HubSpot, Salesforce (revenue attributed to traffic steps)
// Versions come from env (LINKEDIN_API_VERSION, SHOPIFY_API_VERSION,
// SALESFORCE_API_VERSION) because each platform retires versions on a schedule.

import { defaultUtm } from "../../shared/adpack";
import type { Actuals, GraphNode } from "../../shared/model";
import type { ConnectionCtx, Connector, DailyRow } from "./index";
import { accessToken } from "./oauth";

const num = (v: unknown) => Number(v ?? 0) || 0;
const need = (name: string, hint: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`Set ${name} (${hint}).`);
  return v;
};

async function getJson(url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`${new URL(url).hostname} ${res.status}: ${JSON.stringify(data).slice(0, 240)}`);
  return data;
}

/** Sums per-day campaign rows into node rows via each node's linked campaign IDs. */
export function rollup(nodes: GraphNode[], connector: string, rows: { campaignId: string; day: string; m: Actuals }[]): DailyRow[] {
  const owner = new Map<string, string>();
  for (const n of nodes) for (const id of (n.data.platformCampaigns as Record<string, string[]> | undefined)?.[connector] ?? []) owner.set(String(id), n.id);
  const acc = new Map<string, DailyRow>();
  for (const r of rows) {
    const nodeId = owner.get(String(r.campaignId));
    if (!nodeId) continue;
    const k = `${nodeId}|${r.day}`;
    const row = acc.get(k) ?? { nodeId, day: r.day };
    for (const f of ["spend", "impressions", "clicks", "conversions", "revenue"] as const) if (r.m[f] != null) row[f] = Math.round(((row[f] ?? 0) + r.m[f]!) * 100) / 100;
    acc.set(k, row);
  }
  return [...acc.values()];
}

const monthToDate = (rows: DailyRow[]) => {
  const month = new Date().toISOString().slice(0, 7);
  const out: Record<string, Actuals> = {};
  for (const r of rows.filter((x) => x.day.startsWith(month))) {
    const a = (out[r.nodeId] ??= {});
    for (const f of ["spend", "impressions", "clicks", "conversions", "revenue"] as const) if (r[f] != null) a[f] = Math.round(((a[f] ?? 0) + r[f]!) * 100) / 100;
  }
  return out;
};
const firstOfMonth = () => new Date().toISOString().slice(0, 8) + "01";
const today = () => new Date().toISOString().slice(0, 10);

// ── LinkedIn Marketing API ─────────────────────────────────────

async function li(ctx: ConnectionCtx, path: string) {
  return getJson(`https://api.linkedin.com/rest/${path}`, {
    headers: {
      authorization: `Bearer ${await accessToken("linkedin", ctx)}`,
      "LinkedIn-Version": need("LINKEDIN_API_VERSION", "YYYYMM, see learn.microsoft.com/linkedin/marketing/versioning"),
      "X-Restli-Protocol-Version": "2.0.0",
    },
  });
}
const liDate = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return `(year:${y},month:${m},day:${day})`;
};

export const linkedin = {
  async accounts(ctx: ConnectionCtx) {
    const r = (await li(ctx, "adAccounts?q=search&pageSize=100")) as { elements?: { id: number; name: string }[] };
    return (r.elements ?? []).map((a) => ({ id: String(a.id), name: a.name }));
  },
  async campaigns(ctx: ConnectionCtx) {
    if (!ctx.account) throw new Error("Choose a LinkedIn ad account first.");
    const r = (await li(ctx, `adAccounts/${ctx.account}/adCampaigns?q=search&pageSize=500`)) as { elements?: { id: number; name: string; status: string; type: string }[] };
    return (r.elements ?? []).map((c) => ({ id: String(c.id), name: c.name, status: c.status, channel: c.type }));
  },
  async daily(nodes: GraphNode[], ctx: ConnectionCtx, from: string, to: string): Promise<DailyRow[]> {
    if (!ctx.account) throw new Error("Choose a LinkedIn ad account first.");
    const account = encodeURIComponent(`urn:li:sponsoredAccount:${ctx.account}`);
    const r = (await li(
      ctx,
      `adAnalytics?q=analytics&pivot=CAMPAIGN&timeGranularity=DAILY&dateRange=(start:${liDate(from)},end:${liDate(to)})&accounts=List(${account})&fields=costInLocalCurrency,impressions,clicks,externalWebsiteConversions,conversionValueInLocalCurrency,dateRange,pivotValues`,
    )) as { elements?: { pivotValues?: string[]; dateRange?: { start: { year: number; month: number; day: number } }; costInLocalCurrency?: string; impressions?: number; clicks?: number; externalWebsiteConversions?: number; conversionValueInLocalCurrency?: string }[] };
    return rollup(
      nodes,
      "linkedin_cm",
      (r.elements ?? []).map((e) => {
        const s = e.dateRange!.start;
        return {
          campaignId: String(e.pivotValues?.[0] ?? "").split(":").pop()!,
          day: `${s.year}-${String(s.month).padStart(2, "0")}-${String(s.day).padStart(2, "0")}`,
          m: { spend: num(e.costInLocalCurrency), impressions: num(e.impressions), clicks: num(e.clicks), conversions: num(e.externalWebsiteConversions), revenue: num(e.conversionValueInLocalCurrency) },
        };
      }),
    );
  },
};

// ── TikTok Marketing API ───────────────────────────────────────

async function tt(ctx: ConnectionCtx, path: string, params: Record<string, string>) {
  const r = (await getJson(`https://business-api.tiktok.com/open_api/v1.3/${path}?${new URLSearchParams(params)}`, {
    headers: { "Access-Token": await accessToken("tiktok", ctx) },
  })) as { code?: number; message?: string; data?: Record<string, unknown> };
  if (r.code !== 0) throw new Error(`TikTok API: ${r.message ?? "error"}`);
  return r.data ?? {};
}

export const tiktok = {
  async accounts(ctx: ConnectionCtx) {
    const ids = (ctx.creds.advertiser_ids ?? "").split(",").filter(Boolean);
    if (!ids.length) return [];
    const d = (await tt(ctx, "advertiser/info/", { advertiser_ids: JSON.stringify(ids) })) as { list?: { advertiser_id: string; name: string }[] };
    return (d.list ?? ids.map((id) => ({ advertiser_id: id, name: `Advertiser ${id}` }))).map((a) => ({ id: String(a.advertiser_id), name: a.name }));
  },
  async campaigns(ctx: ConnectionCtx) {
    if (!ctx.account) throw new Error("Choose a TikTok advertiser first.");
    const d = (await tt(ctx, "campaign/get/", { advertiser_id: ctx.account, page_size: "1000" })) as { list?: { campaign_id: string; campaign_name: string; operation_status: string; objective_type: string }[] };
    return (d.list ?? []).map((c) => ({ id: String(c.campaign_id), name: c.campaign_name, status: c.operation_status, channel: c.objective_type }));
  },
  async daily(nodes: GraphNode[], ctx: ConnectionCtx, from: string, to: string): Promise<DailyRow[]> {
    if (!ctx.account) throw new Error("Choose a TikTok advertiser first.");
    const d = (await tt(ctx, "report/integrated/get/", {
      advertiser_id: ctx.account,
      report_type: "BASIC",
      data_level: "AUCTION_CAMPAIGN",
      dimensions: JSON.stringify(["campaign_id", "stat_time_day"]),
      metrics: JSON.stringify(["spend", "impressions", "clicks", "conversion"]),
      start_date: from,
      end_date: to,
      page_size: "1000",
    })) as { list?: { dimensions: { campaign_id: string; stat_time_day: string }; metrics: Record<string, string> }[] };
    return rollup(
      nodes,
      "tiktok_ads_mgr",
      (d.list ?? []).map((r) => ({
        campaignId: r.dimensions.campaign_id,
        day: r.dimensions.stat_time_day.slice(0, 10),
        m: { spend: num(r.metrics.spend), impressions: num(r.metrics.impressions), clicks: num(r.metrics.clicks), conversions: num(r.metrics.conversion) },
      })),
    );
  },
};

// ── Revenue attribution (Shopify / HubSpot / Salesforce) ───────

/** Picks the traffic node for an order/deal: by UTM source(+campaign), else by a channel keyword. */
export function attributeNode(nodes: GraphNode[], src: string, campaign = "", channelHint = "") {
  const s = src.toLowerCase(), c = campaign.toLowerCase(), h = channelHint.toLowerCase();
  const traffic = nodes.filter((n) => n.data.kind === "traffic");
  const bySource = traffic.filter((n) => (n.data.utm?.source ?? defaultUtm(n.data.type).source).toLowerCase() === s && s);
  if (bySource.length) return bySource.find((n) => c && (n.data.utm?.campaign ?? "").toLowerCase() === c) ?? bySource[0];
  const hint = `${s} ${h}`;
  const map: [RegExp, string[]][] = [
    [/facebook|instagram|meta|fb|ig/, ["meta_ads", "instagram_ads", "retargeting"]],
    [/linkedin/, ["linkedin_ads"]],
    [/tiktok/, ["tiktok_ads"]],
    [/google|adwords|paid_search|cpc/, ["google_search", "google_pmax", "google_shopping"]],
    [/bing|microsoft/, ["microsoft_ads"]],
    [/email|newsletter|klaviyo/, ["email_list"]],
    [/organic_search|seo/, ["organic"]],
    [/referr/, ["referral", "affiliate"]],
    [/direct/, ["direct"]],
    [/social/, ["social_organic", "meta_ads"]],
  ];
  for (const [re, types] of map) if (re.test(hint)) return traffic.find((n) => types.includes(n.data.type));
}

function revenueRows(nodes: GraphNode[], items: { day: string; amount: number; src: string; campaign?: string; hint?: string }[]): DailyRow[] {
  const acc = new Map<string, DailyRow>();
  for (const it of items) {
    const n = attributeNode(nodes, it.src, it.campaign, it.hint);
    if (!n) continue;
    const k = `${n.id}|${it.day}`;
    const row = acc.get(k) ?? { nodeId: n.id, day: it.day, revenue: 0, conversions: 0 };
    row.revenue = Math.round(((row.revenue ?? 0) + it.amount) * 100) / 100;
    row.conversions = (row.conversions ?? 0) + 1;
    acc.set(k, row);
  }
  return [...acc.values()];
}

export const shopify = {
  async daily(nodes: GraphNode[], ctx: ConnectionCtx, from: string, to: string): Promise<DailyRow[]> {
    const v = need("SHOPIFY_API_VERSION", "e.g. a current YYYY-MM Admin API version from shopify.dev/docs/api/usage/versioning");
    const shop = ctx.creds.shop.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const items: { day: string; amount: number; src: string; campaign?: string }[] = [];
    let after: string | null = null;
    for (let page = 0; page < 20; page++) {
      const query = `query($q:String!,$after:String){orders(first:250,query:$q,after:$after){pageInfo{hasNextPage endCursor}nodes{createdAt totalPriceSet{shopMoney{amount}} customerJourneySummary{lastVisit{utmParameters{source campaign}} firstVisit{source}}}}}`;
      const r = (await getJson(`https://${shop}/admin/api/${v}/graphql.json`, {
        method: "POST",
        headers: { "content-type": "application/json", "X-Shopify-Access-Token": ctx.creds.token },
        body: JSON.stringify({ query, variables: { q: `created_at:>=${from} created_at:<=${to}T23:59:59`, after } }),
      })) as { data?: { orders: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: { createdAt: string; totalPriceSet: { shopMoney: { amount: string } }; customerJourneySummary?: { lastVisit?: { utmParameters?: { source?: string; campaign?: string } }; firstVisit?: { source?: string } } }[] } }; errors?: unknown };
      if (r.errors) throw new Error(`Shopify: ${JSON.stringify(r.errors).slice(0, 200)}`);
      for (const o of r.data?.orders.nodes ?? []) {
        const utm = o.customerJourneySummary?.lastVisit?.utmParameters;
        items.push({ day: o.createdAt.slice(0, 10), amount: num(o.totalPriceSet.shopMoney.amount), src: utm?.source ?? o.customerJourneySummary?.firstVisit?.source ?? "", campaign: utm?.campaign });
      }
      if (!r.data?.orders.pageInfo.hasNextPage) break;
      after = r.data.orders.pageInfo.endCursor;
    }
    return revenueRows(nodes, items);
  },
};

export const hubspot = {
  async daily(nodes: GraphNode[], ctx: ConnectionCtx, from: string, to: string): Promise<DailyRow[]> {
    const items: { day: string; amount: number; src: string; hint?: string }[] = [];
    let after: string | undefined;
    for (let page = 0; page < 20; page++) {
      const r = (await getJson("https://api.hubapi.com/crm/v3/objects/deals/search", {
        method: "POST",
        headers: { authorization: `Bearer ${ctx.creds.token}`, "content-type": "application/json" },
        body: JSON.stringify({
          filterGroups: [{ filters: [{ propertyName: "hs_is_closed_won", operator: "EQ", value: "true" }, { propertyName: "closedate", operator: "BETWEEN", value: `${from}T00:00:00Z`, highValue: `${to}T23:59:59Z` }] }],
          properties: ["amount", "closedate", "hs_analytics_source", "hs_analytics_source_data_1"],
          limit: 100,
          ...(after ? { after } : {}),
        }),
      })) as { results?: { properties: Record<string, string | null> }[]; paging?: { next?: { after: string } } };
      for (const d of r.results ?? [])
        items.push({ day: String(d.properties.closedate).slice(0, 10), amount: num(d.properties.amount), src: d.properties.hs_analytics_source_data_1 ?? "", hint: d.properties.hs_analytics_source ?? "" });
      if (!r.paging?.next?.after) break;
      after = r.paging.next.after;
    }
    return revenueRows(nodes, items);
  },
};

export const salesforce = {
  async daily(nodes: GraphNode[], ctx: ConnectionCtx, from: string, to: string): Promise<DailyRow[]> {
    const v = need("SALESFORCE_API_VERSION", "e.g. a current vNN.0 from your org's Setup → API");
    const base = ctx.creds.instance.replace(/\/$/, "");
    const soql = `SELECT Amount, CloseDate, LeadSource FROM Opportunity WHERE IsWon = true AND CloseDate >= ${from} AND CloseDate <= ${to}`;
    const items: { day: string; amount: number; src: string; hint?: string }[] = [];
    let next: string | null = `/services/data/${v}/query?q=${encodeURIComponent(soql)}`;
    for (let page = 0; next && page < 20; page++) {
      const r = (await getJson(base + next, { headers: { authorization: `Bearer ${ctx.creds.token}` } })) as { records?: { Amount: number; CloseDate: string; LeadSource: string | null }[]; nextRecordsUrl?: string };
      for (const o of r.records ?? []) items.push({ day: o.CloseDate, amount: num(o.Amount), src: "", hint: o.LeadSource ?? "" });
      next = r.nextRecordsUrl ?? null;
    }
    return revenueRows(nodes, items);
  },
};

const TRAFFIC_ALL = ["meta_ads", "instagram_ads", "tiktok_ads", "linkedin_ads", "pinterest_ads", "snapchat_ads", "x_ads", "reddit_ads", "quora_ads", "google_search", "google_pmax", "google_shopping", "google_display", "youtube_ads", "microsoft_ads", "retargeting", "organic", "social_organic", "email_list", "referral", "affiliate", "direct", "influencer"];

const withMtd = (daily: (n: GraphNode[], c: ConnectionCtx, f: string, t: string) => Promise<DailyRow[]>) => async (nodes: GraphNode[], ctx: ConnectionCtx) => monthToDate(await daily(nodes, ctx, firstOfMonth(), today()));

export const PROVIDER_CONNECTORS_2: Record<string, Connector> = {
  linkedin_cm: { type: "linkedin_cm", live: true, oauth: "linkedin", fields: [], reportsOn: ["linkedin_ads", "abm_ads"], fetchDaily: linkedin.daily, fetchMetrics: withMtd(linkedin.daily) },
  tiktok_ads_mgr: { type: "tiktok_ads_mgr", live: true, oauth: "tiktok", fields: [], reportsOn: ["tiktok_ads"], fetchDaily: tiktok.daily, fetchMetrics: withMtd(tiktok.daily) },
  shopify: {
    type: "shopify",
    live: true,
    fields: [
      { key: "shop", label: "Shop domain", placeholder: "mystore.myshopify.com" },
      { key: "token", label: "Admin API access token (custom app with read_orders)", secret: true },
    ],
    reportsOn: TRAFFIC_ALL,
    fetchDaily: shopify.daily,
    fetchMetrics: withMtd(shopify.daily),
  },
  hubspot: {
    type: "hubspot",
    live: true,
    fields: [{ key: "token", label: "Private app token (crm.objects.deals.read)", secret: true }],
    reportsOn: TRAFFIC_ALL,
    fetchDaily: hubspot.daily,
    fetchMetrics: withMtd(hubspot.daily),
  },
  salesforce: {
    type: "salesforce",
    live: true,
    fields: [
      { key: "instance", label: "Instance URL", placeholder: "https://yourorg.my.salesforce.com" },
      { key: "token", label: "Access token", secret: true },
    ],
    reportsOn: TRAFFIC_ALL,
    fetchDaily: salesforce.daily,
    fetchMetrics: withMtd(salesforce.daily),
  },
};

export const ACCOUNT_LISTERS_2 = { linkedin_cm: linkedin.accounts, tiktok_ads_mgr: tiktok.accounts };
export const CAMPAIGN_LISTERS_2 = { linkedin_cm: linkedin.campaigns, tiktok_ads_mgr: tiktok.campaigns };
