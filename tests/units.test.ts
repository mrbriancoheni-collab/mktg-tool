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

describe("AI canvas edits", async () => {
  const { changesToOps, interpretDemo, blankChange } = await import("../shared/aiedit");
  const g = {
    name: "T",
    nodes: [
      { id: "t1", position: { x: 0, y: 0 }, data: { type: "meta_ads", kind: "traffic" as const, label: "Meta", budget: 1000, cpc: 1 } },
      { id: "p1", position: { x: 320, y: 0 }, data: { type: "landing_page", kind: "page" as const, label: "LP", conversionRate: 10 } },
      { id: "c1", position: { x: 640, y: 0 }, data: { type: "checkout", kind: "page" as const, label: "Checkout", conversionRate: 50, price: 50 } },
    ],
    edges: [{ id: "e1", source: "t1", target: "p1" }, { id: "e2", source: "p1", target: "c1" }],
  };

  test("add with refs, update, connect, remove", () => {
    const { ops, warnings, described } = changesToOps(g, [
      blankChange({ action: "add", ref: "new1", type: "upsell", from: "c1", price: 30 }),
      blankChange({ action: "update", id: "t1", budget: 800 }),
      blankChange({ action: "connect", from: "new1", to: "p1" }),
      blankChange({ action: "remove", id: "nope" }),
    ]);
    const added = ops.find((o) => o.t === "node.put" && o.node.data.type === "upsell") as { node: { id: string; position: { x: number }; data: { price: number } } };
    assert.equal(added.node.position.x, 960);
    assert.equal(added.node.data.price, 30);
    assert.ok(ops.some((o) => o.t === "edge.put" && o.edge.source === "c1" && o.edge.target === added.node.id));
    assert.ok(ops.some((o) => o.t === "edge.put" && o.edge.source === added.node.id && o.edge.target === "p1"));
    assert.ok(ops.some((o) => o.t === "node.put" && o.node.id === "t1" && o.node.data.budget === 800));
    assert.equal(warnings.length, 1);
    assert.match(described.join(" "), /budget \$1,000 → \$800/);
  });

  test("demo interpreter handles common requests", () => {
    assert.equal(interpretDemo(g, "cut budget by 25%")!.changes[0].budget, 750);
    assert.equal(interpretDemo(g, "add an upsell")!.changes[0].from, "c1");
    const rt = interpretDemo(g, "Add retargeting")!;
    assert.equal(rt.changes[0].type, "retargeting");
    assert.equal(rt.changes[1].action, "connect");
    assert.equal(interpretDemo(g, "remove checkout")!.changes[0].id, "c1");
    assert.equal(interpretDemo(g, "what is ROAS?"), null);
  });
});

describe("campaign auto-match", async () => {
  const { matchCampaigns } = await import("../shared/automatch");
  const n = (id: string, type: string, label: string, utm?: string) => ({ id, data: { type, kind: "traffic" as const, label, utm: utm ? { campaign: utm } : undefined } });
  test("matches by channel keywords and names", () => {
    const nodes = [n("s", "google_search", "Google – High-Intent Keywords"), n("p", "google_pmax", "PMax – Shopping"), n("r", "retargeting", "Retargeting – Site Visitors")];
    const out = matchCampaigns(nodes as never, [
      { id: "1", name: "US | Search | NonBrand" },
      { id: "2", name: "PMax - All Products" },
      { id: "3", name: "RMKT 30d visitors" },
    ], "google_ads_mgr");
    const where = (cid: string) => out.find((s) => s.campaigns.some((c) => c.id === cid))?.nodeId;
    assert.equal(where("1"), "s");
    assert.equal(where("2"), "p");
    assert.equal(where("3"), "r");
  });
  test("single eligible node receives all campaigns", () => {
    const out = matchCampaigns([n("m", "meta_ads", "Meta – Cold")] as never, [{ id: "a", name: "Prospecting LAL" }, { id: "b", name: "Broad UGC" }], "meta_ads_mgr");
    assert.equal(out[0].campaigns.length, 2);
  });
});

