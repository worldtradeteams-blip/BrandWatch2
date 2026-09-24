# Brands Watch

A static news-wire site tracking daily headlines about global brands — tech, fashion, automotive, food & beverage, retail, and finance.

This is a plain HTML/CSS/JS site (no build step, no framework), designed to be pushed to GitHub and hosted for free on Cloudflare Pages.

**Current feature set:**
- Refresh control (top of the masthead): **Manual**, **5 min**, **15 min**, **30 min**, or **60 min** auto-refresh. The choice is remembered per browser (`localStorage`) and a "Refresh now" button forces an immediate reload regardless of the setting.
- The sample dataset (`data/stories.json`) ships with **54 distinct top global brands** across Tech, Fashion, Automotive, Food & Beverage, Retail, and Finance — above the 50-brand minimum. A console warning fires if a future data update drops the unique-brand count below 50 (see "Keeping 50+ brands per refresh" below).
- Every story shows a **brief summary** directly under its headline.
- Every story has a **"Read full story →" link** under the brief, pointing at the original article's URL.

## What's included

```
brandswatch/
├── index.html          # main page (masthead, ticker, feed, sidebar)
├── css/style.css        # all styling
├── js/script.js         # renders stories, ticker, watchlist, filters
├── data/stories.json    # sample story data — replace with a live feed
├── _headers             # Cloudflare Pages security/cache headers
├── _redirects            # Cloudflare Pages redirect rules (placeholder)
├── robots.txt
├── sitemap.xml
├── favicon left inline in index.html (no separate file needed)
└── README.md
```

## Running locally

No build tools needed. From the project folder:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`. (Opening `index.html` directly with `file://` will fail to load `data/stories.json` in most browsers due to fetch/CORS restrictions on local files — use a local server instead.)

## Replacing the sample data with real news

`data/stories.json` is a flat array of story objects:

```json
{
  "id": "1",
  "brand": "Nike",
  "category": "Fashion",
  "headline": "…",
  "summary": "…",
  "source": "Reuters",
  "url": "https://…",
  "timestamp": "2026-09-24T07:15:00Z"
}
```

Categories currently wired into the nav filter: `Tech`, `Fashion`, `Automotive`, `Food & Beverage`, `Retail`, `Finance`. Add more by editing the buttons in `index.html`'s `#categoryNav`.

### `scripts/fetch_news.py` — a real, working fetch script

This is included and functional, not a placeholder. It pulls the latest headline for each of ~56 target brands from **Google News RSS** (no API key or signup needed) and writes `data/stories.json` in the exact shape the site expects.

Run it locally:

```bash
pip install -r scripts/requirements.txt
python3 scripts/fetch_news.py --out data/stories.json
```

Things worth knowing about this script:

- **Why Google News RSS:** it's free and needs no account, so the site works out of the box. The trade-off is it's less structured than a paid news API and occasionally returns thin or repetitive summaries — good enough to launch with, worth upgrading later.
- **Rate limiting:** it sleeps 1 second between requests (56 brands ≈ ~1 minute per run) to avoid getting blocked. Don't remove that delay without adding your own backoff.
- **Brand coverage:** the target list has ~56 brands (6 more than the 50 minimum) specifically so that if a couple of brands return zero results on a given run, the total still clears 50. It also prints a warning to stderr if coverage ever falls short — check your Action logs if that happens.
- **This container's network couldn't reach news.google.com to test live** (its outbound access is restricted to a fixed allowlist of domains for coding/package use, not general web fetching), so the network call itself is untested from here — but the parsing/formatting logic *has* been verified against a mocked response and produces correctly-shaped output. Run it locally or in GitHub Actions (both have normal internet access) to confirm the live fetch, and open an issue/adjust the script if Google News' RSS format has changed.
- **Swapping in a different source later** (NewsAPI, GDELT, a paid feed, individual brand press-room RSS feeds): only `fetch_for_brand()` needs to change — it just needs to keep returning entries with `title`/`link`/`summary`/`published`/`source`. Everything else (dedup, the 50-brand check, JSON shape) stays as-is.

### Automating it with GitHub Actions

`.github/workflows/update-news.yml` is already wired to run this script:

```yaml
- name: Fetch and write stories.json
  run: python3 scripts/fetch_news.py --out data/stories.json
```

on a `*/15 * * * *` schedule (every 15 minutes — GitHub Actions doesn't guarantee sub-15-minute precision on scheduled runs, so this is roughly the practical ceiling for automation frequency; the 5-minute option in the site's own refresh dropdown re-checks the file more often but won't see new content between Action runs). Commits and pushes the updated file automatically, so Cloudflare Pages redeploys with fresh data on the same cadence.

## Keeping 50+ brands per refresh

`scripts/fetch_news.py` already targets ~56 brands (a buffer above the 50 minimum) and warns on stderr if actual coverage falls short on a given run — check the GitHub Action's logs periodically. If you swap in a different news source, keep that same safety margin and warning check.

## Deploying to GitHub

```bash
cd brandswatch
git init
git add .
git commit -m "Initial commit: Brands Watch site"
git branch -M main
git remote add origin https://github.com/<your-username>/brandswatch.git
git push -u origin main
```

## Deploying to Cloudflare Pages

**Important: use "Pages", not "Workers".** Cloudflare's dashboard offers both under **Workers & Pages**, and they are different products. This project is a plain static site — HTML/CSS/JS/JSON files — meant for **Pages**. If you instead create a **Worker**, it needs its own script to serve files, and without one correctly configured you'll see the page's HTML load but everything else (CSS, JS, `data/stories.json`) fail with 404s.

**Option A — connect the GitHub repo (recommended, enables auto-deploys):**

1. Cloudflare dashboard → **Workers & Pages** → **Create application**.
2. Make sure you land on the **Pages** tab (not Workers) → **Connect to Git**.
3. Select the `brandswatch` repository.
4. Build settings:
   - **Framework preset:** None
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/` (project root)
5. Click **Save and Deploy**. Every future push to `main` redeploys automatically.
6. The live URL Cloudflare gives you will end in `.pages.dev` — if it ends in `.workers.dev` instead, you accidentally created a Worker and should delete it and redo this from the Pages tab.

**Option B — direct upload (no GitHub required):**

1. Cloudflare dashboard → **Workers & Pages** → **Create application** → **Pages** tab → **Upload assets**.
2. Drag in the unzipped `brandswatch` folder (or the zip's extracted contents).
3. Deploy. Re-upload manually whenever you update the site.

Either way, Cloudflare gives you a `*.pages.dev` URL immediately, and you can attach a custom domain (e.g. `brandswatch.com`) from the project's **Custom domains** tab.

## Notes on the included Cloudflare files

- `_headers` sets basic security headers and caching rules for static assets — Cloudflare Pages reads this automatically, no configuration needed.
- `_redirects` is currently a placeholder; add rules here if you rename pages later (format: `/old-path /new-path 301`).

## Customizing

- **Colors/fonts:** edit the `:root` variables at the top of `css/style.css`.
- **Categories:** edit the buttons in `index.html` under `#categoryNav`, and make sure story objects in `stories.json` use matching `category` values.
- **Watchlist & newsletter form:** currently front-end only (watchlist persists per-browser via `localStorage`; the newsletter form just confirms locally). Wire the form's `submit` handler in `js/script.js` to your email provider (Mailchimp, Buttondown, a Cloudflare Worker, etc.) to make it live.
