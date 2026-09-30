'use strict';
/* ---------- route shaping: options, detour, scout ---------- */
['avoidMotorway','avoidToll','avoidFerry','avoidUnpaved','smaller','shortest','alt'].forEach(k=>{const el=$('ro_'+k);el.checked=!!S.ro[k];el.onchange=()=>{S.ro[k]=el.checked;S.ro.altIndex=0;save()}});
const dtLab=()=>{$('dtVal').textContent=S.sh.dtPct>0?'+'+S.sh.dtPct+' % longer':'0 % (fastest)'};
$('dtPct').value=S.sh.dtPct;$('dtWhere').value=S.sh.dtWhere;$('dtSide').value=S.sh.dtSide;dtLab();
$('dtPct').oninput=e=>{S.sh.dtPct=+e.target.value;dtLab();save()};$('dtWhere').onchange=e=>{S.sh.dtWhere=e.target.value;save()};$('dtSide').onchange=e=>{S.sh.dtSide=e.target.value;save()};
$('scKind').value=S.sh.scKind;$('scTag').value=S.sh.scTag;$('scR').value=S.sh.scR;$('scFrom').value=S.sh.scFrom;$('scTo').value=S.sh.scTo;
const scTagVis=()=>{$('scTagW').hidden=S.sh.scKind!=='custom'};scTagVis();
$('scKind').onchange=e=>{S.sh.scKind=e.target.value;scTagVis();save()};$('scTag').oninput=e=>{S.sh.scTag=e.target.value;save()};
[['scR','scR'],['scFrom','scFrom'],['scTo','scTo']].forEach(([id,k])=>$(id).oninput=e=>{const v=+e.target.value;if(v>=0){S.sh[k]=v;save()}});
document.querySelectorAll('#shape [data-r]').forEach(b=>b.onclick=()=>{S.sh.scR=+b.dataset.r;$('scR').value=S.sh.scR;save()});
function shapeNote(){ // shown in the plan status: detour result + alternatives + ignored options
 const d=plan&&plan.detour;let h='';
 if(d&&d.error)h+=`<div class="note" style="margin-top:8px">Detour search failed (${esc(d.error)}) — showing the fastest route.</div>`;
 else if(d){const b=d.base;h+=`<div class="note" style="margin-top:8px"><b>Detour:</b> fastest route ${f1(b.dist/1000,0)} km · ${fmtDur(b.dur/60)} → yours ${f1(plan.route.dist/1000,0)} km (${d.pctDist>=0?'+':''}${f1(d.pctDist,1)} %) · ${fmtDur(plan.route.dur/60)} (${d.pctTime>=0?'+':''}${f1(d.pctTime,1)} % time; asked ${d.target} %) — bulge to the ${d.side}, ${d.where==='whole'?'over the whole stretch':'mainly '+(d.where==='middle'?'in the middle':'at the '+d.where)}. <span class="sub">${d.tries.length} routing calls.</span></div>`}
 const ig=plan&&plan.route&&plan.route.optionsIgnored;if(ig)h+=`<div class="note" style="margin-top:8px">${esc(ig.join(' '))}</div>`;
 const alts=plan&&plan.route&&plan.route.alts;if(alts&&alts.length>1)h+=`<div class="row" style="margin-top:8px;gap:6px"><span class="sub">alternatives</span>${alts.map((a,i)=>`<button class="b g sm" data-alt="${i}" aria-pressed="${i===(S.ro.altIndex||0)}">${i===0?'fastest':'option '+(i+1)} · ${f1(a.dist/1000,0)} km · ${fmtDur(a.dur/60)}</button>`).join('')}</div>`;
 return h;
}
$('planStat').addEventListener('click',e=>{const b=e.target.closest('[data-alt]');if(!b)return;S.ro.altIndex=+b.dataset.alt;save();$('planBtn').click()});
function scoutSpec(){return{kind:S.sh.scKind,tag:S.sh.scTag,radiusKm:S.sh.scR,from:S.sh.scFrom/100,to:S.sh.scTo/100}}
function renderScout(){
 const el=$('scOut'),sc=plan&&plan.scout;if(!sc){el.innerHTML='';return}
 const c=sc.cands[sc.idx],k=C.SCOUT_KINDS[sc.kind];const totKm=plan.route.dist/1000;
 el.innerHTML=`<div class="ptinfo"><div class="row" style="justify-content:space-between"><b>📍 ${esc(c.label)}</b><span class="sub">${sc.idx+1} of ${sc.cands.length} picked from ${sc.total} found · via ${esc(sc.layer)}</span></div>
  <div style="margin-top:4px">${f1(c.distKm,1)} km to the <b>${c.side}</b> of your route, at ${Math.round(c.frac*100)} % of the way (≈ km ${f1(c.frac*totKm,0)}).</div>
  <div style="margin-top:4px"><i>Good luck exploring!</i> <span class="sub">${sc.hint?'Hint: '+esc(sc.hint)+'.':'…'} (We don’t say what — that’s the fun.)</span></div>
  <div class="row" style="margin-top:8px;gap:6px"><button class="b g sm" id="scNext">Another one</button><button class="b g sm" id="scShow">Show on map</button><button class="b sm" id="scUse">Add as via &amp; re-plan</button></div></div>`;
 $('scNext').onclick=()=>{sc.idx=(sc.idx+1)%sc.cands.length;sc.hint=null;renderScout();drawMap(true);scHint()};
 $('scShow').onclick=()=>{mapGoTo(c.ll,11);try{$('mapCard').scrollIntoView({behavior:'smooth',block:'start'})}catch(e){}};
 $('scUse').onclick=()=>{const cl=c.label.replace(/ — unnamed$/,'')+' ('+(k?k.label:'stop')+')';S.known[cl]=c.ll;
  const names=S.places.filter(x=>x.trim()),cum=C.cumDist(C.denseCoords(plan.route.coords)),dense=C.denseCoords(plan.route.coords);
  const fr=(plan.pts||[]).map(p=>C.fracOnRoute(dense,cum,p).frac);let pos=fr.findIndex((f,i)=>i>0&&f>c.frac);if(pos<1)pos=names.length-1;if(pos<1)pos=1;
  const all=S.places.slice(),nonEmpty=all.map((x,i)=>x.trim()?i:-1).filter(i=>i>=0);all.splice(nonEmpty[pos]!=null?nonEmpty[pos]:all.length-1,0,cl);S.places=all;S.sh.scKind=S.sh.scKind;buildPlaces();save();$('planBtn').click()};
}
async function scHint(){const sc=plan&&plan.scout;if(!sc)return;const my=sc.idx,c=sc.cands[my];try{const r=await C.scoutHint(c.ll,env());if(plan.scout===sc&&sc.idx===my){sc.hint=r.level;renderScout()}}catch(e){if(plan.scout===sc&&sc.idx===my){sc.hint='couldn’t peek';renderScout()}}}
$('scGo').onclick=async()=>{
 const b=$('scGo'),el=$('scOut');if(S.sh.scKind==='off'){el.innerHTML='<div class="sub">Choose what to look for first.</div>';return}
 if(!plan||!plan.route||plan.sample){el.innerHTML='<div class="sub">Plan a route first — the pick is made along it.</div>';return}
 b.disabled=true;b.textContent='Searching…';el.innerHTML='<div class="sub">Looking around the middle of your route…</div>';
 try{const r=await C.scout(plan.route,scoutSpec(),env());plan.scout={cands:r.cands,idx:0,kind:r.kind,layer:r.layer,total:r.total,hint:null};renderScout();drawMap(true);scHint()}
 catch(e){el.innerHTML=`<div class="note"><b class="err">No pick.</b> ${esc(e.message)}</div>`}
 b.disabled=false;b.textContent='Pick one';
};

