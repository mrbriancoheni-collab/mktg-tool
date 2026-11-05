// Integration tests: real app + in-memory Postgres (PGlite).
// Run: npm test
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";
import Stripe from "stripe";

process.env.ALLOW_PRIVATE_WEBHOOKS = "false";
process.env.RUN_SCHEDULER = "false";
process.env.AUTH_RATE_LIMIT = "1000";
delete process.env.STRIPE_SECRET_KEY;

const { openDb, db } = await import("../server/db");
const { createApp } = await import("../server/app");
const { encrypt, decrypt } = await import("../server/crypto");
const { assertPublicUrl } = await import("../server/net");

let base = "";
let close: () => void;

before(async () => {
  await openDb({ dir: null });
  const server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
after(() => close?.());

/** Minimal client with a cookie jar. */
function client() {
  let cookie = "";
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) if (c.startsWith("adc_session=")) cookie = c.split(";")[0].endsWith("=") ? "" : c.split(";")[0];
    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, data };
  };
  return {
    get: (p: string) => call("GET", p),
    post: (p: string, b?: unknown, h?: Record<string, string>) => call("POST", p, b ?? {}, h),
    put: (p: string, b?: unknown) => call("PUT", p, b ?? {}),
    patch: (p: string, b?: unknown) => call("PATCH", p, b ?? {}),
    del: (p: string, b?: unknown) => call("DELETE", p, b),
    get cookie() {
      return cookie;
    },
  };
}

const signup = async (c: ReturnType<typeof client>, email: string, extra: object = {}) =>
  c.post("/api/auth/signup", { name: email.split("@")[0], email, password: "correct horse battery", acceptTerms: true, ...extra });

describe("auth", () => {
  test("signup requires accepting terms and a strong password", async () => {
    const c = client();
    assert.equal((await c.post("/api/auth/signup", { email: "x@test.co", password: "correct horse battery" })).status, 400);
    assert.equal((await c.post("/api/auth/signup", { email: "x@test.co", password: "short", acceptTerms: true })).status, 400);
  });

  test("signup creates a session, workspace and records terms acceptance", async () => {
    const c = client();
    assert.equal((await signup(c, "alice@test.co")).status, 200);
    const me = await c.get("/api/auth/me");
    assert.equal(me.status, 200);
    assert.equal(me.data.user.email, "alice@test.co");
    assert.equal(me.data.role, "owner");
    assert.equal(me.data.workspace.plan, "unlimited"); // billing disabled
    const [u] = await db().query(`SELECT terms_version, terms_accepted_at FROM users WHERE email='alice@test.co'`);
    assert.ok(u.terms_version && u.terms_accepted_at);
  });

  test("duplicate email is rejected; login works; wrong password fails", async () => {
    const c = client();
    assert.equal((await signup(c, "alice@test.co")).status, 409);
    assert.equal((await c.post("/api/auth/login", { email: "ALICE@test.co", password: "nope nope nope" })).status, 401);
    assert.equal((await c.post("/api/auth/login", { email: "ALICE@test.co", password: "correct horse battery" })).status, 200);
    assert.equal((await c.get("/api/auth/me")).status, 200);
    await c.post("/api/auth/logout");
    assert.equal((await c.get("/api/auth/me")).status, 401);
  });

  test("unauthenticated API access is rejected", async () => {
    assert.equal((await client().get("/api/boards")).status, 401);
  });

  test("cross-origin mutating requests are blocked (CSRF)", async () => {
    const c = client();
    await signup(c, "csrf@test.co");
    const r = await c.post("/api/boards", { name: "x" }, { origin: "https://evil.example" });
    assert.equal(r.status, 403);
  });

  test("password reset flow signs out other sessions", async () => {
    const c = client();
    await signup(c, "reset@test.co");
    const other = client();
    await other.post("/api/auth/login", { email: "reset@test.co", password: "correct horse battery" });
    // Simulate the emailed token by inserting a known one.
    const { sha256 } = await import("../server/crypto");
    const [u] = await db().query(`SELECT id FROM users WHERE email='reset@test.co'`);
    await db().query(`INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1,$2, now() + interval '1 hour')`, [sha256("tok123"), u.id]);
    assert.equal((await c.post("/api/auth/reset", { token: "tok123", password: "a brand new password" })).status, 200);
    assert.equal((await other.get("/api/auth/me")).status, 401);
    assert.equal((await c.post("/api/auth/reset", { token: "tok123", password: "another new password" })).status, 400); // single use
  });
});

