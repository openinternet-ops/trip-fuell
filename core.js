/* Core: pure functions, no DOM. Works in browser (global Core) and node. */
(function (root) {
'use strict';
const G = 9.81, RHO = 1.2, LHV = 32e6; // E95 ~32 MJ/L
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const R2D = 180 / Math.PI, D2R = Math.PI / 180;

/* ---------- car ---------- */
const PRESETS = {
  partner: { name: 'Peugeot Partner 1.6 16V (13-TP-PK)', plate: '13TPPK', length: 4.14, width: 1.72, height: 1.81, mass: 1329, load: 150,
    bonnetLen: 0.60, bonnetSlope: 14, cowl: 0.95, rake: 55, rearAngle: 8, underbody: 'normal', clearance: 0.16, frontClear: 0.26, mirrors: 2,
    roofRails: false, roofBox: false, bikeRack: false, windowOpen: false, fill: 0.82,
    disp: 1.587, tyreBar: 2.3, tyreType: 'normal', cdOverride: null, calib: 1.2 },
  hatch: { name: 'Generic hatchback', length: 4.05, width: 1.75, height: 1.46, mass: 1150, load: 100,
    bonnetLen: 1.0, bonnetSlope: 14, cowl: 0.80, rake: 60, rearAngle: 30, underbody: 'normal', clearance: 0.14, frontClear: 0.16, mirrors: 2,
    roofRails: false, roofBox: false, bikeRack: false, windowOpen: false, fill: 0.80,
    disp: 1.2, tyreBar: 2.3, tyreType: 'normal', cdOverride: null, calib: 1.1 },
  camper: { name: 'Large camper van', length: 5.99, width: 2.05, height: 2.65, mass: 3000, load: 300,
    bonnetLen: 0.06, bonnetSlope: 6, cowl: 1.0, rake: 42, rearAngle: 0, underbody: 'rough', clearance: 0.22, frontClear: 0.30, mirrors: 2,
    roofRails: true, roofBox: false, bikeRack: false, windowOpen: false, fill: 0.88,
    disp: 2.2, tyreBar: 4.0, tyreType: 'normal', cdOverride: null, calib: 1.1 },
};
const TYRE_CRR = { eco: 0.008, normal: 0.010, allseason: 0.0115, offroad: 0.014 };

function lerpTab(x, tab) { // tab: [[x,y],...] ascending
  if (x <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) { const t = (x - tab[i - 1][0]) / (tab[i][0] - tab[i - 1][0]); return tab[i - 1][1] + t * (tab[i][1] - tab[i - 1][1]); }
  return tab[tab.length - 1][1];
}
const bonnetKind = len => len < 0.15 ? 'none' : len < 0.9 ? 'short' : 'long';
function estimateCd(c) {
  const parts = [{ label: 'Base (smooth body)', val: 0.22 }];
  const bf = clamp(c.bonnetLen / 1.2, 0, 1);
  parts.push({ label: bf < 0.12 ? 'Front: cab-over (flat face)' : 'Front: bonnet ' + c.bonnetLen.toFixed(2) + ' m', val: 0.07 * (1 - bf) });
  parts.push({ label: 'Windscreen rake ' + Math.round(c.rake) + '° from vertical', val: 0.06 * (1 - Math.min(c.rake, 65) / 65) });
  parts.push({ label: 'Bonnet slope ' + Math.round(c.bonnetSlope) + '°', val: 0.04 * (1 - clamp(c.bonnetSlope / 20, 0, 1)) * bf });
  parts.push({ label: 'Rear slope ' + Math.round(c.rearAngle) + '° from vertical', val: lerpTab(c.rearAngle, [[0, 0.05], [25, 0.035], [40, 0.02], [60, 0.005], [75, 0]]) });
  parts.push({ label: 'Underbody: ' + c.underbody, val: { smooth: 0, normal: 0.02, rough: 0.04 }[c.underbody] });
  parts.push({ label: 'Ground clearance ' + Math.round(c.clearance * 100) + ' cm', val: 0.15 * (c.clearance - 0.15) });
  parts.push({ label: 'Front lip height ' + Math.round(c.frontClear * 100) + ' cm', val: 0.10 * (c.frontClear - 0.20) });
  parts.push({ label: c.mirrors + ' outer mirror(s)', val: 0.006 * c.mirrors });
  if (c.roofRails) parts.push({ label: 'Roof rails', val: 0.01 });
  if (c.roofBox) parts.push({ label: 'Roof box', val: 0.06 });
  if (c.bikeRack) parts.push({ label: 'Bike rack', val: 0.05 });
  if (c.windowOpen) parts.push({ label: 'Window open', val: 0.03 });
  const auto = parts.reduce((s, p) => s + p.val, 0);
  return { auto, cd: c.cdOverride > 0 ? c.cdOverride : auto, parts };
}
const frontalArea = c => c.fill * c.width * c.height;
const crr = c => (TYRE_CRR[c.tyreType] || 0.01) * Math.pow(2.5 / clamp(c.tyreBar, 1, 5), 0.35);
const totalMass = c => c.mass + c.load;

const DEFAULT_PARAMS = {
  etaDrive: 0.90, etaI: 0.36, idleLph: 0.6, coldStartL: 0.15, aDec: 1.2, aAcc: 1.0, waitS: 20, accKW: 0.3, calib: 1.0,
  stopP: { motorway: 0, trunk: 0.15, primary: 0.15, secondary: 1 / 3, tertiary: 1 / 3, unclassified: 1 / 3, residential: 1 / 3, living_street: 1 / 3, service: 1 / 3 },
  sigPerKm: { motorway: 0, trunk: 0.05, primary: 0.25, secondary: 0.35, tertiary: 0.35, unclassified: 0.15, residential: 0.6, living_street: 0, service: 0.3 },
};
const HW = Object.keys(DEFAULT_PARAMS.stopP);

/* Willans-line cruise model. v in km/h -> L/100km + breakdown (kW at engine input) */
function cruise(vKmh, c, p) {
  const v = Math.max(vKmh, 8) / 3.6, m = totalMass(c);
  const roll = crr(c) * m * G * v / 1000;
  const cdA = estimateCd(c).cd * frontalArea(c);
  const aero = 0.5 * RHO * cdA * v ** 3 / 1000;
  const fric = (0.45 * c.disp + 0.3) + 0.047 * c.disp * v;
  const eta = p.etaDrive, acc = p.accKW;
  const fuelKW = ((roll + aero) / eta + fric + acc) / p.etaI;
  const lPerS = fuelKW * 1000 / LHV * p.calib;
  return { l100: lPerS / v * 1e5, kw: { roll: roll / eta, aero: aero / eta, fric, acc }, fuelKW };
}
function stopCost(vKmh, c, p) {
  const v = vKmh / 3.6, m = totalMass(c);
  const kin = 0.5 * m * v * v * 1.05;
  const fuelAcc = kin / (p.etaDrive * p.etaI * 0.85) / LHV * p.calib;
  const fuelIdle = p.idleLph * p.waitS / 3600;
  const extraS = v / (2 * p.aDec) + v / (2 * p.aAcc) + p.waitS;
  return { L: fuelAcc + fuelIdle, s: extraS };
}

/* ---------- maxspeed / defaults ---------- */
const DEF_LIMIT = {
  NL: { motorway: 100, trunk: 100, primary: 80, secondary: 80, tertiary: 80, unclassified: 60, residential: 50, living_street: 15, service: 30 },
  DE: { motorway: 130, trunk: 100, primary: 100, secondary: 100, tertiary: 100, unclassified: 100, residential: 50, living_street: 7, service: 30 },
  BE: { motorway: 120, trunk: 90, primary: 90, secondary: 70, tertiary: 70, unclassified: 70, residential: 50, living_street: 20, service: 30 },
};
function baseHw(h) { return String(h || '').replace('_link', ''); }
function parseMaxspeed(s) {
  if (s == null) return { limit: null };
  s = String(s).trim().toLowerCase();
  if (s === 'none' || s === 'unlimited') return { limit: null, unlimited: true };
  let m = s.match(/^(\d+(?:\.\d+)?)\s*mph$/); if (m) return { limit: Math.round(m[1] * 1.609) };
  m = s.match(/^(\d+(?:\.\d+)?)/); if (m) return { limit: +m[1] };
  if (/urban/.test(s)) return { limit: 50 };
  if (/rural/.test(s)) return { limit: s.startsWith('de') ? 100 : 80 };
  if (/motorway/.test(s)) return { limit: s.startsWith('nl') ? 100 : 130 };
  if (/walk/.test(s)) return { limit: 7 };
  return { limit: null };
}
function limitKmh(seg, defs) {
  defs = defs || DEF_LIMIT;
  if (seg.limit > 0) return seg.limit;
  const t = defs[seg.country] || defs.NL; const b = baseHw(seg.hw);
  let d = t[b] || 50; if (/_link$/.test(seg.hw)) d = Math.min(d, 70);
  return d;
}

/* ---------- speed profiles ---------- */
const PROFILES = {
  limit:  { label: 'At the limit', factor: 1, cap: 999, burstShare: 0, burstSpeed: 120 },
  below:  { label: 'Slightly below limit', factor: 0.93, cap: 999, burstShare: 0, burstSpeed: 120 },
  trucks: { label: '80 behind trucks', factor: 1, cap: 80, burstShare: 0, burstSpeed: 120 },
  cap100: { label: '100 + bursts to 120', factor: 1, cap: 100, burstShare: 0.15, burstSpeed: 120 },
};

/* ---------- route computation ---------- */
function computeSegment(seg, c, p, prices, prof) {
  const lim = limitKmh(seg);
  const capA = seg.capAvg && seg.avgKmh > 0 ? seg.avgKmh * 1.03 : 1e9;
  const v1 = Math.min(lim * prof.factor, prof.cap, capA);
  const b = lim > prof.cap ? prof.burstShare : 0;
  const v2 = Math.min(lim, prof.burstSpeed, capA);
  const parts = b > 0 ? [[1 - b, v1], [b, v2]] : [[1, v1]];
  let L = 0, s = 0;
  for (const [sh, v] of parts) {
    const d = seg.len * sh;
    L += d / 1000 * cruise(v, c, p).l100 / 100;
    s += d / (v / 3.6);
  }
  const sc = stopCost(v1, c, p);
  let measured = seg.signals != null, sig = measured ? seg.signals : (p.sigPerKm[baseHw(seg.hw)] || 0) * seg.len / 1000, stops = sig * (p.stopP[baseHw(seg.hw)] || 0);
  if (seg.avgKmh > 0) { const tt = seg.len / (seg.avgKmh / 3.6); const imp = Math.max(0, (tt - s) / sc.s); if (measured && !seg.capAvg) { stops = Math.max(stops, imp); } else { stops = imp; sig = stops; } measured = true; } // observed average speed => implied stops
  const stopL = stops * sc.L, stopS = stops * sc.s;
  const price = prices[seg.country] != null ? prices[seg.country] : prices.NL;
  const tot = L + stopL;
  return { lim, v: v1, cruiseL: L, stopL, stops, sig, sigMeasured: measured, sec: s + stopS, L: tot, cost: tot * price, km: seg.len / 1000 };
}
function computeRoute(segs, c, p, prices, prof) {
  const rows = segs.map(s => computeSegment(s, c, p, prices, prof));
  const T = { km: 0, L: 0, cost: 0, sec: 0, stops: 0, byCountry: {} };
  rows.forEach((r, i) => {
    T.km += r.km; T.L += r.L; T.cost += r.cost; T.sec += r.sec; T.stops += r.stops;
    const k = segs[i].country; const bc = T.byCountry[k] || (T.byCountry[k] = { km: 0, L: 0, cost: 0 });
    bc.km += r.km; bc.L += r.L; bc.cost += r.cost;
  });
  if (segs.length && p.coldStartL > 0) { const pr = prices[segs[0].country] != null ? prices[segs[0].country] : prices.NL; T.L += p.coldStartL; T.cost += p.coldStartL * pr; const bc = T.byCountry[segs[0].country]; if (bc) { bc.L += p.coldStartL; bc.cost += p.coldStartL * pr; } } // warm-up enrichment once per start
  T.l100 = T.km ? T.L / T.km * 100 : 0;
  return { rows, total: T };
}

/* ---------- geo ---------- */
function hav(a, b) {
  const x = (b[1] - a[1]) * D2R * Math.cos((a[0] + b[0]) / 2 * D2R), y = (b[0] - a[0]) * D2R;
  return Math.sqrt(x * x + y * y) * 6371008;
}
function pathLen(cs) { let d = 0; for (let i = 1; i < cs.length; i++) d += hav(cs[i - 1], cs[i]); return d; }
function resample(cs, step) {
  const out = [{ p: cs[0], d: 0 }]; let acc = 0, next = step;
  for (let i = 1; i < cs.length; i++) {
    const seg = hav(cs[i - 1], cs[i]); if (!seg) continue;
    while (acc + seg >= next) {
      const t = (next - acc) / seg;
      out.push({ p: [cs[i - 1][0] + (cs[i][0] - cs[i - 1][0]) * t, cs[i - 1][1] + (cs[i][1] - cs[i - 1][1]) * t], d: next });
      next += step;
    }
    acc += seg;
  }
  return { pts: out, total: acc };
}
function distPtSeg(p, a, b) {
  const k = Math.cos(p[0] * D2R) * 111320, kk = 110540;
  const px = p[1] * k, py = p[0] * kk, ax = a[1] * k, ay = a[0] * kk, bx = b[1] * k, by = b[0] * kk;
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
const NL_POLY = [[2.5,54],[7.3,54],[7.21,53.33],[7.07,53.20],[7.02,52.63],[7.03,52.30],[6.95,52.15],[6.85,52.05],[6.82,51.96],[6.75,51.88],[6.45,51.85],[6.22,51.89],[6.16,51.90],[6.13,51.87],[6.11,51.84],[6.05,51.80],[5.98,51.76],[5.96,51.60],[6.10,51.45],[6.18,51.35],[6.12,51.22],[6.05,51.05],[6.08,50.87],[6.02,50.75],[5.70,50.75],[5.75,51.05],[5.58,51.25],[5.22,51.30],[5.03,51.43],[4.75,51.48],[4.47,51.47],[4.24,51.35],[3.60,51.29],[3.36,51.36],[2.5,51.6]];
function countryAt(lat, lon) {
  let inside = false;
  for (let i = 0, j = NL_POLY.length - 1; i < NL_POLY.length; j = i++) {
    const [xi, yi] = NL_POLY[i], [xj, yj] = NL_POLY[j];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside ? 'NL' : (lon >= 6.0 ? 'DE' : 'BE');
}
function decodePoly6(str) {
  let i = 0, lat = 0, lon = 0; const out = [];
  while (i < str.length) {
    for (const k of [0, 1]) {
      let sh = 0, r = 0, b;
      do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
      const d = (r & 1) ? ~(r >> 1) : (r >> 1);
      if (k === 0) lat += d; else lon += d;
    }
    out.push([lat / 1e6, lon / 1e6]);
  }
  return out;
}

/* ---------- fallback runner ---------- */
async function runLayers(stage, layers, env) {
  const errs = [];
  for (const L of layers) {
    if (env.cancelled && env.cancelled()) throw new Error('cancelled');
    if (env.disabled && env.disabled[L.id]) { env.log(stage, L.id, 'skipped (disabled in Debug)', 'skip'); continue; }
    const t0 = Date.now();
    try {
      const v = await L.fn(env);
      if (v == null) throw new Error('empty result');
      env.log(stage, L.id, 'ok ' + (Date.now() - t0) + ' ms', 'ok');
      return { layer: L.id, value: v, fellBack: errs.length > 0, errors: errs };
    } catch (e) {
      const msg = (e && e.message) || String(e);
      errs.push(L.id + ': ' + msg);
      env.log(stage, L.id, 'FAILED — ' + msg, 'fail');
    }
  }
  const e = new Error(stage + ': all layers failed (' + errs.join(' | ') + ')'); e.errs = errs; throw e;
}
async function getJSON(env, url, opt) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const to = setTimeout(() => ctl && ctl.abort(), (opt && opt.timeoutMs) || env.timeoutMs || 12000);
  try {
    const r = await env.fetch(url, Object.assign({ signal: ctl && ctl.signal }, opt || {}));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(to); }
}

const _last = {};
async function throttle(env, key, ms) { if (env.noThrottle) return; const w = (_last[key] || 0) + ms - Date.now(); if (w > 0) await new Promise(r => setTimeout(r, w)); _last[key] = Date.now(); }
/* geocode */
const GAZ = { wesel: [51.6587, 6.6170], dieren: [52.0507, 6.1045], arnhem: [51.9851, 5.8987], emmerich: [51.8326, 6.2485], nijmegen: [51.8126, 5.8372], zevenaar: [51.9297, 6.0710], amsterdam: [52.3730, 4.8922], utrecht: [52.0907, 5.1214], duisburg: [51.4344, 6.7623], dusseldorf: [51.2277, 6.7735], 'düsseldorf': [51.2277, 6.7735], zwolle: [52.5168, 6.0830], apeldoorn: [52.2112, 5.9699], deventer: [52.2660, 6.1552], oberhausen: [51.4963, 6.8638], venlo: [51.3704, 6.1724], eindhoven: [51.4416, 5.4697], rotterdam: [51.9244, 4.4777], 'den haag': [52.0705, 4.3007], enschede: [52.2215, 6.8937], 'weesp': [52.3075, 5.0417] };
function parseLatLon(q) { const m = String(q).match(/^\s*(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)\s*$/); return m ? [+m[1], +m[2]] : null; }
const geocodeLayers = q => [
  { id: 'nominatim', fn: async env => { await throttle(env, 'nominatim', 1100); const j = await getJSON(env, 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q)); if (!j.length) throw new Error('no hit'); return [+j[0].lat, +j[0].lon]; } },
  { id: 'photon', fn: async env => { const j = await getJSON(env, 'https://photon.komoot.io/api/?limit=1&q=' + encodeURIComponent(q)); const f = j.features && j.features[0]; if (!f) throw new Error('no hit'); return [f.geometry.coordinates[1], f.geometry.coordinates[0]]; } },
  { id: 'gazetteer', fn: async () => { const g = GAZ[q.trim().toLowerCase()]; if (!g) throw new Error('not in built-in list'); return g; } },
];
async function geocode(q, env) {
  const ll = parseLatLon(q); if (ll) return { layer: 'lat,lon', value: ll, errors: [] };
  if (env.known && env.known[q]) return { layer: 'picked', value: env.known[q], errors: [] };
  return runLayers('geocode "' + q + '"', geocodeLayers(q), env);
}

/* place suggestions (autocomplete): Photon is built for it; Nominatim forbids autocomplete, so it is only a slow fallback */
function photonLabel(f) {
  const p = f.properties || {}, parts = [p.name, p.street && p.housenumber ? p.street + ' ' + p.housenumber : p.street, p.city || p.town || p.village || p.district, p.state, p.country].filter(Boolean);
  return parts.filter((x, i) => parts.indexOf(x) === i).join(', ');
}
async function suggest(q, env) {
  return runLayers('suggest "' + q + '"', [
    { id: 'photon', fn: async e => { const j = await getJSON(e, 'https://photon.komoot.io/api/?limit=6&lat=52&lon=6&q=' + encodeURIComponent(q)); const out = (j.features || []).map(f => ({ label: photonLabel(f), ll: [f.geometry.coordinates[1], f.geometry.coordinates[0]] })); if (!out.length) throw new Error('no hit'); return out; } },
    { id: 'nominatim', fn: async e => { const j = await getJSON(e, 'https://nominatim.openstreetmap.org/search?format=json&limit=5&q=' + encodeURIComponent(q)); if (!j.length) throw new Error('no hit'); return j.map(x => ({ label: x.display_name, ll: [+x.lat, +x.lon] })); } },
    { id: 'gazetteer', fn: async () => { const k = Object.keys(GAZ).filter(n => n.startsWith(q.trim().toLowerCase())); if (!k.length) throw new Error('none'); return k.map(n => ({ label: n[0].toUpperCase() + n.slice(1), ll: GAZ[n] })); } },
  ], env);
}
/* routing */
const RO_DEFAULT = { avoidMotorway: false, avoidToll: false, avoidFerry: false, smaller: false, shortest: false, avoidUnpaved: false, alt: false, altIndex: 0 };
const needsValhalla = ro => !!(ro && (ro.smaller || ro.shortest || ro.avoidUnpaved));
function parseOsrm(j, ro) {
  if (j.code !== 'Ok') throw new Error(j.code || 'bad reply');
  const conv = r => { const steps = []; r.legs.forEach(l => l.steps.forEach(s => { const g = s.geometry.coordinates; steps.push({ dist: s.distance, dur: s.duration, name: s.name || '', ref: s.ref || '', coords: g.map(x => [x[1], x[0]]) }); })); return { coords: r.geometry.coordinates.map(x => [x[1], x[0]]), dist: r.distance, dur: r.duration, steps }; };
  const idx = Math.min((ro && ro.altIndex) || 0, j.routes.length - 1), out = conv(j.routes[idx]);
  out.wpDist = (j.waypoints || []).map(w => w.distance); out.altCount = j.routes.length;
  if (ro && ro.alt) out.alts = j.routes.map((r, i) => Object.assign(conv(r), { index: i }));
  return out;
}
const routeLayers = (pts, ro) => {
  ro = Object.assign({}, RO_DEFAULT, ro || {});
  const excl = [ro.avoidMotorway && 'motorway', ro.avoidToll && 'toll', ro.avoidFerry && 'ferry'].filter(Boolean);
  const osrm = (id, base) => ({ id, fn: async env => {
      await throttle(env, 'osrm', 1100);
      const co = pts.map(p => p[1].toFixed(5) + ',' + p[0].toFixed(5)).join(';');
      const j = await getJSON(env, base + co + '?overview=full&geometries=geojson&steps=true' + (excl.length ? '&exclude=' + excl.join(',') : '') + (ro.alt ? '&alternatives=true' : ''));
      const r = parseOsrm(j, ro); if (needsValhalla(ro)) r.optionsIgnored = ['smaller roads / shortest / unpaved need Valhalla — only motorway/toll/ferry exclusions applied']; return r;
  } });
  const valhalla = { id: 'valhalla', fn: async env => {
      await throttle(env, 'valhalla', 1100);
      const auto = { use_highways: ro.avoidMotorway ? 0 : ro.smaller ? 0.1 : 0.5, use_tolls: ro.avoidToll ? 0 : 0.5, use_ferry: ro.avoidFerry ? 0 : 0.5 };
      if (ro.shortest) auto.shortest = true; if (ro.avoidUnpaved) auto.exclude_unpaved = true; if (ro.smaller) { auto.use_primary = 0.2; auto.use_living_streets = 0.3; }
      const j = await getJSON(env, 'https://valhalla1.openstreetmap.de/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locations: pts.map(p => ({ lat: p[0], lon: p[1] })), costing: 'auto', costing_options: { auto }, directions_options: { units: 'kilometers' } }) });
      if (!j.trip) throw new Error('bad reply');
      let coords = [], steps = [];
      j.trip.legs.forEach(l => {
        const sh = decodePoly6(l.shape); coords = coords.concat(sh);
        l.maneuvers.forEach(m => steps.push({ dist: m.length * 1000, dur: m.time, name: (m.street_names || [])[0] || '', ref: (m.street_names || []).find(n => /^[ABEN]\s?\d/.test(n)) || '', coords: sh.slice(m.begin_shape_index, m.end_shape_index + 1) }));
      });
      return { coords, dist: j.trip.summary.length * 1000, dur: j.trip.summary.time, steps, wpDist: [] };
  } };
  const straight = { id: 'straight-line', fn: async () => { const coords = pts, d = pathLen(coords) * 1.25; return { coords, dist: d, dur: d / (65 / 3.6), steps: chunkSteps(coords, d), approx: true, wpDist: [] }; } };
  const o1 = osrm('osrm', 'https://router.project-osrm.org/route/v1/driving/'), o2 = osrm('osrm-de', 'https://routing.openstreetmap.de/routed-car/route/v1/driving/');
  return needsValhalla(ro) ? [valhalla, o1, o2, straight] : [o1, valhalla, o2, straight];
};
function chunkSteps(coords, d) { // split straight line in ~5 km pieces so country/border works
  const k = d / 1.25, n = Math.max(1, Math.round(k / 5000)), r = resample(coords, k / n), out = [];
  for (let i = 1; i < r.pts.length; i++) { const dd = (r.pts[i].d - r.pts[i - 1].d) * 1.25; out.push({ dist: dd, dur: dd / (65 / 3.6), name: '', ref: '', coords: [r.pts[i - 1].p, r.pts[i].p] }); }
  return out.length ? out : [{ dist: d, dur: d / (65 / 3.6), name: '', ref: '', coords }];
}
async function route(pts, env, ro) { return runLayers('route', routeLayers(pts, ro), env); }

/* classify: Overpass -> Overpass mirror -> OSRM-step heuristic */
function overpassQuery(coords, minStep, nPts) {
  const { pts, total } = resample(coords, Math.max(minStep || 300, coords.length ? pathLen(coords) / (nPts || 250) : 300));
  const around = pts.map(x => x.p[0].toFixed(5) + ',' + x.p[1].toFixed(5)).join(',');
  const re = '^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$';
  return '[out:json][timeout:50];way(around:15,' + around + ')[highway~"' + re + '"];out tags geom qt;node(around:15,' + around + ')[highway=traffic_signals];out qt;';
}
function segmentsFromOverpass(coords, data) {
  const ways = data.elements.filter(e => e.type === 'way' && e.geometry && e.geometry.length > 1).map(w => {
    const g = w.geometry.map(q => [q.lat, q.lon]);
    let mnLa = 1e9, mxLa = -1e9, mnLo = 1e9, mxLo = -1e9; g.forEach(q => { mnLa = Math.min(mnLa, q[0]); mxLa = Math.max(mxLa, q[0]); mnLo = Math.min(mnLo, q[1]); mxLo = Math.max(mxLo, q[1]); });
    return { id: w.id, tags: w.tags || {}, g, bb: [mnLa - 0.0003, mxLa + 0.0003, mnLo - 0.0005, mxLo + 0.0005] };
  });
  const sigs = data.elements.filter(e => e.type === 'node').map(n => [n.lat, n.lon]);
  const { pts } = resample(coords, 60);
  let prev = null; const assign = [];
  for (let i = 0; i < pts.length; i++) {
    const P = pts[i].p; let best = null, bd = 1e9;
    for (const w of ways) {
      if (P[0] < w.bb[0] || P[0] > w.bb[1] || P[1] < w.bb[2] || P[1] > w.bb[3]) continue;
      let d = 1e9; for (let k = 1; k < w.g.length; k++) d = Math.min(d, distPtSeg(P, w.g[k - 1], w.g[k]));
      if (prev && w.id === prev.id) d -= 5;
      if (d < bd) { bd = d; best = w; }
    }
    if (best && bd < 30) prev = best;
    assign.push(best && bd < 30 ? best : null);
  }
  // signals -> nearest sample
  const sigAt = new Array(pts.length).fill(0), used = new Set();
  sigs.forEach((s, si) => { let bi = -1, bd = 1e9; pts.forEach((x, i) => { const d = hav(x.p, s); if (d < bd) { bd = d; bi = i; } }); if (bd < 25 && !used.has(bi)) { sigAt[bi]++; used.add(bi); } });
  const segs = []; let cur = null;
  for (let i = 0; i < pts.length; i++) {
    const w = assign[i], t = w ? w.tags : { highway: 'unclassified' };
    const hw = t.highway; const ms = parseMaxspeed(t.maxspeed || t['maxspeed:forward']);
    const c = countryAt(pts[i].p[0], pts[i].p[1]);
    const key = hw + '|' + ms.limit + '|' + !!ms.unlimited + '|' + c;
    const step = i ? pts[i].d - pts[i - 1].d : 0;
    if (!cur || cur.key !== key) { cur = { key, name: t.ref || t.name || '', hw, limit: ms.limit, unlimited: !!ms.unlimited, country: c, len: 0, signals: 0, pts: [pts[i].p], unknown: !w }; segs.push(cur); }
    cur.len += step; cur.signals += sigAt[i]; cur.pts.push(pts[i].p);
  }
  return mergeTiny(segs);
}
function mergeTiny(segs) { // absorb runs < 200 m into predecessor to keep the table readable
  const out = [];
  for (const s of segs) {
    if (out.length && s.len < 200) { const p = out[out.length - 1]; p.len += s.len; p.signals += s.signals; p.pts = p.pts.concat(s.pts); }
    else out.push(s);
  }
  return out.filter(s => s.len > 0).map((s, i) => Object.assign(s, { id: i + 1, key: undefined }));
}
function classifyFromSteps(r) {
  const segs = []; let cur = null;
  r.steps.forEach(s => {
    if (!s.dist) return;
    const v = s.dur > 0 ? s.dist / s.dur : 15, ref = s.ref || '';
    const mid = s.coords[Math.floor(s.coords.length / 2)] || s.coords[0];
    const c = countryAt(mid[0], mid[1]);
    let hw;
    if (/^(A|E)\s?\d/.test(ref) || v > 26) hw = 'motorway';
    else if (/^(N|B)\s?\d/.test(ref)) hw = v > 20 ? 'trunk' : 'primary';
    else if (/^(L|K|S|N)\s?\d/.test(ref) || v > 14) hw = 'secondary';
    else if (!s.name && !ref) hw = 'unclassified';
    else hw = 'residential';
    const key = hw + '|' + c;
    if (!cur || cur.key !== key) { cur = { key, name: ref || s.name, hw, limit: null, unlimited: false, country: c, len: 0, signals: null, pts: [], estimated: true }; segs.push(cur); }
    cur.len += s.dist; cur.pts = cur.pts.concat(s.coords);
  });
  return mergeTiny(segs);
}
/* ---------- route anatomy: steps -> clusters -> checkpoints -> targeted probes ---------- */
const AN_DEFAULT = { smallM: 300, quarterKm: 50, eighthKm: 200, sixteenthKm: 400, bigM: 2000, cityKmh: 30, osrmFactor: 1.25, method: 'ratio', ratio: 5 };
const CLS = ['residential', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway'];
const BAND_IDX = [0, 1, 2, 3, 5];
const medianOf = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const bandOf = (len, an) => len <= an.smallM ? 0 : len <= 2 * an.smallM ? 1 : len <= 3000 ? 2 : len <= 20000 ? 3 : 4;
function pointAt(coords, frac) {
  if (!coords.length) return null;
  const tot = pathLen(coords), target = clamp(frac, 0, 1) * tot; let acc = 0;
  for (let i = 1; i < coords.length; i++) { const d = hav(coords[i - 1], coords[i]); if (acc + d >= target) { const t = d ? (target - acc) / d : 0; return [coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * t, coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * t]; } acc += d; }
  return coords[coords.length - 1];
}
const stepLabel = s => s.ref && s.name ? s.ref + ' · ' + s.name : (s.ref || s.name || '(unnamed)');
function normSteps(rt) {
  let raw = (rt.steps || []).filter(s => s.dist > 0 && s.coords && s.coords.length);
  if (!raw.length && rt.segs) raw = rt.segs.map(s => ({ dist: s.len, dur: s.len / (C_LIM(s) / 3.6), name: s.name, ref: '', coords: s.pts }));
  const m = [];
  raw.forEach(s => { const p = m[m.length - 1]; if (p && (s.name || s.ref) && p.name === s.name && p.ref === s.ref) { p.dist += s.dist; p.dur += s.dur; p.coords = p.coords.concat(s.coords); } else m.push({ name: s.name || '', ref: s.ref || '', dist: s.dist, dur: s.dur || 0, coords: s.coords.slice() }); });
  for (let i = m.length - 1; i >= 0; i--) { // absorb tiny artefact steps (< 15 m) into a neighbour
    if (m[i].dist < 15 && m.length > 1) { const t = i + 1 < m.length ? m[i + 1] : m[i - 1]; t.dist += m[i].dist; t.dur += m[i].dur; t.coords = i + 1 < m.length ? m[i].coords.concat(t.coords) : t.coords.concat(m[i].coords); m.splice(i, 1); }
  }
  let acc = 0; m.forEach((s, i) => { s.i = i; s.startM = acc; acc += s.dist; s.endM = acc; s.label = stepLabel(s); s.v = s.dur > 0 ? s.dist / s.dur : null; });
  return m;
}
const C_LIM = s => limitKmh({ limit: s.limit, hw: s.hw, country: s.country });
function guessClass(cl, L) {
  const v = cl.avgV || 0, sIdx = v >= 25 ? 5 : v >= 19 ? 4 : v >= 14 ? 3 : v >= 9 ? 2 : v >= 6 ? 1 : 0;
  // road refs vote by DISTANCE: a class needs >= 50 % of the cluster's length (a 900 m A12 slip road must not make 4 km of N784/village road a motorway)
  const votes = {}; let ref = '';
  cl.refs.forEach((r, i) => { const d = cl.refD ? cl.refD[i] : 1, k = /^(A|E)\s?\d/.test(r) ? 'm' : /^(N|B)\s?\d/.test(r) ? 'n' : /^(L|K|S)\s?\d/.test(r) ? 'l' : null; if (k) { votes[k] = votes[k] || { d: 0, top: r, topD: 0 }; votes[k].d += d; if (d > votes[k].topD) { votes[k].topD = d; votes[k].top = r; } } });
  const tot = cl.refD ? cl.refD.reduce((a, x) => a + x, 0) : cl.refs.length, win = Object.keys(votes).sort((x, y) => votes[y].d - votes[x].d)[0];
  if (win && votes[win].d >= 0.5 * tot) ref = votes[win].top;
  let idx, conf, why;
  if (/^(A|E)\s?\d/.test(ref)) { idx = 5; conf = 'high'; why = 'ref ' + ref; }
  else if (/^(N|B)\s?\d/.test(ref)) { idx = v >= 19 ? 4 : 3; conf = 'high'; why = 'ref ' + ref; }
  else if (/^(L|K|S)\s?\d/.test(ref)) { idx = 2; conf = 'med'; why = 'ref ' + ref; }
  else { idx = Math.round(0.5 * BAND_IDX[cl.band] + 0.5 * sIdx); conf = Math.abs(BAND_IDX[cl.band] - sIdx) <= 1 ? 'med' : 'low'; why = 'steps ~' + Math.round(cl.medLen) + ' m, ' + Math.round(v * 3.6) + ' km/h avg' + (win ? ' (refs cover <50 % of the length)' : ''); }
  if (!/^(A|E|N|B|L|K|S)\s?\d/.test(ref)) { // speed floor: sustained high speed cannot be a small road
    if (v >= 25 && idx < 5) { idx = 5; conf = 'med'; why += ' · speed floor ≥90 km/h ⇒ motorway'; }
    else if (v >= 19 && cl.len >= 3000 && idx < 4) { idx = 4; conf = 'med'; why += ' · speed floor ≥68 km/h ⇒ trunk'; }
  }
  if (cl.edge && cl.band <= 1 && !/^(A|E|N|B)\s?\d/.test(ref) && v < 14) { idx = 0; conf = 'med'; why = 'start/end neighbourhood streets'; }
  const kind = idx === 5 ? 'motorway / long-distance' : idx >= 3 && cl.band >= 3 ? 'N-road / main road' : cl.band === 0 ? (cl.edge ? 'neighbourhood streets (start/end)' : 'neighbourhood streets') : cl.band === 1 ? (cl.edge ? 'connector streets (ontsluiting)' : 'inner-city streets, bigger') : cl.band === 2 ? (cl.edge && cl.len < 3000 ? 'ontsluitingsweg' : 'local / rural roads') : 'N-road / main road';
  return { idx, hw: CLS[idx], conf, why, kind };
}
/* ---- clustering methods: each returns an array (one group id per step, contiguous runs) ---- */
const METHODS = ['bands', 'ratio', 'boundary', 'gravity', 'dp'];
const METHOD_SHORT = { bands: 'b', ratio: 'r', boundary: 'bd', gravity: 'g', dp: 'dp' };
const METHOD_INFO = {
  bands: 'old: median-of-5 length bands (≤300, ≤600, ≤3000, ≤20000, >20000 m)',
  ratio: 'ratio-merge: adjacent groups merge while their typical lengths differ < ×ratio (log scale), then small runs sandwiched between much bigger roads fuse into one connector cluster',
  boundary: 'change-points: cut where the log-length average before vs after a step jumps by > ×ratio (local maxima), odd-ones-out cut on their own',
  dp: 'optimal partition: dynamic programming finds the cut-points that minimise the spread of (log length, log speed) inside clusters plus a fixed price per extra cluster — uses speed as well as length',
  gravity: 'gravity: every step is pulled toward similar-sized neighbours (mass ~ √length, bilateral log-scale smoothing), cut where the settled values still differ'
};
const lny = len => Math.log(Math.max(len, 40));
const runsToIds = cuts => { const id = []; let g = 0; cuts.forEach((c, i) => { if (i && c) g++; id.push(g); }); return id; };
function assignBands(steps, an) {
  const n = steps.length, lens = steps.map(s => s.dist);
  const band = steps.map((s, i) => { const w = []; for (let k = Math.max(0, i - 2); k <= Math.min(n - 1, i + 2); k++) w.push(lens[k]); const med = medianOf(w); return (s.dist >= 1500 && s.dist >= 4 * med) ? bandOf(s.dist, an) : bandOf(med, an); });
  return runsToIds(band.map((b, i) => i && b !== band[i - 1]));
}
function assignRatio(steps, an) {
  const T = Math.log(an.ratio || 5);
  let G = steps.map((s, i) => ({ a: i, b: i, len: s.dist, sw: Math.sqrt(s.dist), swy: Math.sqrt(s.dist) * lny(s.dist) }));
  const rep = g => g.swy / g.sw;
  for (;;) { // agglomerative: merge the closest adjacent pair while closer than ×ratio
    let bi = -1, bd = 1e9;
    for (let i = 0; i + 1 < G.length; i++) { const d = Math.abs(rep(G[i]) - rep(G[i + 1])); if (d < bd) { bd = d; bi = i; } }
    if (bi < 0 || bd >= T) break;
    const x = G[bi], y = G[bi + 1]; G.splice(bi, 2, { a: x.a, b: y.b, len: x.len + y.len, sw: x.sw + y.sw, swy: x.swy + y.swy });
  }
  // sandwich pass: a run of >=2 small groups between two far bigger groups = one connector cluster
  const S = Math.log((an.ratio || 5) * 1.3);
  for (let i = 1; i < G.length - 1; i++) {
    let best = -1;
    for (let j = i + 1; j < G.length - 1 && j < i + 6; j++) {
      const mx = Math.max(...G.slice(i, j + 1).map(rep)), lo = Math.min(rep(G[i - 1]), rep(G[j + 1]));
      if (lo - mx >= S) best = j; else if (lo - Math.max(...G.slice(i, j + 1).map(rep)) < 0) break;
    }
    if (best > i) { const seg = G.slice(i, best + 1); G.splice(i, seg.length, { a: seg[0].a, b: seg[seg.length - 1].b, len: seg.reduce((a, x) => a + x.len, 0), sw: seg.reduce((a, x) => a + x.sw, 0), swy: seg.reduce((a, x) => a + x.swy, 0) }); }
  }
  const id = new Array(steps.length); G.forEach((g, k) => { for (let i = g.a; i <= g.b; i++) id[i] = k; }); return id;
}
function assignBoundary(steps, an) {
  const n = steps.length, T = Math.log(an.ratio || 5), y = steps.map(s => lny(s.dist)), W = 3;
  const mean = (a, b) => { let s = 0, c = 0; for (let k = Math.max(0, a); k <= Math.min(n - 1, b); k++) { s += y[k]; c++; } return c ? s / c : 0; };
  const sc = y.map((_, i) => i ? Math.abs(mean(i, i + W - 1) - mean(i - W, i - 1)) : 0);
  const cut = y.map((_, i) => { if (!i) return false; const jump = Math.abs(y[i] - y[i - 1]);
    const localMax = sc[i] >= (sc[i - 1] || 0) && sc[i] >= (sc[i + 1] || 0) && sc[i] >= (sc[i - 2] || 0) && sc[i] >= (sc[i + 2] || 0);
    return (sc[i] >= T && localMax) || jump >= 2 * T; });
  // odd-one-out: a lone step far from both neighbours gets its own cluster; a cluster of 1 tiny step next to an equal-ish one is re-absorbed
  return runsToIds(cut);
}
function assignGravity(steps, an) {
  const n = steps.length, T = Math.log(an.ratio || 5), sigma = T / 2.5, R = 4;
  const m = steps.map(s => Math.sqrt(s.dist)); let s = steps.map(x => lny(x.dist));
  for (let it = 0; it < 4; it++) {
    const nx = s.map((si, i) => { let a = 0, b = 0; for (let k = Math.max(0, i - R); k <= Math.min(n - 1, i + R); k++) { const d = (s[k] - si) / sigma, w = m[k] * Math.exp(-d * d); a += w * s[k]; b += w; } return b ? a / b : si; });
    s = nx;
  }
  return runsToIds(s.map((v, i) => i && Math.abs(v - s[i - 1]) > 0.5 * T));
}
function absorbFast(steps, id) { // tiny steps driven at motorway speed are junction fragments of the big fast road (group) next to them
  const n = steps.length, fast = (d, t) => t > 0 && d / t >= 19;
  for (let pass = 0; pass < 3; pass++) {
    const G = {}; steps.forEach((s, i) => { const g = G[id[i]] || (G[id[i]] = { len: 0, dur: 0 }); g.len += s.dist; g.dur += s.dur; });
    for (let i = 0; i < n; i++) {
      const s = steps[i]; if (s.dist >= 1000 || !fast(s.dist, s.dur)) continue;
      const nb = [i - 1, i + 1].filter(k => k >= 0 && k < n && id[k] !== id[i] && G[id[k]].len >= 1000 && fast(G[id[k]].len, G[id[k]].dur)).sort((a, b) => G[id[b]].len - G[id[a]].len)[0];
      if (nb != null) id[i] = id[nb];
    }
  }
  let g = 0; return id.map((x, i) => { if (i && x !== id[i - 1]) g++; return g; });
}
function buildClusters(steps, id, an, L) {
  const clusters = []; let cur = null;
  steps.forEach((s, i) => { if (!cur || id[i] !== id[cur.a]) { cur = { id: clusters.length + 1, a: i, b: i }; clusters.push(cur); } else cur.b = i; });
  clusters.forEach(cl => {
    const ss = steps.slice(cl.a, cl.b + 1);
    cl.startM = ss[0].startM; cl.endM = ss[ss.length - 1].endM; cl.len = cl.endM - cl.startM; cl.n = ss.length;
    cl.medLen = medianOf(ss.map(s => s.dist)); cl.meanLen = cl.len / cl.n; { const bins = {}; ss.forEach(s => { const k = Math.floor(Math.log(Math.max(20, s.dist)) / Math.log(1.5)); (bins[k] = bins[k] || []).push(s.dist); }); const top = Object.values(bins).sort((a, b) => b.length - a.length || b.reduce((x, y) => x + y, 0) - a.reduce((x, y) => x + y, 0))[0]; cl.modeLen = medianOf(top); cl.modeN = top.length; } cl.band = bandOf(cl.medLen, an); cl.dur = ss.reduce((a, s) => a + s.dur, 0); cl.avgV = cl.dur > 0 ? cl.len / cl.dur : 0;
    cl.names = [...new Set(ss.map(s => s.label))].slice(0, 4); cl.refs = ss.map(s => s.ref); cl.refD = ss.map(s => s.dist);
    cl.edge = cl.startM < 1500 || cl.endM > L - 1500;
    cl.coords = ss.reduce((a, s) => a.concat(s.coords), []);
    cl.g = guessClass(cl, L);
  });
  const notes = [], km = L / 1000;
  const longest = clusters.slice().sort((a, b) => b.len - a.len)[0];
  if (km >= 100 && longest.g.idx < 4 && longest.len >= 20000) { longest.g.idx = 4; longest.g.hw = CLS[4]; longest.g.why += ' + prior: 100 km+ trips almost always ride a main road/motorway for the longest stretch'; notes.push('100 km+ prior applied to cluster ' + longest.id); }
  if (km >= 30 && !clusters.some(c => c.g.idx >= 3 && c.len >= 3000)) {
    const cand = clusters.filter(c => c.len >= 3000).sort((a, b) => b.avgV - a.avgV)[0];
    if (cand) { cand.g.idx = Math.max(cand.g.idx, 3); cand.g.hw = CLS[cand.g.idx]; cand.g.why += ' + prior: 30 km+ trips very likely include an N-road or higher'; notes.push('30 km+ prior applied to cluster ' + cand.id); }
  }
  return { clusters, notes };
}
function splitEdgeSpeed(steps, id) { // a long fast cluster whose first/last stretch is much slower = access road, not part of the motorway
  const n = steps.length, cut = id.map((x, i) => i > 0 && x !== id[i - 1]); const groups = []; let g0 = 0;
  for (let i = 1; i <= n; i++) if (i === n || cut[i]) { groups.push([g0, i - 1]); g0 = i; }
  groups.forEach(([a, b]) => {
    const L = steps.slice(a, b + 1).reduce((x, s) => x + s.dist, 0), D = steps.slice(a, b + 1).reduce((x, s) => x + s.dur, 0); if (L < 8000 || D <= 0) return;
    for (const side of ['end', 'start']) {
      let best = 0, tl = 0, td = 0;
      for (let k = 1; k < b - a; k++) {
        const s = side === 'end' ? steps[b - k + 1] : steps[a + k - 1]; tl += s.dist; td += s.dur;
        if (tl > 0.3 * L) break; const restV = (L - tl) / Math.max(1, D - td);
        if (tl >= 300 && td > 0 && tl / td < 0.65 * restV) best = k;
      }
      if (best) { if (side === 'end') cut[b - best + 1] = true; else cut[a + best] = true; }
    }
  });
  return runsToIds(cut);
}
function assignDP(steps, an) {
  const n = steps.length, T = Math.log(an.ratio || 5), lam = an.dpLambda || 2.5;
  const f1 = steps.map(s => lny(s.dist) / T), f2 = steps.map(s => Math.log(Math.max(1.5, s.dur > 0 ? s.dist / s.dur : 1.5)) / Math.log(1.6)), w = steps.map(s => Math.max(1, 1 + Math.log10(s.dist / 100)));
  const P = k => { const a = [0]; for (let i = 0; i < n; i++) a.push(a[i] + k(i)); return a; };
  const W = P(i => w[i]), A1 = P(i => w[i] * f1[i]), B1 = P(i => w[i] * f1[i] * f1[i]), A2 = P(i => w[i] * f2[i]), B2 = P(i => w[i] * f2[i] * f2[i]);
  const cost = (i, j) => { const ww = W[j] - W[i], a1 = A1[j] - A1[i], a2 = A2[j] - A2[i]; return (B1[j] - B1[i] - a1 * a1 / ww) + (B2[j] - B2[i] - a2 * a2 / ww); };
  const best = new Array(n + 1).fill(Infinity), from = new Array(n + 1).fill(0); best[0] = 0;
  for (let j = 1; j <= n; j++) for (let i = Math.max(0, j - 400); i < j; i++) { const c = best[i] + cost(i, j) + lam; if (c < best[j]) { best[j] = c; from[j] = i; } }
  const cut = new Array(n).fill(false); for (let j = n; j > 0; j = from[j]) cut[from[j]] = true; cut[0] = false; return runsToIds(cut);
}
function assignBy(method, steps, an) {
  const f = { bands: assignBands, ratio: assignRatio, boundary: assignBoundary, gravity: assignGravity, dp: assignDP }[method] || assignRatio;
  let id = f(steps, an); if (method !== 'bands') { id = absorbFast(steps, id); id = splitEdgeSpeed(steps, id); } return id;
}
const PROBE_IDX = hw => /^motorway/.test(hw) ? 5 : /^trunk/.test(hw) ? 4 : /^primary/.test(hw) ? 3 : /^secondary/.test(hw) ? 2 : /^tertiary/.test(hw) ? 1 : 0;
function evalMethods(A) { // how well does each clustering's class guess match the OSM probes (the reference)?
  if (!A.probeRaw) return null;
  const P = A.probeRaw.filter(p => p.r && p.m != null && !/_link$|^service$/.test(p.r.hw)), out = {};
  Object.keys(A.alt).forEach(k => {
    const cls = A.alt[k].clusters; let exact = 0, near = 0, n = 0, sumErr = 0;
    P.forEach(p => { const c = cls.find(c => p.m >= c.startM && p.m <= c.endM) || cls[cls.length - 1], pi = PROBE_IDX(p.r.hw), gi = c.g.idx; n++; if (pi === gi) exact++; if (Math.abs(pi - gi) <= 1) near++; sumErr += Math.abs(pi - gi); });
    out[k] = { clusters: cls.length, probes: n, exact, near, exactPct: n ? Math.round(100 * exact / n) : null, nearPct: n ? Math.round(100 * near / n) : null, meanErr: n ? +(sumErr / n).toFixed(2) : null };
  });
  A.evalTable = out; return out;
}
function analyze(rt, anIn) {
  const an = Object.assign({}, AN_DEFAULT, anIn || {}), steps = normSteps(rt), n = steps.length;
  if (!n) return null;
  const L = steps[n - 1].endM;
  const alt = {};
  METHODS.forEach(m => { const id = assignBy(m, steps, an), r = buildClusters(steps, id, an, L); alt[m] = { clusters: r.clusters, notes: r.notes }; });
  const method = alt[an.method] ? an.method : 'ratio';
  const clusters = alt[method].clusters, notes = alt[method].notes.slice();
  clusters.forEach(cl => { for (let i = cl.a; i <= cl.b; i++) steps[i].ci = cl.id; });
  const deltas = [];
  for (let i = 1; i < clusters.length; i++) {
    const A = clusters[i - 1], B = clusters[i], s = steps;
    deltas.push({ atM: B.startM, fromCl: A.id, toCl: B.id, before: [s[B.a - 2], s[B.a - 1]].filter(Boolean).map(x => x.label), after: [s[B.a], s[B.a + 1]].filter(Boolean).map(x => x.label), kmFromStart: B.startM / 1000, kmToEnd: (L - B.startM) / 1000 });
  }
  const cum = [0]; steps.forEach(s => cum.push(cum[cum.length - 1] + s.dur));
  const timeAt = m => { const s = steps.find(x => m <= x.endM) || steps[n - 1]; return cum[s.i] + s.dur * clamp((m - s.startM) / (s.dist || 1), 0, 1); };
  const totT = cum[n], distAtT = t => { const s = steps.find(x => t <= cum[x.i + 1]) || steps[n - 1]; return s.startM + s.dist * clamp((t - cum[s.i]) / (s.dur || 1), 0, 1); };
  const km = L / 1000;
  clusters.forEach(cl => { cl.mid = (cl.startM + cl.endM) / 2; });
  clusters.forEach((cl, i) => {
    cl.bridge = [1, 2].map(k => clusters[i + k] ? { to: clusters[i + k].id, distM: clusters[i + k].mid - cl.endM, sec: timeAt(clusters[i + k].mid) - timeAt(cl.endM) } : null).filter(Boolean);
    const ss = steps.slice(cl.a, cl.b + 1), sm = s => [s.coords[Math.floor(s.coords.length / 2)], (s.startM + s.endM) / 2];
    cl.samples = [];
    const addS = (kind, s) => { const [p, m] = sm(s); cl.samples.push({ kind, p, km: m / 1000, m, step: s.i }); };
    ss.slice(0, 2).forEach(s => addS('first', s)); ss.slice(-2).forEach(s => addS('last', s)); addS('middle', ss[Math.floor(ss.length / 2)]);
    const k = clamp(Math.floor(cl.len / 5000), 0, 3); for (let r = 1; r <= k; r++) addS('random', ss[Math.floor(((Math.sin(cl.id * 12.9898 + r * 78.233) * 43758.5453) % 1 + 1) % 1 * ss.length)]);
    cl.turns = ss.length;
  });
  // checkpoints
  const cps = []; const stepAt = m => steps.find(s => m < s.endM) || steps[n - 1];
  const add = (key, label, atM, si) => { const s = si != null ? steps[si] : stepAt(atM); if (atM == null) atM = (s.startM + s.endM) / 2; if (cps.some(c => c.key === key)) return; const dup = cps.find(c => c.si === s.i && !(/^f\d/.test(key))); if (dup) { dup.label += ' · ' + label.toLowerCase(); dup.keys = (dup.keys || []).concat(key); return; } cps.push({ key, label, atM, si: s.i, roadNo: s.i + 1, ci: s.ci, kmFromStart: atM / 1000, kmToEnd: (L - atM) / 1000, minFromStart: timeAt(atM) / 60, pctTime: totT ? 100 * timeAt(atM) / totT : null, road: s.label, len: s.dist, dur: s.dur, v: s.v, prev: steps[s.i - 1] ? steps[s.i - 1].label : null, next: steps[s.i + 1] ? steps[s.i + 1].label : null, toChangeBefore: atM - s.startM, toChangeAfter: s.endM - atM, p: pointAt(rt.coords, atM / L), guess: clusters[s.ci - 1].g.hw }); };
  [0, 1].forEach(k => steps[k] && add('first' + (k + 1), 'Road ' + (k + 1) + ' of the route', null, k));
  [1, 0].forEach(k => steps[n - 1 - k] && add(k ? 'penult' : 'last', k ? 'Second-to-last road' : 'Last road', null, n - 1 - k));
  add('mid-dist', 'Middle by distance', L / 2);
  add('mid-time', 'Middle by travel time', distAtT(totT / 2));
  add('mid-count', 'Middle by number of roads', null, Math.floor((n - 1) / 2));
  const fr = new Set(); const levels = [[an.quarterKm, 4], [an.eighthKm, 8], [an.sixteenthKm, 16]];
  levels.forEach(([thr, d]) => { if (km > thr) for (let k = 1; k < d; k++) fr.add(Math.round(k / d * 1e6) / 1e6); });
  const pct = f => (f * 100).toFixed(f * 100 % 1 ? 1 : 0) + '%';
  [...fr].sort((a, b) => a - b).forEach(f => { if (f !== 0.5) add('f' + f, 'At ' + pct(f) + ' of the distance', f * L); });
  // by time: quarters when the trip lasts > 20 min, finer by the same km thresholds
  const tf = new Set(); if (totT > 1200) [0.25, 0.75].forEach(f => tf.add(f));
  levels.slice(1).forEach(([thr, d]) => { if (km > thr) for (let k = 1; k < d; k++) tf.add(Math.round(k / d * 1e6) / 1e6); });
  [...tf].sort((a, b) => a - b).forEach(f => { if (f !== 0.5) add('t' + f, 'At ' + pct(f) + ' of the travel time', distAtT(f * totT)); });
  // by number of roads: quarters whenever there are >= 8 roads, eighths/sixteenths by the same km thresholds
  const cf = new Set(); if (n >= 8) [0.25, 0.75].forEach(f => cf.add(f));
  levels.slice(1).forEach(([thr, d]) => { if (km > thr && n >= d * 2) for (let k = 1; k < d; k++) cf.add(Math.round(k / d * 1e6) / 1e6); });
  [...cf].sort((a, b) => a - b).forEach(f => { if (f !== 0.5) { const si = clamp(Math.round(f * (n - 1)), 0, n - 1); add('c' + f, 'At ' + pct(f) + ' of the roads (road ' + (si + 1) + ' of ' + n + ')', null, si); } });
  const lg = steps.slice().sort((a, b) => b.dist - a.dist)[0], sh = steps.slice().sort((a, b) => a.dist - b.dist)[0];
  add('longest', 'Longest road', null, lg.i); if (lg.i > 0) add('longest-1', 'Road before the longest', null, lg.i - 1);
  add('shortest', 'Shortest road', null, sh.i); if (sh.i > 0) add('shortest-1', 'Road before the shortest', null, sh.i - 1);
  cps.sort((a, b) => a.atM - b.atM);
  return { an, method, L, steps, clusters, alt, deltas, checkpoints: cps, longest: lg.label, shortest: sh.label, notes, probed: false, totT };
}
/* ---------- depth ladder ---------- */
const osrmCorr = (vKmh, f) => 1 + ((f || 1) - 1) * clamp((vKmh - 40) / 20, 0, 1); // OSRM under-reports speed on fast roads, not in town
const classByAvg = v => CLS[v >= 25 ? 5 : v >= 19 ? 4 : v >= 14 ? 3 : v >= 9 ? 2 : v >= 6 ? 1 : 0];
function levelSeg(name, hw, coords, len, avgKmh, limit) { return splitByCountry({ name, hw, limit: limit || null, unlimited: false, country: 'NL', len, signals: null, avgKmh, pts: coords, src: '' }); }
function level0(A, rt) { // OSRM total time only
  const dur = A.steps.reduce((a, s) => a + s.dur, 0), v = A.L / dur;
  return levelSeg('Whole route (one road, OSRM average speed)', classByAvg(v), rt.coords, A.L, v * 3.6 * osrmCorr(v * 3.6, A.an.osrmFactor)).map((s, i) => Object.assign(s, { id: i + 1, src: 'L0', capAvg: true }));
}
function level1(A) { // first/last big road; before/after = city movement at cityKmh
  const an = A.an, big = an.bigM || 2000, city = an.cityKmh || 30, S = A.steps;
  const fi = S.findIndex(s => s.dist >= big); let li = -1; S.forEach((s, i) => { if (s.dist >= big) li = i; });
  const out = [], seg = (a, b, name, hw, avg, cap) => { if (b < a) return; const ss = S.slice(a, b + 1), len = ss.reduce((x, s) => x + s.dist, 0), coords = ss.reduce((x, s) => x.concat(s.coords), []); levelSeg(name, hw, coords, len, avg).forEach(x => out.push(Object.assign(x, { src: 'L1', capAvg: !!cap }))); };
  if (fi < 0) { seg(0, S.length - 1, 'City movement (no big road found)', 'residential', city); }
  else {
    seg(0, fi - 1, 'City movement (start)', 'residential', city);
    const mid = S.slice(fi, li + 1), top = mid.slice().sort((a, b) => b.dist - a.dist)[0], len = mid.reduce((x, s) => x + s.dist, 0), dur = mid.reduce((x, s) => x + s.dur, 0), v = dur ? len / dur : 20;
    const ref = top.ref || '', hw = /^(A|E)\s?\d/.test(ref) ? 'motorway' : /^(N|B)\s?\d/.test(ref) ? (v >= 19 ? 'trunk' : 'primary') : classByAvg(v);
    seg(fi, li, 'Long-distance part: ' + top.label, hw, v * 3.6 * osrmCorr(v * 3.6, an.osrmFactor), true);
    seg(li + 1, S.length - 1, 'City movement (end)', 'residential', city);
  }
  return out.map((s, i) => Object.assign(s, { id: i + 1 }));
}
function probePoints(A) {
  const pts = []; const seen = new Set();
  const push = (p, ci, key, m) => { if (!p) return; const k = p[0].toFixed(4) + ',' + p[1].toFixed(4); if (seen.has(k)) return; seen.add(k); pts.push({ p, ci, key, m }); };
  A.checkpoints.forEach(c => push(c.p, c.ci, c.key, c.atM));
  A.clusters.forEach(cl => { cl.samples.forEach(s => push(s.p, cl.id, null, s.m)); if (cl.len > 8000) { push(pointAt(cl.coords, 0.25), cl.id, null, cl.startM + 0.25 * cl.len); push(pointAt(cl.coords, 0.75), cl.id, null, cl.startM + 0.75 * cl.len); } });
  return pts.slice(0, 120);
}
const HW_RE = '^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$';
async function probeChunk(pts, env, url) {
  const q = '[out:json][timeout:25];(' + pts.map(p => 'way(around:14,' + p[0].toFixed(5) + ',' + p[1].toFixed(5) + ')[highway~"' + HW_RE + '"];').join('') + ');out tags geom qt;';
  const j = await getJSON(env, url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q), timeoutMs: 25000 });
  if (!j.elements) throw new Error('bad reply');
  const ways = j.elements.filter(e => e.type === 'way' && e.geometry).map(w => ({ tags: w.tags || {}, g: w.geometry.map(x => [x.lat, x.lon]) }));
  return pts.map(P => { let best = null, bd = 1e9; ways.forEach(w => { let d = 1e9; for (let k = 1; k < w.g.length; k++) d = Math.min(d, distPtSeg(P, w.g[k - 1], w.g[k])); if (d < bd) { bd = d; best = w; } }); if (!best || bd > 30) return null; const ms = parseMaxspeed(best.tags.maxspeed || best.tags['maxspeed:forward']); return { hw: best.tags.highway, limit: ms.limit, unlimited: !!ms.unlimited, ref: best.tags.ref || '', name: best.tags.name || '', dist: Math.round(bd) }; });
}
async function probeLookup(pts, env, urls, size) {
  const total = Math.ceil(pts.length / (size || 12)); // small batches, each tried on every server; partial results are kept
  size = size || 12; const out = new Array(pts.length).fill(null), stat = { chunks: 0, failed: 0, errors: [] };
  for (let i = 0; i < pts.length; i += size) {
    let done = false; stat.chunks++;
    if (env.onPhase) { try { env.onPhase({ n: 4, of: 6, msg: 'Checking key points in OpenStreetMap — batch ' + stat.chunks + ' of ' + total, frac: (stat.chunks - 1) / total }); } catch (e) {} }
    if (env.cancelled && env.cancelled()) throw new Error('cancelled');
    for (const u of urls) { try { await throttle(env, 'overpass', 1000); const r = await probeChunk(pts.slice(i, i + size), env, u); r.forEach((v, k) => out[i + k] = v); done = true; break; } catch (e) { stat.errors.push((u.includes('kumi') ? 'mirror' : 'main') + ': ' + e.message); } }
    if (!done) stat.failed++;
  }
  if (stat.failed === stat.chunks) throw new Error('all ' + stat.chunks + ' probe batches failed (' + stat.errors.slice(0, 2).join(' | ') + ')');
  out.stat = stat; return out;
}
const mode = a => { const m = {}; a.forEach(x => m[x] = (m[x] || 0) + 1); let b = null, bc = 0; for (const k in m) if (m[k] > bc) { b = k; bc = m[k]; } return b; };
function splitByCountry(seg) {
  if (!seg.pts || seg.pts.length < 2) return [seg];
  const r = resample(seg.pts, Math.max(200, pathLen(seg.pts) / 60)); const runs = []; let cur = null;
  r.pts.forEach((x, i) => { const c = countryAt(x.p[0], x.p[1]); if (!cur || cur.country !== c) { cur = { country: c, from: i, to: i }; runs.push(cur); } else cur.to = i; });
  if (runs.length === 1) { seg.country = runs[0].country; return [seg]; }
  const tot = r.pts.length; return runs.map(rn => Object.assign({}, seg, { country: rn.country, len: seg.len * (rn.to - rn.from + 1) / tot, signals: null, pts: seg.pts.slice(Math.floor(rn.from / tot * seg.pts.length), Math.ceil((rn.to + 1) / tot * seg.pts.length) + 1) }));
}
async function signalProbe(A, env, urls) { // count real traffic lights on urban-looking clusters only (all-or-nothing)
  const targets = A.clusters.filter(cl => cl.avgV * 3.6 < 50 && cl.len <= 25000);
  if (!targets.length) return null;
  const tot = targets.reduce((a, cl) => a + cl.len, 0), step = Math.max(120, tot / 170), pts = [];
  targets.forEach(cl => resample(cl.coords, step).pts.forEach(x => pts.push({ p: x.p, ci: cl.id })));
  const nodes = new Map();
  for (let i = 0; i < pts.length; i += 40) {
    const sub = pts.slice(i, i + 40); let done = false, last = '';
    const q = '[out:json][timeout:25];(' + sub.map(x => 'node(around:14,' + x.p[0].toFixed(5) + ',' + x.p[1].toFixed(5) + ')[highway=traffic_signals];').join('') + ');out qt;';
    for (const u of urls) { try { await throttle(env, 'overpass', 1000); const j = await getJSON(env, u, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q), timeoutMs: 25000 }); if (!j.elements) throw new Error('bad reply'); j.elements.forEach(n => nodes.set(n.id, [n.lat, n.lon])); done = true; break; } catch (e) { last = e.message; } }
    if (!done) throw new Error('light count batch failed: ' + last);
  }
  const out = {}; targets.forEach(cl => out[cl.id] = 0);
  nodes.forEach(pos => { let b = null, bd = 1e9; pts.forEach(x => { const d = hav(x.p, pos); if (d < bd) { bd = d; b = x; } }); if (b && bd < 25) out[b.ci]++; });
  return out;
}
const STD_LIM = [30, 50, 60, 70, 80, 90, 100, 120, 130];
function buildSegments(A, probes, sig) {
  const out = [];
  A.clusters.forEach(cl => {
    const mine = (probes || []).filter(p => p.ci === cl.id && p.r);
    let hw = cl.g.hw, limit = null, unlimited = false, src = 'guess', ref = '';
    if (mine.length) { hw = mode(mine.map(p => p.r.hw)); const L = mine.filter(p => p.r.hw === hw && p.r.limit).map(p => p.r.limit); if (L.length) limit = +mode(L); else unlimited = mine.some(p => p.r.unlimited); src = 'probed ×' + mine.length; ref = (mine.find(p => p.r.ref) || { r: {} }).r.ref; }
    let inferred = false;
    if (!limit && !unlimited) { const mp = cl.coords[Math.floor(cl.coords.length / 2)], cc = countryAt(mp[0], mp[1]), def = limitKmh({ hw, limit: null, country: cc }), vc = cl.avgV * 3.6 * osrmCorr(cl.avgV * 3.6, A.an.osrmFactor), inf = STD_LIM.find(x => x >= vc * 0.97); if (inf && inf < def) { limit = inf; inferred = true; } }
    const seg = { name: (ref ? ref + ' · ' : '') + cl.names.slice(0, 2).join(', '), hw, limit, unlimited, country: 'NL', len: cl.len, signals: sig && sig[cl.id] != null ? sig[cl.id] : null, avgKmh: cl.avgV * 3.6 < 50 && cl.avgV > 0 ? cl.avgV * 3.6 : undefined, pts: cl.coords, cluster: cl.id, src: src + (inferred ? ' · limit inferred from speed' : '') + (sig && sig[cl.id] != null ? ' · ' + sig[cl.id] + ' lights counted' : ''), estimated: src === 'guess' };
    splitByCountry(seg).forEach(s => out.push(s));
  });
  return out.map((s, i) => Object.assign(s, { id: i + 1 }));
}
function segsForMethod(A, m, probes) { // same pipeline for any clustering: guess (probes=null) or guess+probes remapped by position
  const cl = A.alt[m].clusters, B = Object.assign({}, A, { clusters: cl });
  const pr = (probes || []).filter(p => p.m != null).map(p => { const c = cl.find(c => p.m >= c.startM && p.m <= c.endM) || cl[cl.length - 1]; return Object.assign({}, p, { ci: c.id }); });
  return buildSegments(B, pr, null);
}
function buildGraph(rt, A, method) { // clusters and roads as nodes; consecutive nodes (order 1) and every-other nodes (order 2) as edges, weighted by distance and time between their middle points
  const cl = (A.alt[method || A.method] || { clusters: A.clusters }).clusters, steps = A.steps, L = A.L, n = steps.length;
  const cum = [0]; steps.forEach(s => cum.push(cum[cum.length - 1] + s.dur));
  const timeAt = m => { const s = steps.find(x => m <= x.endM) || steps[n - 1]; return cum[s.i] + s.dur * clamp((m - s.startM) / (s.dist || 1), 0, 1); };
  const cid = new Array(n); cl.forEach(c => { for (let i = c.a; i <= c.b; i++) cid[i] = c.id; });
  const roads = steps.map(s => ({ id: 's' + s.i, kind: 'road', i: s.i, cluster: cid[s.i], midM: (s.startM + s.endM) / 2, p: pointAt(s.coords, 0.5), lenM: s.dist, durS: s.dur, label: s.label, kmh: s.v ? s.v * 3.6 : null }));
  const clusters = cl.map(c => { const mid = (c.startM + c.endM) / 2; return { id: 'c' + c.id, kind: 'cluster', cl: c.id, midM: mid, p: pointAt(rt.coords, mid / L), lenM: c.len, durS: c.dur, n: c.n, medLen: c.medLen, modeLen: c.modeLen, meanLen: c.meanLen, hw: c.g.hw, conf: c.g.conf, kmh: c.avgV * 3.6 }; });
  const edges = (nodes, pre) => { const out = []; for (let o = 1; o <= 2; o++) for (let i = 0; i + o < nodes.length; i++) { const a = nodes[i], b = nodes[i + o]; out.push({ a: a.id, b: b.id, order: o, distM: b.midM - a.midM, sec: timeAt(b.midM) - timeAt(a.midM) }); } return out; };
  return { method: method || A.method, nodes: clusters.concat(roads), clusters, roads, edges: edges(clusters).concat(edges(roads)) };
}
async function classify(rt, env) {
  const modeSel = env.mode || 'smart', A = analyze(rt, env.an);
  const full = url => async e => { const body = 'data=' + encodeURIComponent(overpassQuery(rt.coords, url.step, url.n)); const j = await getJSON(e, url.u, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, timeoutMs: 45000 }); if (!j.elements) throw new Error('bad reply'); const segs = segmentsFromOverpass(rt.coords, j); if (!segs.length) throw new Error('no segments'); return { segs, analysis: A }; };
  const OPU = 'https://overpass-api.de/api/interpreter', MIU = 'https://overpass.kumi.systems/api/interpreter';
  const smart = urls => async e => {
    if (!A) throw new Error('no steps'); const pts = probePoints(A); const t0 = Date.now();
    const res = await probeLookup(pts.map(x => x.p), e, urls);
    if (e.onPhase) { try { e.onPhase({ n: 5, of: 6, msg: 'Counting traffic lights in built-up parts…', frac: null }); } catch (x) {} }
    let sig = null; try { sig = await signalProbe(A, e, urls); } catch (er) { e.log('classify', 'light-count', 'skipped — ' + er.message, 'skip'); }
    const pr = pts.map((x, i) => ({ ci: x.ci, key: x.key, r: res[i], p: x.p, m: x.m }));
    pr.forEach(p => { const cp = p.key && A.checkpoints.find(c => c.key === p.key); if (cp) cp.probe = p.r; });
    A.probed = true; A.probes = pr.length; A.probeHits = pr.filter(p => p.r).length; A.probeStat = res.stat; A.probeRaw = pr.map(p => ({ ci: p.ci, key: p.key || null, m: p.m != null ? Math.round(p.m) : null, lat: +p.p[0].toFixed(5), lon: +p.p[1].toFixed(5), r: p.r })); A.signalCounts = sig; A.probeMs = Date.now() - t0; evalMethods(A);
    if (res.stat.failed) e.log('classify', 'smart-probes', res.stat.failed + ' of ' + res.stat.chunks + ' batches failed, kept the rest (' + res.stat.errors.slice(0, 2).join(' | ') + ')', 'skip');
    if (!A.probeHits) throw new Error('no probe matched a road'); return { segs: buildSegments(A, pr, sig), analysis: A };
  };
  const guess = async () => { if (!A) throw new Error('no steps'); return { segs: buildSegments(A, []), analysis: A }; };
  const heur = async () => { const s = classifyFromSteps(rt); if (!s.length) throw new Error('no steps'); return { segs: s, analysis: A }; };
  const OP = OPU, MI = MIU;
  const L = {
    smart: { id: 'smart-probes', fn: smart([OP, MI]) }, guess: { id: 'cluster-guess', fn: guess }, heur: { id: 'osrm-step-heuristic', fn: heur },
    full: { id: 'overpass', fn: full({ u: OP, step: 300, n: 250 }) }, full2: { id: 'overpass-mirror', fn: full({ u: MI, step: 300, n: 250 }) }, light: { id: 'overpass-light', fn: full({ u: OP, step: 800, n: 90 }) },
  };
  const order = modeSel === 'full' ? [L.full, L.full2, L.light, L.smart, L.guess, L.heur] : modeSel === 'guess' ? [L.guess, L.heur] : [L.smart, L.guess, L.heur, L.full];
  return runLayers('classify', order, env);
}



