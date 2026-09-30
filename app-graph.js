'use strict';
/* ---------- topology graph ---------- */
let GR=null,gSel=null;
const gOpts=()=>({roads:$('gRoads').checked,mesh:$('gMesh').checked,lab:$('gLab').checked,method:$('gMethod').value||(plan&&plan.analysis&&plan.analysis.method)||'ratio'});
function graphLayout(G,o){
 const nodes=(o.roads&&G.roads.length<=420?G.clusters.concat(G.roads):G.clusters).map(n=>Object.assign({},n));
 const idx=new Map(nodes.map((n,i)=>[n.id,i]));
 let la0=1e9,la1=-1e9,lo0=1e9,lo1=-1e9;nodes.forEach(n=>{if(!n.p)n.p=[0,0];la0=Math.min(la0,n.p[0]);la1=Math.max(la1,n.p[0]);lo0=Math.min(lo0,n.p[1]);lo1=Math.max(lo1,n.p[1])});
 const cosl=Math.cos((la0+la1)/2*Math.PI/180),sx=(lo1-lo0)*cosl||1e-6,sy=(la1-la0)||1e-6,sc=Math.min(600/sx,420/sy);
 nodes.forEach(n=>{n.x=350+((n.p[1]-lo0)*cosl-sx/2)*sc;n.y=260-((n.p[0]-la0)-sy/2)*sc;n.r=(n.kind==='cluster'?6:2.5)+Math.sqrt(n.lenM)/(n.kind==='cluster'?14:18);n.vx=n.vy=0});
 nodes.forEach((n,i)=>{n.x+=(i%7-3)*0.7;n.y+=(i%5-2)*0.7}); // break exact overlaps
 const ed=G.edges.filter(e=>idx.has(e.a)&&idx.has(e.b)&&(e.order===1||o.mesh));
 const kT=nodes.length>60?5:9; // px per sqrt(second)
 for(let it=0;it<300;it++){
  const cool=1-it/300;
  ed.forEach(e=>{const a=nodes[idx.get(e.a)],b=nodes[idx.get(e.b)];let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1e-3;const rest=Math.max(a.r+b.r+2,kT*Math.sqrt(Math.max(e.sec,1))*(a.kind==='cluster'?1:0.6)),f=(d-rest)*0.06*(e.order===2?0.5:1);dx/=d;dy/=d;a.vx+=dx*f;a.vy+=dy*f;b.vx-=dx*f;b.vy-=dy*f});
  for(let i=0;i<nodes.length;i++){const a=nodes[i];if(a.kind==='road'&&!o.roads)continue;for(let j=i+1;j<nodes.length;j++){const b=nodes[j];if(a.kind!==b.kind)continue;let dx=b.x-a.x,dy=b.y-a.y,d2=dx*dx+dy*dy;const m=(a.r+b.r+6);if(d2<m*m*4){const d=Math.sqrt(d2)||1e-3,f=(m*2-d)*0.05;dx/=d;dy/=d;a.vx-=dx*f;a.vy-=dy*f;b.vx+=dx*f;b.vy+=dy*f}}}
  nodes.forEach(n=>{n.vx*=0.6;n.vy*=0.6;n.x=Math.max(20,Math.min(680,n.x+n.vx*cool));n.y=Math.max(20,Math.min(500,n.y+n.vy*cool))});
 }
 return {nodes,idx,ed};
}
function renderGraph(){
 const A=plan&&plan.analysis,svg=$('graph');if(!svg)return;
 const sel=$('gMethod');if(A&&!sel.options.length){sel.innerHTML=C.METHODS.map(m=>`<option value="${m}">${m}</option>`).join('');sel.value=A.method}
 if(!A){svg.innerHTML='';return}
 const o=gOpts();let G;try{G=C.buildGraph(plan.route,A,o.method)}catch(e){svg.innerHTML='';return}
 const L=graphLayout(G,o);GR={G,L,o,A};
 const clBy=new Map(G.clusters.map(c=>[c.cl,c]));
 let h='';
 // cluster blobs
 G.clusters.forEach(c=>{const mem=L.nodes.filter(n=>n.kind==='road'&&n.cluster===c.cl);const cn=L.nodes[L.idx.get(c.id)];let cx=cn.x,cy=cn.y,r=cn.r+10;if(mem.length){cx=mem.reduce((a,n)=>a+n.x,0)/mem.length;cy=mem.reduce((a,n)=>a+n.y,0)/mem.length;r=Math.max(...mem.map(n=>Math.hypot(n.x-cx,n.y-cy)+n.r))+8}h+=`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${hwCol(c.hw)}" opacity=".13"/>`});
 L.ed.forEach(e=>{const a=L.nodes[L.idx.get(e.a)],b=L.nodes[L.idx.get(e.b)];h+=`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="var(--muted)" stroke-width="${e.order===1?1.4:.6}" opacity="${e.order===1?.7:.45}"/>`});
 L.nodes.forEach(n=>{const cl=n.kind==='cluster'?n:clBy.get(n.cluster),col=hwCol(cl?cl.hw:'residential'),sel=gSel===n.id;
  h+=`<g class="gn" data-id="${n.id}" style="cursor:pointer"><circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${n.r.toFixed(1)}" fill="${col}" stroke="${sel?'var(--ink)':'var(--surface)'}" stroke-width="${sel?2.5:1.2}"/>${n.kind==='cluster'&&o.lab?`<text x="${n.x.toFixed(1)}" y="${(n.y+3.5).toFixed(1)}" font-size="10" font-weight="700" text-anchor="middle" fill="#fff">${n.cl}</text>`:''}</g>`});
 // start / end markers
 const f=L.nodes[0],l=L.nodes[G.clusters.length-1];h+=`<text x="${f.x.toFixed(1)}" y="${(f.y-f.r-5).toFixed(1)}" font-size="11" font-weight="600" text-anchor="middle" fill="var(--ink)" stroke="var(--bg)" stroke-width="3" paint-order="stroke">START</text><text x="${l.x.toFixed(1)}" y="${(l.y-l.r-5).toFixed(1)}" font-size="11" font-weight="600" text-anchor="middle" fill="var(--ink)" stroke="var(--bg)" stroke-width="3" paint-order="stroke">END</text>`;
 svg.innerHTML=h;
}
$('graph').addEventListener('click',e=>{const g=e.target.closest('.gn');if(!g||!GR)return;gSel=g.dataset.id;const n=GR.G.nodes.find(x=>x.id===gSel),el=$('gInfo');renderGraph();el.hidden=false;
 const nb=GR.G.edges.filter(x=>x.a===gSel||x.b===gSel).map(x=>{const other=x.a===gSel?x.b:x.a,on=GR.G.nodes.find(y=>y.id===other);return `${on.kind==='cluster'?'cluster '+on.cl:esc(on.label)} <span class="sub">(${x.order===2?'skip-one, ':''}${f1(x.distM/1000,1)} km · ${fmtDelta(x.sec/60)})</span>`});
 el.innerHTML=n.kind==='cluster'?`<b>Cluster ${n.cl}</b> · ${n.hw} (${n.conf}) · ${f1(n.lenM/1000,1)} km · ${n.n} roads · ${fmtDelta(n.durS/60)} to cross · ${Math.round(n.kmh)} km/h<div class="sub">median step ${mf(n.medLen)} m · most common ${mf(n.modeLen)} m · mean ${mf(n.meanLen)} m · middle point ${n.p[0].toFixed(4)}, ${n.p[1].toFixed(4)}</div><div style="margin-top:4px">links: ${nb.join(' · ')}</div>`
  :`<b>${esc(n.label)}</b> · road ${n.i+1} in cluster ${n.cluster} · ${mf(n.lenM)} m · ${Math.round(n.durS)} s · ${n.kmh?Math.round(n.kmh)+' km/h':''}<div class="sub">middle point ${n.p[0].toFixed(4)}, ${n.p[1].toFixed(4)}</div><div style="margin-top:4px">links: ${nb.join(' · ')}</div>`});
