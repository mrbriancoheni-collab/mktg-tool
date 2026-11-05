# Marketing site and blog (WordPress)

The public website, at `yourdomain.com`, runs on WordPress with the **AdCanvas block theme** in `adcanvas-theme/`. The app runs separately at `app.yourdomain.com`. Every "Log in", "Start free" and pricing button in the theme points to the app.

| Path | What it is |
|---|---|
| `adcanvas-theme/` | Block (full-site-editing) theme: templates, patterns, styles, fonts, screenshots |
| `adcanvas-starter-content.xml` | Import file with every page (Home, Features, Pricing, Templates, Blog, About, Contact, Security, Legal and its 7 sub-pages) and 3 starter blog posts |
| `tools/build-starter-content.mjs` | Regenerates the import file from `legal/*.md` (`npm run wp:content`) |

## Install

1. **Get WordPress 6.6 or newer** (PHP 8.1+) on any host: WordPress.com Business, WP Engine, Kinsta, SiteGround, or your own server.
2. **Upload the theme.** Run `npm run wp:zip` to build `wordpress/adcanvas-theme.zip`. In WordPress, go to **Appearance → Themes → Add New → Upload Theme**, upload the zip, then click **Activate**.
3. **Import the pages and posts.** Go to **Tools → Import → WordPress**, install the importer if asked, upload `adcanvas-starter-content.xml`, and assign the content to your admin user.
4. **Settings → Reading:** set *Your homepage displays* to **A static page**, with Homepage **Home** and Posts page **Blog**.
5. **Settings → Permalinks:** choose **Post name**. Legal pages then live at `/legal/privacy/`, `/legal/terms/` and so on, the same paths the app links to.
6. **Settings → General → AdCanvas app URL:** enter `https://app.yourdomain.com`. If you leave it empty, the theme uses `https://app.` plus your site's domain.
7. **Set the site title** (Settings → General) to "AdCanvas" and, optionally, a site icon (Appearance → Editor → Styles, or Settings → General).

Then, in the app's environment, set `MARKETING_URL=https://yourdomain.com` (see `docs/SETUP.md` §12).

## Before launch

- **Testimonials are placeholders.** The *Testimonials* pattern says `[REPLACE …]`, and it is **not** on the front page. Add it only with real, attributable quotes that you have permission to use.
- **Fill in placeholders:** `[COMPANY LEGAL NAME]` in the footer (Appearance → Editor → Patterns → Footer), plus the About, Contact and Security pages.
- **Legal pages** are imported from the templates in `legal/*.md`. Fill in the placeholders and have them reviewed by counsel. Either edit them in WordPress, or edit the markdown, run `npm run wp:content`, and re-import.
- **Pricing** is copied from `shared/plans.ts`. If prices change, update `adcanvas-theme/patterns/pricing.php`, or edit the Pricing page in WordPress.
- Install an SEO plugin (Yoast, Rank Math, etc.) if you want sitemaps and per-page meta. The theme's own Open Graph tags turn off automatically when one is active.
- Add a cookie banner if you add analytics or ad pixels to the marketing site (see `legal/cookies.md`).

## Editing

- **Front page:** Appearance → Editor → Templates → *Front Page*. It is built from patterns, and every section can be edited visually.
- **Header and footer:** Appearance → Editor → Patterns → *Header* / *Footer*. The navigation links are plain links. To manage them as a menu, select the Navigation block and choose *Create new menu*.
- **New landing pages:** Pages → Add New. In the right sidebar, set *Template* to **Landing page (full width, no title)**, then insert patterns from **Patterns → AdCanvas: Marketing**.
- **Links to the app:** write them as `https://app.example.com/signup` (or `/login`). The theme rewrites that host to the configured app URL when the page is shown, so the same content works on staging and production.

## Try it locally

Any of these works:

- **WordPress Playground** (in the browser, nothing to install): open https://playground.wordpress.net, then upload the theme zip and import the XML as above.
- **wp-env** (Docker): `cd wordpress && npx @wordpress/env start` uses the included `.wp-env.json`. Then open http://localhost:8888/wp-admin (admin / password) and import the XML.
- **Local** (localwp.com): create a site, then copy `adcanvas-theme` into `wp-content/themes`.
