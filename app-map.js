'use strict';
/* ---------- zoomable map ---------- */
const MV={cx:0,cy:0,z:8,W:700,H:460,has:false};window._MV=MV;let mapFitNext=true,selPt=null,drag=null,mapRaf=0;
const WX=(lon,z)=>(lon+180)/360*256*2**z,WY=(lat,z)=>{const r=lat*Math.PI/180;return(1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*256*2**z};
const hwCol=h=>{h=String(h).replace('_link','');return h==='motorway'?'var(--c-mw)':(h==='trunk'||h==='primary')?'var(--c-pr)':(h==='secondary'||h==='tertiary')?'var(--c-se)':'var(--c-lo)'};
function routeCoords(){const cs=segs.flatMap(s=>s.pts||[]);const rc=(plan&&plan.route&&plan.route.coords)||[];return cs.length?cs:rc}
function mapFit(pts){
 const all=pts&&pts.length?pts:routeCoords();if(!all.length)return;let lo=1e9,hi=-1e9,a0=1e9,a1=-1e9;all.forEach(q=>{lo=Math.min(lo,q[1]);hi=Math.max(hi,q[1]);a0=Math.min(a0,q[0]);a1=Math.max(a1,q[0])});
 const pad=40,sx=(hi-lo)/360*256||1e-6,sy=Math.abs(WY(a0,0)-WY(a1,0))||1e-6;
 MV.z=Math.max(2,Math.min(16,Math.log2(Math.min((MV.W-2*pad)/sx,(MV.H-2*pad)/sy))));
 MV.cx=(WX(lo,MV.z)+WX(hi,MV.z))/2;MV.cy=(WY(a0,MV.z)+WY(a1,MV.z))/2;MV.has=true;
}
function mapZoomAt(sx,sy,dz){const z0=MV.z,z1=Math.max(2,Math.min(18,z0+dz));if(z1===z0)return;const wx=MV.cx-MV.W/2+sx,wy=MV.cy-MV.H/2+sy,f=2**(z1-z0);MV.z=z1;MV.cx=wx*f-sx+MV.W/2;MV.cy=wy*f-sy+MV.H/2;mapSched()}
function mapGoTo(p,z){if(!p)return;MV.z=Math.max(MV.z,z||10);MV.cx=WX(p[1],MV.z);MV.cy=WY(p[0],MV.z);mapSched()}
function mapSched(){if(mapRaf)return;mapRaf=requestAnimationFrame(()=>{mapRaf=0;drawMap(true)})}
function tlMapPoints(){
 const out=[];if(!TL)return out;
 if(S.tl.showDist)TL.dist.forEach((x,i)=>{if(i>0&&i<TL.N)out.push(Object.assign({id:'dist:'+i},x))});
 if(S.tl.showTime)TL.time.forEach((x,i)=>{if(i>0&&i<TL.N)out.push(Object.assign({id:'time:'+i},x))});
 if(S.tl.showRest)TL.rests.forEach((x,i)=>out.push(Object.assign({id:'rest:'+i},x)));
 return out;
}
function drawMap(keep){
 const svg=$('map');const rc=(plan&&plan.route&&plan.route.coords)||[];const all=routeCoords();
 if(!all.length){svg.innerHTML='';return}
 if(!keep&&(mapFitNext||!MV.has)){mapFit(all);mapFitNext=false}
 const {W,H,z}=MV,vx=MV.cx-W/2,vy=MV.cy-H/2;
 const X=q=>WX(q[1],z)-vx,Y=q=>WY(q[0],z)-vy;
 let s='';
 if(S.tl.bg){const zt=Math.max(2,Math.min(18,Math.round(z))),sc=2**(z-zt),ts=256*sc,ox=vx/ts,oy=vy/ts;
  for(let tx=Math.floor(ox);tx<=Math.floor((vx+W)/ts);tx++)for(let ty=Math.floor(oy);ty<=Math.floor((vy+H)/ts);ty++){if(ty<0||ty>=2**zt)continue;const wx=((tx%2**zt)+2**zt)%2**zt;s+=`<image href="https://tile.openstreetmap.org/${zt}/${wx}/${ty}.png" x="${(tx*ts-vx).toFixed(1)}" y="${(ty*ts-vy).toFixed(1)}" width="${(ts+.6).toFixed(1)}" height="${(ts+.6).toFixed(1)}" opacity=".92"/>`}}
 const line=pts=>{let o=[],lx=-1e9,ly=-1e9;pts.forEach(q=>{const x=X(q),y=Y(q);if(Math.abs(x-lx)+Math.abs(y-ly)>=1.5){o.push(x.toFixed(1)+','+y.toFixed(1));lx=x;ly=y}});return o.join(' ')};
 s+='<g fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="'+line(all)+'" stroke="#fff" stroke-width="9" opacity=".85"/>';
 const hs=segs.some(x=>x.pts&&x.pts.length>1);
 if(hs)segs.forEach(sg=>{if(sg.pts&&sg.pts.length>1)s+=`<polyline points="${line(sg.pts)}" stroke="${hwCol(sg.hw)}" stroke-width="5"/>`});else s+='<polyline points="'+line(rc)+'" stroke="var(--c-lo)" stroke-width="5"/>';
 s+='</g>';
 const mk=(q,l)=>`<circle cx="${X(q).toFixed(1)}" cy="${Y(q).toFixed(1)}" r="7" fill="var(--accent)" stroke="var(--accent-ink)" stroke-width="2"/><text x="${(X(q)+10).toFixed(1)}" y="${(Y(q)-8).toFixed(1)}" font-size="13" font-weight="500" fill="var(--ink)" stroke="var(--surface)" stroke-width="3" paint-order="stroke">${esc(l)}</text>`;
 const pts=(plan&&plan.pts)||[all[0],all[all.length-1]],names=S.places.filter(x=>x.trim());
 pts.forEach((q,i)=>s+=mk(q,names[i]||(i?'To':'From')));
 if(plan&&plan.detour&&plan.detour.base&&plan.detour.base.coords){s+='<polyline fill="none" stroke="var(--muted)" stroke-width="2.5" stroke-dasharray="6 5" opacity=".9" points="'+line(plan.detour.base.coords)+'"/>';(plan.detour.vias||[]).forEach(v=>{s+=`<g transform="translate(${X(v).toFixed(1)} ${Y(v).toFixed(1)})"><circle r="6" fill="var(--c-rest)" stroke="#fff" stroke-width="1.5"/><text x="9" y="-8" font-size="10.5" font-weight="600" fill="var(--ink)" stroke="var(--surface)" stroke-width="3" paint-order="stroke">detour</text></g>`})}
 if(plan&&plan.scout){plan.scout.cands.forEach((c,i)=>{if(i!==plan.scout.idx)s+=`<circle cx="${X(c.ll).toFixed(1)}" cy="${Y(c.ll).toFixed(1)}" r="3.5" fill="var(--muted)" opacity=".7"/>`});const c=plan.scout.cands[plan.scout.idx];if(c)s+=`<g transform="translate(${X(c.ll).toFixed(1)} ${Y(c.ll).toFixed(1)})"><path d="M0 0 C-9 -12 -9 -22 0 -22 C9 -22 9 -12 0 0Z" fill="var(--bad)" stroke="#fff" stroke-width="1.5"/><circle cy="-14" r="3" fill="#fff"/><text x="11" y="-10" font-size="11.5" font-weight="700" fill="var(--ink)" stroke="var(--surface)" stroke-width="3" paint-order="stroke">${esc(c.label.replace(/ — unnamed$/,''))}</text></g>`}
 // checkpoints / rests
 tlMapPoints().forEach(p=>{if(!p.p)return;const x=X(p.p).toFixed(1),y=Y(p.p).toFixed(1),sel=selPt===p.id,lab=p.kind==='rest'?'☕'+p.k:p.k+'/'+p.N;
  const shape=p.kind==='dist'?`<circle r="${sel?8:6}" fill="var(--accent)" stroke="var(--accent-ink)" stroke-width="1.5"/>`:p.kind==='time'?`<circle r="7" fill="var(--c-time)" fill-opacity=".28" stroke="var(--c-time)" stroke-width="2.5"/>`:`<circle r="9" fill="var(--c-rest)" stroke="#fff" stroke-width="1.6"/><text y="3.6" font-size="10" font-weight="700" text-anchor="middle" fill="#fff">P</text>`;
  s+=`<g class="pt" data-id="${p.id}" transform="translate(${x} ${y})" style="cursor:pointer">${shape}${sel?'<circle r="13" fill="none" stroke="var(--ink)" stroke-width="2"/>':''}<text x="9" y="-9" font-size="10.5" font-weight="600" fill="var(--ink)" stroke="var(--surface)" stroke-width="3" paint-order="stroke">${lab}</text></g>`});
 svg.innerHTML=s;
}
(function mapEvents(){
 const svg=$('map');const pos=e=>{const r=svg.getBoundingClientRect();return[(e.clientX-r.left)/r.width*MV.W,(e.clientY-r.top)/r.height*MV.H]};
 const ptrs=new Map();let pinch=null;
 svg.addEventListener('wheel',e=>{e.preventDefault();const [x,y]=pos(e);mapZoomAt(x,y,-e.deltaY*0.0022)},{passive:false});
 svg.addEventListener('pointerdown',e=>{svg.setPointerCapture&&svg.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,pos(e));drag={moved:0,id:(e.target.closest&&e.target.closest('.pt')||{dataset:{}}).dataset.id};if(ptrs.size===2){const a=[...ptrs.values()];pinch=Math.hypot(a[0][0]-a[1][0],a[0][1]-a[1][1])}});
 svg.addEventListener('pointermove',e=>{if(!ptrs.has(e.pointerId))return;const p=pos(e),o=ptrs.get(e.pointerId);ptrs.set(e.pointerId,p);
  if(ptrs.size===2&&pinch){const a=[...ptrs.values()],d=Math.hypot(a[0][0]-a[1][0],a[0][1]-a[1][1]);mapZoomAt((a[0][0]+a[1][0])/2,(a[0][1]+a[1][1])/2,Math.log2(d/pinch));pinch=d;if(drag)drag.moved=99;return}
  const dx=p[0]-o[0],dy=p[1]-o[1];if(drag){drag.moved+=Math.abs(dx)+Math.abs(dy)}if(drag&&drag.moved>4){MV.cx-=dx;MV.cy-=dy;mapSched()}});
 const up=e=>{ptrs.delete(e.pointerId);if(ptrs.size<2)pinch=null;if(drag&&drag.moved<=4&&drag.id)selectPt(drag.id,false);if(!ptrs.size)drag=null};
 svg.addEventListener('pointerup',up);svg.addEventListener('pointercancel',e=>{ptrs.delete(e.pointerId);drag=null});
 svg.addEventListener('dblclick',e=>{const [x,y]=pos(e);mapZoomAt(x,y,1)});
 $('mapZin').onclick=()=>mapZoomAt(MV.W/2,MV.H/2,1);$('mapZout').onclick=()=>mapZoomAt(MV.W/2,MV.H/2,-1);$('mapFit').onclick=()=>{mapFit();mapSched()};
})();


