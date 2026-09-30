'use strict';
/* ---------- timeline: distance / time gradation, clock, rests ---------- */
let TL=null,tlView='dist';
const pad2=n=>String(n).padStart(2,'0');
const fmtDur=min=>{const m=Math.round(min),h=Math.floor(Math.abs(m)/60);return (m<0?'-':'')+(h?h+'h ':'')+pad2(Math.abs(m)%60)+'m'};
const fmtDelta=min=>{const m=Math.round(min);return m>=60?Math.floor(m/60)+'h'+pad2(m%60):m+' min'};
function fmtClock(ms,dep){if(!ms)return '–';const d=new Date(ms),days=dep?Math.round((new Date(d.getFullYear(),d.getMonth(),d.getDate())-new Date(new Date(dep).getFullYear(),new Date(dep).getMonth(),new Date(dep).getDate()))/864e5):0;return pad2(d.getHours())+':'+pad2(d.getMinutes())+(days?' +'+days+'d':'')}
function departMs(){const v=S.tl.depart;if(v){const t=new Date(v).getTime();if(!isNaN(t))return t}const d=new Date();d.setMinutes(0,0,0);d.setHours(d.getHours()+1);return d.getTime()}
function toLocalInput(ms){const d=new Date(ms);return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())+'T'+pad2(d.getHours())+':'+pad2(d.getMinutes())}
function tlCompute(){
 try{tlCompute0()}catch(e){TL=null;lg('timeline','compute','FAILED — '+e.message,'fail');$('tlBody').innerHTML='<div class="note"><b class="err">Timeline could not be computed.</b> '+esc(e.message)+' (see Debug log)</div>';$('tlTab').innerHTML='';$('tlStrip').innerHTML='';$('tlSum').innerHTML=''}
}
function tlCompute0(){
 const A=plan&&plan.analysis;if(!A||!A.L){TL=null;renderTimeline();return}
 let rows=null;try{if(segs.length)rows=C.computeRoute(segs,S.car,S.params,S.prices,S.profiles[S.profileKey]||S.profiles.limit).rows}catch(e){}
 const basis=S.tl.basis==='model'&&rows?'model':'osrm',curve=C.timeCurve(A,basis,segs,rows);
 const o=Object.assign({},S.tl,{depart:departMs(),div:S.tl.div==='auto'?'auto':S.tl.div==='off'?0:+S.tl.div});
 try{TL=C.timeline(plan.route,A,curve,o);TL.basis=basis;TL.curve=curve;TL.src=A;window._TL=TL;window.plan_T=()=>plan.analysis.totT}catch(e){lg('timeline','build','FAILED — '+e.message,'fail');TL=null}
 renderTimeline();if(typeof drawMap==='function')drawMap(true);
}
function tlName(p){const n=p.id!=null&&C.NAME_CACHE[p.p?p.p[0].toFixed(3)+','+p.p[1].toFixed(3):''];return n?n.place+(n.country?' ('+n.country+')':''):''}
function tlList(){if(!TL)return [];return tlView==='rest'?TL.rests:tlView==='time'?TL.time:TL.dist}
function renderTimeline(){
 if(TL&&plan&&plan.analysis&&TL.src!==plan.analysis){tlCompute();return} // stale timeline (belongs to an older route): rebuild
 const el=$('tlBody');if(!TL){el.innerHTML='<div class="sub">Plan a route first.</div>';$('tlStrip').innerHTML='';return}
 $('tlBody').innerHTML='';const o=TL.opt,dep=TL.departMs;
 $('tlSum').innerHTML=`<div class="row" style="gap:18px"><div><div class="sub">Depart</div><b class="big" style="font-size:20px">${fmtClock(dep)}</b></div><div><div class="sub">Arrive</div><b class="big" style="font-size:20px">${fmtClock(TL.arriveMs,dep)}</b></div><div><div class="sub">Driving</div><b class="big" style="font-size:20px">${fmtDur(TL.totalSec/60)}</b></div><div><div class="sub">Breaks</div><b class="big" style="font-size:20px">${TL.rests.length?TL.rests.length+' × '+o.restMin+' min':'none'}</b></div><div><div class="sub">Divisions</div><b class="big" style="font-size:20px">${TL.N?TL.N+' parts':'off'}</b></div></div><div class="sub" style="margin-top:4px">Clock based on <b>${TL.basis==='model'?'our fuel model’s driving time (speed profile)':'OSRM’s own time'}</b>${o.withBreaks?'; breaks are added to every later clock time':''}. ${TL.basis==='model'?'OSRM’s own time for this route: '+fmtDur(plan.analysis.totT/60)+' (its car profile drives at about 0.8× the speed limit — see Debug ▸ How OSRM counts time).':''}</div>`;
 // strip
 const L=plan.analysis.L,W=700,x0=14,x1=W-14,X=m=>x0+(x1-x0)*m/L;let s='';
 let acc=0;const tot=segs.reduce((a,b)=>a+b.len,0)||1;
 if(segs.length){segs.forEach(sg=>{const a=acc/tot*L;acc+=sg.len;const b=acc/tot*L;s+=`<rect x="${X(a).toFixed(1)}" y="46" width="${Math.max(1,X(b)-X(a)).toFixed(1)}" height="14" fill="${hwCol(sg.hw)}"/>`})}else s+=`<rect x="${x0}" y="46" width="${x1-x0}" height="14" fill="var(--c-lo)"/>`;
 const tick=(p,lane)=>{const x=X(p.m).toFixed(1),id=(lane==='dist'?'dist:':lane==='time'?'time:':'rest:')+(lane==='rest'?p.k-1:p.k),sel=selPt===id;
  if(lane==='dist')return `<g class="pt" data-id="${id}" style="cursor:pointer"><line x1="${x}" x2="${x}" y1="34" y2="60" stroke="var(--ink)" stroke-width="1"/><circle cx="${x}" cy="30" r="${sel?6:4.5}" fill="var(--accent)" stroke="var(--accent-ink)"/><text x="${x}" y="17" font-size="9.5" text-anchor="middle" fill="var(--ink)">${p.k}/${p.N}</text></g>`;
  if(lane==='time')return `<g class="pt" data-id="${id}" style="cursor:pointer"><line x1="${x}" x2="${x}" y1="46" y2="74" stroke="var(--c-time)" stroke-width="1"/><circle cx="${x}" cy="78.5" r="${sel?6.5:5.5}" fill="var(--c-time)" fill-opacity=".28" stroke="${sel?'var(--ink)':'var(--c-time)'}" stroke-width="2"/><text x="${x}" y="100" font-size="9.5" text-anchor="middle" fill="var(--ink)">${p.k}/${p.N}</text></g>`;
  return `<g class="pt" data-id="${id}" style="cursor:pointer"><circle cx="${x}" cy="46" r="8" fill="var(--c-rest)" stroke="${sel?'var(--ink)':'#fff'}" stroke-width="1.6"/><text x="${x}" y="50" font-size="9" text-anchor="middle" fill="#fff" font-weight="700">P</text></g>`};
 if(S.tl.showDist)TL.dist.forEach(p=>s+=tick(p,'dist'));if(S.tl.showTime)TL.time.forEach(p=>s+=tick(p,'time'));if(S.tl.showRest)TL.rests.forEach(p=>s+=tick(p,'rest'));
 $('tlStrip').innerHTML=`<svg viewBox="0 0 ${W} 108" style="width:100%;height:auto" role="img" aria-label="route strip: distance points on top, time points below"><text x="${x0}" y="9" font-size="10" fill="var(--muted)">● by distance</text><text x="${x1}" y="9" font-size="10" text-anchor="end" fill="var(--muted)">◯ by time (below the bar) · P = rest</text>${s}</svg>`;
 // table
 const list=tlList(),isRest=tlView==='rest';
 const head=isRest?'<tr><th>#</th><th>km</th><th>Δ km</th><th>drive</th><th>Δ</th><th>arrive</th><th>leave</th><th>place</th><th>road · type</th></tr>':'<tr><th>at</th><th>km</th><th>Δ km</th><th>min in</th><th>Δ min</th><th>clock</th><th>place</th><th>road · type</th></tr>';
 const rowsH=list.map((p,i)=>{const id=(isRest?'rest:':tlView+':')+(isRest?p.k-1:p.k),nm=tlName(p);const tail=`<td class="place">${esc(nm||'')||'<span class="sub">—</span>'}</td><td style="white-space:normal;min-width:150px">${esc(p.road)} <span class="pill ${p.typeSrc==='OSM probe'?'ok':'fb'}" title="${p.typeSrc}">${esc(p.type)}${p.limit?' '+p.limit:''}</span></td>`;
  return isRest?`<tr data-id="${id}" class="${selPt===id?'sel':''}"><td class="mono">☕ ${p.k}</td><td class="mono">${f1(p.km)}</td><td class="mono">+${f1(p.dKm)}</td><td class="mono">${fmtDur(p.min)}</td><td class="mono">+${fmtDelta(p.dMin)}</td><td class="mono">${fmtClock(p.arriveMs,dep)}</td><td class="mono">${fmtClock(p.departMs,dep)}</td>${tail}</tr>`
  :`<tr data-id="${id}" class="${selPt===id?'sel':''}"><td class="mono">${p.k}/${p.N}</td><td class="mono">${f1(p.km)}</td><td class="mono">${i?'+'+f1(p.dKm):''}</td><td class="mono">${fmtDur(p.min)}</td><td class="mono">${i?'+'+fmtDelta(p.dMin):''}</td><td class="mono">${fmtClock(p.arriveMs,dep)}</td>${tail}</tr>`}).join('');
 $('tlTab').innerHTML=head+(rowsH||`<tr><td colspan="9" class="sub">${isRest?'No rest stops: the trip is shorter than one rest interval.':'Divisions are off — choose a number under “Divide the route in”.'}</td></tr>`);
 [...$('tlTabs').children].forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===tlView));
}
function findPt(id){if(!TL||!id)return null;const [k,i]=id.split(':');const a=k==='dist'?TL.dist:k==='time'?TL.time:TL.rests;return a[+i]||null}
async function selectPt(id,pan){
 selPt=id;const p=findPt(id);renderTimeline();drawMap(true);const el=$('ptInfo');if(!p){el.hidden=true;return}
 if(pan!==false)mapGoTo(p.p,11);
 const dep=TL.departMs,show=()=>{const nm=tlName(p);el.hidden=false;el.innerHTML=`<div class="row" style="justify-content:space-between"><b>${p.kind==='rest'?'☕ Rest '+p.k:p.kind==='dist'?'Distance point '+p.label:'Time point '+p.label}</b><button class="b g sm" id="ptX">✕</button></div>
  <div class="ptgrid"><span class="sub">place</span><span>${esc(nm||'looking up…')}</span><span class="sub">road</span><span>${esc(p.road)} <span class="sub">(road ${p.stepNo} of ${plan.analysis.steps.length}, cluster ${p.cluster})</span></span><span class="sub">type</span><span>${esc(p.type)}${p.limit?', limit '+p.limit:''} <span class="sub">(${p.typeSrc})</span></span>
  <span class="sub">distance</span><span>${f1(p.km,1)} km from start · ${f1(p.toEndKm,1)} km to go${p.kind!=='dist'||p.k?` · +${f1(p.dKm,1)} km since previous`:''}</span><span class="sub">time</span><span>${fmtDur(p.min)} driving · +${fmtDelta(p.dMin)} since previous</span>
  <span class="sub">clock</span><span>${p.kind==='rest'?'arrive '+fmtClock(p.arriveMs,dep)+' · leave '+fmtClock(p.departMs,dep):'about '+fmtClock(p.arriveMs,dep)}</span><span class="sub">position</span><span class="mono">${p.p?p.p[0].toFixed(4)+', '+p.p[1].toFixed(4):''}</span></div>`;$('ptX').onclick=()=>{selPt=null;el.hidden=true;renderTimeline();drawMap(true)}};
 show();
 if(p.p&&!tlName(p)){try{await C.reverseName(p.p,env());if(selPt===id){show();renderTimeline()}}catch(e){if(selPt===id){el.querySelector('.ptgrid span:nth-child(2)').textContent='(name lookup unavailable)'}}}
}
$('tlStrip').addEventListener('click',e=>{const g=e.target.closest('.pt');if(g)selectPt(g.dataset.id)});
$('tlTab').addEventListener('click',e=>{const tr=e.target.closest('tr[data-id]');if(tr)selectPt(tr.dataset.id)});
$('tlTabs').onclick=e=>{const b=e.target.closest('button');if(!b)return;tlView=b.dataset.v;renderTimeline()};
const DIV_PRESETS=['off','2','3','4','5','6','8','10','12','16','20','24','32','auto'];
function divSync(){const d=String(S.tl.div);const pre=DIV_PRESETS.includes(d);$('tlDiv').value=pre?d:'custom';$('tlDivNW').hidden=pre;if(!pre)$('tlDivN').value=d;$('tlAutoBox').hidden=d!=='auto'}
divSync();
$('tlDiv').onchange=e=>{const v=e.target.value;if(v==='custom'){S.tl.div=+$('tlDivN').value>=2?+$('tlDivN').value:7;$('tlDivN').value=S.tl.div}else S.tl.div=v;save();divSync();tlCompute()};
$('tlDivN').oninput=e=>{const v=Math.round(+e.target.value);if(v>=2&&v<=64){S.tl.div=v;save();tlCompute()}};
let nameStop=false;
$('tlName').onclick=async()=>{
 const b=$('tlName');if(b.dataset.run){nameStop=true;return}
 b.dataset.run=1;nameStop=false;const list=tlList().filter(p=>p.p);let n=0;
 for(const p of list){if(nameStop)break;b.textContent='■ Stop naming ('+(++n)+'/'+list.length+')';try{await C.reverseName(p.p,env());renderTimeline()}catch(e){}}
 delete b.dataset.run;b.textContent='Name the places';renderTimeline();
};
[['tlDepart','depart','dt'],['tlKmPer','kmPer','n'],['tlMax','maxN','n'],['tlDens','density','n'],['tlRestH','restEveryH','n0'],['tlBreak','restMin','n0'],['tlBasis','basis','s'],['tlWB','withBreaks','c'],['tlShD','showDist','c'],['tlShT','showTime','c'],['tlShR','showRest','c'],['mapBg','bg','c']].forEach(([id,k,t])=>{
 const el=$(id);const sync=()=>{if(t==='c')el.checked=!!S.tl[k];else if(t==='dt')el.value=S.tl.depart||toLocalInput(departMs());else el.value=S.tl[k]};sync();
 el.addEventListener(t==='c'||t==='s'||t==='dt'?'change':'input',()=>{if(t==='c')S.tl[k]=el.checked;else if(t==='s')S.tl[k]=el.value;else if(t==='dt')S.tl[k]=el.value;else{const v=+el.value;if(!(v>=0)||(t==='n'&&v<=0))return;S.tl[k]=v}save();tlCompute()})});
