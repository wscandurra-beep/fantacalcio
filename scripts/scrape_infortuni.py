#!/usr/bin/env python3
"""Atomically refresh injuries from Fantacalcio's aggregate Serie A page."""
from __future__ import annotations

import argparse, html, json, re, subprocess, sys, time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen

from infortuni import apply_snapshot, compare_snapshots, match_injuries

ROOT = Path(__file__).resolve().parents[1]
URL = "https://www.fantacalcio.it/infortunati-serie-a"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0 Safari/537.36"


class InjuryParser(HTMLParser):
    """Parse cards using semantic data attributes, with common class-name aliases."""
    def __init__(self):
        super().__init__(convert_charrefs=True); self.rows=[]; self.current=None; self.field=None; self.depth=0
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs); classes=set(attrs.get("class", "").lower().split())
        if attrs.get("data-injury-player") is not None or classes & {"injury-player", "infortunato", "player-injury"}:
            self.current={"id": attrs.get("data-player-id"), "name":"", "team":"", "injury":"", "expectedReturn":None,
                          "sourceUrl":urljoin(URL, attrs.get("href", "")) or URL}; self.depth=1
        elif self.current:
            self.depth += 1
            marker = attrs.get("data-field", "").lower()
            if marker in {"name","team","injury","expectedreturn"}: self.field=marker
            elif classes & {"player-name","nome"}: self.field="name"
            elif classes & {"player-team","squadra"}: self.field="team"
            elif classes & {"injury-detail","infortunio","descrizione"}: self.field="injury"
            elif classes & {"expected-return","rientro"}: self.field="expectedreturn"
            if tag == "a" and attrs.get("href"):
                self.current["sourceUrl"] = urljoin(URL, attrs["href"])
                match=re.search(r"/(\d+)(?:[/?#]|$)", attrs["href"])
                if match: self.current["id"] = match.group(1)
    def handle_data(self, data):
        if self.current and self.field:
            key="expectedReturn" if self.field=="expectedreturn" else self.field
            self.current[key]=re.sub(r"\s+", " ", f"{self.current.get(key) or ''} {data}").strip() or None
    def handle_endtag(self, tag):
        if self.current:
            self.depth -= 1
            if self.depth == 0:
                if self.current.get("name") and self.current.get("injury"): self.rows.append(self.current)
                self.current=None
            self.field=None


def parse_page(raw):
    decoded=html.unescape(raw).replace(r"\u003c", "<").replace(r"\u003e", ">").replace(r'\"', '"').replace(r"\/", "/")
    parser=InjuryParser(); parser.feed(decoded)
    if parser.rows: return parser.rows
    # Next/JSON payload fallback: accept only explicit injury objects.
    rows=[]
    pattern=re.compile(r'\{[^{}]{0,2000}"(?:name|nome)"\s*:\s*"[^"}]+"[^{}]{0,2000}\}', re.I)
    for blob in pattern.findall(decoded):
        try: obj=json.loads(blob)
        except ValueError: continue
        lower={str(k).lower():v for k,v in obj.items()}
        injury=lower.get("injury") or lower.get("infortunio") or lower.get("description")
        name=lower.get("name") or lower.get("nome")
        if name and injury:
            rows.append({"id":lower.get("playerid") or lower.get("id"), "name":name, "team":lower.get("team") or lower.get("squadra"),
                         "injury":injury, "expectedReturn":lower.get("expectedreturn") or lower.get("rientro"), "sourceUrl":lower.get("url") or URL})
    return rows


def validate_page(raw, rows):
    text=html.unescape(re.sub(r"<[^>]+>", " ", raw)).lower()
    if not raw.strip(): raise ValueError("pagina vuota")
    if any(x in text for x in ("captcha", "access denied", "cloudflare ray id", "verify you are human")): raise ValueError("risposta anti-bot")
    if "fantacalcio" not in text and "fantacalcio" not in raw.lower(): raise ValueError("pagina inattesa: marker Fantacalcio assente")
    if not rows: raise ValueError("0 giocatori estratti: struttura infortuni non trovata")
    incomplete=sum(not r.get("name") or not r.get("injury") for r in rows)
    if incomplete or len({(r.get('name'),r.get('team')) for r in rows}) != len(rows): raise ValueError("parsing incompleto o duplicato")


def fetch(timeout, retries):
    headers={"User-Agent":USER_AGENT,"Accept":"text/html,application/xhtml+xml","Accept-Language":"it-IT,it;q=0.9","Referer":"https://www.fantacalcio.it/","Cache-Control":"no-cache"}
    last=None
    for attempt in range(retries+1):
        try:
            with urlopen(Request(URL,headers=headers),timeout=timeout) as response: return response.read().decode(response.headers.get_content_charset() or "utf-8", "replace")
        except (HTTPError,URLError,TimeoutError) as exc:
            last=exc
            proc=subprocess.run(["curl","-L","--fail","--silent","--show-error","--max-time",str(timeout),"-A",USER_AGENT,URL],capture_output=True,text=True)
            if proc.returncode == 0: return proc.stdout
            if attempt<retries: time.sleep(1.5*2**attempt)
    raise RuntimeError(f"download fallito: {last}")


def refresh(raw, root=ROOT, fetched_at=None):
    fetched_at=fetched_at or datetime.now(timezone.utc).isoformat()
    rows=parse_page(raw); validate_page(raw,rows)
    players_path=root/"data/players.json"; snapshot_path=root/"data/infortuni.json"; update_path=root/"data/infortuni_update.json"
    players=json.loads(players_path.read_text(encoding="utf-8"))
    old_doc=json.loads(snapshot_path.read_text(encoding="utf-8")) if snapshot_path.exists() else {"injuries":[]}
    diagnostics=match_injuries(rows,players)
    for row in rows: row.update({"status":"ok","fetchedAt":fetched_at})
    summary=compare_snapshots(old_doc.get("injuries",[]),rows,fetched_at)
    summary.update({"matched":diagnostics["matched"],"unmatched":len(diagnostics["unmatched"]),"ambiguous":len(diagnostics["ambiguous"]),
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
    print(f"Aggiornati {len(snapshot['injuries'])} infortunati; matched={summary['matched']} unmatched={summary['unmatched']} ambiguous={summary['ambiguous']}"); return 0

if __name__ == "__main__": raise SystemExit(main())
