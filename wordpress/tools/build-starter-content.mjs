// Builds wordpress/adcanvas-starter-content.xml, a WordPress import (WXR) file with
// the marketing pages, the legal pages (from legal/*.md) and three starter blog posts.
//
//   node wordpress/tools/build-starter-content.mjs
//
// Import it in WordPress under Tools → Import → WordPress. Re-run after editing legal/*.md.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const out = path.join(root, "wordpress/adcanvas-starter-content.xml");

/* ── Markdown → block markup ───────────────────────────────────────────── */
const inline = (s) => marked.parseInline(s).trim();
const attrs = (o) => (o && Object.keys(o).length ? " " + JSON.stringify(o) : "");
const block = (name, a, html) => `<!-- wp:${name}${attrs(a)} -->\n${html}\n<!-- /wp:${name} -->`;

function listBlock(tok) {
  const tag = tok.ordered ? "ol" : "ul";
  const items = tok.items.map((it) => {
    const nested = it.tokens.filter((t) => t.type === "list").map(listBlock).join("\n\n");
    const text = it.tokens.filter((t) => t.type !== "list").map((t) => inline(t.text ?? t.raw)).join(" ");
    return block("list-item", null, `<li>${text}${nested ? "\n" + nested : ""}</li>`);
  });
  return block("list", tok.ordered ? { ordered: true } : null, `<${tag} class="wp-block-list">${items.join("\n\n")}</${tag}>`);
}

function toBlocks(md, { dropTitle = true } = {}) {
  const tokens = marked.lexer(md);
  const outBlocks = [];
  let title = null;
  for (const t of tokens) {
    switch (t.type) {
      case "heading":
        if (t.depth === 1 && dropTitle && title === null) { title = t.text; break; }
        outBlocks.push(block("heading", t.depth === 2 ? null : { level: t.depth }, `<h${t.depth} class="wp-block-heading">${inline(t.text)}</h${t.depth}>`));
        break;
      case "paragraph":
        outBlocks.push(block("paragraph", null, `<p>${inline(t.text)}</p>`));
        break;
      case "list":
        outBlocks.push(listBlock(t));
        break;
      case "blockquote": {
        const inner = toBlocks(t.text, { dropTitle: false }).html;
        outBlocks.push(block("quote", null, `<blockquote class="wp-block-quote">${inner}</blockquote>`));
        break;
      }
      case "table": {
        const head = `<thead><tr>${t.header.map((c) => `<th>${inline(c.text)}</th>`).join("")}</tr></thead>`;
        const body = `<tbody>${t.rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c.text)}</td>`).join("")}</tr>`).join("")}</tbody>`;
        outBlocks.push(block("table", null, `<figure class="wp-block-table"><table class="has-fixed-layout">${head}${body}</table></figure>`));
        break;
      }
      case "code":
        outBlocks.push(block("code", null, `<pre class="wp-block-code"><code>${t.text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</code></pre>`));
        break;
      case "hr":
        outBlocks.push(block("separator", null, `<hr class="wp-block-separator has-alpha-channel-opacity"/>`));
        break;
      case "space":
        break;
      default:
        if (t.raw.trim()) outBlocks.push(block("paragraph", null, `<p>${inline(t.raw)}</p>`));
    }
  }
  return { title, html: outBlocks.join("\n\n") };
}

/* ── Page building helpers ─────────────────────────────────────────────── */
const pattern = (slug) => `<!-- wp:pattern {"slug":"adcanvas/${slug}"} /-->`;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pageHeader = (eyebrow, title, intro) => `<!-- wp:group {"tagName":"section","align":"full","className":"adcanvas-hero","style":{"spacing":{"padding":{"top":"var:preset|spacing|60","bottom":"var:preset|spacing|40"},"blockGap":"var:preset|spacing|30"}},"layout":{"type":"constrained","contentSize":"760px"}} -->
<section class="wp-block-group alignfull adcanvas-hero" style="padding-top:var(--wp--preset--spacing--60);padding-bottom:var(--wp--preset--spacing--40)"><!-- wp:paragraph {"align":"center","className":"is-style-eyebrow"} -->
<p class="has-text-align-center is-style-eyebrow">${esc(eyebrow)}</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"textAlign":"center","level":1,"fontSize":"xx-large"} -->
<h1 class="wp-block-heading has-text-align-center has-xx-large-font-size">${esc(title)}</h1>
<!-- /wp:heading -->

<!-- wp:paragraph {"align":"center","textColor":"muted","fontSize":"large"} -->
<p class="has-text-align-center has-muted-color has-text-color has-large-font-size">${esc(intro)}</p>
<!-- /wp:paragraph --></section>
<!-- /wp:group -->`;

