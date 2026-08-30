#!/usr/bin/env python3
"""Recover only missing player ages, using FBref first and Transfermarkt as fallback.

The scraper is intentionally conservative: exact/abbreviated normalized name + team
matching only, no fuzzy auto-acceptance, bounded retries and cached resolved rows.
"""

from __future__ import annotations

import argparse
import html as html_lib
import json
import re
import time
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import quote_plus, urljoin
from urllib.request import Request, urlopen

from import_workbooks import abbreviated_name_matches, normalize_player_name

ROOT = Path(__file__).resolve().parents[1]
PLAYERS_PATH = ROOT / "data/players.json"
OUTPUT_PATH = ROOT / "data/player_ages.json"
FBREF_SERIE_A = "https://fbref.com/en/comps/11/Serie-A-Stats"
TRANSFERMARKT_SEARCH = "https://www.transfermarkt.it/schnellsuche/ergebnis/schnellsuche?query={}"
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0 Safari/537.36"
)
TEAM_ALIASES = {
    "internazionale": "inter",
    "inter milan": "inter",
    "hellas verona": "verona",
    "como 1907": "como",
    "juventus fc": "juventus",
    "ac milan": "milan",
    "as roma": "roma",
    "ssc napoli": "napoli",
    "ss lazio": "lazio",
    "acf fiorentina": "fiorentina",
    "us lecce": "lecce",
    "parma calcio 1913": "parma",
    "torino fc": "torino",
    "udinese calcio": "udinese",
    "cagliari calcio": "cagliari",
    "genoa cfc": "genoa",
    "atalanta bc": "atalanta",
    "bologna fc 1909": "bologna",
    "us sassuolo": "sassuolo",
}


def normalize_team(value: str | None) -> str:
    key = normalize_player_name(value)
    return TEAM_ALIASES.get(key, key)


def valid_age(value) -> bool:
    try:
        age = int(value)
    except (TypeError, ValueError):
        return False
    return 15 <= age <= 50


def age_from_dob(value: str, today: date | None = None) -> int | None:
    if not value:
        return None
    today = today or date.today()
    parsed = None
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%b %d, %Y", "%d %b %Y"):
        try:
            parsed = datetime.strptime(value.strip(), fmt).date()
            break
        except ValueError:
            continue
    if not parsed:
        return None
    age = today.year - parsed.year - ((today.month, today.day) < (parsed.month, parsed.day))
    return age if valid_age(age) else None


def iso_dob(value: str) -> str | None:
    if not value:
        return None
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%b %d, %Y", "%d %b %Y"):
        try:
            return datetime.strptime(value.strip(), fmt).date().isoformat()
        except ValueError:
            continue
    return None


def strip_tags(value: str) -> str:
    value = re.sub(r"<[^>]+>", " ", value or "")
    return re.sub(r"\s+", " ", html_lib.unescape(value)).strip()


def fetch(url: str, retries: int = 2, delay: float = 1.0) -> str:
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "identity",
        "Connection": "close",
    }
    last = None
    for attempt in range(retries + 1):
        try:
            with urlopen(Request(url, headers=headers), timeout=20) as response:
                return response.read().decode("utf-8", errors="replace")
        except Exception as exc:  # network failures must not abort the batch
            last = exc
            if attempt < retries:
                time.sleep(delay * (attempt + 1))
    raise RuntimeError(f"fetch failed for {url}: {last}")


def discover_fbref_team_urls(page_html: str) -> dict[str, str]:
    clean = page_html.replace("<!--", "").replace("-->", "")
    result = {}
    pattern = re.compile(r'<a[^>]+href="(?P<href>/en/squads/[^"]+)"[^>]*>(?P<name>.*?)</a>', re.I | re.S)
    for match in pattern.finditer(clean):
        href, name = match.group("href"), strip_tags(match.group("name"))
        if not name or "Stats" not in href:
            continue
        key = normalize_team(name)
        result.setdefault(key, urljoin("https://fbref.com", href))
    return result


