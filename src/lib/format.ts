export const num = (n: number | undefined | null) =>
  n == null || !isFinite(n) ? "—" : n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : Math.round(n).toLocaleString("en-US");

export const usd = (n: number | undefined | null) =>
  n == null || !isFinite(n) ? "—" : n >= 100000 ? `$${(n / 1000).toFixed(0)}k` : `$${Math.round(n).toLocaleString("en-US")}`;

export const pct = (n: number | undefined | null, digits = 1) => (n == null || !isFinite(n) ? "—" : `${n.toFixed(digits)}%`);

/** Parses a CSV of per-node actuals. Columns: node,spend,impressions,clicks,conversions,revenue */
export function parseActualsCSV(text: string) {
  const rows = text.trim().split(/\r?\n/).map((r) => r.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));
  const header = rows.shift()?.map((h) => h.toLowerCase()) ?? [];
  const idx = (k: string) => header.indexOf(k);
  const nodeCol = Math.max(idx("node"), idx("name"), idx("campaign"), 0);
  return rows
    .filter((r) => r[nodeCol])
    .map((r) => {
      const get = (k: string) => (idx(k) >= 0 && r[idx(k)] !== "" ? Number(r[idx(k)].replace(/[$,]/g, "")) : undefined);
      return {
        node: r[nodeCol],
        actuals: { spend: get("spend"), impressions: get("impressions"), clicks: get("clicks"), conversions: get("conversions"), revenue: get("revenue") },
      };
    });
}

export function download(filename: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Parses an orders/deals export (Shopify, Stripe, CRM) that carries UTM columns.
 * Returns null if the file doesn't look like one, so callers can fall back to
 * the per-node actuals format.
 */
export function parseRevenueCSV(text: string) {
  const rows = text.trim().split(/\r?\n/).map((r) => r.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));
  const header = rows.shift()?.map((h) => h.toLowerCase().replace(/\s+/g, "_")) ?? [];
  const src = header.indexOf("utm_source");
  const amt = header.findIndex((h) => ["revenue", "amount", "total", "value", "order_total", "deal_amount", "total_price"].includes(h));
  if (src < 0 || amt < 0) return null;
  const camp = header.indexOf("utm_campaign");
  return rows
    .filter((r) => r[src])
    .map((r) => ({
      source: r[src].toLowerCase(),
      campaign: camp >= 0 ? (r[camp] ?? "").toLowerCase() : "",
      amount: Number((r[amt] ?? "0").replace(/[$,]/g, "")) || 0,
    }));
}