describe("workspaces & boards", () => {
  test("workspaces are isolated from each other", async () => {
    const a = client(), b = client();
    await signup(a, "iso-a@test.co");
    await signup(b, "iso-b@test.co");
    const board = (await a.post("/api/boards", { name: "Secret plan" })).data;
    assert.equal((await b.get(`/api/boards/${board.id}`)).status, 404);
    assert.equal((await b.post(`/api/boards/${board.id}/ops`, { ops: [{ t: "meta", patch: { name: "pwned" } }] })).status, 404);
    assert.equal((await b.get("/api/boards")).data.length, 0);
    assert.equal((await a.get(`/api/boards/${board.id}`)).data.name, "Secret plan");
  });

  test("ops update the board and bump the version", async () => {
    const a = client();
    await signup(a, "ops@test.co");
    const board = (await a.post("/api/boards", { name: "Ops" })).data;
    const node = { id: "n1", position: { x: 0, y: 0 }, data: { type: "meta_ads", kind: "traffic", label: "Meta", budget: 1000, cpc: 1 } };
    const r1 = await a.post(`/api/boards/${board.id}/ops`, { clientId: "c1", ops: [{ t: "node.put", node }, { t: "meta", patch: { name: "Renamed" } }] });
    assert.equal(r1.data.version, 1);
    const got = (await a.get(`/api/boards/${board.id}`)).data;
    assert.equal(got.name, "Renamed");
    assert.equal(got.graph.nodes[0].data.label, "Meta");
    assert.equal((await a.post(`/api/boards/${board.id}/ops`, { ops: [{ t: "bogus" }] })).status, 400);
  });

  test("real-time: other clients receive ops over SSE", async () => {
    const a = client();
    await signup(a, "rt@test.co");
    const board = (await a.post("/api/boards", { name: "RT" })).data;
    const ctrl = new AbortController();
    const res = await fetch(`${base}/api/boards/${board.id}/events?clientId=viewer`, { headers: { cookie: a.cookie }, signal: ctrl.signal });
    const reader = res.body!.getReader();
    const events: string[] = [];
    const reading = (async () => {
      const dec = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
        if (done) break;
        events.push(dec.decode(value));
        if (events.join("").includes("event: ops")) break;
      }
    })();
    await new Promise((r) => setTimeout(r, 100));
    await a.post(`/api/boards/${board.id}/ops`, { clientId: "editor", ops: [{ t: "meta", patch: { goal: "Grow" } }] });
    await Promise.race([reading, new Promise((r) => setTimeout(r, 2000))]);
    ctrl.abort();
    const all = events.join("");
    assert.match(all, /event: hello/);
    assert.match(all, /event: ops[\s\S]*"goal":"Grow"/);
  });

  test("invites: invited user joins with the given role; viewers can't edit", async () => {
    const owner = client();
    await signup(owner, "boss@test.co");
    const board = (await owner.post("/api/boards", { name: "Team board" })).data;
    const inv = await owner.post("/api/workspace/invites", { email: "viewer@test.co", role: "viewer" });
    assert.equal(inv.status, 200);
    const token = inv.data.url.split("/invite/")[1];
    assert.equal((await client().get(`/api/invites/${token}`)).data.role, "viewer");

    const v = client();
    assert.equal((await signup(v, "viewer@test.co", { invite: token })).status, 200);
    const me = (await v.get("/api/auth/me")).data;
    assert.equal(me.role, "viewer");
    assert.equal((await v.get(`/api/boards/${board.id}`)).status, 200);
    assert.equal((await v.post(`/api/boards/${board.id}/ops`, { ops: [{ t: "meta", patch: { name: "x" } }] })).status, 403);
    assert.equal((await v.post("/api/boards", { name: "nope" })).status, 403);
    assert.equal((await v.post(`/api/boards/${board.id}/comments`, { text: "Looks good" })).status, 200); // viewers can comment

    // Invite tokens are single-use and email-bound.
    const other = client();
    assert.equal((await signup(other, "someone-else@test.co", { invite: token })).status, 400);
  });

  test("last owner can't be demoted or leave", async () => {
    const o = client();
    await signup(o, "solo@test.co");
    const me = (await o.get("/api/auth/me")).data;
    assert.equal((await o.patch(`/api/workspace/members/${me.user.id}`, { role: "member" })).status, 400);
    assert.equal((await o.del(`/api/workspace/members/${me.user.id}`)).status, 400);
  });

  test("share links give read-only access and can be revoked", async () => {
    const a = client();
    await signup(a, "share@test.co");
    const board = (await a.post("/api/boards", { name: "Shared" })).data;
    const { shareToken } = (await a.post(`/api/boards/${board.id}/share`, { enabled: true })).data;
    const guest = client();
    const view = await guest.get(`/api/shared/${shareToken}`);
    assert.equal(view.data.name, "Shared");
    assert.equal(view.data.workspaceId, undefined);
    assert.equal((await guest.post(`/api/shared/${shareToken}/comments`, { author: "Client", text: "Hi" })).status, 200);
    await a.post(`/api/boards/${board.id}/share`, { enabled: false });
    assert.equal((await guest.get(`/api/shared/${shareToken}`)).status, 404);
  });

  test("audit log records security-relevant actions", async () => {
    const a = client();
    await signup(a, "audit@test.co");
    await a.post("/api/boards", { name: "A" });
    const log = (await a.get("/api/workspace/audit")).data.map((r: { action: string }) => r.action);
    assert.ok(log.includes("user.signup") && log.includes("board.created"));
  });

  test("account deletion removes solely-owned workspaces", async () => {
    const a = client();
    await signup(a, "leaver@test.co");
    const b = (await a.post("/api/boards", { name: "Gone" })).data;
    assert.equal((await a.del("/api/account", { password: "wrong password!" })).status, 400);
    assert.equal((await a.del("/api/account", { password: "correct horse battery" })).status, 200);
    assert.equal((await db().query(`SELECT 1 FROM boards WHERE id=$1`, [b.id])).length, 0);
  });
});

