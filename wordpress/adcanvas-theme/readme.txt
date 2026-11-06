=== AdCanvas ===
Contributors: adcanvas
Requires at least: 6.6
Tested up to: 7.1
Requires PHP: 8.1
Stable tag: 1.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Block theme for the AdCanvas marketing site and blog. The app itself runs on its own subdomain.

== Description ==

* Templates: front page, blog index, single post, page, archive, search, 404, plus "Landing page (full width, no title)" and "Legal / long-form text" page templates.
* Patterns (Inserter → Patterns → AdCanvas): key takeaways, post FAQ, comparison table, hero, integrations strip, features grid, how it works, product showcase, use cases, pricing, testimonials, FAQ, call to action, latest posts, post call to action, page header, funnel template gallery.
* Block styles: Card and Featured card (Group), Checkmarks (List), Eyebrow (Paragraph), Gradient text (Heading).
* Every link to https://app.example.com in templates and patterns is rewritten to the app URL set under Settings → General → "AdCanvas app URL" (defaults to https://app.<your domain>). Keep using that placeholder when you add sign-up links in the editor.
* Search and AI visibility, with no SEO plugin needed:
  * per-page search title, description and noindex (editor panel "Search & AI");
  * canonical, robots and sitemap hygiene;
  * Open Graph and X cards;
  * a linked JSON-LD graph (Organization, WebSite, WebPage, BreadcrumbList, BlogPosting + Person, FAQPage from Details blocks, SoftwareApplication with plan offers);
  * /llms.txt and /llms-full.txt;
  * AI-crawler policy in robots.txt;
  * IndexNow pings.
  See SEO-GUIDE.md in the repository.
* Blocks: Breadcrumbs and Table of contents. Single posts get reading time, an "Updated" date, an author box and related posts.
* Inter variable font bundled locally (no Google Fonts requests), image preloading and sizing for Core Web Vitals.

== Changelog ==

= 1.1.0 =
* Search, answer-engine and generative-engine optimization: structured data, meta, llms.txt, robots AI policy, IndexNow, breadcrumbs, table of contents, related posts, author box.

= 1.0.0 =
* Initial release.

== Copyright ==

AdCanvas theme, (C) [COMPANY LEGAL NAME]. GPLv2 or later.

Inter font: (C) The Inter Project Authors, SIL Open Font License 1.1 — see assets/fonts/LICENSE-Inter.txt.
Screenshots in assets/images are of the AdCanvas app.
