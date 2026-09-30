'use strict';
/* ---------- ROUTE tab ---------- */
/* ---------- autocomplete (own dropdown, one per box) ---------- */
function buildPlaces(){
 const P=S.places;$('places').innerHTML=P.map((q,i)=>{const lab=i===0?'From':i===P.length-1?'To':'Via '+i;return `<div class="row" style="flex-wrap:nowrap"><label class="f" style="flex:1;position:relative"><span>${lab}</span><input type="text" data-i="${i}" value="${esc(q)}" placeholder="start typing a place…" autocomplete="off"><div class="sug" data-s="${i}" hidden></div></label>${i>0&&i<P.length-1?`<button class="b g sm" data-del="${i}" aria-label="remove via">✕</button>`:''}</div>`}).join('');
}
let sugT={},sugSeq={},sugList={};
function sugBox(i){return document.querySelector(`.sug[data-s="${i}"]`)}
function sugShow(i,items,msg){const b=sugBox(i);if(!b)return;const inp=document.querySelector(`#places input[data-i="${i}"]`);if(!inp||document.activeElement!==inp){b.hidden=true;return}sugList[i]=items||[];b.innerHTML=(items&&items.length?items.map((s,k)=>`<div class="opt" data-k="${k}" role="option">${esc(s.label)}</div>`).join(''):`<div class="sub" style="padding:6px 8px">${esc(msg||'')}</div>`);b.hidden=!(items&&items.length)&&!msg}
function sugPick(i,k){const s=(sugList[i]||[])[k];if(!s)return;S.places[i]=s.label;S.known[s.label]=s.ll;const inp=document.querySelector(`#places input[data-i="${i}"]`);if(inp)inp.value=s.label;const b=sugBox(i);if(b)b.hidden=true;save()}
async function sugAsk(i,q){
 const my=(sugSeq[i]=(sugSeq[i]||0)+1);
 const local=Object.keys(S.known).filter(k=>k.toLowerCase().startsWith(q.toLowerCase())).slice(0,3).map(k=>({label:k,ll:S.known[k]}));
 sugShow(i,local,'searching…');
 try{const r=await C.suggest(q,env());if(my!==sugSeq[i])return;r.value.forEach(s=>{S.known[s.label]=s.ll});const seen=new Set(),items=local.concat(r.value).filter(s=>!seen.has(s.label)&&seen.add(s.label));sugShow(i,items,'');save()}
 catch(err){if(my===sugSeq[i])sugShow(i,local,'no suggestions (you can still type a place, or lat,lon)')}
}
$('places').addEventListener('input',e=>{const i=e.target.dataset.i;if(i==null)return;const q=e.target.value;S.places[+i]=q;save();
 clearTimeout(sugT[i]);if(q.trim().length<2){const b=sugBox(i);if(b)b.hidden=true;return}
 sugT[i]=setTimeout(()=>sugAsk(i,q.trim()),350)});
$('places').addEventListener('focusin',e=>{const i=e.target.dataset.i;if(i==null)return;const q=e.target.value.trim();if(q.length>=2&&!S.known[e.target.value]&&!(sugList[i]||[]).length)sugAsk(i,q)});
$('places').addEventListener('keydown',e=>{const i=e.target.dataset.i;if(i==null)return;const b=sugBox(i);if(!b||b.hidden)return;const opts=[...b.querySelectorAll('.opt')];if(!opts.length)return;let cur=opts.findIndex(o=>o.classList.contains('on'));
 if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();cur=(cur+(e.key==='ArrowDown'?1:-1)+opts.length)%opts.length;opts.forEach((o,k)=>o.classList.toggle('on',k===cur))}
 else if(e.key==='Enter'&&cur>=0){e.preventDefault();sugPick(i,cur)}else if(e.key==='Escape')b.hidden=true});
