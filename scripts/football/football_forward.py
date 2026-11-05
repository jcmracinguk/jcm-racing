"""Limited derived weekend screen; no raw data storage, odds or real bets."""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timedelta

import football_backtest as model
import football_audit as quality
from football_holdout import verify_frozen, FROZEN_COMMIT, CONFIG_HASH


def weekend(now):
    friday = now.date() + timedelta(days=4-now.weekday())
    return friday, friday + timedelta(days=2)


def inputs(payload, cutoff):
    past = []
    for m in payload['matches']:
        if m.get('stage') != 'REGULAR_SEASON' or m.get('status') != 'FINISHED':
            continue
        dt = datetime.fromisoformat(m['utcDate'].replace('Z', '+00:00'))
        # No invented final-whistle timestamp: six-hour conservative buffer.
        if dt <= cutoff - timedelta(hours=6):
            past.append(m)
    return model.parse_matches({'matches': past})


def screen(payload, cutoff):
    history = inputs(payload, cutoff)
    by_id = {m.id: m for m in history}
    contexts = defaultdict(list)
    for a in model.assessments(history):
        m = by_id[a['id']]
        contexts[m.home].append(a['features']['away_overall'])
        contexts[m.away].append(a['features']['home_overall'])
    n = len(history)
    base = dict(league_n=n, league_btts=sum(m.btts for m in history)/n if n else None,
                league_home_scoring=sum(m.hg > 0 for m in history)/n if n else None,
                league_away_scoring=sum(m.ag > 0 for m in history)/n if n else None)
    start, end = weekend(cutoff)
    qualified, reasons = [], Counter()
    examined = eligible = unavailable = 0
    for fixture in payload['matches']:
        if fixture.get('stage') != 'REGULAR_SEASON':
            continue
        kickoff = datetime.fromisoformat(fixture['utcDate'].replace('Z', '+00:00')).astimezone(model.LONDON)
        if not start <= kickoff.date() <= end or kickoff <= cutoff:
            continue
        examined += 1
        if fixture['status'] not in {'SCHEDULED', 'TIMED'}:
            unavailable += 1
            continue
        home, away = fixture['homeTeam']['id'], fixture['awayTeam']['id']
        f = dict(base, home_overall=model.stats(history, home), away_overall=model.stats(history, away),
                 home_split=model.stats(history, home, 'home'), away_split=model.stats(history, away, 'away'),
                 home_opponent_context=model.context_summary(contexts[home]),
                 away_opponent_context=model.context_summary(contexts[away]))
        d = model.decide(f)
        eligible += d['eligible']
        reasons.update(d['reasons'])
        if d['qualified']:
            qualified.append(dict(fixture_id=fixture['id'], home=fixture['homeTeam']['name'],
                                  away=fixture['awayTeam']['name'], kickoff=kickoff.isoformat(),
                                  market='BTTS YES (90 minutes plus stoppage time)',
                                  rank_score=d['rank_score'], rank_is_probability=False,
                                  features=f, odds=None, priced=False,
                                  news_status='Injuries, suspensions and line-ups not yet verified',
                                  status='candidate_for_review'))
    qualified.sort(key=lambda x: (-x['rank_score'], x['fixture_id']))
    return dict(screened=examined, eligible=eligible, unavailable=unavailable,
                exclusion_reasons=dict(reasons), baseline=base, candidates=qualified)


def main():
    try:
        verify_frozen()
    except Exception:
        sys.exit('Frozen model verification failed; no provider requests made.')
    token = os.environ.get('FOOTBALL_DATA_TOKEN', '').strip()
    if not token:
        sys.exit('Missing FOOTBALL_DATA_TOKEN')
    cutoff = datetime.now(model.LONDON).replace(microsecond=0)
    year = cutoff.year if cutoff.month >= 7 else cutoff.year-1
    opener = urllib.request.build_opener(quality.NoRedirect)
    sources, results = [], {}
    try:
        for league, teams in (('PL', 20), ('ELC', 24)):
            if sources:
                time.sleep(7)
            request = urllib.request.Request(
                f'https://api.football-data.org/v4/competitions/{league}/matches?season={year}',
                headers={'X-Auth-Token': token, 'Accept': 'application/json', 'User-Agent': 'JCM-Paper-Screen/1.0'})
            with opener.open(request, timeout=20) as response:
                if response.status != 200:
                    raise ValueError()
                payload = json.load(response)
            observed = datetime.now(model.LONDON).isoformat(timespec='seconds')
            if not quality.audit(payload, league, year, cutoff, teams)['passed']:
                sys.exit(f'{league}: quality audit failed; no candidates published.')
            sources.append(dict(league=league, season=year, observed_at=observed,
                                endpoint=f'/v4/competitions/{league}/matches?season={year}',
                                payload_sha256=model.digest(payload)))
            results[league] = screen(payload, cutoff)
            del payload
    except urllib.error.HTTPError as error:
        sys.exit(f'HTTP {error.code}; stopped without retry or partial shortlist.')
    except Exception:
        sys.exit('Network/schema error; stopped without raw responses or partial shortlist.')
    start, end = weekend(cutoff)
    record = dict(schema_version=1, purpose='football_paper_candidate_screen',
                  cutoff=cutoff.isoformat(), weekend_start=start.isoformat(), weekend_end=end.isoformat(),
                  timing_note='One-off early screen requested 5 November; not the default Friday-noon batch.',
                  model_version='btts-v1', frozen_model_commit=FROZEN_COMMIT, config_sha256=CONFIG_HASH,
                  collector_commit=os.environ.get('GITHUB_SHA'), sources=sources, leagues=results,
                  odds_status='Unpriced: accuracy only; no P/L', approved_selections=[])
    lines = ['# Weekend BTTS paper candidate screen', '', 'Football data provided by the Football-Data.org API.',
             f'Cutoff Europe/London: {cutoff.isoformat()}', f'Weekend: {start} through {end}.',
             'Early snapshot; candidates are not yet approved/frozen selections. No app publication or schedule.',
             'Only limited derived candidates are shown. No raw result/fixture feed is stored.', '',
             '| League | Weekend matches | Sample eligible | Qualifiers |', '|---|---:|---:|---:|']
    for league, result in results.items():
        lines.append(f'| {league} | {result["screened"]} | {result["eligible"]} | {len(result["candidates"])} |')
    lines += ['', 'DERIVED_SCREEN_JSON_BEGIN', json.dumps(record, sort_keys=True), 'DERIVED_SCREEN_JSON_END']
    output = '\n'.join(lines)+'\n'
    print(output)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as h:
            h.write(output)
    return 0


if __name__ == '__main__':
    sys.exit(main())
