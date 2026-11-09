const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const manifest=read('data/bet-builder-days.json'),research=read('data/rated-performance-sources.json');
assert(manifest.days.every(d=>d>='2026-11-06'));for(const d of ['2026-11-06','2026-11-07','2026-11-09'])assert(manifest.days.includes(d));
assert.deepEqual(research.sources,manifest.days.map(d=>'data/competition-research-'+d+'.json'));
const archive=read('data/archive/pre-2026-11-06-run-indexes.json');
assert(archive.previous_manifests['data/bet-builder-days.json'].days.includes('2026-11-05'));
assert.equal(read('data/competition-research-2026-11-05.json').high_competition.length,3);
const store=new Map([['jcm-builder-v3-2026-11-05-race','old device record']]),stub={addEventListener(){},querySelector(){return stub;}};
class Clock extends Date{static now(){return Date.parse('2026-11-09T11:00:00Z');}}
const ctx={window:{jcmAcceptedResult:()=>true},document:{getElementById:()=>stub,addEventListener(){}},structuredClone,Date:Clock,setInterval(){},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},fetch:async p=>({ok:fs.existsSync(p),json:async()=>read(p)})};
const src=fs.readFileSync('scripts/bet-builder.js','utf8').replace("window.jcmOpenDummyAccount=()=>open('race');","window.runCheck={settings,carriedBank,raceProfitSummary};window.jcmOpenDummyAccount=()=>open('race');");
vm.runInNewContext(src,ctx);
(async()=>{
 const api=ctx.window.runCheck;
 const first=await api.carriedBank('2026-11-06','race',manifest);assert.equal(first.bank,0);
 const carry=await api.carriedBank('2026-11-09','race',manifest);assert.equal(carry.bank,55944);
 const summary=await api.raceProfitSummary({days:['2026-11-06','2026-11-07']});assert.equal(summary.total,55944);assert.equal(summary.wins,3);assert.equal(summary.losses,0);
 const c=read('data/bet-builder-2026-11-09.json'),s=api.settings(c,'race');
 assert.equal(Object.values(s.entries).reduce((v,r)=>v+r.liability_cents,0),150000);
 const k=Object.keys(s.entries)[0];s.entries[k].included=false;s.entries[k].liability_cents=0;s.choices[k]=false;
 const saved=JSON.stringify(s);store.set('jcm-builder-v3-2026-11-09-race',saved);
 assert.equal(api.settings(c,'race').entries[k].included,false);assert.equal(store.get('jcm-builder-v3-2026-11-09-race'),saved);assert.equal(store.get('jcm-builder-v3-2026-11-05-race'),'old device record');
 const football=read('data/football-results-2026-11-07.json');assert.equal(football.sport,'football');assert.equal(football.selections.length,5);
 assert.equal(new Set(football.selections.map(r=>r.fixture_id)).size,5);
 let wins=0;for(const r of football.selections){assert.equal(r.market,'BTTS_YES');assert.equal(r.score_basis,'REGULAR_TIME');assert(r.selected_at<r.kickoff);assert.equal(r.original_result_status,'PENDING');assert.equal(r.original_price_record.odds,null);assert(r.odds>1);assert.equal(r.simulated_stake_gbp,null);assert.equal(r.profit_loss_gbp,null);assert.equal(r.result_status,r.score.home>0&&r.score.away>0?'WIN':'LOSS');assert(r.result_source_url.startsWith('https://www.skysports.com/football/'));if(r.result_status==='WIN')wins++;}
 assert.equal(wins,4);const miss=football.selections.find(r=>r.result_status==='LOSS');assert.equal(miss.home_display,'Preston North End');assert.deepEqual(miss.score,{home:1,away:0});
 const html=fs.readFileSync('football.html','utf8');assert(!html.includes('scripts/bet-builder.js'));assert(!html.includes('scripts/fresh-tracker.js'));assert(html.includes('data-sport="football"'));
 console.log('Fresh-run checks passed: zero opening, £559.44 settled, old device choices/history retained, and isolated football 4/5 with original unpriced record retained.');
})().catch(e=>{console.error(e);process.exitCode=1});
