// Additional starter funnels by industry and goal.
import type { PlanSpec } from "./model";

type N = PlanSpec["nodes"][number];
const n = (id: string, type: string, label: string, notes: string, x: Partial<N> = {}): N => ({
  id, type, label, notes, budget: null, cpc: null, visitors: null, conversionRate: null, price: null, ...x,
});
const e = (source: string, target: string, weight: number | null = null) => ({ source, target, weight });

export const MORE_TEMPLATES: Record<string, { name: string; description: string; industry: string; goal: string; segment: "b2b" | "b2c"; build: (budget: number, product: string) => PlanSpec }> = {
  saas_trial: {
    name: "SaaS free trial",
    description: "Search + LinkedIn → pricing → free trial → activation → paid subscription",
    industry: "Software", goal: "Sign-ups", segment: "b2b",
    build: (b, p) => ({
      name: "SaaS Free Trial",
      summary: `Product-led growth for ${p}: capture high-intent search and comparison traffic, convert to a free trial, and drive activation with onboarding emails so trials turn into paid subscriptions.`,
      nodes: [
        n("s", "google_search", "Google – Category & Competitor KWs", "Alternatives, vs, category terms.", { budget: Math.round(b * 0.5), cpc: 4 }),
        n("l", "linkedin_ads", "LinkedIn – Role Targeting", "Ops/marketing managers at 20-500 employee companies.", { budget: Math.round(b * 0.3), cpc: 6.5 }),
        n("r", "retargeting", "Retargeting – Pricing Visitors", "Visitors who saw pricing but didn't start a trial.", { budget: Math.round(b * 0.2), cpc: 1.8 }),
        n("c", "comparison", "Comparison Page", "Us vs. top competitors.", { conversionRate: 30 }),
        n("pp", "pricing_page", "Pricing Page", "Plans, FAQ, social proof.", { conversionRate: 18 }),
        n("t", "trial_signup", "Free Trial Signup", "14-day trial, no card.", { conversionRate: 35 }),
        n("o", "email_sequence", "Onboarding Emails", "Day 0/1/3/7 setup tips.", { conversionRate: 100 }),
        n("a", "trial_activation", "Activation", "Key action completed in week 1.", { conversionRate: 45 }),
        n("sub", "subscription", "Paid Subscription", "Annualized first-year value.", { conversionRate: 40, price: 1200 }),
        n("m", "mixpanel", "Mixpanel", "Activation and retention analytics."),
        n("st", "stripe", "Stripe", "Subscription billing."),
      ],
      edges: [e("s", "c", 1), e("s", "pp", 2), e("l", "pp"), e("r", "pp"), e("c", "pp"), e("pp", "t"), e("t", "o"), e("o", "a"), e("a", "sub"), e("a", "m"), e("sub", "st")],
    }),
  },
  local_leads: {
    name: "Local services leads",
    description: "Google Search + Meta → landing page → call/booking → job won",
    industry: "Local services", goal: "Leads", segment: "b2c",
    build: (b, p) => ({
      name: "Local Service Leads",
      summary: `Generate booked jobs for ${p} in your service area. Google Search captures urgent demand ("near me"), Meta builds awareness locally, and fast follow-up by phone/SMS converts leads into booked jobs.`,
      nodes: [
        n("g", "google_search", "Google – 'Near Me' Searches", "Service + city keywords, call extensions.", { budget: Math.round(b * 0.65), cpc: 6 }),
        n("m", "meta_ads", "Meta – Local Radius", "15-mile radius, seasonal offer.", { budget: Math.round(b * 0.35), cpc: 1.5 }),
        n("lp", "landing_page", "Quote Landing Page", "Reviews, guarantee, instant quote form.", { conversionRate: 14 }),
        n("lf", "lead_form", "Quote Request", "Name, phone, job type.", { conversionRate: 100 }),
        n("sms", "sms", "Instant SMS Follow-up", "Text within 2 minutes.", { conversionRate: 60 }),
        n("bk", "booking", "Booked Estimate", "On-site or video estimate.", { conversionRate: 55 }),
        n("w", "closed_won", "Job Won", "Average job value.", { conversionRate: 45, price: 850 }),
        n("rv", "review_request", "Review Request", "Ask happy customers for Google reviews.", { conversionRate: 25 }),
        n("tw", "twilio", "Twilio", "SMS + call tracking."),
      ],
      edges: [e("g", "lp"), e("m", "lp"), e("lp", "lf"), e("lf", "sms"), e("sms", "bk"), e("bk", "w"), e("w", "rv"), e("sms", "tw")],
    }),
  },
  app_install: {
    name: "Mobile app installs",
    description: "TikTok + Apple Search Ads → app store → onboarding → subscription",
    industry: "Consumer apps", goal: "Installs", segment: "b2c",
    build: (b, p) => ({
      name: "App Install Campaign",
      summary: `Drive installs of ${p} with short-form video on TikTok and intent capture on Apple Search Ads, then convert installers to paying subscribers with a strong onboarding and free-trial paywall.`,
      nodes: [
        n("tt", "tiktok_ads", "TikTok – UGC Demos", "Creator demos, 3 hooks per week.", { budget: Math.round(b * 0.5), cpc: 0.6 }),
        n("as", "apple_search_ads", "Apple Search Ads", "Brand + category keywords.", { budget: Math.round(b * 0.3), cpc: 1.4 }),
        n("me", "meta_ads", "Meta – Advantage+ App", "App event optimization.", { budget: Math.round(b * 0.2), cpc: 0.9 }),
        n("st", "app_store", "App Store Listing", "Screenshots + preview video.", { conversionRate: 32 }),
        n("ob", "onboarding", "In-app Onboarding", "Personalization quiz.", { conversionRate: 65 }),
        n("tr", "trial_activation", "Free Trial Start", "7-day trial paywall.", { conversionRate: 18 }),
        n("sub", "subscription", "Annual Subscription", "Yearly plan value.", { conversionRate: 45, price: 90 }),
        n("pu", "push_notification", "Push Re-engagement", "Day 1/3 reminders.", { conversionRate: 6 }),
        n("am", "amplitude", "Amplitude", "Funnel and retention analytics."),
      ],
      edges: [e("tt", "st"), e("as", "st"), e("me", "st"), e("st", "ob"), e("ob", "tr", 3), e("ob", "pu", 1), e("pu", "tr"), e("tr", "sub"), e("ob", "am")],
    }),
  },
  subscription_box: {
    name: "DTC subscription",
    description: "Meta + influencers → quiz → first box offer → subscription + referrals",
    industry: "E-commerce", goal: "Subscribers", segment: "b2c",
    build: (b, p) => ({
      name: "Subscription Box Launch",
      summary: `Acquire subscribers for ${p} with a personalization quiz that lifts conversion, an introductory first-box offer, and a referral loop that lowers blended acquisition cost.`,
      nodes: [
        n("m", "meta_ads", "Meta – Quiz Ads", "Broad targeting, quiz hook creative.", { budget: Math.round(b * 0.6), cpc: 1.2 }),
        n("i", "influencer", "Creator Partnerships", "Unboxing videos with discount codes.", { budget: Math.round(b * 0.3), cpc: 0.9 }),
        n("rt", "retargeting", "Retargeting – Quiz Drop-offs", "Finish-your-quiz reminders.", { budget: Math.round(b * 0.1), cpc: 0.6 }),
        n("q", "quiz", "Personalization Quiz", "6 questions, results page with offer.", { conversionRate: 55 }),
        n("ck", "checkout", "First Box Checkout", "50% off first box.", { conversionRate: 22, price: 35 }),
        n("sub", "subscription", "Ongoing Subscription", "Retained revenue (3 more boxes).", { conversionRate: 60, price: 135 }),
        n("rf", "referral", "Give $20 / Get $20", "Referral program after second box.", { visitors: 300 }),
        n("kl", "klaviyo", "Klaviyo", "Quiz-abandon and post-purchase flows."),
        n("sh", "shopify", "Shopify + Recharge", "Store and subscriptions."),
      ],
      edges: [e("m", "q"), e("i", "q"), e("rt", "q"), e("rf", "q"), e("q", "ck"), e("ck", "sub"), e("q", "kl"), e("ck", "sh")],
    }),
  },
  agency_leadgen: {
    name: "Agency / consulting leads",
    description: "LinkedIn + cold email → case study → strategy call → proposal → client",
    industry: "Professional services", goal: "Clients", segment: "b2b",
    build: (b, p) => ({
      name: "Agency Client Acquisition",
      summary: `Win retainer clients for ${p}. Combine targeted LinkedIn ads and personalized outbound to drive prospects to proof (case studies), then convert through a free strategy call and proposal.`,
      nodes: [
        n("li", "linkedin_ads", "LinkedIn – Founders & CMOs", "Thought-leader ads + document ads.", { budget: Math.round(b * 0.7), cpc: 7 }),
        n("ce", "cold_email", "Cold Email – Account List", "3,000 sends/month; counts engaged replies & clicks (~4%).", { visitors: 120 }),
        n("lo", "linkedin_outreach", "LinkedIn Outreach", "Founder-led connection + DM; counts engaged replies.", { visitors: 60 }),
        n("cs", "case_study", "Case Study Hub", "3 results-led case studies.", { conversionRate: 4 }),
        n("bk", "booking", "Strategy Call Booking", "30-min free audit.", { conversionRate: 25 }),
        n("sc", "sales_call", "Strategy Call", "Audit + recommendations.", { conversionRate: 50 }),
        n("pr", "proposal", "Proposal", "3-tier retainer options.", { conversionRate: 45 }),
        n("w", "closed_won", "Signed Client", "First-year retainer value.", { conversionRate: 30, price: 24000 }),
        n("hs", "hubspot", "HubSpot", "Pipeline + sequences."),
        n("ap", "apollo", "Apollo", "Prospect lists and enrichment."),
      ],
      edges: [e("li", "cs"), e("ce", "cs", 1), e("ce", "bk", 1), e("lo", "bk"), e("cs", "bk"), e("bk", "sc"), e("sc", "pr"), e("pr", "w"), e("bk", "hs"), e("ce", "ap")],
    }),
  },
  event_registration: {
    name: "Event registrations",
    description: "Email list + Meta + LinkedIn → event page → ticket → attendance",
    industry: "Events", goal: "Registrations", segment: "b2b",
    build: (b, p) => ({
      name: "Event Registration Drive",
      summary: `Sell tickets for ${p}. Warm audiences (email list, past attendees) convert first; paid social extends reach; reminder sequences protect show-up rate.`,
      nodes: [
        n("el", "email_list", "Past Attendees & Newsletter", "Early-bird announcement.", { visitors: 4000 }),
        n("li", "linkedin_ads", "LinkedIn – Industry Targeting", "Speaker-led ads.", { budget: Math.round(b * 0.5), cpc: 5.5 }),
        n("me", "meta_ads", "Meta – Lookalikes of Attendees", "1% LAL of ticket buyers.", { budget: Math.round(b * 0.5), cpc: 1.3 }),
        n("lp", "landing_page", "Event Page", "Agenda, speakers, early-bird countdown.", { conversionRate: 9 }),
        n("ck", "checkout", "Ticket Checkout", "Early-bird & group tickets.", { conversionRate: 55, price: 299 }),
        n("rem", "email_sequence", "Reminder Sequence", "Logistics + agenda highlights.", { conversionRate: 85 }),
        n("at", "goal", "Attended", "Checked in on the day.", { conversionRate: 100 }),
        n("zm", "zoom", "Zoom / event platform", "Virtual sessions and check-in."),
      ],
      edges: [e("el", "lp"), e("li", "lp"), e("me", "lp"), e("lp", "ck"), e("ck", "rem"), e("rem", "at"), e("rem", "zm")],
    }),
  },
  nonprofit: {
    name: "Nonprofit donations",
    description: "Google Ad Grants + social → story page → donation → monthly giving",
    industry: "Nonprofit", goal: "Donations", segment: "b2c",
    build: (b, p) => ({
      name: "Donation Campaign",
      summary: `Grow donations for ${p}. Google Ad Grants and organic social bring cause-aware visitors; a story-led page converts first-time donors; a welcome series upgrades them to monthly giving.`,
      nodes: [
        n("gg", "google_search", "Google Ad Grants", "Cause keywords (grant-funded).", { visitors: 3000 }),
        n("me", "meta_ads", "Meta – Story Video", "Impact story video ads.", { budget: Math.round(b * 0.8), cpc: 0.9 }),
        n("so", "social_organic", "Organic Social", "Beneficiary stories.", { visitors: 1200 }),
        n("lp", "landing_page", "Impact Story Page", "One story, one ask, clear impact per $.", { conversionRate: 6 }),
        n("dn", "checkout", "Donation Form", "Average one-time gift.", { conversionRate: 70, price: 65 }),
        n("ws", "email_sequence", "Welcome & Impact Series", "Thank-you + impact updates.", { conversionRate: 8 }),
        n("mo", "subscription", "Monthly Giving", "First-year value of monthly gift.", { conversionRate: 100, price: 240 }),
        n("st", "stripe", "Stripe", "Donations and recurring gifts."),
      ],
      edges: [e("gg", "lp"), e("me", "lp"), e("so", "lp"), e("lp", "dn"), e("dn", "ws"), e("ws", "mo"), e("dn", "st")],
    }),
  },
};
