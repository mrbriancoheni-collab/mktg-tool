# Access Control Policy

> Template: adapt it to your team.

## Production access
- Production access (hosting dashboard, database, secrets) is limited to [NAMES/ROLES] and granted on a least-privilege basis.
- All accounts with production access use **SSO or a password manager plus MFA** (hosting, GitHub, Stripe, Google Cloud, Meta, Anthropic, Sentry, Resend, DNS registrar).
- Secrets live only in the hosting provider's environment settings and the team password manager. Never put them in code, tickets or chat.
- Querying production data directly is allowed only for support or incidents, and is recorded in the ticket or incident log.

## Joiners, movers and leavers
- **Access is granted** through a ticket approved by [APPROVER].
- **Access is removed within 24 hours** when someone leaves or changes role. Rotate any shared secrets they knew.
- **Access is reviewed every quarter** across all the systems above. Keep evidence of each review.

## Code changes
- `main` is protected: changes need a pull request, a review, and passing CI.
- Deploys are automatic from `main` and can be rolled back from the hosting dashboard.

## Customer-side controls (in the product)
Workspaces have owner, admin, member and viewer roles, invites tied to an email address, and an audit log. Customers manage their own users.
