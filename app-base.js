'use strict';
const C=Core,$=id=>document.getElementById(id);
const clamp=C.clamp;
const KEY='tripfuel.v2';
const HWN={motorway:'motorway',trunk:'trunk',primary:'primary',secondary:'secondary',tertiary:'tertiary',unclassified:'unclassified',residential:'residential',living_street:'living street',service:'service',motorway_link:'motorway link',trunk_link:'trunk link',primary_link:'primary link',secondary_link:'secondary link',tertiary_link:'tertiary link'};
const clone=o=>JSON.parse(JSON.stringify(o));
let S={car:(()=>{const c=clone(C.PRESETS.partner);delete c.calib;return c})(),presetKey:'partner',params:Object.assign(clone(C.DEFAULT_PARAMS),{calib:C.PRESETS.partner.calib}),prices:{NL:2.449,DE:2.348,BE:1.988},
 profiles:clone(C.PROFILES),profileKey:'limit',places:['Wesel','Dieren'],known:{},mode:'smart',an:clone(C.AN_DEFAULT),drives:[],runs:[],suite:'',round:true,trips:[],
 budget:[{name:'Social security (example — edit)',amt:800,kind:'income'},{name:'Other fixed costs',amt:0,kind:'fixed'}],tab:'car',disabled:{},offline:false,ro:{avoidMotorway:false,avoidToll:false,avoidFerry:false,smaller:false,shortest:false,avoidUnpaved:false,alt:false,altIndex:0},sh:{dtPct:0,dtWhere:'middle',dtSide:'auto',scKind:'off',scTag:'',scR:15,scFrom:25,scTo:75},tl:{div:'off',kmPer:25,density:1,maxN:16,nOverride:0,restEveryH:2,restMin:15,withBreaks:true,depart:'',basis:'model',showDist:true,showTime:true,showRest:true,bg:true}};
let plan=null,segs=[],log=[],nextId=1;
try{const r=JSON.parse(localStorage.getItem(KEY)||'null');if(r&&r.car){S=Object.assign(S,r);S.params=Object.assign(clone(C.DEFAULT_PARAMS),r.params||{});S.params.stopP=Object.assign({},C.DEFAULT_PARAMS.stopP,(r.params||{}).stopP);S.params.sigPerKm=Object.assign({},C.DEFAULT_PARAMS.sigPerKm,(r.params||{}).sigPerKm)}}catch(e){}
S.ro=Object.assign({avoidMotorway:false,avoidToll:false,avoidFerry:false,smaller:false,shortest:false,avoidUnpaved:false,alt:false,altIndex:0},S.ro||{});S.sh=Object.assign({dtPct:0,dtWhere:'middle',dtSide:'auto',scKind:'off',scTag:'',scR:15,scFrom:25,scTo:75},S.sh||{});
S.tl=Object.assign({div:'off',kmPer:25,density:1,maxN:16,nOverride:0,restEveryH:2,restMin:15,withBreaks:true,depart:'',basis:'model',showDist:true,showTime:true,showRest:true,bg:true},S.tl||{});
function save(){try{const {tab,...rest}=S;localStorage.setItem(KEY,JSON.stringify(Object.assign({},rest,{tab})))}catch(e){}}
const f1=(x,d=1)=>Number(x).toLocaleString('en',{minimumFractionDigits:d,maximumFractionDigits:d});
const eur=x=>'€'+f1(x,2);
const mins=s=>{const m=Math.round(s/60);return m>=60?Math.floor(m/60)+'h '+String(m%60).padStart(2,'0')+'m':m+' min'};
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function lg(stage,layer,msg,cls){log.unshift({t:new Date().toLocaleTimeString(),stage,layer,msg,cls});if(log.length>200)log.pop();renderLog()}
function renderLog(){const el=$('log');if(!el)return;el.innerHTML=log.length?log.map(l=>`<div class="${l.cls}">${l.t} ${esc(l.stage)} › ${esc(l.layer)} — ${esc(l.msg)}</div>`).join(''):'<span class="sub">Nothing yet.</span>'}

/* ---------- tabs ---------- */
const TABS=[['car','Car'],['route','Route'],['trips','Trips & budget'],['drives','Drives'],['debug','Debug']];
$('tabs').innerHTML=TABS.map(t=>`<button role="tab" data-t="${t[0]}">${t[1]}</button>`).join('');
$('tabs').onclick=e=>{const t=e.target.dataset&&e.target.dataset.t;if(t)showTab(t)};
function showTab(t){S.tab=t;TABS.forEach(x=>{$('tab-'+x[0]).hidden=x[0]!==t});[...$('tabs').children].forEach(b=>b.setAttribute('aria-selected',b.dataset.t===t));if(t==='trips')renderTrips();if(t==='drives')renderDrives();if(t==='debug')renderDebug();save()}


/* ---------- on-screen error banner (so a broken state is visible instead of silent) ---------- */
(function(){
 let bar=null,n=0;
 function show(msg){n++;if(!bar){bar=document.createElement('div');bar.id='errBar';bar.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:99;background:#b3341f;color:#fff;font:12px/1.4 system-ui,sans-serif;padding:8px 40px 8px 14px;max-height:30vh;overflow:auto';bar.innerHTML='<b>Something went wrong in the page script.</b> <span id="errTxt"></span> <span style="opacity:.8">Debug ▸ “Copy full log” and paste it to me.</span><button style="position:absolute;right:8px;top:6px;background:none;border:0;color:#fff;font-size:16px;cursor:pointer" aria-label="close">✕</button>';document.body.appendChild(bar);bar.querySelector('button').onclick=()=>{bar.remove();bar=null}}
  const t=bar.querySelector('#errTxt');t.textContent=(n>1?'('+n+') ':'')+msg;try{lg('page','script-error',msg,'fail')}catch(e){}}
 window.addEventListener('error',e=>show((e.message||'error')+(e.filename?' — '+String(e.filename).split('/').pop()+':'+e.lineno:'')));
 window.addEventListener('unhandledrejection',e=>{const m=e.reason&&e.reason.message||String(e.reason);if(/cancel|abort/i.test(m))return;show('async: '+m)});
})();