describe("scenarios, optimizer, experiment stats", async () => {
  const { applyScenario, optimizeBudget, abTest, sampleSizePerVariant } = await import("../shared/optimize");
  const g = {
    name: "T",
    nodes: [
      { id: "good", data: { type: "meta_ads", kind: "traffic" as const, label: "Cheap", budget: 5000, cpc: 0.5 } },
      { id: "bad", data: { type: "linkedin_ads", kind: "traffic" as const, label: "Pricey", budget: 5000, cpc: 5 } },
      { id: "lp", data: { type: "landing_page", kind: "page" as const, label: "LP", conversionRate: 10 } },
      { id: "co", data: { type: "checkout", kind: "page" as const, label: "CO", conversionRate: 50, price: 100 } },
    ],
    edges: [{ id: "a", source: "good", target: "lp" }, { id: "b", source: "bad", target: "lp" }, { id: "c", source: "lp", target: "co" }],
  };
  test("scenario raises CPC and lowers revenue", () => {
    const base = simulate(g as never).totals;
    const worse = simulate(applyScenario(g as never, { cpc: 30, conversion: 0, price: 0, budget: 0 }) as never).totals;
    assert.ok(worse.revenue < base.revenue);
    assert.equal(Math.round(worse.spend), Math.round(base.spend));
  });
  test("optimizer shifts budget toward the efficient channel, keeping total budget", () => {
    const r = optimizeBudget(g as never, "profit")!;
    const good = r.budgets.find((b) => b.nodeId === "good")!, bad = r.budgets.find((b) => b.nodeId === "bad")!;
    assert.ok(good.to > good.from && bad.to < bad.from);
    assert.ok(Math.abs(good.to + bad.to - 10000) <= 2);
    assert.ok(r.after.profit >= r.before.profit);
    assert.ok(bad.to >= 2500, "respects the 50% floor");
  });
  test("A/B significance and sample size", () => {
    const sig = abTest({ visitors: 5000, conversions: 250 }, { visitors: 5000, conversions: 320 })!;
    assert.ok(sig.significant && sig.lift > 0.25 && sig.pValue < 0.01);
    assert.equal(abTest({ visitors: 100, conversions: 5 }, { visitors: 100, conversions: 6 })!.significant, false);
    const n = sampleSizePerVariant(0.05, 0.2);
    assert.ok(n > 7000 && n < 9000, `n=${n}`);
  });
});

describe("template gallery", () => {
  test("every template builds a valid, plausible funnel", async () => {
    const { TEMPLATES, buildTemplate } = await import("../shared/templates");
    assert.ok(TEMPLATES.length >= 10);
    for (const t of TEMPLATES) {
      const p = buildTemplate(t.id);
      for (const nd of p.nodes) assert.ok(CATALOG_BY_TYPE[nd.type], `${t.id}: unknown type ${nd.type}`);
      for (const ed of p.edges) assert.ok(p.nodes.some((x) => x.id === ed.source) && p.nodes.some((x) => x.id === ed.target), `${t.id}: dangling edge`);
      const g = { name: p.name, nodes: p.nodes.map((x) => ({ id: x.id, data: { ...Object.fromEntries(Object.entries(x).filter(([, v]) => v !== null)), kind: CATALOG_BY_TYPE[x.type].kind } })), edges: p.edges.map((x, i) => ({ id: `e${i}`, ...x, data: x.weight ? { weight: x.weight } : {} })) };
      const tot = simulate(g as never).totals;
      assert.ok(tot.customers > 0, `${t.id} has customers`);
      assert.ok(tot.roas > 0.8 && tot.roas < 25, `${t.id} ROAS ${tot.roas.toFixed(2)} plausible`);
    }
  });
});

describe("TOTP", async () => {
  const { totp, verifyTotp, base32Encode } = await import("../server/totp");
  test("matches the RFC 6238 SHA-1 test vectors", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    assert.equal(totp(secret, 59_000, 30, 8), "94287082");
    assert.equal(totp(secret, 1111111109_000, 30, 8), "07081804");
    assert.equal(totp(secret, 2000000000_000, 30, 8), "69279037");
  });
  test("accepts one step of clock drift only", () => {
    const secret = base32Encode(Buffer.from("abcdefghijabcdefghij"));
    const now = 1_800_000_000_000;
    assert.ok(verifyTotp(secret, totp(secret, now - 30_000), now));
    assert.ok(!verifyTotp(secret, totp(secret, now - 90_000), now));
  });
});

