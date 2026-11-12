import copy
import importlib.util
import unittest
from datetime import datetime, timezone
from pathlib import Path
spec = importlib.util.spec_from_file_location('updater', Path(__file__).parents[1] / 'scripts/update_sporting_life_results.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class Results(unittest.TestCase):
    def setUp(self):
        self.row = dict(race_date='2026-10-27', off_time_uk='14:31', course='Newcastle', horse='Silver Hill', scheduled_off_dt='2026-10-27T14:31:00+00:00', race_id='rac_1', horse_id='hrs_1')
        self.url = 'https://www.sportinglife.com/racing/results/2026-10-27/newcastle/945555/test-race'
        self.page = {'race': {'race_summary': dict(date='2026-10-27', time='14:31', course_name='Newcastle', race_stage='WEIGHEDIN', race_summary_reference={'id':945555}, ride_count=4, name='Test'), 'rides': [dict(horse={'name':'Winner', 'horse_reference':{'id':1}},finish_position=1,ride_status='RUNNER'),dict(horse={'name':'Second', 'horse_reference':{'id':3}},finish_position=2,finish_distance='sh',ride_status='RUNNER'),dict(horse={'name':'Third', 'horse_reference':{'id':4}},finish_position=3,finish_distance='1 ¼',ride_status='RUNNER'),dict(horse={'name':'Silver Hill', 'horse_reference':{'id':2}},finish_position=4,finish_distance='nk',ride_status='RUNNER')]}}
    def parse(self):
        return m.result(self.row,self.page,self.url,datetime.now(timezone.utc))[0]
    def test_loss_success_and_nr(self):
        self.assertEqual(self.parse()['result_status'],'WIN')
        self.page['race']['rides'][3]['finish_position']=1
        self.assertEqual(self.parse()['result_status'],'LOSS')
        self.page['race']['rides'][3].update(ride_status='NONRUNNER',finish_position=0)
        self.assertEqual(self.parse()['result_status'],'NR')
    def test_wrong_date_time_course(self):
        for key,val in [('date','2026-10-26'),('time','14:32'),('course_name','Kempton')]:
            with self.subTest(key=key):
                p=copy.deepcopy(self.page);self.page['race']['race_summary'][key]=val
                with self.assertRaises(ValueError):self.parse()
                self.page=p
    def test_incomplete_and_missing_horse(self):
        self.page['race']['race_summary']['race_stage']='RESULT'
        with self.assertRaises(ValueError):self.parse()
        self.page['race']['race_summary']['race_stage']='WEIGHEDIN'
        self.page['race']['rides'].pop()
        with self.assertRaises(ValueError):self.parse()
    def test_stored_noncompletion_code_is_preserved_on_refresh(self):
        existing = [
            {'position':'1','horse':'Winner','margin_from_previous':None,'cumulative_beaten_lengths':'0'},
            {'position':'PU','horse':'Pulled Up','margin_from_previous':None,'cumulative_beaten_lengths':None},
        ]
        fresh = [{'position':'1','horse':'Winner','margin_from_previous':None,'cumulative_beaten_lengths':'0'}]
        merged = m.preserve_noncompletion_margins(existing, fresh)
        self.assertEqual(merged[-1]['position'], 'PU')
        self.assertEqual(merged[-1]['horse'], 'Pulled Up')
        self.assertEqual(len(merged), 2)

    def test_noncompletion_not_invented(self):
        self.page['race']['rides'][3]['finish_position']=0
        with self.assertRaises(ValueError):self.parse()

    def test_bst_source_utc_matches_exact_scheduled_instant(self):
        self.row.update(race_date='2026-10-24', off_time_uk='16:05',
                        scheduled_off_dt='2026-10-24T16:05:00+01:00')
        self.url = self.url.replace('2026-10-27', '2026-10-24')
        self.page['race']['race_summary'].update(date='2026-10-24', time='15:05')
        self.assertEqual(self.parse()['result_status'], 'WIN')

    def test_bst_local_clock_is_not_accepted_as_source_utc(self):
        self.row.update(race_date='2026-10-24', off_time_uk='16:05',
                        scheduled_off_dt='2026-10-24T16:05:00+01:00')
        self.url = self.url.replace('2026-10-27', '2026-10-24')
        self.page['race']['race_summary'].update(date='2026-10-24', time='16:05')
        with self.assertRaises(ValueError): self.parse()

    def test_stored_local_clock_must_agree_with_schedule(self):
        self.row['scheduled_off_dt'] = '2026-10-27T14:32:00+00:00'
        with self.assertRaises(ValueError): self.parse()

    def test_naive_schedule_is_rejected(self):
        self.row['scheduled_off_dt'] = '2026-10-27T14:31:00'
        with self.assertRaises(ValueError): self.parse()

    def test_verified_winning_and_cumulative_margins(self):
        update, detail = m.result(self.row,self.page,self.url,datetime.now(timezone.utc))
        self.assertEqual(update['winning_margin_lengths'], 'sh')
        self.assertEqual(update['selected_beaten_lengths'], '1.65')
        self.assertEqual(detail['finish_margins'][2]['cumulative_beaten_lengths'], '1.35')
        self.assertEqual(detail['margin_stage'], 'WEIGHEDIN')

    def test_unknown_margin_is_preserved_without_inventing_total(self):
        self.page['race']['rides'][2]['finish_distance'] = 'dist'
        update, detail = m.result(self.row,self.page,self.url,datetime.now(timezone.utc))
        self.assertIsNone(update['selected_beaten_lengths'])
        self.assertEqual(detail['finish_margins'][2]['margin_from_previous'], 'dist')

    def test_dead_heat_winning_margin(self):
        self.page['race']['rides'][1]['finish_position'] = 1
        update, _ = m.result(self.row,self.page,self.url,datetime.now(timezone.utc))
        self.assertEqual(update['winning_margin_lengths'], 'dh')

    def test_amended_result_uses_official_placings_without_invented_margins(self):
        self.page['race']['rides'][0].update(finish_position=1, amended_position=2)
        self.page['race']['rides'][1].update(finish_position=2, amended_position=1, finish_distance='nse')
        update, detail = m.result(self.row,self.page,self.url,datetime.now(timezone.utc))
        self.assertEqual(detail['winner'], 'Second')
        self.assertTrue(update['result_amended'])
        self.assertIsNone(update['winning_margin_lengths'])
        self.assertIsNone(update['selected_beaten_lengths'])
        self.assertEqual(detail['finish_margins'][0]['horse'], 'Second')
        self.assertEqual(detail['finish_margins'][1]['horse'], 'Winner')

if __name__=='__main__':unittest.main()