$('places').addEventListener('mousedown',e=>{const o=e.target.closest('.opt');if(!o)return;e.preventDefault();const i=o.parentNode.dataset.s;sugPick(i,+o.dataset.k)});
$('places').addEventListener('focusout',e=>{const i=e.target.dataset.i;if(i==null)return;setTimeout(()=>{const b=sugBox(i);if(b)b.hidden=true},160)});
$('places').addEventListener('click',e=>{const d=e.target.dataset.del;if(d!=null){S.places.splice(+d,1);buildPlaces();save()}});
$('addVia').onclick=()=>{S.places.splice(S.places.length-1,0,'');buildPlaces();save()};
$('round').onchange=e=>{S.round=e.target.checked;save();calcRoute()};
let planTok=0,planning=false,cancelNow=null;
const env=()=>({known:S.known,mode:S.mode,an:S.an,fetch:(u,o)=>S.offline?Promise.reject(new Error('simulated offline')):(env._cancel&&env._cancel())?Promise.reject(new Error('cancelled')):fetch(u,o),disabled:S.disabled,log:lg,timeoutMs:12000,ro:Object.assign({},S.ro),detour:S.sh.dtPct>0?{pct:S.sh.dtPct,where:S.sh.dtWhere,side:S.sh.dtSide}:null});
function setSample(init){const s=C.sampleRoute();plan={route:s,routeLayer:'built-in sample',classLayer:'built-in sample',geocode:['sample','sample'],notes:[],sample:true,pts:[s.coords[0],s.coords[s.coords.length-1]],analysis:C.analyze(s,S.an)};segs=clone(s.segs);if(!init){S.places=['Wesel','Dieren'];buildPlaces()}afterPlan()}
$('sampleBtn').onclick=()=>setSample(false);
function showPhase(ph,done){
 const el=$('phase');if(!ph){el.innerHTML='';return}
 const pct=done?100:Math.round(((ph.n-1)+(ph.frac||0))/ph.of*100);
 el.innerHTML=`<div class="phase"><div class="row" style="gap:8px;flex-wrap:nowrap"><b class="mono">${done?'✓':'Phase '+ph.n+' of '+ph.of}</b><span class="sub" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(done?ph.msg:ph.msg)}</span></div><div class="bar"><i style="width:${pct}%"></i></div></div>`;
}
function endPlanUi(){planning=false;$('planBtn').textContent='Plan route';$('planBtn').classList.remove('stop')}
$('planBtn').onclick=async()=>{
 const b=$('planBtn');
 if(planning){planTok++;env._cancel=null;endPlanUi();if(cancelNow)cancelNow();showPhase({n:1,of:6,msg:'Stopped — you can change the places and plan again.',frac:0},false);$('phase').querySelector('.bar i').style.width='0';return}
 const my=++planTok;planning=true;b.textContent='■ Stop';b.classList.add('stop');
 const cancelled=()=>my!==planTok;env._cancel=cancelled;
 $('planStat').innerHTML='';showPhase({n:1,of:6,msg:'Starting…',frac:0});
 const cp=new Promise((_,rej)=>{cancelNow=()=>rej(new Error('cancelled'))});cp.catch(()=>{});
 let firstStage=true;
 try{
  const slice=[],e0=env(),ol=e0.log;e0.log=(...a)=>{slice.push(a.join(' | '));ol(...a)};const t1=Date.now();
  const names=S.places.filter(x=>x.trim());
  const pp=C.planRoute(names,Object.assign(e0,{cancelled,onPhase:ph=>{if(!cancelled())showPhase(ph)},onStage:st=>{if(cancelled())return;plan={route:st.route,routeLayer:st.routeLayer,classLayer:'pending',geocode:['…'],notes:[],pts:st.pts,analysis:st.analysis,places:names,pending:true,detour:st.detour};segs=[];mapFitNext=true;afterPlan();if(firstStage){firstStage=false;try{$('mapCard').scrollIntoView({behavior:'smooth',block:'start'})}catch(x){}}}}));
  pp.catch(()=>{});
  const p=await Promise.race([pp,cp]);
  if(cancelled())return;
  plan={route:p.route,routeLayer:p.routeLayer,classLayer:p.classLayer,geocode:p.info.geocode,notes:p.notes,pts:p.pts,analysis:p.analysis,places:names,detour:p.detour};
  segs=(p.segs||[{name:'Manual — edit me',hw:'secondary',limit:null,country:'NL',len:p.route.dist,signals:null,pts:p.route.coords}]).map(s=>Object.assign({},s));
  if(!p.segs)plan.classLayer='manual';
  afterPlan();showPhase({n:6,of:6,msg:'Done in '+Math.round((Date.now()-t1)/1000)+' s · roads: '+plan.classLayer},true);
  try{addRun(runRecord(names.join(' → '),names,p,slice,Date.now()-t1))}catch(er){lg('export','record','could not store run — '+er.message,'fail')}
 }catch(e){
  if(cancelled())return;
  showPhase(null);$('planStat').innerHTML=`<div class="note"><b class="err">Could not place that.</b> ${esc(e.message)}<br>Try “lat,lon” for a place, or use the sample route. See Debug for the full log.</div>`;
 }
 if(my===planTok){env._cancel=null;endPlanUi()}
};
let levels={},curLevel=null;
const LV=[['L0','L0 · OSRM time only','one road, OSRM’s average speed'],['L1','L1 · big roads','first/last big road; city movement before/after'],['L2g','L2 · clusters (guess)','road groups from step lengths, no lookups'],['L2p','L2 · clusters + probes','same, confirmed at sampled points in OSM'],['L3','L3 · every road','all roads from OSM'],['sample','Sample','hand-drawn sample route']];
function setLevels(){levels={};const A=plan&&plan.analysis;if(!A)return;try{levels.L0=C.level0(A,plan.route);levels.L1=C.level1(A);levels.L2g=C.buildSegments(A,[])}catch(e){lg('levels','build','FAILED — '+e.message,'fail')}}
function showLevel(k){if(!levels[k])return;curLevel=k;segs=levels[k].map(s=>Object.assign({},s));segs.forEach((s,i)=>s.id=i+1);nextId=segs.length+1;buildSegTable();drawMap();calcRoute()}
function renderLadder(){
 const el=$('ladder');if(!levels||!Object.keys(levels).length){el.innerHTML='';return}
 const mult=S.round?2:1,prof=S.profiles[S.profileKey],ref=['L3','L2p','L2g','sample'].find(k=>levels[k]);
 const tot=k=>C.computeRoute(k===curLevel?segs:levels[k],S.car,S.params,S.prices,prof).total;
 const rT=ref&&tot(ref);
 el.innerHTML='<tr><th></th><th>Level</th><th>uses</th><th>segments</th><th>litres</th><th>€</th><th>time</th><th>vs deepest</th></tr>'+LV.filter(l=>levels[l[0]]).map(l=>{const T=tot(l[0]),d=rT?(T.L/rT.L-1)*100:0;return `<tr><td><button class="b ${l[0]===curLevel?'':'g'} sm" data-lv="${l[0]}">${l[0]===curLevel?'in use':'use'}</button></td><td>${l[1]}</td><td class="sub" style="white-space:normal;min-width:160px">${l[2]}</td><td class="mono">${(l[0]===curLevel?segs:levels[l[0]]).length}</td><td class="mono">${f1(T.L*mult)}</td><td class="mono">${eur(T.cost*mult)}</td><td class="mono">${mins(T.sec*mult)}</td><td class="mono">${l[0]===ref?'ref.':(d>0?'+':'')+f1(d,1)+'%'}</td></tr>`}).join('');
 $('ladderNote').textContent='Same car, prices and speed profile for every row. “Deepest” is the most detailed level, not the truth: only a real fill-up tells which level is right.';
}
$('ladder').addEventListener('click',e=>{const k=e.target.dataset.lv;if(k)showLevel(k)});
$('runFull').onclick=async()=>{
 if(!plan||!plan.route)return;const b=$('runFull');b.disabled=true;b.textContent='Looking up every road…';
 try{const r=await C.classify(plan.route,Object.assign(env(),{mode:'full'}));
  if(/^overpass/.test(r.layer)){levels.L3=r.value.segs;showLevel('L3');$('ladderNote').textContent='Full lookup done ('+r.layer+').'}
  else{$('ladderNote').textContent='Full lookup not reachable — fell back to '+r.layer+'. Keeping the current level.'}
 }catch(e){$('ladderNote').textContent='Full lookup failed: '+e.message}
 b.disabled=false;b.textContent='Run L3: look up every road';
};
function afterPlan(){
 setLevels();
 const kind=plan.sample?'sample':/^overpass/.test(plan.classLayer)?'L3':/^smart-probes/.test(plan.classLayer)?'L2p':'L2g';
 if(kind!=='L2g'||!levels.L2g)levels[kind]=segs.map(s=>Object.assign({},s));
 curLevel=kind;segs=levels[kind].map(s=>Object.assign({},s));
 nextId=segs.length+1;segs.forEach((s,i)=>s.id=i+1);
 const pill=(l,ok)=>`<span class="pill ${ok}">${esc(l)}</span>`;
 const fb=(l,first)=>pill(l,l===first?'ok':(l==='manual'||l==='straight-line'||l==='built-in sample'||l==='gazetteer'||l==='osrm-step-heuristic'||l==='cluster-guess')?'fb':'ok');
 const live=plan.routeLayer==='osrm'||plan.routeLayer==='valhalla';
 let h=`<div class="row" style="gap:6px"><span class="sub">places</span>${[...new Set(plan.geocode)].map(l=>fb(l,'nominatim')).join('')}<span class="sub">route</span>${fb(plan.routeLayer,'osrm')}<span class="sub">roads</span>${fb(plan.classLayer,'overpass')}</div>`;
 if(plan.pending)h+='<div class="note" style="margin-top:8px">Quick estimates are on screen (L0–L2). Now looking up key points in OSM to sharpen them…</div>';
 else if(plan.sample)h+='<div class="note" style="margin-top:8px">Sample route, drawn by hand from typical roads (B8 → A3 → A12 → A348). Approximate; edit the table below.</div>';
 else if(plan.routeLayer==='straight-line')h+='<div class="note" style="margin-top:8px">Live routing is not reachable from here, so this is a straight line ×1.25 split into pieces. Road types are guessed — fix them in the table, or open the app in a normal browser tab.</div>';
 else if(plan.classLayer==='smart-probes'||plan.classLayer==='smart-probes-mirror')h+=`<div class="note" style="margin-top:8px">Road types guessed from the route’s steps, then confirmed at ${plan.analysis.probeHits}/${plan.analysis.probes} key points from OSM.</div>`;
 else if(plan.classLayer==='cluster-guess')h+='<div class="note" style="margin-top:8px">OSM lookups were not reachable, so road types are guessed from the shape of the route (step lengths, speeds, road numbers). Check the table.</div>';
 else if(plan.classLayer!=='overpass'&&plan.classLayer!=='overpass-mirror'&&plan.classLayer!=='overpass-light')h+='<div class="note" style="margin-top:8px">Route is live, but the OSM road-type lookup (Overpass) failed. Road types are estimated from the route’s own road refs and speeds — check the table.</div>';
 h+=shapeNote();
 if(plan.notes&&plan.notes.length)h+=`<details class="sub"><summary>${plan.notes.length} fallback note(s)</summary>${plan.notes.map(n=>`<div class="mono">${esc(n)}</div>`).join('')}</details>`;
 $('planStat').innerHTML=h;
 $('tripLabel').value=S.places.filter(x=>x.trim()).join(' → ');
 buildSegTable();drawMap();calcRoute();renderAnatomy();
 tlCompute(); // always rebuild the timeline for THIS plan (it has its own safety net)
}
function buildSegTable(){
 const hwOpts=k=>Object.keys(HWN).map(h=>`<option value="${h}"${h===k?' selected':''}>${HWN[h]}</option>`).join('');
 const cOpts=k=>['NL','DE','BE'].map(h=>`<option${h===k?' selected':''}>${h}</option>`).join('');
 $('segTab').innerHTML='<tr><th>#</th><th>Road</th><th>Type</th><th>Limit</th><th>Ctry</th><th>km</th><th>Lights</th><th>km/h</th><th>L</th><th>€</th><th></th></tr>'+
 segs.map((s,i)=>`<tr data-i="${i}"><td class="mono">${i+1}</td><td><input type="text" data-f="name" value="${esc(s.name)}" style="width:120px"></td><td><select data-f="hw" style="width:118px">${hwOpts(s.hw)}</select></td>
 <td><input type="number" data-f="limit" value="${s.limit||''}" placeholder="${C.limitKmh(Object.assign({},s,{limit:null}))}${s.unlimited?'*':''}" style="width:64px"></td>
 <td><select data-f="country" style="width:58px">${cOpts(s.country)}</select></td>
 <td><input type="number" data-f="len" value="${(s.len/1000).toFixed(2)}" step="0.1" style="width:72px"></td>
 <td><input type="number" data-f="signals" value="${s.signals==null?'':s.signals}" placeholder="est." step="1" style="width:56px"></td>
 <td class="mono" data-o="v"></td><td class="mono" data-o="L"></td><td class="mono" data-o="c"></td><td><button class="b g sm" data-del="${i}" aria-label="delete segment">✕</button></td></tr>`).join('');
}
$('segTab').addEventListener('input',e=>{const tr=e.target.closest('tr'),f=e.target.dataset.f;if(!tr||!f)return;const s=segs[+tr.dataset.i];let v=e.target.value;
 if(f==='name')s.name=v;else if(f==='hw'||f==='country'){s[f]=v}else if(f==='len')s.len=Math.max(0,+v)*1000;else if(f==='limit'){s.limit=v?+v:null;s.unlimited=false}else if(f==='signals')s.signals=v===''?null:+v;
 calcRoute()});
