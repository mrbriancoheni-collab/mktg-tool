// Unit tests: collaboration ops, simulator, and ad-platform response parsing
// (against mocked HTTP — live calls need real credentials).
import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { CATALOG_BY_TYPE } from "../shared/catalog";
import { applyOps, diffStates, type BoardState } from "../shared/ops";
import { simulate } from "../shared/simulate";
import { buildTemplate } from "../shared/templates";

process.env.GOOGLE_ADS_API_VERSION = "vTEST";
process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "dev-token";
process.env.META_GRAPH_VERSION = "vTEST.0";
process.env.META_APP_ID = "app";
process.env.META_APP_SECRET = "secret";
process.env.GOOGLE_CLIENT_ID = "gid";
process.env.GOOGLE_CLIENT_SECRET = "gsecret";

const { googleAds, ga4, metaAds } = await import("../server/integrations/providers");

const realFetch = globalThis.fetch;
afterEach(() => (globalThis.fetch = realFetch));
const calls: { url: string; init?: RequestInit }[] = [];
function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  calls.length = 0;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(handler(String(url), init)), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

const ctx = (account: string, creds: Record<string, string> = {}) => ({
  workspaceId: "w",
  account,
  meta: {},
  creds: { access_token: "tok", refresh_token: "r", expires_at: String(Date.now() + 3600e3), ...creds },
  saveCreds: async () => {},
});

const node = (id: string, type: string, extra: object = {}) => ({ id, data: { type, kind: "traffic" as const, label: id, ...extra } });

describe("collaboration ops", () => {
  const base: BoardState = { name: "A", goal: "", summary: "", analysis: null, nodes: [node("n1", "meta_ads"), node("n2", "landing_page")], edges: [{ id: "e1", source: "n1", target: "n2" }] };

  test("diff + apply round-trips", () => {
    const next: BoardState = { ...base, name: "B", nodes: [{ ...base.nodes[0], data: { ...base.nodes[0].data, label: "changed" } }, node("n3", "checkout")], edges: [] };
    const ops = diffStates(base, next);
    assert.deepEqual(applyOps(base, ops), next);
  });

  test("concurrent edits to different nodes both survive", () => {
    const a = diffStates(base, { ...base, nodes: [{ ...base.nodes[0], data: { ...base.nodes[0].data, label: "Alice" } }, base.nodes[1]] });
    const b = diffStates(base, { ...base, nodes: [base.nodes[0], { ...base.nodes[1], data: { ...base.nodes[1].data, label: "Bob" } }] });
    const merged = applyOps(applyOps(base, a), b);
    assert.equal(merged.nodes.find((n) => n.id === "n1")!.data.label, "Alice");
    assert.equal(merged.nodes.find((n) => n.id === "n2")!.data.label, "Bob");
  });

  test("deleting a node drops its dangling edges", () => {
    const out = applyOps(base, [{ t: "node.del", id: "n2" }]);
    assert.equal(out.edges.length, 0);
  });
});

describe("simulator", () => {
  test("templates produce plausible forecasts", () => {
    for (const id of ["ecom", "b2b", "webinar"] as const) {
      const p = buildTemplate(id);
      const g = { name: p.name, nodes: p.nodes.map((n) => ({ id: n.id, data: { ...n, kind: undefined as never } })), edges: p.edges.map((e, i) => ({ id: `e${i}`, ...e, data: {} })) };
      // kinds come from the catalog in the real app; mimic that here
      for (const n of g.nodes) (n.data as Record<string, unknown>).kind = CATALOG_BY_TYPE[n.data.type].kind;
      for (const n of g.nodes) for (const k of Object.keys(n.data)) if ((n.data as Record<string, unknown>)[k] === null) delete (n.data as Record<string, unknown>)[k];
      const t = simulate(g as never).totals;
      assert.ok(t.spend > 0 && t.customers > 0, `${id} has spend and customers`);
      assert.ok(t.roas > 1 && t.roas < 20, `${id} ROAS ${t.roas} is plausible`);
    }
  });
});

