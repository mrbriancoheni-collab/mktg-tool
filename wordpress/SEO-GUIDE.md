# Search, AI-answer and generative-engine guide

This guide covers SEO, AEO (answer engines such as Google AI Overviews and featured snippets) and GEO (generative engines such as ChatGPT, Claude, Perplexity, Gemini and Copilot) for the marketing site.

The theme handles the technical side automatically. What decides whether pages get found and quoted is the content, so most of this guide is a writing checklist.

## What the theme does for you

| Area | What happens | Where |
|---|---|---|
| **Titles and descriptions** | `<title>` comes from the page title, overridable per page. The meta description comes from the page's own field, then the excerpt, then the opening text, trimmed to 160 characters. | Editor sidebar → **Search & AI** panel |
| **Canonical URLs** | Core WordPress sets them on posts and pages; the theme adds them on the blog index, archives and paginated pages. | automatic |
| **Robots** | `noindex, follow` on search results, 404s, date archives, attachments and any page you hide. `max-snippet:-1` and `max-image-preview:large` everywhere else, so engines can quote long passages. | automatic, plus the per-page toggle |
| **Sitemap** | Core's `/wp-sitemap.xml`. Hidden pages are left out. | automatic |
| **Structured data** | One linked JSON-LD graph: Organization (logo, `sameAs` social profiles), WebSite, WebPage (or AboutPage / ContactPage / CollectionPage), BreadcrumbList, BlogPosting with author Person, date published/modified, word count, reading time and speakable, and SoftwareApplication with all three plan offers on the front and pricing pages. | automatic |
| **FAQ markup** | Every Details block whose summary ends in “?” is added as a `FAQPage` question. This works on any page, including the FAQ pattern. | automatic |
| **Social cards** | Open Graph and X/Twitter tags with image size and alt text, article times, section and tags, and reading time. | automatic |
| **AI crawlers** | Search and answer bots are always allowed. You can choose to block training-only crawlers. | Settings → Reading → **AI crawlers** |
| **llms.txt** | `/llms.txt` is a plain-text map of the site, with current prices. `/llms-full.txt` holds the full text of every page and the latest 30 posts. | automatic; needs Post-name permalinks |
| **IndexNow** | New and updated posts and pages are pushed to Bing, Yandex, Seznam and Naver within seconds. Bing also feeds Copilot and ChatGPT search. | Settings → Reading → **IndexNow** |
| **Navigation for readers and bots** | Breadcrumbs, an “On this page” table of contents (for posts with 3+ sections), anchor links on every H2/H3, related posts from the same category, and an author box. | single post template |
| **Speed (Core Web Vitals)** | Local variable font with preload, preloaded hero image with high priority, width/height on all theme images (no layout shift), async decoding, no emoji script, no jQuery. | automatic |

**If you install an SEO plugin** (Yoast, Rank Math, SEOPress, AIOSEO, The SEO Framework or Slim SEO), the theme's title, meta, canonical, robots, sitemap and core schema switch off so they don't duplicate the plugin's.

These keep running, because plugins don't produce them:
- FAQ markup
- SoftwareApplication offers
- llms.txt
- breadcrumbs and table of contents blocks
- AI-crawler rules
- IndexNow (skipped if Rank Math is active, since it has its own)

## One-time setup

1. **Settings → Permalinks → Post name.** This is required for clean URLs and for `llms.txt`.
2. **Settings → General:**
   - Site title "AdCanvas".
   - Tagline written as the one-line answer to "what is AdCanvas?", for example "The AI canvas for planning, launching and analyzing ad campaigns". It is used in titles, schema and llms.txt.
3. **Settings → General → Site Icon:** upload a 512×512 icon. It becomes the Organization logo.
4. **Settings → Reading:**
   - Make sure *Discourage search engines* is **off**.
   - Add your social profile URLs (LinkedIn, X, YouTube, G2, Product Hunt, Crunchbase). `sameAs` links are how search and AI engines tie mentions of AdCanvas to you.
