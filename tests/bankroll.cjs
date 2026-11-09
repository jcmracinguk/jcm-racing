const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const path=require('node:path'),root=path.resolve(__dirname,'..');
const today=JSON.parse(fs.readFileSync(path.join(root,'data/bet-builder-2026-10-23.json')));
today.date='2026-11-06';today.introduced_at='2026-11-06T08:00:00Z';today.rows.forEach(r=>{r.race_date=today.date;r.scheduled_off_dt=today.date+'T'+r.off_time_uk+':00+00:00';});
const files={},store=new Map(),stub={addEventListener(){},querySelector(){return stub;}};
class Clock extends Date {static now(){return Date.parse('2026-11-12T12:00:00Z');}}
const context={window:{jcmAcceptedResult:()=>true},document:{getElementById:()=>stub,addEventListener(){}},structuredClone,Date:Clock,setInterval(){},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},fetch:async p=>({ok:!!files[p],json:async()=>structuredClone(files[p])})};
const source=fs.readFileSync(path.join(root,'scripts/bet-builder.js'),'utf8').replace("window.jcmOpenDummyAccount=()=>open('race');","window.bankTest={settings,totals,carriedBank,history,raceProfitSummary};window.jcmOpenDummyAccount=()=>open('race');");
vm.runInNewContext(source,context);const api=context.window.bankTest;
function calculate(outcomes,m='fixed',opening=0){const c=structuredClone(today);c.account_opening_cents=opening;c.rows.forEach((r,i)=>r.result_status=outcomes[i]);return api.totals(c,c.rows,api.settings(c,m));}
const pending=calculate(['PENDING','PENDING']);assert.equal(pending.balance,0);assert.equal(pending.reserved,100000);assert.equal(pending.potential,27682);assert.equal(pending.net,0);
for(const mode of ['fixed','race','manual']){const s=api.settings(today,mode);assert.equal(s.published,true);assert.equal(Object.values(s.entries).filter(e=>e.included).length,2);}
const win=calculate(['WIN','WIN']);assert.equal(win.balance,27682);assert(Math.abs(win.bank_percentage-2.7682)<1e-9);assert.equal(calculate(['WIN','WIN'],'race').balance,win.balance);assert.equal(calculate(['WIN','WIN'],'manual').balance,13841);
assert.equal(calculate(['WIN','LOSS']).balance,-37162);assert.equal(calculate(['LOSS','LOSS']).balance,-100000);assert.equal(calculate(['NR','LOSS']).balance,-50000);
const empty=calculate(['LOSS','LOSS'],'fixed',100000);assert.equal(empty.balance,0);assert.equal(empty.deposits,0);assert.equal(empty.topup,0);
assert.equal(calculate(['LOSS','LOSS'],'fixed',-2000000).balance,-2100000);
const noOdds=structuredClone(today);delete noOdds.published_simulations.race;noOdds.rows.forEach((r,i)=>{r.lay_odds=null;r.result_status=i?'LOSS':'WIN';});const noOddsTotals=api.totals(noOdds,noOdds.rows,api.settings(noOdds,'race'));assert.equal(noOddsTotals.movement,-40000);assert.equal(noOddsTotals.potential,-40000);assert.equal(noOddsTotals.reserved,0);assert.equal(noOddsTotals.unresolved,0);
function publish(date,outcomes){const c=structuredClone(today);c.date=date;c.rows.forEach((r,i)=>{r.race_date=date;r.scheduled_off_dt=date+'T'+r.off_time_uk+':00+00:00';r.result_status=outcomes[i];});files['data/bet-builder-'+date+'.json']=c;files['data/competition-research-'+date+'.json']={date,high_competition:c.rows,competition_watchlist:[]};}
(async()=>{
 publish('2026-11-06',['WIN','LOSS']);publish('2026-11-07',['LOSS','LOSS']);
 const days={days:['2026-11-07','2026-11-06','2026-11-05']};
 publish('2026-11-05',['WIN','LOSS']);delete files['data/bet-builder-2026-11-05.json'].published_simulations.race;
 const estimate=await api.raceProfitSummary({days:['2026-11-05']});assert.equal(estimate.total,-40000);assert.equal(estimate.wins,1);assert.equal(estimate.losses,1);assert.equal(estimate.estimated,2);assert.equal(estimate.weeks[0].estimated,2);assert.equal(estimate.weeks[0].entries[0].profit,10000);assert.equal(estimate.weeks[0].entries[0].estimated,true);assert.equal(estimate.weeks[0].entries[1].profit,-50000);
 const summary=await api.raceProfitSummary({days:['2026-11-07','2026-11-06']});assert.equal(summary.total,-137162);assert.equal(summary.wins,1);assert.equal(summary.losses,3);assert.equal(summary.weeks[0].week,'2026-11-02');assert.equal(summary.weeks[0].profit,-137162);assert.equal(summary.weeks[0].entries.length,4);assert.equal(summary.weeks[0].entries[0].horse,today.rows[0].horse);assert.equal(summary.weeks[0].entries[0].profit,12838);assert.equal(summary.weeks[0].entries[1].profit,-50000);
 const carry=await api.carriedBank('2026-11-08','fixed',days);assert.equal(carry.bank,-137162);assert.equal(carry.deposits,0);
 assert.equal((await api.carriedBank('2026-11-08','fixed',days)).bank,carry.bank);
 const h=await api.history(days);assert.equal(h.points.fixed[1].balance,carry.bank);assert(Math.abs(h.points.fixed[1].percentage+13.7162)<1e-9);
 publish('2026-11-06',['LOSS','LOSS']);assert.equal((await api.carriedBank('2026-11-08','fixed',days)).bank,-200000);
 publish('2026-11-06',['PENDING','WIN']);const p=await api.carriedBank('2026-11-07','fixed',days);assert.equal(p.bank,14844);assert.equal(p.reserved,50000);
 const frozen=await api.history(days);assert.equal(frozen.points.fixed[0].balance,0);assert.equal(frozen.points.fixed[1].balance,0);assert.equal(frozen.points.fixed[0].complete,false);
 publish('2026-11-06',['LOSS','LOSS']);publish('2026-11-07',['WIN','PENDING']);const lastClose=await api.history(days);assert.equal(lastClose.points.fixed[1].balance,-100000);assert.equal(lastClose.points.fixed[1].percentage,-10);
 console.log('Bankroll checks passed: three booked plans; wins, losses, NR, running balances, pending funds, corrections, repeat reads, zero-start overdraft, daily final-result freeze and benchmark percentage.');
})().catch(e=>{console.error(e);process.exitCode=1;});
