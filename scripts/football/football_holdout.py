"""One final evaluation of both leagues using the immutable btts-v1 implementation."""
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

import football_audit as quality
import football_backtest as model

FROZEN_COMMIT = 'e3698abfd81366b277d36b6d5efc6146d56cc96d'
CONFIG_HASH = 'd2bb9ade1ef18aeb3f357a351b7325df9f317658d7de26592df804baaeaf82f6'
MODEL_HASH = '8ee361c87d75e841dfe21e7baa68b7f16f82ae200c077c55ef96f64838908924'
AUDIT_HASH = '6c915ed5bc9f7fb585fba44caedfb3b4f1c4cc5c40b9292c2e56ff840f25f497'
VALIDATION_RUN = 'https://github.com/jcmracinguk/jcm-racing/actions/runs/42071140151'
WORKFLOW = 'football-btts-holdout.yml'


def verify_frozen():
    if model.digest(model.CONFIG) != CONFIG_HASH:
        raise ValueError('Configuration changed')
    for module, expected in ((model, MODEL_HASH), (quality, AUDIT_HASH)):
        if hashlib.sha256(Path(module.__file__).read_bytes()).hexdigest() != expected:
            raise ValueError('Frozen implementation changed')


def first_success_only(opener):
    """Fail before provider access if this final evaluation already succeeded."""
    if os.environ.get('GITHUB_REPOSITORY') != 'jcmracinguk/jcm-racing':
        raise ValueError('Wrong repository')
    if os.environ.get('GITHUB_EVENT_NAME') != 'workflow_dispatch':
        raise ValueError('Manual dispatch required')
    if os.environ.get('GITHUB_RUN_ATTEMPT') != '1':
        raise ValueError('No holdout rerun attempts')
    token = os.environ.get('GH_TOKEN', '').strip()
    if not token:
        raise ValueError('Missing read-only GitHub token')
    request = urllib.request.Request(
        'https://api.github.com/repos/jcmracinguk/jcm-racing/actions/workflows/'
        + WORKFLOW + '/runs?event=workflow_dispatch&status=success&per_page=1',
        headers={'Authorization': 'Bearer ' + token,
                 'Accept': 'application/vnd.github+json', 'User-Agent': 'JCM-Holdout-Gate/1.0'})
    with opener.open(request, timeout=20) as response:
        if response.status != 200:
            raise ValueError('Unable to verify prior runs')
        prior = json.load(response)
    if not isinstance(prior.get('workflow_runs'), list) or type(prior.get('total_count')) is not int:
        raise ValueError('Invalid prior-run response')
    if prior['total_count'] or prior['workflow_runs']:
        raise ValueError('Final holdout already evaluated successfully; read the existing report')


