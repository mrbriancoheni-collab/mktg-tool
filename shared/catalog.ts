// The building blocks available on the canvas. Shared by the client (palette,
// rendering) and the server (AI prompt + schema constraints + benchmarks).

export type NodeKind = "traffic" | "page" | "action" | "integration" | "note";
export type Segment = "b2b" | "b2c" | "both";

export interface CatalogItem {
  type: string;
  kind: NodeKind;
  /** Sub-group shown in the palette. */
  group: string;
  label: string;
  /** Lucide icon name — always present, used when no brand logo exists. */
  icon: string;
  /** simple-icons slug for the real brand logo, when available. */
  brand?: string;
  color: string;
  description: string;
  segment: Segment;
  /** "lead" steps count toward Leads; "customer" steps count toward Customers. */
  role?: "lead" | "customer";
  /** Typical conversion-rate range (%) for this step, used by the analyzer. */
  benchmark?: [number, number];
  /** Default planning assumptions applied when the node is dropped on the canvas. */
  defaults?: Partial<PlanningInputs>;
  /** Kinds of AI assets that make sense for this node. */
  assets?: AssetKind[];
}

export interface PlanningInputs {
  /** Traffic: monthly budget in USD. */
  budget: number;
  /** Traffic: expected cost per click in USD. */
  cpc: number;
  /** Traffic: fixed visitor count (used instead of budget/cpc, e.g. organic). */
  visitors: number;
  /** Page/action: % of incoming visitors who take the next step. */
  conversionRate: number;
  /** Page/action: revenue per conversion in USD. */
  price: number;
}

export type AssetKind =
  | "ad_copy"
  | "creative_brief"
  | "audience"
  | "landing_copy"
  | "email_sequence"
  | "sms_sequence"
  | "video_script"
  | "tracking_plan"
  | "offer"
  | "outreach_sequence"
  | "seo_brief"
  | "chatbot_script";

export const ASSET_LABELS: Record<AssetKind, string> = {
  ad_copy: "Ad copy variants",
  creative_brief: "Creative brief",
  audience: "Audience & targeting",
  landing_copy: "Page copy",
  email_sequence: "Email sequence",
  sms_sequence: "SMS sequence",
  video_script: "Video script",
  tracking_plan: "Tracking plan",
  offer: "Offer & pricing angles",
  outreach_sequence: "Outreach sequence",
  seo_brief: "SEO content brief",
  chatbot_script: "Chatbot script",
};

const AD: AssetKind[] = ["ad_copy", "creative_brief", "audience", "video_script"];
const SEARCH: AssetKind[] = ["ad_copy", "audience"];
const VIDEO: AssetKind[] = ["video_script", "creative_brief", "audience"];
const PAGE: AssetKind[] = ["landing_copy", "offer"];
const TRACK: AssetKind[] = ["tracking_plan"];

type Item = Omit<CatalogItem, "kind" | "group">;
const group = (kind: NodeKind, name: string, items: Item[]): CatalogItem[] => items.map((i) => ({ ...i, kind, group: name }));

