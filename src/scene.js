/* ============================================================
   TOUGE scene: a side-on hill climb. Time carries you up the
   course (town → cedars → hairpins → steep wall → plateau → lake);
   effort brings out dancing, wind and the roadside crowd.
   ============================================================ */
const Scene = (() => {
  const TAU = Math.PI * 2;
  const rnd = (i, s) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const H2 = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (a, b, k) => { const A = H2(a), B = H2(b); return '#' + [0, 1, 2].map((i) => Math.round(lerp(A[i], B[i], clamp(k, 0, 1))).toString(16).padStart(2, '0')).join(''); };
  const rgba = (h, a) => { const A = H2(h); return `rgba(${A[0]},${A[1]},${A[2]},${a})`; };

  /* ---------- sky over a day (advances with ride time) ---------- */
  const SKY = [
    { t: 0.00, top: '#27325E', bot: '#E7A585' },
    { t: 0.08, top: '#4C86C6', bot: '#F3D9BE' },
    { t: 0.20, top: '#3F86D0', bot: '#CFE6F1' },
    { t: 0.48, top: '#3A82CF', bot: '#C6E1F0' },
    { t: 0.62, top: '#4D5A93', bot: '#F2A16C' },
    { t: 0.70, top: '#2A2D5C', bot: '#B5677A' },
    { t: 0.78, top: '#0D1433', bot: '#26335F' },
    { t: 0.94, top: '#0D1433', bot: '#26335F' },
    { t: 1.00, top: '#27325E', bot: '#E7A585' },
  ];
  function light(d) {
    d = ((d % 1) + 1) % 1;
    let top = SKY[0].top, bot = SKY[0].bot;
    for (let i = 0; i < SKY.length - 1; i++) {
      const a = SKY[i], b = SKY[i + 1];
      if (d >= a.t && d <= b.t) { const k = (d - a.t) / (b.t - a.t); top = mix(a.top, b.top, k); bot = mix(a.bot, b.bot, k); break; }
    }
    const night = d < 0.05 ? lerp(0.5, 0, d / 0.05) : d < 0.62 ? 0 : d < 0.78 ? (d - 0.62) / 0.16 : d < 0.94 ? 1 : lerp(1, 0.5, (d - 0.94) / 0.06);
    const warm = d < 0.1 ? 1 - d / 0.1 : d > 0.55 && d < 0.72 ? Math.sin(((d - 0.55) / 0.17) * Math.PI) : 0;
    return { d, top, bot, night, warm };
  }
  const tintFn = (L) => (c) => mix(mix(c, '#FF9A5C', L.warm * 0.16), '#0C1430', L.night * 0.62);

  /* ---------- seasons follow the real calendar ---------- */
  function season() {
    const m = new Date().getMonth() + 1;
    if (m >= 3 && m <= 5) return { key: 'spring', leaf: ['#7DB862', '#F2B8C6', '#5E9E4E'], grass: '#8DBB5E', snow: false };
    if (m >= 6 && m <= 8) return { key: 'summer', leaf: ['#3F8E46', '#2F7A3A', '#56A24E'], grass: '#6FA84E', snow: false };
    if (m >= 9 && m <= 11) return { key: 'autumn', leaf: ['#D9622B', '#E8A23A', '#B8322E', '#7E8F3A'], grass: '#C8AE6A', snow: false };
    return { key: 'winter', leaf: ['#8B7B6B', '#A39484', '#6E6258'], grass: '#B7AE93', snow: true };
  }

  const STAGE_KEYS = ['town', 'cedar', 'hairpin', 'steep', 'plateau', 'lake'];

  function tiles(off, tw, W, fn) {
    const a = Math.floor(off / tw) - 1, b = Math.floor((off + W) / tw) + 1;
    for (let i = a; i <= b; i++) fn(i, i * tw - off);
  }
  function ridge(ctx, off, W, H, base, amp, wl, color, seed, sharp = 0) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 6; x += 6) {
      const X = (x + off) / wl;
      let y = 0.5 + 0.28 * Math.sin(X + seed) + 0.14 * Math.sin(X * 2.13 + seed * 2) + 0.07 * Math.sin(X * 4.7 + seed * 3);
      if (sharp) y += sharp * (0.5 - Math.abs(((X * 0.9 + seed) % 2 + 2) % 2 - 1)) * 0.5;
      ctx.lineTo(x, base - amp * y);
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  }
  function cone(ctx, cx, base, h, w, color, snow) {
    ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(cx - w, base);
    ctx.quadraticCurveTo(cx - w * 0.35, base - h * 0.55, cx - w * 0.1, base - h);
    ctx.lineTo(cx + w * 0.1, base - h);
    ctx.quadraticCurveTo(cx + w * 0.35, base - h * 0.55, cx + w, base);
    ctx.closePath(); ctx.fill();
    if (snow) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath();
      ctx.moveTo(cx - w * 0.1, base - h); ctx.lineTo(cx + w * 0.1, base - h);
      ctx.lineTo(cx + w * 0.26, base - h * 0.72); ctx.lineTo(cx + w * 0.08, base - h * 0.78); ctx.lineTo(cx - w * 0.06, base - h * 0.7); ctx.lineTo(cx - w * 0.24, base - h * 0.76);
      ctx.closePath(); ctx.fill();
    }
  }
  function cedar(ctx, x, y, h, c) {
    ctx.fillStyle = c; ctx.beginPath();
    ctx.moveTo(x, y - h); ctx.lineTo(x + h * 0.16, y - h * 0.45); ctx.lineTo(x + h * 0.11, y - h * 0.45);
    ctx.lineTo(x + h * 0.2, y - h * 0.08); ctx.lineTo(x - h * 0.2, y - h * 0.08); ctx.lineTo(x - h * 0.11, y - h * 0.45);
    ctx.lineTo(x - h * 0.16, y - h * 0.45); ctx.closePath(); ctx.fill();
    ctx.fillRect(x - h * 0.02, y - h * 0.1, h * 0.04, h * 0.1);
  }
  function roundTree(ctx, x, y, h, c, trunk) {
    ctx.fillStyle = trunk; ctx.fillRect(x - h * 0.04, y - h * 0.45, h * 0.08, h * 0.45);
    ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y - h * 0.68, h * 0.3, h * 0.34, 0, 0, TAU); ctx.fill();
  }
  function cloud(ctx, x, y, w, c) {
    ctx.fillStyle = c; ctx.beginPath();
    ctx.ellipse(x, y, w * 0.5, w * 0.09, 0, 0, TAU);
    ctx.ellipse(x - w * 0.12, y - w * 0.06, w * 0.24, w * 0.1, 0, 0, TAU);
    ctx.ellipse(x + w * 0.14, y - w * 0.05, w * 0.18, w * 0.08, 0, 0, TAU);
    ctx.fill();
  }

  /* ---------- the six sections ---------- */
  // each draws far + mid layers; e has W,H,hy (horizon), x (world px), t, L (light), T (tint), haze(c,k), S (season)
  const STAGE = {
    town(ctx, e) {
      const { W, H, hy, T, haze } = e;
      ridge(ctx, e.x * 0.03, W, H, hy - 2, H * 0.1, 220, haze('#7F95AB', 0.55), 1.3);
      cone(ctx, W * 0.72 - (e.x * 0.01) % (W * 1.6), hy - 4, H * 0.2, H * 0.26, haze('#6E84A0', 0.6), e.S.snow);
      ridge(ctx, e.x * 0.08, W, H, hy + H * 0.03, H * 0.06, 150, haze('#5F7C70', 0.3), 4.1);
      const top = hy + H * 0.05;
      ctx.fillStyle = T('#86B764'); ctx.fillRect(0, top, W, H - top);
      for (let k = 0; k < 6; k++) { // paddies with water glints
        const y = top + (H * 0.2) * (k / 6);
        ctx.fillStyle = k % 2 ? rgba('#C9E6EE', 0.18 * (1 - e.L.night)) : rgba('#2D5A2A', 0.12);
        ctx.fillRect(0, y, W, H * 0.012 + k * 0.8);
      }
      tiles(e.x * 0.3, 210, W, (i, x) => {
        if (rnd(i, 2) < 0.55) return;
        const hx = x + 80 * rnd(i, 3), hy2 = top + H * 0.045, s = H * lerp(0.07, 0.1, rnd(i, 4));
        ctx.fillStyle = T(rnd(i, 5) > 0.5 ? '#E9E3D6' : '#D7DCE0'); ctx.fillRect(hx - s * 0.6, hy2 - s * 0.5, s * 1.2, s * 0.5);
        ctx.fillStyle = T(rnd(i, 6) > 0.5 ? '#3E4652' : '#6E3B34');
        ctx.beginPath(); ctx.moveTo(hx - s * 0.75, hy2 - s * 0.48); ctx.lineTo(hx - s * 0.45, hy2 - s * 0.85); ctx.lineTo(hx + s * 0.45, hy2 - s * 0.85); ctx.lineTo(hx + s * 0.75, hy2 - s * 0.48); ctx.closePath(); ctx.fill();
        if (e.L.night > 0.4) { ctx.fillStyle = '#FFD27A'; ctx.fillRect(hx - s * 0.3, hy2 - s * 0.36, s * 0.18, s * 0.14); ctx.fillRect(hx + s * 0.12, hy2 - s * 0.36, s * 0.18, s * 0.14); }
      });
      const ph = H * 0.2, tw = 230; // poles and wires
      tiles(e.x * 0.55, tw, W, (i, x) => {
        const px = x + 30, base = top + H * 0.1;
        ctx.strokeStyle = rgba(T('#26313A'), 0.7); ctx.lineWidth = 1;
        for (const k of [0.94, 0.86]) { ctx.beginPath(); ctx.moveTo(px, base - ph * k); ctx.quadraticCurveTo(px + tw / 2, base - ph * k + 12, px + tw, base - ph * k); ctx.stroke(); }
        ctx.fillStyle = T('#4B4038'); ctx.fillRect(px - 2, base - ph, 4, ph);
      });
    },
    cedar(ctx, e) {
      const { W, H, hy, T, haze } = e;
      ridge(ctx, e.x * 0.03, W, H, hy - 6, H * 0.14, 180, haze('#55745F', 0.45), 2.2);
      ridge(ctx, e.x * 0.07, W, H, hy + H * 0.02, H * 0.1, 120, haze('#3C5D49', 0.25), 5.5);
      tiles(e.x * 0.12, 26, W, (i, x) => cedar(ctx, x + 10 * rnd(i, 1), hy + H * 0.06, H * lerp(0.12, 0.17, rnd(i, 2)), haze('#2C5040', 0.18)));
      ctx.fillStyle = T('#24402F'); ctx.fillRect(0, hy + H * 0.05, W, H);
      tiles(e.x * 0.32, 34, W, (i, x) => cedar(ctx, x + 14 * rnd(i, 3), hy + H * 0.2, H * lerp(0.22, 0.32, rnd(i, 4)), T(rnd(i, 5) > 0.5 ? '#1E3D2F' : '#183428')));
      if (e.L.night < 0.6) { // light shafts
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        tiles(e.x * 0.2, 320, W, (i, x) => {
          if (rnd(i, 7) < 0.4) return;
          const g = ctx.createLinearGradient(x, 0, x - 120, H);
          g.addColorStop(0, `rgba(255,236,190,${0.12 * (1 - e.L.night)})`); g.addColorStop(1, 'rgba(255,236,190,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 50, 0); ctx.lineTo(x - 70, H); ctx.lineTo(x - 140, H); ctx.closePath(); ctx.fill();
        });
        ctx.restore();
      }
    },
    hairpin(ctx, e) {
      const { W, H, hy, T, haze } = e;
      ridge(ctx, e.x * 0.02, W, H, hy - H * 0.08, H * 0.12, 260, haze('#8EA2B6', 0.6), 0.7);
      ridge(ctx, e.x * 0.05, W, H, hy - H * 0.01, H * 0.12, 190, haze('#6C8696', 0.45), 3.3);
      // a far slope with the switchbacks you will climb
      const sx = W * 0.62 - (e.x * 0.06) % (W * 1.8), sb = hy + H * 0.04;
      ctx.fillStyle = haze('#58745E', 0.3); ctx.beginPath(); ctx.moveTo(sx - W * 0.35, sb); ctx.quadraticCurveTo(sx, sb - H * 0.3, sx + W * 0.35, sb); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba('#E9ECEF', 0.55 * (1 - e.L.night * 0.6)); ctx.lineWidth = 1.5; ctx.beginPath();
      for (let k = 0; k < 6; k++) { const y = sb - H * 0.03 - k * H * 0.035, w2 = W * (0.22 - k * 0.03); ctx.lineTo(sx + (k % 2 ? w2 : -w2), y); }
      ctx.stroke();
      ctx.fillStyle = T('#4D6A45'); ctx.fillRect(0, hy + H * 0.05, W, H);
      tiles(e.x * 0.3, 48, W, (i, x) => roundTree(ctx, x + 20 * rnd(i, 1), hy + H * 0.16 + rnd(i, 2) * 6, H * lerp(0.12, 0.18, rnd(i, 3)), T(e.S.leaf[Math.floor(rnd(i, 4) * e.S.leaf.length)]), T('#4A3A2C')));
    },
    steep(ctx, e) {
      const { W, H, hy, T, haze } = e;
      ridge(ctx, e.x * 0.03, W, H, hy - H * 0.1, H * 0.2, 150, haze('#6F8090', 0.4), 1.9, 0.6);
      ctx.fillStyle = T('#6E6359'); ctx.beginPath(); ctx.moveTo(0, H); // rock cut
      for (let x = 0; x <= W + 8; x += 8) { const X = (x + e.x * 0.3) / 60; ctx.lineTo(x, hy + H * 0.02 - H * 0.12 * (0.6 + 0.25 * Math.sin(X) + 0.15 * Math.sin(X * 2.7))); }
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(T('#4E453E'), 0.6); ctx.lineWidth = 1;
      for (let k = 0; k < 5; k++) { const y = hy + H * (0.0 + k * 0.035); ctx.beginPath(); ctx.moveTo(0, y); for (let x = 0; x <= W; x += 20) ctx.lineTo(x, y + Math.sin((x + e.x * 0.3) / 40 + k) * 3); ctx.stroke(); }
      tiles(e.x * 0.3, 70, W, (i, x) => { if (rnd(i, 9) > 0.5) roundTree(ctx, x, hy - H * 0.05 + rnd(i, 1) * H * 0.05, H * 0.08, T(e.S.leaf[i & 1 ? 0 : 2] || '#4E7A3E'), T('#3E342A')); });
    },
    plateau(ctx, e) {
      const { W, H, hy, T, haze } = e;
      ridge(ctx, e.x * 0.02, W, H, hy, H * 0.07, 240, haze('#8A9BB4', 0.55), 2.8);
      cone(ctx, W * 0.66 - (e.x * 0.015) % (W * 1.7), hy + 2, H * 0.3, H * 0.34, haze('#5D7393', 0.35), e.S.snow);
      ctx.fillStyle = T(e.S.grass); ctx.fillRect(0, hy + H * 0.02, W, H);
      ctx.strokeStyle = T(mix(e.S.grass, '#FFF3D6', 0.35)); ctx.lineWidth = 1.2; // susuki
      tiles(e.x * 0.35, 9, W, (i, x) => {
        const y = hy + H * (0.06 + rnd(i, 1) * 0.12), h = H * (0.03 + rnd(i, 2) * 0.03), sw = Math.sin(e.t * 1.6 + i * 0.3) * h * 0.25;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + sw * 0.5, y - h * 0.6, x + sw, y - h); ctx.stroke();
      });
      tiles(e.x * 0.6, 60, W, (i, x) => { ctx.fillStyle = T('#7A5E44'); ctx.fillRect(x, hy + H * 0.17, 3, H * 0.04); });
      ctx.fillStyle = T('#7A5E44'); ctx.fillRect(0, hy + H * 0.18, W, 2);
    },
    lake(ctx, e) {
      const { W, H, hy, T, haze } = e;
      ridge(ctx, e.x * 0.02, W, H, hy - 2, H * 0.08, 200, haze('#6D84A0', 0.5), 4.4);
      const cx = W * 0.6 - (e.x * 0.012) % (W * 1.7), mh = H * 0.34, mw = H * 0.4;
      cone(ctx, cx, hy, mh, mw, haze('#4F6B8C', 0.28), e.S.snow);
      const wb = hy + H * 0.16;
      const g = ctx.createLinearGradient(0, hy, 0, wb);
      g.addColorStop(0, T('#5FA3B4')); g.addColorStop(1, T('#2F6E80'));
      ctx.fillStyle = g; ctx.fillRect(0, hy, W, wb - hy);
      ctx.save(); ctx.beginPath(); ctx.rect(0, hy, W, wb - hy); ctx.clip(); ctx.globalAlpha = 0.25; ctx.translate(0, hy * 1.55); ctx.scale(1, -0.55);
      cone(ctx, cx, hy, mh, mw, haze('#4F6B8C', 0.28), false); ctx.restore();
      ctx.strokeStyle = rgba('#FFFFFF', 0.4 * (1 - e.L.night * 0.5)); ctx.lineWidth = 1;
      for (let k = 0; k < 16; k++) { const sx = ((k * 113 - e.x * 0.08 + e.t * 6) % W + W) % W, sy = hy + 4 + ((k * 37) % 100) / 100 * (wb - hy - 6); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 10, sy); ctx.stroke(); }
      ctx.fillStyle = T(e.S.grass); ctx.fillRect(0, wb, W, H);
      tiles(e.x * 0.4, 90, W, (i, x) => { if (rnd(i, 3) > 0.45) roundTree(ctx, x + 30 * rnd(i, 4), wb + H * 0.04, H * lerp(0.1, 0.15, rnd(i, 5)), T(e.S.leaf[Math.floor(rnd(i, 6) * e.S.leaf.length)]), T('#4A3A2C')); });
    },
  };

  class World {
    constructor(canvas, opts = {}) {
      this.c = canvas; this.ctx = canvas.getContext('2d');
      this.compact = !!opts.compact; this.onStage = opts.onStage || null;
      this.x = 0; this.t = 0; this.speed = 0; this.cadence = 0; this.crank = 0; this.wheel = 0;
      this.intensity = 0.4; this.zone = 1; this.day = 0.12; this.p = 0; this.grade = 0; this.ang = 0;
      this.stage = 0; this.prevStage = 0; this.fade = 1; this.finishIn = null; this.startX = 0;
      this.dance = 0; this.parts = []; this.pops = []; this.S = season(); this._raf = null; this.remainKm = null;
      this._stars = Array.from({ length: 80 }, (_, i) => [rnd(i, 1), rnd(i, 2) * 0.6, rnd(i, 3)]);
      this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(canvas); this.resize();
    }
    resize() {
      const r = this.c.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
      this.c.width = Math.round(this.W * dpr); this.c.height = Math.round(this.H * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    set(o) { Object.assign(this, o); }
    restart() { this.x = 0; this.startX = 0; this.stage = this.prevStage = 0; this.fade = 1; this.parts = []; this.pops = []; this.finishIn = null; }
    pop(emoji, text) { this.pops.push({ e: emoji, s: text, t0: this.t }); }
    start() {
      if (this._raf) return;
      let last = performance.now();
      const loop = (now) => { const dt = Math.min(0.05, (now - last) / 1000); last = now; this.frame(dt); this._raf = requestAnimationFrame(loop); };
      this._raf = requestAnimationFrame(loop);
    }
    stop() { if (this._raf) cancelAnimationFrame(this._raf); this._raf = null; }

    frame(dt) {
      const { ctx } = this; const W = this.W, H = this.H;
      this.t += dt;
      const Hl = Math.max(H * 0.5, H - (this.inset || 0)); // layout height above any overlay
      const R = clamp(Hl * (this.compact ? 0.075 : 0.062), 10, 52);
      const pxPerM = (R / 0.335) * 0.5;
      const v = this.speed / 3.6;
      this.x += v * dt * pxPerM;
      this.wheel += (v / 0.335) * dt;
      this.crank += (this.cadence / 60) * TAU * dt;
      if (this.finishIn != null) { this.finishIn -= v * dt; if (this.finishIn < -60) this.finishIn = null; }
      // section
      const st = Course.stageAt(this.p);
      if (st !== this.stage) { this.prevStage = this.stage; this.stage = st; this.fade = 0; if (this.onStage) this.onStage(Course.STAGES[st]); }
      if (this.fade < 1) this.fade = Math.min(1, this.fade + dt / 2.2);
      // road tilt follows the gradient (exaggerated for readability)
      const target = Math.atan((this.grade / 100) * 2.4);
      this.ang += (clamp(target, -0.1, 0.27) - this.ang) * Math.min(1, dt * 1.5);
      const wantDance = this.cadence > 20 && (this.intensity > 1.12 || (this.grade > 9 && this.intensity > 0.9)) ? 1 : 0;
      this.dance += (wantDance - this.dance) * Math.min(1, dt * 3);

      const L = light(this.day);
      const e = {
        W, H, R, t: this.t, x: this.x, L, T: tintFn(L), S: this.S, pxPerM,
        Hl, hy: Hl * (this.compact ? 0.5 : 0.52), rx: W * (this.compact ? 0.7 : 0.36), base: Hl * (this.compact ? 0.8 : 0.79),
      };
      e.haze = (c, k) => tintFn(L)(mix(c, L.bot, k));
      e.slope = Math.tan(this.ang);
      e.roadY = (x) => e.base - (x - e.rx) * e.slope;

      this.drawSky(e);
      if (this.fade < 1) {
        STAGE[STAGE_KEYS[this.prevStage]](ctx, e);
        ctx.save(); ctx.globalAlpha = this.fade; STAGE[STAGE_KEYS[this.stage]](ctx, e); ctx.restore();
      } else STAGE[STAGE_KEYS[this.stage]](ctx, e);
      this.drawRoadside(e);
      this.drawRoad(e);
      this.drawGates(e);
      this.drawRider(e);
      this.drawFx(e, dt);
      this.drawPops(e);
    }

    drawSky(e) {
      const { ctx } = this; const { W, H, L } = e;
      const g = ctx.createLinearGradient(0, 0, 0, e.hy + H * 0.05);
      g.addColorStop(0, L.top); g.addColorStop(1, L.bot);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      if (L.night > 0.2) {
        ctx.fillStyle = '#FFFFFF';
        for (const [sx, sy, sz] of this._stars) { ctx.globalAlpha = clamp((L.night - 0.2) / 0.8, 0, 1) * (0.45 + 0.55 * Math.sin(this.t * 1.5 + sz * 30)); ctx.fillRect(sx * W, sy * e.hy, sz > 0.85 ? 2 : 1.1, sz > 0.85 ? 2 : 1.1); }
        ctx.globalAlpha = 1;
      }
      const d = L.d;
      if (d > 0.01 && d < 0.68) { // sun
        const k = (d - 0.01) / 0.67, sx = W * (0.08 + 0.84 * k), sy = e.hy - Math.sin(k * Math.PI) * e.hy * 0.78;
        const warm = L.warm > 0.3;
        const gg = ctx.createRadialGradient(sx, sy, 0, sx, sy, H * 0.25);
        gg.addColorStop(0, warm ? 'rgba(255,190,120,0.55)' : 'rgba(255,248,220,0.5)'); gg.addColorStop(1, 'rgba(255,240,210,0)');
        ctx.fillStyle = gg; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = warm ? '#FFC58A' : '#FFF8E0'; ctx.beginPath(); ctx.arc(sx, sy, Math.max(8, H * 0.03), 0, TAU); ctx.fill();
      } else if (d > 0.7 || d < 0.03) { // moon
        const k = d > 0.7 ? (d - 0.7) / 0.33 : (d + 0.3) / 0.33, mx = W * (0.15 + 0.7 * k), my = e.hy - Math.sin(k * Math.PI) * e.hy * 0.6;
        ctx.fillStyle = '#F3EFDC'; ctx.beginPath(); ctx.arc(mx, my, Math.max(7, H * 0.022), 0, TAU); ctx.fill();
        ctx.fillStyle = L.top; ctx.beginPath(); ctx.arc(mx + H * 0.009, my - H * 0.005, Math.max(6, H * 0.019), 0, TAU); ctx.fill();
      }
      const cc = rgba(mix('#FFFFFF', L.bot, 0.25), L.night > 0.6 ? 0.18 : 0.75);
      tiles(e.x * 0.015 + this.t * 4, 380, W, (i, x) => { if (rnd(i, 30) > 0.4) cloud(ctx, x + 120 * rnd(i, 31), e.hy * lerp(0.18, 0.6, rnd(i, 32)), lerp(120, 240, rnd(i, 33)), cc); });
    }

    /* things standing on the far edge of the road (guardrail, signs, crowd) */
    drawRoadside(e) {
      const { ctx } = this; const { W, H, T, R } = e;
      const key = STAGE_KEYS[this.stage];
      const edge = (x) => e.roadY(x) - 1;
      if (key === 'hairpin' || key === 'steep' || key === 'lake') { // guardrail
        ctx.strokeStyle = T('#E6E8EA'); ctx.lineWidth = Math.max(2, R * 0.12);
        ctx.beginPath(); ctx.moveTo(0, edge(0) - R * 0.55); ctx.lineTo(W, edge(W) - R * 0.55); ctx.stroke();
        ctx.fillStyle = T('#B9BDC2');
        tiles(e.x, 80, W, (i, x) => ctx.fillRect(x, edge(x) - R * 0.6, 3, R * 0.6));
      }
      // distance board every 600px of travel
      tiles(e.x, 1400, W, (i, x) => {
        const bx = x + 700, by = edge(bx);
        if (this.remainKm != null && this.remainKm > 0.1) {
          ctx.fillStyle = T('#8C9196'); ctx.fillRect(bx - 1.5, by - R * 2.2, 3, R * 2.2);
          ctx.font = `700 ${Math.round(R * 0.42)}px "Zen Kaku Gothic New", system-ui, sans-serif`;
          const txt = `ゴールまで ${Math.ceil(this.remainKm)}km`, bw = ctx.measureText(txt).width + R * 0.6;
          ctx.fillStyle = T('#1C5FB0'); ctx.fillRect(bx - bw / 2, by - R * 2.9, bw, R * 0.95);
          ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(txt, bx, by - R * 2.42);
        }
      });
      // gradient warning sign in steep section
      if (key === 'steep') tiles(e.x, 900, W, (i, x) => {
        const sx = x + 300, sy = edge(sx), s = R * 0.75;
        ctx.fillStyle = T('#8C9196'); ctx.fillRect(sx - 1.5, sy - R * 2.2, 3, R * 2.2);
        ctx.save(); ctx.translate(sx, sy - R * 2.5); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#FFC31F'; ctx.fillRect(-s * 0.7, -s * 0.7, s * 1.4, s * 1.4); ctx.strokeStyle = '#1A1A12'; ctx.lineWidth = 2; ctx.strokeRect(-s * 0.6, -s * 0.6, s * 1.2, s * 1.2);
        ctx.restore();
        ctx.fillStyle = '#1A1A12'; ctx.font = `800 ${Math.round(R * 0.48)}px "Saira Condensed", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`${Math.round(this.grade)}%`, sx, sy - R * 2.5);
      });
      // roadside crowd: grows with effort, always there on the steep wall and at the lake
      const crowd = clamp((this.zone - 3) / 3, 0, 1) * 0.55 + (key === 'steep' ? 0.22 : 0) + (this.finishIn != null && this.finishIn < 250 ? 0.6 : 0);
      if (crowd > 0.05) {
        const cols = ['#E5484D', '#2FB3A6', '#FFC31F', '#F2F2F2', '#3A6FD8', '#20272E'];
        tiles(e.x, 34, W, (i, x) => {
          if (rnd(i, 41) > crowd) return;
          const px = x + 10 * rnd(i, 42), py = edge(px) - R * 0.1, h = R * lerp(1.3, 1.7, rnd(i, 43));
          const jump = Math.max(0, Math.sin(this.t * 7 + i)) * R * 0.15 * crowd;
          ctx.fillStyle = T(cols[Math.floor(rnd(i, 44) * cols.length)]);
          ctx.beginPath(); ctx.roundRect ? ctx.roundRect(px - h * 0.17, py - h * 0.75 - jump, h * 0.34, h * 0.6, h * 0.12) : ctx.rect(px - h * 0.17, py - h * 0.75 - jump, h * 0.34, h * 0.6); ctx.fill();
          ctx.fillStyle = T('#2A2522'); ctx.fillRect(px - h * 0.12, py - h * 0.18 - jump, h * 0.09, h * 0.18 + jump); ctx.fillRect(px + h * 0.03, py - h * 0.18 - jump, h * 0.09, h * 0.18 + jump);
          ctx.fillStyle = T('#E2B48C'); ctx.beginPath(); ctx.arc(px, py - h * 0.86 - jump, h * 0.12, 0, TAU); ctx.fill();
          const arm = Math.sin(this.t * 9 + i * 1.7);
          ctx.strokeStyle = T('#E2B48C'); ctx.lineWidth = Math.max(1.5, h * 0.06); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(px + h * 0.14, py - h * 0.68 - jump); ctx.lineTo(px + h * 0.3, py - h * (1.0 + arm * 0.12) - jump); ctx.stroke();
          if (rnd(i, 45) > 0.6) { // flag
            const fx = px + h * 0.3, fy = py - h * (1.0 + arm * 0.12) - jump;
            ctx.strokeStyle = T('#DDDDDD'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - h * 0.5); ctx.stroke();
            ctx.fillStyle = cols[Math.floor(rnd(i, 46) * 3)];
            const wv = Math.sin(this.t * 10 + i) * h * 0.06;
            ctx.beginPath(); ctx.moveTo(fx, fy - h * 0.5); ctx.lineTo(fx + h * 0.4, fy - h * 0.42 + wv); ctx.lineTo(fx, fy - h * 0.3); ctx.closePath(); ctx.fill();
          }
          if (rnd(i, 47) > 0.96) { // board
            ctx.fillStyle = '#FFFFFF'; ctx.fillRect(px - h * 0.45, py - h * 1.45 - jump, h * 0.9, h * 0.32);
            ctx.fillStyle = '#E5484D'; ctx.font = `800 ${Math.round(h * 0.2)}px "Zen Kaku Gothic New", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(['がんばれ!', 'GO!', 'あと少し!', 'ファイト!'][i & 3], px, py - h * 1.29 - jump);
          }
        });
      }
    }

    drawRoad(e) {
      const { ctx } = this; const { W, H, T } = e;
      const y0 = e.roadY(0), y1 = e.roadY(W);
      ctx.fillStyle = T('#3C3F46'); ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(W, y1); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = T('#E9E9E2'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, y0 + 1); ctx.lineTo(W, y1 + 1); ctx.stroke();
      // centre dashes on the near half of the road
      const off = H * 0.115, dash = 54;
      ctx.strokeStyle = T('#F1F1EA'); ctx.lineWidth = Math.max(2, H * 0.006);
      ctx.beginPath();
      for (let x = -(e.x % dash) - dash; x < W; x += dash) { ctx.moveTo(x, e.roadY(x) + off); ctx.lineTo(x + dash * 0.5, e.roadY(x + dash * 0.5) + off); }
      ctx.stroke();
      // painted messages on the tarmac now and then
      tiles(e.x, 2200, W, (i, x) => {
        const mx = x + 1100;
        ctx.save(); ctx.translate(mx, e.roadY(mx) + off * 1.6); ctx.rotate(-this.ang); ctx.scale(1, 0.45);
        ctx.fillStyle = rgba(T('#F4F4EE'), 0.55); ctx.font = `800 italic ${Math.round(e.R * 1.4)}px "Saira Condensed", system-ui, sans-serif`; ctx.textAlign = 'center';
        ctx.fillText(['ALLEZ', 'GO GO', '登れ', 'KOM'][((i % 4) + 4) % 4], 0, 0); ctx.restore();
      });
    }

    gate(e, gx, text, color) {
      const { ctx } = this; const R = e.R;
      const top = e.roadY(gx) - R * 4.6, h = R * 0.9, w = R * 5.2;
      ctx.fillStyle = '#20272E'; ctx.fillRect(gx - w / 2, top, R * 0.22, e.roadY(gx) + e.H * 0.2 - top); ctx.fillRect(gx + w / 2 - R * 0.22, top, R * 0.22, e.roadY(gx) + e.H * 0.2 - top);
      ctx.fillStyle = color; ctx.fillRect(gx - w / 2, top, w, h);
      ctx.fillStyle = color === '#FFC31F' ? '#1A1A12' : '#FFFFFF'; ctx.font = `800 italic ${Math.round(h * 0.7)}px "Saira Condensed", system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, gx, top + h * 0.54);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      for (let k = 0; k < 8; k++) ctx.fillRect(gx - w / 2 + k * w / 8, top + h, w / 16, R * 0.15);
    }
    drawGates(e) {
      const sx = e.rx + e.R * 3 - (this.x - this.startX);
      if (sx > -e.R * 4 && sx < e.W + e.R * 4) this.gate(e, sx, 'START', '#FFC31F');
      if (this.finishIn != null) {
        const fx = e.rx + this.finishIn * e.pxPerM;
        if (fx > -e.R * 4 && fx < e.W + e.R * 4) this.gate(e, fx, 'FINISH', '#E5484D');
      }
    }

    drawRider(e) {
      const { ctx } = this; const R = e.R, D = this.dance;
      const cy = e.roadY(e.rx) + e.Hl * 0.055;
      ctx.save();
      ctx.translate(e.rx, cy);
      const rock = D * Math.sin(this.crank) * 0.06;
      ctx.rotate(-this.ang);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, 2, R * 2.3, R * 0.14, 0, 0, TAU); ctx.fill();
      ctx.rotate(rock);
      const P = (x, y) => [x * R, y * R];
      const rear = P(-1.55, -1), front = P(1.55, -1), bb = P(-0.2, -0.78);
      const seat = P(-0.82, -2.42), ht = P(1.02, -2.2), hb = P(1.1, -1.82), hood = P(1.42, -2.36);
      const bob = Math.sin(this.crank * 2) * R * 0.03 * Math.min(1, this.cadence / 60);
      const hip = [lerp(seat[0] + R * 0.05, -0.32 * R, D) + Math.sin(this.crank) * D * R * 0.08, lerp(seat[1] - R * 0.14, -2.78 * R, D) + bob];
      const sh = [lerp(0.5 * R, 0.85 * R, D), lerp(-3.28 * R, -3.38 * R, D) + bob * 0.6];
      const ca = this.crank, cl = R * 0.5;
      const pA = [bb[0] + Math.cos(ca) * cl, bb[1] + Math.sin(ca) * cl], pB = [bb[0] - Math.cos(ca) * cl, bb[1] - Math.sin(ca) * cl];
      const KIT = '#FFC31F', KIT2 = '#14181C', SKIN = '#D9A57E';

      this.limb(hip, pB, R * 1.33, R * 1.33, R * 0.27, ['#0B0E11', mix(SKIN, '#000000', 0.25)], 1, true);
      this.limb(sh, [hood[0] - R * 0.05, hood[1]], R * 0.82, R * 0.8, R * 0.17, [mix(KIT, '#000000', 0.3), mix(SKIN, '#000000', 0.25)], -1);
      // wheels
      for (const [wx, wy] of [rear, front]) {
        ctx.fillStyle = '#16191D'; ctx.beginPath(); ctx.arc(wx, wy, R * 0.95, 0, TAU); ctx.arc(wx, wy, R * 0.6, 0, TAU, true); ctx.fill('evenodd');
        ctx.strokeStyle = '#2C3238'; ctx.lineWidth = R * 0.02; ctx.beginPath(); ctx.arc(wx, wy, R * 0.82, 0, TAU); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = R * 0.06; // rim logo flashes
        for (let k = 0; k < 2; k++) { const a = this.wheel + k * Math.PI; ctx.beginPath(); ctx.arc(wx, wy, R * 0.75, a, a + 0.5); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(200,205,212,0.6)'; ctx.lineWidth = 0.8;
        for (let k = 0; k < 8; k++) { const a = this.wheel * 0.5 + k * Math.PI / 4; ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + Math.cos(a) * R * 0.6, wy + Math.sin(a) * R * 0.6); ctx.stroke(); }
        ctx.fillStyle = '#9AA1A9'; ctx.beginPath(); ctx.arc(wx, wy, R * 0.07, 0, TAU); ctx.fill();
      }
      // frame
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = '#EEF1F3'; ctx.lineWidth = R * 0.13;
      ctx.beginPath(); ctx.moveTo(rear[0], rear[1]); ctx.lineTo(bb[0], bb[1]); ctx.lineTo(hb[0], hb[1]); ctx.lineTo(ht[0], ht[1]);
      ctx.lineTo(seat[0] + R * 0.15, seat[1] + R * 0.3); ctx.lineTo(bb[0], bb[1]); ctx.moveTo(seat[0] + R * 0.15, seat[1] + R * 0.3); ctx.lineTo(rear[0], rear[1]); ctx.stroke();
      ctx.strokeStyle = KIT; ctx.lineWidth = R * 0.05; ctx.beginPath(); ctx.moveTo(bb[0] + (hb[0] - bb[0]) * 0.35, bb[1] + (hb[1] - bb[1]) * 0.35); ctx.lineTo(bb[0] + (hb[0] - bb[0]) * 0.7, bb[1] + (hb[1] - bb[1]) * 0.7); ctx.stroke();
      ctx.strokeStyle = '#2B3137'; ctx.lineWidth = R * 0.1; ctx.beginPath(); ctx.moveTo(hb[0], hb[1]); ctx.lineTo(front[0], front[1]); ctx.stroke();
      ctx.strokeStyle = '#16191D'; ctx.lineWidth = R * 0.09;
      ctx.beginPath(); ctx.moveTo(ht[0], ht[1]); ctx.lineTo(hood[0] - R * 0.15, hood[1] - R * 0.06); ctx.quadraticCurveTo(hood[0] + R * 0.25, hood[1] - R * 0.05, hood[0] + R * 0.1, hood[1] + R * 0.45); ctx.stroke();
      ctx.fillStyle = '#16191D'; ctx.beginPath(); ctx.ellipse(seat[0], seat[1] + R * 0.12, R * 0.36, R * 0.08, -0.05, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#A7AEB6'; ctx.lineWidth = R * 0.06; ctx.beginPath(); ctx.arc(bb[0], bb[1], R * 0.28, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#2B3137'; ctx.lineWidth = R * 0.08; ctx.beginPath(); ctx.moveTo(pB[0], pB[1]); ctx.lineTo(pA[0], pA[1]); ctx.stroke();
      // near leg
      this.limb(hip, pA, R * 1.33, R * 1.33, R * 0.29, ['#14181C', SKIN], 1, true);
      // torso (jersey)
      ctx.strokeStyle = KIT; ctx.lineWidth = R * 0.62; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hip[0], hip[1] - R * 0.12); ctx.quadraticCurveTo((hip[0] + sh[0]) / 2, Math.min(hip[1], sh[1]) - R * 0.32, sh[0], sh[1]); ctx.stroke();
      ctx.strokeStyle = KIT2; ctx.lineWidth = R * 0.14;
      ctx.beginPath(); ctx.moveTo(hip[0] + R * 0.05, hip[1] + R * 0.05); ctx.quadraticCurveTo((hip[0] + sh[0]) / 2, Math.min(hip[1], sh[1]) - R * 0.05, sh[0] - R * 0.1, sh[1] + R * 0.22); ctx.stroke();
      // number bib
      const mx = (hip[0] + sh[0]) / 2 - R * 0.15, my = (hip[1] + sh[1]) / 2 - R * 0.12;
      ctx.save(); ctx.translate(mx, my); ctx.rotate(Math.atan2(sh[1] - hip[1], sh[0] - hip[0]));
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(-R * 0.3, -R * 0.2, R * 0.6, R * 0.36);
      ctx.fillStyle = '#14181C'; ctx.font = `800 ${Math.round(R * 0.26)}px "Saira Condensed", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('29', 0, -R * 0.01);
      ctx.restore();
      // head + helmet + glasses
      const hd = [sh[0] + R * 0.42, sh[1] - R * 0.34];
      ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(hd[0], hd[1], R * 0.27, 0, TAU); ctx.fill();
      ctx.fillStyle = '#F4F6F8'; ctx.beginPath();
      ctx.moveTo(hd[0] - R * 0.42, hd[1] - R * 0.02); ctx.quadraticCurveTo(hd[0] - R * 0.2, hd[1] - R * 0.5, hd[0] + R * 0.25, hd[1] - R * 0.3); ctx.quadraticCurveTo(hd[0] + R * 0.4, hd[1] - R * 0.18, hd[0] + R * 0.3, hd[1] - R * 0.06); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = KIT; ctx.lineWidth = R * 0.05; ctx.beginPath(); ctx.moveTo(hd[0] - R * 0.3, hd[1] - R * 0.22); ctx.quadraticCurveTo(hd[0], hd[1] - R * 0.4, hd[0] + R * 0.2, hd[1] - R * 0.26); ctx.stroke();
      ctx.fillStyle = '#101418'; ctx.beginPath(); ctx.ellipse(hd[0] + R * 0.2, hd[1] - R * 0.02, R * 0.13, R * 0.06, -0.15, 0, TAU); ctx.fill();
      // near arm
      this.limb(sh, hood, R * 0.82, R * 0.8, R * 0.19, [KIT, SKIN], -1);
      ctx.restore();
      this._emit = { x: e.rx + hd[0] * Math.cos(-this.ang) - hd[1] * Math.sin(-this.ang), y: cy + hd[0] * Math.sin(-this.ang) + hd[1] * Math.cos(-this.ang), R };
    }
    /* two-bone limb; bend=1 knee forward, -1 elbow back/down */
    limb(a, b, l1, l2, w, cols, bend, leg) {
      const { ctx } = this;
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const d = Math.min(Math.hypot(dx, dy), l1 + l2 - 0.01);
      const base = Math.atan2(dy, dx), k = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
      const j1 = [a[0] + Math.cos(base - k) * l1, a[1] + Math.sin(base - k) * l1], j2 = [a[0] + Math.cos(base + k) * l1, a[1] + Math.sin(base + k) * l1];
      const j = bend > 0 ? (j1[0] > j2[0] ? j1 : j2) : (j1[1] > j2[1] ? j1 : j2);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = cols[0]; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]);
      if (leg) { const m = [a[0] + (j[0] - a[0]) * 0.75, a[1] + (j[1] - a[1]) * 0.75]; ctx.lineTo(m[0], m[1]); ctx.stroke(); ctx.strokeStyle = cols[1]; ctx.lineWidth = w * 0.9; ctx.beginPath(); ctx.moveTo(m[0], m[1]); }
      else { const m = [a[0] + (j[0] - a[0]) * 0.45, a[1] + (j[1] - a[1]) * 0.45]; ctx.lineTo(m[0], m[1]); ctx.stroke(); ctx.strokeStyle = cols[1]; ctx.lineWidth = w * 0.8; ctx.beginPath(); ctx.moveTo(m[0], m[1]); }
      ctx.lineTo(j[0], j[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      if (leg) { // sock + shoe
        ctx.strokeStyle = '#F4F6F8'; ctx.lineWidth = w * 0.85; ctx.beginPath(); ctx.moveTo(b[0] + (j[0] - b[0]) * 0.22, b[1] + (j[1] - b[1]) * 0.22); ctx.lineTo(b[0] + (j[0] - b[0]) * 0.08, b[1] + (j[1] - b[1]) * 0.08); ctx.stroke();
        ctx.fillStyle = '#14181C'; ctx.beginPath(); ctx.ellipse(b[0] + w * 0.35, b[1] + w * 0.1, w * 0.85, w * 0.36, 0.08, 0, TAU); ctx.fill();
      }
    }

    drawFx(e, dt) {
      const { ctx } = this; const { W, H } = e;
      // wind streaks from threshold up
      const wind = clamp((this.zone - 3) / 3, 0, 1);
      if (wind > 0 && this.cadence > 10) {
        ctx.strokeStyle = `rgba(255,255,255,${0.25 + wind * 0.35})`; ctx.lineWidth = 1.5;
        for (let k = 0; k < 4 + wind * 10; k++) {
          const y = H * (0.25 + rnd(k, 3) * 0.55), len = 40 + rnd(k, Math.floor(this.t * 3)) * 120;
          const x = W - ((this.t * (600 + wind * 600) + k * 157) % (W + len * 2));
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y - len * Math.tan(this.ang) * 0.3); ctx.stroke();
        }
      }
      // falling leaves (autumn/spring) when pushing hard or on the plateau
      const key = STAGE_KEYS[this.stage];
      const leafy = (this.S.key === 'autumn' || this.S.key === 'spring') && (this.zone >= 5 || key === 'plateau' || key === 'hairpin');
      if (leafy && Math.random() < dt * (this.zone >= 5 ? 14 : 3)) {
        this.parts.push({ k: 'leaf', x: W + 10, y: H * Math.random() * 0.7, vx: -(140 + Math.random() * 160) * (0.6 + wind), vy: 30 + Math.random() * 40, r: Math.random() * TAU, life: 6, c: this.S.key === 'spring' ? '#F6C1CF' : this.S.leaf[Math.floor(Math.random() * 3)] });
      }
      if (this._emit && this.cadence > 10 && Math.random() < clamp(this.intensity - 0.8, 0, 1) * dt * 8) {
        this.parts.push({ k: 'sweat', x: this._emit.x, y: this._emit.y, vx: -30 - Math.random() * 30, vy: -20, life: 0.9 });
      }
      this.parts = this.parts.filter((p) => (p.life -= dt) > 0 && p.x > -20);
      for (const p of this.parts) {
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.k === 'leaf') {
          p.r += dt * 4; p.vy = 30 + Math.sin(this.t * 3 + p.r) * 40;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.beginPath(); ctx.ellipse(0, 0, 5, 2.5, 0, 0, TAU); ctx.fill(); ctx.restore();
        } else {
          p.vy += 200 * dt; ctx.fillStyle = `rgba(170,215,255,${clamp(p.life, 0, 1)})`; ctx.beginPath(); ctx.arc(p.x, p.y, 1.8, 0, TAU); ctx.fill();
        }
      }
    }

    drawPops(e) {
      const { ctx } = this;
      this.pops = this.pops.filter((p) => this.t - p.t0 < 3.4);
      for (const p of this.pops) {
        const k = (this.t - p.t0) / 3.4;
        const a = clamp(Math.min(k * 8, (1 - k) * 5), 0, 1);
        const x = e.rx + e.R * 0.6, y = e.roadY(e.rx) - e.R * (4.6 + k * 1.2);
        ctx.save(); ctx.globalAlpha = a;
        const fs = Math.round(clamp(e.R * 0.5, 13, 22));
        ctx.font = `700 ${fs}px "Zen Kaku Gothic New", system-ui, sans-serif`;
        const tw = ctx.measureText(p.s).width; const ew = fs * 1.6; const w = tw + ew + 22, h = fs * 2;
        ctx.fillStyle = 'rgba(18,32,42,0.88)'; ctx.strokeStyle = '#FFC31F'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2) : ctx.rect(x - w / 2, y - h / 2, w, h); ctx.fill(); ctx.stroke();
        ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        ctx.font = `${Math.round(fs * 1.25)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`; ctx.fillText(p.e, x - w / 2 + 10, y + 1);
        ctx.fillStyle = '#FFFFFF'; ctx.font = `700 ${fs}px "Zen Kaku Gothic New", system-ui, sans-serif`; ctx.fillText(p.s, x - w / 2 + 12 + ew, y + 1);
        ctx.restore();
      }
    }
  }
  return { World, light, season };
})();
