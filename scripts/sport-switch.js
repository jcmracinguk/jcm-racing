/* Two independent paper trials; switching never changes either ledger. */
(()=>{
 'use strict';
 const football=document.body.dataset.sport==='football';
 for(const host of [document.querySelector('.identity'),document.querySelector('.jcm-hub-top')]){
  if(!host)continue;
  const label=document.createElement('label');label.className='jcm-sport-switch';
  label.innerHTML='<input type="checkbox" role="switch" aria-label="Football view" '+(football?'checked':'')+'><span class="jcm-sport-label">Racing</span><span class="jcm-sport-track" aria-hidden="true"><span></span></span><span class="jcm-sport-label">Football</span>';
  const logo=host.querySelector('.jcm-logo-button')||host.querySelector('img');
  if(logo)logo.after(label);else host.prepend(label);
  label.querySelector('input').addEventListener('change',e=>{
   const hash=location.hash==='#picks'?'#picks':'#hub';
   location.assign((e.target.checked?'football.html':'index.html')+hash);
  });
 }
})();