$('tlNow').onclick=()=>{S.tl.depart='';$('tlDepart').value=toLocalInput(departMs());save();tlCompute()};
/* prices */
function buildPrices(){$('prices').innerHTML=['NL','DE','BE'].map(k=>`<label class="f" style="flex:1;min-width:80px"><span>${k}</span><input type="number" step="0.001" data-p="${k}" value="${S.prices[k]}"></label>`).join('')}
$('prices').oninput=e=>{const k=e.target.dataset.p;if(k){S.prices[k]=+e.target.value||0;save();calcRoute();carOut()}};
$('priceLive').onclick=async()=>{
 $('priceStat').textContent='trying…';
 const urls={NL:'https://fuel-prices.eu/Netherlands/',DE:'https://fuel-prices.eu/Germany/'};
 try{for(const k in urls){const r=await fetch(urls[k]);const t=await r.text();const m=t.match(/Euro-?super 95[^0-9]{0,200}?(\d[.,]\d{3})/i);if(!m)throw new Error('no price found for '+k);S.prices[k]=parseFloat(m[1].replace(',','.'))}buildPrices();save();calcRoute();$('priceStat').textContent='updated'}
 catch(e){lg('prices','fuel-prices.eu','FAILED — '+e.message,'fail');$('priceStat').textContent='not reachable here — kept your values (edit by hand)'}
};
/* profiles + stop model tables */
function buildProf(){
 $('profTab').innerHTML='<tr><th>Profile</th><th>× limit</th><th>Cap km/h</th><th>Burst %</th><th>Burst km/h</th></tr>'+Object.entries(S.profiles).map(([k,p])=>`<tr data-k="${k}"><td>${esc(p.label)}</td><td><input type="number" step="0.01" data-f="factor" value="${p.factor}" style="width:64px"></td><td><input type="number" data-f="cap" value="${p.cap>=999?'':p.cap}" placeholder="none" style="width:64px"></td><td><input type="number" data-f="burstShare" value="${Math.round(p.burstShare*100)}" style="width:56px"></td><td><input type="number" data-f="burstSpeed" value="${p.burstSpeed}" style="width:64px"></td></tr>`).join('');
 $('stopTab').innerHTML='<tr><th>Road type</th><th>P(stop at light)</th><th>Lights / km (if unmeasured)</th></tr>'+C.HW.map(h=>`<tr><td>${HWN[h]}</td><td><input type="number" step="0.01" min="0" max="1" data-h="${h}" data-w="stopP" value="${+S.params.stopP[h].toFixed(3)}" style="width:72px"></td><td><input type="number" step="0.05" min="0" data-h="${h}" data-w="sigPerKm" value="${S.params.sigPerKm[h]}" style="width:72px"></td></tr>`).join('');
 $('stopPar').innerHTML=[['waitS','wait (s)'],['aDec','brake (m/s²)'],['aAcc','pull-away (m/s²)'],['idleLph','idle (L/h)'],['coldStartL','cold start (L/trip)'],['etaI','engine eff.'],['etaDrive','drivetrain eff.']].map(([k,l])=>`<label class="f" style="width:100px"><span>${l}</span><input type="number" step="any" data-pp="${k}" value="${S.params[k]}"></label>`).join('');
}
$('profTab').addEventListener('input',e=>{const tr=e.target.closest('tr'),f=e.target.dataset.f;if(!tr||!f)return;const p=S.profiles[tr.dataset.k];let v=+e.target.value;if(f==='cap')p.cap=e.target.value?v:999;else if(f==='burstShare')p.burstShare=clamp(v/100,0,1);else p[f]=v||p[f];save();calcRoute()});
$('stopTab').addEventListener('input',e=>{const h=e.target.dataset.h;if(h){S.params[e.target.dataset.w][h]=Math.max(0,+e.target.value||0);save();calcRoute()}});
$('stopPar').addEventListener('input',e=>{const k=e.target.dataset.pp;if(k){const v=+e.target.value;if(v>0){S.params[k]=v;save();calcRoute();carOut()}}});
$('saveTrip').onclick=()=>{
 if(!segs.length){$('saveStat').textContent='plan a route first';return}
 S.trips.push({id:Date.now(),label:$('tripLabel').value||'Trip',segs:segs.map(s=>({name:s.name,hw:s.hw,limit:s.limit,unlimited:s.unlimited,country:s.country,len:s.len,signals:s.signals})),times:Math.max(0,+$('tripTimes').value||0),round:S.round,profile:S.profileKey});
 save();$('saveStat').textContent='added ✓';setTimeout(()=>$('saveStat').textContent='',2500);
};