5. **Users → Profile** for every author: add a real bio with credentials, a website or LinkedIn URL, and a Gravatar. These feed the author box and the `Person` schema, which are E-E-A-T signals.
6. **Google Search Console** and **Bing Webmaster Tools:** verify the domain, submit `https://yourdomain.com/wp-sitemap.xml`, and check *Enhancements* for schema errors. Bing Webmaster Tools also shows AI and Copilot citations.
7. **Validate** a post and the pricing page at https://search.google.com/test/rich-results and https://validator.schema.org.

## Writing checklist (every post)

**Pick the question first.** Each post answers one question people actually ask. Use Search Console queries, "People also ask", sales-call notes and support tickets to find them.

- [ ] **Title** under 60 characters, containing the question or the main phrase. Write it for people first.
- [ ] **Meta description** under 155 characters that answers the question. Set it in **Search & AI**, or write a good excerpt.
- [ ] **First paragraph answers the title directly in 40–60 words.** Answer engines quote the first clear answer they find.
- [ ] **Key takeaways** block (pattern: *Key takeaways*) right after the intro: 3–5 bullets, each true on its own.
- [ ] **H2s phrased as the questions readers ask** ("How do you calculate budget pacing?"). The first sentence under each H2 answers it, and detail follows.
- [ ] **Specifics over adjectives:** numbers, formulas, worked examples, tables and steps. Generative engines prefer content with concrete, checkable facts and cite it more often.
- [ ] **Original material** that only you have: anonymized benchmarks from AdCanvas usage, screenshots, templates, your own tests. This is what earns citations and links.
- [ ] **Sources:** link to the primary source (platform documentation, studies) for any fact you didn't create. Never invent statistics, quotes or reviews.
- [ ] **FAQ** at the end (pattern: *Post FAQ*): 3–5 real follow-up questions, each answered in 40–60 words and ending in “?”.
- [ ] **Internal links:** 2–4 links to related posts and one to the relevant product page (`/features/`, `/pricing/`, `/templates/`), with descriptive anchor text, never "click here".
- [ ] **Images:** a featured image (1200×675 or larger) and descriptive alt text on every image. Use WebP or AVIF.
- [ ] **One category, 2–5 tags.** Categories drive breadcrumbs and related posts.
- [ ] **Keep it fresh:** review high-traffic posts every 6–12 months and update facts, prices and screenshots. The "Updated" date and `dateModified` change automatically when you save.

## Content that helps across the whole site

- **Comparison and alternatives pages** (pattern: *Comparison table*): "AdCanvas vs spreadsheets", "Best tools for funnel planning". Keep every claim accurate and sourced.
- **Use-case and industry pages** for each funnel template (e-commerce, SaaS trial, B2B demo, local services…). Use the *Landing page* template.
- **Glossary** of terms such as ROAS, CPA, budget pacing and attribution. Short, definitive answers are exactly what answer engines quote.
- **Free tools** that link back to the app: ROAS or break-even calculators, ad-copy character counters.
- **Off-site mentions** matter as much as on-site work for GEO: reviews on G2 and Capterra, Product Hunt, partner directories (Google, Meta, HubSpot marketplaces), podcasts and guest posts. AI answers lean on what other sites say about you.

## Measuring it

- **Search Console:** queries, CTR, and rich-result and schema reports.
- **Bing Webmaster Tools:** clicks and AI citations from Copilot.
- **Analytics:** referrals from `chatgpt.com`, `perplexity.ai`, `claude.ai`, `gemini.google.com` and `copilot.microsoft.com`. Add a "How did you hear about us?" field to sign-up to catch AI-assisted visits that arrive without a referrer.
- **Quarterly:** ask the main AI assistants the questions your buyers ask (for example "best tool to plan a paid ads funnel") and record whether and how AdCanvas is mentioned.
