#!/usr/bin/env python3
"""Scrape Fantacalcio player PRO/CONTRO from public player pages.

Input:  data/players.json (generated from the Fantacalcio quotation list)
Output: data/pro_contro.json and data/pro_contro.csv

The scraper is deliberately conservative: sequential requests, configurable delay,
retries, resume support, and no browser automation. It uses Fantacalcio Id as the
stable identifier; team/name are used only to construct the public page URL.
"""
from __future__ import annotations

import argparse
import csv
import html
import json
import random
import re
import time
import unicodedata
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
PLAYERS_PATH = ROOT / "data" / "players.json"
JSON_OUT = ROOT / "data" / "pro_contro.json"
CSV_OUT = ROOT / "data" / "pro_contro.csv"
BASE = "https://www.fantacalcio.it/serie-a/squadre/{team}/{player}/{id}"
USER_AGENT = "Mozilla/5.0 (compatible; FantacalcioDataEnrichment/1.0; +personal-fantasy-football-tool)"


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        value = data.strip()
        if value:
            self.parts.append(value)


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "")
    value = "".join(c for c in value if not unicodedata.combining(c))
    value = value.lower().replace("’", "'").replace("`", "'")
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def player_url(player: dict) -> str:
    return BASE.format(
        team=slugify(player.get("team", "")),
        player=slugify(player.get("name", "")),
        id=player["id"],
    )


def page_text(raw_html: str) -> str:
    parser = TextExtractor()
    parser.feed(raw_html)
    return re.sub(r"\s+", " ", html.unescape(" ".join(parser.parts))).strip()


def extract_pro_contro(raw_html: str, team: str = "") -> tuple[str | None, str | None]:
    """Extract only the Fantacalcio 'in chiave Fantacalcio' PRO and CONTRO text."""
    text = page_text(raw_html)
    start = text.find(" PRO:")
    if start < 0 and text.startswith("PRO:"):
        start = 0
    if start < 0:
        start = text.find("PRO:")
    if start < 0:
        return None, None

    pro_start = start + len("PRO:")
    contro_marker = text.find("CONTRO:", pro_start)
    if contro_marker < 0:
        return None, None

    pro = text[pro_start:contro_marker].strip(" -*•\u00a0")
    contro_start = contro_marker + len("CONTRO:")

    stops = []
    if team:
        marker = f"Rosa {team}"
        pos = text.find(marker, contro_start)
        if pos >= 0:
            stops.append(pos)
    for marker in (" Le nostre app", " Strumenti ", " Supporto ", " Chi siamo "):
        pos = text.find(marker, contro_start)
        if pos >= 0:
            stops.append(pos)
    end = min(stops) if stops else len(text)
    contro = text[contro_start:end].strip(" -*•\u00a0")

    return (pro or None), (contro or None)


def fetch(url: str, timeout: float, retries: int) -> str:
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            req = Request(
                url,
                headers={
                    "User-Agent": USER_AGENT,
                    "Accept": "text/html,application/xhtml+xml",
                    "Accept-Language": "it-IT,it;q=0.9,en;q=0.7",
                },
            )
            with urlopen(req, timeout=timeout) as response:
                charset = response.headers.get_content_charset() or "utf-8"
                return response.read().decode(charset, errors="replace")
        except (HTTPError, URLError, TimeoutError) as exc:
            last_error = exc
            if isinstance(exc, HTTPError) and exc.code in (404, 410):
                break
            if attempt < retries:
                time.sleep(min(8.0, 1.5 * (2**attempt)))
    raise RuntimeError(str(last_error) if last_error else "request failed")


def load_existing() -> dict[str, dict]:
    if not JSON_OUT.exists():
        return {}
    try:
        rows = json.loads(JSON_OUT.read_text(encoding="utf-8"))
        return {str(row["id"]): row for row in rows if row.get("id") is not None}
    except (ValueError, OSError):
        return {}


def write_outputs(rows: list[dict]) -> None:
    JSON_OUT.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    fields = ["id", "name", "team", "url", "pro", "contro", "status", "error", "fetchedAt"]
    with CSV_OUT.open("w", encoding="utf-8-sig", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields)
        writer.writeheader()
        writer.writerows({k: row.get(k) for k in fields} for row in rows)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--delay", type=float, default=1.25, help="minimum seconds between requests")
    ap.add_argument("--jitter", type=float, default=0.35, help="random extra delay in seconds")
    ap.add_argument("--timeout", type=float, default=20.0)
    ap.add_argument("--retries", type=int, default=2)
    ap.add_argument("--limit", type=int, default=0, help="scrape only first N players (0=all)")
    ap.add_argument("--force", action="store_true", help="re-fetch successful rows")
    args = ap.parse_args()

    players = json.loads(PLAYERS_PATH.read_text(encoding="utf-8"))
    if args.limit > 0:
        players = players[: args.limit]

    existing = load_existing()
    results: dict[str, dict] = existing.copy()
    total = len(players)

    for idx, player in enumerate(players, 1):
        pid = str(player["id"])
        old = existing.get(pid)
        if old and old.get("status") == "ok" and not args.force:
            print(f"[{idx}/{total}] {player['name']}: cached")
            continue

        url = player_url(player)
        row = {
            "id": player["id"],
            "name": player.get("name"),
            "team": player.get("team"),
            "url": url,
            "pro": None,
            "contro": None,
            "status": "error",
            "error": None,
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
        }
        try:
            raw = fetch(url, args.timeout, args.retries)
            pro, contro = extract_pro_contro(raw, player.get("team", ""))
            row["pro"], row["contro"] = pro, contro
            if pro and contro:
                row["status"] = "ok"
                print(f"[{idx}/{total}] {player['name']}: OK")
            else:
                row["status"] = "missing"
                row["error"] = "PRO/CONTRO section not found or incomplete"
                print(f"[{idx}/{total}] {player['name']}: MISSING")
        except Exception as exc:  # keep batch resumable; error is recorded per player
            row["error"] = str(exc)
            print(f"[{idx}/{total}] {player['name']}: ERROR {exc}")

        results[pid] = row
        ordered = [results[str(p["id"])] for p in players if str(p["id"]) in results]
        write_outputs(ordered)
        if idx < total:
            time.sleep(max(0.0, args.delay) + random.uniform(0, max(0.0, args.jitter)))

    ordered = [results[str(p["id"])] for p in players if str(p["id"]) in results]
    write_outputs(ordered)
    ok = sum(r.get("status") == "ok" for r in ordered)
    missing = sum(r.get("status") == "missing" for r in ordered)
    errors = sum(r.get("status") == "error" for r in ordered)
    print(f"Done: {ok} OK, {missing} missing, {errors} errors, {len(ordered)} total")
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