def main():
    if len(sys.argv) != 1:
        sys.exit('This final test accepts no season, league or threshold overrides.')
    try:
        verify_frozen()
        opener = urllib.request.build_opener(quality.NoRedirect)
        first_success_only(opener)
    except Exception:
        sys.exit('Frozen-code or first-run safeguard did not pass; no football data requested.')
    token = os.environ.get('FOOTBALL_DATA_TOKEN', '').strip()
    if not token:
        sys.exit('Missing FOOTBALL_DATA_TOKEN; no football data requested.')
    now = datetime.now(model.LONDON)
    batches = []
    try:
        for league, teams in (('PL', 20), ('ELC', 24)):
            if batches:
                time.sleep(7)
            request = urllib.request.Request(
                f'https://api.football-data.org/v4/competitions/{league}/matches?season=2025',
                headers={'X-Auth-Token': token, 'Accept': 'application/json',
                         'User-Agent': 'JCM-Frozen-BTTS-Holdout/1.0'})
            with opener.open(request, timeout=20) as response:
                if response.status != 200:
                    raise ValueError('Unexpected status')
                payload = json.load(response)
            report = quality.audit(payload, league, 2025, now, teams)
            if not report['passed']:
                sys.exit(f'{league}: data audit did not pass; no final performance report produced.')
            batches.append((league, model.parse_matches(payload), model.digest(payload), report['excluded']))
            del payload
    except urllib.error.HTTPError as error:
        sys.exit(f'HTTP {error.code}; no retries or partial final performance report.')
    except Exception:
        sys.exit('Network/schema failure; no raw response or partial final performance report.')
    # Both data audits must pass before opening performance for either league.
    results = [(league, model.evaluate(matches), source_hash, excluded)
               for league, matches, source_hash, excluded in batches]
    lines = ['# BTTS v1 final holdout: 2025/26', '',
             f'Observed Europe/London: {now.isoformat(timespec="seconds")}',
             'Football data provided by the Football-Data.org API.',
             'Frozen model commit: ' + FROZEN_COMMIT, 'Configuration SHA256: ' + CONFIG_HASH,
             'Model SHA256: ' + MODEL_HASH, 'Audit SHA256: ' + AUDIT_HASH,
             'Prior development/validation report: ' + VALIDATION_RUN,
             'Both leagues evaluated unchanged. No league selection or threshold tuning.',
             'Chronological reconstruction; all regular-league playing days, not weekend-only.',
             'No verified historical BTTS prices: accuracy only, no profit or value claims.', '',
             '| League | Season | Screened | Eligible | Qualified | BTTS YES | BTTS NO | Hit rate | 95% Wilson interval | All eligible BTTS |',
             '|---|---|---:|---:|---:|---:|---:|---|---|---|']
    for league, r, source_hash, excluded in results:
        lines.append(f'| {league} | 2025/26 | {r["screened"]} | {r["eligible"]} | '
                     f'{r["qualified"]} | {r["successes"]} | {r["failures"]} | '
                     f'{model.rate(r["successes"],r["qualified"])} | '
                     f'{model.interval_text(r["interval"])} | '
                     f'{model.rate(r["baseline_successes"],r["eligible"])} |')
    n = sum(r['qualified'] for _, r, _, _ in results)
    h = sum(r['successes'] for _, r, _, _ in results)
    eligible = sum(r['eligible'] for _, r, _, _ in results)
    baseline = sum(r['baseline_successes'] for _, r, _, _ in results)
    lines.append(f'| Both | 2025/26 | {sum(r["screened"] for _,r,_,_ in results)} | '
                 f'{eligible} | {n} | {h} | {n-h} | {model.rate(h,n)} | '
                 f'{model.interval_text(model.wilson(h,n))} | {model.rate(baseline,eligible)} |')
    for league, r, source_hash, excluded in results:
        lines += ['', f'## {league} details',
                  f'Sample exclusions: {r["excluded_sample"]}; threshold exclusions: {r["excluded_threshold"]}.',
                  'Sample reasons (overlap possible): ' + json.dumps(r['exclusion_reasons'], sort_keys=True),
                  'Threshold reasons (overlap possible): ' + json.dumps(r['threshold_reasons'], sort_keys=True),
                  f'Excluded play-offs: {excluded}; pending: {r["pending"]}; void: {r["void"]}.',
                  f'All-eligible benchmark: {r["baseline_successes"]}/{r["eligible"]}; '
                  f'95% interval: {model.interval_text(r["baseline_interval"])}.',
                  'Source payload SHA256 (not retained): ' + source_hash]
    lines += ['', 'Different fixture mixes and dependence limit baseline and interval comparisons.',
              'All qualifying screens counted; no retrospective deletion of failures.',
              'Historical corrections/availability cannot be reconstructed exactly from today\'s feed.',
              'No raw fixtures retained or published. No forward selections or schedules enabled.',
              'The holdout is now evaluated: any later rule or league-choice change needs fresh forward evidence.']
    output = '\n'.join(lines) + '\n'
    print(output)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as handle:
            handle.write(output)
    return 0


if __name__ == '__main__':
    sys.exit(main())
