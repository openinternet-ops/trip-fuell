'use strict';
/* ---------- TRIPS tab ---------- */
function tripCost(t){const T=C.computeRoute(t.segs,S.car,S.params,S.prices,S.profiles[t.profile]||S.profiles.limit).total,m=t.round?2:1;return{cost:T.cost*m,L:T.L*m,km:T.km*m}}
function renderTrips(){
 $('budLines').innerHTML=S.budget.map((b,i)=>`<div class="row" style="flex-wrap:nowrap" data-i="${i}"><input type="text" data-f="name" value="${esc(b.name)}" style="flex:2"><input type="number" data-f="amt" value="${b.amt}" style="flex:1;min-width:70px"><select data-f="kind" style="flex:1;min-width:80px"><option value="income"${b.kind==='income'?' selected':''}>income</option><option value="fixed"${b.kind==='fixed'?' selected':''}>fixed cost</option></select><button class="b g sm" data-del="${i}" aria-label="remove line">✕</button></div>`).join('');
 $('tripEmpty').hidden=S.trips.length>0;
 $('tripList').innerHTML=S.trips.map((t,i)=>`<div class="card" style="background:var(--bg)" data-i="${i}"><div class="row" style="flex-wrap:nowrap;justify-content:space-between"><input type="text" data-f="label" value="${esc(t.label)}"><button class="b g sm" data-del="${i}" aria-label="remove trip">✕</button></div>
 <div class="row" style="margin-top:6px"><label class="f" style="width:84px"><span>× / month</span><input type="number" min="0" data-f="times" value="${t.times}"></label><label class="f" style="flex:1;min-width:140px"><span>profile</span><select data-f="profile">${Object.entries(S.profiles).map(([k,p])=>`<option value="${k}"${k===t.profile?' selected':''}>${esc(p.label)}</option>`).join('')}</select></label><label class="row" style="gap:6px;margin-top:14px"><input type="checkbox" data-f="round" ${t.round?'checked':''}> round trip</label></div>
 <div class="sub mono" data-o="t" style="margin-top:6px"></div></div>`).join('');
 updTrips();
}
function updTrips(){
 let tot=0,km=0;
 document.querySelectorAll('#tripList [data-i]').forEach(el=>{const t=S.trips[+el.dataset.i];if(!t)return;const c=tripCost(t);tot+=c.cost*t.times;km+=c.km*t.times;el.querySelector('[data-o=t]').textContent=`${eur(c.cost)} per trip · ${f1(c.L)} L · ${f1(c.km,0)} km → ${eur(c.cost*t.times)} / month`});
 const inc=S.budget.filter(b=>b.kind==='income').reduce((a,b)=>a+(+b.amt||0),0),fix=S.budget.filter(b=>b.kind==='fixed').reduce((a,b)=>a+(+b.amt||0),0),avail=inc-fix,rem=avail-tot,pct=avail>0?clamp(tot/avail*100,0,100):100;
 $('budOut').innerHTML=`<div class="row" style="gap:20px"><div><div class="sub">Income − fixed</div><div class="big">${eur(avail)}</div></div><div><div class="sub">Trips</div><div class="big">${eur(tot)}</div></div><div><div class="sub">Left over</div><div class="big ${rem<0?'err':''}" style="${rem>=0?'color:var(--ok)':''}">${eur(rem)}</div></div></div>
 <div class="bar" style="margin-top:10px"><i style="width:${pct}%;background:${rem<0?'var(--bad)':'var(--accent)'}"></i></div><div class="sub" style="margin-top:4px">${f1(km,0)} km/month · ${avail>0?f1(tot/avail*100,0)+'% of what’s available goes to fuel':'no budget available'}${rem<0?' — over budget':''}</div>`;
}
$('budLines').addEventListener('input',e=>{const r=e.target.closest('[data-i]'),f=e.target.dataset.f;if(!r||!f)return;S.budget[+r.dataset.i][f]=f==='amt'?+e.target.value:e.target.value;save();updTrips()});
$('budLines').addEventListener('click',e=>{const d=e.target.dataset.del;if(d!=null){S.budget.splice(+d,1);save();renderTrips()}});
$('addLine').onclick=()=>{S.budget.push({name:'New line',amt:0,kind:'income'});save();renderTrips()};
$('tripList').addEventListener('input',e=>{const r=e.target.closest('[data-i]'),f=e.target.dataset.f;if(!r||!f)return;const t=S.trips[+r.dataset.i];t[f]=f==='times'?Math.max(0,+e.target.value||0):f==='round'?e.target.checked:e.target.value;save();updTrips()});
$('tripList').addEventListener('click',e=>{const d=e.target.dataset.del;if(d!=null){S.trips.splice(+d,1);save();renderTrips()}});

