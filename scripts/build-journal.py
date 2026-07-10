#!/usr/bin/env python3
"""Inline journal/*.md entries into index.html between build markers.

Usage (from repo root):
  python3 scripts/build-journal.py

Add or edit files under journal/ with YAML frontmatter, then run before commit.
"""
from __future__ import annotations

import html
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
JOURNAL_DIR = ROOT / "journal"
START = "<!-- JOURNAL_ENTRIES_START -->"
END = "<!-- JOURNAL_ENTRIES_END -->"


def parse_frontmatter(text: str) -> tuple[dict, str]:
    if not text.startswith("---"):
        raise ValueError("journal file must start with --- frontmatter")
    parts = text.split("---", 2)
    if len(parts) < 3:
        raise ValueError("invalid frontmatter block")
    meta: dict = {}
    for line in parts[1].strip().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            continue
        k, v = line.split(":", 1)
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k == "order":
            meta[k] = int(v)
        elif k == "reverse":
            meta[k] = v.lower() in ("true", "yes", "1")
        else:
            meta[k] = v
    body = parts[2].strip()
    return meta, body


def body_to_paragraphs(body: str) -> str:
    paras = [p.strip() for p in re.split(r"\n\s*\n", body) if p.strip()]
    if not paras:
        paras = [body.strip()] if body.strip() else [""]
    inner = "\n                            ".join(html.escape(p) for p in paras)
    return inner


def render_article(meta: dict, body: str) -> str:
    rev = " story--reverse" if meta.get("reverse") else ""
    date = html.escape(str(meta.get("date", "")))
    title = html.escape(str(meta.get("title", "")))
    img = html.escape(str(meta.get("image", "")))
    alt = html.escape(str(meta.get("image_alt", meta.get("title", ""))))
    para = body_to_paragraphs(body)
    return f"""                <article class=\"story{rev}\">
                    <div class=\"story__media reveal\"><img src=\"{img}\" alt=\"{alt}\"></div>
                    <div class=\"story__text reveal reveal-d1\">
                        <span class=\"story__date\">{date}</span>
                        <h3 class=\"story__title\">{title}</h3>
                        <p class=\"story__body\">{para}</p>
                    </div>
                </article>"""


def main() -> int:
    if not INDEX.is_file():
        print("index.html not found", file=sys.stderr)
        return 1
    html_text = INDEX.read_text(encoding="utf-8")
    if START not in html_text or END not in html_text:
        print("markers missing in index.html — add JOURNAL_ENTRIES_START/END", file=sys.stderr)
        return 1

    entries = []
    for path in sorted(JOURNAL_DIR.glob("*.md")):
        meta, body = parse_frontmatter(path.read_text(encoding="utf-8"))
        meta["_path"] = path.name
        entries.append((meta.get("order", 999), path.name, meta, body))
    entries.sort(key=lambda x: (x[0], x[1]))

    block = "\n\n".join(render_article(m, b) for _, _, m, b in entries)
    if not block.strip():
        print("no journal entries", file=sys.stderr)
        return 1

    pattern = re.compile(re.escape(START) + r".*?" + re.escape(END), re.DOTALL)
    new_html = pattern.sub(f"{START}\n{block}\n                {END}", html_text, count=1)
    if new_html == html_text:
        print("replace failed", file=sys.stderr)
        return 1
    INDEX.write_text(new_html, encoding="utf-8")
    print(f"inlined {len(entries)} journal entries into index.html")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())