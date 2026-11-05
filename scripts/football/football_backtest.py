"""btts-v1: chronological results-only research, never a probability estimate."""
import hashlib
import json
import math
import os
import sys
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, time as day_start
from itertools import groupby
from pathlib import Path
from statistics import median
from zoneinfo import ZoneInfo

from football_audit import NoRedirect, audit

LONDON = ZoneInfo('Europe/London')
CONFIG = dict(version='btts-v1', prior_weight=8, min_team=10, min_split=5,
              min_league=50, btts_margin=0.05, min_scoring=0.70,
              min_conceding=0.65, recent_games=6,
              cutoff='00:00 Europe/London on actual playing date',
              development_season=2023, validation_season=2024)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


@dataclass(frozen=True)
class Match:
    id: int
    kickoff: datetime
    home: int
    away: int
    hg: int
    ag: int

    @property
    def date(self):
        return self.kickoff.astimezone(LONDON).date()

    @property
    def btts(self):
        return self.hg > 0 and self.ag > 0


def parse_matches(payload):
    """Called only after quality audit; reject unresolved or non-normal-time scores."""
    result = []
    for m in payload['matches']:
        if m.get('stage') != 'REGULAR_SEASON':
            continue
        s = m.get('score') or {}
        ft = s.get('fullTime') or {}
        if m.get('status') != 'FINISHED' or s.get('duration') != 'REGULAR':
            raise ValueError('Only settled regular-season normal-time matches can be tested')
        if any(type(ft.get(side)) is not int or ft[side] < 0 for side in ('home', 'away')):
            raise ValueError('Invalid score')
        date = datetime.fromisoformat(m['utcDate'].replace('Z', '+00:00'))
        if date.tzinfo is None:
            raise ValueError('Missing timezone')
        result.append(Match(m['id'], date, m['homeTeam']['id'], m['awayTeam']['id'],
                            ft['home'], ft['away']))
    if len({m.id for m in result}) != len(result):
        raise ValueError('Duplicate match IDs')
    return sorted(result, key=lambda m: (m.kickoff, m.id))


def stats(matches, team, venue=None):
    rows = [m for m in matches if (m.home == team if venue == 'home' else
                                  m.away == team if venue == 'away' else
                                  team in (m.home, m.away))]
    gf = [m.hg if m.home == team else m.ag for m in rows]
    ga = [m.ag if m.home == team else m.hg for m in rows]
    points = sum(3 if f > a else 1 if f == a else 0 for f, a in zip(gf, ga))
    n = len(rows)
    out = dict(n=n, btts=sum(m.btts for m in rows), scoring=sum(g > 0 for g in gf),
               conceding=sum(g > 0 for g in ga), clean_sheets=sum(g == 0 for g in ga),
               failures_to_score=sum(g == 0 for g in gf), goals_for=sum(gf),
               goals_against=sum(ga), points=points)
    for name in ('btts', 'scoring', 'conceding', 'clean_sheets', 'failures_to_score'):
        out[name + '_rate'] = out[name] / n if n else None
    out['goals_for_per_game'] = sum(gf) / n if n else None
    out['goals_against_per_game'] = sum(ga) / n if n else None
    out['ppg'] = points / n if n else None
    recent = rows[-CONFIG['recent_games']:]
    out['recent_n'] = len(recent)
    out['recent_btts'] = sum(m.btts for m in recent)
    out['recent_btts_rate'] = out['recent_btts'] / len(recent) if recent else None
    return out


def shrink(count, n, baseline):
    return (count + CONFIG['prior_weight'] * baseline) / (n + CONFIG['prior_weight'])


def decide(features):
    """Pure screen: no score/outcome, fixture identity or future record is an input."""
    h, a = features['home_split'], features['away_split']
    reasons = []
    if features['league_n'] < CONFIG['min_league']:
        reasons.append('insufficient_league_games')
    if min(features['home_overall']['n'], features['away_overall']['n']) < CONFIG['min_team']:
        reasons.append('insufficient_team_games')
    if min(h['n'], a['n']) < CONFIG['min_split']:
        reasons.append('insufficient_venue_games')
    if reasons:
        return dict(eligible=False, qualified=False, reasons=reasons, rank_score=None)
    l, home_base, away_base = (features[k] for k in ('league_btts', 'league_home_scoring', 'league_away_scoring'))
    rank = (shrink(h['btts'], h['n'], l) + shrink(a['btts'], a['n'], l)) / 2
    if rank + 1e-12 < l + CONFIG['btts_margin']:
        reasons.append('below_btts_threshold')
    if (shrink(h['scoring'], h['n'], home_base) + 1e-12 < CONFIG['min_scoring'] or
            shrink(a['scoring'], a['n'], away_base) + 1e-12 < CONFIG['min_scoring']):
        reasons.append('below_scoring_threshold')
    if (shrink(h['conceding'], h['n'], away_base) + 1e-12 < CONFIG['min_conceding'] or
            shrink(a['conceding'], a['n'], home_base) + 1e-12 < CONFIG['min_conceding']):
        reasons.append('below_conceding_threshold')
    return dict(eligible=True, qualified=not reasons, reasons=reasons, rank_score=rank)


