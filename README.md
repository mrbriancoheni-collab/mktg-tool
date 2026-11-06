# AdCanvas

An AI-powered visual canvas for ad campaigns, from planning through analysis. Teams map traffic sources, pages, follow-ups and tools as connected steps. AI builds the plan, edits it on request, writes and designs the ads, and analyzes results. Live data comes from Google Ads, GA4, Meta, LinkedIn, TikTok, Shopify, HubSpot and Salesforce.

It's a multi-tenant SaaS: accounts, workspaces, roles, billing, real-time collaboration, and the security and legal groundwork to launch. It also runs as an unlimited internal tool when billing isn't configured.

## What it does

| Area | Capabilities |
|---|---|
| **Plan** | **AI Build** turns a brief into a full funnel with budgets and conversion assumptions. A **template gallery** has 10 proven funnels, filterable by B2B/B2C and goal (e-commerce, SaaS trial, B2B demo, local services, app installs, subscription box, agency, webinar, events, nonprofit). |
| **Map** | An infinite canvas with 152 B2B/B2C building blocks and real brand logos. Drag to pan, Shift-drag to select, and press **+** on any step to add the suggested next step. Sticky notes, undo/redo, traffic splits. |
| **Edit with AI** | Tell the AI assistant "add retargeting", "cut budget 15%" or "rebalance toward the best ROAS". It explains the change and shows a **preview**, which you apply or discard in one click. Applied changes can be undone. |
| **Forecast** | Live spend, visitors, leads, customers, revenue, ROAS, CPA and profit. **What-if** sliders for CPC, conversion, order value and budget. A **budget optimizer** that models diminishing returns. |
| **Create** | AI copy for each step: ad variants, briefs, audiences, video scripts, landing pages, email/SMS, outbound, SEO, chatbot. **Ad packs** within each platform's character limits: export them or **publish as paused drafts** to Google Ads and Meta. **AI ad mockups** in feed and story sizes, in brand colours. |
| **Measure** | **Integrations hub** in Settings, with OAuth for Google Ads, GA4, Meta, LinkedIn and TikTok. **Campaign auto-matching** suggests which live campaigns belong to which steps. **Daily history** feeds a **Dashboard** with date ranges, comparison with the previous period, trends, budget pacing and channel breakdown. Revenue attribution from Shopify, HubSpot and Salesforce, or CSV. |
| **Analyze & improve** | AI health score, findings and experiments. An **experiment tracker** with an A/B significance check and sample-size guidance. Scheduled reports and alerts to Slack, Zapier, Make or a webhook. |
| **Collaborate** | Real-time co-editing with presence, comments with **@mentions**, in-app **notifications**, **version history** with restore, and view-and-comment share links. |
| **Deliver** | Branded **PDF reports** and **PowerPoint decks**. **White-label** branding (logo, colour, name) on share links and exports. |
| **Onboard** | First-run tour, a getting-started checklist, plain-language labels with ⓘ tooltips, a tabbed inspector (Plan · Creative · Tracking · Results), and a mobile layout. |
| **Teams & billing** | Workspaces (one per client, for agencies), owner/admin/member/viewer roles, invites, an audit log, Free/Pro/Team plans through Stripe, and AI usage metering. |
| **Trust** | Two-step verification (TOTP and recovery codes), Sign in with Google, encrypted credentials, CSRF/SSRF protection, shared rate limits, data export and deletion. See [SECURITY.md](SECURITY.md) and `/legal/*`. |
| **Product analytics** | First-party event tracking and an activation funnel at `/admin` (set `ADMIN_EMAILS`), with optional PostHog forwarding. |

## Quick start (local)

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173 and sign up. It runs fully offline:

- **Database:** an embedded Postgres.
- **AI:** demo mode (understands simple edit requests).
- **Billing:** off.
- **Email:** printed to the server log.
- **Dashboard:** "Try it with sample data" fills in sample history.

Copy `.env.example` to `.env` to switch features on.

```bash
npm test
```

This runs 48 integration and unit tests against an in-memory Postgres. Set `DATABASE_URL` to run them against a real one; they also pass on Postgres 16.

## Deploy

See **[docs/SETUP.md](docs/SETUP.md)** for every outside account, in order: hosting, Anthropic, email, Stripe, Sentry, Google, Meta, LinkedIn, TikTok, Shopify/HubSpot/Salesforce, Sign in with Google and analytics. On Render, use the included `render.yaml` blueprint. Any other host can use the `Dockerfile`.

The marketing site and blog run on WordPress at your main domain, with the app on the `app.` subdomain. The block theme and starter content are in [`wordpress/`](wordpress/README.md).

Before launch, run the **[usability test plan](docs/USABILITY-TEST-PLAN.md)** and work through **[LEGAL-CHECKLIST.md](LEGAL-CHECKLIST.md)**.

## Architecture

```
src/                 React + React Flow client (heavy views lazy-loaded)
  App.tsx            canvas, toolbar, side panels (Inspect · Insights · Optimize · AI · Comments)
  Root.tsx           routing: landing / auth / legal / share / report / admin / app
  lib/sync.ts        real-time sync (element ops ↑, Server-Sent Events ↓)
  components/        Inspector, Dashboard, OptimizePanel, ChatPanel, Integrations, Mockups, …
server/
  app.ts             routes, role checks, plan limits, security headers
  auth.ts, totp.ts   sessions, workspaces, invites, 2FA, Google sign-in, rate limits, audit log
  assistant.ts       AI assistant with the propose_changes tool (canvas edits)
  ai.ts, demo.ts     planning, assets, analysis, ad packs, mockups (+ offline demo)
  features.ts        experiments, version history, notifications
  integrations/      OAuth + Google Ads, GA4, Meta, LinkedIn, TikTok, Shopify, HubSpot, Salesforce
  db.ts              Postgres / PGlite with migrations
shared/              catalog, simulator, ops, optimizer & stats, templates, auto-match, AI edits
tests/               API integration + unit tests
docs/                setup guide, usability test plan, security policy templates
wordpress/           block theme + starter content for the marketing site and blog
legal/               Privacy, Terms, DPA, AUP, Subprocessors, Cookies, Data deletion (templates)
```

## Status and known limits

- **Untested against live accounts.** Every live connector is written against the provider's documented API and tested with mocked responses. None has been run against real accounts yet, because that needs your developer apps and their approvals. API versions are set in env. Expect small fixes the first time each one runs live.
- **Publishing creates drafts only.** Google Ads gets paused ad groups and Meta gets ad creatives. Nothing spends money until someone enables it.
- **Mockups are designed layouts, not photos.** Claude doesn't generate photographs; each mockup includes an image prompt to use with an image tool.
- **No enterprise SSO yet.** SAML/Okta SSO and a workspace-wide 2FA requirement aren't built. Salesforce uses pasted tokens.
- **The legal documents are templates.** Fill in the placeholders and have counsel review them.
