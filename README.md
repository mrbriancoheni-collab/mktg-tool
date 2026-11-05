# AdCanvas

An AI-powered visual canvas for ad campaigns, from planning through analysis. It works like a whiteboard (Miro) crossed with a funnel mapper (Funnelytics). You map traffic sources, pages, follow-ups and tools as connected nodes. AI builds the plan, writes the assets, and analyzes the results.

## What it does

| Stage | Feature |
|---|---|
| **Create** | **AI Build**: describe the product, audience, budget and goal, and Claude lays out a complete funnel with channels, pages, nurture, sales steps and tracking. Budgets, CPCs and conversion assumptions are filled in. You can also start from a B2B, e-commerce or webinar template. |
| **Map** | An infinite canvas with drag-and-drop, connections, sticky notes, multi-select, duplicate (⌘D), undo/redo (⌘Z / ⇧⌘Z), snap-to-grid and a minimap. Edge weights split traffic between paths. |
| **Forecast** | A live simulator pushes visitors through the flow and updates spend, visitors, leads, customers, revenue, ROAS, CPA and profit as you edit. **Analyze** view sizes edges by traffic volume, Funnelytics-style. |
| **Support** | Per-node **AI assets**: ad copy variants, creative briefs, audiences, video scripts, landing-page copy, email/SMS sequences, outbound sequences, SEO briefs, chatbot scripts, offers and tracking plans. They stream in and stay on the node, where you can edit and copy them. |
| **Integrate** | 53 integrations: ad platforms, analytics, CRM, email/SMS, commerce, support, site builders, automation. Connect one from its node. **Sync data** pulls actuals onto the nodes. A CSV import is included too. |
| **Collaborate** | Multiple **boards** saved on the server with autosave. **Share links** give clients view + comment access. **Comments** can be attached to any element. Presence shows who else is viewing. Live refresh picks up others' saves, and **conflict protection** asks which version to keep if two people save at once. |
| **Launch** | Per-source **UTM builder** and tracking URLs. **Ad packs** generate copy within each platform's character limits and export a **Google Ads Editor CSV**, a **Meta bulk-import CSV**, or LinkedIn/video ad sheets. |
| **Report** | Scheduled **daily or weekly reports** to Slack, Zapier, Make or a webhook, with **plan-vs-actual alerts** for overspend or under-pacing, CPC spikes, low CTR and conversion drops. **Revenue import** attributes orders or deals from Shopify, Stripe or CRM CSVs to traffic sources by UTM. |
| **Analyze** | **Insights** scores funnel health, ranks findings by impact (leaks, wasted spend, off-benchmark steps, missing tracking), links each finding to its node, and proposes experiments. **AI Chat** answers questions with the whole canvas as context. Findings can be shared to Slack, Zapier or Make. |

### Element library (152 elements, B2B / B2C filter)

- **Traffic:** Meta, Instagram, TikTok, LinkedIn, Pinterest, Snapchat, X, Reddit, Quora, Google Search / PMax / Shopping / Display, YouTube, Microsoft, Amazon, Apple Search Ads, programmatic, native, CTV, audio/podcast, retargeting, ABM, G2/Capterra, newsletter sponsorships, SEO, organic social, email/SMS/push lists, community, affiliates, referrals, partners, marketplaces, cold email, LinkedIn outreach, cold calling, events, direct mail, OOH/QR, TV/radio.
- **Pages:** landing, blog, opt-in, lead magnet, quiz, webinar/VSL, sales page, app store, pricing, demo request, free trial, case study, comparison, booking, product, collection, cart, checkout, order bump, upsell, downsell, thank-you, onboarding, member area.
- **Actions and logic:** email, SMS, WhatsApp, push, chatbot, abandoned cart, browse abandonment, post-purchase, review request, win-back, lead form, lead scoring, MQL, SDR follow-up, sales call, proposal, closed won, trial activation, subscription, expansion, purchase/goal events, A/B split, if/else, audience, tags, loyalty, wait.
- **Integrations:** Google Ads, Meta Ads Manager, TikTok, LinkedIn, GA4, GTM, pixels, Mixpanel, Amplitude, Segment, Hotjar, attribution tools, Looker Studio, BigQuery, HubSpot, Salesforce, Pipedrive, Marketo, Apollo/ZoomInfo, Outreach, Gong, Calendly, Zoom, Klaviyo, Mailchimp, ActiveCampaign, Brevo, Attentive, Twilio, Shopify, WooCommerce, BigCommerce, Stripe, PayPal, Chargebee, Intercom, Zendesk, Trustpilot, G2, Webflow, WordPress, Wix, Unbounce, Typeform, Zapier, Make, Slack, Sheets, Airtable, Notion, webhooks.