/* ── Content ───────────────────────────────────────────────────────────── */
const LEGAL = [
  ["privacy", "Privacy Policy"],
  ["terms", "Terms of Service"],
  ["acceptable-use", "Acceptable Use Policy"],
  ["dpa", "Data Processing Agreement"],
  ["subprocessors", "Subprocessors"],
  ["cookies", "Cookie Policy"],
  ["data-deletion", "Data Deletion"],
];

const items = [];
let id = 100;
const add = (o) => { const item = { id: ++id, parent: 0, order: 0, template: "", type: "page", ...o }; items.push(item); return item; };

add({ slug: "home", title: "Home", content: "<!-- wp:paragraph -->\n<p>This page is the front page. Its layout lives in the theme’s Front Page template — edit it under Appearance → Editor → Templates → Front Page.</p>\n<!-- /wp:paragraph -->", order: 1 });
add({ slug: "features", title: "Features", template: "page-landing", order: 2, excerpt: "Plan, create, measure and improve ad campaigns on one AI canvas.",
  content: [pageHeader("Features", "Everything your campaigns need, on one canvas", "Plan the funnel, forecast results, write the ads, connect live data and find the next thing to fix — without switching tools."), pattern("features-grid"), pattern("showcase"), pattern("how-it-works"), pattern("use-cases"), pattern("cta")].join("\n\n") });
add({ slug: "pricing", title: "Pricing", template: "page-landing", order: 3, excerpt: "Start free. Pro is $49 and Team is $149 per workspace per month.",
  content: [pattern("pricing"), pattern("faq"), pattern("cta")].join("\n\n") });
add({ slug: "templates", title: "Funnel templates", template: "page-landing", order: 4, excerpt: "Ten proven B2B and B2C funnel templates with budgets and benchmarks.",
  content: [pageHeader("Templates", "Start from a proven funnel", "Ten B2B and B2C templates with channels, budgets and conversion benchmarks filled in. Open one, adjust it to your numbers and let AI do the rest."), pattern("templates-gallery"), pattern("cta")].join("\n\n") });
add({ slug: "blog", title: "Blog", order: 5, content: "" });
add({ slug: "about", title: "About", order: 6, content: toBlocks(`
[REPLACE: Your company story — who you are, why you built AdCanvas and who it's for.]

## What we believe

- **Plans should be visible.** A campaign is a set of connected steps, not a spreadsheet tab per channel.
- **AI should show its work.** Every change the assistant proposes is previewed and reversible.
- **Numbers beat opinions.** Forecasts are replaced by live data as soon as you connect your accounts.

## Contact

Questions, partnerships or press: [CONTACT EMAIL].
`, { dropTitle: false }).html });
add({ slug: "contact", title: "Contact", order: 7, content: toBlocks(`
We usually reply within one business day.

- **Sales and plans:** [SALES EMAIL]
- **Support:** [SUPPORT EMAIL] — or use the help menu inside the app.
- **Privacy and data requests:** [PRIVACY EMAIL]
- **Security reports:** [SECURITY EMAIL] — see our [Security](/security/) page.

[REPLACE: Add a contact form block from your forms plugin here if you use one.]
`, { dropTitle: false }).html });
add({ slug: "security", title: "Security", order: 8, excerpt: "How AdCanvas protects your account and your connected ad platforms.", content: toBlocks(`
AdCanvas connects to the accounts that run your business, so we treat security as part of the product.

## Your account

- Two-step verification with an authenticator app, plus recovery codes.
- Sign in with Google.
- Sessions are stored as hashed tokens and can be signed out from Settings.
- Roles (owner, admin, member, viewer) and an audit log of sensitive actions.

## Your data

- Credentials for connected platforms are encrypted at rest with AES-256-GCM.
- All traffic is served over HTTPS with strict security headers.
- Protection against cross-site request forgery and server-side request forgery.
- Rate limits on sign-in and AI requests.
- Export or delete your workspace data at any time — see [Data deletion](/legal/data-deletion/).

## Connected ad platforms

AdCanvas only creates **paused drafts** in Google Ads and Meta. Nothing spends money until someone on your team enables it in the ad platform. Disconnecting an integration deletes its stored credentials.

## Reporting a vulnerability

Email [SECURITY EMAIL]. We acknowledge reports within [X] business days and don't take legal action against good-faith research.
`, { dropTitle: false }).html });

