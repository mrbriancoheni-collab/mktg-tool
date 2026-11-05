import { BarChart3, Check, MessageSquare, Plug, Sparkles, Workflow } from "lucide-react";
import { CATALOG } from "../../shared/catalog";
import { PLANS, PUBLIC_PLANS } from "../../shared/plans";
import { ItemIcon } from "../lib/icons";

const LOGOS = ["meta_ads", "google_search", "tiktok_ads", "linkedin_ads", "youtube_ads", "pinterest_ads", "hubspot", "shopify", "stripe", "ga4", "klaviyo", "slack"];

const FEATURES = [
  { icon: Sparkles, title: "Brief → full funnel in seconds", text: "Describe the product, audience and budget. AI maps channels, pages, nurture, sales steps and tracking — with realistic CPCs and conversion rates." },
  { icon: Workflow, title: "A canvas built for campaigns", text: "150+ B2B and B2C building blocks with real brand icons. Drag, connect and branch flows, then watch the forecast update live." },
  { icon: BarChart3, title: "Forecast, then measure", text: "See spend, leads, customers, ROAS and CPA before you launch. Pull actuals from Google Ads, GA4 and Meta and spot leaks instantly." },
  { icon: Plug, title: "From plan to platform", text: "Generate platform-ready ads within character limits, then publish them as paused drafts or export for bulk upload." },
  { icon: MessageSquare, title: "Work together", text: "Edit boards together in real time, share view-and-comment links with clients, and get scheduled reports in Slack." },
];

export function Landing() {
  const logos = LOGOS.map((t) => CATALOG.find((c) => c.type === t)!).filter(Boolean);
  return (
    <div className="landing">
      <header className="landing-nav">
        <a className="brand" href="/">
          <span className="logo">◆</span> AdCanvas
        </a>
        <nav>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="/login">Sign in</a>
          <a className="btn primary" href="/signup">
            Start free
          </a>
        </nav>
      </header>

      <section className="hero">
        <h1>
          Plan, launch and analyze ad campaigns
          <br />
          <span>on one AI-powered canvas.</span>
        </h1>
        <p>Map your whole funnel visually, let AI build the strategy and write the ads, then connect your ad accounts to see what's actually working.</p>
        <div className="row center">
          <a className="btn primary lg" href="/signup">
            <Sparkles size={18} /> Start free — no card needed
          </a>
          <a className="btn lg" href="#features">
            See how it works
          </a>
        </div>
        <div className="logo-strip" aria-label="Works with">
          {logos.map((c) => (
            <ItemIcon key={c.type} item={c} size={34} />
          ))}
        </div>
      </section>

      <section id="features" className="features">
        {FEATURES.map((f) => (
          <div key={f.title} className="feature">
            <f.icon size={22} />
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </div>
        ))}
      </section>

      <section id="pricing" className="pricing">
        <h2>Simple pricing</h2>
        <p className="muted">Start free. Upgrade when you connect live ad accounts.</p>
        <div className="plans">
          {PUBLIC_PLANS.map((id) => {
            const p = PLANS[id];
            return (
              <div key={id} className={`plan-card ${id === "pro" ? "featured" : ""}`}>
                {id === "pro" && <span className="plan-badge">Most popular</span>}
                <h3>{p.name}</h3>
                <div className="price">
                  ${p.priceMonthly}
                  <span>/month</span>
                </div>
                <p className="muted">{p.blurb}</p>
                <ul>
                  {p.features.map((f) => (
                    <li key={f}>
                      <Check size={15} /> {f}
                    </li>
                  ))}
                </ul>
                <a className={`btn ${id === "pro" ? "primary" : ""} full`} href="/signup">
                  {id === "free" ? "Start free" : `Start with ${p.name}`}
                </a>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="landing-foot">
        <span>© {new Date().getFullYear()} [COMPANY LEGAL NAME]</span>
        <a href="/legal/privacy">Privacy</a>
        <a href="/legal/terms">Terms</a>
        <a href="/legal/acceptable-use">Acceptable use</a>
        <a href="/legal/dpa">DPA</a>
        <a href="/legal/subprocessors">Subprocessors</a>
        <a href="/legal/cookies">Cookies</a>
      </footer>
    </div>
  );
}