Icons are real brand logos from [simple-icons](https://simpleicons.org) (CC0) where available. Brands simple-icons doesn't include (for example LinkedIn, Salesforce, Klaviyo and Slack) get a Lucide icon in the brand colour. Logos are trademarks of their owners.

## Run it

```bash
npm install
```

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # optional; without it the app runs in demo mode
```

```bash
npm run dev
```

Open http://localhost:5173. The API runs on :8787.

Without credentials, the **AI demo** badge shows. Planning uses templates, assets are format examples, and analysis is rule-based against benchmarks, so you can explore everything offline. With a key, all AI features use Claude (`claude-opus-5-5`; override with `ADCANVAS_MODEL`).

For production:

```bash
npm run build && npm start
```

This serves the built client and API on one port (`PORT`, default 8787).

## Project layout

```
shared/     catalog (elements, icons, benchmarks), funnel simulator, templates, types
server/     Express API: ai.ts (Claude), demo.ts (offline mode), integrations/
src/        React + React Flow client: canvas nodes/edges, palette, inspector, insights, chat
scripts/    gen-brand-icons (logo subset), check-catalog, smoke test
```

### Adding an element
Add an entry to `shared/catalog.ts`, then run `npm run icons` (if you added a `brand` slug) and `npm run check:catalog`. The AI planner, palette, simulator and analyzer pick it up automatically.

### Legal & privacy
Template legal documents are in `legal/` and served in the app at `/legal/privacy`, `/legal/terms`, `/legal/dpa`, `/legal/subprocessors`, `/legal/acceptable-use`, `/legal/cookies` and `/legal/data-deletion`. These are the URLs ad platforms ask for during app review.

**They are templates.** Fill in the `[PLACEHOLDERS]` and have counsel review them. `LEGAL-CHECKLIST.md` lists everything else needed before launch: entity, trademark, DPAs, platform approvals, and advertising and SMS law. In-app **Privacy & data** (in the board menu) provides full data export and deletion.

### Storage
Boards are saved as JSON files in `data/boards/`, behind the `BoardRepo` interface in `server/store.ts`. Swap in Postgres by implementing that interface. Set `APP_URL` so report messages link back to boards.

### Not yet built
- **Accounts and logins.** Anyone who can reach the server can open every board. Put it behind auth, such as Clerk, Auth0, or a VPN for internal use, before exposing it publicly.
- **Simultaneous editing** of the same element (Miro-style). Today, saves are whole-board with conflict detection. For true real-time co-editing, add a CRDT layer such as Yjs or Liveblocks.
- **Direct publishing to ad platforms.** Ad packs export files for manual upload until API access is approved.

### Making an integration live
Connectors live in `server/integrations/index.ts`. **Slack, Zapier, Make and Webhook are live now** and post real messages. The other connectors store credentials locally (`data/connections.json`, git-ignored). The ad-platform and analytics connectors return labelled **sample** metrics on Sync so the analytics loop can be tried end to end. To go live, replace `fetchMetrics` with the provider's reporting API. For example, Google Ads uses the Google Ads API with an OAuth app, and Meta uses the Marketing API Insights endpoint. For multi-user deployments, move credentials into a secrets store.

## Roadmap ideas
- OAuth flows and real reporting APIs for Google Ads, Meta, LinkedIn, TikTok and GA4
- Multi-board workspaces, sharing and real-time collaboration (for example Yjs)
- Push AI-generated ads straight to platforms as drafts
- Scheduled syncs with anomaly alerts to Slack
- Cohort / LTV modelling for subscriptions
