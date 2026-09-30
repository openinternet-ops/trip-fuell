'use strict';
/* ---------- CAR tab ---------- */
const CTL=[
 ['length','Length (m)',3.2,7.2,0.01],['width','Width, without mirrors (m)',1.5,2.3,0.01],['height','Height — drag the roof (m)',1.2,2.8,0.01],
 ['bonnetLen','Bonnet length, 0 = cab-over (m)',0,1.6,0.01],['cowl','Cowl: windscreen-base height (m)',0.5,1.4,0.01],
 ['bonnetSlope','Bonnet slope, drop angle (°)',0,25,1],['rake','Windscreen rake from vertical (°)',20,75,1],['rearAngle','Rear slope from vertical, 0 = square (°)',0,75,1],
 ['clearance','Ground clearance under floor (m)',0.10,0.40,0.01],['frontClear','Front lip height (m)',0.10,0.45,0.01],
 ['mass','Mass, road-ready (kg)',700,4000,10],['load','Load: people + luggage (kg)',0,1000,10],['tyreBar','Tyre pressure (bar)',1.6,4.5,0.1],['disp','Engine size (L)',0.6,3.5,0.001]];
function buildCtl(){
 const c=S.car;let h='<h3>Shape &amp; weight</h3><div class="stack" style="gap:10px">';
 h+=`<div><div class="sub">Front</div><div class="seg" data-k="bonnet">${[['long','Long bonnet'],['short','Short bonnet'],['none','Cab-over']].map(o=>`<button data-v="${o[0]}">${o[1]}</button>`).join('')}</div></div>`;
  h+=`<div><div class="sub">Underbody panels</div><div class="seg" data-k="underbody">${[['smooth','Smooth'],['normal','Normal'],['rough','Rough']].map(o=>`<button data-v="${o[0]}">${o[1]}</button>`).join('')}</div></div>`;
 h+=`<div><div class="sub">Outer mirrors</div><div class="seg" data-k="mirrors">${[[0,'None'],[1,'One'],[2,'Two']].map(o=>`<button data-v="${o[0]}">${o[1]}</button>`).join('')}</div></div>`;
 CTL.forEach(([k,l,mn,mx,st])=>{h+=`<label class="f"><span class="lab">${l}<span class="v" id="v_${k}"></span></span><input type="range" id="r_${k}" min="${mn}" max="${mx}" step="${st}"></label>`});
 h+=`<div><div class="sub">Tyres</div><div class="seg" data-k="tyreType">${[['eco','Low-rolling'],['normal','Normal'],['allseason','All-season'],['offroad','Chunky']].map(o=>`<button data-v="${o[0]}">${o[1]}</button>`).join('')}</div></div>`;
 h+='<div class="row">'+[['roofRails','Roof rails'],['roofBox','Roof box'],['bikeRack','Bike rack'],['windowOpen','Window open']].map(o=>`<label class="row" style="gap:6px"><input type="checkbox" data-x="${o[0]}"> ${o[1]}</label>`).join('')+'</div>';
 h+=`<label class="f"><span class="lab">Cd override (empty = use the estimate)</span><input type="number" id="cdo" step="0.005" min="0.15" max="0.8" placeholder="auto"></label>`;
 h+=`<label class="f"><span class="lab">Frontal-area fill (0.8 ≈ car, 0.9 ≈ van)</span><input type="number" id="fill" step="0.01" min="0.6" max="1"></label>`;
 $('ctl').innerHTML=h+'</div>';
 $('ctl').addEventListener('click',e=>{const b=e.target.closest('.seg button');if(!b)return;const k=b.parentNode.dataset.k;if(k==='bonnet')S.car.bonnetLen={none:0.06,short:0.65,long:1.25}[b.dataset.v];else S.car[k]=k==='mirrors'?+b.dataset.v:b.dataset.v;carChanged()});
 CTL.forEach(([k])=>$('r_'+k).oninput=e=>{S.car[k]=+e.target.value;carChanged(true)});
 $('ctl').querySelectorAll('[data-x]').forEach(i=>i.onchange=()=>{S.car[i.dataset.x]=i.checked;carChanged()});
 $('cdo').oninput=e=>{S.car.cdOverride=e.target.value?+e.target.value:null;carChanged(true)};
 $('fill').oninput=e=>{S.car.fill=clamp(+e.target.value||0.8,0.6,1);carChanged(true)};
}
function syncCtl(skip){
 const c=S.car;
 CTL.forEach(([k,l,mn,mx,st])=>{const r=$('r_'+k);if(document.activeElement!==r)r.value=c[k];$('v_'+k).textContent=(+c[k]).toFixed(st<0.01?3:st<0.1?2:st<1?1:0)});
 $('ctl').querySelectorAll('.seg').forEach(s=>[...s.children].forEach(b=>b.setAttribute('aria-pressed',String(s.dataset.k==='bonnet'?C.bonnetKind(c.bonnetLen):c[s.dataset.k])===b.dataset.v)));
 $('ctl').querySelectorAll('[data-x]').forEach(i=>i.checked=!!c[i.dataset.x]);
 if(document.activeElement!==$('cdo'))$('cdo').value=c.cdOverride||'';
 if(document.activeElement!==$('fill'))$('fill').value=c.fill;
}
function carChanged(soft){
 syncCtl();drawCar();carOut();save();if(plan||segs.length)calcRoute();
}
function carOut(){
 const c=S.car,p=S.params,e=C.estimateCd(c),A=C.frontalArea(c),cdA=e.cd*A;
 $('carOut').innerHTML=`<div><b>${e.cd.toFixed(3)}</b><small>Cd ${c.cdOverride?'(override)':'(estimate)'}</small></div><div><b>${A.toFixed(2)} m²</b><small>frontal area A</small></div><div><b>${cdA.toFixed(2)} m²</b><small>CdA</small></div><div><b>${(C.crr(c)*1000).toFixed(2)}‰</b><small>rolling Crr @ ${c.tyreBar.toFixed(1)} bar</small></div><div><b>${C.totalMass(c)} kg</b><small>total mass</small></div>`;
 const k=C.cruise(100,c,p),t=k.kw.roll+k.kw.aero+k.kw.fric+k.kw.acc;
 const seg=[['roll','Rolling',k.kw.roll,'var(--c-se)'],['aero','Air drag',k.kw.aero,'var(--c-mw)'],['fric','Engine friction',k.kw.fric,'var(--c-lo)'],['acc','Accessories',k.kw.acc,'var(--line)']];
 $('bd').innerHTML=`<div class="sub" style="margin-bottom:4px">Where the energy goes at 100 km/h</div><div class="bar">${seg.map(s=>`<i style="width:${s[2]/t*100}%;background:${s[3]}"></i>`).join('')}</div><div class="row sub" style="gap:12px;margin-top:4px">${seg.map(s=>`<span style="white-space:nowrap"><b style="color:${s[3]}">■</b> ${s[1]} ${Math.round(s[2]/t*100)}%</span>`).join('')}</div>`;
 $('spdTab').innerHTML='<tr><th>km/h</th>'+[50,70,80,90,100,110,120,130].map(v=>`<th>${v}</th>`).join('')+'</tr><tr><td class="mono">L/100</td>'+[50,70,80,90,100,110,120,130].map(v=>`<td class="mono">${C.cruise(v,c,p).l100.toFixed(1)}</td>`).join('')+'</tr><tr><td class="mono">€/100</td>'+[50,70,80,90,100,110,120,130].map(v=>`<td class="mono">${(C.cruise(v,c,p).l100*S.prices.NL).toFixed(1)}</td>`).join('')+'</tr>';
 $('cdParts').innerHTML=e.parts.map(x=>`<div style="display:flex;justify-content:space-between;gap:8px"><span>${esc(x.label)}</span><span>${x.val>=0?'+':''}${x.val.toFixed(3)}</span></div>`).join('')+`<div style="display:flex;justify-content:space-between;border-top:1px solid var(--line);margin-top:4px;padding-top:4px"><b>Estimate</b><b>${e.auto.toFixed(3)}</b></div>`;
 $('calOut').textContent=S.params.calib!==1?`calibration ×${S.params.calib.toFixed(3)} active`:'';
}
/* silhouette */
const D2R=Math.PI/180;
function geo(){
 const c=S.car,sc=Math.min(360/c.length,185/2.8),y0=212,x0=30,x1=x0+c.length*sc;
 const yb=y0-c.clearance*sc,yf=y0-c.frontClear*sc,yr=y0-c.height*sc,bl=c.bonnetLen*sc;
 const yh=y0-Math.min(c.cowl,c.height-0.2)*sc,xw=x1-bl;
 const yt=Math.min(yh+Math.tan(c.bonnetSlope*D2R)*bl,yf-0.12*sc);
 const xr=Math.max(x0+0.5*sc,xw-(yh-yr)*Math.tan(c.rake*D2R));
 const yd=yr+0.7*(yb-yr),dy=yd-yr;
 const xrr=clamp(x0+dy*Math.tan(c.rearAngle*D2R),x0,xr-0.3*sc);
 const xf=x1-0.8*sc;
 return{sc,y0,x0,x1,yb,yf,yr,bl,yh,xw,yt,xr,yd,dy,xrr,xf};
}
function drawCar(){
 const c=S.car,g=geo(),{sc,y0,x0,x1,yb,yf,yr,yh,xw,yt,xr,yd,xrr,xf}=g;
 const pts=[[x1,yf],[xf,yb],[x0,yb],[x0,yd],[xrr,yr],[xr,yr],[xw,yh],[x1,yt]];
 const P=a=>a.map(q=>q[0].toFixed(1)+','+q[1].toFixed(1)).join(' ');
 const rr=0.3*sc,ry=y0-rr,xrw=x0+0.85*sc,xfw=x1-0.95*sc;
 const gl=[[xr,yr+3],[xw,yh],[xw-0.9*sc,yh],[xrr+2,yr+3]];
 let s=`<line x1="0" y1="${y0}" x2="420" y2="${y0}" stroke="var(--line)"/>`;
 s+=`<polygon points="${P(pts)}" fill="var(--surface)" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round"/>`;
 s+=`<polygon points="${P(gl)}" fill="var(--accent-soft)"/>`;
 s+=`<polyline points="${P([[xrr,yr],[xr,yr],[xw,yh],[x1,yt]])}" fill="none" stroke="var(--accent)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`;
 [xrw,xfw].forEach(w=>s+=`<circle cx="${w}" cy="${ry}" r="${rr}" fill="var(--ink)"/><circle cx="${w}" cy="${ry}" r="${rr*0.5}" fill="var(--surface)"/>`);
 if(c.mirrors>=1)s+=`<rect x="${xw-2}" y="${yh-8}" width="9" height="7" rx="2" fill="var(--ink)"/>`;
 if(c.mirrors>=2)s+=`<rect x="${xw-6}" y="${yh-10}" width="9" height="7" rx="2" fill="var(--muted)" opacity=".7"/>`;
 if(c.roofBox)s+=`<rect x="${xrr+0.2*sc}" y="${yr-0.28*sc}" width="${Math.max(10,xr-xrr-0.1*sc)}" height="${0.28*sc}" rx="5" fill="var(--muted)"/>`;
 if(c.roofRails)s+=`<line x1="${xrr}" y1="${yr-3}" x2="${xr}" y2="${yr-3}" stroke="var(--muted)" stroke-width="2"/>`;
 if(c.bikeRack)s+=`<rect x="${x0-9}" y="${yb-0.5*sc}" width="8" height="${0.5*sc}" fill="var(--muted)"/>`;
 const H=(k,x,y,l,dx,dy2)=>`<circle data-h="${k}" cx="${x}" cy="${y}" r="10"/><text x="${x+dx}" y="${y+dy2}" font-size="9" fill="var(--muted)" stroke="none" text-anchor="middle" pointer-events="none">${l}</text>`;
 s+=`<g fill="var(--accent)" stroke="var(--accent-ink)" stroke-width="1.5" style="cursor:grab">`
  +H('height',(xr+xrr)/2,yr,'roof',0,-14)+H('rake',xr,yr,'screen',0,-14)+H('rear',xrr,yr,'rear',0,-14)
  +H('cowl',xw,yh,'cowl',-2,-14)+H('tip',x1,yt,'bonnet',0,-14)
  +H('floor',(xrw+xfw)/2,yb,'floor',0,20)+H('lip',x1,yf,'lip',0,20)+`</g>`;
 s+=`<text x="${x0}" y="14" font-size="11" fill="var(--muted)">Cd ${C.estimateCd(c).cd.toFixed(3)} · A ${C.frontalArea(c).toFixed(2)} m² · ${c.length.toFixed(2)}×${c.width.toFixed(2)}×${c.height.toFixed(2)} m</text>`;
 $('car').innerHTML=s;
}
(function(){
 const svg=$('car');let drag=null,bl0=0;
 const pt=e=>{const m=svg.getScreenCTM().inverse(),p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(m)};
 svg.addEventListener('pointerdown',e=>{const h=e.target.dataset&&e.target.dataset.h;if(!h)return;drag=h;bl0=S.car.bonnetLen;svg.setPointerCapture(e.pointerId);e.preventDefault()});
 svg.addEventListener('pointermove',e=>{if(!drag)return;const q=pt(e),g=geo(),c=S.car,R=(v,d)=>Math.round(v*d)/d;
  switch(drag){
   case 'height':c.height=R(clamp((g.y0-q.y)/g.sc,1.2,2.8),100);c.cowl=Math.min(c.cowl,R(c.height-0.2,100));break;
   case 'rake':c.rake=Math.round(clamp(Math.atan((g.xw-q.x)/Math.max(g.yh-g.yr,10))/D2R,20,75));break;
   case 'cowl':c.cowl=R(clamp((g.y0-q.y)/g.sc,0.5,Math.min(1.4,c.height-0.2)),100);c.bonnetLen=R(clamp((g.x1-q.x)/g.sc,0,1.6),100);break;
   case 'tip':c.bonnetSlope=Math.round(clamp(Math.atan((q.y-g.yh)/Math.max(g.bl,12))/D2R,0,25));c.bonnetLen=R(clamp(bl0+(q.x-g.x1)/g.sc,0,1.6),100);break;
   case 'rear':c.rearAngle=Math.round(clamp(Math.atan((q.x-g.x0)/Math.max(g.dy,10))/D2R,0,75));break;
   case 'floor':c.clearance=R(clamp((g.y0-q.y)/g.sc,0.10,0.40),100);break;
   case 'lip':c.frontClear=R(clamp((g.y0-q.y)/g.sc,0.10,0.45),100);break;}
  carChanged(true)});
 const end=()=>{drag=null};svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);
})();
$('preset').innerHTML=Object.entries(C.PRESETS).map(([k,v])=>`<option value="${k}">${esc(v.name)}</option>`).join('');
function loadPreset(k){const c=clone(C.PRESETS[k]);S.params.calib=c.calib||1;delete c.calib;S.car=c;S.presetKey=k;if(c.plate)$('plate').value=c.plate.replace(/^(..)(..)(..)$/,'$1-$2-$3')}
$('preset').onchange=e=>{loadPreset(e.target.value);carChanged()};
$('plateGo').onclick=async()=>{
 const st=$('plateStat');st.textContent='looking up…';
 try{const r=await C.lookupPlate($('plate').value,env());const v=r.value,c=S.car;
  if(v.massRoadReady||v.massEmpty)c.mass=v.massRoadReady||v.massEmpty+100;if(v.length)c.length=v.length;if(v.disp)c.disp=v.disp;if(v.width)c.width=v.width;if(v.height)c.height=v.height;
  carChanged();
  st.innerHTML=`<span class="pill ${r.layer==='rdw'||r.layer==='rdw-soql'?'ok':'fb'}">${r.layer}</span> <b>${esc(v.name||v.plate)}</b> · ${v.kw||'?'} kW · ${esc(v.fuel||'?')} · ${esc(v.euro||'')} · ${v.massEmpty||'?'} kg empty · ${v.length||'?'} m · ${v.disp||'?'} L${v.width?'':' · width/height are not in RDW: check the sliders'}${/benz/i.test(v.fuel||'benzine')?'':' · <span class="err">not petrol — this model is petrol only</span>'}`;
 }catch(e){st.innerHTML=`<span class="err">${esc(e.message)}</span> — enter mass/length/engine by hand.`}
};
$('calGo').onclick=()=>{const v=+$('calV').value,m=+$('calL').value;if(!(v>0&&m>0))return;const p=Object.assign({},S.params,{calib:1});S.params.calib=m/C.cruise(v,S.car,p).l100;carChanged()};
$('calReset').onclick=()=>{S.params.calib=(C.PRESETS[S.presetKey]||{}).calib||1;carChanged()};

