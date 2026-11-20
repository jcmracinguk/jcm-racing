const {test,expect}=require('@playwright/test');
const url='http://127.0.0.1:8765/';
test.use({viewport:{width:390,height:844}});
test('fresh racing totals and mobile sport switch keep results separate',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url+'#picks');
 await expect(page.locator('#date option')).not.toHaveCount(0);
 await expect(page.locator('.metrics .metric strong').first()).not.toHaveText('—');
 const racingMetrics = await page.locator('.metrics .metric strong').allTextContents();
 const racingDate = await page.locator('#date').inputValue();
 await page.locator('header .jcm-sport-switch').click();
 await expect(page).toHaveURL(/football\.html#picks$/);
 await expect(page.locator('.metrics .metric strong')).toHaveText(['80%','4','1','0']);
 await expect(page.locator('#date')).toHaveValue('2026-11-21');
 await expect(page.locator('#jcm-official-panel')).toContainText('Southampton v Derby');
 await expect(page.locator('#jcm-official-panel')).toContainText('Burnley v Blackburn');
 await expect(page.locator('#date option[value="2026-11-22"]')).toHaveCount(0);
 await page.locator('#date').selectOption('2026-11-07');
 await expect(page.locator('.football-row')).toHaveCount(5);
 await expect(page.locator('.football-row').filter({hasText:'Southampton'})).toContainText('1–0');
 await expect(page.locator('.football-row').filter({hasText:'Southampton'})).toContainText('Failure');
 await page.locator('.football-row').filter({hasText:'Cardiff City'}).click();
 await expect(page.locator('#jcm-detail-content')).toContainText('Counterargument');
 await expect(page.locator('#jcm-detail-content')).toContainText('5–4');
 await expect(page.locator('#jcm-detail-content')).toContainText('Part of one £100 five-fold accumulator');
 await page.getByRole('button',{name:'Close details'}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.locator('header .jcm-sport-switch').click();
 await expect(page).toHaveURL(/index\.html#picks$/);
 await expect(page.locator('#date')).toHaveValue(racingDate);
 await expect(page.locator('.metrics .metric strong')).toHaveText(racingMetrics);
 expect(errors).toEqual([]);
});
test('both hubs switch sports and football accumulator stays separate',async({page})=>{
 await page.goto(url+'#hub');
 await expect(page.locator('#jcm-profit-summary summary')).toBeVisible();
 await page.locator('#jcm-hub .jcm-sport-switch').click();
 await expect(page).toHaveURL(/football\.html#hub$/);
 await expect(page.getByRole('heading',{name:'Your football hub'})).toBeVisible();
 await expect(page.locator('#jcm-profit-summary summary')).toContainText(/[-−]£100/);
 await expect(page.locator('#jcm-profit-summary .jcm-profit-week-head').first()).not.toBeVisible();
 await page.locator('[data-page="dummy-account"]').click();
 await expect(page.locator('#jcm-detail-content')).toContainText('Football Bet Builder');
 await expect(page.locator('#jcm-detail-content tbody tr')).toHaveCount(4);
 await expect(page.locator('#jcm-detail-content')).toContainText('No confirmed accumulator');
 await expect(page.locator('#jcm-detail-content')).toContainText('Original proposed stake £100.00');
 await expect(page.locator('#jcm-detail-content')).toContainText('22 Nov 2026');
 await page.getByRole('button',{name:'Close details'}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.locator('#jcm-hub .jcm-sport-switch').click();
 await expect(page.getByRole('heading',{name:'Your racing hub'})).toBeVisible();
});

test('withdrawn football proposal stays out of stakes and results',async({page})=>{
 await page.goto(url+'football.html#picks');
 await expect(page.locator('#jcm-daily-rate')).toContainText('No confirmed selections');
 await expect(page.locator('#jcm-official-panel')).toContainText('Middlesbrough v Bristol City remains on hold');
 await expect(page.locator('#jcm-official-panel .football-row')).toHaveCount(0);
 await page.getByRole('button',{name:'Return to JCM Football Hub'}).click();
 await page.locator('#jcm-profit-summary summary').click();
 await expect(page.getByRole('button',{name:'View accumulator games and results for 21 Nov 2026'})).toHaveCount(0);
 await expect(page.locator('#jcm-profit-summary')).toContainText(/[-−]£100/);
 await page.locator('[data-page="dummy-account"]').click();
 await expect(page.locator('#jcm-detail-content')).toContainText('No confirmed accumulator');
 await expect(page.locator('#jcm-detail-content')).not.toContainText('Potential profit');
 await expect(page.locator('#jcm-detail-content')).not.toContainText('Return if all win');
 await page.locator('#jcm-detail-content summary').click();
 await expect(page.locator('#jcm-detail-content')).toContainText('7.22');
 await expect(page.locator('#jcm-detail-content tbody tr')).toHaveCount(4);
 await expect(page.locator('#jcm-detail-content tbody tr').filter({hasText:'Not selected'})).toHaveCount(4);
});

test('football profit date opens all accumulator games and supports keyboard close',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url+'football.html#hub');
 await page.locator('#jcm-profit-summary summary').click();
 await page.locator('[aria-controls="football-profit-week-2026-11-02"]').click();
 await expect(page.locator('#football-profit-week-2026-11-02')).toContainText('BTTS No');
 const entry=page.getByRole('button',{name:'View accumulator games and results for 7 Nov 2026'});
 await expect(entry).toBeVisible();
 await entry.click();
 const details=page.locator('#jcm-detail-content');
 await expect(details).toContainText('7 Nov 2026 · 5-fold BTTS YES acca');
 await expect(page.locator('.football-acca-leg')).toHaveCount(5);
 for(const [team,score,outcome] of [['Portsmouth','1–2','Won'],['Wrexham','1–1','Won'],['Blackburn','2–1','Won'],['Preston','1–0','Lost'],['Cardiff','5–4','Won']]){
  const row=details.locator('tbody tr').filter({hasText:team});
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(score);
  await expect(row).toContainText(outcome);
 }
 await expect(details).toContainText('−£100.00');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.getByRole('button',{name:'Close details'}).click();
 await expect(entry).toBeFocused();
 await page.keyboard.press('Enter');
 await expect(page.locator('#jcm-detail-overlay')).toHaveClass(/open/);
 await page.keyboard.press('Escape');
 await expect(entry).toBeFocused();
 expect(errors).toEqual([]);
});
test('football profit date uses that accumulator even when another dashboard date is selected',async({page})=>{
 const fs=require('node:fs');
 const first=JSON.parse(fs.readFileSync('data/football-results-2026-11-07.json','utf8'));
 const config=JSON.parse(fs.readFileSync('data/football-bet-builder-2026-11-07.json','utf8'));
 const later=structuredClone(first);later.date='2026-11-08';
 later.selections=later.selections.map(r=>({...r,fixture_id:r.fixture_id+100000,match_date:'2026-11-08',kickoff:r.kickoff.replace('2026-11-07','2026-11-08'),result_verified_at:'2026-11-09T11:00:00Z',result_status:'WIN',score:{home:2,away:2}}));
 const secondConfig={...structuredClone(config),date:'2026-11-08',stake_gbp:200,fixture_ids:config.fixture_ids.map(id=>id+100000)};
 const responses={
  'football-results-days.json':{sport:'football',sources:['data/football-results-2026-11-07.json','data/football-results-2026-11-08.json']},
  'football-results-2026-11-07.json':first,'football-results-2026-11-08.json':later,
  'football-bet-builder-days.json':{sport:'football',days:['2026-11-07','2026-11-08']},
  'football-bet-builder-2026-11-07.json':config,'football-bet-builder-2026-11-08.json':secondConfig
 };
 await page.route('**/data/football-*.json',async route=>{
  const name=new URL(route.request().url()).pathname.split('/').pop();
  await route.fulfill({json:responses[name]});
 });
 await page.goto(url+'football.html#hub');
 await expect(page.locator('#date option')).toHaveCount(3);
 await page.locator('#date').selectOption('2026-11-08',{force:true});
 await page.locator('#jcm-profit-summary summary').click();
 await page.locator('[aria-controls="football-profit-week-2026-11-02"]').click();
 await page.getByRole('button',{name:'View accumulator games and results for 7 Nov 2026'}).click();
 const details=page.locator('#jcm-detail-content');
 await expect(details).toContainText('7 Nov 2026 · 5-fold');
 await expect(details.locator('.jcm-profit-daily-stat').filter({hasText:'Stake'})).toContainText('£100.00');
 await expect(details.locator('tbody tr').filter({hasText:'Preston North End'})).toContainText('1–0');
 await page.getByRole('button',{name:'Close details'}).click();
 await page.getByRole('button',{name:'View accumulator games and results for 8 Nov 2026'}).click();
 await expect(details).toContainText('8 Nov 2026 · 5-fold');
 await expect(details.locator('.jcm-profit-daily-stat').filter({hasText:'Stake'})).toContainText('£200.00');
 await expect(details.locator('tbody tr').filter({hasText:'Preston North End'})).toContainText('2–2');
});

