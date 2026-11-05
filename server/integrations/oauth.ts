// OAuth 2.0 for Google (Ads + GA4) and Meta (Marketing API).
//
// Requires your own developer apps:
//   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET   (Google Cloud console; OAuth consent screen verified)
//   GOOGLE_ADS_DEVELOPER_TOKEN                (Google Ads API Center; Basic/Standard access)
//   META_APP_ID / META_APP_SECRET             (developers.facebook.com; Marketing API, app review)
// Redirect URI to register with each provider: {APP_URL}/api/oauth/callback

import crypto from "node:crypto";
import { sign, verifySigned } from "../crypto";
import type { ConnectionCtx, Credentials } from "./index";

export type Provider = "google" | "meta";

export const SCOPES: Record<string, string[]> = {
  google_ads_mgr: ["https://www.googleapis.com/auth/adwords"],
  ga4: ["https://www.googleapis.com/auth/analytics.readonly"],
  meta_ads_mgr: ["ads_read", "ads_management", "business_management", "pages_show_list"],
};

export function graphVersion() {
  const v = process.env.META_GRAPH_VERSION;
  if (!v) throw new Error("Set META_GRAPH_VERSION to a current Graph API version (e.g. from developers.facebook.com/docs/graph-api/changelog).");
  return v;
}

function cfg(p: Provider) {
  if (p === "google") {
    const id = process.env.GOOGLE_CLIENT_ID, secret = process.env.GOOGLE_CLIENT_SECRET;
    if (!id || !secret) throw new Error("Google isn't configured: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
    return { id, secret, authUrl: "https://accounts.google.com/o/oauth2/v2/auth", tokenUrl: "https://oauth2.googleapis.com/token" };
  }
  const id = process.env.META_APP_ID, secret = process.env.META_APP_SECRET;
  if (!id || !secret) throw new Error("Meta isn't configured: set META_APP_ID and META_APP_SECRET.");
  const v = graphVersion();
  return { id, secret, authUrl: `https://www.facebook.com/${v}/dialog/oauth`, tokenUrl: `https://graph.facebook.com/${v}/oauth/access_token` };
}

export const providerConfigured = (p: Provider) => {
  try {
    cfg(p);
    return true;
  } catch {
    return false;
  }
};

const redirectUri = (appUrl: string) => `${appUrl.replace(/\/$/, "")}/api/oauth/callback`;

interface State {
  p: Provider;
  type: string;
  ws: string;
  u: string;
  n: string;
}

export function authorizeUrl(p: Provider, type: string, ws: string, userId: string, appUrl: string) {
  const c = cfg(p);
  const state = sign({ p, type, ws, u: userId, n: crypto.randomBytes(8).toString("hex") } satisfies State, 900);
  const params = new URLSearchParams({ client_id: c.id, redirect_uri: redirectUri(appUrl), state, response_type: "code" });
  if (p === "google") {
    params.set("scope", SCOPES[type].join(" "));
    params.set("access_type", "offline"); // refresh token
    params.set("prompt", "consent");
    params.set("include_granted_scopes", "true");
  } else {
    params.set("scope", SCOPES[type].join(","));
  }
  return `${c.authUrl}?${params}`;
}

export function readState(state: string) {
  return verifySigned<State>(state);
}

async function tokenRequest(url: string, body: Record<string, string>) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body), signal: AbortSignal.timeout(15000) });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.error) throw new Error(`Token exchange failed: ${JSON.stringify(data.error ?? data).slice(0, 200)}`);
  return data;
}

/** Exchanges the authorization code for tokens. */
export async function exchangeCode(p: Provider, code: string, appUrl: string): Promise<Credentials> {
  const c = cfg(p);
  const data = await tokenRequest(c.tokenUrl, { code, client_id: c.id, client_secret: c.secret, redirect_uri: redirectUri(appUrl), grant_type: "authorization_code" });
  if (p === "google") {
    return {
      access_token: String(data.access_token),
      refresh_token: String(data.refresh_token ?? ""),
      expires_at: String(Date.now() + Number(data.expires_in ?? 3600) * 1000),
    };
  }
  // Meta: swap the short-lived user token for a long-lived (~60 day) one.
  const long = await tokenRequest(c.tokenUrl, { grant_type: "fb_exchange_token", client_id: c.id, client_secret: c.secret, fb_exchange_token: String(data.access_token) });
  return { access_token: String(long.access_token), expires_at: String(Date.now() + Number(long.expires_in ?? 60 * 86400) * 1000) };
}

/** Returns a valid access token, refreshing Google tokens when needed. */
export async function accessToken(p: Provider, ctx: ConnectionCtx): Promise<string> {
  const { access_token, refresh_token, expires_at } = ctx.creds;
  if (Number(expires_at) - 60_000 > Date.now()) return access_token;
  if (p === "meta") throw new Error("Meta access expired — reconnect Meta Ads Manager (tokens last about 60 days).");
  if (!refresh_token) throw new Error("Google access expired — reconnect the integration.");
  const c = cfg("google");
  const data = await tokenRequest(c.tokenUrl, { grant_type: "refresh_token", refresh_token, client_id: c.id, client_secret: c.secret });
  const creds = { ...ctx.creds, access_token: String(data.access_token), expires_at: String(Date.now() + Number(data.expires_in ?? 3600) * 1000) };
  await ctx.saveCreds(creds);
  ctx.creds = creds;
  return creds.access_token;
}

/** Meta recommends signing calls with appsecret_proof. */
export function appSecretProof(token: string) {
  return crypto.createHmac("sha256", cfg("meta").secret).update(token).digest("hex");
}