def context_summary(rows):
    usable = [r for r in rows if r['n'] >= 5]
    return dict(encounters=len(rows), with_five_prior_games=len(usable),
                median_ppg=median([r['ppg'] for r in usable]) if usable else None,
                median_scoring_rate=median([r['scoring_rate'] for r in usable]) if usable else None,
                median_conceding_rate=median([r['conceding_rate'] for r in usable]) if usable else None)


def assessments(matches):
    """Yield all screens in day batches, then add that day's results to history."""
    ordered = sorted(matches, key=lambda m: (m.kickoff, m.id))
    if len({m.id for m in ordered}) != len(ordered):
        raise ValueError('Duplicate IDs')
    history, contexts = [], defaultdict(list)
    for date, batch in groupby(ordered, key=lambda m: m.date):
        today = list(batch)
        cutoff = datetime.combine(date, day_start(), tzinfo=LONDON)
        assert all(m.kickoff < cutoff for m in history)
        n = len(history)
        baselines = dict(league_n=n, league_btts=sum(m.btts for m in history)/n if n else None,
                         league_home_scoring=sum(m.hg > 0 for m in history)/n if n else None,
                         league_away_scoring=sum(m.ag > 0 for m in history)/n if n else None)
        snapshots = {}
        # Freeze all team states BEFORE adding ANY same-day outcomes.
        for m in today:
            for team in (m.home, m.away):
                if team not in snapshots:
                    snapshots[team] = stats(history, team)
            f = dict(baselines, home_overall=snapshots[m.home], away_overall=snapshots[m.away],
                     home_split=stats(history, m.home, 'home'),
                     away_split=stats(history, m.away, 'away'),
                     home_opponent_context=context_summary(contexts[m.home]),
                     away_opponent_context=context_summary(contexts[m.away]))
            decision = decide(f)
            # Outcome is attached only AFTER the pure decision has been made.
            yield dict(id=m.id, cutoff=cutoff.isoformat(), features=f, **decision, outcome=m.btts)
        for m in today:
            contexts[m.home].append(snapshots[m.away])
            contexts[m.away].append(snapshots[m.home])
        history.extend(today)


def wilson(successes, total):
    if not total:
        return None
    z = 1.959963984540054
    p = successes / total
    denominator = 1 + z*z/total
    centre = (p + z*z/(2*total)) / denominator
    radius = z * math.sqrt(p*(1-p)/total + z*z/(4*total*total)) / denominator
    return max(0.0, centre-radius), min(1.0, centre+radius)


def evaluate(matches):
    result = dict(screened=0, eligible=0, qualified=0, successes=0, failures=0,
                  pending=0, void=0, baseline_successes=0, exclusion_reasons=Counter(),
                  threshold_reasons=Counter())
    for a in assessments(matches):
        result['screened'] += 1
        if a['eligible']:
            result['eligible'] += 1
            result['baseline_successes'] += a['outcome']
            if a['qualified']:
                result['qualified'] += 1
                result['successes' if a['outcome'] else 'failures'] += 1
            else:
                result['threshold_reasons'].update(a['reasons'])
        else:
            result['exclusion_reasons'].update(a['reasons'])
    result['excluded_sample'] = result['screened'] - result['eligible']
    result['excluded_threshold'] = result['eligible'] - result['qualified']
    result['interval'] = wilson(result['successes'], result['qualified'])
    result['baseline_interval'] = wilson(result['baseline_successes'], result['eligible'])
    return result


def rate(hits, n):
    return f'{100*hits/n:.1f}%' if n else 'N/A (no sample)'


def interval_text(interval):
    return f'{100*interval[0]:.1f}%–{100*interval[1]:.1f}%' if interval else 'N/A'


