/* ============================================================
   BLE layer: FTMS smart trainer (Saris H3), Cycling Power fallback,
   Heart Rate (Wahoo TICKR FIT etc.), auto-reconnect, simulators
   ============================================================ */
const BLE = (() => {
  const u = (n) => `0000${n.toString(16).padStart(4, '0')}-0000-1000-8000-00805f9b34fb`;
  const S = { FTMS: u(0x1826), CPS: u(0x1818), HR: u(0x180d), DIS: u(0x180a) };
  const C = {
    IBD: u(0x2ad2), CP: u(0x2ad9), STATUS: u(0x2ada), FEATURE: u(0x2acc),
    PRANGE: u(0x2ad8), CPM: u(0x2a63), HRM: u(0x2a37),
  };

  /* ---------- log (shown in the app's 接続ログ screen) ---------- */
  const logBuf = [];
  const logListeners = new Set();
  function log(...a) {
    const t = new Date();
    const ts = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}`;
    const line = `${ts} ${a.join(' ')}`;
    logBuf.push(line);
    if (logBuf.length > 800) logBuf.shift();
    logListeners.forEach((f) => { try { f(line); } catch (e) { /* ignore */ } });
  }
  const hex = (dv) => Array.from(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength))
    .map((b) => b.toString(16).padStart(2, '0')).join(' ');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  class Emitter {
    constructor() { this._h = {}; }
    on(e, f) { (this._h[e] = this._h[e] || []).push(f); return this; }
    emit(e, ...a) { (this._h[e] || []).forEach((f) => { try { f(...a); } catch (err) { console.error(err); } }); }
  }

  /* ---------- parsers (pure; unit-tested) ---------- */
  function parseIndoorBikeData(dv) {
    const len = dv.byteLength;
    let o = 0;
    const has = (n) => o + n <= len;
    if (!has(2)) return {};
    const f = dv.getUint16(o, true); o += 2;
    const r = {};
    if (!(f & 0x0001)) { if (!has(2)) return r; r.speed = dv.getUint16(o, true) / 100; o += 2; } // km/h
    if (f & 0x0002) { if (!has(2)) return r; o += 2; }                                          // avg speed
    if (f & 0x0004) { if (!has(2)) return r; r.cadence = dv.getUint16(o, true) / 2; o += 2; }   // rpm
    if (f & 0x0008) { if (!has(2)) return r; o += 2; }                                          // avg cadence
    if (f & 0x0010) { if (!has(3)) return r; r.distance = dv.getUint16(o, true) + (dv.getUint8(o + 2) << 16); o += 3; }
    if (f & 0x0020) { if (!has(2)) return r; r.resistance = dv.getInt16(o, true); o += 2; }
    if (f & 0x0040) { if (!has(2)) return r; r.power = dv.getInt16(o, true); o += 2; }          // W
    if (f & 0x0080) { if (!has(2)) return r; o += 2; }                                          // avg power
    if (f & 0x0100) { if (!has(5)) return r; o += 5; }                                          // energy
    if (f & 0x0200) { if (!has(1)) return r; r.hr = dv.getUint8(o); o += 1; }
    return r;
  }

  function parseCyclingPower(dv) {
    const len = dv.byteLength;
    if (len < 4) return {};
    let o = 0;
    const f = dv.getUint16(o, true); o += 2;
    const r = { power: dv.getInt16(o, true) }; o += 2;
    if (f & 0x01) o += 1;           // pedal power balance
    if (f & 0x04) o += 2;           // accumulated torque
    if (f & 0x10) { if (o + 6 > len) return r; r.wheelRevs = dv.getUint32(o, true); r.wheelTime = dv.getUint16(o + 4, true); o += 6; }
    if (f & 0x20) { if (o + 4 > len) return r; r.crankRevs = dv.getUint16(o, true); r.crankTime = dv.getUint16(o + 2, true); o += 4; }
    return r;
  }

  function parseHeartRate(dv) {
    if (dv.byteLength < 2) return null;
    const f = dv.getUint8(0);
    return (f & 0x01) ? dv.getUint16(1, true) : dv.getUint8(1);
  }

  const available = () => typeof navigator !== 'undefined' && !!(navigator.bluetooth && navigator.bluetooth.requestDevice);

  /* ---------- generic device with auto-reconnect ---------- */
  class BleDevice extends Emitter {
    constructor(label) {
      super();
      this.label = label;
      this.state = 'idle';           // idle | connecting | connected | reconnecting
      this.device = null;
      this.name = '';
      this._want = false;
      this._retrying = false;
    }
    _set(s) { if (this.state !== s) { this.state = s; this.emit('state', s); } }
    async pick(options) {
      const device = await navigator.bluetooth.requestDevice(options);
      if (this.device && this.device !== device) { try { this.device.gatt.disconnect(); } catch (e) { /* */ } }
      this.device = device;
      this.name = device.name || this.label;
      if (!device._rtHooked) {
        device.addEventListener('gattserverdisconnected', () => this._onDisconnect());
        device._rtHooked = true;
      }
      this._want = true;
      try {
        await this._connect();
      } catch (e) {
        log(`${this.label}: 接続失敗 ${e.message}`);
        this._set('reconnecting');
        this._retry();
      }
    }
    async _connect() {
      this._set(this.state === 'reconnecting' ? 'reconnecting' : 'connecting');
      log(`${this.label}: 接続中 ${this.name}`);
      const server = await this.device.gatt.connect();
      await this._setup(server);
      this._set('connected');
      log(`${this.label}: 接続完了`);
    }
    _onDisconnect() {
      log(`${this.label}: 切断されました`);
      this._onLost();
      if (!this._want) { this._set('idle'); return; }
      this._set('reconnecting');
      this._retry();
    }
    async _retry() {
      if (this._retrying) return;
      this._retrying = true;
      let n = 0;
      while (this._want && this.state !== 'connected') {
        await sleep(Math.min(1000 + n * 1000, 5000));
        if (!this._want) break;
        try {
          await this._connect();
        } catch (e) {
          log(`${this.label}: 再接続失敗(${n + 1}) ${e.message}`);
          try { this.device.gatt.disconnect(); } catch (err) { /* */ }
        }
        n++;
      }
      this._retrying = false;
    }
    disconnect() {
      this._want = false;
      try { if (this.device && this.device.gatt.connected) this.device.gatt.disconnect(); } catch (e) { /* */ }
      this._set('idle');
    }
    _onLost() {}
  }

  /* ---------- smart trainer (FTMS, falls back to Cycling Power) ---------- */
  class Trainer extends BleDevice {
    constructor() {
      super('トレーナー');
      this.kind = null;            // 'ftms' | 'cps'
      this.controllable = false;
      this.mode = { type: 'none' }; // {type:'erg', watts} | {type:'sim', grade}
      this.cp = null;
      this._q = Promise.resolve();
      this._pending = null;
      this._sent = null;
      this._pumping = false;
      this._crank = null;
      this._lastCad = 0;
      this._lastCadAt = 0;
      this.powerRange = null;
    }
    pick() {
      return super.pick({
        filters: [{ services: [S.FTMS] }, { services: [S.CPS] }],
        optionalServices: [S.FTMS, S.CPS, S.DIS],
      });
    }
    async _setup(server) {
      this.cp = null;
      this.controllable = false;
      this._sent = null;
      let ftms = null;
      try { ftms = await server.getPrimaryService(S.FTMS); } catch (e) { log('FTMSが見つかりません:', e.message); }
      if (ftms) {
        this.kind = 'ftms';
        const ibd = await ftms.getCharacteristic(C.IBD);
        if (!ibd._rtHooked) {
          ibd.addEventListener('characteristicvaluechanged', (ev) => this.emit('data', parseIndoorBikeData(ev.target.value)));
          ibd._rtHooked = true;
        }
        await ibd.startNotifications();
        try {
          const pr = await ftms.getCharacteristic(C.PRANGE);
          const v = await pr.readValue();
          this.powerRange = { min: v.getInt16(0, true), max: v.getInt16(2, true) };
          log(`パワー範囲 ${this.powerRange.min}–${this.powerRange.max}W`);
        } catch (e) { /* optional */ }
        try {
          const st = await ftms.getCharacteristic(C.STATUS);
          if (!st._rtHooked) {
            st.addEventListener('characteristicvaluechanged', (ev) => log('status:', hex(ev.target.value)));
            st._rtHooked = true;
          }
          await st.startNotifications();
        } catch (e) { /* optional */ }
        try {
          const cp = await ftms.getCharacteristic(C.CP);
          if (!cp._rtHooked) {
            cp.addEventListener('characteristicvaluechanged', (ev) => this._onCPResp(ev.target.value));
            cp._rtHooked = true;
          }
          await cp.startNotifications();
          this.cp = cp;
          const ok = await this._cpWrite([0x00], 'Request Control');
          await this._cpWrite([0x07], 'Start');
          this.controllable = ok !== false;
        } catch (e) {
          log('負荷コントロール不可:', e.message);
        }
      } else {
        this.kind = 'cps';
        const cps = await server.getPrimaryService(S.CPS);
        const m = await cps.getCharacteristic(C.CPM);
        if (!m._rtHooked) {
          m.addEventListener('characteristicvaluechanged', (ev) => this._onCPS(ev.target.value));
          m._rtHooked = true;
        }
        await m.startNotifications();
      }
      log(`方式=${this.kind} 負荷制御=${this.controllable ? 'OK' : 'なし'}`);
      setTimeout(() => this._pump(), 50);
    }
    _onLost() { this.cp = null; this._sent = null; if (this._pending) { this._pending.resolve(null); this._pending = null; } }
    _onCPS(dv) {
      const d = parseCyclingPower(dv);
      const now = Date.now();
      let cadence = this._lastCad;
      if (d.crankRevs != null) {
        const c = this._crank;
        if (c) {
          const dr = (d.crankRevs - c.revs + 65536) % 65536;
          const dt = (d.crankTime - c.time + 65536) % 65536;
          if (dr > 0 && dt > 0 && dr < 20) { cadence = (dr / (dt / 1024)) * 60; this._lastCadAt = now; }
        }
        this._crank = { revs: d.crankRevs, time: d.crankTime };
      }
      if (now - this._lastCadAt > 3000) cadence = 0;
      this._lastCad = cadence;
      this.emit('data', { power: d.power, cadence });
    }
    _onCPResp(dv) {
      const b = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
      if (b[0] !== 0x80) return;
      const names = { 1: '成功', 2: '非対応', 3: 'パラメータ不正', 4: '失敗', 5: '制御権なし' };
      log(`CP応答 op=0x${b[1].toString(16)} → ${names[b[2]] || b[2]}`);
      if (b[2] === 0x05) this._needControl = true;
      if (this._pending && this._pending.op === b[1]) {
        this._pending.resolve(b[2] === 0x01);
        this._pending = null;
      }
    }
    _cpWrite(bytes, label) {
      const job = async () => {
        if (!this.cp) return false;
        const data = new Uint8Array(bytes);
        const wait = new Promise((resolve) => {
          this._pending = { op: bytes[0], resolve };
          setTimeout(() => { if (this._pending && this._pending.resolve === resolve) { this._pending = null; resolve(null); } }, 2500);
        });
        try {
          if (this.cp.writeValueWithResponse) await this.cp.writeValueWithResponse(data);
          else await this.cp.writeValue(data);
        } catch (e) {
          log(`CP書込失敗 ${label}: ${e.message}`);
          if (this._pending) { this._pending.resolve(false); this._pending = null; }
          return false;
        }
        log(`→ ${label}`);
        return wait;
      };
      const p = this._q.then(job, job);
      this._q = p.catch(() => {});
      return p;
    }
    setErg(watts) {
      let w = Math.round(watts);
      if (this.powerRange) w = Math.max(this.powerRange.min || 0, Math.min(this.powerRange.max || 2000, w));
      this.mode = { type: 'erg', watts: Math.max(0, w) };
      this._pump();
    }
    setSim(grade) {
      this.mode = { type: 'sim', grade: Math.max(-10, Math.min(20, grade)) };
      this._pump();
    }
    _key(m) { return m.type === 'erg' ? `e${m.watts}` : m.type === 'sim' ? `s${m.grade.toFixed(1)}` : 'n'; }
    async _pump() {
      if (this._pumping) return;
      this._pumping = true;
      let retries = 0;
      try {
        while (this.state === 'connected' && this.cp && this.controllable && this._key(this.mode) !== this._sent) {
          if (this._needControl) {
            this._needControl = false;
            if (++retries > 3) { log('制御権を取得できません'); break; }
            await this._cpWrite([0x00], 'Request Control');
          }
          const m = { ...this.mode };
          const k = this._key(m);
          let ok = true;
          if (m.type === 'erg') {
            const v = m.watts;
            ok = await this._cpWrite([0x05, v & 0xff, (v >> 8) & 0xff], `ERG ${v}W`);
          } else if (m.type === 'sim') {
            const g = Math.round(m.grade * 100);
            const gg = g < 0 ? g + 65536 : g;
            ok = await this._cpWrite([0x11, 0, 0, gg & 0xff, (gg >> 8) & 0xff, 40, 51], `勾配 ${m.grade.toFixed(1)}%`);
          }
          if (ok === false && this._needControl) continue;
          this._sent = k;
          await sleep(250);
        }
      } finally {
        this._pumping = false;
      }
    }
  }

  /* ---------- heart rate monitor ---------- */
  class HeartRate extends BleDevice {
    constructor() { super('心拍計'); }
    pick() { return super.pick({ filters: [{ services: [S.HR] }], optionalServices: [S.DIS] }); }
    async _setup(server) {
      const svc = await server.getPrimaryService(S.HR);
      const ch = await svc.getCharacteristic(C.HRM);
      if (!ch._rtHooked) {
        ch.addEventListener('characteristicvaluechanged', (ev) => {
          const hr = parseHeartRate(ev.target.value);
          if (hr != null) this.emit('data', { hr });
        });
        ch._rtHooked = true;
      }
      await ch.startNotifications();
    }
  }

  /* ---------- simulators (for trying the app without hardware) ---------- */
  class SimTrainer extends Emitter {
    constructor() {
      super();
      this.state = 'idle'; this.name = 'シミュレーター'; this.kind = 'sim'; this.controllable = true;
      this.mode = { type: 'none' }; this.effort = 160; this.pedaling = true; this._p = 0; this._timer = null;
    }
    pick() {
      this.state = 'connected'; this.emit('state', 'connected'); log('シミュレーター: 接続');
      clearInterval(this._timer);
      this._timer = setInterval(() => this._tick(), 500);
      return Promise.resolve();
    }
    disconnect() { clearInterval(this._timer); this.state = 'idle'; this.emit('state', 'idle'); }
    setErg(w) { this.mode = { type: 'erg', watts: Math.round(w) }; }
    setSim(g) { this.mode = { type: 'sim', grade: g }; }
    _tick() {
      let target = 0;
      if (this.pedaling) target = this.mode.type === 'erg' ? this.mode.watts : this.effort + (this.mode.type === 'sim' ? this.mode.grade * 12 : 0);
      this._p += (target - this._p) * 0.35;
      const p = this.pedaling ? Math.max(0, Math.round(this._p + (Math.random() - 0.5) * 10)) : 0;
      const cad = this.pedaling ? Math.round(86 + Math.sin(Date.now() / 9000) * 5 + (Math.random() - 0.5) * 3) : 0;
      this.emit('data', { power: p, cadence: cad });
    }
  }

  class SimHR extends Emitter {
    constructor(getPowerPct) {
      super();
      this.state = 'idle'; this.name = 'シミュ心拍'; this._hr = 70; this._get = getPowerPct; this._timer = null;
    }
    pick() {
      this.state = 'connected'; this.emit('state', 'connected');
      clearInterval(this._timer);
      this._timer = setInterval(() => {
        const pct = this._get();
        const target = Math.min(192, 62 + pct * 105);
        this._hr += (target - this._hr) * 0.04;
        this.emit('data', { hr: Math.round(this._hr + (Math.random() - 0.5) * 2) });
      }, 1000);
      return Promise.resolve();
    }
    disconnect() { clearInterval(this._timer); this.state = 'idle'; this.emit('state', 'idle'); }
  }

  return {
    S, C, log, logBuf, logListeners, available,
    parseIndoorBikeData, parseCyclingPower, parseHeartRate,
    Trainer, HeartRate, SimTrainer, SimHR,
  };
})();
if (typeof module !== 'undefined') module.exports = BLE;
