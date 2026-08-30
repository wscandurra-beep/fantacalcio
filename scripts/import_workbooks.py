#!/usr/bin/env python3
"""Dependency-free, deterministic importer for the committed OOXML sources."""

import csv
import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET

M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
ROOT = Path(__file__).resolve().parents[1]

# Characters such as ``ø`` and ``ł`` are letters in Unicode, but unlike
# accented vowels they are not decomposed by NFKD.  The Fantacalcio list uses
# their plain Italian/ASCII spellings, so transliterate them before stripping
# combining marks.
PLAYER_NAME_TRANSLITERATION = str.maketrans({
    "Ø": "O", "ø": "o", "Ł": "L", "ł": "l", "Đ": "D", "đ": "d",
    "Ð": "D", "ð": "d", "Þ": "Th", "þ": "th", "Æ": "Ae", "æ": "ae",
    "Œ": "Oe", "œ": "oe", "ß": "ss", "ẞ": "SS", "Ħ": "H", "ħ": "h",
    "ı": "i", "Ŧ": "T", "ŧ": "t",
})


def normalize_player_name(value):
    """Return a conservative, reusable key for a player name.

    Word boundaries are retained so that distinct names are not accidentally
    joined. Apostrophes and hyphens are treated as separators, while other
    punctuation is removed after Unicode decomposition and accent stripping.
    """
    if not value:
        return ""
    value = str(value).translate(PLAYER_NAME_TRANSLITERATION)
    value = unicodedata.normalize("NFKD", value)
    value = "".join(char for char in value if not unicodedata.combining(char))
    value = value.casefold()
    value = re.sub(r"[\u2010-\u2015\u2212\-]+", " ", value)
    value = re.sub(r"['\u2018\u2019\u201a\u201b\u2032\u0060\u00b4\"\u201c\u201d\u201e\u201f]+", " ", value)
    value = re.sub(r"[^\w\s]", " ", value, flags=re.UNICODE)
    return re.sub(r"\s+", " ", value).strip()


def column(ref):
    number = 0
    for char in re.match("[A-Z]+", ref).group():
        number = number * 26 + ord(char) - 64
    return number - 1


def sheet_rows(path, sheet):
    with ZipFile(path) as archive:
        shared = []
        if "xl/sharedStrings.xml" in archive.namelist():
            for item in ET.fromstring(archive.read("xl/sharedStrings.xml")):
                shared.append("".join(text.text or "" for text in item.iter(M + "t")))
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        targets = {item.attrib["Id"]: item.attrib["Target"] for item in relationships}
        target = next(
            targets[item.attrib[R + "id"]]
            for item in workbook.find(M + "sheets")
            if item.attrib["name"] == sheet
        )
        result = []
        for row in ET.fromstring(archive.read("xl/" + target)).iter(M + "row"):
            values = {}
            for cell in row.findall(M + "c"):
                node = cell.find(M + "v")
                value = None
                if cell.attrib.get("t") == "s" and node is not None:
                    value = shared[int(node.text)]
                elif cell.attrib.get("t") == "inlineStr":
                    value = "".join(text.text or "" for text in cell.iter(M + "t"))
                elif node is not None:
                    value = node.text
                values[column(cell.attrib["r"])] = value
            if values:
                result.append([values.get(index) for index in range(max(values) + 1)])
        return result


def records(path, sheet, header_row):
    rows = sheet_rows(path, sheet)
    headers = rows[header_row - 1]
    return [
        {header: (row[index] if index < len(row) else None) for index, header in enumerate(headers) if header}
        for row in rows[header_row:]
        if row and row[0]
    ]


def statistics_player_records(path):
    """Read the CSV-shaped rows embedded in Statistiche_Giocatori.xlsx."""
    rows = sheet_rows(path, "Sheet1")
    parsed = [next(csv.reader([row[0]])) for row in rows if row and row[0]]
    headers = parsed[1]
    return [dict(zip(headers, row)) for row in parsed[2:] if len(row) > 1 and row[1]]


