import contextlib
import copy
import io
import json
import os
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from football_backtest import Match, assessments, decide, evaluate, main, parse_matches, shrink, stats, wilson


def match(i, date, home=1, away=2, hg=1, ag=1):
    return Match(i, datetime.fromisoformat(date.replace('Z', '+00:00')), home, away, hg, ag)


def features():
    return dict(league_n=100, league_btts=0.5, league_home_scoring=0.75,
                league_away_scoring=0.75, home_overall={'n': 10}, away_overall={'n': 10},
                home_split=dict(n=5, btts=4, scoring=4, conceding=4),
                away_split=dict(n=5, btts=4, scoring=4, conceding=4))


class ModelTests(unittest.TestCase):
    def test_frozen_rule_qualifies_known_case(self):
        d = decide(features())
        self.assertTrue(d['qualified'])
        self.assertAlmostEqual(d['rank_score'], 8/13)

    def test_sample_minimum_excludes_without_rank(self):
        f = features()
        f['away_split']['n'] = 4
        d = decide(f)
        self.assertFalse(d['eligible'])
        self.assertIsNone(d['rank_score'])

    def test_threshold_failure_is_eligible_but_not_qualified(self):
        f = features()
        f['home_split']['btts'] = f['away_split']['btts'] = 1
        d = decide(f)
        self.assertTrue(d['eligible'])
        self.assertFalse(d['qualified'])
        self.assertIn('below_btts_threshold', d['reasons'])

    def test_venue_baselines_have_correct_orientation(self):
        f = features()
        f.update(league_home_scoring=0.95, league_away_scoring=0.20)
        f['home_split'].update(scoring=5, conceding=5)
        f['away_split'].update(scoring=5, conceding=5)
        # Away scoring and home conceding shrink toward .20, below both gates.
        d = decide(f)
        self.assertIn('below_scoring_threshold', d['reasons'])
        self.assertIn('below_conceding_threshold', d['reasons'])

    def test_shrinkage_uses_fixed_eight_game_prior(self):
        self.assertAlmostEqual(shrink(4, 5, .5), 8/13)
        self.assertEqual(shrink(0, 0, .5), .5)

    def test_same_day_scores_do_not_enter_features(self):
        games = [match(1, '2024-08-01T12:00:00Z'),
                 match(2, '2024-08-01T20:00:00Z', away=3),
                 match(3, '2024-08-02T12:00:00Z')]
        a = list(assessments(games))
        self.assertEqual([x['features']['league_n'] for x in a], [0, 0, 2])
        self.assertEqual(a[2]['features']['home_overall']['n'], 2)

    def test_target_and_future_results_cannot_change_target_features(self):
        games = [match(i, f'2024-08-{i:02d}T12:00:00Z') for i in range(1, 16)]
        before = list(assessments(games))[10]
        changed = games[:10] + [match(11, '2024-08-11T12:00:00Z', hg=0, ag=0)] + [
            match(i, f'2024-08-{i:02d}T12:00:00Z', hg=9, ag=0) for i in range(12, 16)]
        after = list(assessments(changed))[10]
        self.assertEqual(before['features'], after['features'])
        self.assertEqual(before['qualified'], after['qualified'])
        self.assertNotEqual(before['outcome'], after['outcome'])

    def test_london_date_not_utc_date_controls_cutoff(self):
        # 23:30 UTC is already 00:30 BST on the target's London playing date.
        games = [match(1, '2024-08-01T23:30:00Z'), match(2, '2024-08-02T12:00:00Z')]
        a = list(assessments(games))
        self.assertEqual(a[1]['features']['league_n'], 0)
        self.assertEqual(a[1]['cutoff'], '2024-08-02T00:00:00+01:00')

    def test_input_order_does_not_change_results(self):
        games = [match(i, f'2024-08-{i:02d}T12:00:00Z') for i in range(1, 8)]
        self.assertEqual(list(assessments(games)), list(assessments(list(reversed(games)))))

    def test_opponent_context_is_from_before_the_earlier_game(self):
        games = [match(i, f'2024-08-{i:02d}T12:00:00Z', home=2, away=3) for i in range(1, 6)]
        games += [match(6, '2024-08-06T12:00:00Z', home=1, away=2),
                  match(7, '2024-08-07T12:00:00Z', home=2, away=3, hg=0, ag=9),
                  match(8, '2024-08-08T12:00:00Z', home=1, away=4)]
        a = list(assessments(games))[-1]['features']['home_opponent_context']
        self.assertEqual(a['with_five_prior_games'], 1)
        self.assertEqual(a['median_ppg'], 1)
        self.assertEqual(a['median_scoring_rate'], 1)

    def test_counts_include_failures(self):
        games = [match(1, '2024-08-01T12:00:00Z'), match(2, '2024-08-02T12:00:00Z', ag=0)]
        with patch('football_backtest.decide', return_value=dict(eligible=True, qualified=True,
                                                                 reasons=[], rank_score=.8)):
            r = evaluate(games)
        self.assertEqual((r['qualified'], r['successes'], r['failures']), (2, 1, 1))

    def test_zero_sample_interval_is_unavailable(self):
        self.assertIsNone(wilson(0, 0))
        lo, hi = wilson(5, 10)
        self.assertAlmostEqual(lo, .2366, places=3)
        self.assertAlmostEqual(hi, .7634, places=3)

    def test_stats_keep_counts_and_recent_denominators(self):
        games = [match(i, f'2024-08-{i:02d}T12:00:00Z', hg=1, ag=i % 2) for i in range(1, 9)]
        s = stats(games, 1, 'home')
        self.assertEqual((s['n'], s['btts'], s['recent_n'], s['recent_btts']), (8, 4, 6, 3))
        self.assertEqual((s['clean_sheets'], s['failures_to_score']), (4, 0))
        self.assertEqual(s['points'], 16)

    def test_duplicate_id_rejected(self):
        m = match(1, '2024-08-01T12:00:00Z')
        with self.assertRaises(ValueError):
            list(assessments([m, m]))

    def test_playoff_ignored_even_with_extra_time(self):
        self.assertEqual(parse_matches({'matches': [{'stage': 'FINAL', 'score': {'duration': 'EXTRA_TIME'}}]}), [])

    def test_no_holdout_override_argument(self):
        with patch('sys.argv', ['football_backtest.py', '2025']), patch('urllib.request.build_opener') as opener:
            with self.assertRaises(SystemExit):
                main()
            opener.assert_not_called()

    def test_missing_token_never_opens_network(self):
        with patch.dict(os.environ, {'FOOTBALL_DATA_TOKEN': ''}), patch('sys.argv', ['test']), patch('urllib.request.build_opener') as opener:
            with self.assertRaises(SystemExit):
                main()
            opener.assert_not_called()

    def test_network_runner_requests_only_development_and_validation(self):
        requested = []

        class Reply(io.BytesIO):
            status = 200

        class Opener:
            def open(self, request, timeout):
                requested.append(request.full_url)
                self.asserted = timeout
                league = request.full_url.split('/competitions/')[1].split('/')[0]
                year = int(request.full_url.split('season=')[1])
                body = dict(matches=[dict(id=1, stage='REGULAR_SEASON', status='FINISHED',
                    utcDate=f'{year}-09-01T12:00:00Z', homeTeam={'id': 1}, awayTeam={'id': 2},
                    score={'duration': 'REGULAR', 'fullTime': {'home': 1, 'away': 0}})])
                return Reply(json.dumps(body).encode())

        output = io.StringIO()
        # The structural auditor has its own independent tests. This test isolates
        # the real network orchestration and checks that the reserved season is absent.
        with patch.dict(os.environ, {'FOOTBALL_DATA_TOKEN': 'PRIVATE-SENTINEL', 'GITHUB_STEP_SUMMARY': ''}), \
                patch('sys.argv', ['test']), patch('urllib.request.build_opener', return_value=Opener()), \
                patch('time.sleep'), patch('football_backtest.audit', return_value={'passed': True, 'excluded': 0}), \
                contextlib.redirect_stdout(output):
            self.assertEqual(main(), 0)
        self.assertEqual(len(requested), 4)
        self.assertEqual({int(url.split('season=')[1]) for url in requested}, {2023, 2024})
        self.assertNotIn('PRIVATE-SENTINEL', output.getvalue())
        self.assertIn('HOLDOUT NOT REQUESTED OR EVALUATED', output.getvalue())

    def test_failed_audit_prevents_performance_report(self):
        class Reply(io.BytesIO):
            status = 200

        opener = unittest.mock.Mock()
        opener.open.return_value = Reply(b'{"matches": []}')
        with patch.dict(os.environ, {'FOOTBALL_DATA_TOKEN': 'PRIVATE-SENTINEL'}), \
                patch('sys.argv', ['test']), patch('urllib.request.build_opener', return_value=opener), \
                patch('football_backtest.audit', return_value={'passed': False}), \
                patch('football_backtest.evaluate') as evaluator:
            with self.assertRaises(SystemExit):
                main()
            evaluator.assert_not_called()


if __name__ == '__main__':
    unittest.main()