const legalParent = add({ slug: "legal", title: "Legal", template: "page-legal", order: 9, content: block("list", null, `<ul class="wp-block-list">${LEGAL.map(([s, t]) => block("list-item", null, `<li><a href="/legal/${s}/">${t}</a></li>`)).join("\n\n")}</ul>`) });
LEGAL.forEach(([slug, fallback], i) => {
  const { title, html } = toBlocks(fs.readFileSync(path.join(root, "legal", `${slug}.md`), "utf8"));
  // Internal links in the markdown use /legal/x; WordPress serves the same paths with a trailing slash.
  add({ slug, title: title || fallback, template: "page-legal", parent: legalParent.id, order: i + 1, content: html });
});

const POSTS = [
  { slug: "map-a-full-funnel-ad-campaign", title: "How to map a full-funnel ad campaign before you spend a dollar", cat: "Planning", date: "2026-10-12 09:00:00",
    excerpt: "Traffic sources, landing pages, follow-ups and the numbers that connect them — a practical walkthrough.",
    md: `
Most campaigns fail quietly. Not because the ads were bad, but because nobody wrote down how a click was supposed to become a customer. Mapping the funnel first fixes that.

## 1. Start from the outcome

Write down the one number that matters — purchases, demos booked, trials started — and what it's worth to you. Everything on the map should lead there.

## 2. Add the traffic sources

List every channel that will send people in: paid social, search, display, email, partners. For each one, note the budget and the expected cost per click. This is where most of your spend sits, so be honest about the numbers.

## 3. Draw the path

Connect each source to where it lands — a product page, a landing page, a lead form — and on to the next step. Ask at every step: *what happens to the people who don't convert here?* That's where retargeting and follow-up emails belong.

## 4. Put a conversion rate on every arrow

You won't know the real numbers yet. Use benchmarks, then multiply through: 10,000 visitors × 3% to lead × 20% to customer = 60 customers. If the result doesn't pay for the budget, you've learned that for free.

## 5. Replace guesses with data

Once the campaign is live, connect your ad and analytics accounts so real numbers replace the forecast, step by step. The weakest step is usually obvious within a week.

> **Tip:** In AdCanvas, AI Build does steps 2–4 from a one-paragraph brief, and the forecast updates as you change anything on the canvas.
` },
  { slug: "ad-copy-that-fits-every-platform", title: "Writing ad copy that fits every platform’s limits", cat: "Creative", date: "2026-10-19 09:00:00",
    excerpt: "Headlines, descriptions and primary text for Google, Meta, LinkedIn and TikTok — with the limits that matter.",
    md: `
Every platform truncates differently. Copy that reads well on Meta gets cut mid-word on Google. Here are the limits worth memorizing, and how to write within them.

## The limits that matter

| Platform | Field | Limit |
|---|---|---|
| Google responsive search ads | Headline | 30 characters (up to 15) |
| Google responsive search ads | Description | 90 characters (up to 4) |
| Meta | Primary text | ~125 characters before "See more" |
| Meta | Headline | ~40 characters before truncation |
| LinkedIn | Intro text | ~150 characters before "See more" |
| TikTok | Ad text | 100 characters |

Limits change; check each platform's current specs before you launch.

## Write the long version first

Start with the full message — who it's for, the outcome, and the proof. Then cut it down for each placement. It's much easier to shorten a clear idea than to stretch a slogan.

## Make every headline stand alone

Google mixes headlines in any order, so each one has to make sense by itself. Give each a different job: the benefit, the offer, the proof, the call to action.

## Match the step in the funnel

Cold audiences need the problem and the promise. Retargeting audiences already know you — give them the proof and a reason to act now.

> **Tip:** AdCanvas writes ad packs for each step and flags anything over a platform's limit before you export or publish it as a paused draft.
` },
  { slug: "budget-pacing-catch-overspend", title: "Budget pacing: catch overspend before month end", cat: "Measurement", date: "2026-10-26 09:00:00",
    excerpt: "A simple daily check that keeps campaigns on plan, and what to do when they drift.",
    md: `
A monthly budget that's spent by the 20th isn't a budget. Pacing tells you early whether you're on track, so you can adjust while it still matters.

## The basic check

Divide spend to date by the share of the month that has passed. If you've spent $6,000 of a $10,000 budget on day 15 of 30, you're pacing at 120% — on track to spend $12,000.

## Why it drifts

- **Auction changes.** Competitors raise bids, especially near holidays.
- **Learning phases.** New campaigns often spend unevenly in the first days.
- **Broad targeting.** Automated campaigns expand to find volume.

## What to do about it

1. Check pacing by channel, not just in total — one channel usually explains the gap.
2. Look at cost per result alongside spend. Overspending at a good CPA can be an opportunity, not a problem.
3. Adjust daily budgets in small steps (10–20%) to avoid resetting learning.

## Automate the alert

Nobody remembers to check every day. Set an alert for when pacing passes a threshold, say 110%, and review then.

> **Tip:** The AdCanvas dashboard shows budget pacing against your plan, and scheduled alerts can post to Slack when a channel drifts.
` },
];
for (const p of POSTS) add({ type: "post", slug: p.slug, title: p.title, content: toBlocks(p.md, { dropTitle: false }).html, excerpt: p.excerpt, cat: p.cat, date: p.date });

