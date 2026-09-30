'use strict';
/* ---------- RUNS, EXPORT, STANDARD CHECK ---------- */
const DEFAULT_SUITE=`Wesel -> Dieren
Dieren -> Arnhem
Amsterdam -> Utrecht
Apeldoorn -> Zutphen
Zwolle -> Groningen
Venlo -> Duisburg
Bocholt -> Winterswijk
Brussels -> Antwerp
Molenbeek-Saint-Jean, Brussels -> Royal Palace of Laeken, Brussels
Amsterdam -> Berlin`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function levelTotals(s,prof){const T=C.computeRoute(s,S.car,S.params,S.prices,prof).total;return{segments:s.length,km:+T.km.toFixed(2),L:+T.L.toFixed(2),l100:+T.l100.toFixed(2),eur:+T.cost.toFixed(2),min:Math.round(T.sec/60),stops:+T.stops.toFixed(1)}}
function runRecord(label,places,res,slice,ms,extra){
 const A=res&&res.analysis,lv={};
 if(A){try{lv.L0=C.level0(A,res.route);lv.L1=C.level1(A);lv.L2g=C.buildSegments(A,[])}catch(e){}}
 const kind=/^overpass/.test(res.classLayer)?'L3':/^smart-probes/.test(res.classLayer)?'L2p':'L2g';
 if(res.segs&&(kind!=='L2g'||!lv.L2g))lv[kind]=res.segs;
 const levels={};Object.keys(lv).forEach(k=>{levels[k]={};Object.keys(S.profiles).forEach(pk=>levels[k][pk]=levelTotals(lv[k],S.profiles[pk]))});
 return{id:Date.now()+Math.random(),when:new Date().toISOString(),label,places,ms,page:{proto:location.protocol,online:navigator.onLine},
  settings:{mode:S.mode,an:S.an,profile:S.profileKey,profiles:S.profiles,disabled:S.disabled},
  car:{massKg:C.totalMass(S.car),Cd:+C.estimateCd(S.car).cd.toFixed(3),A:+C.frontalArea(S.car).toFixed(2),Crr:+C.crr(S.car).toFixed(4),calib:S.params.calib,coldStartL:S.params.coldStartL},prices:S.prices,
  shape:{ro:S.ro,sh:S.sh,detour:res.detour?(res.detour.error?{error:res.detour.error}:{pctTime:+res.detour.pctTime.toFixed(1),pctDist:+res.detour.pctDist.toFixed(1),target:res.detour.target,where:res.detour.where,side:res.detour.side,tries:res.detour.tries}):null,scout:plan&&plan.scout?{pick:plan.scout.cands[plan.scout.idx].label,distKm:+plan.scout.cands[plan.scout.idx].distKm.toFixed(1),frac:+plan.scout.cands[plan.scout.idx].frac.toFixed(2),of:plan.scout.cands.length}:null},layers:{geocode:res.info?res.info.geocode:null,route:res.routeLayer,roads:res.classLayer,finalKind:kind},notes:res.notes||[],
  route:res.route?{km:+(res.route.dist/1000).toFixed(2),osrmMin:Math.round(res.route.dur/60)}:null,levels,
  finalSegments:(res.segs||[]).map(s=>({name:s.name,hw:s.hw,limit:s.limit,unlimited:!!s.unlimited,country:s.country,km:+(s.len/1000).toFixed(2),signals:s.signals,avgKmh:s.avgKmh?Math.round(s.avgKmh):null,src:s.src||null})),
  analysis:A?{roads:A.steps.map(s=>[s.label,Math.round(s.dist),Math.round(s.dur),s.ci]),
   clusters:A.clusters.map(c=>({id:c.id,kind:c.g.kind,fromKm:+(c.startM/1000).toFixed(2),toKm:+(c.endM/1000).toFixed(2),turns:c.turns,medianStepM:Math.round(c.medLen),modeStepM:Math.round(c.modeLen),crossMinOsrm:+(c.dur/60).toFixed(1),crossMinModel:(()=>{const m=crossModelMin(c);return m==null?null:+m.toFixed(1)})(),avgKmh:Math.round(c.avgV*3.6),guess:c.g.hw,conf:c.g.conf,why:c.g.why,bridge:c.bridge.map(b=>({to:b.to,km:+(b.distM/1000).toFixed(2),min:+(b.sec/60).toFixed(1)})),samples:c.samples.map(s=>({kind:s.kind,km:+s.km.toFixed(2)}))})),
   deltas:A.deltas.map(d=>({km:+d.kmFromStart.toFixed(2),before:d.before,after:d.after})),
   methods:methodsSummary(A),activeMethod:A.method,graph:(()=>{try{return graphExport(A,A.method)}catch(e){return null}})(),checkpoints:A.checkpoints.map(c=>({key:c.key,label:c.label,km:+c.kmFromStart.toFixed(2),min:Math.round(c.minFromStart),roadNo:c.roadNo,road:c.road,lenM:Math.round(c.len),kmh:c.v?Math.round(c.v*3.6):null,guess:c.guess,probe:c.probe||null})),
   probes:A.probeRaw||null,probeStat:A.probeStat||null,probeMs:A.probeMs||null,lightCounts:A.signalCounts||null,notes:A.notes}:null,
  log:slice,extra:extra||null};
}
function addRun(r){S.runs.push(r);while(S.runs.length>15||JSON.stringify(S.runs).length>3.5e6)S.runs.shift();save();updRunsUI()}
function updRunsUI(){const n=$('exClear');if(n)n.textContent='Clear runs ('+S.runs.length+')'}
function exportBundle(){
 let cur=null;if(plan&&plan.analysis){cur=runRecord('(current screen)',plan.places||S.places,{route:plan.route,routeLayer:plan.routeLayer,classLayer:plan.classLayer,analysis:plan.analysis,segs:segs,info:{geocode:plan.geocode},notes:plan.notes},[],null,{curLevel,editedSegments:true})}
 return JSON.stringify({app:'trip-fuel',exportedAt:new Date().toISOString(),runsCount:S.runs.length,currentScreen:cur,runs:S.runs,sessionLog:log.slice().reverse().map(l=>[l.t,l.stage,l.layer,l.msg])},null,1);
}
async function copyOut(ta,stat,btn){const j=exportBundle();ta.value=j;ta.hidden=false;try{await navigator.clipboard.writeText(j);stat.textContent='Copied '+Math.round(j.length/1024)+' KB ✓'}catch(e){ta.select();stat.textContent='Clipboard blocked here — the text is selected below, copy it by hand ('+Math.round(j.length/1024)+' KB)'}}
$('exCopy').onclick=()=>copyOut($('exOut'),$('exStat'));
$('expBtn').onclick=async()=>{const b=$('expBtn');const ta=$('anaJson'),st=$('planStat');const j=exportBundle();try{await navigator.clipboard.writeText(j);b.textContent='Copied ✓'}catch(e){ta.value=j;ta.hidden=false;ta.select();b.textContent='Select & copy below'}setTimeout(()=>b.textContent='Copy full log',3000)};
$('exDl').onclick=()=>{try{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([exportBundle()],{type:'application/json'}));a.download='trip-fuel-log-'+new Date().toISOString().slice(0,16).replace(/[:T]/g,'-')+'.json';document.body.appendChild(a);a.click();a.remove();$('exStat').textContent='Download started — if nothing happened (some viewers block it), use Copy.'}catch(e){$('exStat').textContent='Download blocked — use Copy.'}};
$('exClear').onclick=()=>{S.runs=[];save();updRunsUI()};
let suiteStop=false;
function parseSuite(txt){return txt.split(/\n+/).map(l=>l.trim()).filter(l=>l&&!l.startsWith('#')).map(l=>l.split(/\s*(?:->|→|;)\s*/).map(x=>x.trim()).filter(Boolean)).filter(a=>a.length>=2)}
$('suite').value=S.suite||DEFAULT_SUITE;$('suite').oninput=e=>{S.suite=e.target.value;save()};
$('suiteSix').onclick=()=>{const t='# 6 mixed routes: via-route, short NL, long NL, urban BE, cross-border, very long\nKrabbendijke -> Vlaardingen -> Middenbeemster\nWesel -> Dieren\nUtrecht -> Groningen\nBrussels -> Ghent\nMaastricht -> Den Haag\nAmsterdam -> Berlin';$('suite').value=t;S.suite=t;save()};
$('suiteStop').onclick=()=>{suiteStop=true;$('suiteStop').disabled=true};
$('suiteGo').onclick=async()=>{
 const list=parseSuite($('suite').value);if(!list.length){$('suiteStat').textContent='no routes found';return}
 suiteStop=false;$('suiteGo').disabled=true;$('suiteStop').disabled=false;const wantL3=$('suiteL3').checked,gap=Math.max(1,+$('suiteGap').value||2)*1000;
 const rows=[];const draw=()=>{$('suiteTab').innerHTML=`<tr><th>#</th><th>Route</th><th>km</th><th>layers</th><th>L0</th><th>L1</th><th>L2 guess</th><th>L2 probes</th><th>L3</th><th>clusters ${C.METHODS.map(m=>C.METHOD_SHORT[m]).join('/')}</th><th>OSM class match % ${C.METHODS.map(m=>C.METHOD_SHORT[m]).join('/')}</th><th>litres one way (probed) ${C.METHODS.map(m=>C.METHOD_SHORT[m]).join('/')}</th><th>spread</th><th>s</th></tr>`+rows.map((r,i)=>`<tr><td class="mono">${i+1}</td><td style="white-space:normal;min-width:170px">${esc(r.label)}</td>${r.err?`<td colspan="12" class="err" style="white-space:normal">${esc(r.err)}</td>`:`<td class="mono">${r.km}</td><td class="sub">${esc(r.layers)}</td>${['L0','L1','L2g','L2p','L3'].map(k=>`<td class="mono">${r.lv[k]!=null?f1(r.lv[k])+' L':'–'}</td>`).join('')}<td class="mono">${r.mc||'–'}</td><td class="mono">${r.me||'–'}</td><td class="mono">${r.ml||'–'}</td><td class="mono">${r.sp||'–'}</td><td class="mono">${r.s}</td>`}</tr>`).join('')};
 const t0=Date.now();
 for(let i=0;i<list.length;i++){
  if(suiteStop)break;const places=list[i],label=places.join(' → ');$('suiteStat').textContent='Route '+(i+1)+' of '+list.length+': '+label+' …';
  const slice=[],e=env(),ol=e.log;e.log=(...a)=>{slice.push(a.join(' | '));ol(...a)};const t1=Date.now();
  try{
   const res=await C.planRoute(places,e);let extra=null;
   if(wantL3&&res.route){try{const r3=await C.classify(res.route,Object.assign(env(),{mode:'full',log:e.log}));if(/^overpass/.test(r3.layer)){extra={L3:levelTotals(r3.value.segs,S.profiles[S.profileKey]),l3layer:r3.layer}}}catch(er){extra={L3error:er.message}}}
   const rec=runRecord(label,places,res,slice,Date.now()-t1,extra);addRun(rec);
   const pk=S.profileKey,L={};Object.keys(rec.levels).forEach(k=>L[k]=rec.levels[k][pk].L);if(extra&&extra.L3)L.L3=extra.L3.L;
   const MS=rec.analysis&&rec.analysis.methods,LP=MS?C.METHODS.map(m=>MS[m].litresProbed!=null?MS[m].litresProbed:MS[m].litresGuess):null,LN=LP?LP.filter(x=>x!=null):[];rows.push({label,ml:LP?LP.map(x=>x==null?'–':f1(x,1)).join('/'):null,sp:LN.length?f1((Math.max(...LN)-Math.min(...LN))/Math.max(...LN)*100,1)+' %':null,mc:MS?C.METHODS.map(m=>MS[m].clusters).join('/'):null,me:MS&&MS[C.METHODS[0]].eval?C.METHODS.map(m=>MS[m].eval?MS[m].eval.exactPct:'–').join('/'):null,km:rec.route?f1(rec.route.km,0):'?',layers:[rec.layers.route,rec.layers.roads].join(' / '),lv:L,s:Math.round((Date.now()-t1)/1000)});
  }catch(er){rows.push({label,err:er.message});addRun({id:Date.now()+Math.random(),when:new Date().toISOString(),label,places,error:er.message,log:slice})}
  draw();if(i<list.length-1&&!suiteStop)await sleep(gap);
 }
 $('suiteStat').textContent=(suiteStop?'Stopped. ':'Done. ')+rows.length+' route(s) in '+Math.round((Date.now()-t0)/1000)+' s. Press “Copy all runs + log” above to export.';
 $('suiteGo').disabled=false;$('suiteStop').disabled=true;
};
