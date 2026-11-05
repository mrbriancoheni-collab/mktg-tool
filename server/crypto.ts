// Secrets handling: AES-256-GCM encryption for stored integration credentials,
// scrypt password hashing, token generation/hashing, and HMAC signing.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function loadKey(name: string, envVar: string): Buffer {
  const raw = process.env[envVar];
  if (raw) {
    const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
    if (key.length !== 32) throw new Error(`${envVar} must be 32 bytes (64 hex chars or base64)`);
    return key;
  }
  if (process.env.NODE_ENV === "production") throw new Error(`${envVar} is required in production. Generate one with: openssl rand -hex 32`);
  // Development: persist a random key locally so data survives restarts.
  const file = path.resolve("data", `dev-${name}.key`);
  if (fs.existsSync(file)) return Buffer.from(fs.readFileSync(file, "utf8").trim(), "hex");
  const key = crypto.randomBytes(32);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, key.toString("hex"), { mode: 0o600 });
  console.warn(`[crypto] ${envVar} not set — generated a development key at ${file}`);
  return key;
}

let encKey: Buffer | null = null;
let signKey: Buffer | null = null;
const ENC = () => (encKey ??= loadKey("encryption", "ENCRYPTION_KEY"));
const SIGN = () => (signKey ??= loadKey("session", "SESSION_SECRET"));

/** Encrypts a JSON-serializable value. Output: v1.<iv>.<tag>.<ciphertext> (base64url). */
export function encrypt(value: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENC(), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decrypt<T = unknown>(blob: string): T {
  const [v, iv, tag, ct] = blob.split(".");
  if (v !== "v1") throw new Error("Unknown ciphertext version");
  const decipher = crypto.createDecipheriv("aes-256-gcm", ENC(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8"));
}

// ── Passwords (scrypt, N=2^15) ──
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await new Promise<Buffer>((res, rej) => crypto.scrypt(password, salt, 64, SCRYPT, (e, k) => (e ? rej(e) : res(k))));
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [alg, N, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt") return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await new Promise<Buffer>((res, rej) =>
    crypto.scrypt(password, Buffer.from(salt, "base64url"), expected.length, { N: +N, r: +r, p: +p, maxmem: SCRYPT.maxmem }, (e, k) => (e ? rej(e) : res(k))),
  );
  return crypto.timingSafeEqual(actual, expected);
}

// ── Tokens ──
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("base64url");
export const newId = (bytes = 9) => crypto.randomBytes(bytes).toString("base64url");

/** Signed, expiring payload (used for OAuth `state`). */
export function sign(payload: object, ttlSeconds = 600): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlSeconds * 1000 })).toString("base64url");
  const mac = crypto.createHmac("sha256", SIGN()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifySigned<T>(token: string): T | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = crypto.createHmac("sha256", SIGN()).update(body).digest("base64url");
  if (expected.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(mac))) return null;
  const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  return data.exp > Date.now() ? (data as T) : null;
}
