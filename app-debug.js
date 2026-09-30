'use strict';
/* ---------- DEBUG ---------- */
const LAYERS=[['Geocode','nominatim'],['Geocode','photon'],['Geocode','gazetteer'],['Route','osrm'],['Route','valhalla'],['Route','straight-line'],['Roads','smart-probes'],['Roads','cluster-guess'],['Roads','osrm-step-heuristic'],['Roads','overpass'],['Roads','overpass-mirror'],['Roads','overpass-light']];
function renderDebug(){
 $('layers').innerHTML=LAYERS.map(([s,l])=>`<label class="row" style="gap:6px"><input type="checkbox" data-l="${l}" ${S.disabled[l]?'':'checked'}> <span class="sub" style="width:64px">${s}</span><span class="mono">${l}</span></label>`).join('');
 $('offline').checked=!!S.offline;renderLog();updRunsUI();
}
$('layers').addEventListener('change',e=>{const l=e.target.dataset.l;if(l){if(e.target.checked)delete S.disabled[l];else S.disabled[l]=true;save()}});
$('offline').onchange=e=>{S.offline=e.target.checked;save()};
$('resetAll').onclick=()=>{try{localStorage.removeItem(KEY)}catch(e){}location.reload()};
$('selfTest').onclick=async()=>{
 const res=[],ok=(n,c)=>res.push((c?'✓ ':'✗ ')+n);
 const car=Object.assign({},C.PRESETS.partner),p=clone(C.DEFAULT_PARAMS);
 const c100=C.cruise(100,car,p).l100;ok('Partner @100 km/h in 5.5–8.5 L/100 ('+c100.toFixed(2)+')',c100>5.5&&c100<8.5);
 ok('lower tyre pressure ⇒ more fuel',C.cruise(100,Object.assign({},car,{tyreBar:1.8}),p).l100>c100);
 ok('bigger Cd ⇒ more fuel',C.cruise(100,Object.assign({},car,{cdOverride:0.45}),p).l100>c100);
 ok('NL/DE border sanity',C.countryAt(51.66,6.62)==='DE'&&C.countryAt(52.05,6.10)==='NL');
 const fake={fetch:()=>Promise.reject(new Error('mock down')),log:()=>{},timeoutMs:500,disabled:{}};
 try{const r=await C.planRoute(['Wesel','Dieren'],fake);ok('all network down ⇒ still a route ('+r.routeLayer+' / '+r.classLayer+')',!!r.segs&&r.segs.length>0)}catch(e){ok('all network down ⇒ still a route',false)}
 try{await C.planRoute(['Nowhereville-xyz','Dieren'],fake);ok('unknown place fails clearly',false)}catch(e){ok('unknown place fails with clear error',/geocode/.test(e.message))}
 const s=C.sampleRoute();ok('sample route computes',C.computeRoute(s.segs,car,p,S.prices,C.PROFILES.limit).total.cost>0);
 $('stOut').innerHTML=res.map(r=>`<div class="${r[0]==='✓'?'ok':'err'}" style="color:var(--${r[0]==='✓'?'ok':'bad'})">${esc(r)}</div>`).join('');
};