/* ── WXR ───────────────────────────────────────────────────────────────── */
const cdata = (s) => `<![CDATA[${String(s).replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
const cats = [...new Set(POSTS.map((p) => p.cat))];
const catSlug = (c) => c.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const now = "2026-11-01 09:00:00";
const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<!-- AdCanvas starter content. Generated by wordpress/tools/build-starter-content.mjs — do not edit by hand. -->
<rss version="2.0" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:wfw="http://wellformedweb.org/CommentAPI/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel>
  <title>AdCanvas</title>
  <link>https://example.com</link>
  <description>The AI canvas for ad campaigns</description>
  <language>en-US</language>
  <wp:wxr_version>1.2</wp:wxr_version>
  <wp:base_site_url>https://example.com</wp:base_site_url>
  <wp:base_blog_url>https://example.com</wp:base_blog_url>
  <wp:author><wp:author_id>1</wp:author_id><wp:author_login>${cdata("admin")}</wp:author_login><wp:author_email>${cdata("admin@example.com")}</wp:author_email><wp:author_display_name>${cdata("AdCanvas Team")}</wp:author_display_name><wp:author_first_name>${cdata("")}</wp:author_first_name><wp:author_last_name>${cdata("")}</wp:author_last_name></wp:author>
${cats.map((c, i) => `  <wp:category><wp:term_id>${i + 2}</wp:term_id><wp:category_nicename>${cdata(catSlug(c))}</wp:category_nicename><wp:category_parent>${cdata("")}</wp:category_parent><wp:cat_name>${cdata(c)}</wp:cat_name></wp:category>`).join("\n")}
${items.map((it) => `  <item>
    <title>${cdata(it.title)}</title>
    <link>https://example.com/${it.slug}/</link>
    <dc:creator>${cdata("admin")}</dc:creator>
    <guid isPermaLink="false">https://example.com/?${it.type === "post" ? "p" : "page_id"}=${it.id}</guid>
    <description></description>
    <content:encoded>${cdata(it.content)}</content:encoded>
    <excerpt:encoded>${cdata(it.excerpt || "")}</excerpt:encoded>
    <wp:post_id>${it.id}</wp:post_id>
    <wp:post_date>${cdata(it.date || now)}</wp:post_date>
    <wp:post_date_gmt>${cdata(it.date || now)}</wp:post_date_gmt>
    <wp:comment_status>${cdata(it.type === "post" ? "open" : "closed")}</wp:comment_status>
    <wp:ping_status>${cdata("closed")}</wp:ping_status>
    <wp:post_name>${cdata(it.slug)}</wp:post_name>
    <wp:status>${cdata("publish")}</wp:status>
    <wp:post_parent>${it.parent}</wp:post_parent>
    <wp:menu_order>${it.order}</wp:menu_order>
    <wp:post_type>${cdata(it.type)}</wp:post_type>
    <wp:post_password>${cdata("")}</wp:post_password>
    <wp:is_sticky>0</wp:is_sticky>${it.cat ? `
    <category domain="category" nicename="${catSlug(it.cat)}">${cdata(it.cat)}</category>` : ""}${it.template ? `
    <wp:postmeta><wp:meta_key>${cdata("_wp_page_template")}</wp:meta_key><wp:meta_value>${cdata(it.template)}</wp:meta_value></wp:postmeta>` : ""}
  </item>`).join("\n")}
</channel>
</rss>
`;
fs.writeFileSync(out, xml);
console.log(`Wrote ${path.relative(root, out)}: ${items.filter((i) => i.type === "page").length} pages, ${POSTS.length} posts.`);
