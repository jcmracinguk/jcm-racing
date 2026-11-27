/* Switch between the UK and International racing views. */
(()=>{
 'use strict';
 const football=document.body.dataset.sport==='football';
 const international=document.body.dataset.sport==='international';
 const labels=football?['Racing','Football']:['UK','International'];
 for(const host of [document.querySelector('.identity'),document.querySelector('.jcm-hub-top')]){
  if(!host)continue;
  const label=document.createElement('label');label.className='jcm-sport-switch';
  label.innerHTML='<input type="checkbox" role="switch" aria-label="'+labels[1]+' view" '+(football||international?'checked':'')+'><span class="jcm-sport-label">'+labels[0]+'</span><span class="jcm-sport-track" aria-hidden="true"><span></span></span><span class="jcm-sport-label">'+labels[1]+'</span>';
  const logo=host.querySelector('.jcm-logo-button')||host.querySelector('img');
  if(logo)logo.after(label);else host.prepend(label);
  label.querySelector('input').addEventListener('change',e=>{
   const hash=['#todays-bets','#results','#picks','#watch-list'].includes(location.hash)?location.hash:'#hub';
   const destination=e.target.checked?'index.html?region=international':'index.html';
   location.assign(destination+hash);
  });
 }
})();
