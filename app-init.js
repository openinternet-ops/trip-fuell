'use strict';
/* ---------- init ---------- */
buildCtl();bindAn();buildPlaces();buildPrices();buildProf();$('round').checked=S.round;
syncCtl();drawCar();carOut();renderLog();
showTab(TABS.some(t=>t[0]===S.tab)?S.tab:'car');
{const bm=document.querySelector('meta[name=build]');if($('buildId')&&bm)$('buildId').textContent='build '+bm.content}
const isDefault=S.places.length===2&&S.places[0]==='Wesel'&&S.places[1]==='Dieren';
if(isDefault)setSample(true);
else{plan=null;segs=[];calcRoute();renderAnatomy();drawMap();$('planStat').innerHTML='<div class="note">Routes are not remembered between visits — your places are. Press <b>Plan route</b> to load them again (or “Load sample” for the built-in Wesel→Dieren route).</div>'}
