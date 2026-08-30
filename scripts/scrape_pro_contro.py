#!/usr/bin/env python3
"""Scrape Fantacalcio player PRO/CONTRO from public player pages."""
from __future__ import annotations

import argparse
import csv
import html
import json
import random
import re
import subprocess
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
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/152.0.0.0 Safari/537.36"
)


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


def decode_embedded_text(raw_html: str) -> str:
    """Normalize text when page content is embedded in JSON/Next payloads."""
    text = html.unescape(raw_html)
    replacements = {
        r"\u003A": ":",
        r"\u003a": ":",
        r"\u00a0": " ",
        r"\u0027": "'",
        r"\u2019": "’",
        r"\u0026": "&",
        r"\u003C": "<",
        r"\u003E": ">",
        r"\/": "/",
        r'\"': '"',
    }
    for source, target in replacements.items():
        text = text.replace(source, target)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _extract_from_text(text: str, team: str = "") -> tuple[str | None, str | None]:
    pro_match = re.search(r"(?:^|\s|[•*\-])PRO\s*:\s*", text, flags=re.IGNORECASE)
    if not pro_match:
        return None, None
    contro_match = re.search(r"(?:^|\s|[•*\-])CONTRO\s*:\s*", text[pro_match.end():], flags=re.IGNORECASE)
    if not contro_match:
        return None, None

    contro_start = pro_match.end() + contro_match.start()
    contro_value_start = pro_match.end() + contro_match.end()
    pro = text[pro_match.end():contro_start].strip(" -*•\u00a0")

    stops: list[int] = []
    if team:
        m = re.search(rf"\bRosa\s+{re.escape(team)}\b", text[contro_value_start:], flags=re.IGNORECASE)
        if m:
            stops.append(contro_value_start + m.start())
    for marker in ("Le nostre app", "Strumenti", "Supporto", "Chi siamo", "Comparatore"):
        pos = text.lower().find(marker.lower(), contro_value_start)
        if pos >= 0:
            stops.append(pos)
    end = min(stops) if stops else len(text)
    contro = text[contro_value_start:end].strip(" -*•\u00a0")
    return (pro or None), (contro or None)


def extract_pro_contro(raw_html: str, team: str = "") -> tuple[str | None, str | None]:
    """Extract PRO/CONTRO from rendered HTML or embedded JSON payloads."""
    for candidate in (page_text(raw_html), decode_embedded_text(raw_html)):
        pro, contro = _extract_from_text(candidate, team)
        if pro and contro:
            return pro, contro
    return None, None


def fetch_urllib(url: str, timeout: float) -> str:
    req = Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.7,en;q=0.6",
            "Accept-Encoding": "identity",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Referer": "https://www.fantacalcio.it/",
            "Upgrade-Insecure-Requests": "1",
        },
    )
    with urlopen(req, timeout=timeout) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")


def fetch_curl(url: str, timeout: float) -> str:
    """Fallback used on GitHub runners if urllib receives an anti-bot/minimal page."""
    proc = subprocess.run(
        [
            "curl", "-L", "--compressed", "--silent", "--show-error",
            "--max-time", str(int(timeout)),
            "-A", USER_AGENT,
            "-H", "Accept-Language: it-IT,it;q=0.9,en-US;q=0.7,en;q=0.6",
            "-H", "Referer: https://www.fantacalcio.it/",
            url,
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or f"curl exit {proc.returncode}")
    return proc.stdout


def fetch(url: str, timeout: float, retries: int) -> str:
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            raw = fetch_urllib(url, timeout)
            # A valid player page should contain these markers either rendered or embedded.
            decoded = decode_embedded_text(raw).lower()
            if "pro:" in decoded and "contro:" in decoded:
                return raw
            # GitHub-hosted requests can receive a different HTML variant; retry with curl.
            raw_curl = fetch_curl(url, timeout)
            return raw_curl
        except (HTTPError, URLError, TimeoutError, RuntimeError) as exc:
            last_error = exc
            if isinstance(exc, HTTPError) and exc.code in (404, 410):
                break
            if attempt < retries:
                time.sleep(min(8.0, 1.5 * (2**attempt)))
    raise RuntimeError(str(last_error) if last_error else "request failed")


def diagnostic(raw_html: str) -> str:
    text = page_text(raw_html)
    title = re.search(r"<title[^>]*>(.*?)</title>", raw_html, flags=re.I | re.S)
    title_text = html.unescape(re.sub(r"\s+", " ", title.group(1))).strip() if title else "n/a"
    return f"bytes={len(raw_html)} title={title_text!r} hasDescrizione={'Descrizione' in text}"


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
    ap.add_argument("--delay", type=float, default=1.25)
    ap.add_argument("--jitter", type=float, default=0.35)
    ap.add_argument("--timeout", type=float, default=20.0)
    ap.add_argument("--retries", type=int, default=2)
    ap.add_argument("--limit", type=int, default=0, help="0 = all players")
    ap.add_argument("--force", action="store_true")
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
            "id": player["id"], "name": player.get("name"), "team": player.get("team"),
            "url": url, "pro": None, "contro": None, "status": "error", "error": None,
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
                row["error"] = "PRO/CONTRO not found; " + diagnostic(raw)
                print(f"[{idx}/{total}] {player['name']}: MISSING · {diagnostic(raw)}")
        except Exception as exc:
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
