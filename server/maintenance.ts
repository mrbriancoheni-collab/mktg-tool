// Data-retention housekeeping (see docs/security/data-retention.md). Runs hourly.

import { db } from "./db";

const days = (env: string, fallback: number) => Math.max(1, Number(process.env[env] ?? fallback));

export async function purgeExpired() {
  const q = db().query;
  await q(`DELETE FROM sessions WHERE expires_at < now()`);
  await q(`DELETE FROM rate_limits WHERE reset_at < now() - interval '1 hour'`);
  await q(`DELETE FROM password_resets WHERE expires_at < now() - interval '1 day'`);
  await q(`DELETE FROM invites WHERE accepted_at IS NULL AND expires_at < now() - interval '30 days'`);
  await q(`DELETE FROM audit_log WHERE created_at < now() - ($1 || ' days')::interval`, [String(days("AUDIT_RETENTION_DAYS", 365))]);
  await q(`DELETE FROM ai_usage WHERE created_at < now() - ($1 || ' days')::interval`, [String(days("USAGE_RETENTION_DAYS", 730))]);
}

export function startMaintenance() {
  if (process.env.RUN_SCHEDULER === "false") return;
  const run = () => purgeExpired().catch((e) => console.error("[maintenance]", e.message));
  setTimeout(run, 30_000).unref();
  setInterval(run, 3600_000).unref();
}