$('segTab').addEventListener('click',e=>{const d=e.target.dataset.del;if(d!=null){segs.splice(+d,1);buildSegTable();calcRoute()}});
$('addSeg').onclick=()=>{segs.push({id:nextId++,name:'New',hw:'secondary',limit:null,country:'NL',len:5000,signals:null,pts:[]});buildSegTable();calcRoute()};
function calcRoute(){
 if(!segs.length){$('pcards').innerHTML='<div class="sub">Plan a route or load the sample to see results.</div>';$('tot').innerHTML='';tlCompute();return}
 const mult=S.round?2:1,out={};
 for(const k in S.profiles)out[k]=C.computeRoute(segs,S.car,S.params,S.prices,S.profiles[k]);
 $('pcards').innerHTML=Object.keys(S.profiles).map(k=>{const t=out[k].total;return `<button class="pc" data-k="${k}" aria-pressed="${k===S.profileKey}">${esc(S.profiles[k].label)}<b>${eur(t.cost*mult)}</b><span class="sub">${f1(t.L*mult)} L · ${f1(t.l100)} L/100 · ${mins(t.sec*mult)}</span></button>`}).join('');
 const R=out[S.profileKey]||out.limit,T=R.total;
 const bc=Object.entries(T.byCountry).map(([k,v])=>`${k}: ${f1(v.km*mult)} km · ${f1(v.L*mult)} L · ${eur(v.cost*mult)}`).join('<br>');
 $('tot').innerHTML=`<div class="row" style="gap:24px"><div><div class="sub">${S.round?'Round trip':'One way'} · ${esc(S.profiles[S.profileKey].label)}</div><div class="big">${eur(T.cost*mult)}</div></div><div><div class="sub">Fuel</div><div class="big">${f1(T.L*mult)} L</div></div><div><div class="sub">Distance</div><div class="big">${f1(T.km*mult,0)} km</div></div></div><div class="sub mono" style="margin-top:6px">${bc}<br>≈ ${f1(T.stops*mult,1)} expected light stops · ${mins(T.sec*mult)} driving</div>`;
 document.querySelectorAll('#segTab tr[data-i]').forEach(tr=>{const r=R.rows[+tr.dataset.i];if(!r)return;tr.querySelector('[data-o=v]').textContent=Math.round(r.v);tr.querySelector('[data-o=L]').textContent=r.L.toFixed(2);tr.querySelector('[data-o=c]').textContent=r.cost.toFixed(2)});
 window._last={out,mult};renderLadder();tlCompute();
}
$('pcards').onclick=e=>{const b=e.target.closest('.pc');if(b){S.profileKey=b.dataset.k;save();calcRoute()}};
