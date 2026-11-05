# AdCanvas

An AI-powered visual canvas for ad campaigns, from planning through analysis. Teams map traffic sources, pages, follow-ups and tools as connected nodes. AI builds the plan, writes the ads and analyzes the results. Live data comes from Google Ads, GA4 and Meta.

It's a multi-tenant SaaS: accounts, workspaces, roles, billing, real-time collaboration, and the security and legal groundwork to launch. It also runs as an unlimited internal tool when billing isn't configured.

## Features

| Area | What you get |
|---|---|
| **Plan** | **AI Build** turns a short brief into a full funnel (channels, pages, nurture, sales steps, tracking) with budgets and conversion assumptions. You can also start from B2B, e-commerce or webinar templates. |
| **Map** | An infinite canvas with 152 B2B/B2C elements and real brand logos. Drag, connect, use sticky notes, undo/redo, and split traffic between paths. |
| **Forecast** | Live spend, visitors, leads, customers, revenue, ROAS, CPA and profit. Analyze view sizes each connection by its traffic volume. |
| **Create** | AI assets per node: ad copy, creative briefs, audiences, video scripts, landing pages, email/SMS and outbound sequences, SEO briefs, chatbot scripts. |
| **Launch** | UTM builder. Ad packs within each platform's character limits: export a Google Ads Editor or Meta bulk CSV, or **publish as drafts** (paused Google Ads ad groups, Meta ad creatives). |
| **Measure** | **Live sync** from Google Ads, GA4 and Meta: link each node to its campaigns and pull month-to-date actuals. Plus CSV import and revenue attribution by UTM. |
| **Analyze** | AI health score, ranked findings and experiments. AI chat that sees the whole canvas. Scheduled reports with alerts on spend pacing, CPC, CTR and conversions, sent to Slack, Zapier, Make or a webhook. |
| **Collaborate** | Real-time co-editing with presence, comments on any element, and view-and-comment share links for clients. |
| **Teams** | Workspaces (one per client, for agencies), owner/admin/member/viewer roles, email invites and an audit log. |
| **Billing** | Free / Pro / Team plans with limits on boards, AI actions and members. Stripe Checkout, Customer Portal and webhooks. |
| **Trust** | See [SECURITY.md](SECURITY.md) and the legal pages at `/legal/*`. Self-serve data export and deletion. |

## Quick start (local)

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173 and sign up. With no configuration, it runs fully offline:

- **Database:** an embedded Postgres in `data/pg`.
- **AI:** demo mode, with templated responses.
- **Billing:** off, so every workspace is unlimited.
- **Email:** printed to the server log.

Copy `.env.example` to `.env` to switch features on. For example, set `ANTHROPIC_API_KEY` for live AI.

```bash
npm test
```

This runs 30 integration and unit tests against an in-memory Postgres. Set `DATABASE_URL` to run them against a real one.

## Deploy

See **[docs/SETUP.md](docs/SETUP.md)** for step-by-step setup of hosting, Anthropic, Stripe, email, Sentry, and the Google and Meta developer apps. In short:

1. On Render, create a Blueprint from this repo. `render.yaml` provisions the app and Postgres, and generates the encryption and session keys. Any other host can use the `Dockerfile`.
2. Set `APP_URL` and `ANTHROPIC_API_KEY`, plus Stripe, Resend and Sentry if you use them.
3. Apply for Google Ads and Meta API access early. Approval takes weeks.

## Architecture

```
src/                React + React Flow client
  Root.tsx          routing: landing / auth / legal / share links / app
  lib/sync.ts       real-time sync (element-level ops ↑, Server-Sent Events ↓)
server/
  app.ts            routes, role checks, plan limits, security headers
  auth.ts           sessions, workspaces, roles, invites, audit log
  billing.ts        Stripe checkout, portal, webhooks
  db.ts             Postgres / PGlite with migrations
  realtime.ts       SSE rooms + Postgres NOTIFY fan-out across instances
  integrations/     connector registry, OAuth, Google Ads / GA4 / Meta clients
  ai.ts, demo.ts    Claude-powered planning, assets, analysis, chat (+ offline demo)
shared/             catalog, simulator, collaboration ops, plans, ad packs
legal/              Privacy, Terms, DPA, AUP, Subprocessors, Cookies, Data deletion (templates)
docs/               setup guide + security policy templates
tests/              API integration + unit tests
```

## Status and known limits

- **Live connectors (Google Ads, GA4, Meta) are tested against mocked API responses only.** Verify them with your own developer apps once approved, and set the API versions in env. LinkedIn and TikTok are preview connectors that return sample data.
- **Publishing creates drafts only.** Google Ads ad groups and ads are created paused; Meta gets ad creatives but not ads. Nothing spends money until a person enables it on the platform.
- **No MFA or SSO yet**, and rate limits are kept in each server's memory. See SECURITY.md → roadmap.
- **The legal documents are templates.** Fill in the placeholders and have counsel review them; see [LEGAL-CHECKLIST.md](LEGAL-CHECKLIST.md).
