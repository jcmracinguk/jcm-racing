/* Fictional device-local strategies. Amounts are liability, never real orders. */
(function(){
'use strict';
const names={fixed:'£1000 a day',race:'£500 a race',manual:'Manual betting',results:'Results'};
const policy='daily-defaults-20261014';
const bankTrial={start:'2026-11-06',initial:0,benchmark:1000000};
const colours={fixed:'#edbd57',race:'#00bfc1',manual:'#ae90ff'};
const money=v=>'£'+(v/100).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});
const percent=v=>v===null?'N/A':(v>0?'+':'')+v.toFixed(2)+'%';
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key=r=>[r.off_time_uk,r.course,r.horse].join('|');
const labelDate=d=>new Date(d+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
let mode='race',generation=0,lockTimer,refreshTimer,resultsDay=null,resultsMonth=null;
const read=async path=>{const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw Error('Unavailable');return r.json();};
const day=()=>document.getElementById('date').value;
const storage=(d,m)=>'jcm-builder-v3-'+d+'-'+m;
const cents=v=>{const raw=String(v).trim(),n=Number(raw),c=Math.round(n*100);return raw&&Number.isFinite(n)&&Number.isSafeInteger(c)&&c>0&&Math.abs(n*100-c)<1e-6?c:null;};
const price=v=>{const raw=String(v??'').trim(),n=Number(raw);return raw&&Number.isFinite(n)&&n>=1.01&&n<=1000?n:null;};
const off=r=>Date.parse(r.scheduled_off_dt);
const withdrawn=r=>r.withdrawal_status==='SCREENSHOT_NR';
const status=r=>withdrawn(r)?'NR':Date.now()>=off(r)&&window.jcmAcceptedResult(r)&&(r.result_source!=='THE_RACING_API'||(!r.race_id||r.result_race_id===r.race_id)&&(!r.horse_id||r.result_horse_id===r.horse_id))&&['WIN','LOSS','NR'].includes(r.result_status)?r.result_status:'PENDING';
function stop(){window.jcmBuilderLegacyActive=false;generation++;clearTimeout(lockTimer);clearInterval(refreshTimer);window.jcmStopLegacyAccount?.();window.jcmStopFixedTimer?.();}
window.jcmAddAccountSwitch=function(node){
 node.querySelector('.jcm-account-switch')?.remove();
 node.querySelector('.builder-select-all')?.remove();
};
function validateConfig(c,d){
 if(c.schema_version!==2||c.fictional_only!==true||c.date!==d||![0,5000,10000].includes(c.opening_balance_gbp)||c.commission_rate!==.05||!Number.isFinite(Date.parse(c.introduced_at))||!Array.isArray(c.rows)||!c.rows.length)throw Error('Invalid card');
 if(new Set(c.rows.map(key)).size!==c.rows.length||new Set(c.rows.map(r=>r.race_id)).size!==c.rows.length)throw Error('Duplicate race');
 for(const r of c.rows)if(r.race_date!==d||!r.race_id||!r.horse_id||!r.horse||!r.course||!/^\d\d:\d\d$/.test(r.off_time_uk)||!Number.isFinite(off(r))||!r.scheduled_off_dt.startsWith(d+'T'+r.off_time_uk+':')||r.lay_odds!==null&&price(r.lay_odds)!==r.lay_odds)throw Error('Invalid identity');
 return c;
}
function mergeResults(c,p){
 const manual=c.selection_mode==='manual_pre_race_research';
 if(p.date!==c.date||(manual?p.mode!=='manual_pre_race_research'||!Array.isArray(p.selections):!Array.isArray(p.high_competition)||!Array.isArray(p.competition_watchlist)))throw Error('Wrong results');
 const all=(manual?p.selections:[...p.high_competition,...p.competition_watchlist]).map(a=>({...a,race_id:a.race_id??a.result_race_id,horse_id:a.horse_id??a.result_horse_id,scheduled_off_dt:a.scheduled_off_dt??a.result_off_dt}));
 return c.rows.map(r=>{const matches=all.filter(a=>a.race_date===r.race_date&&a.race_id===r.race_id&&a.horse_id===r.horse_id&&key(a)===key(r)&&a.scheduled_off_dt===r.scheduled_off_dt);if(matches.length!==1)throw Error('Result identity mismatch');return {...matches[0],...r,result_status:matches[0].result_status,...Object.fromEntries(Object.entries(matches[0]).filter(([k])=>k.startsWith('result_')||['verification_status','position','placing','official_accuracy_eligible'].includes(k)))};});
}
function loadSettings(c,m){
 const raw=localStorage.getItem(storage(c.date,m));
 if(!raw)return null;
 const s=JSON.parse(raw);
 if(c.archived_abandoned_entries?.some(r=>Object.prototype.hasOwnProperty.call(s?.entries||{},key(r)))){
  const previousRows=[...c.rows,...c.archived_abandoned_entries].filter(r=>Object.prototype.hasOwnProperty.call(s.entries,key(r)));
  const old=loadSettings({...c,rows:previousRows,archived_abandoned_entries:null,expansion_from_keys:null,expansion_from_keysets:null},m);
  const next=structuredClone(old);
  for(const k of Object.keys(next.entries))if(!c.rows.some(r=>key(r)===k)){delete next.entries[k];if(next.choices)delete next.choices[k];}
  for(const r of c.rows)if(!next.entries[key(r)]){next.entries[key(r)]={included:false,liability_cents:0,odds:r.lay_odds??null,confirmed_at:null,default_entry:true};next.choices={...next.choices,[key(r)]:false};}
  if(m==='fixed'){const picked=c.rows.filter(r=>next.entries[key(r)].included);picked.forEach((r,i)=>next.entries[key(r)].liability_cents=Math.floor(next.amount_cents/picked.length)+(i<next.amount_cents%picked.length?1:0));}
  return next;
 }
 // Only explicitly published prior cards may expand. Validate old settings
 // against their original identities before adding excluded rows; never rewrite storage.
 if(s&&c.expansion_from_keys&&Object.keys(s.entries||{}).length!==c.rows.length){
  const keys=Object.keys(s.entries||{}),base=(c.expansion_from_keysets||[c.expansion_from_keys]).find(base=>Array.isArray(base)&&keys.length===base.length&&base.every(k=>keys.includes(k)));
  if(!Array.isArray(base)||keys.length!==base.length||!base.every(k=>keys.includes(k)))throw Error('Unrecognised saved card');
  const old=loadSettings({...c,rows:c.rows.filter(r=>base.includes(key(r))),expansion_from_keys:null,expansion_from_keysets:null},m);
  const migrated=structuredClone(old);migrated.choices={...old.choices};
  for(const r of c.rows.filter(r=>!base.includes(key(r)))){migrated.entries[key(r)]={included:false,liability_cents:0,odds:r.lay_odds??null,confirmed_at:null,default_entry:true};migrated.choices[key(r)]=false;}
  migrated.basis='Saved device choices; later additions excluded';return migrated;
 }
 if(c.archived_abandoned_entries?.length&&Object.keys(s?.entries||{}).length!==c.rows.length){
  const originalRows=[...c.rows,...c.archived_abandoned_entries];
  const old=loadSettings({...c,rows:originalRows,archived_abandoned_entries:null},m);
  const next=structuredClone(old);next.entries=Object.fromEntries(Object.entries(next.entries).filter(([k])=>c.rows.some(r=>key(r)===k)));next.choices=Object.fromEntries(Object.entries(next.choices||{}).filter(([k])=>c.rows.some(r=>key(r)===k)));
  if(m==='fixed'){const picked=c.rows.filter(r=>next.entries[key(r)].included);picked.forEach((r,i)=>next.entries[key(r)].liability_cents=Math.floor(next.amount_cents/picked.length)+(i<next.amount_cents%picked.length?1:0));}
  return next;
 }
 if(!s||Object.keys(s.entries||{}).length!==c.rows.length||s.version!==3||s.policy!==policy||s.date!==c.date||s.mode!==m||!s.entries||typeof s.entries!=='object'||Array.isArray(s.entries)||!Number.isSafeInteger(s.amount_cents)||s.amount_cents<0)throw Error('Invalid saved strategy');
 const first=Math.min(...c.rows.map(off));
 if(m!=='manual'&&s.confirmed_at!==null&&(!Number.isFinite(Date.parse(s.confirmed_at))||Date.parse(s.confirmed_at)>=first||Date.parse(s.confirmed_at)>Date.now()||Date.parse(s.confirmed_at)<Date.parse(c.introduced_at)))throw Error('Invalid amount lock');
 for(const [k,v] of Object.entries(s.entries)){
  const r=c.rows.find(r=>key(r)===k);
  if(!r||!v||typeof v.included!=='boolean'||!Number.isSafeInteger(v.liability_cents)||v.liability_cents<0||v.included&&v.liability_cents<1||v.odds!==null&&price(v.odds)!==v.odds||!(v.default_entry===true&&v.confirmed_at===null)&&(!Number.isFinite(Date.parse(v.confirmed_at))||Date.parse(v.confirmed_at)>=off(r)||Date.parse(v.confirmed_at)>Date.now()||Date.parse(v.confirmed_at)<Date.parse(c.introduced_at)))throw Error('Invalid saved race');
 }
 if(m==='race'&&(s.amount_cents!==50000||Object.values(s.entries).some(v=>v.included&&v.liability_cents!==50000)))throw Error('Inconsistent race amount');
 if(s.choices!==undefined&&(!s.choices||typeof s.choices!=='object'||Array.isArray(s.choices)||Object.entries(s.choices).some(([k,v])=>!c.rows.some(r=>key(r)===k)||typeof v!=='boolean')))throw Error('Invalid saved selections');
 if(m==='fixed'&&s.amount_cents!==100000)throw Error('Daily amount locked');
 if(m==='fixed'&&Object.values(s.entries).some(v=>v.included)&&Object.values(s.entries).reduce((a,v)=>a+(v.included?v.liability_cents:0),0)!==s.amount_cents)throw Error('Inconsistent daily amount');
 return s;
}
function selected(s,r){return !withdrawn(r)&&(s.choices?.[key(r)]??s.entries[key(r)]?.included??true);}
function opening(c,m){return c.date>=bankTrial.start?bankTrial.initial:m==='fixed'?100000:m==='race'?Math.max(500000,c.rows.filter(r=>!withdrawn(r)).length*50000):500000;}
function settings(c,m){
 if(c.preserve_device_choices&&localStorage.getItem(storage(c.date,m))){
  const saved=loadSettings(c,m);
  if(c.sync_published_default_entries||Array.isArray(c.sync_published_default_entry_keys))for(const r of c.rows){
   const v=saved.entries[key(r)],e=c.published_simulations?.[m]?.entries.find(e=>e.race_id===r.race_id&&e.horse_id===r.horse_id);
   if(v?.default_entry===true&&v.confirmed_at===null&&e&&(c.sync_published_default_entries||c.sync_published_default_entry_keys.includes(key(r)))){saved.entries[key(r)]={...v,included:true,liability_cents:e.liability_cents,odds:v.odds??e.odds};saved.choices={...saved.choices,[key(r)]:true};}
  }
  return saved;
 }
 if(!c.published_simulations?.[m])return loadSettings(c,m)||initial(c,m);
 const s=initial(c,m),plan=c.published_simulations[m];
 if(plan.entries.length>c.rows.length)throw Error('Invalid published simulation');
 for(const r of c.rows){const matches=plan.entries.filter(e=>e.race_id===r.race_id&&e.horse_id===r.horse_id);if(matches.length===0&&(r.lay_odds===null||r.unbooked_simulation_modes?.includes(m))){s.entries[key(r)]={included:false,liability_cents:0,odds:r.lay_odds??null,confirmed_at:null,default_entry:true};s.choices[key(r)]=false;continue;}if(matches.length!==1)throw Error('Published simulation identity mismatch');const e=matches[0];if(price(e.odds)!==e.odds||!Number.isSafeInteger(e.liability_cents)||e.liability_cents<=0)throw Error('Invalid published simulation');s.entries[key(r)]={included:!withdrawn(r),liability_cents:withdrawn(r)?0:e.liability_cents,odds:e.odds,confirmed_at:null,default_entry:true};}
 s.basis='Published simulation booked '+c.published_simulations.recorded_at;s.published=true;return s;
}
async function carriedBank(d,m,days){
 let movement=0,reserved=0,bank=bankTrial.initial,deposits=bankTrial.initial,withdrawals=0;
 if(d<bankTrial.start)return {movement,reserved,bank,deposits,withdrawals};
 for(const previous of [...days.days].filter(v=>v>=bankTrial.start&&v<d).sort()){
  const c=await card(previous),s=settings(c,m);c.account_opening_cents=bank;c.carried_reserved_cents=reserved;c.carried_deposits_cents=deposits;c.carried_withdrawals_cents=withdrawals;
  const t=totals(c,c.rows,s);movement+=t.movement;reserved=t.reserved;bank=t.balance;deposits=t.deposits;withdrawals=t.withdrawals;
 }
 return {movement,reserved,bank,deposits,withdrawals};
}
function initial(c,m){
 const picked=c.rows.filter(r=>!withdrawn(r)),amount=m==='fixed'?100000:m==='race'?50000:25000;
 const s={version:3,policy,date:c.date,mode:m,amount_cents:amount,confirmed_at:null,entries:{},choices:{},basis:c.date<'2026-10-14'?'Backfilled default simulation':'Published default simulation'};
 for(const [i,r] of picked.entries()){s.choices[key(r)]=true;s.entries[key(r)]={included:true,liability_cents:m==='fixed'?Math.floor(amount/picked.length)+(i<amount%picked.length?1:0):amount,odds:r.lay_odds??null,confirmed_at:null,default_entry:true};}
 for(const r of c.rows.filter(withdrawn)){s.choices[key(r)]=false;s.entries[key(r)]={included:false,liability_cents:0,odds:r.lay_odds??null,confirmed_at:null,default_entry:true};}
 return s;
}
const research=c=>read('data/'+(c.selection_mode==='manual_pre_race_research'?'manual-research-':'competition-research-')+c.date+'.json');
function coverage(c,p){
 if(c.selection_mode!=='manual_pre_race_research'||!Array.isArray(p.selections)||p.selections.length===c.rows.length)return '';
 const settled=p.selections.filter(r=>['WIN','LOSS'].includes(status(r))),wins=settled.filter(r=>status(r)==='WIN').length;
 return 'Full research record: '+wins+' lay wins / '+(settled.length-wins)+' lay losses · '+(settled.length?Math.round(wins/settled.length*1000)/10+'%':'N/A')+' · '+settled.length+'/'+p.selections.length+' settled. Financial simulation: '+c.rows.length+'-pick historical snapshot only; '+(p.selections.length-c.rows.length)+' later picks are outside this snapshot. Full-day profit is unavailable where verified lay prices are missing.';
}
async function card(d){
 const c=validateConfig(await read('data/bet-builder-'+d+'.json'),d);
 const p=await research(c);return {...c,research_summary:coverage(c,p),rows:mergeResults(c,p)};
}
function allocation(s,rows,amount,m){
 const next=structuredClone(s),picked=rows.filter(r=>selected(s,r)),stamp=new Date().toISOString();
 for(const r of rows)next.entries[key(r)]={included:false,liability_cents:0,odds:s.entries[key(r)]?.odds??r.lay_odds??null,confirmed_at:stamp};
 if(m==='fixed'&&amount<picked.length)throw Error('Allow at least 1p per included race.');
 next.amount_cents=amount;next.confirmed_at=stamp;
 for(const [i,r] of picked.entries())next.entries[key(r)]={included:true,liability_cents:m==='race'?amount:Math.floor(amount/picked.length)+(i<amount%picked.length?1:0),odds:s.entries[key(r)]?.odds??r.lay_odds??null,confirmed_at:stamp};
 return next;
}
function totals(c,rows,s){
 let movement=0,reserved=0,unresolved=0,selected=0,staked=0,settledRisk=0,outstandingProfit=0,potentialAvailable=true;
 for(const r of rows){const v=s.entries[key(r)];if(!v?.included)continue;selected++;const st=status(r);
  if(st==='NR')continue;
  staked+=v.liability_cents;
  if(st==='PENDING'){reserved+=v.liability_cents;unresolved++;outstandingProfit+=v.odds===null?10000:Math.round(v.liability_cents/(v.odds-1)*(1-c.commission_rate));continue;}
  settledRisk+=v.liability_cents;
  movement+=st==='LOSS'?-v.liability_cents:v.odds===null?10000:Math.round(v.liability_cents/(v.odds-1)*(1-c.commission_rate));
 }
 reserved+=c.carried_reserved_cents||0;
 let balance=(c.account_opening_cents??Math.round(c.opening_balance_gbp*100))+movement;
 let deposits=c.carried_deposits_cents??(c.date>=bankTrial.start?bankTrial.initial:opening(c,s.mode)),withdrawals=c.carried_withdrawals_cents||0,topup=0;
 // Unlimited fictional overdraft: losses remain negative; no automatic deposits.
 const net=balance+withdrawals-deposits;
 return {movement,reserved,unresolved,selected,staked,settledRisk,returned:staked+movement,percentage:settledRisk?movement/settledRisk*100:null,potential:potentialAvailable?movement+outstandingProfit:null,balance,available:balance-reserved,deposits,withdrawals,topup,net,bank_percentage:net/bankTrial.benchmark*100};
}
function persist(c,m,s){localStorage.setItem(storage(c.date,m),JSON.stringify(s));}
async function open(next='race'){
 next='race';
 stop();mode=next;const token=generation,d=day();
 const overlay=document.getElementById('jcm-detail-overlay'),node=overlay.querySelector('#jcm-detail-content');overlay.classList.add('open');
 delete node.jcmToggleAll;
 overlay.querySelector('.jcm-modal')?.scrollTo(0,0);node.innerHTML='<h2>Bet Builder</h2><p role="status">Loading…</p>';window.jcmAddAccountSwitch(node,next);overlay.querySelector('.jcm-close').focus();
 try{
  const days=await read('data/bet-builder-days.json');if(token!==generation)return;
  if(!days.days.includes(d))throw Error('No account card for date');
  let c=await card(d),rows=c.rows;const carried=await carriedBank(d,next,days);c.account_opening_cents=d>=bankTrial.start?carried.bank:opening(c,next);c.carried_reserved_cents=carried.reserved;c.carried_deposits_cents=carried.deposits;c.carried_withdrawals_cents=carried.withdrawals;
  if(token!==generation)return;
  let s=settings(c,next);
  function applyQuotes(){let changed=false;for(const r of rows){const v=s.entries[key(r)];if(v&&v.default_entry&&v.odds===null&&r.lay_odds!==null){v.odds=r.lay_odds;changed=true;}}if(changed)persist(c,next,s);}
  applyQuotes();
  const first=Math.min(...rows.map(off));
  if(d<bankTrial.start&&totals(c,rows,s).available<0)throw Error('Defaults exceed bank; reduce manual amounts before publication');
  function commit(candidate,message){
   if(d<bankTrial.start&&totals(c,rows,candidate).available<0){say('Insufficient available balance. Reduce the amount or uncheck an editable race.');return;}
   candidate.basis='Saved device choices';try{persist(c,next,candidate);}catch(_){say('Unable to save. Choices unchanged.');return;}
   s=candidate;if(node.jcmAutoSaving){const t=totals(c,rows,s),hasEstimate=rows.some(r=>selected(s,r)&&s.entries[key(r)]?.odds===null);for(const [name,value] of Object.entries({balance:t.balance,reserved:t.reserved,available:t.available}))node.querySelector('[data-builder-'+name+']').textContent=name==='available'&&d>=bankTrial.start?'Unlimited':money(value);node.querySelector('[data-builder-potential]').textContent=t.potential===null?'Unavailable':signedMoney(t.potential)+(hasEstimate?'*':'');node.querySelectorAll('[data-builder-row]').forEach((el,i)=>{const v=s.entries[key(rows[i])];el.querySelector('[data-builder-liability-value]').textContent=money(v?.included?v.liability_cents:0);});say(message);}else draw(message);
  }
  function say(message){node.querySelector('#builder-message').textContent=message;}
  function draw(message=''){
   if(token!==generation||!overlay.classList.contains('open'))return;
   const t=totals(c,rows,s),amountLocked=s.published||Date.now()>=first,hasEstimate=rows.some(r=>selected(s,r)&&s.entries[key(r)]?.odds===null);
   node.innerHTML='<h2>Bet Builder · '+names[next]+'</h2><label class="builder-date">Racing day <select id="builder-day">'+days.days.map(v=>'<option value="'+v+'" '+(v===d?'selected':'')+'>'+labelDate(v)+'</option>').join('')+'</select></label>'+
    (c.research_summary?'<p class="builder-note" data-research-coverage>'+safe(c.research_summary)+'</p>':'')+
    '<section class="builder-tile builder-potential"><h3>'+(t.unresolved?'Profit / Loss Calculator':'Profit / Loss')+'</h3><strong data-builder-potential>'+ (t.potential===null?'Unavailable':signedMoney(t.potential)+(hasEstimate?'*':''))+'</strong><p class="builder-note">'+(t.unresolved?'Simulation · after 5% commission · assumes remaining horses are beaten.':'Settled total · after 5% commission.')+(hasEstimate?'<br>* Estimate: +£100 for a lay win or −£500 for a lay loss where no odds were recorded.':'')+'</p></section>'+
    '<p id="builder-message" role="status">'+safe(message)+'</p><p class="builder-note">'+(s.published?'Simulation booked · published record retained across devices.':'Simulation · liability at risk · saved on this device.')+'</p>'+
    '<h3>'+labelDate(d)+' · '+rows.length+' races</h3>'+rows.map((r,i)=>{
     const v=s.entries[key(r)]||{included:false,liability_cents:0,odds:r.lay_odds??null},locked=s.published||Date.now()>=off(r),st=status(r),checkboxLocked=withdrawn(r)||(next==='fixed'?amountLocked:locked);
     const estimate=v.included&&v.odds===null&&['WIN','LOSS'].includes(st),settledAmount=st==='LOSS'?-v.liability_cents:st==='WIN'?(estimate?10000:Math.round(v.liability_cents/(v.odds-1)*.95)):null;
     return '<section class="jcm-manual-row builder-row" data-builder-row="'+i+'"><strong>'+safe(r.horse)+'</strong><p>'+safe(r.off_time_uk)+' · '+safe(r.course)+' · '+(locked?'Locked':'Editable')+'</p><label><input data-builder-include="'+i+'" type="checkbox" '+(selected(s,r)?'checked ':'')+(checkboxLocked?'disabled':'')+'> Include race</label>'+
      (next==='manual'?'<label for="builder-liability-'+i+'">Liability (£)</label><input id="builder-liability-'+i+'" data-builder-liability="'+i+'" type="number" min="0.01" step="0.01" value="'+(v.liability_cents?v.liability_cents/100:'')+'" '+(locked||withdrawn(r)?'disabled':'')+'>':'')+
      (r.simulation_price_basis?'<p class="builder-note">Betfair Exchange · assumed lay price '+safe(r.simulation_price_basis.assumed_lay_odds)+' · unverified, not live. Available money unknown.</p>':'')+'<label for="builder-odds-'+i+'">'+(r.simulation_price_basis?'Simulation lay odds':'Lay odds')+'</label><input id="builder-odds-'+i+'" data-builder-odds="'+i+'" type="number" min="1.01" max="1000" step="0.01" value="'+(v.odds??'')+'" '+(locked||withdrawn(r)?'disabled':'')+'><button data-builder-confirm-row="'+i+'" '+(locked||withdrawn(r)?'disabled':'')+'>'+ (next==='manual'?'Confirm race':'Save odds')+'</button><p>Liability: <strong data-builder-liability-value>'+money(v.included?v.liability_cents:0)+'</strong><br>Result: '+safe(st==='WIN'?'Horse lost':st==='LOSS'?'Horse won':st==='NR'?'Non-runner'+(withdrawn(r)?' (Betfair screenshot)':''):'Pending')+'<br>'+(settledAmount!==null?'Profit / loss: '+signedMoney(settledAmount)+(estimate?'*':''):(v.included&&v.odds!==null?'Potential net profit: '+money(Math.round(v.liability_cents/(v.odds-1)*.95)):'Estimated profit if horse loses: +£100.00*'))+'<br>Displayed liquidity: '+(r.available_stake_gbp!==null?money(Math.round(r.available_stake_gbp*100)):'Unavailable')+(v.included&&v.odds!==null&&Number.isFinite(r.available_stake_gbp)&&r.available_stake_gbp<v.liability_cents/100/(v.odds-1)?' · Insufficient liquidity':'')+'</p>'+ (v.included&&v.odds===null?'<p class="builder-note">* Estimate used because no pre-race lay odds were recorded.</p>':'')+'</section>';
    }).join('');
   function toggleRows(targets,checked){
    let candidate=structuredClone(s);candidate.choices={...s.choices};const stamp=new Date().toISOString();
    for(const r of targets){if(withdrawn(r)||Date.now()>=(next==='fixed'?first:off(r)))continue;const k=key(r);candidate.choices[k]=checked;const v=candidate.entries[k];if(!checked&&v)candidate.entries[k]={...v,included:false,confirmed_at:stamp};if((next==='race'||next==='manual')&&checked)candidate.entries[k]={included:true,liability_cents:next==='race'?50000:(v?.liability_cents||25000),odds:v?.odds??r.lay_odds??null,confirmed_at:stamp};}
    try{if(next==='fixed')candidate=allocation(candidate,rows,s.amount_cents,next);commit(candidate,checked?'Editable races selected with default or saved amounts.':'Editable races unselected; funds released.');}catch(e){draw(e.message);}
   }
   node.jcmToggleAll=checked=>toggleRows(rows,checked);
   window.jcmAddAccountSwitch(node,next);
   node.querySelector('#builder-day').addEventListener('change',e=>{document.getElementById('date').value=e.target.value;document.getElementById('date').dispatchEvent(new Event('change'));open(next);});
   // Daily and per-race amounts are policy locked.
   node.querySelectorAll('[data-builder-include]').forEach(box=>box.addEventListener('change',()=>{
    const i=Number(box.dataset.builderInclude),r=rows[i];if(withdrawn(r)||Date.now()>=(next==='fixed'?first:off(r))){draw('Race choice locked.');return;}
    toggleRows([r],box.checked);
   }));
   node.querySelectorAll('[data-builder-confirm-row]').forEach(button=>button.addEventListener('click',()=>{
    const i=Number(button.dataset.builderConfirmRow),r=rows[i];if(Date.now()>=off(r)){draw('Race locked at its scheduled start.');return;}
    if(withdrawn(r)){draw('Non-runner excluded.');return;}const odds=price(node.querySelector('[data-builder-odds="'+i+'"]').value);if(odds===null&&String(node.querySelector('[data-builder-odds="'+i+'"]').value).trim()){say('Enter decimal lay odds greater than 1, up to 1000.');return;}
    const candidate=structuredClone(s);let v=candidate.entries[key(r)]||{included:false,liability_cents:0};
    if(next==='manual'){const included=node.querySelector('[data-builder-include="'+i+'"]').checked,amount=cents(node.querySelector('[data-builder-liability="'+i+'"]').value);if(included&&amount===null){say('Enter a positive liability with at most two decimal places.');return;}v={...v,included,liability_cents:included?amount:0};candidate.choices={...s.choices,[key(r)]:included};}
    if(next!=='manual'&&!v.included){say('Include this race and confirm an amount first.');return;}
    candidate.entries[key(r)]={...v,odds,default_entry:false,confirmed_at:new Date().toISOString()};commit(candidate,'Race saved.');
   }));
   node.querySelectorAll('[data-builder-liability]').forEach(input=>{
    const save=()=>{const i=Number(input.dataset.builderLiability),v=s.entries[key(rows[i])];if(cents(input.value)===v?.liability_cents&&price(node.querySelector('[data-builder-odds="'+i+'"]').value)===v?.odds)return;node.jcmAutoSaving=true;try{node.querySelector('[data-builder-confirm-row="'+input.dataset.builderLiability+'"]').click();}finally{node.jcmAutoSaving=false;}};
    input.addEventListener('change',save);input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();save();}});
   });
   clearTimeout(lockTimer);const future=rows.map(off).filter(t=>t>Date.now());if(future.length)lockTimer=setTimeout(()=>draw('Race controls locked at the scheduled start.'),Math.min(...future)-Date.now()+1);
  }
  draw();
  refreshTimer=setInterval(async()=>{if(token!==generation||!overlay.classList.contains('open')){clearInterval(refreshTimer);return;}try{const updated=validateConfig(await read('data/bet-builder-'+d+'.json'),d);if(JSON.stringify(updated.rows.map(key))!==JSON.stringify(c.rows.map(key)))throw Error('Card changed');const carry=await carriedBank(d,next,days);updated.account_opening_cents=d>=bankTrial.start?carry.bank:opening(updated,next);updated.carried_reserved_cents=carry.reserved;updated.carried_deposits_cents=carry.deposits;updated.carried_withdrawals_cents=carry.withdrawals;const fresh=mergeResults(updated,await research(updated));if(JSON.stringify(fresh)!==JSON.stringify(rows)||updated.account_opening_cents!==c.account_opening_cents||updated.carried_reserved_cents!==c.carried_reserved_cents||updated.carried_deposits_cents!==c.carried_deposits_cents){c=updated;rows=fresh;applyQuotes();draw('Published prices and results refreshed.');}}catch(_){say('Results refresh unavailable; retaining the last loaded card.');}},30000);
 }catch(_){if(token===generation){node.innerHTML='<h2>Bet Builder · '+names[next]+'</h2><p>INSUFFICIENT VERIFIED DATA — strategy unavailable. Saved choices retained.</p>';window.jcmAddAccountSwitch(node,next);}}
}
async function history(days){
 const points={fixed:[],race:[],manual:[]},issues=[],coverageNotes={};
 const banks=Object.fromEntries(['fixed','race','manual'].map(m=>[m,{bank:bankTrial.initial,deposits:0,withdrawals:0,reserved:0,closed:0}]));
 const blocked=new Set();
 for(const d of [...days.days].filter(d=>d>=bankTrial.start).sort()){
  try{
   const c=await card(d),rows=c.rows;if(c.research_summary)coverageNotes[d]=c.research_summary;
   for(const m of ['fixed','race','manual']){
    if(blocked.has(m))continue;
    try{const s=settings(c,m),b=banks[m];c.account_opening_cents=b.bank;c.carried_deposits_cents=b.deposits;c.carried_withdrawals_cents=b.withdrawals;c.carried_reserved_cents=b.reserved;const t=totals(c,rows,s);
     const complete=!t.unresolved&&!t.reserved&&Date.now()>=Math.max(...rows.map(off));
     const closing=complete?t.balance:b.closed;
     points[m].push({date:d,balance:closing,opening:c.account_opening_cents,staked:t.staked,returned:t.returned,percentage:closing/bankTrial.benchmark*100,deposits:t.deposits,withdrawals:t.withdrawals,net:t.net,topup:t.topup,complete,basis:s.basis});
     banks[m]={bank:t.balance,deposits:t.deposits,withdrawals:t.withdrawals,reserved:t.reserved,closed:closing};
     if(t.unresolved||t.reserved)issues.push(d+' · '+names[m]+' pending or missing prices');
    }catch(_){blocked.add(m);issues.push(d+' · '+names[m]+' invalid or unfunded strategy');}
   }
  }catch(_){for(const m of ['fixed','race','manual'])blocked.add(m);issues.push(d+' unavailable');}
 }
 return {points,issues,coverageNotes};
}
function weekCommencing(d){
 const date=new Date(d+'T12:00:00Z');date.setUTCDate(date.getUTCDate()-((date.getUTCDay()+6)%7));return date.toISOString().slice(0,10);
}
async function raceProfitSummary(days){
 let total=0,wins=0,losses=0,pending=0,estimated=0,activeDays=0;const weeks=new Map();
 for(const d of [...days.days].sort()){
  const c=await card(d),plan=c.published_simulations?.race;
  if(Array.isArray(c.rows)&&c.rows.length){activeDays++;const week=weekCommencing(d),current=weeks.get(week)||{profit:0,estimated:0,entries:[],activeDays:0};current.activeDays++;weeks.set(week,current);}
  if(plan&&!Array.isArray(plan.entries))throw Error('Invalid recorded £500 plan');
  for(const row of c.rows){
   const entries=(plan?.entries||[]).filter(entry=>row.race_id===entry.race_id&&row.horse_id===entry.horse_id);
   if(entries.length>1)throw Error('Duplicate recorded £500 bet');
   const entry=entries[0]||null;
   if(entry&&(entry.liability_cents!==50000||price(entry.odds)!==entry.odds))throw Error('Invalid recorded £500 bet');
   const st=status(row);
   if(st==='PENDING'){pending++;continue;}
   if(st==='NR')continue;
   const estimate=!entry,movement=st==='LOSS'?-50000:estimate?10000:Math.round(50000/(entry.odds-1)*(1-c.commission_rate));
   if(st==='WIN')wins++;else losses++;
   if(estimate)estimated++;
   total+=movement;const week=weekCommencing(d),current=weeks.get(week)||{profit:0,estimated:0,entries:[]};
   current.profit+=movement;if(estimate)current.estimated++;current.entries.push({date:d,off_time_uk:row.off_time_uk,course:row.course,horse:row.horse,status:st,odds:entry?.odds??null,profit:movement,estimated:estimate});weeks.set(week,current);
  }
 }
 return {total,wins,losses,pending,estimated,activeDays,weeks:[...weeks].sort(([a],[b])=>b.localeCompare(a)).map(([week,value])=>({week,profit:value.profit,activeDays:value.activeDays||0,estimated:value.estimated,entries:value.entries.sort((a,b)=>a.date.localeCompare(b.date)||a.off_time_uk.localeCompare(b.off_time_uk))}))};
}
const shortDate=d=>new Date(d+'T12:00:00Z').toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'2-digit'});
const signedMoney=v=>v<0?'-'+money(-v):v>0?'+'+money(v):money(0);
async function updateHubProfit(){
 const node=document.getElementById('jcm-profit-summary');if(!node)return;
 try{
  const summary=await raceProfitSummary(await read('data/bet-builder-days.json'));
  const perActiveDay=summary.activeDays?Math.round(summary.total/summary.activeDays):0;
  node.innerHTML='<div class="jcm-profit-total"><span>Profit / Loss</span><strong class="'+(summary.total>0?'positive':summary.total<0?'negative':'')+'">'+signedMoney(summary.total)+'</strong></div><p class="jcm-profit-record">'+summary.wins+' '+(summary.wins===1?'win':'wins')+' / '+summary.losses+' '+(summary.losses===1?'loss':'losses')+' · £500 liability per race</p><div class="jcm-profit-weeks">'+(summary.weeks.length?summary.weeks.map((w,i)=>'<section class="jcm-profit-week"><button type="button" class="jcm-profit-week-head" data-profit-week="'+i+'" aria-expanded="false" aria-controls="jcm-profit-week-'+i+'"><span>WC '+shortDate(w.week)+'</span><strong class="'+(w.profit>0?'positive':w.profit<0?'negative':'')+'">'+signedMoney(w.profit)+(w.estimated?'*':'')+'</strong><span class="jcm-week-chevron" aria-hidden="true">⌄</span></button><div id="jcm-profit-week-'+i+'" class="jcm-profit-week-detail" hidden><div class="jcm-profit-daily-stats"><div class="jcm-profit-daily-stat"><span>Weekly profit / loss</span><strong>'+signedMoney(w.profit)+'</strong></div><div class="jcm-profit-daily-stat"><span>Days active</span><strong>'+w.activeDays+'</strong></div><div class="jcm-profit-daily-stat"><span>Profit / loss per day</span><strong>'+signedMoney(w.activeDays?Math.round(w.profit/w.activeDays):0)+'</strong></div></div>'+w.entries.map(e=>'<div class="jcm-profit-entry"><strong>'+safe(e.horse)+'</strong><small>'+shortDate(e.date)+' · '+safe(e.off_time_uk)+' · '+safe(e.course)+' · '+(e.status==='WIN'?'Horse lost · Lay win':'Horse won · Lay loss')+(e.odds!==null?' · Lay '+e.odds:' · No recorded lay odds')+'</small><span class="'+(e.profit>0?'positive':'negative')+'">'+signedMoney(e.profit)+(e.estimated?'*':'')+'</span></div>').join('')+(w.estimated?'<small class="builder-note">* Estimate: +£100 for a lay win or −£500 for a lay loss where no odds were recorded.</small>':'')+'</div></section>').join(''):'<p>No settled £500 bets yet.</p>')+'</div><small>Settled recorded bets · 5% commission</small>';
  node.querySelectorAll('[data-profit-week]').forEach(button=>button.addEventListener('click',()=>{const detail=node.querySelector('#'+button.getAttribute('aria-controls')),open=button.getAttribute('aria-expanded')==='true';button.setAttribute('aria-expanded',String(!open));detail.hidden=open;}));
 }catch(_){node.innerHTML='<p>Profit / loss unavailable.</p>';}
}
async function results(node,days,token){
 const {points,issues,coverageNotes}=await history(days);
 if(token!==generation)return;
 const allDates=[...new Set(Object.values(points).flat().map(p=>p.date))].sort();
 if(!resultsMonth)resultsMonth=(allDates.at(-1)||day()).slice(0,7);
 const dates=allDates.filter(d=>d.startsWith(resultsMonth));
 if(!dates.includes(resultsDay))resultsDay=dates.at(-1)||null;
 const monthLabel=new Date(resultsMonth+'-01T12:00:00Z').toLocaleDateString('en-GB',{month:'long',year:'numeric'});
 const d=resultsDay,i=dates.indexOf(d);
 node.innerHTML='<div class="builder-results-compact"><h2>Bet Builder · Results</h2>'+
  '<div class="builder-month-nav"><button data-month-prev aria-label="Previous month">‹</button><strong>'+monthLabel+'</strong><button data-month-next aria-label="Next month">›</button></div>'+chart(points,resultsMonth)+
  (d?'<section class="builder-day-card" data-results-day="'+d+'"><div class="builder-results-date"><label for="builder-results-day">Date <select id="builder-results-day">'+dates.map(v=>'<option value="'+v+'" '+(v===d?'selected':'')+'>'+labelDate(v)+'</option>').join('')+'</select></label><div><button data-results-prev '+(i<=0?'disabled':'')+' aria-label="Previous day">‹</button><button data-results-next '+(i>=dates.length-1?'disabled':'')+' aria-label="Next day">›</button></div></div><table class="builder-results-table"><thead><tr><th scope="col">Starting tally</th><th scope="col">Current tally</th><th scope="col">Variance vs £10k</th></tr></thead>'+['fixed','race','manual'].map(m=>{const p=points[m].find(p=>p.date===d);return '<tbody data-results-strategy="'+m+'"><tr><th scope="rowgroup" colspan="3"><i style="background:'+colours[m]+'"></i>'+names[m]+'</th></tr><tr><td data-result-start>£0.00</td><td data-result-balance class="'+(p?.balance>0?'builder-positive':p?.balance<0?'builder-negative':'')+'">'+(p?money(p.balance):'—')+'</td><td data-result-percentage class="'+(p?.percentage>0?'builder-positive':p?.percentage<0?'builder-negative':'')+'">'+(p?percent(p.percentage):'—')+'</td></tr></tbody>';}).join('')+'</table></section>':'')+'</div>';
 window.jcmAddAccountSwitch(node,'results');
 const change=v=>{resultsDay=v;results(node,days,token);};
 const moveMonth=delta=>{const dt=new Date(resultsMonth+'-01T12:00:00Z');dt.setUTCMonth(dt.getUTCMonth()+delta);resultsMonth=dt.toISOString().slice(0,7);resultsDay=null;results(node,days,token);};
 node.querySelector('[data-month-prev]').addEventListener('click',()=>moveMonth(-1));
 node.querySelector('[data-month-next]').addEventListener('click',()=>moveMonth(1));
 node.querySelector('#builder-results-day')?.addEventListener('change',e=>change(e.target.value));
 node.querySelector('[data-results-prev]')?.addEventListener('click',()=>change(dates[i-1]));
 node.querySelector('[data-results-next]')?.addEventListener('click',()=>change(dates[i+1]));
}
function chart(points,month){
 const count=new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate();
 const dates=Array.from({length:count},(_,i)=>month+'-'+String(i+1).padStart(2,'0'));
 const monthly=Object.fromEntries(Object.entries(points).map(([m,ps])=>[m,ps.filter(p=>p.complete&&p.date.startsWith(month)&&Number.isFinite(p.percentage))]));
 const values=Object.values(monthly).flat().map(p=>p.percentage),lo=values.length?Math.min(...values):0,hi=values.length?Math.max(...values):0;
 const min=lo===hi?lo-1:lo,max=lo===hi?hi+1:hi;
 const x=d=>44+dates.indexOf(d)/(count-1)*348,y=v=>202-(v-min)/(max-min)*180;
 const ordinal=n=>n+(n%100>=11&&n%100<=13?'th':({1:'st',2:'nd',3:'rd'}[n%10]||'th'));
 let svg='<svg id="builder-chart" data-month="'+month+'" data-min="'+min+'" data-max="'+max+'" viewBox="0 0 420 278" role="img" aria-label="Three cumulative profit and loss percentages relative to a £10,000 benchmark"><title>'+month+' daily percentage returns after commission</title><g data-shared-plot>';
 for(const value of [min,(min+max)/2,max]){const py=y(value);svg+='<line x1="44" x2="392" y1="'+py+'" y2="'+py+'" stroke="#52647b" opacity=".6"/><text data-percentage-axis x="39" y="'+(py+4)+'" text-anchor="end" fill="#fff" font-size="10">'+value.toFixed(2)+'%</text>';}
 if(min<=0&&max>=0)svg+='<line data-break-even="0" x1="44" x2="392" y1="'+y(0)+'" y2="'+y(0)+'" stroke="#fff" stroke-dasharray="4 5" opacity=".65"/>';
 for(const [m,colour] of Object.entries(colours)){
  const ps=monthly[m],style={fixed:{width:6,dash:'',radius:5.2},race:{width:4,dash:'7 4',radius:3.8},manual:{width:2,dash:'2 3',radius:2.3}}[m];
  const byDate=new Map(ps.map(p=>[p.date,p])),segments=[];let segment=[];
  for(const d of dates){const p=byDate.get(d);if(p)segment.push(p);else if(segment.length){segments.push(segment);segment=[];}}if(segment.length)segments.push(segment);
  if(ps.length)svg+='<g data-strategy-line="'+m+'" stroke="'+colour+'">'+segments.map(segment=>'<polyline points="'+segment.map(p=>x(p.date)+','+y(p.percentage)).join(' ')+'" fill="none" stroke="'+colour+'" stroke-width="'+style.width+'" stroke-dasharray="'+style.dash+'"/>').join('')+'</g>';
  ps.forEach(p=>{const full=points[m].filter(p=>Number.isFinite(p.percentage)),i=full.findIndex(v=>v.date===p.date),previous=i>0?full[i-1].percentage:0,delta=p.percentage-previous,fill=delta>1e-9?'#43bd84':delta<-1e-9?'#ff5776':'#edbd57';svg+='<circle data-strategy-dot="'+m+'" data-date="'+p.date+'" data-percentage="'+p.percentage+'" cx="'+x(p.date)+'" cy="'+y(p.percentage)+'" r="'+style.radius+'" fill="'+fill+'" stroke="'+colour+'" stroke-width="1.3"><title>'+names[m]+' · '+p.date+' · '+percent(p.percentage)+' · Staked '+money(p.staked)+' · Returned '+money(p.returned)+'</title></circle>';});
 }
 svg+='</g>';
 dates.forEach((d,i)=>svg+='<text data-calendar-day="'+d+'" transform="translate('+x(d)+' 214) rotate(45)" text-anchor="start" fill="#fff" font-size="9">'+ordinal(i+1)+'</text>');
 svg+='<g data-chart-legend transform="translate(0 264)">'+Object.entries(colours).map(([m,colour],i)=>'<g data-legend-strategy="'+m+'" transform="translate('+(44+i*124)+' 0)"><line x1="0" x2="15" y1="-4" y2="-4" stroke="'+colour+'" stroke-width="3"/><text x="20" y="0" fill="'+colour+'" font-size="11" font-weight="700">'+names[m]+'</text></g>').join('')+'</g>';
 return '<section class="builder-tile builder-chart-tile">'+svg+'</svg></section>'+'';
}
window.jcmOpenDummyAccount=()=>open('race');
window.jcmOpenBuilderStrategy=()=>open('race');
updateHubProfit();
setInterval(()=>{if(!document.hidden)updateHubProfit();},30000);
const accountOverlay=document.getElementById('jcm-detail-overlay');
accountOverlay.querySelector('.jcm-close').addEventListener('click',stop);
accountOverlay.addEventListener('click',e=>{if(e.target===accountOverlay)stop();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')stop();});
})();
