import contextlib
import io
import json
import os
import unittest
from unittest.mock import patch

import football_holdout as holdout

ENV = dict(GITHUB_REPOSITORY='jcmracinguk/jcm-racing', GITHUB_EVENT_NAME='workflow_dispatch',
           GITHUB_RUN_ATTEMPT='1', GH_TOKEN='GITHUB-PRIVATE', FOOTBALL_DATA_TOKEN='FOOTBALL-PRIVATE',
           GITHUB_STEP_SUMMARY='')


class Reply(io.BytesIO):
    status = 200


class Opener:
    def __init__(self, count=0):
        self.count = count
        self.requests = []

    def open(self, req, timeout):
        self.requests.append(req)
        if req.full_url.startswith('https://api.github.com/'):
            return Reply(json.dumps(dict(total_count=self.count, workflow_runs=[{}] if self.count else [])).encode())
        return Reply(json.dumps(dict(matches=[dict(id=1, stage='REGULAR_SEASON', status='FINISHED',
            utcDate='2025-09-01T12:00:00Z', homeTeam={'id': 1}, awayTeam={'id': 2},
            score={'duration': 'REGULAR', 'fullTime': {'home': 1, 'away': 1}})])).encode())


class HoldoutTests(unittest.TestCase):
    def test_evaluated_model_hashes_match(self):
        holdout.verify_frozen()

    def test_changed_config_blocks(self):
        with patch.dict(holdout.model.CONFIG, min_team=11):
            with self.assertRaises(ValueError):
                holdout.verify_frozen()

    def test_successful_prior_run_blocks(self):
        opener = Opener(count=1)
        with patch.dict(os.environ, ENV), self.assertRaises(ValueError):
            holdout.first_success_only(opener)
        self.assertEqual(len(opener.requests), 1)

    def test_rerun_attempt_blocks_before_network(self):
        opener = Opener()
        with patch.dict(os.environ, dict(ENV, GITHUB_RUN_ATTEMPT='2')), self.assertRaises(ValueError):
            holdout.first_success_only(opener)
        self.assertEqual(opener.requests, [])

    def test_manual_only(self):
        opener = Opener()
        with patch.dict(os.environ, dict(ENV, GITHUB_EVENT_NAME='schedule')), self.assertRaises(ValueError):
            holdout.first_success_only(opener)
        self.assertEqual(opener.requests, [])

    def test_both_leagues_same_reserved_season_and_secrets_scoped(self):
        opener, output = Opener(), io.StringIO()
        with patch.dict(os.environ, ENV), patch('sys.argv', ['test']), \
                patch('urllib.request.build_opener', return_value=opener), patch('time.sleep'), \
                patch.object(holdout.quality, 'audit', return_value=dict(passed=True, excluded=0)), \
                contextlib.redirect_stdout(output):
            self.assertEqual(holdout.main(), 0)
        self.assertEqual(len(opener.requests), 3)
        github, pl, elc = opener.requests
        self.assertIn('Authorization', github.headers)
        self.assertNotIn('X-auth-token', github.headers)
        for req in (pl, elc):
            self.assertNotIn('Authorization', req.headers)
            self.assertEqual(req.headers['X-auth-token'], 'FOOTBALL-PRIVATE')
            self.assertTrue(req.full_url.endswith('season=2025'))
        self.assertIn('/PL/', pl.full_url)
        self.assertIn('/ELC/', elc.full_url)
        self.assertNotIn('FOOTBALL-PRIVATE', output.getvalue())
        self.assertNotIn('GITHUB-PRIVATE', output.getvalue())

    def test_existing_success_never_requests_provider(self):
        opener = Opener(count=1)
        with patch.dict(os.environ, ENV), patch('sys.argv', ['test']), \
                patch('urllib.request.build_opener', return_value=opener), self.assertRaises(SystemExit):
            holdout.main()
        self.assertEqual(len(opener.requests), 1)

    def test_failed_quality_never_opens_evaluation(self):
        opener = Opener()
        with patch.dict(os.environ, ENV), patch('sys.argv', ['test']), \
                patch('urllib.request.build_opener', return_value=opener), \
                patch.object(holdout.quality, 'audit', return_value=dict(passed=False)), \
                patch.object(holdout.model, 'evaluate') as evaluate, self.assertRaises(SystemExit):
            holdout.main()
        evaluate.assert_not_called()


if __name__ == '__main__':
    unittest.main()