/* ---------- DRIVES ---------- */
const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
let dvMonth=today().slice(0,7);
function renderDrives(){
 $('dv_date').value=$('dv_date').value||today();$('dv_month').value=dvMonth;
 $('dvList').innerHTML=S.trips.map(t=>`<option value="${esc(t.label)}">`).join('');
 $('dv_trip').innerHTML='<option value="">Fill from a saved trip…</option>'+S.trips.map((t,i)=>`<option value="${i}">${esc(t.label)}</option>`).join('');
 const list=S.drives.filter(d=>d.date.slice(0,7)===dvMonth).sort((a,b)=>b.date.localeCompare(a.date));
 const sum=k=>list.reduce((a,d)=>a+(+d[k]||0),0),km=sum('km'),L=sum('litres'),eu=sum('eur'),rest=sum('rest');
 const withL=list.filter(d=>d.litres>0&&d.km>0),avg=withL.length?withL.reduce((a,d)=>a+d.litres,0)/withL.reduce((a,d)=>a+d.km,0)*100:null;
 $('dv_sum').innerHTML=[[f1(km,0)+' km','driven'],[list.length,'drives'],[eur(eu),'spent on fuel'],[f1(L)+' L','fuel'],[avg?f1(avg)+' L/100':'–','real average'],[rest,'rest stops']].map(x=>`<div><b>${x[0]}</b><small>${x[1]}</small></div>`).join('');
 const inc=S.budget.filter(b=>b.kind==='income').reduce((a,b)=>a+(+b.amt||0),0),fix=S.budget.filter(b=>b.kind==='fixed').reduce((a,b)=>a+(+b.amt||0),0),avail=inc-fix,left=avail-eu;
 $('dv_bud').innerHTML=`<div class="sub">Budget available ${eur(avail)} (Trips &amp; budget tab) · fuel spent ${eur(eu)}</div><div class="bar" style="margin-top:4px"><i style="width:${avail>0?clamp(eu/avail*100,0,100):100}%;background:${left<0?'var(--bad)':'var(--accent)'}"></i></div><div class="mono" style="margin-top:4px;${left<0?'color:var(--bad)':'color:var(--ok)'}">${eur(left)} left</div>`;
 const est=list.filter(d=>d.estL>0&&d.litres>0);
 if(est.length){const a=est.reduce((x,d)=>x+d.litres,0),b=est.reduce((x,d)=>x+d.estL,0);$('dv_cal').innerHTML=`Model said ${f1(b)} L, you used ${f1(a)} L on ${est.length} linked drive(s) (${a>b?'+':''}${f1((a/b-1)*100,0)}%). <button class="b g sm" id="dv_apply">Apply to calibration (×${(S.params.calib*a/b).toFixed(2)})</button>`;$('dv_apply').onclick=()=>{S.params.calib=+(S.params.calib*a/b).toFixed(3);save();carOut();calcRoute();renderDrives()}}else $('dv_cal').textContent='Log drives from a saved trip with litres to compare with the model.';
 $('dv_tab').innerHTML='<tr><th>Date</th><th>Route</th><th>km</th><th>L</th><th>€</th><th>L/100</th><th>rest</th><th>notes</th><th></th></tr>'+list.map(d=>`<tr><td class="mono">${d.date.slice(5)}</td><td>${esc(d.label)}</td><td class="mono">${f1(d.km)}</td><td class="mono">${d.litres?f1(d.litres,2):'–'}</td><td class="mono">${d.eur?f1(d.eur,2):'–'}</td><td class="mono">${d.litres&&d.km?f1(d.litres/d.km*100):'–'}</td><td class="mono">${d.rest||0}</td><td class="sub" style="white-space:normal">${esc(d.note||'')}</td><td><button class="b g sm" data-del="${d.id}" aria-label="delete drive">✕</button></td></tr>`).join('');
}
$('dv_month').onchange=e=>{dvMonth=e.target.value||dvMonth;renderDrives()};
$('dv_trip').onchange=e=>{const t=S.trips[+e.target.value];if(!t)return;const c=tripCost(t);$('dv_label').value=t.label;$('dv_km').value=c.km.toFixed(1);$('dv_l').value='';$('dv_eur').value='';$('dv_trip').dataset.est=c.L.toFixed(2)};
$('dv_add').onclick=()=>{
 const km=+$('dv_km').value,L=+$('dv_l').value||0;let eu=+$('dv_eur').value||0;
 if(!(km>0)){$('dv_stat').textContent='enter the km first';return}
 if(!eu&&L)eu=L*S.prices.NL;
 S.drives.push({id:Date.now(),date:$('dv_date').value||today(),label:$('dv_label').value||'Drive',km,litres:L,eur:+eu.toFixed(2),rest:+$('dv_rest').value||0,note:$('dv_note').value,estL:+$('dv_trip').dataset.est||0});
 ['dv_km','dv_l','dv_eur','dv_note'].forEach(i=>$(i).value='');$('dv_rest').value=0;$('dv_trip').value='';delete $('dv_trip').dataset.est;
 $('dv_stat').textContent='added ✓';setTimeout(()=>$('dv_stat').textContent='',2000);dvMonth=S.drives[S.drives.length-1].date.slice(0,7);save();renderDrives();
};
$('dv_tab').addEventListener('click',e=>{const d=e.target.dataset.del;if(d){S.drives=S.drives.filter(x=>String(x.id)!==d);save();renderDrives()}});
$('dv_export').onclick=()=>{$('dv_json').value=JSON.stringify(S.drives,null,1);$('dv_json').select()};
$('dv_import').onclick=()=>{try{const a=JSON.parse($('dv_json').value);if(!Array.isArray(a))throw 0;const ids=new Set(S.drives.map(d=>d.id));a.forEach(d=>{if(d&&d.date&&d.km>=0&&!ids.has(d.id))S.drives.push(Object.assign({id:Date.now()+Math.random()},d))});save();renderDrives();$('dv_stat').textContent='imported ✓'}catch(e){$('dv_stat').textContent='not valid JSON'}};

