# Security

## Reporting a vulnerability

Email **[SECURITY EMAIL]** with details and steps to reproduce. Please don't open a public issue. We aim to acknowledge reports within 2 business days and to fix critical issues within 7 days. We won't take legal action against good-faith research that avoids privacy violations and service disruption.

## How AdCanvas protects data

| Area | Control | Where |
|---|---|---|
| Passwords | scrypt (N=2^15, r=8, p=1, 16-byte salt); a hash comparison runs even for unknown emails, so timing doesn't reveal which accounts exist | `server/crypto.ts`, `server/auth.ts` |
| Sessions | 256-bit random token in an `HttpOnly; SameSite=Lax; Secure` cookie. Only its SHA-256 hash is stored. 30-day sliding expiry. Password change or reset signs out other sessions. | `server/auth.ts` |
| CSRF | Same-site cookies, plus an Origin check on every state-changing API request | `originCheck` |
| Brute force | Per-IP rate limits on login, signup, password reset, invites and public comments | `rateLimit` |
| Authorization | Every board, comment and connection query is scoped by `workspace_id`. Roles are viewer < member < admin < owner. Isolation is covered by tests. | `server/store.ts`, `tests/api.test.ts` |
| Integration secrets | AES-256-GCM with a key held outside the database (`ENCRYPTION_KEY`). Never returned to clients or included in exports. | `server/crypto.ts` |
| OAuth | HMAC-signed, expiring `state` bound to the user and workspace. Meta calls are signed with `appsecret_proof`. | `server/integrations/oauth.ts` |
| SSRF | Customer-supplied webhook URLs must be HTTPS and resolve only to public IPs. Redirects are refused and requests time out. | `server/net.ts` |
| Payments | No card data touches our servers (Stripe Checkout). Webhooks are verified by signature. | `server/billing.ts` |
| Headers | CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy | `server/app.ts` |
| Audit | Sign-ins (including failures), membership and role changes, integrations, sharing, billing, exports and deletions are logged per workspace | `audit_log` table |
| Privacy | Self-serve export and deletion of workspace data and of accounts | Settings, `/api/privacy/*` |
| Supply chain | `npm audit` and tests run in CI on every pull request | `.github/workflows/ci.yml` |

## Operational policies

These are templates in `docs/security/`. They're the policies a SOC 2 auditor will ask for, and they need adapting to how your team actually works:

- [Incident response](docs/security/incident-response.md)
- [Access control](docs/security/access-control.md)
- [Data retention & deletion](docs/security/data-retention.md)
- [Backup & disaster recovery](docs/security/backup-dr.md)
- [Vendor management](docs/security/vendor-management.md)
- [Secure development](docs/security/secure-development.md)

## Known gaps / roadmap

- **No multi-factor authentication or SSO yet.** Add TOTP MFA and SAML/OIDC SSO (for example through WorkOS) before selling to enterprise customers.
- **Rate limits are kept in each server's memory.** With several instances, move them to Redis or Postgres.
- **No formal penetration test yet.** Schedule one before your SOC 2 Type I audit.
