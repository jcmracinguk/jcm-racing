"""Update only fresh-project selections from explicit Sporting Life full results."""
import argparse
import copy
import json
import re
import urllib.request
from decimal import Decimal, InvalidOperation
from fractions import Fraction
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
HOST = 'https://www.sportinglife.com'
SHORT_DISTANCES = {
    'nse': Decimal('0.05'), 'nose': Decimal('0.05'),
    'sh': Decimal('0.1'), 'short head': Decimal('0.1'),
    'hd': Decimal('0.2'), 'head': Decimal('0.2'),
    'snk': Decimal('0.25'), 'short neck': Decimal('0.25'),
    'nk': Decimal('0.3'), 'neck': Decimal('0.3'),
}


def normal(value):
    value = re.sub(r'\s*\((?:AW|IRE|GB|FR|USA|GER|DEN|AUS|NZ)\)\s*$', '', value, flags=re.I)
    return re.sub(r'[^a-z0-9]', '', value.lower())


def fetch(url):
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or parsed.hostname != 'www.sportinglife.com':
        raise ValueError('Unexpected source host')
    request = urllib.request.Request(url, headers={'User-Agent': 'JCM-Results-Checker/1.0', 'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(request, timeout=25) as response:
        if urlsplit(response.url).hostname != parsed.hostname:
            raise ValueError('Unexpected redirect')
        html = response.read(5_000_000).decode('utf-8')
    scripts = re.findall(r'<script[^>]*>(.*?)</script>', html, re.S)
    for script in scripts:
        try:
            data = json.loads(script)
        except ValueError:
            continue
        if isinstance(data, dict) and 'pageProps' in data.get('props', {}):
            return data['props']['pageProps'], html
    raise ValueError('Sporting Life page structure unavailable')


def clean_distance(value):
    """Preserve Sporting Life's explicit margin while rejecting empty values."""
    if value is None:
        return None
    text = re.sub(r'\s+', ' ', str(value)).strip()
    return text or None


def distance_number(value):
    """Convert standard racing margins to lengths solely for cumulative display."""
    text = clean_distance(value)
    if text is None:
        return None
    lowered = text.lower()
    if lowered in SHORT_DISTANCES:
        return SHORT_DISTANCES[lowered]
    replacements = {'¼': ' 1/4', '½': ' 1/2', '¾': ' 3/4'}
    for symbol, fraction in replacements.items():
        text = text.replace(symbol, fraction)
    try:
        total = sum((Fraction(part) for part in text.split()), Fraction(0))
        value = Decimal(total.numerator) / Decimal(total.denominator)
    except (ValueError, ZeroDivisionError, InvalidOperation):
        return None
    return value if value >= 0 else None


def display_number(value):
    text = format(value.normalize(), 'f')
    return text.rstrip('0').rstrip('.') if '.' in text else text


def margins(rides, selected, winners):
    """Return verified adjacent margins plus the selected horse's cumulative deficit."""
    finishers = sorted(
        (r for r in rides if str(r.get('finish_position', '')).isdigit() and int(r['finish_position']) >= 1),
        key=lambda r: int(r['finish_position']),
    )
    cumulative = Decimal('0')
    cumulative_known = True
    all_margins = []
    selected_beaten = None
    for runner in finishers:
        position = int(runner['finish_position'])
        raw = None if position == 1 else clean_distance(runner.get('finish_distance'))
        if position > 1:
            amount = distance_number(raw)
            if amount is None:
                cumulative_known = False
            elif cumulative_known:
                cumulative += amount
        beaten = '0' if position == 1 else (display_number(cumulative) if cumulative_known else None)
        all_margins.append({
            'position': str(position),
            'horse': runner['horse']['name'],
            'margin_from_previous': raw,
            'cumulative_beaten_lengths': beaten,
        })
        if runner is selected and position > 1:
            selected_beaten = beaten
    if len(winners) > 1:
        winning = 'dh'
    else:
        runner_up = next((item for item in all_margins if item['position'] == '2'), None)
        winning = runner_up['margin_from_previous'] if runner_up else None
    return winning, selected_beaten, all_margins


def result(row, page, url, now):
    race = page['race']
    summary = race['race_summary']
    ref = str(summary['race_summary_reference']['id'])
    path = urlsplit(url).path
    if not re.fullmatch(r'/racing/results/' + re.escape(row['race_date']) + r'/[a-z0-9-]+/' + ref + r'/[a-z0-9-]+', path):
        raise ValueError('Result URL identity mismatch')
    # Sporting Life's embedded race_summary clock is UTC; stored off_time_uk
    # is Europe/London. Compare exact instants, never accept either clock or
    # apply a fixed one-hour tolerance (which could match the wrong race).
    scheduled = datetime.fromisoformat(row['scheduled_off_dt'])
    if scheduled.tzinfo is None or scheduled.utcoffset() is None:
        raise ValueError('Scheduled off must include a timezone')
    local = scheduled.astimezone(ZoneInfo('Europe/London'))
    source_off = datetime.strptime(summary['date'] + ' ' + summary['time'], '%Y-%m-%d %H:%M').replace(tzinfo=timezone.utc)
    if (local.date().isoformat() != row['race_date']
            or local.strftime('%H:%M') != row['off_time_uk']
            or source_off != scheduled.astimezone(timezone.utc)
            or normal(summary['course_name']) != normal(row['course'])):
        raise ValueError('Result race identity mismatch')
    if summary['race_stage'] != 'WEIGHEDIN':
        raise ValueError('Awaiting weighed-in full result')
    rides = race['rides']
    matches = [r for r in rides if normal(r['horse']['name']) == normal(row['horse'])]
    if len(matches) != 1:
        raise ValueError('Selected horse missing or ambiguous')
    ride = matches[0]
    non_runners = [r['horse']['name'] for r in rides if r.get('ride_status') in ('NONRUNNER', 'NON_RUNNER')]
    if ride.get('ride_status') in ('NONRUNNER', 'NON_RUNNER'):
        position, status = 'NR', 'NR'
    else:
        position = str(ride.get('finish_position', ''))
        if not position.isdigit() or int(position) < 1:
            raise ValueError('Non-numeric finish needs manual review; left pending')
        status = 'LOSS' if position == '1' else 'WIN'
    winners = [r['horse']['name'] for r in rides if r.get('finish_position') == 1 and r.get('ride_status') == 'RUNNER']
    if not winners:
        raise ValueError('Winner not explicit')
    stamp = now.isoformat().replace('+00:00', 'Z')
    winning_margin, selected_beaten, finish_margins = margins(rides, ride, winners)
    margin_data = dict(
        winning_margin_lengths=winning_margin,
        selected_beaten_lengths=selected_beaten,
        finish_margins=finish_margins,
        margin_source='SPORTING_LIFE',
        margin_source_url=url,
        margin_retrieved_at=stamp,
        margin_stage='WEIGHEDIN',
        margin_verification_status='WEBSITE_CONFIRMED',
    )
    update = dict(position=position, result_status=status, result_source='SPORTING_LIFE', verification_status='WEBSITE_CONFIRMED', official_accuracy_eligible=False,
                  result_date=row['race_date'], result_off_time_uk=row['off_time_uk'], result_course=row['course'], result_horse=row['horse'],
                  result_off_dt=row['scheduled_off_dt'], result_retrieved_at=stamp, result_race_id=row['race_id'], result_horse_id=row['horse_id'],
                  result_website_race_id=ref, result_source_url=url, result_non_runners=non_runners,
                  result_website_horse_id=str(ride['horse']['horse_reference']['id']), result_stage='WEIGHEDIN')
    update.update(margin_data)
    n = int(position) if position.isdigit() else 0
    suffix = 'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')
    update['placing'] = str(n) + suffix if n else position
    detail = dict(position=position, placing=update['placing'], result_status=status, winner=' / '.join(winners),
                  field_size=summary['ride_count'], results_url=url, race_name=summary['name'],
                  **margin_data)
    return update, detail


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--probe', action='store_true')
    parser.add_argument('--reconcile', action='store_true', help='Recheck the complete fresh project for settled margin details')
    args = parser.parse_args()
    now = datetime.now(timezone.utc)
    if args.probe:
        page, _ = fetch(HOST + '/racing/results/2026-10-27/newcastle/945555/sunday-lunch-at-the-border-minstrel-novices-limited-handicap-chase-gbb-race')
        sample = dict(race_date='2026-10-27', off_time_uk='14:31', course='Newcastle', horse='Silver Hill', race_id='rac_32302523266', horse_id='hrs_44975042', scheduled_off_dt='2026-10-27T14:31:00+00:00')
        update, _ = result(sample, page, HOST + '/racing/results/2026-10-27/newcastle/945555/sunday-lunch-at-the-border-minstrel-novices-limited-handicap-chase-gbb-race', now)
        assert update['position'] == '4'
        print('Sporting Life network probe passed: exact Silver Hill race, fourth, weighed in')
        return
    today = now.astimezone(ZoneInfo('Europe/London')).date()
    changes = 0
    pending = []
    issues = []
    for path in sorted((ROOT / 'data').glob('competition-research-*.json')):
        day = path.stem.removeprefix('competition-research-')
        earliest = '2026-10-21' if args.reconcile else str(today - timedelta(days=3))
        if day < earliest or day > str(today):
            continue
        research = json.loads(path.read_text())
        if not research['high_competition'] and not research['competition_watchlist']:
            continue
        details_path = ROOT / 'data' / f'result-card-details-{day}.json'
        builder_path = ROOT / 'data' / f'bet-builder-{day}.json'
        if not details_path.exists() or not builder_path.exists():
            issues.append(day + ': missing companion files')
            continue
        details = json.loads(details_path.read_text())
        builder = json.loads(builder_path.read_text())
        dirty = False
        links = None
        for row in research['high_competition'] + research['competition_watchlist']:
            off = datetime.fromisoformat(row['scheduled_off_dt'])
            if now < off + timedelta(minutes=15):
                continue
            # The daily sweep may enrich a settled fallback result, but never rewrites its outcome.
            fallback_settled = row.get('result_status') in ('WIN', 'LOSS', 'NR') and row.get('result_source') != 'SPORTING_LIFE'
            if fallback_settled and not args.reconcile:
                continue
            try:
                companions = [x for x in details['details'] if x['horse'] == row['horse'] and x['race_id'] == row['race_id'] and x['horse_id'] == row['horse_id'] and x['off_time_uk'] == row['off_time_uk'] and x['course'] == row['course']]
                booked = [x for x in builder['rows'] if all(x.get(k) == row.get(k) for k in ('horse', 'race_id', 'horse_id', 'race_date', 'course', 'off_time_uk', 'scheduled_off_dt'))]
                if len(companions) != 1 or len(booked) != 1:
                    raise ValueError('Companion identity mismatch')
                if links is None:
                    _, html = fetch(HOST + '/racing/results/' + day)
                    links = sorted(set(re.findall(r'href="(/racing/results/' + day + r'/[a-z0-9-]+/\d+/[a-z0-9-]+)"', html)))
                card = urlsplit(companions[0].get('racecard_url') or '')
                match = re.fullmatch(r'/racing/racecards/' + day + r'/([a-z0-9-]+)/racecard/(\d+)/[a-z0-9-]+', card.path)
                if card.hostname != 'www.sportinglife.com' or not match:
                    raise ValueError('Exact Sporting Life racecard not recorded')
                candidates = [link for link in links if link.split('/')[4:6] == list(match.groups())]
                if len(candidates) != 1:
                    raise ValueError('Full result link not available or ambiguous')
                url = HOST + candidates[0]
                page, _ = fetch(url)
                update, detail = result(row, page, url, now)
                margin_keys = ('winning_margin_lengths', 'selected_beaten_lengths', 'finish_margins', 'margin_source', 'margin_source_url', 'margin_stage', 'margin_verification_status')
                if fallback_settled:
                    if row.get('position') != update['position'] or row.get('result_status') != update['result_status']:
                        raise ValueError('Sporting Life conflicts with stored settled outcome; left unchanged')
                    if all(row.get(k) == update[k] for k in margin_keys) and all(companions[0].get(k) == detail[k] for k in margin_keys):
                        continue
                    margin_update = {k: update[k] for k in margin_keys + ('margin_retrieved_at',)}
                    row.update(margin_update)
                    booked[0].update(copy.deepcopy(margin_update))
                    companions[0].update(copy.deepcopy(margin_update))
                    companions[0].update({k: copy.deepcopy(detail[k]) for k in margin_keys})
                    dirty = True
                    changes += 1
                    print(day, row['horse'], 'verified margins reconciled')
                    continue
                comparison_keys = ('position', 'result_status', 'result_source_url', 'result_stage') + margin_keys
                if all(row.get(k) == update[k] for k in comparison_keys) and all(companions[0].get(k) == detail[k] for k in margin_keys):
                    continue
                old = {k: v for k, v in row.items() if k.startswith('result_') or k in ('position', 'placing', 'verification_status')}
                if row.get('result_source') == 'SPORTING_LIFE':
                    row.setdefault('result_history', []).append(old)
                    booked[0].setdefault('result_history', []).append(copy.deepcopy(old))
                row.update(update)
                booked[0].update(update)
                companions[0].update(update)
                companions[0].update(detail)
                dirty = True
                changes += 1
                print(day, row['horse'], update['placing'], update['result_status'])
            except (ValueError, KeyError, OSError) as error:
                message = str(error)
                expected_waits = (
                    'Full result link not available or ambiguous',
                    'Awaiting weighed-in full result',
                    'Non-numeric finish needs manual review; left pending',
                    'Winner not explicit',
                )
                item = day + ' ' + row['horse'] + ': ' + message
                if isinstance(error, OSError) or message in expected_waits:
                    pending.append(item)
                else:
                    issues.append(item)
        if dirty and args.write:
            for target, data in ((path, research), (details_path, details), (builder_path, builder)):
                target.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')
    print(f'{changes} supported changes; write={args.write}')
    for item in pending:
        print('PENDING:', item)
    for issue in issues:
        print('ERROR:', issue)
    if issues:
        raise SystemExit(1)


if __name__ == '__main__':
    main()


