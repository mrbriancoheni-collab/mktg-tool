// Database access. Uses real Postgres when DATABASE_URL is set (production),
// otherwise an embedded Postgres (PGlite) stored in ./data/pg — same SQL either
// way, so development and tests exercise the production schema.

import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  tx<T>(fn: (q: Db["query"]) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  /** Present only for real Postgres: dedicated client for LISTEN/NOTIFY. */
  listen?(channel: string, onMessage: (payload: string) => void): Promise<void>;
  notify?(channel: string, payload: string): Promise<void>;
  kind: "postgres" | "pglite";
}

function postgres(url: string): Db {
  const pool = new pg.Pool({
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" },
  });
  const query: Db["query"] = async (sql, params) => (await pool.query(sql, params as unknown[])).rows;
  return {
    kind: "postgres",
    query,
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const out = await fn(async (sql, params) => (await client.query(sql, params as unknown[])).rows);
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
    async listen(channel, onMessage) {
      const client = await pool.connect();
      client.on("notification", (m) => m.channel === channel && m.payload && onMessage(m.payload));
      await client.query(`LISTEN ${channel}`);
    },
    async notify(channel, payload) {
      await pool.query("SELECT pg_notify($1, $2)", [channel, payload]);
    },
    close: () => pool.end(),
  };
}

function embedded(dir?: string): Db {
  if (dir) fs.mkdirSync(dir, { recursive: true });
  const db = new PGlite(dir);
  // PGlite is single-connection: serialize work so transactions don't interleave.
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>) => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run;
  };
  const raw: Db["query"] = async (sql, params) => {
    // Multi-statement SQL (migrations) must go through exec(); it takes no parameters.
    if (!params?.length && sql.trim().replace(/;\s*$/, "").includes(";")) {
      const results = await db.exec(sql);
      return (results.at(-1)?.rows ?? []) as never;
    }
    return (await db.query(sql, params as unknown[])).rows as never;
  };
  return {
    kind: "pglite",
    query: (sql, params) => serial(() => raw(sql, params)),
    tx: (fn) =>
      serial(async () => {
        await raw("BEGIN");
        try {
          const out = await fn(raw);
          await raw("COMMIT");
          return out;
        } catch (e) {
          await raw("ROLLBACK");
          throw e;
        }
      }),
    close: () => db.close(),
  };
}

const MIGRATIONS: string[] = [
  // 1 — core schema
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    password_hash TEXT,
    terms_version TEXT,
    terms_accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'free',
    stripe_customer_id TEXT UNIQUE,
    stripe_subscription_id TEXT,
    subscription_status TEXT,
    current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE memberships (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner','admin','member','viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, user_id)
  );
  CREATE INDEX memberships_user ON memberships(user_id);
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    user_agent TEXT,
    ip TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX sessions_user ON sessions(user_id);
  CREATE TABLE invites (
    token_hash TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL,
    invited_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ
  );
  CREATE TABLE boards (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    goal TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    graph JSONB NOT NULL,
    analysis JSONB,
    share_token TEXT UNIQUE,
    schedule JSONB,
    version INTEGER NOT NULL DEFAULT 0,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX boards_workspace ON boards(workspace_id, updated_at DESC);
  CREATE TABLE comments (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    node_id TEXT,
    author_name TEXT NOT NULL,
    author_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    text TEXT NOT NULL,
    resolved BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX comments_board ON comments(board_id);
  CREATE TABLE connections (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    credentials_enc TEXT NOT NULL,
    account TEXT,
    meta JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, type)
  );
  CREATE TABLE ai_usage (
    id BIGSERIAL PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    feature TEXT NOT NULL,
    model TEXT,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX ai_usage_ws_time ON ai_usage(workspace_id, created_at);
  CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    workspace_id TEXT,
    user_id TEXT,
    action TEXT NOT NULL,
    target TEXT,
    meta JSONB,
    ip TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX audit_ws_time ON audit_log(workspace_id, created_at DESC);
  `,
];

async function migrate(db: Db) {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const done = new Set((await db.query<{ version: number }>(`SELECT version FROM schema_migrations`)).map((r) => r.version));
  for (let i = 0; i < MIGRATIONS.length; i++) {
    const v = i + 1;
    if (done.has(v)) continue;
    await db.tx(async (q) => {
      await q(MIGRATIONS[i]);
      await q(`INSERT INTO schema_migrations(version) VALUES ($1)`, [v]);
    });
    console.log(`[db] applied migration ${v}`);
  }
}

let instance: Db | null = null;

/** Opens the database (once) and applies pending migrations. `dir: null` = in-memory (tests). */
export async function openDb(opts: { url?: string; dir?: string | null } = {}): Promise<Db> {
  const url = opts.url ?? process.env.DATABASE_URL;
  const db = url ? postgres(url) : embedded(opts.dir === null ? undefined : (opts.dir ?? path.resolve("data", "pg")));
  await migrate(db);
  instance = db;
  return db;
}

export function db(): Db {
  if (!instance) throw new Error("Database not opened — call openDb() first");
  return instance;
}

export const ms = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : null);
