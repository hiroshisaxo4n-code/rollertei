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
    { id: 'b-first', name: 'はじめの一杯', desc: 'まずは軽く20分。接続とERGの動きを確かめるのにちょうどいい。', blocks: [r(300, 45, 65), s(600, 65), r(300, 60, 40)] },
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

  /* ---------- food equivalents (目安) ---------- */
  const GYOZA = 40;
  const MILESTONES = [
    { k: 40, e: '🥟', t: '餃子1個ぶん' },
    { k: 120, e: '🥟', t: '餃子3個ぶん' },
    { k: 180, e: '🍙', t: 'おにぎり1個ぶん' },
    { k: 240, e: '🥟', t: '餃子1人前ぶん' },
    { k: 330, e: '🍰', t: 'ショートケーキぶん' },
    { k: 500, e: '🍜', t: 'ラーメン1杯ぶん' },
    { k: 740, e: '🍜', t: 'ラーメン＋餃子ぶん' },
    { k: 1000, e: '🍜', t: 'ラーメン2杯ぶん' },
    { k: 1440, e: '🍚', t: 'ラーメン餃子チャーハンぶん' },
    { k: 2000, e: '🏮', t: '店ごといけるぶん' },
  ];
  function nextMilestone(kcal) { return MILESTONES.find((m) => m.k > kcal) || null; }
  /* split kcal into ramen bowls + gyoza pieces for the receipt */
  function receipt(kcal) {
    const ramen = Math.floor(kcal / 500);
    const rest = kcal - ramen * 500;
    const gyoza = Math.floor(rest / GYOZA);
    return { ramen, gyoza, rest: rest - gyoza * GYOZA };
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
    GYOZA, MILESTONES, nextMilestone, receipt, all, get, upsert, remove, loadCustom,
  };
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

if (typeof module !== 'undefined') module.exports = { Workouts, Store };
