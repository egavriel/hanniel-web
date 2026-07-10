#!/usr/bin/env python3
"""Tier 3: read 7-day hanniel-web click stats, ask an LLM to draft ONE small
string change, then open a PR on the staging branch.

Why this exists
  - One small auditable change per day.
  - PR diff touches at most one field in `content.json`.
  - Erwin approves the PR in WhatsApp (we ping him via WA bridge) or on github.com.

Where it runs
  - Triggered by a hermes cronjob (`cronjob action='create'`).
  - Or run locally for testing:
      python3 scripts/propose.py --dry-run

Required env (in hermes .env + `gh auth login` on host):
  HANNIEL_STATS_URL   e.g. https://little.hanniel.co/api/stats?token=…
  HERMES_DEST         "origin"  (default) — where the cron output goes
  ANTHROPIC_API_KEY   or compatible provider (we use whatever hermes has)

Hard rules baked into the LLM system prompt
  - Output one JSON object: {"field","before","after","rationale","confidence"}.
  - `field` must be a key from content.json (announcement, hero.waCtaLabel,
    menu.orderTitle, menu.orderLead) — never layout, never colours, never a
    product claim (no "fresh" → "guaranteed fresh", no time/capacity claims).
  - `before` must equal current value of that field.
  - `confidence` in [0,1]. Skip if <0.55.
  - Do not invent URLs or facts.
"""

import argparse
import json
import os
import subprocess
import sys
import textwrap
import time
import urllib.request
from datetime import datetime, timezone

def _required(name):
    v = os.environ.get(name)
    if not v:
        print(f"missing env {name}", file=sys.stderr); sys.exit(2)
    return v


STAT_URL = _required("HANNIEL_STATS_URL")              # full URL w/ token
REPO_DIR = _required("HANNIEL_WEB_DIR")                # local repo
LLM_KEY  = _required("ANTHROPIC_API_KEY") if (
    not os.environ.get("MINIMAX_API_KEY")
) else os.environ["MINIMAX_API_KEY"]

# Configurable defaults
BRANCH   = os.environ.get("HANNIEL_PROPOSE_BRANCH", "proposals/daily")
BASE     = os.environ.get("HANNIEL_PROPOSE_BASE", "staging")
TITLE_PREFIX = "proposal"
LLM_URL  = os.environ.get("HANNIEL_LLM_URL", "https://api.minimax.io/anthropic")
LLM_MODEL = os.environ.get("HANNIEL_LLM_MODEL", "MiniMax-M3")


