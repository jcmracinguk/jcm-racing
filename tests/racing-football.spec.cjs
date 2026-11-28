const {test,expect}=require('@playwright/test');
const url='http://127.0.0.1:8765/';
test.use({viewport:{width:390,height:844}});
async function expectRaceInformation(page,expected){
 const details=page.locator('#jcm-detail-content');
 const button=details.getByRole('button',{name:'Race information',exact:true});
 await expect(button).toHaveCount(1);
 await expect(details.getByRole('link')).toHaveCount(0);
 await expect(details.getByRole('heading',{name:/^(Racecard|Race results)$/i})).toHaveCount(0);
 await page.evaluate(()=>{window.open=url=>{window.raceInformationDestination=url;};});
 await button.click();
 const destination=await page.evaluate(()=>window.raceInformationDestination);
 if(expected instanceof RegExp)expect(destination).toMatch(expected);
 else expect(destination).toBe(expected);
}
test('UK and International switch on mobile without changing UK results',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-11-28T12:00:00Z')});
 await page.goto(url+'#picks-results');
 await expect(page.locator('#date option')).not.toHaveCount(0);
 await expect(page.locator('#date option[value="2026-11-27"]')).toHaveText('Fri 27th Nov-26');
 await expect(page.locator('.metrics:visible .metric strong').first()).not.toHaveText('—');
 await expect(page.locator('#jcm-watch-metrics')).toBeHidden();
 const racingMetrics = await page.locator('.metrics:visible .metric strong').allTextContents();
 const racingDate = await page.locator('#date').inputValue();
 const slider=page.locator('header .jcm-sport-switch');
 await expect(slider.locator('.jcm-sport-label')).toHaveText(['UK','International']);
 await slider.click();
 await expect(page).toHaveURL(/index\.html\?region=international#picks-results$/);
 await expect(page.getByRole('heading',{name:'Picks Results',exact:true})).toBeVisible();
 await expect(page.locator('#date')).toHaveValue('2026-11-28');
 await expect(page.locator('#date option:checked')).toHaveText('Sat 28th Nov-26');
 await expect(page.locator('#jcm-official-panel')).toContainText('No settled results for this date.');
 await expect(page.locator('.metrics:visible .metric strong')).toHaveText(['—','0','0','0']);
 await expect(slider.getByRole('switch',{name:'International view'})).toBeChecked();
 await expect(page.locator('body')).toHaveCSS('background-color','rgb(13, 48, 50)');
 await page.setViewportSize({width:320,height:780});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await slider.click();
 await expect(page).toHaveURL(/index\.html#picks-results$/);
 await expect(page.locator('#date')).toHaveValue(racingDate);
 await expect(page.locator('.metrics:visible .metric strong')).toHaveText(racingMetrics);
 expect(errors).toEqual([]);
});
test('direct football page still displays its own results',async({page})=>{
 await page.goto(url+'football.html#picks');
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
});
test('UK and International have full-width tiles and show profit only inside each results page',async({page})=>{
 await page.goto(url+'#hub');
 const picksProfit=page.locator('#jcm-profit-summary');
 const watchProfit=page.locator('#jcm-watch-profit-summary');
 const tiles=page.locator('#jcm-hub [data-page]');
 await expect(tiles).toHaveCount(3);
 expect(await tiles.evaluateAll(nodes=>nodes.map(node=>node.dataset.page))).toEqual(['todays-bets','picks-results','watchlist-results']);
 await expect(page.getByRole('heading',{name:'Results',exact:true})).toBeVisible();
 await expect(picksProfit).toBeHidden();
 await expect(watchProfit).toBeHidden();
 await expect(page.locator('#jcm-hub')).not.toContainText(/paper/i);
 await page.setViewportSize({width:320,height:780});
 const [todayBox,pickBox,watchBox]=await Promise.all([tiles.nth(0).boundingBox(),tiles.nth(1).boundingBox(),tiles.nth(2).boundingBox()]);
 expect(pickBox.width).toBe(todayBox.width);
 expect(watchBox.width).toBe(pickBox.width);
 expect(watchBox.x).toBe(pickBox.x);
 expect(watchBox.y).toBeGreaterThan(pickBox.y+pickBox.height);
 await tiles.nth(1).click();
 await expect(picksProfit.locator('summary')).toBeVisible();
 await expect(watchProfit).toBeHidden();
 expect(await picksProfit.evaluate(node=>node.parentElement.tagName==='MAIN'&&
  Boolean(document.getElementById('jcm-official-panel').compareDocumentPosition(node)&Node.DOCUMENT_POSITION_FOLLOWING))).toBeTruthy();
 await page.getByRole('button',{name:'Return to JCM Hub'}).click();
 await page.locator('#jcm-hub .jcm-sport-switch').click();
 await expect(page).toHaveURL(/index\.html\?region=international#hub$/);
 await expect(page.getByRole('heading',{name:'International',exact:true})).toBeVisible();
 await expect(picksProfit).toBeHidden();
 await expect(watchProfit).toBeHidden();
 await tiles.nth(2).click();
 await expect(watchProfit.locator('summary')).toContainText('£0');
 await expect(watchProfit.locator('summary')).toBeVisible();
 await expect(picksProfit).toBeHidden();
 await watchProfit.locator('summary').click();
 await expect(watchProfit.locator('details')).toHaveAttribute('open','');
 await page.getByRole('button',{name:'Return to JCM Hub'}).click();
 await page.locator('[data-page="todays-bets"]').click();
 await page.locator('#date').selectOption('2026-11-28');
 await expect(page.locator('#jcm-official-panel')).toContainText('No bets for this date.');
 await page.getByRole('button',{name:/Sentosa/}).click();
 await expect(page.locator('#jcm-detail-content')).toContainText('Awaiting a verified Exchange Lay quote');
 await expectRaceInformation(page,'https://www.zeturf.fr/fr/course-du-jour/2026-11-28/R2C7-lyon-parilly-prix-des-turfistes');
 await page.getByRole('button',{name:'Close details'}).click();
 await page.getByRole('button',{name:'Return to JCM Hub'}).click();
 await page.locator('#jcm-hub .jcm-sport-switch').click();
 await expect(page.getByRole('heading',{name:'UK',exact:true})).toBeVisible();
});
test('lay details show two figures at the approved price for settled horses',async({page})=>{
 await page.clock.install({time:new Date('2026-11-27T20:00:00Z')});
 await page.goto(url+'#picks-results');
 await page.locator('#date').selectOption('2026-11-27');
 await page.getByRole('button',{name:/Kap Ouest/}).click();
 const detail=page.locator('#jcm-detail-content');
 const paper=detail.locator('.jcm-result-tile').filter({has:page.getByRole('heading',{name:'Lay',exact:true})});
 await expect(paper.locator('.jcm-result-stat strong')).toHaveText(['3.55','£186.27']);
 await expect(paper).not.toContainText('£10 lay stake');
 await expectRaceInformation(page,/^https:\/\/www\.sportinglife\.com\/racing\/racecards\/2026-11-27\/newbury\/racecard\/\d+\//);
 await expect(detail.getByRole('link',{name:/watch race|race video/i})).toHaveCount(0);
 await page.getByRole('button',{name:'Close details'}).click();
 await expect(page.getByRole('button',{name:/Klub de Reve/i})).toHaveCount(0);
 await page.getByRole('button',{name:'Return to JCM Hub'}).click();
 await page.locator('[data-page="watchlist-results"]').click();
 await expect(page.getByRole('button',{name:/Kap Ouest/})).toHaveCount(0);
 await page.getByRole('button',{name:/Klub de Reve/i}).click();
 await expect(paper.locator('.jcm-result-stat strong')).toHaveText(['2.88','£252.66']);
 await expect(paper).not.toContainText('Paper P/L');
});

test('lay details use the newest verified pre-off snapshot for a pending horse',async({page})=>{
 await page.clock.install({time:new Date('2026-11-27T11:30:00Z')});
 await page.goto(url+'#picks');
 await page.evaluate(()=>{
  const quote={market_id:'1.123',selection_id:321,verification_status:'VERIFIED_API_LAY',price_side:'LAY'};
  window.jcmShowResearchCard({horse:'Fixture',course:'Newbury',race_date:'2026-11-27',
   off_time_uk:'12:00',scheduled_off_dt:'2026-11-27T12:00:00Z',result_status:'PENDING',
   identified_challengers:[],lay_odds:3,lay_price_provenance:{...quote,retrieved_at_utc:'2026-11-27T10:00:00Z'},
   price_observation_history:[
    {...quote,price:2.9,retrieved_at_utc:'2026-11-27T11:00:00Z'},
    {...quote,price:2.6,selection_id:555,retrieved_at_utc:'2026-11-27T11:10:00Z'},
    {...quote,price:2.5,price_side:'BACK',retrieved_at_utc:'2026-11-27T11:15:00Z'}
   ]});
 });
 const paper=page.locator('.jcm-result-tile').filter({has:page.getByRole('heading',{name:'Lay',exact:true})});
 await expect(paper.locator('.jcm-result-stat strong')).toHaveText(['2.90','£250.00']);
});

test('football accumulator stays separate',async({page})=>{
 await page.goto(url+'football.html#hub');
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
 await expect(page.getByRole('heading',{name:'UK',exact:true})).toBeVisible();
});

test('settled International Picks feed their own P/L and never load UK records',async({page})=>{
 const domesticRequests=[];
 page.on('request',request=>{
  if(/\/data\/(watch-list|rated-performance-sources|bet-builder|competition-research)/.test(request.url()))domesticRequests.push(request.url());
 });
 await page.route('**/data/international-racing.json',route=>route.fulfill({json:{schema_version:1,days:[{
  date:'2026-11-26',watchlist:[],research:[],
  picks:[{horse:'International fixture horse',course:'Lyon-Parilly',race_id:'rac_1',horse_id:'hrs_1',
   scheduled_off_dt:'2026-11-26T12:52:00Z',lay_odds:3,price_approved_at:'2026-11-26T08:00:00Z',
   result_status:'WIN',position:'2',result_source:'THE_RACING_API',verification_status:'PROVIDER_ACCEPTED',
   result_source_url:'https://api.theracingapi.com/v1/results/rac_1',result_race_id:'rac_1',result_horse_id:'hrs_1',
   result_date:'2026-11-26',result_off_time_uk:'12:52',result_course:'Lyon-Parilly',result_horse:'International fixture horse',
   result_off_dt:'2026-11-26T12:52:00Z',result_retrieved_at:'2026-11-26T13:04:00Z',official_accuracy_eligible:false}]
 }]}}));
 await page.goto(url+'international.html#picks');
 await page.locator('#date').selectOption('2026-11-26');
 await expect(page.locator('#jcm-official-panel')).toContainText('International fixture horse');
 const profit=page.locator('#jcm-profit-summary');
 await profit.locator('summary').click();
 await profit.locator('.jcm-profit-week-head').click();
 await expect(profit.locator('.jcm-profit-entry')).toContainText('International fixture horse');
 await expect(profit.locator('.jcm-profit-entry')).toContainText('+£237.50');
 expect(domesticRequests).toEqual([]);
});

test('withdrawn football proposal stays out of stakes and results',async({page})=>{
 await page.goto(url+'football.html#picks');
 await expect(page.locator('#jcm-daily-rate')).toContainText('No confirmed selections');
 await expect(page.locator('#jcm-official-panel')).toContainText('Middlesbrough v Bristol City not selected');
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


test('bets stay in time order and public results receive only races with a settled outcome',async({page})=>{
 await page.clock.install({time:new Date('2026-11-28T14:10:00Z')});
 let watchResult='PENDING';
 const day='2026-11-28';
 const activePick={
  horse:'Fixture Pick',course:'Lyon-Parilly',scheduled_off_dt:day+'T14:15:00Z',
  result_status:'PENDING',lay_odds:3,
 };
 const watchRunner={
  horse:'Fixture Watch',course:'Lyon-Parilly',scheduled_off_dt:day+'T14:00:00Z',lay_odds:4,
 };
 const earlyVoid={
  horse:'Fixture Void',course:'Lyon-Parilly',scheduled_off_dt:day+'T14:25:00Z',lay_odds:3,result_status:'NR',
 };
 await page.route('**/data/international-racing.json',route=>route.fulfill({json:{
  schema_version:1,days:[{
   date:day,picks:[activePick],watchlist:[earlyVoid,{...watchRunner,result_status:watchResult}],research:[],
  }],
 }}));
 await page.goto(url+'index.html?region=international#todays-bets');
 const rows=page.locator('#jcm-official-panel .jcm-research-row');
 await expect(rows.locator('.jcm-horse')).toHaveText(['Fixture WatchWatchlist','Fixture PickPick','Fixture VoidWatchlist']);
 await expect(rows.locator('.jcm-status')).toHaveText(['Pending','Pending','Pending']);
 const colour=async index=>rows.nth(index).locator('.jcm-entry-group').evaluate(node=>getComputedStyle(node).color);
 expect(await colour(0)).not.toBe(await colour(1));
 await expect(rows.nth(0)).toHaveCSS('border-left-color','rgb(237, 189, 87)');
 await expect(rows.nth(1)).toHaveCSS('border-left-color','rgb(98, 231, 219)');
 await page.getByRole('button',{name:'Return to JCM Hub'}).click();
 await page.locator('[data-page="watchlist-results"]').click();
 await page.locator('#jcm-watch-profit-summary summary').click();
 await expect(page.locator('#jcm-watch-profit-summary')).not.toContainText('Fixture Watch');
 await expect(page.locator('#jcm-official-panel')).toContainText('No settled results for this date.');
 watchResult='WIN';
 await page.clock.fastForward(31000);
 await expect(rows).toHaveCount(1);
 await expect(rows.first()).toContainText('Fixture Watch');
 await expect(rows.first()).toContainText('Horse lost');
 await page.getByRole('button',{name:'Return to JCM Hub'}).click();
 await page.locator('[data-page="todays-bets"]').click();
 await expect(rows).toHaveCount(3);
 await expect(rows.first()).toContainText('Horse lost');
});

test('UK Watchlist entries can be browsed by date in bets and stay out of results until settled',async({page})=>{
 await page.clock.install({time:new Date('2026-11-28T12:00:00Z')});
 await page.goto(url+'#todays-bets');
 const panel=page.locator('#jcm-official-panel');
 await expect(page.locator('#date')).toHaveValue('2026-11-28');
 await expect(panel).toContainText('Mydaddypaddy');
 await expect(panel).toContainText('Idaho Sun');
 await expect(panel.getByRole('button',{name:/Mydaddypaddy/})).toHaveCSS('border-left-color','rgb(98, 231, 219)');
 await page.getByRole('button',{name:'Return to JCM Hub'}).click();
 await page.locator('[data-page="watchlist-results"]').click();
 await expect(panel).toContainText('No settled results for this date.');
 await page.locator('#date').selectOption('2026-11-27');
 await expect(panel).toContainText('Klub de Reve');
 await expect(panel).not.toContainText('Kap Ouest');
 await page.getByRole('button',{name:'Return to JCM Hub'}).click();
 await page.locator('[data-page="picks-results"]').click();
 await expect(page.locator('#date')).toHaveValue('2026-11-27');
 await expect(panel).toContainText('Kap Ouest');
 await expect(panel).not.toContainText('Klub de Reve');
 await expect(panel.getByRole('button',{name:/Kap Ouest/})).toHaveCSS('border-left-color','rgb(255, 215, 0)');
});

test('archived Watchlist runner opens its exact Sporting Life racecard',async({page})=>{
 await page.goto(url+'#watchlist-results');
 await page.locator('#date').selectOption('2026-10-21');
 await page.getByRole('button',{name:/Diamond White/}).click();
 await expectRaceInformation(page,'https://www.sportinglife.com/racing/racecards/2026-10-21/fontwell/racecard/944571/bettingbet-play-champion-tipster-mares-handicap-hurdle');
});