describe("LinkedIn, TikTok, Shopify, HubSpot connectors", async () => {
  process.env.LINKEDIN_API_VERSION = "202601";
  process.env.LINKEDIN_CLIENT_ID = "li";
  process.env.LINKEDIN_CLIENT_SECRET = "ls";
  process.env.TIKTOK_APP_ID = "ta";
  process.env.TIKTOK_APP_SECRET = "ts";
  process.env.SHOPIFY_API_VERSION = "2026-01";
  const { linkedin, tiktok, shopify, hubspot, attributeNode } = await import("../server/integrations/providers2");
  const li = node("l", "linkedin_ads", { platformCampaigns: { linkedin_cm: ["555"] } });

  test("LinkedIn daily analytics map to linked campaigns", async () => {
    mockFetch(() => ({ elements: [{ pivotValues: ["urn:li:sponsoredCampaign:555"], dateRange: { start: { year: 2026, month: 11, day: 3 } }, costInLocalCurrency: "120.5", impressions: 9000, clicks: 40, externalWebsiteConversions: 3, conversionValueInLocalCurrency: "900" }] }));
    const rows = await linkedin.daily([li] as never, ctx("123") as never, "2026-11-01", "2026-11-05");
    assert.deepEqual(rows, [{ nodeId: "l", day: "2026-11-03", spend: 120.5, impressions: 9000, clicks: 40, conversions: 3, revenue: 900 }]);
    const h = calls[0].init!.headers as Record<string, string>;
    assert.equal(h["LinkedIn-Version"], "202601");
    assert.match(calls[0].url, /dateRange=\(start:\(year:2026,month:11,day:1\),end:\(year:2026,month:11,day:5\)\)/);
    assert.match(calls[0].url, /urn%3Ali%3AsponsoredAccount%3A123/);
  });

  test("TikTok report rows map to linked campaigns", async () => {
    mockFetch(() => ({ code: 0, data: { list: [{ dimensions: { campaign_id: "9", stat_time_day: "2026-11-02 00:00:00" }, metrics: { spend: "50", impressions: "8000", clicks: "120", conversion: "6" } }] } }));
    const rows = await tiktok.daily([node("t", "tiktok_ads", { platformCampaigns: { tiktok_ads_mgr: ["9"] } })] as never, ctx("adv1") as never, "2026-11-01", "2026-11-05");
    assert.deepEqual(rows, [{ nodeId: "t", day: "2026-11-02", spend: 50, impressions: 8000, clicks: 120, conversions: 6 }]);
    assert.equal((calls[0].init!.headers as Record<string, string>)["Access-Token"], "tok");
  });

  test("Shopify and HubSpot revenue is attributed by UTM / source", async () => {
    const nodes = [node("m", "meta_ads"), node("g", "google_search"), node("e", "email_list")];
    mockFetch(() => ({ data: { orders: { pageInfo: { hasNextPage: false }, nodes: [
      { createdAt: "2026-11-02T10:00:00Z", totalPriceSet: { shopMoney: { amount: "80.00" } }, customerJourneySummary: { lastVisit: { utmParameters: { source: "facebook" } } } },
      { createdAt: "2026-11-02T11:00:00Z", totalPriceSet: { shopMoney: { amount: "20.00" } }, customerJourneySummary: { lastVisit: { utmParameters: { source: "google" } } } },
      { createdAt: "2026-11-03T11:00:00Z", totalPriceSet: { shopMoney: { amount: "15.00" } }, customerJourneySummary: null },
    ] } } }));
    const rows = await shopify.daily(nodes as never, { ...ctx(""), creds: { shop: "x.myshopify.com", token: "t" } } as never, "2026-11-01", "2026-11-05");
    assert.deepEqual(rows.find((r) => r.nodeId === "m"), { nodeId: "m", day: "2026-11-02", revenue: 80, conversions: 1 });
    assert.equal(rows.length, 2, "unattributable orders are skipped");
    mockFetch(() => ({ results: [{ properties: { amount: "5000", closedate: "2026-11-04T00:00:00Z", hs_analytics_source: "EMAIL_MARKETING", hs_analytics_source_data_1: null } }] }));
    const deals = await hubspot.daily(nodes as never, { ...ctx(""), creds: { token: "t" } } as never, "2026-11-01", "2026-11-05");
    assert.deepEqual(deals, [{ nodeId: "e", day: "2026-11-04", revenue: 5000, conversions: 1 }]);
    assert.equal(attributeNode(nodes as never, "", "", "PAID_SEARCH")?.id, "g");
  });
});
