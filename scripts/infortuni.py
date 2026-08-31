"""Shared injury snapshot, matching and change-detection domain logic."""
from __future__ import annotations

import re
import unicodedata
from collections import defaultdict


def normalize_name(value):
    value = unicodedata.normalize("NFKD", str(value or ""))
    value = "".join(c for c in value if not unicodedata.combining(c)).casefold()
    value = re.sub(r"[\u2010-\u2015\-\u2018\u2019'\"`]+", " ", value)
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", value)).strip()


def abbreviated_name_matches(scraped_name, db_name):
    """Match Fantacalcio initials (for example ``Sulemana K.``) safely."""
    scraped, db = normalize_name(scraped_name).split(), normalize_name(db_name).split()
    return len(scraped) == len(db) and all(
        left == right or (len(left) == 1 and right.startswith(left))
        for left, right in zip(scraped, db)
    )


def match_injuries(injuries, players):
    by_id = {str(p["id"]): p for p in players}
    by_name, by_name_team = defaultdict(list), defaultdict(list)
    for player in players:
        name, team = normalize_name(player.get("name")), normalize_name(player.get("team"))
        by_name[name].append(player)
        by_name_team[(name, team)].append(player)
    diagnostics = {"matched": 0, "unmatched": [], "ambiguous": []}
    for row in injuries:
        candidates, method = [], None
        if row.get("id") is not None and str(row["id"]) in by_id:
            candidates, method = [by_id[str(row["id"])]], "ID"
        if not candidates:
            key = (normalize_name(row.get("name")), normalize_name(row.get("team")))
            candidates = by_name_team.get(key, [])
            method = "NAME_TEAM"
        if not candidates and row.get("team"):
            team = normalize_name(row["team"])
            candidates = [p for p in players if normalize_name(p.get("team")) == team
                          and abbreviated_name_matches(row.get("name"), p.get("name"))]
            method = "ABBREVIATED_NAME_TEAM"
        if not candidates:
            candidates = by_name.get(normalize_name(row.get("name")), [])
            method = "NAME"
        if len(candidates) == 1:
            player_id = str(candidates[0]["id"])
            row.update({"matchStatus": "MATCHED", "matchedPlayerId": player_id,
                        "playerId": player_id, "matched": True, "matchMethod": method})
            diagnostics["matched"] += 1
        elif len(candidates) > 1:
            row.update({"matchStatus": "AMBIGUOUS", "matchedPlayerId": None,
                        "playerId": None, "matched": False, "matchMethod": None})
            item = {"name": row.get("name"), "team": row.get("team"), "candidateIds": [str(p["id"]) for p in candidates],
                    "candidateNames": [p.get("name") for p in candidates]}
            diagnostics["ambiguous"].append(item)
        else:
            row.update({"matchStatus": "UNMATCHED", "matchedPlayerId": None,
                        "playerId": None, "matched": False, "matchMethod": None})
            team_players = [p for p in players if normalize_name(p.get("team")) == normalize_name(row.get("team"))]
            surname = normalize_name(row.get("name")).split()[:1]
            likely = [p.get("name") for p in team_players if surname and normalize_name(p.get("name")).split()[:1] == surname]
            diagnostics["unmatched"].append({"name": row.get("name"), "team": row.get("team"),
                                               "candidateNames": likely, "sourceUrl": row.get("sourceUrl")})
    return diagnostics


def injury_key(row):
    return str(row.get("matchedPlayerId") or row.get("id") or f"{normalize_name(row.get('name'))}|{normalize_name(row.get('team'))}")


def compare_snapshots(old_rows, new_rows, updated_at):
    old, new = {injury_key(r): r for r in old_rows}, {injury_key(r): r for r in new_rows}
    changes = []
    for key, row in new.items():
        previous = old.get(key)
        if previous is None:
            kind = "NEW_INJURY"
        elif previous.get("injury") != row.get("injury"):
            kind = "INJURY_UPDATED"
        elif previous.get("expectedReturn") != row.get("expectedReturn"):
            kind = "RETURN_UPDATED"
        else:
            kind = "UNCHANGED"
        changes.append({"type": kind, "name": row.get("name"), "team": row.get("team"), "before": previous, "after": row})
    for key, row in old.items():
        if key not in new:
            changes.append({"type": "RECOVERED", "name": row.get("name"), "team": row.get("team"), "before": row, "after": None})
    counts = {kind: sum(c["type"] == kind for c in changes) for kind in ("NEW_INJURY", "RECOVERED", "INJURY_UPDATED", "RETURN_UPDATED", "UNCHANGED")}
    return {"updatedAt": updated_at, "currentInjuries": len(new_rows), "newInjuries": counts["NEW_INJURY"],
            "recovered": counts["RECOVERED"], "injuryUpdated": counts["INJURY_UPDATED"],
            "returnUpdated": counts["RETURN_UPDATED"], "unchanged": counts["UNCHANGED"], "changes": changes}


def apply_snapshot(players, injuries):
    """Replace every status: absence from this complete snapshot always means OK."""
    matched = {str(r["matchedPlayerId"]): r for r in injuries if r.get("matchStatus") == "MATCHED"}
    for player in players:
        row = matched.get(str(player["id"]))
        player["status"] = "OK" if row is None else " · ".join(filter(None, [row.get("injury"), f"Rientro: {row['expectedReturn']}" if row.get("expectedReturn") else None]))
    return players
