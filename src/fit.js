/* ============================================================
   Ride metrics + FIT / TCX export (for manual Strava upload)
   ============================================================ */
const Metrics = (() => {
  function avg(a, skipZero) {
    let s = 0, n = 0;
    for (const v of a) { if (v == null || (skipZero && !v)) continue; s += v; n++; }
    return n ? s / n : 0;
  }
  function max(a) { let m = 0; for (const v of a) if (v != null && v > m) m = v; return m; }
  function bestAvg(a, win) {
    if (a.length < win) return 0;
    let s = 0;
    for (let i = 0; i < win; i++) s += a[i] || 0;
    let best = s;
    for (let i = win; i < a.length; i++) { s += (a[i] || 0) - (a[i - win] || 0); if (s > best) best = s; }
    return best / win;
  }
  function np(p) {
    if (p.length < 30) return avg(p);
    let s = 0, acc = 0, n = 0;
    for (let i = 0; i < p.length; i++) {
      s += p[i] || 0;
      if (i >= 30) s -= p[i - 30] || 0;
      if (i >= 29) { acc += Math.pow(s / 30, 4); n++; }
    }
    return Math.pow(acc / n, 0.25);
  }
  function summarize(sm, ftp) {
    const n = sm.p.length;
    const kj = sm.p.reduce((s, v) => s + (v || 0), 0) / 1000;
    const NP = np(sm.p);
    const IF = ftp ? NP / ftp : 0;
    const tss = ftp ? (n * NP * IF) / (ftp * 3600) * 100 : 0;
    const dist = n ? sm.dist[n - 1] : 0;
    const elapsed = n ? Math.round((sm.ts[n - 1] - sm.ts[0]) / 1000) + 1 : 0;
    return {
      duration: n, elapsed, distance: dist,
      avgPower: Math.round(avg(sm.p)), maxPower: Math.round(max(sm.p)), np: Math.round(NP),
      IF: Math.round(IF * 100) / 100, tss: Math.round(tss),
      avgHR: Math.round(avg(sm.hr, true)), maxHR: Math.round(max(sm.hr)),
      avgCad: Math.round(avg(sm.cad, true)), maxCad: Math.round(max(sm.cad)),
      avgSpeed: n ? (dist / n) * 3.6 : 0, maxSpeed: max(sm.spd),
      kj: Math.round(kj), kcal: Math.round(kj), // 人の効率(約24%)とkJ→kcal換算がほぼ打ち消し合う
      best1m: Math.round(bestAvg(sm.p, 60)), best5m: Math.round(bestAvg(sm.p, 300)), best20m: Math.round(bestAvg(sm.p, 1200)),
    };
  }
  /* virtual road speed from power (flat or graded), m/s */
  function speedFromPower(P, massKg, grade = 0) {
    if (P <= 0) return 0;
    const g = 9.81, crr = 0.004, rho = 1.2, cda = 0.32;
    const th = Math.atan(grade / 100);
    const F = massKg * g * (crr * Math.cos(th) + Math.sin(th));
    let lo = 0, hi = 40;
    for (let i = 0; i < 40; i++) {
      const v = (lo + hi) / 2;
      const pw = v * (F + 0.5 * rho * cda * v * v);
      if (pw > P) hi = v; else lo = v;
    }
    return (lo + hi) / 2;
  }
  return { summarize, bestAvg, np, speedFromPower, avg, max };
})();