['gMethod','gRoads','gMesh','gLab'].forEach(id=>$(id).addEventListener('change',renderGraph));$('gRelax').onclick=renderGraph;
$('gCopy').onclick=async()=>{if(!GR)return;const j=JSON.stringify(graphExport(GR.A,GR.o.method));const b=$('gCopy');try{await navigator.clipboard.writeText(j);b.textContent='Copied ✓'}catch(e){const ta=$('anaJson');ta.value=j;ta.hidden=false;ta.select();b.textContent='Select & copy below'}setTimeout(()=>b.textContent='Copy graph JSON',3000)};
function graphExport(A,m){const G=C.buildGraph(plan.route,A,m),r5=x=>+x.toFixed(5);
 return{method:G.method,clusters:G.clusters.map(c=>({id:c.cl,lat:r5(c.p[0]),lon:r5(c.p[1]),lenM:Math.round(c.lenM),sec:Math.round(c.durS),roads:c.n,medianStepM:Math.round(c.medLen),mostCommonStepM:Math.round(c.modeLen),hw:c.hw})),roads:G.roads.map(r=>[r5(r.p[0]),r5(r.p[1]),Math.round(r.lenM),Math.round(r.durS),r.cluster]),linksNext:G.edges.filter(e=>e.order===1&&e.a[0]==='c').map(e=>[e.a,e.b,Math.round(e.distM),Math.round(e.sec)])}}

