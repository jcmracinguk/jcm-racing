"""Read-only football-data.org quality audit. No selections or raw data storage."""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

PLAYOFF_STAGES = {"PLAYOFFS", "PLAY_OFFS", "SEMI_FINALS", "FINAL"}
STATUSES = {"SCHEDULED", "TIMED", "IN_PLAY", "PAUSED", "FINISHED",
            "SUSPENDED", "POSTPONED", "CANCELLED", "AWARDED"}


def audit(payload, league, season, now, team_count):
    """Return aggregate counts only; any structural issue blocks analysis."""
    matches = payload.get("matches")
    if not isinstance(matches, list) or not matches:
        raise ValueError("Missing match list")
    issues = Counter()
    ids, pairs, teams, stages, statuses = Counter(), Counter(), set(), Counter(), Counter()
    regular = finished = usable = pending = overdue = 0
    historical = season < (now.year if now.month >= 7 else now.year - 1)
    for m in matches:
        try:
            mid = m["id"]
            if type(mid) is not int or mid <= 0:
                raise ValueError()
            ids[mid] += 1
            if m["competition"]["code"] != league:
                issues["competition mismatch"] += 1
            if not m["season"]["startDate"].startswith(f"{season}-"):
                issues["season mismatch"] += 1
            stage = m.get("stage")
            if stage == "REGULAR_SEASON":
                stages["REGULAR_SEASON"] += 1
            elif league == "ELC" and stage in PLAYOFF_STAGES:
                stages[stage] += 1
                continue
            else:
                stages["UNKNOWN"] += 1
                issues["unrecognised stage"] += 1
                continue
            regular += 1
            home, away = m["homeTeam"]["id"], m["awayTeam"]["id"]
            if any(type(t) is not int or t <= 0 for t in (home, away)) or home == away:
                raise ValueError()
            teams.update((home, away))
            pairs[(home, away)] += 1
            date = datetime.fromisoformat(m["utcDate"].replace("Z", "+00:00"))
            if date.tzinfo is None:
                raise ValueError()
            status = m["status"]
            if status not in STATUSES:
                issues["unknown status"] += 1
                statuses["UNKNOWN"] += 1
            else:
                statuses[status] += 1
            if not season <= date.year <= season + 1:
                issues["date outside season years"] += 1
            if status == "FINISHED":
                finished += 1
                score = m.get("score", {})
                ft = score.get("fullTime") or {}
                valid = all(type(ft.get(side)) is int and ft[side] >= 0
                            for side in ("home", "away"))
                if not valid:
                    issues["finished without valid score"] += 1
                if score.get("duration") != "REGULAR":
                    issues["non-regular score duration"] += 1
                if date >= now:
                    issues["finished before kick-off"] += 1
                if valid and score.get("duration") == "REGULAR" and date < now:
                    usable += 1
            else:
                pending += 1
                if date < now - timedelta(hours=6):
                    overdue += 1
                if historical:
                    issues["historical unresolved match"] += 1
        except (KeyError, TypeError, ValueError, AttributeError):
            issues["malformed record"] += 1
    expected = team_count * (team_count - 1)
    if regular != expected:
        issues["regular fixture count mismatch"] += 1
    if len(teams) != team_count:
        issues["team count mismatch"] += 1
    duplicate_ids = sum(n - 1 for n in ids.values() if n > 1)
    duplicate_pairs = sum(n - 1 for n in pairs.values() if n > 1)
    missing_pairs = sum((h, a) not in pairs for h in teams for a in teams if h != a)
    if duplicate_ids:
        issues["duplicate match IDs"] += duplicate_ids
    if duplicate_pairs:
        issues["duplicate home-away pairings"] += duplicate_pairs
    if missing_pairs:
        issues["missing home-away pairings"] += missing_pairs
    if overdue:
        issues["overdue unresolved matches require review"] += overdue
    return dict(league=league, season=season, returned=len(matches), regular=regular,
                excluded=sum(v for k, v in stages.items() if k in PLAYOFF_STAGES),
                teams=len(teams), finished=finished, usable=usable, pending=pending,
                duplicate_ids=duplicate_ids, duplicate_pairs=duplicate_pairs,
                missing_pairs=missing_pairs, stages=dict(stages), statuses=dict(statuses),
                issues=dict(issues), passed=not issues)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    token = os.environ.get("FOOTBALL_DATA_TOKEN", "").strip()
    if not token:
        sys.exit("Missing FOOTBALL_DATA_TOKEN repository secret")
    now = datetime.now(ZoneInfo("Europe/London"))
    year = now.year if now.month >= 7 else now.year - 1
    opener = urllib.request.build_opener(NoRedirect)
    reports, calls, failed = [], 0, False
    for league, team_count in (("PL", 20), ("ELC", 24)):
        for season in range(year, year - 4, -1):
            if calls:
                time.sleep(7)
            calls += 1
            request = urllib.request.Request(
                f"https://api.football-data.org/v4/competitions/{league}/matches?season={season}",
                headers={"X-Auth-Token": token, "Accept": "application/json",
                         "User-Agent": "JCM-Football-Quality-Audit/1.0"})
            try:
                with opener.open(request, timeout=20) as response:
                    if response.status != 200:
                        raise ValueError()
                    payload = json.load(response)
                reports.append(audit(payload, league, season, now, team_count))
                del payload
            except urllib.error.HTTPError as error:
                reports.append(dict(league=league, season=season, error=f"HTTP {error.code}"))
                failed = True
                break
            except Exception:
                # Never print provider bodies, exception details, team IDs or credentials.
                reports.append(dict(league=league, season=season, error="Network/schema failure"))
                failed = True
                break
        if failed:
            break
    lines = ["# Football data quality audit", "", f"Europe/London: {now.isoformat(timespec='seconds')}",
             "Football data provided by the Football-Data.org API.",
             f"Requests: {calls}/8. No retries, purchases, selections or raw data storage.", "",
             "| League | Season | Regular fixtures | Excluded play-offs | Teams | Usable results | Pending | Duplicate IDs | Duplicate pairings | Missing pairings | Audit |",
             "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|"]
    for r in reports:
        label = f"{r['league']} {r['season']}/{str(r['season'] + 1)[-2:]}"
        if "error" in r:
            lines.append(f"\n{label}: {r['error']}; audit incomplete.")
            continue
        values = [r['league'], str(r['season']), *(str(r[k]) for k in (
            'regular', 'excluded', 'teams', 'usable', 'pending', 'duplicate_ids',
            'duplicate_pairs', 'missing_pairs')), 'PASS' if r['passed'] else 'REVIEW']
        lines.append('| ' + ' | '.join(values) + ' |')
    for r in reports:
        if 'error' in r:
            continue
        lines += ['', f"## {r['league']} {r['season']} detail",
                  'Stage counts: ' + json.dumps(r['stages'], sort_keys=True),
                  'Regular-season status counts: ' + json.dumps(r['statuses'], sort_keys=True),
                  'Issues: ' + json.dumps(r['issues'], sort_keys=True)]
    lines += ['', 'PASS checks internal structural consistency, not independent official verification.',
              'Only REGULAR_SEASON results with REGULAR duration can enter the trial.',
              'No backtest, predictions, odds, raw fixture records or app updates were produced.']
    output = '\n'.join(lines) + '\n'
    print(output)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as handle:
            handle.write(output)
    return int(failed or len(reports) != 8 or any(not r.get('passed') for r in reports))


if __name__ == '__main__':
    sys.exit(main())
