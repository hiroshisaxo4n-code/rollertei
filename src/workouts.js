/* ============================================================
   Workouts: blocks in %FTP, built-in menu, ZWO import, foods
   ============================================================ */
const Workouts = (() => {
  const s = (d, p) => ({ t: 'steady', d, p });
  const r = (d, p0, p1) => ({ t: 'ramp', d, p0, p1 });
  const iv = (n, d1, p1, d2, p2) => ({ t: 'intervals', n, d1, p1, d2, p2 });

  const rampTestSteps = [];
  for (let p = 50; p <= 160; p += 6) rampTestSteps.push(s(60, p));

  const builtins = [
    { id: 'b-first', name: 'ウォームアップ20分', desc: 'まずは軽く20分。接続とERGの動きを確かめるのにちょうどいい。', blocks: [r(300, 45, 65), s(600, 65), r(300, 60, 40)] },
    { id: 'b-recovery', name: '回復ライド', desc: '脚を回すだけの30分。疲れている日に。', blocks: [r(300, 40, 55), s(1200, 55), r(300, 55, 40)] },
    { id: 'b-ss', name: 'スイートスポット 2×10分', desc: 'FTPの90%で10分を2本。効率よく地脚をつくる定番。', blocks: [r(600, 45, 75), iv(2, 600, 90, 300, 55), r(300, 55, 40)] },
    { id: 'b-pyramid', name: 'ピラミッド', desc: '2分ごとに強度が上がって、また下がる。', blocks: [r(480, 45, 70), s(120, 80), s(120, 90), s(120, 100), s(120, 110), s(120, 100), s(120, 90), s(120, 80), r(480, 60, 40)] },
    { id: 'b-ou', name: 'オーバーアンダー 3セット', desc: '95%と105%を行き来する。閾値の粘りを鍛える。', blocks: [r(600, 45, 75), iv(3, 120, 95, 60, 105), s(240, 55), iv(3, 120, 95, 60, 105), s(240, 55), iv(3, 120, 95, 60, 105), r(360, 60, 40)] },
    { id: 'b-vo2', name: 'VO2max 5×3分', desc: '115%で3分を5本。きついけど伸びる。', blocks: [r(600, 45, 75), s(180, 85), s(120, 55), iv(5, 180, 115, 180, 50), r(300, 55, 40)] },
    { id: 'b-sprint', name: '30秒スプリント×10', desc: '150%で30秒、90秒休む。短く鋭く。', blocks: [r(600, 45, 75), iv(10, 30, 150, 90, 50), r(600, 60, 40)] },
    { id: 'b-ramp', name: 'ランプテスト（FTP測定）', desc: '1分ごとに6%ずつ上がる。限界まで回して終了ボタン。最高1分パワーの75%を新しいFTPとして提案します。', test: 'ramp', blocks: [s(300, 45), ...rampTestSteps] },
  ];

  function flatten(blocks) {
    const out = [];
    let t = 0;
    const push = (d, p0, p1, free) => { if (d > 0) { out.push({ start: t, d, p0, p1, free: !!free }); t += d; } };
    for (const b of blocks) {
      if (b.t === 'steady') push(b.d, b.p, b.p);
      else if (b.t === 'ramp') push(b.d, b.p0, b.p1);
      else if (b.t === 'free') push(b.d, 0, 0, true);
      else if (b.t === 'intervals') for (let i = 0; i < b.n; i++) { push(b.d1, b.p1, b.p1); push(b.d2, b.p2, b.p2); }
    }
    return out;
  }
  const duration = (blocks) => flatten(blocks).reduce((a, x) => a + x.d, 0);

  function at(steps, t) {
    for (let i = 0; i < steps.length; i++) {
      const st = steps[i];
      if (t < st.start + st.d) {
        const k = st.d ? (t - st.start) / st.d : 0;
        return { i, step: st, pct: st.p0 + (st.p1 - st.p0) * k, remain: st.start + st.d - t };
      }
    }
    return null;
  }

  function estimateTSS(blocks) {
    const steps = flatten(blocks);
    let acc = 0, n = 0;
    for (const st of steps) for (let k = 0; k < st.d; k++) {
      const p = st.free ? 60 : st.p0 + (st.p1 - st.p0) * (k / st.d);
      acc += Math.pow(p / 100, 4); n++;
    }
    if (!n) return 0;
    const IF = Math.pow(acc / n, 0.25);
    return Math.round((n * IF * IF) / 36);
  }

  function zoneOf(pct) {
    if (pct < 55) return 1; if (pct < 76) return 2; if (pct < 91) return 3;
    if (pct < 106) return 4; if (pct < 121) return 5; return 6;
  }
  const ZONE_COLORS = ['#8E9AAF', '#8E9AAF', '#3D7DD8', '#3FA34D', '#F2B705', '#F07B12', '#D7262E'];

  function parseZWO(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('ZWOファイルを読み込めませんでした');
    const num = (el, ...names) => { for (const n of names) { const v = el.getAttribute(n); if (v != null && v !== '') return parseFloat(v); } return NaN; };
    const pct = (x) => Math.round((x > 5 ? x : x * 100));
    const blocks = [];
    const wk = doc.querySelector('workout');
    if (!wk) throw new Error('<workout> が見つかりません');
    for (const el of Array.from(wk.children)) {
      const tag = el.tagName.toLowerCase();
      const d = Math.round(num(el, 'Duration', 'duration'));
      if (tag === 'steadystate') blocks.push(s(d, pct(num(el, 'Power', 'power', 'PowerLow'))));
      else if (tag === 'warmup' || tag === 'cooldown' || tag === 'ramp') blocks.push(r(d, pct(num(el, 'PowerLow', 'powerlow')), pct(num(el, 'PowerHigh', 'powerhigh'))));
      else if (tag === 'intervalst') {
        blocks.push(iv(Math.round(num(el, 'Repeat', 'repeat')) || 1,
          Math.round(num(el, 'OnDuration')), pct(num(el, 'OnPower', 'PowerOnHigh', 'PowerOnLow')),
          Math.round(num(el, 'OffDuration')), pct(num(el, 'OffPower', 'PowerOffLow', 'PowerOffHigh'))));
      } else if (tag === 'freeride' || tag === 'maxeffort') blocks.push({ t: 'free', d });
    }
    if (!blocks.length) throw new Error('ブロックが1つもありません');
    const name = (doc.querySelector('name') || {}).textContent || '読み込んだワークアウト';
    const desc = (doc.querySelector('description') || {}).textContent || '';
    return { id: `c-${Date.now()}`, name: name.trim(), desc: desc.trim().slice(0, 300), blocks };
  }

  /* ---------- food equivalents (目安kcal) ---------- */
  const FOODS = [
    { e: '🍬', n: '飴', u: '粒', k: 15 },
    { e: '🍫', n: 'チョコ', u: 'かけ', k: 30 },
    { e: '🍪', n: 'クッキー', u: '枚', k: 50 },
    { e: '🍌', n: 'バナナ', u: '本', k: 90 },
    { e: '🍡', n: 'みたらし団子', u: '本', k: 120 },
    { e: '🍮', n: 'プリン', u: '個', k: 150 },
    { e: '🍙', n: 'おにぎり', u: '個', k: 180 },
    { e: '🍺', n: '生ビール', u: '杯', k: 200 },
    { e: '🍦', n: 'ソフトクリーム', u: '個', k: 210 },
    { e: '🍩', n: 'ドーナツ', u: '個', k: 250 },
    { e: '🍔', n: 'ハンバーガー', u: '個', k: 260 },
    { e: '🍢', n: '焼きまんじゅう', u: '本', k: 280 },
    { e: '🍰', n: 'ショートケーキ', u: '個', k: 330 },
    { e: '🍟', n: 'フライドポテトM', u: '個', k: 410 },
    { e: '🍜', n: 'ラーメン', u: '杯', k: 500 },
    { e: '🍣', n: 'にぎり寿司', u: '人前', k: 550 },
    { e: '🍝', n: 'ナポリタン', u: '皿', k: 650 },
    { e: '🍱', n: '幕の内弁当', u: '個', k: 700 },
    { e: '🍛', n: 'カレーライス', u: '皿', k: 750 },
    { e: '🍚', n: 'カツ丼', u: '杯', k: 900 },
  ];
  /* foods shown as you ride: one step up the ladder at a time */
  const LADDER = ['飴', 'クッキー', 'バナナ', 'みたらし団子', 'おにぎり', 'ドーナツ', '焼きまんじゅう', 'ショートケーキ', 'フライドポテトM', 'ラーメン', 'ナポリタン', 'カレーライス', 'カツ丼']
    .map((n) => FOODS.find((f) => f.n === n));
  const BIG = ['ラーメン', 'ハンバーガー', '焼きまんじゅう', 'ドーナツ', 'おにぎり', 'バナナ'].map((n) => FOODS.find((f) => f.n === n));
  function level(kcal) {
    if (kcal < 1000) {
      let lv = -1;
      LADDER.forEach((f, i) => { if (kcal >= f.k) lv = i; });
      return lv < 0 ? null : { id: `l${lv}`, f: LADDER[lv], n: 1 };
    }
    const step = Math.floor(kcal / 500);           // a new big food every 500 kcal
    const f = BIG[step % BIG.length];
    return { id: `b${step}`, f, n: Math.max(1, Math.floor(kcal / f.k)) };
  }
  function nextLevelK(kcal) {
    if (kcal < 1000) { const f = LADDER.find((x) => x.k > kcal); return f ? f.k : 1000; }
    return (Math.floor(kcal / 500) + 1) * 500;
  }
  const label = (f, n) => `${f.n}${n}${f.u}`;
  /* a varied combination for the finisher card (stable per seed) */
  function combo(kcal, seed = 1) {
    let x = (Math.imul(seed | 0, 2654435761) ^ 0x9E3779B9) >>> 0 || 1;
    const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return (x % 10000) / 10000; };
    for (let i = 0; i < 5; i++) rnd();
    const out = [];
    let rest = Math.round(kcal);
    while (rest >= 15 && out.length < 4) {
      const c = FOODS.filter((f) => f.k <= rest && !out.some((o) => o.f === f)).sort((a, b) => b.k - a.k);
      if (!c.length) break;
      const f = c[Math.floor(rnd() * Math.min(out.length ? 4 : 3, c.length))];
      const n = Math.max(1, Math.min(Math.floor(rest / f.k), out.length === 0 ? 3 : 2));
      out.push({ f, n }); rest -= f.k * n;
    }
    return out;
  }

  /* ---------- custom workouts storage ---------- */
  const KEY = 'rt.workouts';
  function loadCustom() { try { return JSON.parse(Store.get(KEY) || '[]'); } catch (e) { return []; } }
  function saveCustom(list) { Store.set(KEY, JSON.stringify(list)); }
  function all() { return [...builtins, ...loadCustom()]; }
  function get(id) { return all().find((w) => w.id === id); }
  function upsert(w) { const list = loadCustom(); const i = list.findIndex((x) => x.id === w.id); if (i >= 0) list[i] = w; else list.push(w); saveCustom(list); }
  function remove(id) { saveCustom(loadCustom().filter((w) => w.id !== id)); }

  return {
    builtins, flatten, duration, at, estimateTSS, zoneOf, ZONE_COLORS, parseZWO,
    FOODS, level, nextLevelK, label, combo, all, get, upsert, remove, loadCustom,
  };
})();