/* ---------- route shaping: detour by percentage, random village / place of interest ---------- */
const bearing = (a, b) => { const y = Math.sin((b[1] - a[1]) * D2R) * Math.cos(b[0] * D2R), x = Math.cos(a[0] * D2R) * Math.sin(b[0] * D2R) - Math.sin(a[0] * D2R) * Math.cos(b[0] * D2R) * Math.cos((b[1] - a[1]) * D2R); return (Math.atan2(y, x) / D2R + 360) % 360; };
const dest = (p, brg, m) => { const d = m / 6371008, b = brg * D2R, la = p[0] * D2R, lo = p[1] * D2R, la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b)), lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2)); return [la2 / D2R, lo2 / D2R]; };
function fracOnRoute(coords, cum, p) { let bi = 0, bd = 1e18; for (let i = 0; i < coords.length; i += Math.max(1, Math.floor(coords.length / 4000))) { const d = hav(coords[i], p); if (d < bd) { bd = d; bi = i; } } return { frac: cum[bi] / cum[cum.length - 1], dist: bd, i: bi }; }
const denseCoords = coords => { const L = pathLen(coords); return L ? resample(coords, Math.max(500, L / 3000)).pts.map(x => x.p) : coords; };
function cumDist(coords) { const c = [0]; for (let i = 1; i < coords.length; i++) c.push(c[i - 1] + hav(coords[i - 1], coords[i])); return c; }
const WHERE = { start: [0.2], middle: [0.5], end: [0.8], whole: [0.35, 0.65] };
async function detourRoute(pts, base, spec, env, ro) { // bulge the route sideways until it is ~pct % longer (in time) than the fastest one
  base = Object.assign({}, base, { coords: denseCoords(base.coords) });
  const target = spec.pct / 100, L = base.dist, cum = cumDist(base.coords), fr = WHERE[spec.where] || WHERE.middle, tries = [], ph = (i, msg) => { if (env.onPhase) { try { env.onPhase({ n: 2, of: 6, msg, frac: i / 6 }); } catch (e) {} } };
  const place = (f, side, d) => { const i = Math.min(base.coords.length - 2, Math.max(0, cum.findIndex(x => x >= f * cum[cum.length - 1]))), b = bearing(base.coords[i], base.coords[i + 1]); return dest(base.coords[i], b + (side === 'left' ? -90 : 90), d); };
  const placeAt = pts.map(p => fracOnRoute(base.coords, cum, p).frac);
  const build = vias => { const out = pts.slice(), at = placeAt.slice(); vias.forEach(v => { const k = at.findIndex(x => x > v.f); const pos = k < 0 ? out.length : Math.max(1, k); out.splice(pos, 0, v.p); at.splice(pos, 0, v.f); }); return out; };
  const tryD = async (d, side, n) => {
    if (env.cancelled && env.cancelled()) throw new Error('cancelled');
    const vias = fr.map(f => ({ f, p: place(f, side, d) }));
    ph(n, 'Detour search ' + n + '/6 — trying ' + (d / 1000).toFixed(1) + ' km ' + side + ' of the route…');
    const r = await route(build(vias), env, ro);
    const snap = r.value.wpDist && r.value.wpDist.length ? Math.max(...r.value.wpDist.filter(x => x != null).slice(1, -1), 0) : 0;
    const extraT = r.value.dur / base.dur - 1, extraD = r.value.dist / base.dist - 1, t = { d, side, extraT, extraD, snap, route: r.value, layer: r.layer, vias: vias.map(v => v.p) }; tries.push(t); return t;
  };
  let side = spec.side === 'left' || spec.side === 'right' ? spec.side : null, d = L * Math.sqrt(Math.max(target, 0.01) / 2) * 0.8; d = clamp(d, 1500, Math.max(3000, L * 0.45));
  let first = null;
  if (!side) { const a = await tryD(d, 'left', 1), b = await tryD(d, 'right', 2); first = [a, b]; side = (a.snap <= b.snap ? a : b).side; }
  let best = first ? first.find(t => t.side === side) : null, n = first ? 2 : 0, cur = best;
  for (; n < 6;) {
    if (cur) { const err = Math.abs(cur.extraT - target); if (!best || err < Math.abs(best.extraT - target)) best = cur; if (err <= Math.max(0.012, target * 0.12)) break; const ratio = target / Math.max(cur.extraT, 0.004); d = clamp(cur.d * Math.pow(ratio, 0.6), 800, Math.max(3000, L * 0.6)); }
    try { cur = await tryD(d, side, ++n); } catch (e) { if (/cancel/i.test(e.message)) throw e; tries.push({ d, side, error: e.message }); break; }
  }
  if (cur && (!best || Math.abs(cur.extraT - target) < Math.abs(best.extraT - target))) best = cur;
  if (!best) throw new Error('detour search found no route');
  return { route: best.route, layer: best.layer, vias: best.vias, side: best.side, pctTime: best.extraT * 100, pctDist: best.extraD * 100, target: spec.pct, where: spec.where, tries: tries.map(t => ({ km: +(t.d / 1000).toFixed(1), side: t.side, pctTime: t.extraT != null ? +(t.extraT * 100).toFixed(1) : null, error: t.error || null })) };
}
const SCOUT_KINDS = {
  village: { label: 'village or town', q: '[place~"^(village|town)$"][name]' },
  church: { label: 'church / place of worship', q: '[amenity=place_of_worship]' },
  school: { label: 'school', q: '[amenity=school]' },
  windmill: { label: 'windmill', q: '[man_made=windmill]' },
  castle: { label: 'castle / fort', q: '[historic~"^(castle|fort|manor)$"]' },
  museum: { label: 'museum', q: '[tourism=museum]' },
  viewpoint: { label: 'viewpoint', q: '[tourism=viewpoint]' },
  cafe: { label: 'café / bakery', q: '[amenity=cafe]' },
  playground: { label: 'playground', q: '[leisure=playground]' },
  lighthouse: { label: 'lighthouse', q: '[man_made=lighthouse]' },
  monument: { label: 'monument / memorial', q: '[historic~"^(monument|memorial)$"]' },
  harbour: { label: 'harbour / marina', q: '[leisure=marina]' },
};
function shuffled(a, rnd) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
async function scout(rt, spec, env) { // random place near the middle half of the route
  rt = Object.assign({}, rt, { coords: denseCoords(rt.coords) });
  const R = Math.max(2, spec.radiusKm || 15) * 1000, from = spec.from != null ? spec.from : 0.25, to = spec.to != null ? spec.to : 0.75, cum = cumDist(rt.coords), Lm = cum[cum.length - 1];
  const kind = SCOUT_KINDS[spec.kind] ? spec.kind : null, q = kind ? SCOUT_KINDS[kind].q : '[' + String(spec.tag || '').replace(/[^\w:=~^$|"\[\]\-,.*()]/g, '') + ']';
  if (!kind && !/=|~/.test(q)) throw new Error('custom tag should look like key=value');
  const sub = []; const step = Math.max(3000, R * 0.8); for (let m = from * Lm; m <= to * Lm + 1; m += step) { const i = Math.max(0, cum.findIndex(x => x >= m)); sub.push(rt.coords[i]); } if (sub.length < 2) sub.push(rt.coords[Math.min(rt.coords.length - 1, cum.findIndex(x => x >= to * Lm))]);
  const pts = sub.slice(0, 40), co = pts.map(p => p[0].toFixed(4) + ',' + p[1].toFixed(4)).join(',');
  const ov = url => async e => { await throttle(e, 'overpass', 1000); const qq = '[out:json][timeout:30];(' + (kind === 'village' ? 'node' : 'nwr') + q + '(around:' + R + ',' + co + '););out center tags 250;'; const j = await getJSON(e, url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(qq), timeoutMs: 35000 }); if (!j.elements) throw new Error('bad reply'); return j.elements.map(x => ({ name: (x.tags && (x.tags.name || x.tags['name:nl'])) || '', ll: x.type === 'node' ? [x.lat, x.lon] : x.center ? [x.center.lat, x.center.lon] : null, tags: x.tags || {} })).filter(x => x.ll); };
  const wiki = async e => { const out = []; for (const p of pts.slice(0, 8)) { const j = await getJSON(e, 'https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=' + p[0] + '%7C' + p[1] + '&gsradius=10000&gslimit=40&format=json&origin=*'); ((j.query || {}).geosearch || []).forEach(g => out.push({ name: g.title, ll: [g.lat, g.lon], tags: { source: 'wikipedia-article' } })); } if (!out.length) throw new Error('none'); return out; };
  const r = await runLayers('scout', [{ id: 'overpass', fn: ov('https://overpass-api.de/api/interpreter') }, { id: 'overpass-mirror', fn: ov('https://overpass.kumi.systems/api/interpreter') }, { id: 'wikipedia-places', fn: wiki }], env);
  const minD = (spec.minFrac != null ? spec.minFrac : 0.3) * R, seen = new Set(), cands = [];
  r.value.forEach(c => { const k = (c.name || '') + c.ll[0].toFixed(3) + c.ll[1].toFixed(3); if (seen.has(k)) return; seen.add(k); const f = fracOnRoute(rt.coords, cum, c.ll); if (f.frac < from - 0.02 || f.frac > to + 0.02 || f.dist < Math.min(minD, R * 0.15) || f.dist > R * 1.15) return; const i = Math.min(rt.coords.length - 2, f.i), b = bearing(rt.coords[i], rt.coords[i + 1]), tb = bearing(rt.coords[f.i], c.ll), side = ((tb - b + 540) % 360) - 180 < 0 ? 'left' : 'right'; cands.push(Object.assign(c, { frac: f.frac, distKm: f.dist / 1000, side, label: c.name || (SCOUT_KINDS[kind] ? SCOUT_KINDS[kind].label : 'place') + (c.tags.denomination ? ' (' + c.tags.denomination + ')' : '') + ' — unnamed' })); });
  if (!cands.length) throw new Error('nothing found within ' + spec.radiusKm + ' km of the middle half — try a bigger radius or another kind');
  const named = cands.filter(c => c.name), pool = named.length >= 3 ? named : cands, rnd = spec.rnd || Math.random;
  return { layer: r.layer, cands: shuffled(pool, rnd), total: cands.length, kind: kind || 'custom' };
}
async function scoutHint(ll, env) { // non-spoiler: how many Wikipedia articles lie within 2.5 km?
  return (await runLayers('scout-hint', ['en', 'nl'].map(lang => ({ id: 'wikipedia-' + lang, fn: async e => { const j = await getJSON(e, 'https://' + lang + '.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=' + ll[0] + '%7C' + ll[1] + '&gsradius=2500&gslimit=30&format=json&origin=*'); const n = ((j.query || {}).geosearch || []).length; return { count: n, level: n >= 12 ? 'a lot to find' : n >= 4 ? 'a few things to find' : n >= 1 ? 'something small' : 'quiet' }; } })), env)).value;
}

/* ---------- reverse geocoding: "where is this point?" ---------- */
const NAME_CACHE = {};
async function reverseName(ll, env) {
  const key = ll[0].toFixed(3) + ',' + ll[1].toFixed(3); if (NAME_CACHE[key]) return { layer: 'cache', value: NAME_CACHE[key], errors: [] };
  const r = await runLayers('reverse', [
    { id: 'nominatim-reverse', fn: async e => { await throttle(e, 'nominatim', 1100); const j = await getJSON(e, 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=nl,en&lat=' + ll[0] + '&lon=' + ll[1]); const a = j.address || {}; const place = a.village || a.town || a.city || a.municipality || a.hamlet || a.suburb || a.county; if (!place) throw new Error('no place'); return { place, region: a.state || a.county || '', country: a.country_code ? a.country_code.toUpperCase() : '', road: a.road || '' }; } },
    { id: 'photon-reverse', fn: async e => { const j = await getJSON(e, 'https://photon.komoot.io/reverse?lat=' + ll[0] + '&lon=' + ll[1]); const p = j.features && j.features[0] && j.features[0].properties; if (!p) throw new Error('no hit'); const place = p.city || p.town || p.village || p.district || p.county || p.name; if (!place) throw new Error('no place'); return { place, region: p.state || '', country: (p.countrycode || '').toUpperCase(), road: p.street || '' }; } },
    { id: 'gazetteer-nearest', fn: async () => { let b = null, bd = 1e12; for (const k in GAZ) { const d = hav(ll, GAZ[k]); if (d < bd) { bd = d; b = k; } } if (!b || bd > 25000) throw new Error('nothing within 25 km'); return { place: 'near ' + b[0].toUpperCase() + b.slice(1), region: '', country: '', road: '' }; } },
  ], env);
  NAME_CACHE[key] = r.value; return r;
}
/* ---------- clock: distance <-> time curves, checkpoints by distance and time, rest stops ---------- */
function timeCurve(A, basis, segs, rows) { // returns [[meters, seconds], ...] increasing
  let pts;
  if (basis === 'model' && segs && rows && segs.length === rows.length && rows.length) {
    const tl = segs.reduce((a, s) => a + s.len, 0) || 1, k = A.L / tl; let m = 0, t = 0; pts = [[0, 0]];
    segs.forEach((s, i) => { m += s.len * k; t += rows[i].sec; pts.push([m, t]); });
  } else { pts = [[0, 0]]; A.steps.forEach(s => pts.push([s.endM, pts[pts.length - 1][1] + s.dur])); }
  return pts;
}
function curveAt(pts, x, from, to) { // interpolate pts[*][to] at value x of pts[*][from]
  if (x <= pts[0][from]) return pts[0][to]; const n = pts.length - 1; if (x >= pts[n][from]) return pts[n][to];
  let lo = 0, hi = n; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid][from] <= x) lo = mid; else hi = mid; }
  const a = pts[lo], b = pts[hi], f = b[from] === a[from] ? 0 : (x - a[from]) / (b[from] - a[from]); return a[to] + (b[to] - a[to]) * f;
}
const TL_DEFAULT = { div: 'auto', kmPer: 25, density: 1, maxN: 16, nOverride: 0, restEveryH: 2, restMin: 15, withBreaks: true };
function gradN(km, o) { o = Object.assign({}, TL_DEFAULT, o || {}); if (o.nOverride > 0) return Math.round(o.nOverride); return clamp(Math.round(km / o.kmPer * o.density), 2, o.maxN); }
function timeline(rt, A, curve, o) {
  o = Object.assign({}, TL_DEFAULT, o || {}); const L = A.L, T = curve[curve.length - 1][1], N = o.div === 'auto' || o.div == null ? gradN(L / 1000, o) : Math.max(0, Math.round(+o.div) || 0), dep = o.depart || 0;
  const restSec = o.restMin * 60, rests = [];
  if (o.restEveryH > 0) for (let k = 1; k * o.restEveryH * 3600 < T - 600; k++) rests.push(k * o.restEveryH * 3600);
  const breaksBefore = t => o.withBreaks ? rests.filter(r => r < t - 1e-6).length * restSec : 0; // a rest at time r delays everything after it
  const stepAt = m => A.steps.find(s => m < s.endM) || A.steps[A.steps.length - 1];
  const mk = (kind, label, m, extra) => {
    const t = curveAt(curve, m, 0, 1), st = stepAt(m), cl = A.clusters.find(c => m >= c.startM && m <= c.endM) || A.clusters[A.clusters.length - 1];
    const pr = A.probeRaw && A.probeRaw.filter(p => p.r && p.m != null).sort((a, b) => Math.abs(a.m - m) - Math.abs(b.m - m))[0];
    const near = pr && Math.abs(pr.m - m) < Math.max(1500, L * 0.02) ? pr.r : null;
    const arr = t + breaksBefore(t), isRest = kind === 'rest';
    return Object.assign({ kind, label, m, km: m / 1000, toEndKm: (L - m) / 1000, t, min: t / 60, arriveMs: dep ? dep + (arr) * 1000 : null, departMs: dep ? dep + (arr + (isRest && o.withBreaks ? restSec : 0)) * 1000 : null,
      road: st.label, stepNo: st.i + 1, type: near ? near.hw : cl.g.hw, typeSrc: near ? 'OSM probe' : 'guess', limit: near && near.limit ? near.limit : null, cluster: cl.id, p: pointAt(rt.coords, m / L) }, extra || {});
  };
  const dist = [], time = [];
  if (N > 0) for (let k = 0; k <= N; k++) dist.push(mk('dist', k + '/' + N, L * k / N, { k, N }));
  if (N > 0) for (let k = 0; k <= N; k++) time.push(mk('time', k + '/' + N, curveAt(curve, T * k / N, 1, 0), { k, N }));
  const rs = rests.map((r, i) => mk('rest', 'Rest ' + (i + 1), curveAt(curve, r, 1, 0), { k: i + 1, restAt: r }));
  const delta = arr => arr.forEach((x, i) => { const p = arr[i - 1]; x.dKm = p ? x.km - p.km : 0; x.dMin = p ? x.min - p.min : 0; });
  delta(dist); delta(time); delta(rs);
  const totalBreak = o.withBreaks ? rests.length * restSec : 0, arriveMs = dep ? dep + (T + totalBreak) * 1000 : null;
  return { N, dist, time, rests: rs, totalSec: T, totalBreakSec: totalBreak, arriveMs, departMs: dep || null, opt: o };
}

/* kenteken (RDW open data, CC0). width/height are NOT in RDW. */
const PLATE_CACHE = { '13TPPK': { name: 'PEUGEOT PARTNER (2007, MPV)', massEmpty: 1229, massRoadReady: 1329, length: 4.14, disp: 1.587, kw: 80, fuel: 'Benzine', cyl: 4, euro: 'EURO 4', wheelbase: 2.69, width: 1.72, height: 1.81 } };
function mapRdw(a, b) {
  const n = k => (a && a[k] != null ? +a[k] : null);
  return { name: [a.merk, a.handelsbenaming].filter(Boolean).join(' '), massEmpty: n('massa_ledig_voertuig'), massRoadReady: n('massa_rijklaar'), length: n('lengte') ? n('lengte') / 100 : null, disp: n('cilinderinhoud') ? n('cilinderinhoud') / 1000 : null, kw: b && b.nettomaximumvermogen ? +b.nettomaximumvermogen : null, fuel: b && b.brandstof_omschrijving, cyl: n('aantal_cilinders'), euro: b && b.uitlaatemissieniveau, wheelbase: n('wielbasis') ? n('wielbasis') / 100 : null };
}
async function lookupPlate(plate, env) {
  const p = String(plate).replace(/[^a-z0-9]/gi, '').toUpperCase();
  const rdw = async (e, fmt) => {
    const q = fmt === 1 ? '?kenteken=' + p : "?$where=kenteken='" + p + "'";
    const a = await getJSON(e, 'https://opendata.rdw.nl/resource/m9d7-ebf2.json' + q); if (!a.length) throw new Error('plate not found');
    const b = await getJSON(e, 'https://opendata.rdw.nl/resource/8ys7-d773.json' + q).catch(() => [{}]);
    return mapRdw(a[0], b[0] || {});
  };
  const r = await runLayers('plate ' + p, [
    { id: 'rdw', fn: e => rdw(e, 1) },
    { id: 'rdw-soql', fn: e => rdw(e, 2) },
    { id: 'built-in cache', fn: async () => { if (!PLATE_CACHE[p]) throw new Error('not cached'); return PLATE_CACHE[p]; } },
  ], env);
  const cache = PLATE_CACHE[p] || {};
  r.value = Object.assign({}, cache, Object.fromEntries(Object.entries(r.value).filter(([, v]) => v != null)));
  r.value.plate = p; return r;
}

/* built-in sample: Wesel -> Dieren (approximate, labelled) */
function sampleRoute() {
  const S = [
    ['B8 Wesel–Emmerich', 'primary', 100, false, 'DE', 5, [[51.658,6.617],[51.700,6.50],[51.762,6.395],[51.810,6.30]]],
    ['Emmerich (urban)', 'secondary', 50, false, 'DE', 3, [[51.810,6.30],[51.835,6.24],[51.862,6.18]]],
    ['A3 to border', 'motorway', null, true, 'DE', 0, [[51.862,6.18],[51.878,6.13]]],
    ['A12 Zevenaar–Duiven', 'motorway', 100, false, 'NL', 0, [[51.878,6.13],[51.93,6.06],[51.947,6.01],[51.985,5.97]]],
    ['A348 to Dieren', 'motorway', 100, false, 'NL', 0, [[51.985,5.97],[52.02,6.03],[52.04,6.08]]],
    ['Dieren (urban)', 'secondary', 50, false, 'NL', 2, [[52.04,6.08],[52.0507,6.1045]]],
  ];
  const segs = S.map((s, i) => ({ id: i + 1, name: s[0], hw: s[1], limit: s[2], unlimited: s[3], country: s[4], signals: s[5], pts: s[6], len: pathLen(s[6]) * 0.97 }));
  const coords = segs.reduce((a, s) => a.concat(s.pts), []);
  const dist = segs.reduce((a, s) => a + s.len, 0);
  return { coords, dist, dur: dist / 20, steps: [], segs };
}

/* full pipeline */
async function planRoute(places, env) {
  const info = { geocode: [], places: [] };
  const pts = []; const ph = (n, msg, frac) => { if (env.onPhase) { try { env.onPhase({ n, of: 6, msg, frac: frac == null ? null : frac }); } catch (e) {} } };
  let gi = 0;
  for (const q of places) { ph(1, 'Looking up place ' + (++gi) + ' of ' + places.length + ': ' + q, (gi - 1) / places.length); const g = await geocode(q, env); pts.push(g.value); info.geocode.push(g.layer); info.places.push({ q, ll: g.value }); }
  ph(2, 'Asking OSRM for the driving route…');
  let r = await route(pts, env, env.ro);
  let detour = null;
  if (env.detour && env.detour.pct > 0 && !r.value.approx) {
    const base = r.value;
    if (env.onStage) { try { env.onStage({ route: base, routeLayer: r.layer, pts, analysis: analyze(base, env.an), detour: null }); } catch (e) {} }
    try { const dv = await detourRoute(pts, base, env.detour, env, env.ro); detour = Object.assign({ base: { coords: base.coords, dist: base.dist, dur: base.dur } }, dv); r = { layer: r.layer + ' + detour', value: dv.route, errors: r.errors }; } catch (e) { if (/cancel/i.test(e.message)) throw e; detour = { error: e.message, base: { coords: base.coords, dist: base.dist, dur: base.dur } }; }
  }
  ph(3, 'Route received — splitting it into road clusters…');
  if (env.onStage) { try { env.onStage({ route: r.value, routeLayer: r.layer, pts, analysis: analyze(r.value, env.an), detour }); } catch (e) {} }
  env.onPhase = env.onPhase || null;
  const c = await classify(r.value, env).catch(e => ({ layer: 'none', value: null, errors: e.errs || [String(e)] }));
  return { pts, info, detour, routeLayer: r.layer, route: r.value, classLayer: c.layer, segs: c.value && c.value.segs, analysis: (c.value && c.value.analysis) || analyze(r.value, env.an), notes: [].concat(r.errors, c.errors || []) };
}

const api = { cumDist, fracOnRoute, denseCoords, RO_DEFAULT, SCOUT_KINDS, detourRoute, scout, scoutHint, bearing, dest, segsForMethod, buildGraph, METHOD_SHORT, reverseName, NAME_CACHE, timeCurve, curveAt, timeline, gradN, TL_DEFAULT, METHODS, METHOD_INFO, evalMethods, assignBy, PROBE_IDX, throttle, level0, level1, AN_DEFAULT, analyze, normSteps, pointAt, buildSegments, suggest, lerpTab, bonnetKind, lookupPlate, PLATE_CACHE, PRESETS, TYRE_CRR, DEFAULT_PARAMS, HW, DEF_LIMIT, PROFILES, estimateCd, frontalArea, crr, totalMass, cruise, stopCost, parseMaxspeed, limitKmh, computeSegment, computeRoute, hav, pathLen, resample, countryAt, decodePoly6, runLayers, geocode, route, classify, classifyFromSteps, segmentsFromOverpass, overpassQuery, sampleRoute, planRoute, GAZ, clamp };
root.Core = api; if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
