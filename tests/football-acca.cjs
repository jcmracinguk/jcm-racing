const fs=require('node:fs'),assert=require('node:assert/strict');
const {calculate}=require('../scripts/football-acca.js');
const cfg=JSON.parse(fs.readFileSync('data/football-bet-builder-2026-11-07.json'));
const rows=JSON.parse(fs.readFileSync('data/football-results-2026-11-07.json')).selections;
const actual=calculate(cfg,rows);
assert.equal(actual.stake,100);assert.equal(actual.status,'LOSS');assert.equal(actual.returns,0);assert.equal(actual.net,-100);
assert.equal(cfg.combined_odds,12.05);assert.equal(actual.potentialReturn,1205);assert.equal(actual.potentialProfit,1105);
assert(Math.abs(actual.legOddsProduct-11.8873282248)<1e-10);
assert.equal(cfg.original_ticket.displayed_stake_gbp,10);assert.equal(cfg.retrospective_simulation,true);
assert.equal(calculate(cfg,rows.map(r=>({...r,result_status:'WIN'}))).net,1105);
const pending=calculate(cfg,rows.map(r=>({...r,result_status:'PENDING'})));assert.equal(pending.status,'PENDING');assert.equal(pending.net,0);
const oneLoss=rows.map(r=>({...r,result_status:r.fixture_id===561937?'LOSS':'PENDING'}));assert.equal(calculate(cfg,oneLoss).net,-100);
assert.equal(calculate(cfg,rows.map(r=>({...r,result_status:'VOID'}))).status,'PENDING');
assert.throws(()=>calculate({...cfg,fixture_ids:[561930,561930]},rows),/Invalid/);
assert.throws(()=>calculate(cfg,rows.filter(r=>r.fixture_id!==561938)),/identity/);
assert.throws(()=>calculate({...cfg,stake_gbp:-100},rows),/Invalid/);
const before=rows.map(r=>r.selected_at);for(const r of rows){assert.equal(r.original_price_record.odds,null);assert.equal(r.original_price_record.priced,false);assert(r.odds_recorded_at>r.kickoff);assert.equal(r.price_provenance.retrospective_import,true);assert.equal(r.simulated_stake_gbp,null);assert.equal(r.profit_loss_gbp,null);}
assert.deepEqual(rows.map(r=>r.selected_at),before);
console.log('Football acca passed: receipt12.05 vs leg product retained, £100 loss, win/pending/void/identity cases, and original £10 receipt separated.');
