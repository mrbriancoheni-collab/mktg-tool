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

describe("security primitives", () => {
  test("rate limiter blocks bursts", async () => {
    const { rateLimit } = await import("../server/auth");
    const mw = rateLimit("t", 3, 60_000);
    const results: unknown[] = [];
    for (let i = 0; i < 5; i++) mw({ ip: "1.2.3.4" } as never, {} as never, (e?: unknown) => results.push(e));
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
