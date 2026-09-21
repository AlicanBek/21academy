#!/usr/bin/env python3
"""Bump the ?v= cache-busting token on every asset URL and import.

GitHub Pages serves assets with max-age=600, so without this a browser
can pair a fresh index.html with a stale module and blow up on DOM ids
that no longer exist. Run this before every deploy.
"""
import re
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILES = ['index.html', 'js/app.js', 'js/ui.js', 'js/engine.js', 'js/cards.js', 'js/strategy.js', 'js/storage.js', 'sw.js']
PATTERN = re.compile(r"(\./(?:js/)?(?:css/)?[A-Za-z0-9_-]+\.(?:js|css))\?v=(\d+)")


def current():
    text = (ROOT / 'index.html').read_text()
    found = PATTERN.search(text)
    return int(found.group(2)) if found else 0


def main():
    version = current() + 1
    for name in FILES:
        path = ROOT / name
        if not path.exists():
            continue
        text = path.read_text()
        updated = PATTERN.sub(lambda m: f"{m.group(1)}?v={version}", text)
        if updated != text:
            path.write_text(updated)
    print(f"assets now at v{version}")


if __name__ == '__main__':
    main()