def parse_fbref_squad(page_html: str) -> list[dict]:
    """Parse Standard Stats rows; works when FBref wraps tables in comments."""
    clean = page_html.replace("<!--", "").replace("-->", "")
    rows = []
    for row_html in re.findall(r"<tr[^>]*>(.*?)</tr>", clean, re.I | re.S):
        player_match = re.search(r'data-stat="player"[^>]*>(.*?)</(?:th|td)>', row_html, re.I | re.S)
        age_match = re.search(r'data-stat="age"[^>]*>(.*?)</td>', row_html, re.I | re.S)
        if not player_match or not age_match:
            continue
        name = strip_tags(player_match.group(1))
        age_text = strip_tags(age_match.group(1))
        age_match_num = re.match(r"\s*(\d{1,2})", age_text)
        if not name or not age_match_num:
            continue
        age = int(age_match_num.group(1))
        if valid_age(age):
            rows.append({"name": name, "age": age})
    # Standard Stats can appear more than once; de-duplicate deterministically.
    unique = {}
    for row in rows:
        unique.setdefault(normalize_player_name(row["name"]), row)
    return list(unique.values())


def match_candidate(player: dict, candidates: list[dict], implicit_team: bool = False) -> tuple[dict | None, str]:
    target_name = normalize_player_name(player.get("name"))
    target_team = normalize_team(player.get("team"))
    exact = [c for c in candidates if normalize_player_name(c.get("name")) == target_name]
    if not implicit_team:
        exact = [c for c in exact if normalize_team(c.get("team")) == target_team]
    if len(exact) == 1:
        return exact[0], "normalized_name_team"
    if len(exact) > 1:
        return None, "ambiguous"
    abbreviated = [c for c in candidates if abbreviated_name_matches(player.get("name"), c.get("name"))]
    if not implicit_team:
        abbreviated = [c for c in abbreviated if normalize_team(c.get("team")) == target_team]
    if len(abbreviated) == 1:
        return abbreviated[0], "abbreviated_name_team"
    if len(abbreviated) > 1:
        return None, "ambiguous"
    return None, "unmatched"


def parse_transfermarkt_search(page_html: str) -> list[dict]:
    candidates = []
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", page_html, re.I | re.S):
        links = re.findall(r'<a[^>]+href="([^"]*/profil/spieler/\d+[^"]*)"[^>]*>(.*?)</a>', row, re.I | re.S)
        if not links:
            continue
        href, label = links[0]
        name = strip_tags(label)
        if not name:
            continue
        text = strip_tags(row)
        candidates.append({
            "name": name,
            "teamText": text,
            "profileUrl": urljoin("https://www.transfermarkt.it", href.split("?")[0]),
        })
    unique = {}
    for item in candidates:
        unique.setdefault(item["profileUrl"], item)
    return list(unique.values())


def select_transfermarkt_candidate(player: dict, candidates: list[dict]) -> tuple[dict | None, str]:
    target_team = normalize_team(player.get("team"))
    enriched = []
    for candidate in candidates:
        text_key = normalize_team(candidate.get("teamText"))
        if target_team and target_team not in text_key:
            continue
        enriched.append({**candidate, "team": player.get("team")})
    return match_candidate(player, enriched, implicit_team=False)


def parse_transfermarkt_profile(page_html: str) -> tuple[int | None, str | None]:
    text = strip_tags(page_html)
    # Italian and English variants both expose date + age near this label.
    match = re.search(
        r"(?:Data di nascita/Età|Date of birth/Age)\s*:?\s*(\d{2}/\d{2}/\d{4}|[A-Z][a-z]{2} \d{1,2}, \d{4}|\d{1,2} [A-Z][a-z]{2} \d{4})\s*\((\d{1,2})\)",
        text,
        re.I,
    )
    if match:
        dob, age = match.group(1), int(match.group(2))
        return (age if valid_age(age) else age_from_dob(dob), iso_dob(dob))
    dob_match = re.search(r"(\d{2}/\d{2}/\d{4})", text)
    if dob_match:
        dob = dob_match.group(1)
        return age_from_dob(dob), iso_dob(dob)
    return None, None


def load_cache(path: Path = OUTPUT_PATH) -> dict[str, dict]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    rows = payload.get("players", payload) if isinstance(payload, dict) else payload
    return {str(row.get("id")): row for row in rows if isinstance(row, dict) and row.get("id") and valid_age(row.get("age"))}


def record(player: dict, age: int, source: str, source_url: str, matched_by: str, dob: str | None = None) -> dict:
    return {
        "id": player.get("id"),
        "name": player.get("name"),
        "team": player.get("team"),
        "age": int(age),
        "dateOfBirth": dob,
        "source": source,
        "sourceUrl": source_url,
        "matchedBy": matched_by,
        "fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "status": "ok",
    }