describe("marketing site", () => {
  test("MARKETING_URL is exposed in status and legal pages redirect to it", async () => {
    delete process.env.MARKETING_URL;
    assert.equal((await (await fetch(base + "/api/status")).json()).marketingUrl, null);
    process.env.MARKETING_URL = "https://adcanvas.example/";
    try {
      assert.equal((await (await fetch(base + "/api/status")).json()).marketingUrl, "https://adcanvas.example");
      const r = await fetch(base + "/legal/privacy", { redirect: "manual" });
      assert.equal(r.status, 302);
      assert.equal(r.headers.get("location"), "https://adcanvas.example/legal/privacy/");
    } finally {
      delete process.env.MARKETING_URL;
    }
  });
});

describe("security primitives", () => {
  test("rate limiter blocks bursts", async () => {
    const { rateLimit } = await import("../server/auth");
    const mw = rateLimit(`t${Date.now()}`, 3, 60_000);
    const results: unknown[] = [];
    // Works for both the in-memory limiter (sync) and the Postgres-backed one (async).
    for (let i = 0; i < 5; i++) results.push(await new Promise((r) => mw({ ip: "1.2.3.4" } as never, {} as never, (e?: unknown) => r(e))));
    assert.equal(results.filter((e) => e === undefined).length, 3);
    assert.equal((results[4] as { status: number }).status, 429);
  });

  test("credentials encrypt/decrypt and detect tampering", () => {
    const blob = encrypt({ token: "secret-value" });
    assert.ok(!blob.includes("secret-value"));
    assert.deepEqual(decrypt(blob), { token: "secret-value" });
    const parts = blob.split(".");
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("A") ? "BB" : "AA");
    assert.throws(() => decrypt(parts.join(".")));
  });

  test("webhook URLs can't target private networks (SSRF)", async () => {
    await assert.rejects(assertPublicUrl("http://example.com/hook"), /https/);
    await assert.rejects(assertPublicUrl("https://127.0.0.1/hook"), /private/);
    await assert.rejects(assertPublicUrl("https://169.254.169.254/latest/meta-data"), /private/);
    await assert.rejects(assertPublicUrl("https://10.0.0.5/x"), /private/);
  });

  test("stored connection credentials are encrypted at rest", async () => {
    const a = client();
    await signup(a, "creds@test.co");
    // Connect a non-webhook integration (no outbound URL validation needed).
    assert.equal((await a.post("/api/integrations/hubspot/connect", { token: "pat-na1-supersecret" })).status, 200);
    const [row] = await db().query(`SELECT credentials_enc FROM connections WHERE type='hubspot'`);
    assert.ok(!String(row.credentials_enc).includes("supersecret"));
  });
});

