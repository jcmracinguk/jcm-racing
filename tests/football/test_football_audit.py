"""Synthetic records only; no provider data or network access."""
import copy
import unittest
from datetime import datetime, timezone
from football_audit import audit

NOW = datetime(2026, 11, 5, 17, tzinfo=timezone.utc)


def fixture_set(league='PL', season=2025):
    return {'matches': [dict(
        id=100 + i, competition={'code': league},
        season={'startDate': f'{season}-08-01'}, stage='REGULAR_SEASON',
        homeTeam={'id': h}, awayTeam={'id': a},
        utcDate=f'{season}-09-01T12:00:00Z', status='FINISHED',
        score={'duration': 'REGULAR', 'fullTime': {'home': 1, 'away': 0}})
        for i, (h, a) in enumerate((h, a) for h in range(1, 5)
                                    for a in range(1, 5) if h != a)]}


class AuditTests(unittest.TestCase):
    def check(self, data, league='PL', season=2025):
        return audit(data, league, season, NOW, 4)

    def test_complete_schedule(self):
        r = self.check(fixture_set())
        self.assertTrue(r['passed'])
        self.assertEqual(r['usable'], 12)

    def test_playoffs_excluded_before_score_processing(self):
        data = fixture_set('ELC')
        for i, stage in enumerate(['SEMI_FINALS'] * 4 + ['FINAL']):
            m = copy.deepcopy(data['matches'][0])
            m.update(id=200+i, stage=stage)
            m['score']['duration'] = 'EXTRA_TIME'
            data['matches'].append(m)
        r = self.check(data, 'ELC')
        self.assertTrue(r['passed'])
        self.assertEqual((r['regular'], r['excluded'], r['usable']), (12, 5, 12))

    def test_missing_fixture(self):
        data = fixture_set()
        data['matches'].pop()
        self.assertEqual(self.check(data)['missing_pairs'], 1)

    def test_duplicate_replacing_missing_fixture(self):
        data = fixture_set()
        data['matches'][-1] = copy.deepcopy(data['matches'][0])
        r = self.check(data)
        self.assertFalse(r['passed'])
        self.assertEqual((r['duplicate_ids'], r['duplicate_pairs'], r['missing_pairs']), (1, 1, 1))

    def test_bool_is_not_a_goal_count(self):
        data = fixture_set()
        data['matches'][0]['score']['fullTime']['home'] = True
        r = self.check(data)
        self.assertEqual(r['usable'], 11)
        self.assertIn('finished without valid score', r['issues'])

    def test_extra_time_regular_match_blocked(self):
        data = fixture_set()
        data['matches'][0]['score']['duration'] = 'EXTRA_TIME'
        self.assertFalse(self.check(data)['passed'])

    def test_unknown_stage_not_assumed_regular(self):
        data = fixture_set()
        data['matches'][0]['stage'] = None
        self.assertIn('unrecognised stage', self.check(data)['issues'])

    def test_wrong_season_blocks(self):
        data = fixture_set()
        data['matches'][0]['season']['startDate'] = '2024-08-01'
        self.assertIn('season mismatch', self.check(data)['issues'])

    def test_future_finished_blocks(self):
        data = fixture_set(season=2026)
        data['matches'][0]['utcDate'] = '2027-01-01T12:00:00Z'
        self.assertIn('finished before kick-off', self.check(data, season=2026)['issues'])

    def test_current_future_pending_is_valid(self):
        data = fixture_set(season=2026)
        data['matches'][0].update(status='TIMED', utcDate='2027-01-01T12:00:00Z', score={})
        r = self.check(data, season=2026)
        self.assertTrue(r['passed'])
        self.assertEqual((r['usable'], r['pending']), (11, 1))

    def test_historical_unresolved_is_not_a_loss(self):
        data = fixture_set()
        data['matches'][0].update(status='POSTPONED', score={})
        r = self.check(data)
        self.assertFalse(r['passed'])
        self.assertEqual((r['usable'], r['pending']), (11, 1))

    def test_empty_data_blocks(self):
        with self.assertRaises(ValueError):
            self.check({'matches': []})


if __name__ == '__main__':
    unittest.main()