export const CATALOG: CatalogItem[] = [
  // ── Traffic: paid media ─────────────────────────────────────────
  ...group("traffic", "Paid social", [
    { type: "meta_ads", label: "Meta Ads", icon: "Megaphone", brand: "meta", color: "#0866ff", segment: "both", description: "Facebook & Instagram paid social", defaults: { budget: 5000, cpc: 1.2 }, assets: AD },
    { type: "instagram_ads", label: "Instagram Ads", icon: "Camera", brand: "instagram", color: "#e4405f", segment: "b2c", description: "Reels, Stories & feed placements", defaults: { budget: 3000, cpc: 1.1 }, assets: AD },
    { type: "tiktok_ads", label: "TikTok Ads", icon: "Music2", brand: "tiktok", color: "#111111", segment: "b2c", description: "Short-form video & Spark Ads", defaults: { budget: 2500, cpc: 0.8 }, assets: VIDEO },
    { type: "linkedin_ads", label: "LinkedIn Ads", icon: "Briefcase", color: "#0a66c2", segment: "b2b", description: "Target by job title, seniority & company", defaults: { budget: 4000, cpc: 6 }, assets: AD },
    { type: "pinterest_ads", label: "Pinterest Ads", icon: "Pin", brand: "pinterest", color: "#bd081c", segment: "b2c", description: "Visual discovery & shopping pins", defaults: { budget: 1500, cpc: 0.9 }, assets: AD },
    { type: "snapchat_ads", label: "Snapchat Ads", icon: "Ghost", brand: "snapchat", color: "#e6d600", segment: "b2c", description: "Gen Z vertical video", defaults: { budget: 1500, cpc: 0.7 }, assets: VIDEO },
    { type: "x_ads", label: "X (Twitter) Ads", icon: "AtSign", brand: "x", color: "#000000", segment: "both", description: "Promoted posts & conversation targeting", defaults: { budget: 1500, cpc: 1.5 }, assets: AD },
    { type: "reddit_ads", label: "Reddit Ads", icon: "MessagesSquare", brand: "reddit", color: "#ff4500", segment: "both", description: "Community & interest targeting", defaults: { budget: 1500, cpc: 1.0 }, assets: AD },
    { type: "quora_ads", label: "Quora Ads", icon: "CircleHelp", brand: "quora", color: "#b92b27", segment: "b2b", description: "Question & topic targeting", defaults: { budget: 1000, cpc: 1.2 }, assets: SEARCH },
  ]),
  ...group("traffic", "Search, video & display", [
    { type: "google_search", label: "Google Search", icon: "Search", brand: "googleads", color: "#4285f4", segment: "both", description: "Search ads on high-intent keywords", defaults: { budget: 4000, cpc: 2.5 }, assets: SEARCH },
    { type: "google_pmax", label: "Performance Max", icon: "Sparkles", brand: "googleads", color: "#fbbc04", segment: "b2c", description: "Google cross-network automated campaigns", defaults: { budget: 3000, cpc: 1.4 }, assets: AD },
    { type: "google_shopping", label: "Google Shopping", icon: "ShoppingCart", brand: "google", color: "#34a853", segment: "b2c", description: "Product listing ads from your feed", defaults: { budget: 3000, cpc: 0.9 }, assets: ["ad_copy", "audience"] },
    { type: "google_display", label: "Google Display", icon: "LayoutGrid", brand: "googleads", color: "#0f9d58", segment: "both", description: "Banner ads across the GDN", defaults: { budget: 1500, cpc: 0.6 }, assets: AD },
    { type: "youtube_ads", label: "YouTube Ads", icon: "Play", brand: "youtube", color: "#ff0000", segment: "both", description: "In-stream, Shorts & discovery video", defaults: { budget: 3000, cpc: 0.9 }, assets: VIDEO },
    { type: "microsoft_ads", label: "Microsoft Ads", icon: "Monitor", color: "#00a4ef", segment: "both", description: "Bing search network (+ LinkedIn profile targeting)", defaults: { budget: 1000, cpc: 1.8 }, assets: SEARCH },
    { type: "amazon_ads", label: "Amazon Ads", icon: "ShoppingBag", color: "#ff9900", segment: "b2c", description: "Sponsored products & brands", defaults: { budget: 3000, cpc: 1.1 }, assets: ["ad_copy", "audience"] },
    { type: "apple_search_ads", label: "Apple Search Ads", icon: "Smartphone", brand: "apple", color: "#000000", segment: "b2c", description: "App Store search placements", defaults: { budget: 1500, cpc: 1.5 }, assets: SEARCH },
    { type: "programmatic", label: "Programmatic / DSP", icon: "Cpu", color: "#334155", segment: "both", description: "Open-web display via a DSP", defaults: { budget: 3000, cpc: 1.0 }, assets: AD },
    { type: "native_ads", label: "Native Ads", icon: "Newspaper", color: "#2563eb", segment: "b2c", description: "Taboola / Outbrain content recommendations", defaults: { budget: 2000, cpc: 0.5 }, assets: AD },
    { type: "ctv", label: "Connected TV", icon: "Tv", color: "#7c3aed", segment: "b2c", description: "Streaming TV ads", defaults: { budget: 5000, cpc: 3 }, assets: VIDEO },
    { type: "audio_ads", label: "Audio & Podcast Ads", icon: "Headphones", brand: "spotify", color: "#1db954", segment: "both", description: "Spotify, podcast host reads", defaults: { budget: 2000, cpc: 2 }, assets: ["video_script", "creative_brief"] },
    { type: "retargeting", label: "Retargeting", icon: "RefreshCw", color: "#8b5cf6", segment: "both", description: "Re-engage previous visitors across networks", defaults: { budget: 1000, cpc: 0.7 }, assets: AD },
    { type: "abm_ads", label: "ABM Platform", icon: "Crosshair", color: "#0f766e", segment: "b2b", description: "Account-based ads (6sense, Demandbase)", defaults: { budget: 4000, cpc: 8 }, assets: AD },
    { type: "review_site_ads", label: "Review Site Listings", icon: "Star", brand: "g2", color: "#ff492c", segment: "b2b", description: "G2 / Capterra sponsored listings", defaults: { budget: 2000, cpc: 5 }, assets: ["ad_copy", "landing_copy"] },
    { type: "sponsored_newsletter", label: "Newsletter Sponsorship", icon: "Rss", brand: "substack", color: "#ff6719", segment: "both", description: "Paid placement in niche newsletters", defaults: { budget: 1500, cpc: 2 }, assets: ["ad_copy"] },
  ]),
  ...group("traffic", "Organic & owned", [
    { type: "organic", label: "Organic / SEO", icon: "Leaf", brand: "google", color: "#16a34a", segment: "both", description: "Unpaid search traffic", defaults: { visitors: 2000 }, assets: ["seo_brief", "landing_copy"] },
    { type: "social_organic", label: "Organic Social", icon: "Share2", color: "#ec4899", segment: "both", description: "Posts on your own social profiles", defaults: { visitors: 800 }, assets: ["creative_brief", "video_script"] },
    { type: "youtube_organic", label: "YouTube Channel", icon: "Play", brand: "youtube", color: "#ff0000", segment: "both", description: "Your own video content", defaults: { visitors: 600 }, assets: ["video_script", "seo_brief"] },
    { type: "email_list", label: "Email List", icon: "Mail", color: "#f59e0b", segment: "both", description: "Existing subscribers / newsletter", defaults: { visitors: 1500 }, assets: ["email_sequence"] },
    { type: "sms_list", label: "SMS List", icon: "Smartphone", color: "#eab308", segment: "b2c", description: "Existing SMS subscribers", defaults: { visitors: 800 }, assets: ["sms_sequence"] },
    { type: "push_list", label: "Push Subscribers", icon: "BellRing", color: "#f97316", segment: "b2c", description: "Web / app push audience", defaults: { visitors: 600 } },
    { type: "community", label: "Community", icon: "UsersRound", brand: "discord", color: "#5865f2", segment: "both", description: "Discord, Slack, Facebook group, forum", defaults: { visitors: 400 } },
    { type: "direct", label: "Direct / Brand", icon: "MousePointerClick", color: "#475569", segment: "both", description: "Type-in & branded traffic", defaults: { visitors: 1000 } },
    { type: "pr", label: "PR & Media", icon: "Newspaper", color: "#64748b", segment: "both", description: "Press coverage & earned media", defaults: { visitors: 500 }, assets: ["creative_brief"] },
  ]),
  ...group("traffic", "Partners & referrals", [
    { type: "influencer", label: "Influencer / Creator", icon: "Star", color: "#ec4899", segment: "b2c", description: "Creator partnerships & UGC", defaults: { budget: 2000, cpc: 1.0 }, assets: ["creative_brief", "video_script"] },
    { type: "affiliate", label: "Affiliates", icon: "Handshake", color: "#0d9488", segment: "both", description: "Commission-based partners", defaults: { visitors: 800 }, assets: ["creative_brief", "email_sequence"] },
    { type: "referral", label: "Referral Program", icon: "Gift", color: "#db2777", segment: "both", description: "Customers refer customers", defaults: { visitors: 300 }, assets: ["offer", "email_sequence"] },
    { type: "partner", label: "Channel Partners", icon: "Network", color: "#0369a1", segment: "b2b", description: "Resellers, agencies, integrations marketplace", defaults: { visitors: 200 }, assets: ["creative_brief"] },
    { type: "marketplace", label: "Marketplace Listing", icon: "Store", color: "#f97316", segment: "both", description: "App stores, Amazon, Etsy, AWS Marketplace", defaults: { visitors: 500 } },
  ]),
  ...group("traffic", "Outbound & offline", [
    { type: "cold_email", label: "Cold Email", icon: "MailPlus", color: "#0284c7", segment: "b2b", description: "Outbound email to prospect lists", defaults: { visitors: 2000 }, assets: ["outreach_sequence"] },
    { type: "linkedin_outreach", label: "LinkedIn Outreach", icon: "UserSearch", color: "#0a66c2", segment: "b2b", description: "Connection requests & InMail", defaults: { visitors: 500 }, assets: ["outreach_sequence"] },
    { type: "cold_call", label: "Cold Calling", icon: "PhoneOutgoing", color: "#ea580c", segment: "b2b", description: "SDR dials", defaults: { visitors: 400 }, assets: ["outreach_sequence"] },
    { type: "events", label: "Events & Trade Shows", icon: "Ticket", color: "#9333ea", segment: "b2b", description: "Booths, conferences, meetups", defaults: { budget: 8000, cpc: 40 }, assets: ["creative_brief", "offer"] },
    { type: "direct_mail", label: "Direct Mail", icon: "Package", color: "#a16207", segment: "both", description: "Postcards, gifting (Sendoso)", defaults: { budget: 2000, cpc: 4 }, assets: ["creative_brief", "offer"] },
    { type: "offline_qr", label: "OOH / QR Codes", icon: "QrCode", color: "#1f2937", segment: "b2c", description: "Billboards, packaging, in-store", defaults: { budget: 3000, cpc: 5 }, assets: ["creative_brief"] },
    { type: "tv_radio", label: "TV & Radio", icon: "Radio", color: "#be123c", segment: "b2c", description: "Linear broadcast", defaults: { budget: 10000, cpc: 6 }, assets: ["video_script"] },
  ]),

  // ── Pages ───────────────────────────────────────────────────────
  ...group("page", "Acquisition pages", [
    { type: "landing_page", label: "Landing Page", icon: "LayoutTemplate", color: "#0ea5e9", segment: "both", description: "Primary campaign destination", benchmark: [5, 15], defaults: { conversionRate: 10 }, assets: PAGE },
    { type: "blog_post", label: "Blog / Content", icon: "FileText", color: "#64748b", segment: "both", description: "Article, guide or resource page", benchmark: [1, 5], defaults: { conversionRate: 3 }, assets: ["seo_brief", "landing_copy"] },
    { type: "optin_page", label: "Opt-in Page", icon: "UserPlus", color: "#06b6d4", segment: "both", role: "lead", description: "Lead capture / squeeze page", benchmark: [20, 40], defaults: { conversionRate: 30 }, assets: PAGE },
    { type: "lead_magnet", label: "Lead Magnet", icon: "FileDown", color: "#0891b2", segment: "both", role: "lead", description: "Gated ebook, template, calculator", benchmark: [15, 35], defaults: { conversionRate: 25 }, assets: PAGE },
    { type: "quiz", label: "Quiz / Survey", icon: "ListChecks", color: "#14b8a6", segment: "both", role: "lead", description: "Interactive qualifier", benchmark: [30, 60], defaults: { conversionRate: 45 }, assets: ["landing_copy"] },
    { type: "webinar", label: "Webinar / VSL", icon: "Video", color: "#a855f7", segment: "both", description: "Live or recorded presentation", benchmark: [8, 20], defaults: { conversionRate: 15 }, assets: ["video_script", "landing_copy"] },
    { type: "sales_page", label: "Sales Page", icon: "ScrollText", color: "#6366f1", segment: "b2c", description: "Long-form sales letter", benchmark: [2, 6], defaults: { conversionRate: 4 }, assets: PAGE },
    { type: "app_store", label: "App Store Page", icon: "Smartphone", brand: "appstore", color: "#0d96f6", segment: "b2c", description: "iOS / Google Play listing", benchmark: [20, 40], defaults: { conversionRate: 30 }, assets: ["landing_copy"] },
  ]),
  ...group("page", "B2B pages", [
    { type: "pricing_page", label: "Pricing Page", icon: "ReceiptText", color: "#4f46e5", segment: "b2b", description: "Plans & pricing", benchmark: [5, 15], defaults: { conversionRate: 10 }, assets: PAGE },
    { type: "demo_request", label: "Demo Request", icon: "Presentation", color: "#7c3aed", segment: "b2b", role: "lead", description: "Request-a-demo form", benchmark: [2, 8], defaults: { conversionRate: 5 }, assets: PAGE },
    { type: "trial_signup", label: "Free Trial Signup", icon: "Rocket", color: "#2563eb", segment: "b2b", role: "lead", description: "Self-serve trial / freemium", benchmark: [3, 12], defaults: { conversionRate: 7 }, assets: PAGE },
    { type: "case_study", label: "Case Study", icon: "Award", color: "#0e7490", segment: "b2b", description: "Customer proof page", benchmark: [2, 8], defaults: { conversionRate: 4 }, assets: ["landing_copy"] },
    { type: "comparison", label: "Comparison Page", icon: "Scale", color: "#475569", segment: "b2b", description: "Us vs. competitor", benchmark: [3, 10], defaults: { conversionRate: 6 }, assets: ["landing_copy", "seo_brief"] },
    { type: "booking", label: "Book a Call", icon: "Calendar", brand: "calendly", color: "#006bff", segment: "both", role: "lead", description: "Calendar booking page", benchmark: [20, 40], defaults: { conversionRate: 30 }, assets: ["landing_copy"] },
  ]),
  ...group("page", "E-commerce pages", [
    { type: "product_page", label: "Product Page", icon: "Package", color: "#0284c7", segment: "b2c", description: "Product detail page", benchmark: [5, 12], defaults: { conversionRate: 8 }, assets: PAGE },
    { type: "collection_page", label: "Collection Page", icon: "LayoutGrid", color: "#0369a1", segment: "b2c", description: "Category / product listing", benchmark: [20, 45], defaults: { conversionRate: 35 }, assets: ["landing_copy"] },
    { type: "cart", label: "Cart", icon: "ShoppingCart", color: "#15803d", segment: "b2c", description: "Cart / bag", benchmark: [40, 65], defaults: { conversionRate: 55 } },
    { type: "checkout", label: "Checkout", icon: "CreditCard", color: "#22c55e", segment: "both", role: "customer", description: "Order form — generates revenue", benchmark: [45, 70], defaults: { conversionRate: 60, price: 97 }, assets: PAGE },
    { type: "order_bump", label: "Order Bump", icon: "SquarePlus", color: "#65a30d", segment: "b2c", description: "Add-on checkbox at checkout", benchmark: [20, 40], defaults: { conversionRate: 30, price: 19 }, assets: ["offer"] },
    { type: "upsell", label: "Upsell", icon: "TrendingUp", color: "#84cc16", segment: "both", description: "One-click post-purchase offer", benchmark: [10, 30], defaults: { conversionRate: 20, price: 47 }, assets: PAGE },
    { type: "downsell", label: "Downsell", icon: "TrendingDown", color: "#ca8a04", segment: "b2c", description: "Cheaper alternative after a declined upsell", benchmark: [10, 25], defaults: { conversionRate: 15, price: 27 }, assets: PAGE },
    { type: "thank_you", label: "Thank You", icon: "PartyPopper", color: "#10b981", segment: "both", description: "Confirmation page", defaults: { conversionRate: 100 }, assets: ["landing_copy"] },
    { type: "onboarding", label: "Onboarding", icon: "Compass", color: "#0891b2", segment: "both", description: "Welcome / setup flow", benchmark: [40, 80], defaults: { conversionRate: 60 }, assets: ["landing_copy", "email_sequence"] },
    { type: "member_area", label: "Member Area", icon: "LockKeyhole", color: "#6d28d9", segment: "both", description: "Course, portal or app login", defaults: { conversionRate: 100 } },
  ]),

  // ── Actions & flow logic ───────────────────────────────────────
  ...group("action", "Nurture & messaging", [
    { type: "email_sequence", label: "Email Sequence", icon: "Mails", color: "#f59e0b", segment: "both", description: "Automated nurture emails", benchmark: [3, 12], defaults: { conversionRate: 8 }, assets: ["email_sequence"] },
    { type: "sms", label: "SMS Follow-up", icon: "MessageSquare", color: "#eab308", segment: "b2c", description: "Text message nurture", benchmark: [5, 15], defaults: { conversionRate: 10 }, assets: ["sms_sequence"] },
    { type: "whatsapp", label: "WhatsApp", icon: "MessageCircle", brand: "whatsapp", color: "#25d366", segment: "b2c", description: "WhatsApp Business messages", benchmark: [5, 20], defaults: { conversionRate: 12 }, assets: ["sms_sequence"] },
    { type: "push_notification", label: "Push Notification", icon: "Bell", color: "#f97316", segment: "b2c", description: "Web or app push", benchmark: [2, 8], defaults: { conversionRate: 4 } },
    { type: "chatbot", label: "Chatbot / Live Chat", icon: "Bot", color: "#0ea5e9", segment: "both", role: "lead", description: "Conversational qualification", benchmark: [5, 20], defaults: { conversionRate: 10 }, assets: ["chatbot_script"] },
    { type: "abandoned_cart", label: "Abandoned Cart", icon: "ShoppingBasket", color: "#d97706", segment: "b2c", description: "Cart recovery email/SMS flow", benchmark: [5, 15], defaults: { conversionRate: 10 }, assets: ["email_sequence", "sms_sequence"] },
    { type: "browse_abandon", label: "Browse Abandonment", icon: "Eye", color: "#b45309", segment: "b2c", description: "Viewed-product follow-up", benchmark: [2, 6], defaults: { conversionRate: 4 }, assets: ["email_sequence"] },
    { type: "post_purchase", label: "Post-Purchase Flow", icon: "PackageCheck", color: "#059669", segment: "b2c", description: "Shipping, education, cross-sell", benchmark: [5, 15], defaults: { conversionRate: 8 }, assets: ["email_sequence"] },
    { type: "review_request", label: "Review Request", icon: "MessageSquareHeart", brand: "trustpilot", color: "#00b67a", segment: "b2c", description: "Ask happy customers for reviews", benchmark: [5, 15], defaults: { conversionRate: 10 }, assets: ["email_sequence"] },
    { type: "winback", label: "Win-back", icon: "RotateCcw", color: "#9333ea", segment: "both", description: "Re-engage lapsed customers", benchmark: [2, 8], defaults: { conversionRate: 4 }, assets: ["email_sequence", "offer"] },
  ]),
  ...group("action", "Sales pipeline", [
    { type: "lead_form", label: "Lead Form", icon: "ClipboardList", color: "#0891b2", segment: "both", role: "lead", description: "Native/in-platform lead form submit", benchmark: [8, 20], defaults: { conversionRate: 12 }, assets: ["landing_copy"] },
    { type: "lead_scoring", label: "Lead Scoring", icon: "Gauge", color: "#0f766e", segment: "b2b", description: "Score by fit & intent", defaults: { conversionRate: 40 } },
    { type: "mql", label: "MQL", icon: "Filter", color: "#0d9488", segment: "b2b", description: "Marketing-qualified lead", benchmark: [20, 50], defaults: { conversionRate: 35 } },
    { type: "sdr_followup", label: "SDR Follow-up", icon: "Headset", color: "#c2410c", segment: "b2b", description: "Rep qualifies & books meeting", benchmark: [15, 40], defaults: { conversionRate: 25 }, assets: ["outreach_sequence"] },
    { type: "sales_call", label: "Sales Call / Demo", icon: "Phone", color: "#ea580c", segment: "both", description: "Rep-led discovery or demo", benchmark: [30, 60], defaults: { conversionRate: 45 }, assets: ["offer"] },
    { type: "proposal", label: "Proposal", icon: "FileSignature", color: "#9a3412", segment: "b2b", description: "Proposal / quote sent", benchmark: [30, 60], defaults: { conversionRate: 45 }, assets: ["offer"] },
    { type: "closed_won", label: "Closed Won", icon: "Trophy", color: "#16a34a", segment: "b2b", role: "customer", description: "Deal signed — generates revenue", benchmark: [20, 40], defaults: { conversionRate: 30, price: 12000 } },
    { type: "trial_activation", label: "Trial Activation", icon: "Activity", color: "#2563eb", segment: "b2b", description: "User reaches 'aha' moment", benchmark: [25, 60], defaults: { conversionRate: 40 }, assets: ["email_sequence"] },
    { type: "subscription", label: "Paid Subscription", icon: "Repeat", color: "#16a34a", segment: "both", role: "customer", description: "Converts to paid plan — generates revenue", benchmark: [10, 25], defaults: { conversionRate: 15, price: 600 }, assets: ["offer"] },
    { type: "expansion", label: "Expansion / Upgrade", icon: "ArrowUpRight", color: "#15803d", segment: "b2b", description: "Seat or plan upgrade", benchmark: [5, 20], defaults: { conversionRate: 10, price: 3000 }, assets: ["offer"] },
  ]),
  ...group("action", "Events & logic", [
    { type: "purchase", label: "Purchase", icon: "BadgeDollarSign", color: "#16a34a", segment: "both", role: "customer", description: "Conversion event — set price for revenue", defaults: { conversionRate: 100, price: 0 }, assets: TRACK },
    { type: "goal", label: "Goal / Conversion", icon: "Flag", color: "#dc2626", segment: "both", description: "Custom conversion event", defaults: { conversionRate: 100 }, assets: TRACK },
    { type: "ab_split", label: "A/B Split", icon: "Split", color: "#7c3aed", segment: "both", description: "Split traffic between variants (use edge weights)", defaults: { conversionRate: 100 } },
    { type: "condition", label: "If / Else Branch", icon: "GitBranch", color: "#475569", segment: "both", description: "Route by behavior or attribute", defaults: { conversionRate: 100 } },
    { type: "add_audience", label: "Add to Audience", icon: "Users", color: "#8b5cf6", segment: "both", description: "Push to a custom / lookalike audience", defaults: { conversionRate: 100 }, assets: ["audience"] },
    { type: "tag_segment", label: "Tag / Segment", icon: "Tag", color: "#64748b", segment: "both", description: "Apply a CRM tag or list", defaults: { conversionRate: 100 } },
    { type: "loyalty", label: "Loyalty Program", icon: "Crown", color: "#ca8a04", segment: "b2c", description: "Points, VIP tiers", benchmark: [10, 30], defaults: { conversionRate: 20 }, assets: ["offer"] },
    { type: "wait", label: "Wait / Delay", icon: "Clock", color: "#64748b", segment: "both", description: "Time delay in the flow", defaults: { conversionRate: 100 } },
  ]),

  // ── Integrations (tracking & tooling — not part of the traffic flow) ─
  ...group("integration", "Ad platforms", [
    { type: "google_ads_mgr", label: "Google Ads", icon: "Search", brand: "googleads", color: "#4285f4", segment: "both", description: "Pull spend, clicks & conversions" },
    { type: "meta_ads_mgr", label: "Meta Ads Manager", icon: "Megaphone", brand: "meta", color: "#0866ff", segment: "both", description: "Pull Facebook/Instagram results" },
    { type: "tiktok_ads_mgr", label: "TikTok Ads Manager", icon: "Music2", brand: "tiktok", color: "#111111", segment: "b2c", description: "Pull TikTok results" },
    { type: "linkedin_cm", label: "LinkedIn Campaign Mgr", icon: "Briefcase", color: "#0a66c2", segment: "b2b", description: "Pull LinkedIn results" },
  ]),
  ...group("integration", "Analytics & attribution", [
    { type: "ga4", label: "Google Analytics 4", icon: "BarChart3", brand: "googleanalytics", color: "#e37400", segment: "both", description: "Web analytics & attribution", assets: TRACK },
    { type: "gtm", label: "Google Tag Manager", icon: "Tags", brand: "googletagmanager", color: "#246fdb", segment: "both", description: "Tag deployment", assets: TRACK },
    { type: "meta_pixel", label: "Meta Pixel / CAPI", icon: "Radar", brand: "meta", color: "#0866ff", segment: "both", description: "Conversion tracking for Meta", assets: TRACK },
    { type: "tiktok_pixel", label: "TikTok Pixel", icon: "Radar", brand: "tiktok", color: "#111111", segment: "b2c", description: "Conversion tracking for TikTok", assets: TRACK },
    { type: "linkedin_insight", label: "LinkedIn Insight Tag", icon: "Radar", color: "#0a66c2", segment: "b2b", description: "Conversion tracking for LinkedIn", assets: TRACK },
    { type: "mixpanel", label: "Mixpanel", icon: "ChartLine", brand: "mixpanel", color: "#7856ff", segment: "both", description: "Product analytics", assets: TRACK },
    { type: "amplitude", label: "Amplitude", icon: "ChartSpline", color: "#1e61f0", segment: "both", description: "Product analytics", assets: TRACK },
    { type: "segment", label: "Segment", icon: "Workflow", color: "#52bd94", segment: "both", description: "Customer data platform", assets: TRACK },
    { type: "hotjar", label: "Hotjar", icon: "Flame", brand: "hotjar", color: "#ff3c00", segment: "both", description: "Heatmaps & recordings" },
    { type: "attribution", label: "Attribution Tool", icon: "ChartPie", color: "#0f172a", segment: "b2c", description: "Triple Whale, Northbeam, Hyros" },
    { type: "looker", label: "Looker Studio", icon: "LayoutDashboard", brand: "looker", color: "#4285f4", segment: "both", description: "Reporting dashboards" },
    { type: "bigquery", label: "BigQuery", icon: "Database", brand: "googlebigquery", color: "#669df6", segment: "both", description: "Data warehouse" },
  ]),
  ...group("integration", "CRM & sales tools", [
    { type: "hubspot", label: "HubSpot", icon: "Database", brand: "hubspot", color: "#ff7a59", segment: "both", description: "CRM & marketing automation" },
    { type: "salesforce", label: "Salesforce", icon: "Cloud", color: "#00a1e0", segment: "b2b", description: "CRM" },
    { type: "pipedrive", label: "Pipedrive", icon: "Target", color: "#1a1a1a", segment: "b2b", description: "Sales pipeline CRM" },
    { type: "marketo", label: "Marketo / Pardot", icon: "Cog", color: "#5c4c9f", segment: "b2b", description: "Enterprise marketing automation" },
    { type: "apollo", label: "Apollo / ZoomInfo", icon: "Building2", color: "#5b4bd5", segment: "b2b", description: "Prospect data & enrichment" },
    { type: "outreach_tool", label: "Outreach / Salesloft", icon: "Send", color: "#5951ff", segment: "b2b", description: "Sales engagement sequences" },
    { type: "gong", label: "Gong", icon: "Mic", color: "#8039df", segment: "b2b", description: "Call recording & revenue intelligence" },
    { type: "calendly", label: "Calendly", icon: "CalendarCheck", brand: "calendly", color: "#006bff", segment: "both", description: "Meeting scheduling" },
    { type: "zoom", label: "Zoom", icon: "Video", brand: "zoom", color: "#0b5cff", segment: "both", description: "Webinars & meetings" },
  ]),
  ...group("integration", "Email & SMS", [
    { type: "klaviyo", label: "Klaviyo", icon: "Send", color: "#232426", segment: "b2c", description: "E-commerce email & SMS", assets: ["email_sequence"] },
    { type: "mailchimp", label: "Mailchimp", icon: "Mail", brand: "mailchimp", color: "#ffe01b", segment: "both", description: "Email marketing", assets: ["email_sequence"] },
    { type: "activecampaign", label: "ActiveCampaign", icon: "MailCheck", color: "#004cff", segment: "both", description: "Email automation & CRM", assets: ["email_sequence"] },
    { type: "brevo", label: "Brevo", icon: "Mail", brand: "brevo", color: "#0b996e", segment: "both", description: "Email, SMS & WhatsApp", assets: ["email_sequence"] },
    { type: "attentive", label: "Attentive / Postscript", icon: "MessageSquareText", color: "#1a1a1a", segment: "b2c", description: "SMS marketing", assets: ["sms_sequence"] },
    { type: "twilio", label: "Twilio", icon: "PhoneCall", color: "#f22f46", segment: "both", description: "SMS & voice API" },
  ]),
  ...group("integration", "Commerce & payments", [
    { type: "shopify", label: "Shopify", icon: "Store", brand: "shopify", color: "#7ab55c", segment: "b2c", description: "E-commerce store" },
    { type: "woocommerce", label: "WooCommerce", icon: "Store", brand: "woocommerce", color: "#96588a", segment: "b2c", description: "WordPress e-commerce" },
    { type: "bigcommerce", label: "BigCommerce", icon: "Store", brand: "bigcommerce", color: "#121118", segment: "b2c", description: "E-commerce platform" },
    { type: "stripe", label: "Stripe", icon: "Wallet", brand: "stripe", color: "#635bff", segment: "both", description: "Payments & subscriptions" },
    { type: "paypal", label: "PayPal", icon: "Wallet", brand: "paypal", color: "#003087", segment: "b2c", description: "Payments" },
    { type: "subscriptions", label: "Chargebee / Recharge", icon: "Repeat", color: "#ff3300", segment: "both", description: "Subscription billing" },
  ]),
  ...group("integration", "Support & reviews", [
    { type: "intercom", label: "Intercom", icon: "MessagesSquare", brand: "intercom", color: "#1f8ded", segment: "both", description: "Live chat & support", assets: ["chatbot_script"] },
    { type: "zendesk", label: "Zendesk", icon: "LifeBuoy", brand: "zendesk", color: "#03363d", segment: "both", description: "Customer support" },
    { type: "trustpilot", label: "Trustpilot", icon: "Star", brand: "trustpilot", color: "#00b67a", segment: "b2c", description: "Customer reviews" },
    { type: "g2", label: "G2", icon: "Star", brand: "g2", color: "#ff492c", segment: "b2b", description: "B2B software reviews & intent data" },
  ]),
  ...group("integration", "Sites & forms", [
    { type: "webflow", label: "Webflow", icon: "Globe", brand: "webflow", color: "#146ef5", segment: "both", description: "Website builder" },
    { type: "wordpress", label: "WordPress", icon: "Globe", brand: "wordpress", color: "#21759b", segment: "both", description: "CMS" },
    { type: "wix", label: "Wix / Squarespace", icon: "Globe", brand: "wix", color: "#0c6efc", segment: "b2c", description: "Website builder" },
    { type: "page_builder", label: "Unbounce / ClickFunnels", icon: "LayoutTemplate", color: "#0033ff", segment: "both", description: "Landing page & funnel builders" },
    { type: "typeform", label: "Typeform", icon: "FormInput", brand: "typeform", color: "#262627", segment: "both", description: "Forms & quizzes" },
  ]),
  ...group("integration", "Automation & data", [
    { type: "zapier", label: "Zapier", icon: "Zap", brand: "zapier", color: "#ff4f00", segment: "both", description: "Workflow automation" },
    { type: "make", label: "Make", icon: "Workflow", brand: "make", color: "#6d00cc", segment: "both", description: "Visual automation" },
    { type: "slack", label: "Slack", icon: "Hash", color: "#4a154b", segment: "both", description: "Alerts & notifications" },
    { type: "google_sheets", label: "Google Sheets", icon: "Sheet", brand: "googlesheets", color: "#34a853", segment: "both", description: "Spreadsheet reporting" },
    { type: "airtable", label: "Airtable", icon: "Table", brand: "airtable", color: "#18bfff", segment: "both", description: "Database & content calendar" },
    { type: "notion", label: "Notion", icon: "NotebookPen", brand: "notion", color: "#000000", segment: "both", description: "Briefs & docs" },
    { type: "webhook", label: "Webhook", icon: "Webhook", color: "#475569", segment: "both", description: "Custom HTTP endpoint" },
  ]),

  // ── Whiteboard ──────────────────────────────────────────────────
  ...group("note", "Whiteboard", [
    { type: "sticky", label: "Sticky Note", icon: "StickyNote", color: "#fde68a", segment: "both", description: "Freeform note for brainstorming" },
  ]),
];

export const CATALOG_BY_TYPE: Record<string, CatalogItem> = Object.fromEntries(CATALOG.map((c) => [c.type, c]));

export const FLOW_TYPES = CATALOG.filter((c) => c.kind !== "note").map((c) => c.type);
