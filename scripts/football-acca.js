/* Football paper accounting; no real orders, racing balances or browser storage. */
(function(root){
 'use strict';
 function calculate(config,rows){
  if(config.sport!=='football'||config.fictional_only!==true||config.simulation_type!=='ACCUMULATOR'||!Number.isFinite(config.stake_gbp)||config.stake_gbp<=0||!Number.isFinite(config.combined_odds)||config.combined_odds<=1||config.commission_rate!==0||!Array.isArray(config.fixture_ids)||config.fixture_ids.length<2||new Set(config.fixture_ids).size!==config.fixture_ids.length)throw Error('Invalid football accumulator');
  const legs=config.fixture_ids.map(id=>{const found=rows.filter(r=>r.fixture_id===id&&r.match_date===config.date&&r.market==='BTTS_YES');if(found.length!==1)throw Error('Accumulator leg identity mismatch');return found[0];});
  if(legs.some(r=>!Number.isFinite(r.odds)||r.odds<=1))throw Error('Missing leg price');
  const statuses=legs.map(r=>r.result_status);
  // Void/abandonment requires its recorded bookmaker settlement terms, never inference.
  const status=statuses.includes('LOSS')?'LOSS':statuses.every(s=>s==='WIN')?'WIN':'PENDING';
  const potentialReturn=config.stake_gbp*config.combined_odds;
  const returns=status==='WIN'?potentialReturn:0,net=status==='PENDING'?0:returns-config.stake_gbp;
  return {status,stake:config.stake_gbp,returns,net,potentialReturn,potentialProfit:potentialReturn-config.stake_gbp,legs,legOddsProduct:legs.reduce((p,r)=>p*r.odds,1)};
 }
 if(typeof module==='object'&&module.exports)module.exports={calculate};
 else root.JCMFootballAcca={calculate};
})(typeof window==='object'?window:globalThis);