def main():
    # Intentionally NO season argument or holdout mode: reserve 2025/26.
    if len(sys.argv) != 1:
        sys.exit('No arguments accepted: this job runs only 2023/24 and 2024/25.')
    token = os.environ.get('FOOTBALL_DATA_TOKEN', '').strip()
    if not token:
        sys.exit('Missing FOOTBALL_DATA_TOKEN repository secret')
    now = datetime.now(LONDON)
    opener = urllib.request.build_opener(NoRedirect)
    batches, calls = [], 0
    try:
        for season, role in ((2023, 'Development'), (2024, 'Validation')):
            for league, teams in (('PL', 20), ('ELC', 24)):
                if calls:
                    time.sleep(7)
                calls += 1
                request = urllib.request.Request(
                    f'https://api.football-data.org/v4/competitions/{league}/matches?season={season}',
                    headers={'X-Auth-Token': token, 'Accept': 'application/json',
                             'User-Agent': 'JCM-Football-Backtest/1.0'})
                with opener.open(request, timeout=20) as response:
                    if response.status != 200:
                        raise ValueError('HTTP failure')
                    payload = json.load(response)
                quality = audit(payload, league, season, now, teams)
                if not quality['passed']:
                    sys.exit(f'{league} {season}: data audit failed; no backtest report published.')
                batches.append((league, season, role, parse_matches(payload), digest(payload), quality['excluded']))
                del payload
    except urllib.error.HTTPError as error:
        sys.exit(f'HTTP {error.code}; stopped without retries or partial performance claims.')
    except Exception:
        sys.exit('Network/schema failure; stopped without response bodies or partial performance claims.')
    # All four data audits must pass before calculating any historical results.
    config_hash = digest(CONFIG)
    code_hash = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    audit_hash = hashlib.sha256(Path(__file__).with_name('football_audit.py').read_bytes()).hexdigest()
    lines = ['# BTTS v1 historical development and validation', '',
             f'Observed Europe/London: {now.isoformat(timespec="seconds")}',
             'Football data provided by the Football-Data.org API.',
             '2025/26 HOLDOUT NOT REQUESTED OR EVALUATED. No forward selections.',
             'Chronological reconstruction using corrected historical results; not an archived live-feed replay.',
             'All regular-league playing days are tested, not a weekend-only forward trial.',
             'No BTTS odds: accuracy only; no profit, value or simulated return claims.', '',
             f'Configuration SHA256: {config_hash}', f'Model code SHA256: {code_hash}',
             f'Audit code SHA256: {audit_hash}',
             'GitHub source commit: ' + os.environ.get('GITHUB_SHA', 'local'), '',
             '| Phase | League | Season | Screened | Eligible | Qualified | BTTS YES | BTTS NO | Hit rate | 95% Wilson interval | All eligible BTTS |',
             '|---|---|---|---:|---:|---:|---:|---:|---|---|---|']
    detail, by_phase = [], defaultdict(list)
    for league, season, role, matches, source_hash, playoffs in batches:
        r = evaluate(matches)
        by_phase[role].append(r)
        lines.append(f'| {role} | {league} | {season}/{str(season+1)[-2:]} | '
                     f'{r["screened"]} | {r["eligible"]} | {r["qualified"]} | '
                     f'{r["successes"]} | {r["failures"]} | {rate(r["successes"],r["qualified"])} | '
                     f'{interval_text(r["interval"])} | {rate(r["baseline_successes"],r["eligible"])} |')
        detail += ['', f'## {role}: {league} {season}',
                   f'Sample exclusions: {r["excluded_sample"]}; eligible failing thresholds: {r["excluded_threshold"]}.',
                   'Sample reasons (may overlap): ' + json.dumps(r['exclusion_reasons'], sort_keys=True),
                   'Threshold reasons (may overlap): ' + json.dumps(r['threshold_reasons'], sort_keys=True),
                   f'Play-offs excluded: {playoffs}; pending: {r["pending"]}; void: {r["void"]}.',
                   f'All-eligible benchmark: {r["baseline_successes"]}/{r["eligible"]}; '
                   f'95% interval: {interval_text(r["baseline_interval"])}.',
                   'Source payload SHA256 (payload not retained): ' + source_hash]
    for phase, rs in by_phase.items():
        n, h = sum(r['qualified'] for r in rs), sum(r['successes'] for r in rs)
        eligible, baseline = sum(r['eligible'] for r in rs), sum(r['baseline_successes'] for r in rs)
        lines.append(f'| {phase} combined | Both | Separate seasons | '
                     f'{sum(r["screened"] for r in rs)} | {eligible} | {n} | {h} | {n-h} | '
                     f'{rate(h,n)} | {interval_text(wilson(h,n))} | {rate(baseline,eligible)} |')
    lines += detail + ['', 'Intervals describe hit-rate uncertainty; fixtures are not independent, so interpret cautiously.',
                       'The all-eligible baseline has a different fixture mix; any difference is descriptive, not proof of an edge.',
                       'All qualifying historical screens are counted; no losers deleted or historical prices invented.',
                       'No raw records, team identities, match identities or per-match provider data are published.',
                       'Re-fetches may contain provider corrections; source hashes identify changes but cannot restore an unsaved payload.',
                       'Freeze this run/configuration before a separate final holdout evaluation. Do not tune v1 using these results.']
    output = '\n'.join(lines) + '\n'
    print(output)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as handle:
            handle.write(output)
    return 0


if __name__ == '__main__':
    sys.exit(main())