/* ============================================================
   Virtual hill-climb course (15 km, ~950 m up, six sections)
   ============================================================ */
const Course = (() => {
  const L = 15000;
  const STAGES = [
    { p: 0.00, key: 'town', name: '麓の町', g: 3.5 },
    { p: 0.12, key: 'cedar', name: '杉並木', g: 6.5 },
    { p: 0.36, key: 'hairpin', name: 'つづら折り', g: 7.5 },
    { p: 0.56, key: 'steep', name: '激坂', g: 10.0 },
    { p: 0.78, key: 'plateau', name: '高原', g: 5.0 },
    { p: 0.93, key: 'lake', name: '湖畔', g: 1.5 },
  ];
  const c01 = (p) => Math.max(0, Math.min(0.99999, p));
  function stageAt(p) { p = c01(p); let i = 0; STAGES.forEach((s, k) => { if (p >= s.p) i = k; }); return i; }
  function gradeAt(p) {
    p = c01(p);
    const i = stageAt(p);
    let g = STAGES[i].g;
    const nx = STAGES[i + 1];
    if (nx && nx.p - p < 0.02) { const k = 1 - (nx.p - p) / 0.02; g += (nx.g - g) * k * k * (3 - 2 * k) * 0.5; }
    if (i > 0 && p - STAGES[i].p < 0.02) { const k = 1 - (p - STAGES[i].p) / 0.02; g += (STAGES[i - 1].g - g) * k * k * (3 - 2 * k) * 0.5; }
    g += Math.sin(p * 97) * 0.9 + Math.sin(p * 31 + 1) * 0.6;
    return Math.max(0.5, Math.round(g * 10) / 10);
  }
  const N = 600, elev = [0];
  for (let k = 1; k <= N; k++) elev[k] = elev[k - 1] + (gradeAt((k - 0.5) / N) / 100) * (L / N);
  const elevAt = (p) => { const x = c01(p) * N, i = Math.floor(x); return elev[i] + (elev[Math.min(N, i + 1)] - elev[i]) * (x - i); };
  return { L, STAGES, stageAt, gradeAt, elevAt, total: elev[N], elev };
})();

/* tiny storage wrapper: survives sandboxes where localStorage throws */
const Store = (() => {
  const mem = {};
  return {
    get(k) { try { const v = localStorage.getItem(k); return v != null ? v : (k in mem ? mem[k] : null); } catch (e) { return k in mem ? mem[k] : null; } },
    set(k, v) { mem[k] = v; try { localStorage.setItem(k, v); } catch (e) { /* memory only */ } },
    del(k) { delete mem[k]; try { localStorage.removeItem(k); } catch (e) { /* */ } },
  };
})();

if (typeof module !== 'undefined') module.exports = { Workouts, Store, Course };