describe("experiments, versions, notifications", () => {
  test("experiment lifecycle and workspace isolation", async () => {
    const a = client(), b = client();
    await signup(a, "exp-a@test.co");
    await signup(b, "exp-b@test.co");
    const board = (await a.post("/api/boards", { name: "E" })).data;
    const e = (await a.post(`/api/boards/${board.id}/experiments`, { hypothesis: "Shorter form lifts conversion" })).data;
    assert.equal(e.variants.length, 2);
    const u = (await a.patch(`/api/boards/${board.id}/experiments/${e.id}`, { status: "running", variants: [{ name: "A", visitors: 100, conversions: 5 }, { name: "B", visitors: 100, conversions: 9 }] })).data;
    assert.equal(u.status, "running");
    assert.ok(u.startedAt);
    assert.equal((await b.get(`/api/boards/${board.id}/experiments`)).status, 404);
  });

  test("versions: save, list, fetch snapshot", async () => {
    const a = client();
    await signup(a, "ver@test.co");
    const board = (await a.post("/api/boards", { name: "V1" })).data;
    await a.post(`/api/boards/${board.id}/versions`, { label: "Sent to client" });
    await a.post(`/api/boards/${board.id}/ops`, { ops: [{ t: "meta", patch: { name: "V2" } }] });
    const list = (await a.get(`/api/boards/${board.id}/versions`)).data;
    const saved = list.find((v: { label: string }) => v.label === "Sent to client");
    assert.ok(saved);
    assert.equal((await a.get(`/api/boards/${board.id}/versions/${saved.id}`)).data.name, "V1");
  });

  test("@mentions notify teammates", async () => {
    const owner = client();
    await signup(owner, "mention-owner@test.co", { name: "Olive Owner" });
    const inv = await owner.post("/api/workspace/invites", { email: "tess.mate@test.co", role: "member" });
    const t = client();
    await signup(t, "tess.mate@test.co", { name: "Tess Mate", invite: inv.data.url.split("/invite/")[1] });
    const board = (await owner.post("/api/boards", { name: "M" })).data;
    await owner.post(`/api/boards/${board.id}/comments`, { text: "@tess can you check the budget?" });
    const n = (await t.get("/api/notifications")).data;
    assert.equal(n.unread, 1);
    assert.match(n.items[0].title, /mentioned you/);
    await t.post("/api/notifications/read", {});
    assert.equal((await t.get("/api/notifications")).data.unread, 0);
  });
});

describe("two-factor authentication", () => {
  test("enable TOTP, sign in with a code, use a recovery code once", async () => {
    const { totp } = await import("../server/totp");
    const a = client();
    await signup(a, "mfa@test.co");
    const { secret } = (await a.post("/api/account/mfa/setup", {})).data;
    assert.equal((await a.post("/api/account/mfa/enable", { code: "000000" })).status, 400);
    const { recoveryCodes } = (await a.post("/api/account/mfa/enable", { code: totp(secret) })).data;
    assert.equal(recoveryCodes.length, 10);
    assert.equal((await a.get("/api/auth/me")).data.user.mfaEnabled, true);

    const b = client();
    const login = await b.post("/api/auth/login", { email: "mfa@test.co", password: "correct horse battery" });
    assert.equal(login.data.mfaRequired, true);
    assert.equal((await b.get("/api/auth/me")).status, 401, "pending session can't access the app");
    assert.equal((await b.get("/api/boards")).status, 401);
    assert.equal((await b.post("/api/auth/mfa", { code: "123456" })).status, 401);
    assert.equal((await b.post("/api/auth/mfa", { code: totp(secret) })).status, 200);
    assert.equal((await b.get("/api/auth/me")).status, 200);

    const c = client();
    await c.post("/api/auth/login", { email: "mfa@test.co", password: "correct horse battery" });
    assert.equal((await c.post("/api/auth/mfa", { code: recoveryCodes[0] })).status, 200);
    const d = client();
    await d.post("/api/auth/login", { email: "mfa@test.co", password: "correct horse battery" });
    assert.equal((await d.post("/api/auth/mfa", { code: recoveryCodes[0] })).status, 401, "recovery codes are single-use");
  });
});

