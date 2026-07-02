#!/usr/bin/env python3
"""Content pipeline for the site — run after adding or editing posts.

Regenerates every derived artifact from the source of truth
(``posts/index.json`` + the markdown files it lists):

  1. ``feed.xml``    — Atom feed of all posts (newest first).
  2. ``sitemap.xml`` — TR + EN pages, ``lastmod`` = newest post date.
  3. Cache busting   — stamps ``?v=<hash>`` onto style.css / site.js /
     script.js references in every HTML file, and ``CACHE_VERSION`` in
     sw.js. The hash is derived from the assets' contents, so the value
     only changes when the assets do (idempotent output, CI-friendly).

Usage:
    python3 tools/generate.py           # write files
    python3 tools/generate.py --check   # exit 1 if anything is stale (CI)

Standard library only; no third-party dependencies.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://yankikucuk.github.io/neredesin.co/"
FEED_TITLE = "Neredesin Co? — Blog"
AUTHOR = "Yankı Küçük"

# Assets whose contents drive the cache-busting hash. sw.js is excluded
# on purpose: it *receives* the stamp, so including it would be circular.
HASHED_ASSETS = ["style.css", "script.js", "site.js", "lib/utils.js"]

HTML_FILES = [
    "index.html",
    "blog.html",
    "portfolio.html",
    "404.html",
    "en/index.html",
    "en/blog.html",
    "en/portfolio.html",
]

SITEMAP_PAGES = [
    ("", "monthly", "1.0"),
    ("blog.html", "weekly", "0.9"),
    ("portfolio.html", "monthly", "0.8"),
    ("en/index.html", "monthly", "0.7"),
    ("en/blog.html", "weekly", "0.7"),
    ("en/portfolio.html", "monthly", "0.6"),
]


def parse_frontmatter(text: str) -> tuple[dict, str]:
    """Mirror of lib/utils.js parseFrontmatter."""
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
    if not m:
        return {}, text
    meta = {}
    for line in m.group(1).split("\n"):
        key, sep, value = line.partition(":")
        if sep:
            meta[key.strip()] = value.strip()
    return meta, m.group(2)


def slugify(title: str) -> str:
    """Mirror of lib/utils.js slugify (Turkish-aware)."""
    s = title.replace("İ", "I").lower().replace("ı", "i")
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def first_paragraph(markdown: str) -> str:
    """Mirror of lib/utils.js firstParagraph."""
    text = re.sub(r"```.*?```", " ", markdown, flags=re.S)
    for block in re.split(r"\n{2,}", text):
        t = block.strip()
        if (
            not t
            or t.startswith("#")
            or t.startswith(">")
            or t.startswith("@audio:")
            or re.match(r"^([-*+]|\d+\.)\s", t)
        ):
            continue
        # Strip the most common inline markdown for a plain-text summary.
        t = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", t)
        t = re.sub(r"[*_`]", "", t)
        return re.sub(r"\s+", " ", t)
    return ""


def xml_escape(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def load_posts() -> list[dict]:
    files = json.loads((ROOT / "posts" / "index.json").read_text("utf-8"))
    posts, used = [], set()
    for name in files:
        path = ROOT / "posts" / name
        meta, body = parse_frontmatter(path.read_text("utf-8"))
        title = meta.get("title") or path.stem
        date = meta.get("date", "")
        if date and not re.match(r"^\d{4}-\d{2}-\d{2}$", date):
            sys.exit(f"HATA: {name} geçersiz tarih: {date!r} (YYYY-MM-DD bekleniyor)")
        base = slugify(title) or "yazi"
        slug, n = base, 2
        while slug in used:
            slug, n = f"{base}-{n}", n + 1
        used.add(slug)
        posts.append(
            {
                "slug": slug,
                "title": title,
                "date": date,
                "tags": [t.strip() for t in meta.get("tags", "").split(",") if t.strip()],
                "summary": first_paragraph(body),
            }
        )
    return posts


def build_feed(posts: list[dict], newest: str) -> str:
    entries = []
    for p in posts:
        url = f"{SITE}blog.html#{p['slug']}"
        cats = "".join(
            f'\n    <category term="{xml_escape(t)}" />' for t in p["tags"]
        )
        entries.append(
            f"""  <entry>
    <title>{xml_escape(p['title'])}</title>
    <link href="{url}" />
    <id>{url}</id>
    <updated>{p['date']}T00:00:00Z</updated>
    <summary>{xml_escape(p['summary'])}</summary>{cats}
  </entry>"""
        )
    body = "\n".join(entries)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="tr">
  <title>{xml_escape(FEED_TITLE)}</title>
  <link href="{SITE}blog.html" />
  <link rel="self" href="{SITE}feed.xml" />
  <id>{SITE}</id>
  <updated>{newest}T00:00:00Z</updated>
  <author>
    <name>{xml_escape(AUTHOR)}</name>
  </author>
{body}
</feed>
"""


def build_sitemap(newest: str) -> str:
    urls = "\n".join(
        f"""  <url>
    <loc>{SITE}{path}</loc>
    <lastmod>{newest}</lastmod>
    <changefreq>{freq}</changefreq>
    <priority>{prio}</priority>
  </url>"""
        for path, freq, prio in SITEMAP_PAGES
    )
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{urls}
</urlset>
"""


def asset_version() -> str:
    h = hashlib.sha256()
    for rel in HASHED_ASSETS:
        h.update((ROOT / rel).read_bytes())
    return h.hexdigest()[:8]


def stamp_versions(version: str) -> dict[Path, str]:
    """Returns {path: new_content} for files needing a version stamp."""
    changes: dict[Path, str] = {}
    pattern = re.compile(r"((?:style\.css|site\.js|script\.js)\?v=)[0-9a-f]{8}")
    for rel in HTML_FILES:
        path = ROOT / rel
        old = path.read_text("utf-8")
        new = pattern.sub(rf"\g<1>{version}", old)
        if new != old:
            changes[path] = new

    sw = ROOT / "sw.js"
    old = sw.read_text("utf-8")
    new = re.sub(
        r'const CACHE_VERSION = "[0-9a-f]{8}";',
        f'const CACHE_VERSION = "{version}";',
        old,
    )
    if new != old:
        changes[sw] = new
    return changes


def main() -> None:
    check = "--check" in sys.argv

    posts = load_posts()
    newest = max((p["date"] for p in posts if p["date"]), default="1970-01-01")
    version = asset_version()

    targets = {
        ROOT / "feed.xml": build_feed(posts, newest),
        ROOT / "sitemap.xml": build_sitemap(newest),
    }
    targets.update(stamp_versions(version))

    stale = []
    for path, content in targets.items():
        current = path.read_text("utf-8") if path.exists() else None
        if current != content:
            stale.append(path.relative_to(ROOT))
            if not check:
                path.write_text(content, "utf-8")

    if check:
        if stale:
            print("Güncel değil (tools/generate.py çalıştırılmalı):")
            for p in stale:
                print(f"  - {p}")
            sys.exit(1)
        print("Tüm üretilen dosyalar güncel.")
    else:
        if stale:
            print(f"Sürüm: {version} | En yeni yazı: {newest}")
            for p in stale:
                print(f"  yazıldı: {p}")
        else:
            print("Değişiklik yok; her şey zaten güncel.")


if __name__ == "__main__":
    main()
