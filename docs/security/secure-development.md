# Secure Development

- Every change goes through a pull request with review. CI runs the typecheck, the test suite (including the workspace-isolation and auth tests) and `npm audit`.
- New API routes must:
  1. Sit behind `requireAuth` or be explicitly public.
  2. Use `requireRole` for anything that changes data.
  3. Scope every database query by `req.auth.workspace.id`.
  4. Validate input sizes.
  5. Write to the audit log for security-relevant actions.
- Never log secrets, tokens or full request bodies. Never return stored credentials to clients.
- Outbound requests to user-supplied URLs must go through `server/net.ts` (SSRF guard).
- Dependencies: keep Dependabot (or Renovate) on. Fix high and critical advisories within 7 days.
- Secrets live only in environment variables. Rotate them when someone with access leaves, and after any incident.
