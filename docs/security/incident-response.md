# Incident Response Policy

> Template: adapt the names, contacts and timings to your team, and review it every year.

**Owner:** [NAME, ROLE] · **Last reviewed:** [DATE]

## Severity levels
| Level | Examples | Response |
|---|---|---|
| SEV-1 | Confirmed data breach, cross-workspace data exposure, credential leak, full outage | Start immediately, 24/7 |
| SEV-2 | A security vulnerability being actively probed, partial outage, a broken integration affecting many customers | Within 4 hours |
| SEV-3 | A low-risk vulnerability, or a single-customer issue | Next business day |

## Process
1. **Detect and report.** Alerts come from Sentry, uptime monitoring, unusual entries in the audit log, or reports to [SECURITY EMAIL]. Anyone can declare an incident.
2. **Assign roles.** Name an incident lead and a communications lead. Open a private channel and keep a timeline there.
3. **Contain.** Use whichever of these apply:
   - Revoke sessions: `DELETE FROM sessions WHERE user_id=…`, or all sessions.
   - Rotate secrets: Anthropic, Stripe, Resend and OAuth client secrets, and `SESSION_SECRET`.
   - Disable affected integrations.
   - Turn off share links.
   - Block offending IPs at the load balancer.
4. **Investigate.** Use the audit log, server and Sentry logs, and database queries to establish scope: which workspaces, which data, and over what period.
5. **Notify.**
   - Affected customers: **without undue delay** (our DPA commits to [48] hours).
   - Regulators, where personal data is involved: **within 72 hours** under GDPR Art. 33 (via your lead supervisory authority), and per US state breach laws.
   - Platform partners (Google, Meta) if their user data is involved, as their terms require.
6. **Recover.** Deploy fixes, restore from backup if needed, and verify.
7. **Review.** Write a blameless postmortem within 5 business days, with owners and dates for each follow-up action.

## Contacts
Incident lead: [NAME, PHONE] · Legal: [COUNSEL] · Hosting: Render support · Payments: Stripe support · Insurer (cyber policy): [CARRIER, POLICY #]
