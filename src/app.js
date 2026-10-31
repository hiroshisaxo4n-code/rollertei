/* ============================================================
   ローラー亭 — app controller
   ============================================================ */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmtClock = (sec) => {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  };
  const fmtDur = (sec) => {
    const m = Math.round(sec / 60);
    return m >= 60 ? `${Math.floor(m / 60)}時間${m % 60 ? `${m % 60}分` : ''}` : `${m}分`;
  };
  const fmtMS = (sec) => { const m = Math.floor(sec / 60), s = Math.round(sec % 60); return s ? `${m}:${String(s).padStart(2, '0')}` : `${m}分`; };
  const WD = ['日', '月', '火', '水', '木', '金', '土'];
  const fmtDate = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()}（${WD[d.getDay()]}）${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };

  /* ---------- settings ---------- */
  const DEFAULTS = { ftp: 200, weight: 65, bike: 9, maxHR: 185, autoPause: true, sound: true, wake: true, sim: false };
  let cfg = { ...DEFAULTS };
  try { cfg = { ...DEFAULTS, ...JSON.parse(Store.get('rt.cfg') || '{}') }; } catch (e) { /* defaults */ }
  const saveCfg = () => Store.set('rt.cfg', JSON.stringify(cfg));
  const btOK = BLE.available();
  if (!btOK) cfg.sim = true;

  /* ---------- toast / modal ---------- */
  let toastTimer = null;
  function toast(msg, ms = 2400) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }
  function modal(title, bodyHTML, buttons) {
    return new Promise((resolve) => {
      $('#modal-title').textContent = title;
      $('#modal-body').innerHTML = bodyHTML;
      const box = $('#modal-btns'); box.innerHTML = '';
      buttons.forEach((b) => {
        const el = document.createElement('button');
        el.className = `btn ${b.cls || 'outline'}`; el.textContent = b.label;
        el.onclick = () => { $('#modal').hidden = true; resolve(b.value); };
        box.appendChild(el);
      });
      $('#modal').hidden = false;
    });
  }

  /* ---------- storage for rides ---------- */
  const DB = (() => {
    const mem = new Map();
    let dbp = null;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise((res) => {
        const timer = setTimeout(() => res(null), 2000);
        try {
          const rq = indexedDB.open('rollertei', 1);
          rq.onupgradeneeded = () => rq.result.createObjectStore('rides', { keyPath: 'id' });
          rq.onsuccess = () => { clearTimeout(timer); res(rq.result); };
          rq.onerror = () => { clearTimeout(timer); res(null); };
        } catch (e) { clearTimeout(timer); res(null); }
      });
      return dbp;
    }
    const tx = (db, mode, fn) => new Promise((res, rej) => {
      const t = db.transaction('rides', mode); const st = t.objectStore('rides');
      const rq = fn(st); t.oncomplete = () => res(rq && rq.result); t.onerror = () => rej(t.error);
    });
    return {
      async put(r) { mem.set(r.id, r); const db = await open(); if (db) await tx(db, 'readwrite', (s) => s.put(r)); },
      async all() { const db = await open(); if (!db) return [...mem.values()]; try { return await tx(db, 'readonly', (s) => s.getAll()); } catch (e) { return [...mem.values()]; } },
      async get(id) { const db = await open(); if (!db) return mem.get(id); return tx(db, 'readonly', (s) => s.get(id)); },
      async del(id) { mem.delete(id); const db = await open(); if (db) await tx(db, 'readwrite', (s) => s.delete(id)); },
    };
  })();

  /* ---------- navigation ---------- */
  const stack = ['home'];
  function show(name, push = true) {
    $$('.view').forEach((v) => { v.hidden = v.id !== `v-${name}`; });
    if (push && stack[stack.length - 1] !== name) stack.push(name);
    if (name === 'home') homeScene.start(); else homeScene.stop();
    if (name === 'ride') rideScene.start(); else rideScene.stop();
    if (RENDER[name]) RENDER[name]();
  }
  function back() {
    if (stack.length > 1) stack.pop();
    show(stack[stack.length - 1], false);
  }
  function resetTo(name) { stack.length = 0; stack.push('home'); if (name !== 'home') stack.push(name); show(name, false); }

  /* ---------- devices ---------- */
  const live = { power: 0, cadence: 0, hr: 0, tP: 0, tH: 0, buf: [], p3: 0, p5: [] };
  const dev = { trainer: null, hr: null };
  function makeTrainer() {
    const t = cfg.sim ? new BLE.SimTrainer() : new BLE.Trainer();
    t.on('data', (d) => {
      const now = Date.now();
      if (d.power != null) { live.power = Math.max(0, d.power); live.tP = now; }
      if (d.cadence != null) live.cadence = d.cadence;
      if (d.hr && !(dev.hr && dev.hr.state === 'connected')) { live.hr = d.hr; live.tH = now; }
      liveDirty = true;
    });
    t.on('state', renderDevices);
    return t;
  }
  function makeHR() {
    const h = cfg.sim ? new BLE.SimHR(() => live.p3 / cfg.ftp) : new BLE.HeartRate();
    h.on('data', (d) => { live.hr = d.hr; live.tH = Date.now(); liveDirty = true; });
    h.on('state', renderDevices);
    return h;
  }
  async function connect(kind) {
    const wantSim = !!cfg.sim;
    let d = dev[kind];
    if (d && (d.state === 'connected' || d.state === 'reconnecting' || d.state === 'connecting')) {
      const ok = await modal(`${kind === 'trainer' ? 'トレーナー' : '心拍計'}を切断しますか？`, '', [{ label: '切断する', value: true, cls: 'primary' }, { label: 'やめる', value: false }]);
      if (ok) { d.disconnect(); }
      renderDevices();
      return;
    }
    if (!wantSim && !btOK) {
      modal('このブラウザではBluetoothが使えません', '<p>iPhoneでは <b>Bluefy</b>（App Storeの無料アプリ）でこのページを開くと接続できます。機材なしで試すなら、設定の「シミュレーターで試す」をオンにしてください。</p>', [{ label: 'OK', value: 0 }]);
      return;
    }
    if (!d || (wantSim !== (d instanceof BLE.SimTrainer || d instanceof BLE.SimHR))) { d = dev[kind] = kind === 'trainer' ? makeTrainer() : makeHR(); }
    try {
      renderDevices();
      await d.pick();
    } catch (e) {
      if (e && e.name === 'NotFoundError') return; // user closed the chooser
      BLE.log(`接続エラー: ${e && e.message}`);
      toast(`接続できませんでした：${e && e.message ? e.message : e}`, 4000);
    }
    renderDevices();
  }
  const STATE_JA = { idle: '未接続', connecting: '接続中…', connected: '接続済み', reconnecting: '再接続中…' };
  function renderDevices() {
    for (const kind of ['trainer', 'hr']) {
      const el = $(`#dev-${kind}`); const d = dev[kind];
      const st = d ? d.state : 'idle';
      el.classList.toggle('on', st === 'connected');
      el.classList.toggle('wait', st === 'connecting' || st === 'reconnecting');
      let txt = STATE_JA[st];
      if (d && st === 'connected') {
        txt = d.name;
        if (kind === 'trainer' && d.kind === 'cps') txt += '（パワーのみ・負荷制御なし）';
        if (kind === 'trainer' && d.kind === 'ftms' && !d.controllable) txt += '（負荷制御できません）';
      }
      $('[data-status]', el).textContent = txt;
      const b = $('button', el);
      b.textContent = st === 'idle' ? '接続' : '切断';
      b.classList.toggle('off', st !== 'idle');
    }
    const anyOn = ['trainer', 'hr'].some((k) => dev[k] && dev[k].state === 'connected');
    $('#home-live').hidden = !anyOn;
    $('#bt-note').textContent = !btOK
      ? 'このブラウザはBluetoothに対応していないので、シミュレーターで動いています。Saris H3につなぐときは、iPhoneのBluefyでこのページを開いてください。'
      : cfg.sim
      ? 'シミュレーターで動いています。実機につなぐときは設定でオフにしてください。'
      : 'Saris H3とWahooの心拍計は、電源を入れてから「接続」を押してください。';
    if (ride && ride.active) renderControls();
  }

  /* ---------- scenes ---------- */
  const homeScene = new Scene.World($('#home-scene'), { compact: true });
  let worldName = '公園';
  const rideScene = new Scene.World($('#ride-scene'), {
    onTheme: (th) => {
      worldName = th.name;
      $('#r-world span').textContent = th.name;
      $('#r-world i').style.background = Workouts.ZONE_COLORS[rideScene.zone];
      toast(`${th.name}に入った`, 1600);
    },
  });
  function dayFromClock(d = new Date()) {
    const h = d.getHours() + d.getMinutes() / 60;
    const K = [[0, 0.88], [4.5, 0.97], [5.5, 0.02], [7, 0.1], [12, 0.45], [17, 0.6], [18.3, 0.68], [19.3, 0.76], [20.3, 0.82], [24, 0.88]];
    for (let i = 0; i < K.length - 1; i++) {
      if (h >= K[i][0] && h <= K[i + 1][0]) {
        const k = (h - K[i][0]) / (K[i + 1][0] - K[i][0]);
        let a = K[i][1], b = K[i + 1][1]; if (b < a) b += 1;
        return (a + (b - a) * k) % 1;
      }
    }
    return 0.45;
  }

  /* ---------- audio ---------- */
  let actx = null;
  function initAudio() { try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) { actx = null; } }
  function beep(freq = 880, dur = 0.12, vol = 0.25) {
    if (!cfg.sound || !actx) return;
    try {
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = freq; o.type = 'square'; g.gain.value = vol;
      o.connect(g); g.connect(actx.destination);
      const t = actx.currentTime; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* */ }
  }

  /* ---------- keep the screen on ---------- */
  let wakeLock = null;
  async function keepAwake(on) {
    const v = $('#nosleep');
    if (!on || !cfg.wake) {
      try { if (wakeLock) await wakeLock.release(); } catch (e) { /* */ }
      wakeLock = null; try { v.pause(); } catch (e) { /* */ }
      return;
    }
    try {
      if ('wakeLock' in navigator) { wakeLock = await navigator.wakeLock.request('screen'); BLE.log('画面スリープ防止: OK'); return; }
    } catch (e) { BLE.log(`WakeLock不可: ${e.message}`); }
    try { if (!v.src) v.src = NOSLEEP_MP4; await v.play(); BLE.log('画面スリープ防止: 動画方式'); } catch (e) { BLE.log(`画面スリープ防止できず: ${e.message}`); }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && ride && ride.active) keepAwake(true); });

  /* ---------- ride state ---------- */
  let ride = null;
  let liveDirty = false;
  function newRide(workout) {
    const steps = workout ? Workouts.flatten(workout.blocks) : null;
    ride = {
      id: `r${Date.now()}`, active: true, workout, steps, total: steps ? steps.reduce((a, s) => a + s.d, 0) : 0,
      mode: workout ? 'workout' : 'free', freeMode: 'sim', grade: 0, ergW: Math.round(cfg.ftp * 0.6 / 5) * 5,
      started: false, paused: false, autoPaused: false, zero: 0, t: 0, wt: 0, offset: 0, ergOn: true, done: false,
      sm: { ts: [], p: [], hr: [], cad: [], spd: [], dist: [], tgt: [] }, dist: 0, vs: 0, kj: 0, ms: 0, target: null,
      lastStep: -1, startWall: null, name: workout ? workout.name : 'フリーライド', created: Date.now(),
    };
    rideScene.set({ day: 0.06, speed: 0, cadence: 0, intensity: 0.3 });
    rideScene.jumpZone(1); zoneState.ride = 1;
    worldName = '公園'; $('#r-world span').textContent = worldName; $('#r-world i').style.background = Workouts.ZONE_COLORS[1];
    $('#r-start').hidden = false; $('#r-paused').hidden = true;
    initAudio();
    keepAwake(true);
    applyControl();
    resetTo('ride');
    renderControls();
    renderRide();
    if (!dev.trainer || dev.trainer.state !== 'connected') toast('トレーナーが未接続です。ホームで接続できます', 3200);
  }

  function currentStep() { return ride && ride.steps && !ride.done ? Workouts.at(ride.steps, ride.wt) : null; }
  function applyControl() {
    const t = dev.trainer;
    if (!ride) return;
    ride.target = null;
    if (ride.mode === 'workout' && !ride.done) {
      const a = currentStep();
      if (!a) return;
      if (a.step.free || !ride.ergOn) { if (t) t.setSim(0); return; }
      const w = Math.round(cfg.ftp * (a.pct / 100) * (1 + ride.offset / 100));
      ride.target = w;
      if (t) t.setErg(w);
    } else if (ride.freeMode === 'erg') {
      ride.target = ride.ergW; if (t) t.setErg(ride.ergW);
    } else if (t) t.setSim(ride.grade);
  }

  function rideTick(now) {
    if (!ride.started) {
      if (live.power > 0 || live.cadence > 5) {
        ride.started = true; ride.startWall = now; $('#r-start').hidden = true; beep(1046, 0.2);
      } else { applyControl(); return; }
    }
    if (ride.paused) return;
    if (cfg.autoPause && live.power < 20 && live.cadence < 5) {
      ride.zero++;
      if (ride.zero >= 4) {
        if (!ride.autoPaused) { ride.autoPaused = true; $('#r-paused').hidden = false; $('#r-paused').textContent = '一時停止中（ペダルを回すと再開）'; }
        return;
      }
    } else {
      ride.zero = 0;
      if (ride.autoPaused) { ride.autoPaused = false; $('#r-paused').hidden = true; }
    }
    const grade = ride.mode === 'free' && ride.freeMode === 'sim' ? ride.grade : 0;
    const vt = Metrics.speedFromPower(live.power, cfg.weight + cfg.bike, grade);
    ride.vs += (vt - ride.vs) * 0.3;
    if (live.power === 0) ride.vs *= 0.85;
    ride.dist += ride.vs;
    const s = ride.sm;
    s.ts.push(now); s.p.push(Math.round(live.power)); s.hr.push(live.hr || null); s.cad.push(Math.round(live.cadence));
    s.spd.push(Math.round(ride.vs * 36) / 10); s.dist.push(Math.round(ride.dist * 10) / 10); s.tgt.push(ride.target);
    ride.t++;
    ride.kj += live.power / 1000;
    const M = Workouts.MILESTONES;
    while (ride.ms < M.length && ride.kj >= M[ride.ms].k) {
      rideScene.pop(M[ride.ms].e, M[ride.ms].t);
      beep(1318, 0.08, 0.15); setTimeout(() => beep(1568, 0.12, 0.15), 110);
      ride.ms++;
    }
    if (ride.mode === 'workout' && !ride.done) {
      ride.wt++;
      const a = currentStep();
      if (!a) {
        ride.done = true;
        ride.target = null;
        if (dev.trainer) dev.trainer.setSim(0);
        beep(784, 0.15); setTimeout(() => beep(1046, 0.3), 180);
        modal('ワークアウト完了！', '<p>おつかれさまでした。このまま自由に走って、好きなところで「終了」を押してください。</p>', [{ label: 'OK', value: 0, cls: 'primary' }]);
        renderControls();
      } else {
        if (a.i !== ride.lastStep) { if (ride.lastStep >= 0) beep(988, 0.25); ride.lastStep = a.i; }
        else if (a.remain <= 3 && a.remain > 0) beep(660, 0.08, 0.18);
      }
    }
    applyControl();
    if (ride.t % 30 === 0) autosave();
  }

  function autosave() {
    try {
      Store.set('rt.inprogress', JSON.stringify({ id: ride.id, name: ride.name, workoutId: ride.workout && ride.workout.id, start: ride.startWall || ride.created, sm: ride.sm, ftp: cfg.ftp }));
    } catch (e) { /* storage full */ }
  }

  /* ---------- 1 Hz clock ---------- */
  setInterval(() => {
    const now = Date.now();
    if (now - live.tP > 3000) { live.power = 0; live.cadence = 0; }
    if (now - live.tH > 6000) live.hr = 0;
    live.buf.push(live.power); if (live.buf.length > 3) live.buf.shift();
    live.p3 = live.buf.reduce((a, b) => a + b, 0) / live.buf.length;
    live.p5.push(live.power); if (live.p5.length > 5) live.p5.shift();
    if (ride && ride.active) rideTick(now);
    updateScenes();
    renderLive();
    if (ride && ride.active) renderRide();
  }, 1000);
  setInterval(() => { if (liveDirty) { liveDirty = false; renderLive(); if (ride && ride.active) renderRideNumbers(); } }, 250);

  const zoneState = { home: 1, ride: 1 };
  function hystZone(pct, cur) {
    const z = Workouts.zoneOf(pct);
    if (z > cur) return Math.max(cur, Workouts.zoneOf(pct - 3));
    if (z < cur) return Math.min(cur, Workouts.zoneOf(pct + 3));
    return z;
  }
  function updateScenes() {
    const pedaling = live.power > 0 || live.cadence > 5;
    const pct = live.p3 / cfg.ftp;
    const p5 = live.p5.reduce((a, b) => a + b, 0) / Math.max(1, live.p5.length);
    if (!$('#v-home').hidden) {
      const spd = pedaling ? Metrics.speedFromPower(live.p3, cfg.weight + cfg.bike) * 3.6 : 16;
      homeScene.set({ speed: spd, cadence: pedaling ? live.cadence : 70, intensity: pedaling ? pct : 0.4, day: dayFromClock() });
      zoneState.home = pedaling ? hystZone((p5 / cfg.ftp) * 100, zoneState.home) : 1;
      homeScene.setZone(zoneState.home);
      const d = homeScene.day;
      $('#home-note').textContent = d > 0.74 || d < 0.03 ? 'こんばんは。夜のひと漕ぎ、いきますか' : d < 0.2 ? 'おはようございます' : '';
    }
    if (ride && ride.active) {
      const moving = ride.started && !ride.paused && !ride.autoPaused;
      rideScene.set({
        speed: moving ? ride.vs * 3.6 : rideScene.speed * 0.8,
        cadence: moving ? live.cadence : 0,
        intensity: pct,
        day: 0.06 + ride.t / 3600,
      });
      if (moving && p5 > 0) { zoneState.ride = hystZone((p5 / cfg.ftp) * 100, zoneState.ride); rideScene.setZone(zoneState.ride); }
    }
  }

  function renderLive() {
    $$('[data-live]').forEach((el) => {
      const k = el.dataset.live;
      el.textContent = k === 'power' ? Math.round(live.p3) : k === 'cadence' ? Math.round(live.cadence) : (live.hr || '--');
    });
  }

  /* ---------- ride screen ---------- */
  function renderRideNumbers() {
    const p = Math.round(live.p3);
    $('[data-r=power]').textContent = p;
    $('[data-r=hr]').textContent = live.hr || '--';
    $('[data-r=cadence]').textContent = Math.round(live.cadence);
    $('#m-power').style.borderLeftColor = Workouts.ZONE_COLORS[Workouts.zoneOf((live.p3 / cfg.ftp) * 100)];
  }
  function renderRide() {
    if (!ride) return;
    renderRideNumbers();
    $('#r-clock').textContent = fmtClock(ride.t);
    $('[data-r=speed]').textContent = (ride.vs * 3.6).toFixed(1);
    $('[data-r=dist]').textContent = (ride.dist / 1000).toFixed(2);
    $('#r-target').innerHTML = ride.target != null ? `目標<b>${ride.target}</b>W` : (ride.mode === 'free' && ride.freeMode === 'sim' ? `勾配<b>${ride.grade.toFixed(1)}</b>%` : '');
    // step info
    const si = $('#r-step');
    if (ride.mode === 'workout' && !ride.done) {
      const a = currentStep();
      if (a) {
        const nx = ride.steps[a.i + 1];
        const pctTxt = a.step.free ? '自由走' : a.step.p0 === a.step.p1 ? `${Math.round(a.step.p0)}%` : `${Math.round(a.step.p0)}→${Math.round(a.step.p1)}%`;
        si.innerHTML = `<span>このステップ ${esc(pctTxt)}　残り <b>${fmtClock(a.remain)}</b></span><span>${nx ? `次 ${nx.free ? '自由走' : `${Math.round(nx.p0)}%`}（${fmtMS(nx.d)}）` : '最後のステップ'}</span>`;
      }
    } else if (ride.mode === 'workout') {
      si.innerHTML = '<span>ワークアウト完了。自由に走れます</span><span></span>';
    } else {
      si.innerHTML = `<span>フリーライド　${ride.freeMode === 'sim' ? '勾配モード' : 'ワット固定モード'}</span><span>${worldName}</span>`;
    }
    // food
    const kcal = Math.round(ride.kj);
    $('#r-gyoza').textContent = `×${Math.floor(kcal / Workouts.GYOZA)}`;
    $('#r-kcal').textContent = `${kcal} kcal`;
    const nm = Workouts.nextMilestone(kcal);
    const prevK = [...Workouts.MILESTONES].reverse().find((m) => m.k <= kcal);
    if (nm) {
      const from = prevK ? prevK.k : 0;
      $('#r-foodbar').style.width = `${clamp(((kcal - from) / (nm.k - from)) * 100, 0, 100)}%`;
      $('#r-foodnext').textContent = `あと${nm.k - kcal}kcalで ${nm.e} ${nm.t.replace('ぶん', '')}`;
    } else { $('#r-foodbar').style.width = '100%'; $('#r-foodnext').textContent = '満腹です'; }
    drawStrip();
  }

  function renderControls() {
    if (!ride) return;
    const c = $('#r-controls');
    const btn = (label, act, cls = '') => `<button data-ract="${act}" class="${cls}">${label}</button>`;
    let r1 = btn(ride.paused ? '再開' : '一時停止', 'pause', ride.paused ? 'on' : '');
    let r2 = '';
    if (ride.mode === 'workout' && !ride.done) {
      r1 += btn('スキップ', 'skip') + btn('ERG', 'erg', ride.ergOn ? 'on' : '');
      r2 = btn('−5%', 'minus') + `<div class="val"><small>強度</small>${ride.offset >= 0 ? '+' : ''}${ride.offset}%</div>` + btn('+5%', 'plus');
    } else {
      r1 += btn(ride.freeMode === 'sim' ? 'ワット固定へ' : '勾配モードへ', 'mode');
      r2 = ride.freeMode === 'sim'
        ? btn('−0.5%', 'minus') + `<div class="val"><small>勾配</small>${ride.grade.toFixed(1)}%</div>` + btn('+0.5%', 'plus')
        : btn('−10W', 'minus') + `<div class="val"><small>目標</small>${ride.ergW}W</div>` + btn('+10W', 'plus');
    }
    r1 += btn('終了', 'end', 'end');
    c.innerHTML = `<div class="crow">${r1}</div><div class="crow">${r2}</div>`;
    const sim = dev.trainer instanceof BLE.SimTrainer;
    const sb = $('#r-sim');
    sb.hidden = !sim;
    if (sim) {
      sb.innerHTML = `<span>シミュ</span><button data-ract="sim-ped">${dev.trainer.pedaling ? '止まる' : '漕ぐ'}</button><span>脚力 ${dev.trainer.effort}W</span><button data-ract="sim-down">−20</button><button data-ract="sim-up">+20</button>`;
    }
  }

  $('#v-ride').addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-ract]'); if (!b || !ride) return;
    const a = b.dataset.ract;
    if (a === 'pause') { ride.paused = !ride.paused; $('#r-paused').hidden = !ride.paused; $('#r-paused').textContent = '一時停止中'; }
    else if (a === 'minus' || a === 'plus') {
      const s = a === 'plus' ? 1 : -1;
      if (ride.mode === 'workout' && !ride.done) ride.offset = clamp(ride.offset + 5 * s, -50, 50);
      else if (ride.freeMode === 'sim') ride.grade = clamp(Math.round((ride.grade + 0.5 * s) * 10) / 10, -5, 15);
      else ride.ergW = clamp(ride.ergW + 10 * s, 50, 1000);
      applyControl();
    } else if (a === 'skip') {
      const st = currentStep(); if (st) { ride.wt = st.step.start + st.step.d; ride.lastStep = -1; applyControl(); }
    } else if (a === 'erg') { ride.ergOn = !ride.ergOn; applyControl(); toast(ride.ergOn ? 'ERGオン：目標ワットに自動で合わせます' : 'ERGオフ：負荷は平地相当になります'); }
    else if (a === 'mode') { ride.freeMode = ride.freeMode === 'sim' ? 'erg' : 'sim'; applyControl(); }
    else if (a === 'end') { endRide(); return; }
    else if (a === 'sim-ped') dev.trainer.pedaling = !dev.trainer.pedaling;
    else if (a === 'sim-up') dev.trainer.effort = Math.min(600, dev.trainer.effort + 20);
    else if (a === 'sim-down') dev.trainer.effort = Math.max(40, dev.trainer.effort - 20);
    renderControls(); renderRide();
  });

  async function endRide() {
    const enough = ride.sm.p.length >= 10;
    const choice = await modal('ライドを終了しますか？', enough ? `<p>${fmtClock(ride.t)}・${Math.round(ride.kj)}kcal の記録を保存します。</p>` : '<p>記録が短すぎるため保存されません。</p>',
      enough ? [{ label: '保存して終了', value: 'save', cls: 'primary' }, { label: '続ける', value: 'cancel' }, { label: '保存せずに終了', value: 'discard', cls: 'ghost danger' }]
        : [{ label: '終了する', value: 'discard', cls: 'primary' }, { label: '続ける', value: 'cancel' }]);
    if (choice === 'cancel' || choice == null) return;
    ride.active = false;
    if (dev.trainer) dev.trainer.setSim(0);
    keepAwake(false);
    Store.del('rt.inprogress');
    if (choice === 'discard') { ride = null; resetTo('home'); return; }
    const rec = buildRecord(ride.id, ride.name, ride.workout && ride.workout.id, ride.startWall || ride.created, ride.sm, cfg.ftp, ride.workout && ride.workout.test);
    try { await DB.put(rec); } catch (e) { toast('保存に失敗しました。下のボタンでファイルに書き出してください', 5000); }
    ride = null;
    viewing = rec;
    resetTo('summary');
  }

  function buildRecord(id, name, workoutId, start, sm, ftp, test) {
    const summary = Metrics.summarize(sm, ftp);
    return { id, name, workoutId: workoutId || null, start, ftp, weight: cfg.weight, test: test || null, samples: sm, summary };
  }

  /* ---------- charts ---------- */
  function prepCanvas(cv) {
    const r = cv.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, W: r.width, H: r.height };
  }
  function drawProfile(cv, steps, opts = {}) {
    const { ctx, W, H } = prepCanvas(cv);
    ctx.clearRect(0, 0, W, H);
    if (opts.bg) { ctx.fillStyle = opts.bg; ctx.fillRect(0, 0, W, H); }
    const total = steps.reduce((a, s) => a + s.d, 0) || 1;
    const maxP = Math.max(130, ...steps.map((s) => Math.max(s.p0, s.p1))) * 1.08;
    const X = (t) => (t / total) * W, Y = (p) => H - (p / maxP) * (H - 6);
    for (const s of steps) {
      const x0 = X(s.start), x1 = X(s.start + s.d);
      const n = s.p0 === s.p1 ? 1 : Math.max(2, Math.ceil((x1 - x0) / 3));
      for (let k = 0; k < n; k++) {
        const a = k / n, b = (k + 1) / n;
        const pa = s.free ? 50 : s.p0 + (s.p1 - s.p0) * a, pb = s.free ? 50 : s.p0 + (s.p1 - s.p0) * b;
        ctx.fillStyle = s.free ? '#B8BCC6' : Workouts.ZONE_COLORS[Workouts.zoneOf((pa + pb) / 2)];
        ctx.beginPath(); ctx.moveTo(x0 + (x1 - x0) * a, H); ctx.lineTo(x0 + (x1 - x0) * a, Y(pa)); ctx.lineTo(x0 + (x1 - x0) * b + 0.7, Y(pb)); ctx.lineTo(x0 + (x1 - x0) * b + 0.7, H); ctx.closePath(); ctx.fill();
      }
    }
    // FTP line
    ctx.strokeStyle = opts.dark ? 'rgba(255,255,255,.35)' : 'rgba(34,48,90,.35)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, Y(100)); ctx.lineTo(W, Y(100)); ctx.stroke(); ctx.setLineDash([]);
    if (opts.actual) {
      ctx.strokeStyle = opts.dark ? '#FFFFFF' : '#1D1D1F'; ctx.lineWidth = 1.5; ctx.beginPath();
      opts.actual.forEach((p, i) => { const x = X(i), y = Y((p / cfg.ftp) * 100); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke();
    }
    if (opts.pos != null) {
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(X(opts.pos) - 1, 0, 3, H);
    }
  }
  function drawStrip() {
    const cv = $('#r-strip');
    if (!ride) return;
    if (ride.mode === 'workout') {
      drawProfile(cv, ride.steps, { dark: true, pos: ride.done ? ride.total : ride.wt, bg: '#161F3D', actual: null });
    } else {
      const { ctx, W, H } = prepCanvas(cv);
      ctx.fillStyle = '#161F3D'; ctx.fillRect(0, 0, W, H);
      const p = ride.sm.p.slice(-600);
      const maxP = Math.max(cfg.ftp * 1.3, ...p);
      p.forEach((v, i) => {
        ctx.fillStyle = Workouts.ZONE_COLORS[Workouts.zoneOf((v / cfg.ftp) * 100)];
        const x = (i / 600) * W; const h = (v / maxP) * (H - 4);
        ctx.fillRect(x, H - h, Math.max(1, W / 600 + 0.5), h);
      });
      ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = '11px system-ui'; ctx.fillText('直近10分のパワー', 6, 13);
    }
  }
  function drawRideChart(cv, rec) {
    const { ctx, W, H } = prepCanvas(cv);
    const sm = rec.samples; const n = sm.p.length;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    if (!n) return;
    const maxP = Math.max(rec.ftp * 1.2, ...sm.p) * 1.05;
    const X = (i) => (i / Math.max(1, n - 1)) * W;
    const step = Math.max(1, Math.floor(n / W));
    for (let i = 0; i < n; i += step) {
      let v = 0; for (let k = 0; k < step && i + k < n; k++) v = Math.max(v, sm.p[i + k]);
      ctx.fillStyle = Workouts.ZONE_COLORS[Workouts.zoneOf((v / rec.ftp) * 100)];
      const h = (v / maxP) * (H - 10);
      ctx.fillRect(X(i), H - h, Math.max(1, (W / n) * step + 0.5), h);
    }
    const hrs = sm.hr.filter(Boolean);
    if (hrs.length) {
      const lo = Math.min(...hrs) - 5, hi = Math.max(...hrs) + 5;
      ctx.strokeStyle = '#A81B22'; ctx.lineWidth = 1.6; ctx.beginPath(); let st = false;
      for (let i = 0; i < n; i += step) { const v = sm.hr[i]; if (!v) { st = false; continue; } const y = H - ((v - lo) / (hi - lo)) * (H - 14) - 4; if (st) ctx.lineTo(X(i), y); else { ctx.moveTo(X(i), y); st = true; } }
      ctx.stroke();
    }
    ctx.fillStyle = '#4b5a40'; ctx.font = '11px system-ui';
    ctx.fillText('パワー（色＝ゾーン）', 6, 13);
    if (hrs.length) { ctx.fillStyle = '#A81B22'; ctx.fillText('心拍', 120, 13); }
  }

  /* ---------- views ---------- */
  let selected = null;   // workout being viewed
  let editing = null;    // workout being edited
  let viewing = null;    // ride record being viewed

  function miniBars(steps) {
    const total = steps.reduce((a, s) => a + s.d, 0) || 1;
    return steps.map((s) => {
      const p = s.free ? 50 : (s.p0 + s.p1) / 2;
      const c = s.free ? '#B8BCC6' : Workouts.ZONE_COLORS[Workouts.zoneOf(p)];
      return `<i style="width:${(s.d / total) * 100}%;height:${clamp((p / 160) * 100, 12, 100)}%;background:${c}"></i>`;
    }).join('');
  }

  const RENDER = {
    home() { renderDevices(); },
    workouts() {
      const custom = Workouts.loadCustom();
      const item = (w) => {
        const steps = Workouts.flatten(w.blocks);
        return `<li><button class="item" data-wid="${esc(w.id)}"><div class="item-name">${esc(w.name)}</div>
          <div class="item-meta"><span>${fmtDur(Workouts.duration(w.blocks))}</span><span>TSS 約${Workouts.estimateTSS(w.blocks)}</span></div>
          <div class="mini">${miniBars(steps)}</div></button></li>`;
      };
      let h = '<li class="section-head">定番メニュー</li>' + Workouts.builtins.map(item).join('');
      h += '<li class="section-head">自分で作ったもの</li>' + (custom.length ? custom.map(item).join('') : '<li class="empty">まだありません。「新しく作る」か、ZWOファイルを読み込んでください。</li>');
      $('#wk-list').innerHTML = h;
    },
    wdetail() {
      const w = selected; if (!w) return;
      const isBuiltin = w.id.startsWith('b-');
      $('#wd-title').textContent = w.name;
      $('#wd-desc').textContent = w.desc || '';
      const steps = Workouts.flatten(w.blocks);
      requestAnimationFrame(() => drawProfile($('#wd-profile'), steps));
      const dur = Workouts.duration(w.blocks);
      const kj = Math.round(steps.reduce((a, s) => a + (s.free ? 50 : (s.p0 + s.p1) / 2) / 100 * cfg.ftp * s.d, 0) / 1000);
      $('#wd-facts').innerHTML = `<div><dt>時間</dt><dd>${fmtDur(dur)}</dd></div><div><dt>TSS目安</dt><dd>${Workouts.estimateTSS(w.blocks)}</dd></div><div><dt>食べもの目安</dt><dd>${kj >= 500 ? `🍜${(kj / 500).toFixed(1)}` : `🥟${Math.round(kj / 40)}`}</dd></div>`;
      $('#wd-steps').innerHTML = w.blocks.map((b) => {
        let txt = '', p = 50, d = 0;
        const W = (pct) => `${Math.round((cfg.ftp * pct) / 100)}W`;
        if (b.t === 'steady') { txt = `${b.p}%（${W(b.p)}）`; p = b.p; d = b.d; }
        else if (b.t === 'ramp') { txt = `${b.p0}→${b.p1}%（${W(b.p0)}→${W(b.p1)}）`; p = (b.p0 + b.p1) / 2; d = b.d; }
        else if (b.t === 'intervals') { txt = `${b.n}回くり返し　${fmtMS(b.d1)} ${b.p1}%（${W(b.p1)}）／ ${fmtMS(b.d2)} ${b.p2}%`; p = b.p1; d = b.n * (b.d1 + b.d2); }
        else { txt = '自由走（ERGなし）'; d = b.d; }
        const c = b.t === 'free' ? '#B8BCC6' : Workouts.ZONE_COLORS[Workouts.zoneOf(p)];
        return `<li><i style="background:${c}"></i><span>${esc(txt)}</span><span>${fmtMS(d)}</span></li>`;
      }).join('');
      $('#wd-edit').hidden = isBuiltin;
      $('#wd-del').hidden = isBuiltin;
    },
    editor() { renderEditor(); },
    ride() { renderControls(); renderRide(); },
    summary() { renderSummary(); },
    async history() {
      const rides = (await DB.all()).sort((a, b) => b.start - a.start);
      if (!rides.length) { $('#hist-list').innerHTML = '<li class="empty">まだ記録がありません。ひと漕ぎしてきましょう。</li>'; return; }
      $('#hist-list').innerHTML = rides.map((r) => {
        const s = r.summary; const f = Workouts.receipt(s.kcal);
        const food = `${f.ramen ? `🍜×${f.ramen} ` : ''}${f.gyoza ? `🥟×${f.gyoza}` : ''}` || '🥟×0';
        return `<li><button class="item" data-rid="${esc(r.id)}"><div class="item-name">${esc(r.name)}</div>
          <div class="item-meta"><span>${fmtDate(r.start)}</span><span>${fmtClock(s.duration)}</span><span>平均${s.avgPower}W</span><span class="food-meta">${food}</span></div></button></li>`;
      }).join('');
    },
    settings() {
      $('#s-ftp').value = cfg.ftp; $('#s-weight').value = cfg.weight; $('#s-bike').value = cfg.bike; $('#s-maxhr').value = cfg.maxHR;
      $('#s-autopause').checked = cfg.autoPause; $('#s-sound').checked = cfg.sound; $('#s-wake').checked = cfg.wake; $('#s-sim').checked = cfg.sim;
      $('#s-sim').disabled = !btOK;
    },
    log() { $('#log-pre').textContent = BLE.logBuf.join('\n') || 'まだログはありません'; },
  };

  /* ---------- summary (receipt) ---------- */
  function renderSummary() {
    const r = viewing; if (!r) return;
    const s = r.summary; const f = Workouts.receipt(s.kcal);
    const rows = [
      ['時間', fmtClock(s.duration)], ['距離（バーチャル）', `${(s.distance / 1000).toFixed(2)} km`],
      ['平均パワー', `${s.avgPower} W`], ['NP', `${s.np} W`], ['最大パワー', `${s.maxPower} W`],
      ['IF / TSS', `${s.IF.toFixed(2)} / ${s.tss}`],
      ['平均心拍 / 最大', s.avgHR ? `${s.avgHR} / ${s.maxHR} bpm` : '—'],
      ['平均ケイデンス', s.avgCad ? `${s.avgCad} rpm` : '—'],
      ['仕事量', `${s.kj} kJ`],
    ];
    const foodItems = [];
    if (f.ramen) foodItems.push(['🍜 ラーメン', `${f.ramen}杯`]);
    if (f.gyoza) foodItems.push(['🥟 餃子', `${f.gyoza}個`]);
    if (!foodItems.length) foodItems.push(['🥟 餃子', 'まだ1個未満']);
    const emojis = '🍜'.repeat(Math.min(f.ramen, 10)) + '🥟'.repeat(Math.min(f.gyoza, 30));
    let ftpBox = '';
    if (r.test === 'ramp' && s.best1m) {
      const est = Math.round(s.best1m * 0.75);
      ftpBox = `<div class="rc-ftp"><div>最高1分パワー ${s.best1m}W → 推定FTP</div><b>${est} W</b><div class="row-btns" style="margin-top:8px"><button class="btn outline" data-sact="set-ftp" data-v="${est}">FTPを${est}Wにする</button></div></div>`;
    }
    $('#sum-body').innerHTML = `
      <div class="receipt">
        <div class="rc-head"><h2>御会計</h2><span>${fmtDate(r.start)}</span></div>
        <div class="rc-name">${esc(r.name)}</div>
        <dl class="rc-rows">${rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>
        <div class="rc-food"><h3>消費カロリー（目安）</h3><div class="total">${s.kcal}<small>kcal</small></div>
          <ul>${foodItems.map(([a, b]) => `<li><span>${a}</span><b>${b}</b></li>`).join('')}</ul>
          <div class="emojis">${emojis}</div></div>
        <canvas class="rc-chart" id="sum-chart"></canvas>
        ${ftpBox}
      </div>
      <div class="sum-actions">
        <button class="btn primary block" data-sact="strava">Stravaにアップする</button>
        <div class="row-btns">
          <button class="btn outline" data-sact="fit">FITを保存</button>
          <button class="btn outline" data-sact="tcx">TCXを保存</button>
          <button class="btn ghost danger" data-sact="delete">削除</button>
        </div>
      </div>`;
    requestAnimationFrame(() => drawRideChart($('#sum-chart'), r));
  }

  const fileBase = (r) => { const d = new Date(r.start); return `rollertei_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`; };
  async function exportFile(blob, filename) {
    if (window.claude && typeof window.claude.use === 'function') {
      modal('プレビューでは保存できません', '<p>このプレビュー画面ではファイルを保存できません。GitHub Pagesなどで公開したページをBluefyで開くと、FITの保存とStravaへのアップロードができます。</p>', [{ label: 'OK', value: 0 }]);
      return false;
    }
    let file = null;
    try { file = new File([blob], filename, { type: blob.type || 'application/octet-stream' }); } catch (e) { /* old webview */ }
    if (file && navigator.canShare && navigator.share) {
      try {
        if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: filename }); return true; }
      } catch (e) { if (e.name === 'AbortError') return false; BLE.log(`share失敗: ${e.message}`); }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); }, 1000);
    setTimeout(() => URL.revokeObjectURL(url), 120000);
    modal('ファイルを保存', `<p>保存画面が出なかったときは、下のリンクを長押しして「ダウンロード」または「リンク先を保存」を選んでください。</p><p><a href="${url}" download="${esc(filename)}">${esc(filename)}</a></p>`, [{ label: '閉じる', value: 0 }]);
    return true;
  }
  const fitBlob = (r) => new Blob([FIT.encode(r)], { type: 'application/octet-stream' });

  $('#v-summary').addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-sact]'); if (!b || !viewing) return;
    const a = b.dataset.sact; const r = viewing;
    if (a === 'fit') exportFile(fitBlob(r), `${fileBase(r)}.fit`);
    else if (a === 'tcx') exportFile(new Blob([FIT.tcx(r)], { type: 'application/vnd.garmin.tcx+xml' }), `${fileBase(r)}.tcx`);
    else if (a === 'strava') {
      const go = await modal('Stravaにアップする', `<ol>
          <li>このあと出る画面で「"ファイル"に保存」を選んで、FITファイルを保存します。</li>
          <li>Safariで <a href="https://www.strava.com/upload/select" target="_blank" rel="noopener">strava.com/upload/select</a> を開いてログインします。スマホ用の画面になったら、アドレスバーの「ぁあ」から「デスクトップ用Webサイトを表示」を選びます。</li>
          <li>「ファイルを選択」で保存したFITを選ぶと、アップロードされます。</li></ol>
          <p class="note">Strava無料会員はAPIを使えないため、この手動アップロードの方法にしています。</p>`,
        [{ label: 'FITを保存する', value: 'fit', cls: 'primary' }, { label: '閉じる', value: 0 }]);
      if (go === 'fit') exportFile(fitBlob(r), `${fileBase(r)}.fit`);
    } else if (a === 'delete') {
      const ok = await modal('この記録を削除しますか？', '<p>削除すると元に戻せません。</p>', [{ label: '削除する', value: true, cls: 'primary' }, { label: 'やめる', value: false }]);
      if (ok) { await DB.del(r.id); viewing = null; toast('削除しました'); resetTo('history'); }
    } else if (a === 'set-ftp') {
      cfg.ftp = parseInt(b.dataset.v, 10); saveCfg(); toast(`FTPを${cfg.ftp}Wにしました`);
    }
  });

  /* ---------- editor ---------- */
  const BLOCK_NAMES = { steady: '一定', ramp: 'ランプ', intervals: 'インターバル', free: '自由走' };
  function renderEditor() {
    const w = editing; if (!w) return;
    $('#ed-name').value = w.name; $('#ed-desc').value = w.desc || '';
    const num = (k, v, unit, i, step = 1) => `<label><input type="number" inputmode="numeric" step="${step}" data-i="${i}" data-k="${k}" value="${v}">${unit}</label>`;
    const dur = (k, sec, i) => num(`${k}_m`, Math.floor(sec / 60), '分', i) + num(`${k}_s`, sec % 60, '秒', i);
    $('#ed-blocks').innerHTML = w.blocks.map((b, i) => {
      const p = b.t === 'steady' ? b.p : b.t === 'ramp' ? b.p1 : b.t === 'intervals' ? b.p1 : 50;
      const c = b.t === 'free' ? '#B8BCC6' : Workouts.ZONE_COLORS[Workouts.zoneOf(p)];
      let row = '';
      if (b.t === 'steady') row = dur('d', b.d, i) + num('p', b.p, '%', i);
      else if (b.t === 'ramp') row = dur('d', b.d, i) + num('p0', b.p0, '%から', i) + num('p1', b.p1, '%へ', i);
      else if (b.t === 'intervals') row = num('n', b.n, '回', i) + `<span style="width:100%">オン</span>` + dur('d1', b.d1, i) + num('p1', b.p1, '%', i) + `<span style="width:100%">オフ</span>` + dur('d2', b.d2, i) + num('p2', b.p2, '%', i);
      else row = dur('d', b.d, i);
      return `<li class="blk" style="border-left-color:${c}"><div class="blk-head"><b>${BLOCK_NAMES[b.t]}</b>
        <button data-mv="${i}" data-dir="-1" aria-label="上へ">↑</button><button data-mv="${i}" data-dir="1" aria-label="下へ">↓</button><button data-rm="${i}" aria-label="削除">✕</button></div>
        <div class="blk-row">${row}</div></li>`;
    }).join('') || '<li class="empty">下のボタンでブロックを追加してください</li>';
    edPreview();
  }
  function edPreview() {
    const w = editing;
    const steps = Workouts.flatten(w.blocks);
    drawProfile($('#ed-profile'), steps.length ? steps : [{ start: 0, d: 1, p0: 0, p1: 0 }]);
    $('#ed-sum').textContent = `合計 ${fmtDur(Workouts.duration(w.blocks))}　TSS 約${Workouts.estimateTSS(w.blocks)}　（FTP ${cfg.ftp}W）`;
  }
  $('#ed-blocks').addEventListener('input', (ev) => {
    const el = ev.target; if (!el.dataset.k) return;
    const b = editing.blocks[+el.dataset.i]; const k = el.dataset.k; const v = Math.max(0, parseFloat(el.value) || 0);
    const m = k.match(/^(d\d?)_(m|s)$/);
    if (m) { const cur = b[m[1]] || 0; b[m[1]] = m[2] === 'm' ? Math.round(v) * 60 + (cur % 60) : Math.floor(cur / 60) * 60 + clamp(Math.round(v), 0, 59); }
    else b[k] = k === 'n' ? clamp(Math.round(v), 1, 50) : clamp(Math.round(v), 0, 300);
    edPreview();
  });
  $('#ed-blocks').addEventListener('click', (ev) => {
    const mv = ev.target.closest('[data-mv]'); const rm = ev.target.closest('[data-rm]');
    if (mv) { const i = +mv.dataset.mv, j = i + +mv.dataset.dir; const B = editing.blocks; if (j >= 0 && j < B.length) { [B[i], B[j]] = [B[j], B[i]]; renderEditor(); } }
    if (rm) { editing.blocks.splice(+rm.dataset.rm, 1); renderEditor(); }
  });
  $('.add-row').addEventListener('click', (ev) => {
    const t = ev.target.dataset.add; if (!t) return;
    const nb = { steady: { t, d: 300, p: 70 }, ramp: { t, d: 300, p0: 50, p1: 75 }, intervals: { t, n: 4, d1: 60, p1: 110, d2: 60, p2: 50 }, free: { t, d: 300 } }[t];
    editing.blocks.push(nb); renderEditor();
    requestAnimationFrame(() => { const s = $('#v-editor .scroll'); s.scrollTop = s.scrollHeight; });
  });
  $('#ed-name').addEventListener('input', (e) => { editing.name = e.target.value; });
  $('#ed-desc').addEventListener('input', (e) => { editing.desc = e.target.value; });

  /* ---------- settings ---------- */
  $('#v-settings').addEventListener('change', (ev) => {
    const id = ev.target.id;
    const n = (v, a, b, d) => { const x = parseFloat(v); return Number.isFinite(x) ? clamp(x, a, b) : d; };
    if (id === 's-ftp') cfg.ftp = Math.round(n(ev.target.value, 50, 600, cfg.ftp));
    if (id === 's-weight') cfg.weight = n(ev.target.value, 20, 200, cfg.weight);
    if (id === 's-bike') cfg.bike = n(ev.target.value, 3, 30, cfg.bike);
    if (id === 's-maxhr') cfg.maxHR = Math.round(n(ev.target.value, 100, 230, cfg.maxHR));
    if (id === 's-autopause') cfg.autoPause = ev.target.checked;
    if (id === 's-sound') cfg.sound = ev.target.checked;
    if (id === 's-wake') cfg.wake = ev.target.checked;
    if (id === 's-sim') {
      cfg.sim = ev.target.checked;
      for (const k of ['trainer', 'hr']) { if (dev[k]) dev[k].disconnect(); dev[k] = null; }
    }
    saveCfg(); RENDER.settings();
  });
  $('#restore-input').addEventListener('change', async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const rides = Array.isArray(data.rides) ? data.rides : [];
      for (const r of rides) if (r && r.id && r.samples && r.summary) await DB.put(r);
      if (Array.isArray(data.workouts)) data.workouts.forEach((w) => w && w.id && w.blocks && Workouts.upsert(w));
      toast(`${rides.length}件の記録を読み込みました`);
    } catch (e) { toast('読み込めませんでした：バックアップのファイルか確認してください', 4000); }
    ev.target.value = '';
  });

  /* ---------- global clicks ---------- */
  document.addEventListener('click', async (ev) => {
    const go = ev.target.closest('[data-go]'); if (go) { show(go.dataset.go); return; }
    if (ev.target.closest('[data-back]')) { back(); return; }
    const wi = ev.target.closest('[data-wid]'); if (wi) { selected = Workouts.get(wi.dataset.wid); show('wdetail'); return; }
    const ri = ev.target.closest('[data-rid]'); if (ri) { viewing = await DB.get(ri.dataset.rid); show('summary'); return; }
    const act = ev.target.closest('[data-act]'); if (!act) return;
    const a = act.dataset.act;
    if (a === 'connect-trainer') connect('trainer');
    else if (a === 'connect-hr') connect('hr');
    else if (a === 'free-ride') newRide(null);
    else if (a === 'ride-workout' && selected) newRide(selected);
    else if (a === 'new-workout') { editing = { id: `c-${Date.now()}`, name: '新しいワークアウト', desc: '', blocks: [{ t: 'ramp', d: 600, p0: 45, p1: 75 }, { t: 'steady', d: 600, p: 85 }, { t: 'ramp', d: 300, p0: 60, p1: 40 }] }; show('editor'); }
    else if (a === 'edit-workout' && selected) { editing = JSON.parse(JSON.stringify(selected)); show('editor'); }
    else if (a === 'copy-workout' && selected) { editing = JSON.parse(JSON.stringify(selected)); editing.id = `c-${Date.now()}`; editing.name = `${selected.name}（コピー）`; delete editing.test; show('editor'); }
    else if (a === 'delete-workout' && selected) {
      const ok = await modal(`「${selected.name}」を削除しますか？`, '', [{ label: '削除する', value: true, cls: 'primary' }, { label: 'やめる', value: false }]);
      if (ok) { Workouts.remove(selected.id); selected = null; back(); }
    } else if (a === 'save-workout' && editing) {
      if (!editing.blocks.length) { toast('ブロックを1つ以上追加してください'); return; }
      editing.name = (editing.name || '').trim() || '名前のないワークアウト';
      Workouts.upsert(editing); selected = Workouts.get(editing.id); toast('保存しました');
      stack.pop(); if (stack[stack.length - 1] === 'wdetail') show('wdetail', false); else { stack.push('wdetail'); show('wdetail', false); }
    } else if (a === 'backup') {
      const rides = await DB.all();
      const blob = new Blob([JSON.stringify({ app: 'rollertei', v: 1, exported: Date.now(), rides, workouts: Workouts.loadCustom() })], { type: 'application/json' });
      const d = new Date();
      exportFile(blob, `rollertei_backup_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`);
    } else if (a === 'copy-log') {
      try { await navigator.clipboard.writeText(BLE.logBuf.join('\n')); toast('コピーしました'); } catch (e) { toast('コピーできませんでした。長押しで選択してください'); }
    }
  });
  $('#zwo-input').addEventListener('change', async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    try { const w = Workouts.parseZWO(await f.text()); Workouts.upsert(w); selected = w; toast(`「${w.name}」を読み込みました`); show('wdetail'); }
    catch (e) { toast(e.message, 4000); }
    ev.target.value = '';
  });
  BLE.logListeners.add(() => { if (!$('#v-log').hidden) RENDER.log(); });

  /* ---------- start ---------- */
  show('home', false);
  (async () => {
    const raw = Store.get('rt.inprogress');
    if (!raw) return;
    try {
      const p = JSON.parse(raw);
      if (!p.sm || p.sm.p.length < 10) { Store.del('rt.inprogress'); return; }
      const ok = await modal('途中のライドがあります', `<p>${fmtDate(p.start)} の「${esc(p.name)}」（${fmtClock(p.sm.p.length)}）が保存されずに終わっています。記録として保存しますか？</p>`,
        [{ label: '保存する', value: true, cls: 'primary' }, { label: '捨てる', value: false }]);
      Store.del('rt.inprogress');
      if (ok) {
        const rec = buildRecord(p.id, p.name, p.workoutId, p.start, p.sm, p.ftp || cfg.ftp, null);
        await DB.put(rec); viewing = rec; show('summary');
      }
    } catch (e) { Store.del('rt.inprogress'); }
  })();

  // test hook
  window.__rt = { cfg, live, get ride() { return ride; }, dev, homeScene, rideScene, show, newRide, DB, endRide };
})();
