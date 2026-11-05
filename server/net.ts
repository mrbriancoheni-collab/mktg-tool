// Outbound HTTP to customer-supplied URLs (webhooks, Slack, Zapier, Make).
// Guards against SSRF: only http(s), and the hostname must not resolve to a
// private, loopback, link-local or otherwise internal address.

import dns from "node:dns/promises";
import net from "node:net";

function isPrivate(ip: string) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224
    );
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivate(v.slice(7));
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

export async function assertPublicUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  const allowPrivate = process.env.ALLOW_PRIVATE_WEBHOOKS === "true";
  if (url.protocol !== "https:" && !(allowPrivate && url.protocol === "http:")) throw new Error("Webhook URLs must use https://");
  if (allowPrivate) return url;
  const addrs = await dns.lookup(url.hostname, { all: true }).catch(() => []);
  if (!addrs.length) throw new Error(`Can't resolve ${url.hostname}`);
  if (addrs.some((a) => isPrivate(a.address))) throw new Error("Webhook URL points to a private network address");
  return url;
}

export async function postJSON(raw: string, body: unknown) {
  const url = await assertPublicUrl(raw);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "AdCanvas-Webhook/1.0" },
    body: JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
}
