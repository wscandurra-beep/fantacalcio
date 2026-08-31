#!/usr/bin/env python3
"""Atomically refresh injuries from Fantacalcio's aggregate Serie A page."""
from __future__ import annotations

import argparse, json, re, sys, time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from infortuni import apply_snapshot, compare_snapshots, match_injuries

ROOT = Path(__file__).resolve().parents[1]
URL = "https://www.fantacalcio.it/infortunati-serie-a"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0 Safari/537.36"


class InjuryParser(HTMLParser):
    """Parse the team header and its following ``ul.unstyled`` directly."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows, self.teams = [], []
        self.item_names = 0
        self.team = None
        self.capture_team = False
        self.team_parts = []
        self.ul_depth = 0
        self.li_depth = 0
        self.current = None
        self.field = None

    def handle_starttag(self, tag, attrs):
        classes = set(dict(attrs).get("class", "").split())
        if tag == "span" and "team-name" in classes:
            self.capture_team, self.team_parts = True, []
        if tag == "ul" and "unstyled" in classes:
            self.ul_depth = 1
        elif self.ul_depth:
            self.ul_depth += 1
        if tag == "li" and self.ul_depth and not self.li_depth:
            self.li_depth = 1
            self.current = {"team": self.team, "name": "", "description": "",
                            "injury": "", "expectedReturn": None, "sourceUrl": URL}
        elif self.li_depth and tag != "li":
            self.li_depth += 1
        if self.current and tag == "strong" and "item-name" in classes:
            self.field = "name"
            self.item_names += 1
        elif self.current and tag == "div" and "item-description" in classes:
            self.field = "description"

    def handle_data(self, data):
        if self.capture_team:
            self.team_parts.append(data)
        if self.current and self.field:
            self.current[self.field] += " " + data

    def handle_endtag(self, tag):
        if tag == "span" and self.capture_team:
            self.team = normalize_whitespace("".join(self.team_parts))
            if self.team:
                self.teams.append(self.team)
            self.capture_team = False
        if self.li_depth:
            self.li_depth -= 1
            if self.li_depth == 0:
                self.current["name"] = normalize_whitespace(self.current["name"])
                self.current["description"] = normalize_whitespace(self.current["description"])
                self.current["injury"] = self.current["description"]
                if self.current["team"] and self.current["name"] and self.current["description"]:
                    self.rows.append(self.current)
                self.current = None
            self.field=None
        if self.ul_depth:
            self.ul_depth -= 1


def normalize_whitespace(value):
    return re.sub(r"\s+", " ", value or "").strip()


def parse_page(raw):
    parser=InjuryParser(); parser.feed(raw)
    return parser.rows


def validate_page(raw, rows):
    if not raw.strip(): raise ValueError("pagina vuota")
    parser=InjuryParser(); parser.feed(raw)
    if not parser.teams: raise ValueError("nessun span.team-name trovato")
    if not parser.item_names: raise ValueError("nessun strong.item-name trovato")
    if not rows: raise ValueError("0 giocatori estratti: struttura infortuni non trovata")
    team_count=len(set(parser.teams))
    if not 18 <= team_count <= 22: raise ValueError(f"numero squadre incompatibile con la Serie A: {team_count}")
    incomplete=sum(not r.get("name") or not r.get("injury") for r in rows)
    if incomplete or len({(r.get('name'),r.get('team')) for r in rows}) != len(rows): raise ValueError("parsing incompleto o duplicato")
    return team_count


def fetch(timeout, retries):
    headers={"User-Agent":USER_AGENT,"Accept":"text/html,application/xhtml+xml","Accept-Language":"it-IT,it;q=0.9","Referer":"https://www.fantacalcio.it/","Cache-Control":"no-cache"}
    last=None
    for attempt in range(retries+1):
        try:
            with urlopen(Request(URL,headers=headers),timeout=timeout) as response:
                if response.status != 200: raise RuntimeError(f"HTTP status inatteso: {response.status}")
                return response.read().decode(response.headers.get_content_charset() or "utf-8", "replace")
        except (HTTPError,URLError,TimeoutError) as exc:
            last=exc
            if attempt<retries: time.sleep(1.5*2**attempt)
    raise RuntimeError(f"download fallito: {last}")


def refresh(raw, root=ROOT, fetched_at=None):
    fetched_at=fetched_at or datetime.now(timezone.utc).isoformat()
    rows=parse_page(raw); team_count=validate_page(raw,rows)
    players_path=root/"data/players.json"; snapshot_path=root/"data/infortuni.json"; update_path=root/"data/infortuni_update.json"
    players=json.loads(players_path.read_text(encoding="utf-8"))
    old_doc=json.loads(snapshot_path.read_text(encoding="utf-8")) if snapshot_path.exists() else {"injuries":[]}
    diagnostics=match_injuries(rows,players)
    for row in rows: row.update({"status":"ok","fetchedAt":fetched_at})
    summary=compare_snapshots(old_doc.get("injuries",[]),rows,fetched_at)
    summary.update({"teamsFound":team_count,"playersScraped":len(rows),
                    "matched":diagnostics["matched"],"unmatched":len(diagnostics["unmatched"]),"ambiguous":len(diagnostics["ambiguous"]),
                    "missingExpectedReturn":sum(r.get("expectedReturn") is None for r in rows),"unmatchedRecords":diagnostics["unmatched"],
                    "ambiguousRecords":diagnostics["ambiguous"],"result":"SUCCESS","errors":[]})
    snapshot={"source":URL,"fetchedAt":fetched_at,"injuries":rows}
    # No writes occur before every parse, validation, match and transformation succeeds.
    outputs={snapshot_path:snapshot,update_path:summary,players_path:apply_snapshot(players,rows)}
    for path,value in outputs.items():
        temporary=path.with_suffix(path.suffix+".tmp"); temporary.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding="utf-8"); temporary.replace(path)
    return snapshot,summary


def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--timeout",type=int,default=25); ap.add_argument("--retries",type=int,default=2); ap.add_argument("--input")
    args=ap.parse_args()
    try: raw=Path(args.input).read_text(encoding="utf-8") if args.input else fetch(args.timeout,args.retries); snapshot,summary=refresh(raw)
    except Exception as exc: print(f"ERRORE: snapshot preservato: {exc}",file=sys.stderr); return 1
    print(f"Teams found: {summary['teamsFound']}")
    print(f"Injured players scraped: {len(snapshot['injuries'])}")
    print(f"Matched: {summary['matched']}\nUnmatched: {summary['unmatched']}\nAmbiguous: {summary['ambiguous']}")
    for kind in ("unmatchedRecords", "ambiguousRecords"):
        for item in summary[kind]:
            print(f"{item.get('team')} | {item.get('name')} | {', '.join(item.get('candidateNames', [])) or '-'}")
    return 0

if __name__ == "__main__": raise SystemExit(main())