def run(limit: int | None = None, sleep_seconds: float = 1.0, spike: bool = False) -> dict:
    players = json.loads(PLAYERS_PATH.read_text(encoding="utf-8"))
    missing = [p for p in players if p.get("age") is None]
    if limit:
        missing = missing[:limit]
    cache = load_cache()
    unresolved = [p for p in missing if str(p.get("id")) not in cache]
    diagnostics = {"unmatched": [], "ambiguous": [], "errors": []}
    requests = {"fbref": 0, "transfermarkt": 0}

    team_urls = {}
    try:
        league_html = fetch(FBREF_SERIE_A)
        requests["fbref"] += 1
        team_urls = discover_fbref_team_urls(league_html)
    except Exception as exc:
        diagnostics["errors"].append({"source": "fbref", "scope": "league", "error": str(exc)})

    by_team = {}
    for player in unresolved:
        by_team.setdefault(normalize_team(player.get("team")), []).append(player)

    still_missing = []
    for team, team_players in by_team.items():
        url = team_urls.get(team)
        if not url:
            still_missing.extend(team_players)
            continue
        try:
            squad_html = fetch(url)
            requests["fbref"] += 1
            candidates = parse_fbref_squad(squad_html)
            for player in team_players:
                candidate, matched_by = match_candidate(player, candidates, implicit_team=True)
                if candidate and valid_age(candidate.get("age")):
                    cache[str(player["id"])] = record(player, candidate["age"], "fbref", url, matched_by)
                else:
                    still_missing.append(player)
                    if matched_by == "ambiguous":
                        diagnostics["ambiguous"].append({"name": player["name"], "team": player["team"], "source": "fbref"})
        except Exception as exc:
            diagnostics["errors"].append({"source": "fbref", "scope": team, "error": str(exc)})
            still_missing.extend(team_players)
        time.sleep(max(0.0, sleep_seconds))

    # Transfermarkt is intentionally per-player and only runs for unresolved FBref rows.
    for player in still_missing:
        search_url = TRANSFERMARKT_SEARCH.format(quote_plus(player.get("name") or ""))
        try:
            search_html = fetch(search_url)
            requests["transfermarkt"] += 1
            candidates = parse_transfermarkt_search(search_html)
            candidate, matched_by = select_transfermarkt_candidate(player, candidates)
            if not candidate:
                target = diagnostics["ambiguous"] if matched_by == "ambiguous" else diagnostics["unmatched"]
                target.append({"name": player["name"], "team": player["team"], "source": "transfermarkt"})
                continue
            profile_html = fetch(candidate["profileUrl"])
            requests["transfermarkt"] += 1
            age, dob = parse_transfermarkt_profile(profile_html)
            if not valid_age(age):
                diagnostics["unmatched"].append({"name": player["name"], "team": player["team"], "source": "transfermarkt", "reason": "invalid age"})
                continue
            cache[str(player["id"])] = record(player, age, "transfermarkt", candidate["profileUrl"], matched_by, dob)
        except Exception as exc:
            diagnostics["errors"].append({"source": "transfermarkt", "scope": player.get("name"), "error": str(exc)})
        time.sleep(max(0.0, sleep_seconds))

    rows = sorted(cache.values(), key=lambda r: (normalize_team(r.get("team")), normalize_player_name(r.get("name"))))
    counts = {
        "fbref": sum(r.get("source") == "fbref" for r in rows),
        "transfermarkt": sum(r.get("source") == "transfermarkt" for r in rows),
    }
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "primarySource": "fbref",
        "fallbackSource": "transfermarkt",
        "requests": requests,
        "counts": counts,
        "diagnostics": diagnostics,
        "players": rows,
    }
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"missingInput": len(missing), "resolvedCachedTotal": len(rows), "counts": counts, "requests": requests, "diagnostics": {k: len(v) for k, v in diagnostics.items()}}, ensure_ascii=False))
    if spike:
        print("Spike decision: FBref primary because one team request yields the whole squad; Transfermarkt remains per-player fallback.")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--sleep", type=float, default=1.0)
    parser.add_argument("--spike", action="store_true")
    args = parser.parse_args()
    run(limit=args.limit, sleep_seconds=args.sleep, spike=args.spike)


if __name__ == "__main__":
    main()
