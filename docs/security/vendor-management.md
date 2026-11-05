# Vendor Management

Before adopting a vendor that will process customer data:
1. Review its security posture: a SOC 2 report or ISO 27001 certificate, and the data location.
2. Sign or accept its DPA (data processing agreement), including the SCCs where data leaves the EU or UK.
3. Add it to `/legal/subprocessors` and give customers **30 days' notice** (see the DPA, section 4).

Review each vendor every year.

| Vendor | Purpose | Data | DPA | Report reviewed |
|---|---|---|---|---|
| Anthropic | AI generation | Board content and prompts | [ ] | [ ] |
| Render | Hosting and Postgres | All | [ ] | [ ] |
| Stripe | Billing | Billing contacts | [ ] | [ ] |
| Resend | Email | Names, email addresses | [ ] | [ ] |
| Sentry | Error monitoring | Technical logs, user IDs | [ ] | [ ] |
| GitHub | Source code | No customer data | n/a | [ ] |