const FIT = (() => {
  const CRC_T = [0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401,
    0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400];
  function crc16(crc, byte) {
    let t = CRC_T[crc & 0xF];
    crc = (crc >> 4) & 0x0FFF; crc = crc ^ t ^ CRC_T[byte & 0xF];
    t = CRC_T[crc & 0xF];
    crc = (crc >> 4) & 0x0FFF; crc = crc ^ t ^ CRC_T[(byte >> 4) & 0xF];
    return crc;
  }
  const crcOf = (arr, from = 0, to = arr.length) => { let c = 0; for (let i = from; i < to; i++) c = crc16(c, arr[i]); return c; };
  const T = {
    enum: [0x00, 1], uint8: [0x02, 1], sint16: [0x83, 2], uint16: [0x84, 2],
    uint32: [0x86, 4], uint32z: [0x8C, 4],
  };
  const INVALID = { enum: 0xFF, uint8: 0xFF, uint16: 0xFFFF, sint16: 0x7FFF, uint32: 0xFFFFFFFF, uint32z: 0 };
  const FIT_EPOCH = 631065600; // 1989-12-31T00:00:00Z

  class W {
    constructor() { this.b = []; this.defs = {}; }
    u8(v) { this.b.push(v & 0xFF); }
    u16(v) { this.u8(v); this.u8(v >>> 8); }
    u32(v) { this.u8(v); this.u8(v >>> 8); this.u8(v >>> 16); this.u8(v >>> 24); }
    def(local, global, fields) {
      this.u8(0x40 | local); this.u8(0); this.u8(0); this.u16(global); this.u8(fields.length);
      for (const [num, type] of fields) { this.u8(num); this.u8(T[type][1]); this.u8(T[type][0]); }
      this.defs[local] = fields;
    }
    msg(local, values) {
      this.u8(local & 0x0F);
      this.defs[local].forEach(([, type], i) => {
        let v = values[i];
        if (v == null || !Number.isFinite(v)) v = INVALID[type];
        v = Math.round(v);
        const size = T[type][1];
        if (type === 'sint16' && v < 0) v += 65536;
        const lim = size === 1 ? 0xFF : size === 2 ? 0xFFFF : 0xFFFFFFFF;
        if (v > lim) v = lim;
        if (v < 0) v = 0;
        if (size === 1) this.u8(v); else if (size === 2) this.u16(v); else this.u32(v);
      });
    }
  }

  function encode(ride) {
    const sm = ride.samples;
    const s = ride.summary;
    const n = sm.p.length;
    const ft = (ms) => Math.floor(ms / 1000) - FIT_EPOCH;
    const tz = -new Date(ride.start).getTimezoneOffset() * 60;
    const startT = ft(sm.ts[0] || ride.start);
    const endT = ft(sm.ts[n - 1] || ride.start);
    const w = new W();

    // file_id
    w.def(0, 0, [[0, 'enum'], [1, 'uint16'], [2, 'uint16'], [3, 'uint32z'], [4, 'uint32']]);
    w.msg(0, [4, 255, 1, 20261031, startT]);
    // event (timer start / stop)
    w.def(1, 21, [[253, 'uint32'], [0, 'enum'], [1, 'enum']]);
    w.msg(1, [startT, 0, 0]);
    // record
    w.def(2, 20, [[253, 'uint32'], [3, 'uint8'], [4, 'uint8'], [5, 'uint32'], [6, 'uint16'], [7, 'uint16']]);
    let prev = null;
    for (let i = 0; i < n; i++) {
      const t = ft(sm.ts[i]);
      if (prev != null && t - prev > 2) { w.msg(1, [prev, 0, 4]); w.msg(1, [t, 0, 0]); } // pause gap
      if (prev != null && t <= prev) continue;
      w.msg(2, [t, sm.hr[i] || null, sm.cad[i] != null ? sm.cad[i] : null, sm.dist[i] * 100, (sm.spd[i] / 3.6) * 1000, sm.p[i]]);
      prev = t;
    }
    w.msg(1, [endT, 0, 4]);
    // lap
    const lapF = [[253, 'uint32'], [254, 'uint16'], [0, 'enum'], [1, 'enum'], [2, 'uint32'], [7, 'uint32'], [8, 'uint32'],
      [9, 'uint32'], [11, 'uint16'], [13, 'uint16'], [14, 'uint16'], [15, 'uint8'], [16, 'uint8'], [17, 'uint8'], [18, 'uint8'],
      [19, 'uint16'], [20, 'uint16'], [25, 'enum'], [39, 'enum']];
    const common = [s.elapsed * 1000, s.duration * 1000, s.distance * 100, s.kcal, (s.avgSpeed / 3.6) * 1000, (s.maxSpeed / 3.6) * 1000,
      s.avgHR || null, s.maxHR || null, s.avgCad || null, s.maxCad || null, s.avgPower, s.maxPower];
    w.def(3, 19, lapF);
    w.msg(3, [endT, 0, 9, 1, startT, ...common, 2, 6]);
    // session
    w.def(4, 18, [[253, 'uint32'], [254, 'uint16'], [0, 'enum'], [1, 'enum'], [2, 'uint32'], [5, 'enum'], [6, 'enum'],
      [7, 'uint32'], [8, 'uint32'], [9, 'uint32'], [11, 'uint16'], [14, 'uint16'], [15, 'uint16'], [16, 'uint8'], [17, 'uint8'],
      [18, 'uint8'], [19, 'uint8'], [20, 'uint16'], [21, 'uint16'], [25, 'uint16'], [26, 'uint16'],
      [34, 'uint16'], [35, 'uint16'], [36, 'uint16'], [45, 'uint16'], [48, 'uint32']]);
    w.msg(4, [endT, 0, 8, 1, startT, 2, 6, ...common, 0, 1, s.np, s.tss * 10, s.IF * 1000, ride.ftp, s.kj * 1000]);
    // activity
    w.def(5, 34, [[253, 'uint32'], [0, 'uint32'], [1, 'uint16'], [2, 'enum'], [3, 'enum'], [4, 'enum'], [5, 'uint32']]);
    w.msg(5, [endT, s.duration * 1000, 1, 0, 26, 1, endT + tz]);

    const data = w.b;
    const hdr = [14, 0x10, 0, 0, 0, 0, 0, 0, 0x2E, 0x46, 0x49, 0x54];
    const prof = 2132;
    hdr[2] = prof & 0xFF; hdr[3] = prof >> 8;
    const len = data.length;
    hdr[4] = len & 0xFF; hdr[5] = (len >>> 8) & 0xFF; hdr[6] = (len >>> 16) & 0xFF; hdr[7] = (len >>> 24) & 0xFF;
    const hcrc = crcOf(hdr);
    const all = new Uint8Array(14 + len + 2);
    all.set(hdr, 0); all[12] = hcrc & 0xFF; all[13] = hcrc >> 8;
    all.set(data, 14);
    const fcrc = crcOf(all, 0, 14 + len);
    all[14 + len] = fcrc & 0xFF; all[15 + len] = fcrc >> 8;
    return all;
  }

  function tcx(ride) {
    const sm = ride.samples; const s = ride.summary;
    const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const pts = [];
    for (let i = 0; i < sm.p.length; i++) {
      pts.push(`<Trackpoint><Time>${iso(sm.ts[i])}</Time><DistanceMeters>${sm.dist[i].toFixed(1)}</DistanceMeters>`
        + (sm.hr[i] ? `<HeartRateBpm><Value>${sm.hr[i]}</Value></HeartRateBpm>` : '')
        + (sm.cad[i] != null ? `<Cadence>${Math.min(254, Math.round(sm.cad[i]))}</Cadence>` : '')
        + `<Extensions><ns3:TPX><ns3:Speed>${(sm.spd[i] / 3.6).toFixed(2)}</ns3:Speed><ns3:Watts>${Math.round(sm.p[i])}</ns3:Watts></ns3:TPX></Extensions></Trackpoint>`);
    }
    return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
<Activities><Activity Sport="Biking"><Id>${iso(ride.start)}</Id>
<Lap StartTime="${iso(sm.ts[0] || ride.start)}"><TotalTimeSeconds>${s.duration}</TotalTimeSeconds><DistanceMeters>${s.distance.toFixed(1)}</DistanceMeters><Calories>${s.kcal}</Calories>${s.avgHR ? `<AverageHeartRateBpm><Value>${s.avgHR}</Value></AverageHeartRateBpm><MaximumHeartRateBpm><Value>${s.maxHR}</Value></MaximumHeartRateBpm>` : ''}<Intensity>Active</Intensity>${s.avgCad ? `<Cadence>${s.avgCad}</Cadence>` : ''}<TriggerMethod>Manual</TriggerMethod>
<Track>
${pts.join('\n')}
</Track></Lap>
<Notes>${(ride.name || '').replace(/[<&>]/g, '')}</Notes>
</Activity></Activities></TrainingCenterDatabase>`;
  }
  return { encode, tcx, crcOf };
})();

if (typeof module !== 'undefined') module.exports = { Metrics, FIT };
