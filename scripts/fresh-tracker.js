/* Presentation and summaries for the fresh tracker; original card styling is shared. */
(()=>{
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=document.getElementById('date');
const menu=document.getElementById('jcm-menu-content');
if(menu)menu.innerHTML='<p>Current racing run from Friday 6 November 2026. £0 starting tally; unlimited simulated overdraft. Results checked with Sporting Life or The Racing API. Earlier records are retained in history.</p>';
const cards=document.querySelectorAll('.metrics .metric');
if(cards[1])cards[1].querySelector('small').textContent='SUCCESSES';
if(cards[2])cards[2].querySelector('small').textContent='FAILURES';
let rows=[];
const show=html=>{const o=document.getElementById('jcm-detail-overlay');o.querySelector('#jcm-detail-content').innerHTML=html;o.classList.add('open');o.querySelector('.jcm-close').focus();};
function rated(){const groups=[['Potential selection',rows.filter(r=>r.tier==='potential')],['Watchlist',rows.filter(r=>r.tier==='watchlist')],['Entries',rows.filter(r=>r.tier==='entry')]];return groups.map(([label,rs])=>{const settled=rs.filter(r=>window.jcmAcceptedResult(r)&&['WIN','LOSS'].includes(r.result_status)),w=settled.filter(r=>r.result_status==='WIN').length,l=settled.length-w;return [label,w,l,settled.length?(100*w/settled.length).toFixed(1)+'%':'—'];});}
window.jcmOpenRatedPerformance=()=>show('<h2>Rated Performance</h2><table class="jcm-rated-table"><thead><tr><th>Original status</th><th>Success / Failure</th><th>Success rate</th></tr></thead><tbody>'+rated().map(r=>'<tr><td>'+r[0]+'</td><td>'+r[1]+' / '+r[2]+'</td><td>'+r[3]+'</td></tr>').join('')+'</tbody></table><p>All tracked outcomes are included. No numerical confidence scores were assigned.</p>');
(async()=>{try{const m=await(await fetch('data/rated-performance-sources.json',{cache:'no-store'})).json();const ds=await Promise.all(m.sources.map(async p=>(await fetch(p,{cache:'no-store'})).json()));rows=ds.flatMap(d=>[...d.high_competition,...d.competition_watchlist]);const n=document.getElementById('jcm-rated-ratios');if(n)n.innerHTML=rated().map(r=>'<span class="jcm-rated-line"><b>'+esc(r[0])+'</b><span>'+r[1]+' / '+r[2]+'</span><b>'+r[3]+'</b></span>').join('');}catch{document.getElementById('jcm-rated-ratios').textContent='Results unavailable';}})();
// Retire stale cached racing responses when upgrading an installed home-screen app.
if('serviceWorker' in navigator)navigator.serviceWorker.getRegistrations().then(rs=>Promise.all(rs.map(r=>r.unregister()))).catch(()=>{});
if('caches' in window)caches.keys().then(keys=>Promise.all(keys.filter(k=>/^jcm/i.test(k)).map(k=>caches.delete(k)))).catch(()=>{});
})();