describe("Google Ads connector", () => {
  test("sums current-month metrics for linked campaigns", async () => {
    mockFetch(() => [
      { results: [{ campaign: { id: "111" }, metrics: { costMicros: "12500000", impressions: "1000", clicks: "50", conversions: 4, conversionsValue: 400 } }] },
      { results: [{ campaign: { id: "222" }, metrics: { costMicros: "2500000", impressions: "500", clicks: "10", conversions: 1, conversionsValue: 50 } }] },
    ]);
    const out = await googleAds.metrics([node("a", "google_search", { platformCampaigns: { google_ads_mgr: ["111", "222"] } }), node("b", "google_search")] as never, ctx("123-456-7890") as never);
    assert.deepEqual(out.a, { spend: 15, impressions: 1500, clicks: 60, conversions: 5, revenue: 450 });
    assert.equal(out.b, undefined); // unlinked nodes are skipped
    assert.match(calls[0].url, /googleads\.googleapis\.com\/vTEST\/customers\/1234567890\/googleAds:searchStream/);
    const h = calls[0].init!.headers as Record<string, string>;
    assert.equal(h["developer-token"], "dev-token");
    assert.equal(h.authorization, "Bearer tok");
    assert.match(JSON.parse(String(calls[0].init!.body)).query, /DURING THIS_MONTH/);
  });

  test("refreshes an expired Google token and saves it", async () => {
    let saved: Record<string, string> | null = null;
    mockFetch((url) => (url.includes("oauth2") ? { access_token: "fresh", expires_in: 3600 } : { resourceNames: ["customers/9998887777"] }));
    const c = { ...ctx("x", { expires_at: "0" }), saveCreds: async (cr: Record<string, string>) => void (saved = cr) };
    const accts = await googleAds.accounts(c as never);
    assert.equal(accts[0].id, "9998887777");
    assert.equal(saved!.access_token, "fresh");
    assert.equal((calls[1].init!.headers as Record<string, string>).authorization, "Bearer fresh");
  });

  test("publishes search ad packs as PAUSED ad groups + RSAs + keywords", async () => {
    mockFetch((url) => (url.includes("adGroups:mutate") ? { results: [{ resourceName: "customers/1/adGroups/9" }] } : { results: [] }));
    const pack = { format: "search" as const, campaign: "C", finalUrl: "https://x.co", adGroups: [{ name: "G", headlines: ["H1", "H2", "H3"], descriptions: ["D1", "D2"], primaryTexts: [], keywords: ["kw one"], cta: "" }] };
    const r = await googleAds.publish(ctx("1") as never, "555", pack);
    assert.deepEqual(r.created, ["customers/1/adGroups/9"]);
    const bodies = calls.map((c) => JSON.parse(String(c.init!.body)));
    assert.equal(bodies[0].operations[0].create.status, "PAUSED");
    assert.equal(bodies[0].operations[0].create.campaign, "customers/1/campaigns/555");
    assert.equal(bodies[1].operations[0].create.status, "PAUSED");
    assert.equal(bodies[1].operations[0].create.ad.responsiveSearchAd.headlines.length, 3);
    assert.equal(bodies[2].operations[0].create.keyword.matchType, "PHRASE");
  });
});

describe("Meta connector", () => {
  test("parses insights with conversion actions and purchase value", async () => {
    mockFetch(() => ({
      data: [
        {
          campaign_id: "c1",
          spend: "100.50",
          impressions: "20000",
          clicks: "400",
          actions: [{ action_type: "purchase", value: "6" }, { action_type: "link_click", value: "400" }, { action_type: "lead", value: "2" }],
          action_values: [{ action_type: "purchase", value: "540.00" }],
        },
      ],
    }));
    const out = await metaAds.metrics([node("m", "meta_ads", { platformCampaigns: { meta_ads_mgr: ["c1"] } })] as never, ctx("act_42") as never);
    assert.deepEqual(out.m, { spend: 100.5, impressions: 20000, clicks: 400, conversions: 8, revenue: 540 });
    const u = new URL(calls[0].url);
    assert.equal(u.pathname, "/vTEST.0/act_42/insights");
    assert.equal(u.searchParams.get("date_preset"), "this_month");
    assert.ok(u.searchParams.get("appsecret_proof"), "requests are signed with appsecret_proof");
  });

  test("expired Meta tokens ask the user to reconnect", async () => {
    await assert.rejects(metaAds.campaigns(ctx("act_1", { expires_at: "0" }) as never), /reconnect/i);
  });
});

describe("GA4 connector", () => {
  test("matches traffic nodes by UTM; paid nodes get revenue only", async () => {
    mockFetch(() => ({
      rows: [
        { dimensionValues: [{ value: "google" }, { value: "spring" }], metricValues: [{ value: "300" }, { value: "12" }, { value: "900" }] },
        { dimensionValues: [{ value: "newsletter" }, { value: "(not set)" }], metricValues: [{ value: "150" }, { value: "9" }, { value: "200" }] },
      ],
    }));
    const out = await ga4.metrics([node("paid", "google_search", { budget: 1000 }), node("email", "email_list")] as never, ctx("12345") as never);
    assert.deepEqual(out.paid, { revenue: 900 });
    assert.deepEqual(out.email, { clicks: 150, conversions: 9, revenue: 200 });
    assert.match(calls[0].url, /properties\/12345:runReport/);
    assert.ok(JSON.parse(String(calls[0].init!.body)).metrics.some((m: { name: string }) => m.name === "keyEvents"));
  });
});
