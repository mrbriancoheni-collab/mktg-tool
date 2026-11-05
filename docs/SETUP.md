# Going live: setup guide

This guide covers every outside account AdCanvas needs, in the order to do them. Items marked ⏳ involve a review by the provider that can take days or weeks, so **start those first**.

## 1. Deploy (about 30 minutes)

**Render (recommended):**

1. Push this repo to GitHub.
2. In Render, go to **New → Blueprint** and pick the repo. `render.yaml` creates the web service and a Postgres database, and generates `ENCRYPTION_KEY` and `SESSION_SECRET`.
3. Set `APP_URL` to your public URL (for example `https://app.yourdomain.com`), then add a custom domain under the service's **Settings → Custom Domains**.
4. Deploy. Open `/healthz` and confirm it returns `{"ok":true}`.

**Anywhere else:** use the `Dockerfile`. Provide Postgres 14+ as `DATABASE_URL`, plus the variables in `.env.example`. Run with `TRUST_PROXY=true` behind a load balancer.

> ⚠️ **Never change `ENCRYPTION_KEY` after launch.** Stored integration credentials are encrypted with it. Back it up in your password manager.

**Scaling out:** real-time collaboration fans out across instances through Postgres `LISTEN/NOTIFY`, so you don't need sticky sessions. Set `RUN_SCHEDULER=false` on every instance except one, so each scheduled report is sent once.

## 2. AI: Anthropic (10 minutes)

1. Create an organization at console.anthropic.com, add billing, and set a monthly spend limit.
2. Create an API key and set it as `ANTHROPIC_API_KEY`.
3. The badge in the app header switches from **AI demo** to **AI live**.

Each AI action costs a few cents. Plan limits (`shared/plans.ts`) cap usage per workspace.

## 3. Email: Resend (15 minutes)

Email is used for invites and password resets.

1. Sign up at resend.com and verify your sending domain (it gives you DNS records to add: SPF, DKIM).
2. Set `RESEND_API_KEY` and `EMAIL_FROM` (for example `AdCanvas <no-reply@yourdomain.com>`).

Without these, emails are printed to the server log. Invite links are also shown in the app, so you can test without email.

## 4. Billing: Stripe (30 minutes)

Skip this section for an internal tool. Without `STRIPE_SECRET_KEY`, every workspace is unlimited.

1. In Stripe, create **two products** with monthly prices: Pro ($49) and Team ($149). Copy the price IDs (`price_…`) into `STRIPE_PRICE_PRO` and `STRIPE_PRICE_TEAM`.
2. Copy the secret key into `STRIPE_SECRET_KEY`. Use test mode (`sk_test_…`) first.
3. Under **Developers → Webhooks**, add the endpoint `{APP_URL}/api/billing/webhook` with these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`

   Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Under **Settings → Billing → Customer portal**, enable cancellations, plan switching between Pro and Team, and invoice history.
5. Test end to end: upgrade with the test card `4242 4242 4242 4242`, and check that the plan in **Settings → Plan & usage** changes.
6. Switch to live keys and recreate the products, prices and webhook in live mode.

## 5. Monitoring: Sentry (10 minutes)

1. Create a Node.js project at sentry.io and set `SENTRY_DSN`.
2. Server exceptions and browser errors (sent through `/api/client-errors`) are reported automatically.

Also add uptime monitoring on `/healthz` (Render has this built in, or use Better Stack or UptimeRobot).

## 6. ⏳ Google Ads + GA4 (start now: 1–4 weeks)

1. **Google Cloud project.** Go to console.cloud.google.com and create a project. Then:
   - Enable the **Google Ads API**, the **Google Analytics Data API** and the **Google Analytics Admin API**.
   - Set up the **OAuth consent screen** as an External app. Add your privacy URL (`{APP_URL}/legal/privacy`), terms URL, logo and domain.
   - Add these scopes: `https://www.googleapis.com/auth/adwords` and `https://www.googleapis.com/auth/analytics.readonly`.
   - **Submit for verification** ⏳. Both scopes are sensitive, so Google reviews your app. Until then, only test users you add can connect.
   - Under **Credentials**, create an OAuth client ID of type Web application, with the redirect URI `{APP_URL}/api/oauth/callback`. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
2. **Google Ads developer token.**
   - Sign in to a Google Ads **manager (MCC) account**. Go to **Tools → API Center** and apply for a developer token ⏳. It starts in test mode. Apply for **Basic access** to use it with real accounts.
   - Set `GOOGLE_ADS_DEVELOPER_TOKEN`.
   - Set `GOOGLE_ADS_API_VERSION` to a currently supported version from the [release notes](https://developers.google.com/google-ads/api/docs/release-notes). Each version is supported for about a year, so put a recurring reminder in your calendar to bump it.
   - If customers will connect through their own MCC, they can enter the manager ID when choosing an account. You can also set `GOOGLE_ADS_LOGIN_CUSTOMER_ID` as a default.
3. **Test it.** In the app, add **Google Ads** to a board, click **Connect with Google** and choose an account. Then select a Google Search node, **link campaigns**, and click **Sync data**.

## 7. ⏳ Meta Marketing API (start now: 1–4 weeks)

1. **App.** At developers.facebook.com, create an app of type **Business**. Add the **Marketing API** and **Facebook Login for Business** products.
2. **Settings.**
   - Valid OAuth redirect URI: `{APP_URL}/api/oauth/callback`.
   - Privacy policy URL: `{APP_URL}/legal/privacy`.
   - Terms URL: `{APP_URL}/legal/terms`.
   - **User data deletion:** choose "Data deletion instructions URL" and enter `{APP_URL}/legal/data-deletion`.
3. **Business verification** ⏳ (Business Settings → Security Center).
4. **App Review** ⏳: request **Advanced Access** for `ads_read`, `ads_management`, `business_management` and `pages_show_list`. Each permission needs a screencast showing how it's used: connecting, choosing an ad account, syncing metrics, and publishing creatives.
5. Set `META_APP_ID`, `META_APP_SECRET`, and `META_GRAPH_VERSION` (a current version from the [changelog](https://developers.facebook.com/docs/graph-api/changelog)).
6. Optionally, `META_CONVERSION_ACTIONS` sets which Meta action types count as conversions. The default is `purchase,lead,complete_registration`.
7. Meta tokens last about 60 days. Users see a "reconnect" message when theirs expire.

## 8. Not yet live

- **LinkedIn and TikTok** use preview connectors that return sample data. The live versions need LinkedIn Marketing Developer Platform approval ⏳ and TikTok Marketing API approval ⏳, then a provider module like `server/integrations/providers.ts`.
- **HubSpot, Salesforce, Shopify, Klaviyo and others** store credentials (encrypted) but don't sync yet. Shopify and Stripe revenue can be imported today as a CSV with UTM columns.

## 9. Before you announce it

- [ ] Fill in the legal placeholders and get the lawyer review (see `LEGAL-CHECKLIST.md`).
- [ ] Back up `ENCRYPTION_KEY`. Confirm daily database backups are on, and do a test restore.
- [ ] Sign up as a new user on production. Run AI Build, invite a teammate, share a link, connect Slack and send a report.
- [ ] Do the Stripe test-mode upgrade and downgrade, then switch to live keys.
- [ ] Set up Sentry and uptime alerts.