describe("product analytics", () => {
  test("events are recorded and the admin funnel is restricted", async () => {
    const a = client();
    await signup(a, "analytics-admin@test.co");
    await a.post("/api/events", { events: [{ event: "board_built" }, { event: "bad event name!" }] });
    assert.equal((await a.get("/api/admin/metrics")).status, 403);
    process.env.ADMIN_EMAILS = "analytics-admin@test.co";
    try {
      const m = (await a.get("/api/admin/metrics?days=30")).data;
      const step = (k: string) => m.steps.find((s: { step: string }) => s.step === k).users;
      assert.ok(step("signup") >= 1 && step("board_built") >= 1);
    } finally {
      delete process.env.ADMIN_EMAILS;
    }
    const [bad] = await db().query(`SELECT count(*)::int AS n FROM events WHERE event LIKE 'bad%'`);
    assert.equal(Number(bad.n), 0, "invalid event names are dropped");
  });
});

describe("data retention", () => {
  test("purge job removes expired sessions and old audit rows", async () => {
    const { purgeExpired } = await import("../server/maintenance");
    const [u] = await db().query(`SELECT id FROM users LIMIT 1`);
    await db().query(`INSERT INTO sessions (id, user_id, expires_at) VALUES ('expired-sess', $1, now() - interval '1 day')`, [u.id]);
    await db().query(`INSERT INTO audit_log (action, created_at) VALUES ('ancient', now() - interval '800 days')`);
    await purgeExpired();
    assert.equal((await db().query(`SELECT 1 FROM sessions WHERE id='expired-sess'`)).length, 0);
    assert.equal((await db().query(`SELECT 1 FROM audit_log WHERE action='ancient'`)).length, 0);
  });
});

describe("billing & plan limits", () => {
  test("Stripe webhook upgrades the plan; limits apply when billing is on", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
    process.env.STRIPE_PRICE_PRO = "price_pro_123";
    try {
      const a = client();
      await signup(a, "payer@test.co");
      const me = (await a.get("/api/auth/me")).data;
      assert.equal(me.workspace.plan, "free");
      assert.equal(me.usage.boardLimit, 3);

      // Free plan: 3 boards max.
      for (let i = 0; i < 3; i++) assert.equal((await a.post("/api/boards", { name: `B${i}` })).status, 200);
      assert.equal((await a.post("/api/boards", { name: "B4" })).status, 402);

      // Free plan: AI quota.
      await db().query(`INSERT INTO ai_usage (workspace_id, feature) SELECT $1, 'test' FROM generate_series(1, 50)`, [me.workspace.id]);
      assert.equal((await a.post("/api/ai/plan", { brief: "x" })).status, 402);

      // Webhook: bad signature rejected.
      await db().query(`UPDATE workspaces SET stripe_customer_id='cus_123' WHERE id=$1`, [me.workspace.id]);
      const event = {
        id: "evt_1",
        object: "event",
        type: "customer.subscription.updated",
        data: { object: { id: "sub_1", object: "subscription", customer: "cus_123", status: "active", metadata: {}, items: { data: [{ price: { id: "price_pro_123" }, current_period_end: 1900000000 }] } } },
      };
      const payload = JSON.stringify(event);
      const bad = await fetch(`${base}/api/billing/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=bad" }, body: payload });
      assert.equal(bad.status, 400);
      const sig = new Stripe("sk_test_dummy").webhooks.generateTestHeaderString({ payload, secret: "whsec_test_secret" });
      const ok = await fetch(`${base}/api/billing/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": sig }, body: payload });
      assert.equal(ok.status, 200);
      const after = (await a.get("/api/auth/me")).data;
      assert.equal(after.workspace.plan, "pro");
      assert.equal(after.usage.boardLimit, null);
      assert.equal((await a.post("/api/boards", { name: "B4" })).status, 200);
    } finally {
      delete process.env.STRIPE_SECRET_KEY;
      delete process.env.STRIPE_WEBHOOK_SECRET;
      delete process.env.STRIPE_PRICE_PRO;
    }
  });
});
