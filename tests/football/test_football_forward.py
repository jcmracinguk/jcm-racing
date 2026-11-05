import copy
import unittest
from datetime import datetime
from unittest.mock import patch

import football_forward as forward

CUTOFF = datetime.fromisoformat('2026-11-05T18:00:00+00:00')


def fixture(i, date, status='FINISHED', stage='REGULAR_SEASON'):
    return dict(id=i, utcDate=date, stage=stage, status=status,
                homeTeam={'id': 1, 'name': 'Synthetic home'},
                awayTeam={'id': 2, 'name': 'Synthetic away'},
                score={'duration': 'REGULAR', 'fullTime': {'home': 1, 'away': 1}})


class ForwardTests(unittest.TestCase):
    def test_weekend_london_dates(self):
        self.assertEqual(tuple(str(d) for d in forward.weekend(CUTOFF)), ('2026-11-06', '2026-11-08'))

    def test_six_hour_buffer_and_future_exclusion(self):
        data = {'matches': [fixture(1, '2026-11-04T20:00:00Z'),
                            fixture(2, '2026-11-05T15:00:00Z'),
                            fixture(3, '2026-11-06T20:00:00Z')]}
        self.assertEqual([m.id for m in forward.inputs(data, CUTOFF)], [1])

    def test_weekend_only_future_scheduled_regular_matches(self):
        data = {'matches': [fixture(1, '2026-11-04T20:00:00Z'),
                            fixture(2, '2026-11-06T20:00:00Z', 'TIMED'),
                            fixture(3, '2026-11-07T15:00:00Z', 'POSTPONED'),
                            fixture(4, '2026-11-09T20:00:00Z', 'TIMED'),
                            fixture(5, '2026-11-08T15:00:00Z', 'TIMED', 'FINAL')]}
        with patch.object(forward.model, 'decide', return_value=dict(eligible=True, qualified=True, reasons=[], rank_score=.8)):
            r = forward.screen(data, CUTOFF)
        self.assertEqual((r['screened'], r['unavailable'], r['eligible']), (2, 1, 1))
        self.assertEqual([c['fixture_id'] for c in r['candidates']], [2])
        self.assertIsNone(r['candidates'][0]['odds'])
        self.assertFalse(r['candidates'][0]['rank_is_probability'])

    def test_real_sample_gate_produces_no_forced_pick(self):
        r = forward.screen({'matches': [fixture(1, '2026-11-07T15:00:00Z', 'TIMED')]}, CUTOFF)
        self.assertEqual(r['candidates'], [])
        self.assertEqual(r['eligible'], 0)

    def test_target_score_is_never_an_input(self):
        data = {'matches': [fixture(1, '2026-11-04T20:00:00Z'), fixture(2, '2026-11-07T15:00:00Z', 'TIMED')]}
        changed = copy.deepcopy(data)
        changed['matches'][1]['score'] = {'fullTime': {'home': 99, 'away': 0}}
        self.assertEqual(forward.screen(data, CUTOFF), forward.screen(changed, CUTOFF))


if __name__ == '__main__':
    unittest.main()
