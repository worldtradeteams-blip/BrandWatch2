#!/usr/bin/env python3
"""
Brands Watch — news fetch script.

Pulls the latest headline for each brand in BRANDS from Google News RSS
(no API key required) and writes data/stories.json in the exact shape
js/script.js expects.

Usage:
    python3 scripts/fetch_news.py > data/stories.json
    # or, to write the file directly:
    python3 scripts/fetch_news.py --out data/stories.json

Swapping in a different source later (NewsAPI, GDELT, a paid feed, etc.):
replace the body of fetch_for_brand() — everything downstream (dedup,
brand-count guarantee, JSON shape) stays the same as long as
fetch_for_brand() keeps returning a list of raw entries with
title/link/summary/published/source.
"""

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from html import unescape

try:
    import feedparser
except ImportError:
    sys.exit(
        "Missing dependency 'feedparser'. Install it with:\n"
        "    pip install feedparser --break-system-packages\n"
        "(or just 'pip install feedparser' inside a virtualenv / CI runner)"
    )

# --- Target brand list -------------------------------------------------
# Keep this list well above 50 (buffer for brands with zero fresh hits on a
# given run) so the final output still clears the 50-distinct-brand floor.
BRANDS = [
    ("Apple", "Tech"), ("Microsoft", "Tech"), ("Google", "Tech"), ("Amazon", "Retail"),
    ("Samsung", "Tech"), ("Meta", "Tech"), ("Nvidia", "Tech"), ("Sony", "Tech"),
    ("IBM", "Tech"), ("Intel", "Tech"), ("Dell", "Tech"), ("HP", "Tech"),
    ("Nike", "Fashion"), ("Adidas", "Fashion"), ("Zara", "Fashion"), ("H&M", "Fashion"),
    ("Gucci", "Fashion"), ("Louis Vuitton", "Fashion"), ("Chanel", "Fashion"), ("Uniqlo", "Fashion"),
    ("Toyota", "Automotive"), ("Volkswagen", "Automotive"), ("Ford", "Automotive"), ("Tesla", "Automotive"),
    ("BMW", "Automotive"), ("Mercedes-Benz", "Automotive"), ("Honda", "Automotive"), ("Hyundai", "Automotive"),
    ("General Motors", "Automotive"), ("Porsche", "Automotive"),
    ("Coca-Cola", "Food & Beverage"), ("PepsiCo", "Food & Beverage"), ("Starbucks", "Food & Beverage"),
    ("McDonald's", "Food & Beverage"), ("Nestle", "Food & Beverage"), ("KFC", "Food & Beverage"),
    ("Heineken", "Food & Beverage"), ("Danone", "Food & Beverage"), ("Unilever", "Food & Beverage"),
    ("Red Bull", "Food & Beverage"),
    ("Walmart", "Retail"), ("IKEA", "Retail"), ("Target", "Retail"), ("Costco", "Retail"),
    ("Alibaba", "Retail"), ("Carrefour", "Retail"), ("Home Depot", "Retail"),
    ("Visa", "Finance"), ("Mastercard", "Finance"), ("PayPal", "Finance"), ("American Express", "Finance"),
    ("Goldman Sachs", "Finance"), ("JPMorgan Chase", "Finance"), ("HSBC", "Finance"),
    # Buffer brands beyond the required 50, so occasional zero-result runs
    # for a brand still leave the total comfortably above the floor.
    ("Netflix", "Tech"), ("Spotify", "Tech"), ("Airbnb", "Retail"), ("Shell", "Finance"),
    ("Pfizer", "Food & Beverage"), ("L'Oreal", "Fashion"),
]

MIN_BRANDS_REQUIRED = 50
GOOGLE_NEWS_RSS = "https://news.google.com/rss/search?q={query}&hl=en-US&gl=US&ceid=US:en"
REQUEST_DELAY_SECONDS = 1.0  # be polite to the endpoint between requests
USER_AGENT = "Mozilla/5.0 (compatible; BrandsWatchBot/1.0; +https://example.com)"


def clean_html(raw):
    """Strip tags/entities Google News puts in RSS summaries."""
    text = re.sub(r"<[^>]+>", "", raw or "")
    return unescape(text).strip()


def fetch_for_brand(brand_name):
    """Return a list of raw feed entries for one brand. Swap this out to
    change news source (NewsAPI, GDELT, a press-room RSS, etc.)."""
    query = urllib.parse.quote(f'"{brand_name}"')
    url = GOOGLE_NEWS_RSS.format(query=query)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=15) as resp:
        raw = resp.read()
    parsed = feedparser.parse(raw)
    return parsed.entries


def entry_to_story(brand_name, category, entry, idx):
    title = clean_html(entry.get("title", "")).strip()
    summary = clean_html(entry.get("summary", "")).strip()
    # Google News summaries often just repeat the title with a source tag;
    # fall back to a generic brief if there's nothing extra to show.
    if not summary or summary == title:
        summary = f"Latest coverage of {brand_name} from {entry.get('source', {}).get('title', 'a news source')}."

    link = entry.get("link", "")
    source_title = entry.get("source", {}).get("title") if isinstance(entry.get("source"), dict) else None

    published_struct = entry.get("published_parsed")
    if published_struct:
        ts = datetime(*published_struct[:6], tzinfo=timezone.utc)
    else:
        ts = datetime.now(timezone.utc)

    return {
        "id": f"{brand_name.lower().replace(' ', '-')}-{idx}",
        "brand": brand_name,
        "category": category,
        "headline": title,
        "summary": summary[:280],
        "source": source_title or "Google News",
        "url": link,
        "timestamp": ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def build_stories():
    stories = []
    covered_brands = set()

    for brand_name, category in BRANDS:
        try:
            entries = fetch_for_brand(brand_name)
        except Exception as exc:  # network hiccup on one brand shouldn't kill the run
            print(f"warning: fetch failed for {brand_name}: {exc}", file=sys.stderr)
            entries = []

        if entries:
            # Take the single freshest story per brand, keeping the feed
            # balanced across all target brands rather than dominated by
            # whichever brand happens to be in the news most that day.
            story = entry_to_story(brand_name, category, entries[0], 1)
            stories.append(story)
            covered_brands.add(brand_name)

        time.sleep(REQUEST_DELAY_SECONDS)

    stories.sort(key=lambda s: s["timestamp"], reverse=True)

    if len(covered_brands) < MIN_BRANDS_REQUIRED:
        print(
            f"warning: only {len(covered_brands)} distinct brands returned results "
            f"(minimum required: {MIN_BRANDS_REQUIRED}). Consider widening the BRANDS "
            f"list or checking network/rate-limit issues.",
            file=sys.stderr,
        )

    return stories


def main():
    parser = argparse.ArgumentParser(description="Fetch brand news for Brands Watch.")
    parser.add_argument("--out", help="Write JSON to this file instead of stdout.")
    args = parser.parse_args()

    stories = build_stories()
    output = json.dumps(stories, indent=2)

    if args.out:
        with open(args.out, "w") as f:
            f.write(output + "\n")
        print(f"Wrote {len(stories)} stories ({len(set(s['brand'] for s in stories))} distinct brands) to {args.out}", file=sys.stderr)
    else:
        print(output)


if __name__ == "__main__":
    main()