def numeric(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def age_number(value):
    """Convert values such as FBref's ``22-226`` age to a whole-year age."""
    match = re.match(r"^\s*(\d{1,3})(?:\D|$)", str(value or ""))
    return int(match.group(1)) if match else None


def abbreviated_name_matches(short_name, full_name):
    """Match list names such as ``Martinez Jo.`` to full statistical names.

    The auction workbook mostly uses a surname, optionally followed by a short
    given-name prefix.  Requiring an exact token as well as matching every
    remaining token keeps this fallback conservative; team and uniqueness are
    checked separately by :func:`enrich_player_ages`.
    """
    short_tokens = normalize_player_name(short_name).split()
    full_tokens = normalize_player_name(full_name).split()
    if not short_tokens or not set(short_tokens).intersection(full_tokens):
        return False
    return all(
        any(token == full_token or (len(token) <= 3 and full_token.startswith(token))
            for full_token in full_tokens)
        for token in short_tokens
    )


def enrich_player_ages(players, statistic_rows):
    """Safely enrich players and return serializable matching diagnostics."""
    by_name = defaultdict(list)
    for player in players:
        by_name[normalize_player_name(player.get("name"))].append(player)

    ambiguous = []
    unmatched = []
    matched_ids = set()
    for row in statistic_rows:
        name = row.get("Player")
        team = normalize_player_name(row.get("Squad"))
        candidates = by_name.get(normalize_player_name(name), [])
        if len(candidates) != 1:
            team_candidates = [
                player for player in players
                if normalize_player_name(player.get("team")) == team
                and abbreviated_name_matches(player.get("name"), name)
            ]
            if len(team_candidates) == 1:
                candidates = team_candidates
        if len(candidates) == 1:
            age = age_number(row.get("Age"))
            if age is not None:
                candidates[0]["age"] = age
                matched_ids.add(candidates[0]["id"])
        elif len(candidates) > 1:
            ambiguous.append({
                "name": name,
                "team": row.get("Squad"),
                "candidateIds": [player["id"] for player in candidates],
            })
        else:
            unmatched.append({"name": name, "team": row.get("Squad")})

    missing = [p for p in players if p.get("age") is None]
    return {
        "ageMatched": len(matched_ids),
        "ageMissing": len(missing),
        "ambiguousCount": len(ambiguous),
        "unmatchedCount": len(unmatched),
        "ambiguous": ambiguous,
        "unmatched": unmatched,
        "missingPlayers": [{"name": p["name"], "team": p["team"]} for p in missing],
    }


def category(roles_value):
    roles = {role.strip().lower() for role in (roles_value or "").split(";")}
    categories = []
    for category_name, applies in [
        ("POR", "por" in roles), ("DC", "dc" in roles), ("E", "e" in roles),
        ("C", bool(roles & {"c", "m"})), ("WA", bool(roles & {"w", "a", "t"})),
        ("PC", "pc" in roles),
    ]:
        if applies:
            categories.append(category_name)
    return categories[-1] if categories else None


def import_data(root=ROOT):
    quotations = records(root / "Quotazioni_Fantacalcio_Stagione_2026_27.xlsx", "Tutti", 2)
    statistics = {row["Id"]: row for row in records(root / "Statistiche_Fantacalcio_Stagione_2026_27.xlsx", "Tutti", 2)}
    cups = {row[1]: row[0] for row in sheet_rows(root / "Stat_Figures_2025.xlsx", "Coppe")[1:] if len(row) > 1 and row[1]}
    injuries = {row[0]: row for row in sheet_rows(root / "Stat_Figures_2025.xlsx", "Infortuni (GPT)")[1:] if row and row[0] != "n/a"}
    pros_cons = {row[0]: row for row in sheet_rows(root / "Stat_Figures_2025.xlsx", "Pro_Contro")[1:] if row and row[0]}
    players = []
    for row in quotations:
        stats = statistics.get(row["Id"], {})
        injury = injuries.get(row["Id"])
        prose = pros_cons.get(row["Id"])
        auction = numeric(row.get("FVM M")) or numeric(row.get("FVM")) or 0
        quote = numeric(row.get("Qt.A M")) or numeric(row.get("Qt.A")) or 0
        players.append({
            "id": row["Id"], "name": row["Nome"], "team": row["Squadra"], "roles": row["RM"],
            "rankingCategory": category(row["RM"]), "auctionValue": auction, "quotation": quote,
            "hypeFactor": round(auction / quote, 2) if quote else None, "cups": cups.get(row["Squadra"], ""),
            "age": None, "avgPg": None, "avgMf": None, "actPg": numeric(stats.get("Pv")), "actMf": numeric(stats.get("Fm")),
            "status": "OK" if not injury else f"Infortunato · Rientro: {injury[3]}",
            "pro": prose[5] if prose and len(prose) > 5 else None, "contro": prose[6] if prose and len(prose) > 6 else None,
        })
    quality = enrich_player_ages(players, statistics_player_records(root / "Statistiche_Giocatori.xlsx"))
    (root / "data/players.json").write_text(json.dumps(players, ensure_ascii=False, separators=(",", ":")))
    (root / "data/import-quality.json").write_text(json.dumps(quality, ensure_ascii=False, indent=2))
    print(f'Imported {len(players)} players; {quality["ageMatched"]} ages matched; {quality["ageMissing"]} ages missing; {quality["ambiguousCount"]} ambiguous; {quality["unmatchedCount"]} unmatched source rows')
    return players, quality


if __name__ == "__main__":
    import_data()
