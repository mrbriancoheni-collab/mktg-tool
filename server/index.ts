import * as Sentry from "@sentry/node";
import { LIVE } from "./ai";
import { createApp } from "./app";
import { billingEnabled } from "./auth";
import { openDb } from "./db";
import { startRealtime } from "./realtime";
import { startMaintenance } from "./maintenance";
import { startScheduler } from "./reports";

if (process.env.SENTRY_DSN) Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV ?? "development", tracesSampleRate: 0 });

if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL)
  console.warn("[warn] DATABASE_URL is not set — using an embedded database on local disk. Use managed Postgres in production.");

const db = await openDb();
await startRealtime();
startScheduler(process.env.APP_URL);
startMaintenance();

const port = Number(process.env.PORT ?? 8787);
const server = createApp().listen(port, () => {
  console.log(
    `AdCanvas API on http://localhost:${port} · db: ${db.kind} · AI: ${LIVE ? "live" : "demo"} · billing: ${billingEnabled() ? "on" : "off (unlimited)"}`,
  );
});

// Graceful shutdown for rolling deploys.
for (const sig of ["SIGTERM", "SIGINT"] as const)
  process.on(sig, () => {
    console.log(`${sig} received, shutting down`);
    server.close(() => db.close().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