def fetch_stats():
    req = urllib.request.Request(
        STAT_URL,
        headers={
            "accept": "application/json",
            "user-agent": "hanniel-web-cron/1.0 (+propose.py)",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        print(f"stats fetch http_err {e.code}: {e.read().decode()[:300]}", file=sys.stderr)
        return {"totals": {"count": 0}, "by_name_variant": [], "by_day": []}


def read_content(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_content(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def call_llm(stats, current):
    fields = []
    for k, v in current.items():
        if isinstance(v, str):  fields.append((k, v))
        if isinstance(v, dict):
            for k2, v2 in v.items():
                if isinstance(v2, str): fields.append((f"{k}.{k2}", v2))

    sys_msg = textwrap.dedent("""\
        You are the copy editor for a small-bakery landing page. Given a JSON
        snapshot of the last 7 days of click telemetry plus the current
        content.json fields, propose exactly ONE change. Hard rules:

        - Only edit a key from the listed fields (announcement, hero.waCtaLabel,
          menu.orderTitle, menu.orderLead). Never touch layout, HTML, colours, or
          any product claim (hours, capacity, freshness, dietary).
        - "before" must equal the current value of that key exactly.
        - "after" must be ≤ 60 chars and a plausible copy variant.
        - Output ONE JSON object, no prose, no markdown fence:
            {"field":"...","before":"...","after":"...","rationale":"<=140 chars",
             "expected_uplift":"+10% clicks (rough)","confidence":0.0..1.0}
        - If nothing is worth changing right now, return
            {"skip":true,"reason":"..."}. Confidence < 0.55 = skip.
    """)
    user_msg = json.dumps({
        "stats_7d": stats,
        "current_fields": dict(fields),
    }, ensure_ascii=False)

    body = {
        "model": LLM_MODEL,
        "max_tokens": 600,
        "system": sys_msg,
        "messages": [{"role": "user", "content": user_msg}],
    }
    req = urllib.request.Request(
        LLM_URL.rstrip("/") + "/v1/messages",
        data=json.dumps(body).encode(),
        method="POST",
        headers={
            "content-type": "application/json",
            "x-api-key": LLM_KEY,
            "anthropic-version": "2023-06-01",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            out = json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:300]
        print(f"LLM call failed: {e.code} {body}", file=sys.stderr)
        return json.dumps({"skip": True, "reason": "llm_unavailable"})
    except Exception as e:
        print(f"LLM call error: {e}", file=sys.stderr)
        return json.dumps({"skip": True, "reason": "llm_error"})
    # Anthropic-style content extraction
    parts = out.get("content") or []
    text = "".join(p.get("text", "") for p in parts if p.get("type") == "text")
    return text.strip()


def safe_parse(text):
    s = text.find("{"); e = text.rfind("}")
    if s < 0 or e < 0:
        return None
    try:
        return json.loads(text[s:e + 1])
    except Exception:
        return None


def apply_change(content_path, prop):
    """Mutate content.json in place. Returns (before, after) on success."""
    content = read_content(content_path)
    if prop.get("skip"): return None
    field = prop["field"]
    before = prop["before"]
    after  = prop["after"]
    if "." in field:
        a, b = field.split(".", 1)
        if a not in content or not isinstance(content[a], dict):
            raise ValueError(f"unknown container {a}")
        if content[a].get(b) != before:
            raise ValueError(f"field {field} before-mismatch: {content[a].get(b)!r} != {before!r}")
        content[a][b] = after
    else:
        if field not in content:
            raise ValueError(f"unknown field {field}")
        if content[field] != before:
            raise ValueError(f"field {field} before-mismatch")
        content[field] = after
    write_content(content_path, content)
    return (before, after)


def open_pr(dry_run, field, before, after, rationale):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    title = f"{TITLE_PREFIX}: {field} ({today})"
    body = (
        f"**Auto-proposal** _(staging only)_  \n"
        f"Field: `{field}`  \n"
        f"Before: {before!r}  \nAfter:  {after!r}  \n\n"
        f"> {rationale}  \n"
    )
    branch = f"{BRANCH}-{today}"
    if dry_run:
        return {"branch": branch, "title": title, "body": body, "dry_run": True}

    cmds = [
        ["git", "-C", REPO_DIR, "checkout", BASE],
        ["git", "-C", REPO_DIR, "pull", "--ff-only", "origin", BASE],
        ["git", "-C", REPO_DIR, "checkout", "-B", branch, BASE],
    ]
    for c in cmds: subprocess.run(c, check=True)
    # caller already wrote the change into content.json before this function
    subprocess.run(["git", "-C", REPO_DIR, "add", "content.json"], check=True)
    subprocess.run(
        ["git", "-C", REPO_DIR, "commit", "-c", "user.email=eva@egavriel.local",
         "-c", "user.name=eva", "-m", title, "-m", rationale], check=True
    )
    subprocess.run(["git", "-C", REPO_DIR, "push", "-u", "origin", branch], check=True)
    out = subprocess.run(
        ["gh", "pr", "create", "--base", BASE, "--head", branch,
         "--title", title, "--body", body, "--label", "auto-proposal"],
        cwd=REPO_DIR, capture_output=True, text=True, check=False,
    )
    if out.returncode != 0:
        return {"branch": branch, "title": title, "body": body, "gh_err": out.stderr.strip()}
    return {"branch": branch, "title": title, "url": out.stdout.strip(), "dry_run": False}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true", help="plan only, no git/gh")
    p.add_argument("--content", default="content.json")
    p.add_argument("--min", type=int, default=10,
                   help="min total events in 7d before proposing (skip otherwise)")
    args = p.parse_args()

    if not REPO_DIR:
        print("HANNIEL_WEB_DIR not set", file=sys.stderr); sys.exit(2)

    stats = fetch_stats()
    n = (stats.get("totals") or {}).get("count") or 0
    print(f"stats 7d events: {n}")
    if n < args.min:
        print(f"skip: only {n} events (min {args.min})"); return

    current = read_content(os.path.join(REPO_DIR, args.content))
    raw = call_llm(stats, current)
    proposal = safe_parse(raw)
    if not proposal:
        print("skip: could not parse LLM JSON:"); print(raw); return
    if proposal.get("skip"):
        print(f"skip: {proposal.get('reason')!r}"); return
    conf = float(proposal.get("confidence") or 0)
    if conf < 0.55:
        print(f"skip: confidence {conf} < 0.55"); return

    # dry run keeps the file untouched
    if args.dry_run:
        print("would apply:", json.dumps({k: proposal.get(k) for k in
              ("field","before","after","rationale","confidence")}, indent=2))
        return

    applied = apply_change(os.path.join(REPO_DIR, args.content), proposal)
    if not applied:
        print("skip: applied returned empty"); return

    pr = open_pr(False, proposal["field"], applied[0], applied[1],
                 proposal.get("rationale", ""))
    print(json.dumps(pr, indent=2))


if __name__ == "__main__":
    raise SystemExit(main() or 0)
