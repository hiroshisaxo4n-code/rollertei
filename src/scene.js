/* ============================================================
   Scene: side-scrolling world that changes with power zone and
   elapsed time, ridden by ギョー太 (an original gyoza mascot)
   ============================================================ */
const Scene = (() => {
  const TAU = Math.PI * 2;
  const rnd = (i, s) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hex2 = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (a, b, k) => { const A = hex2(a), B = hex2(b); return `rgb(${Math.round(lerp(A[0], B[0], k))},${Math.round(lerp(A[1], B[1], k))},${Math.round(lerp(A[2], B[2], k))})`; };
  const mixHex = (a, b, k) => { const A = hex2(a), B = hex2(b); return '#' + [0, 1, 2].map((i) => Math.round(lerp(A[i], B[i], k)).toString(16).padStart(2, '0')).join(''); };

  /* sky over one "day" — the day advances with elapsed ride time */
  const SKY = [
    { t: 0.00, top: '#2B3366', bot: '#F4A27C' }, // 夜明け
    { t: 0.10, top: '#5AA6E6', bot: '#D4EEF8' }, // 朝
    { t: 0.45, top: '#3B8BE0', bot: '#BFE2F5' }, // 昼
    { t: 0.62, top: '#5C4D8E', bot: '#FF9C5B' }, // 夕焼け
    { t: 0.72, top: '#1E2250', bot: '#6E4C7E' }, // 夕暮れ
    { t: 0.80, top: '#0A1030', bot: '#1F2B58' }, // 夜
    { t: 0.94, top: '#0A1030', bot: '#1F2B58' },
    { t: 1.00, top: '#2B3366', bot: '#F4A27C' },
  ];
  function skyAt(d) {
    d = ((d % 1) + 1) % 1;
    for (let i = 0; i < SKY.length - 1; i++) {
      const a = SKY[i], b = SKY[i + 1];
      if (d >= a.t && d <= b.t) { const k = (d - a.t) / (b.t - a.t); return { top: mixHex(a.top, b.top, k), bot: mixHex(a.bot, b.bot, k) }; }
    }
    return SKY[0];
  }
  function nightness(d) {
    d = ((d % 1) + 1) % 1;
    if (d < 0.06) return lerp(0.55, 0.1, d / 0.06);
    if (d < 0.6) return 0;
    if (d < 0.8) return (d - 0.6) / 0.2;
    if (d < 0.94) return 1;
    return lerp(1, 0.55, (d - 0.94) / 0.06);
  }

  const THEMES = {
    1: { key: 'park', name: '公園' },
    2: { key: 'inaka', name: '田んぼ道' },
    3: { key: 'sea', name: '海沿い' },
    4: { key: 'touge', name: '峠' },
    5: { key: 'storm', name: '嵐の山' },
    6: { key: 'space', name: '宇宙' },
  };

  function tiles(off, tw, W, fn) {
    const a = Math.floor(off / tw) - 1, b = Math.floor((off + W) / tw) + 1;
    for (let i = a; i <= b; i++) fn(i, i * tw - off);
  }
  function hills(ctx, off, W, H, base, amp, wl, color, ph = 0) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 8; x += 8) {
      const X = x + off;
      const y = base - amp * (0.55 + 0.45 * Math.sin(X / wl + ph)) - amp * 0.35 * Math.sin(X / (wl * 0.41) + 1.7 + ph);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  }
  function peaks(ctx, off, W, H, base, hMin, hMax, tw, color, snow, seed) {
    tiles(off, tw, W, (i, x) => {
      for (let k = 0; k < 2; k++) {
        const cx = x + tw * (0.25 + 0.5 * k) + (rnd(i, seed + k) - 0.5) * tw * 0.3;
        const h = lerp(hMin, hMax, rnd(i, seed + 7 + k));
        const half = h * lerp(0.9, 1.4, rnd(i, seed + 3 + k));
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.moveTo(cx - half, base); ctx.lineTo(cx - half * 0.12, base - h * 0.96); ctx.lineTo(cx, base - h); ctx.lineTo(cx + half, base); ctx.closePath(); ctx.fill();
        if (snow) {
          ctx.fillStyle = snow;
          ctx.beginPath(); ctx.moveTo(cx - half * 0.12, base - h * 0.96); ctx.lineTo(cx, base - h);
          ctx.lineTo(cx + half * 0.26, base - h * 0.74); ctx.lineTo(cx + half * 0.08, base - h * 0.79);
          ctx.lineTo(cx - half * 0.06, base - h * 0.7); ctx.lineTo(cx - half * 0.22, base - h * 0.77); ctx.closePath(); ctx.fill();
        }
      }
    });
  }
  function roundTree(ctx, x, y, s, c1, c2) {
    ctx.fillStyle = '#6B4A2E'; ctx.fillRect(x - s * 0.08, y - s * 0.55, s * 0.16, s * 0.55);
    ctx.fillStyle = c1; ctx.beginPath(); ctx.arc(x, y - s * 0.85, s * 0.45, 0, TAU); ctx.fill();
    ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(x - s * 0.18, y - s * 0.95, s * 0.28, 0, TAU); ctx.fill();
  }
  function pine(ctx, x, y, s, c) {
    ctx.fillStyle = '#4A3523'; ctx.fillRect(x - s * 0.05, y - s * 0.25, s * 0.1, s * 0.25);
    ctx.fillStyle = c;
    for (let k = 0; k < 3; k++) {
      const yy = y - s * (0.2 + k * 0.28), ww = s * (0.42 - k * 0.1);
      ctx.beginPath(); ctx.moveTo(x - ww, yy); ctx.lineTo(x, yy - s * 0.42); ctx.lineTo(x + ww, yy); ctx.closePath(); ctx.fill();
    }
  }
  function house(ctx, x, y, s, wall, roof, lit) {
    ctx.fillStyle = wall; ctx.fillRect(x - s * 0.5, y - s * 0.55, s, s * 0.55);
    ctx.fillStyle = roof; ctx.beginPath(); ctx.moveTo(x - s * 0.66, y - s * 0.52); ctx.lineTo(x - s * 0.4, y - s * 0.86); ctx.lineTo(x + s * 0.4, y - s * 0.86); ctx.lineTo(x + s * 0.66, y - s * 0.52); ctx.closePath(); ctx.fill();
    ctx.fillStyle = lit ? '#FFD36B' : '#3A4660'; ctx.fillRect(x - s * 0.3, y - s * 0.4, s * 0.2, s * 0.16); ctx.fillRect(x + s * 0.1, y - s * 0.4, s * 0.2, s * 0.16);
  }
  function cloud(ctx, x, y, s, c) {
    ctx.fillStyle = c; ctx.beginPath();
    ctx.arc(x, y, s * 0.5, 0, TAU); ctx.arc(x + s * 0.5, y + s * 0.08, s * 0.38, 0, TAU);
    ctx.arc(x - s * 0.5, y + s * 0.1, s * 0.34, 0, TAU); ctx.arc(x + s * 0.15, y - s * 0.25, s * 0.36, 0, TAU);
    ctx.fill();
  }

  /* ---------- the six worlds ---------- */
  const DRAW = {
    park(ctx, e) {
      hills(ctx, e.x * 0.06, e.W, e.H, e.hy + 6, e.H * 0.08, 140, '#A9D69A', 0.5);
      hills(ctx, e.x * 0.18, e.W, e.H, e.hy + e.H * 0.07, e.H * 0.06, 90, '#7FC27A', 2.1);
      ctx.fillStyle = '#69B46A'; ctx.fillRect(0, e.hy + e.H * 0.08, e.W, e.ry - e.hy);
      tiles(e.x * 0.32, 120, e.W, (i, x) => {
        const s = e.H * lerp(0.12, 0.18, rnd(i, 4));
        roundTree(ctx, x + 60 * rnd(i, 1), e.hy + e.H * 0.13, s, '#3E9A4E', '#56B562');
      });
      tiles(e.x * 0.75, 70, e.W, (i, x) => {
        const yy = e.ry - 4;
        for (let k = 0; k < 4; k++) {
          ctx.fillStyle = ['#FF7FA6', '#FFE16B', '#FFFFFF', '#B58CFF'][Math.floor(rnd(i, k + 9) * 4)];
          ctx.beginPath(); ctx.arc(x + rnd(i, k) * 70, yy - rnd(i, k + 20) * e.H * 0.05, 2.2, 0, TAU); ctx.fill();
        }
        if (rnd(i, 33) > 0.86) { // bench
          ctx.fillStyle = '#8A5A33'; ctx.fillRect(x + 10, yy - 14, 30, 4); ctx.fillRect(x + 10, yy - 22, 30, 3);
          ctx.fillRect(x + 12, yy - 14, 3, 12); ctx.fillRect(x + 35, yy - 14, 3, 12);
        }
      });
      for (let b = 0; b < 2; b++) { // butterflies
        const bx = ((e.t * 30 + b * 170) % (e.W + 60)) - 30, by = e.hy + e.H * 0.05 + Math.sin(e.t * 2 + b) * 12;
        const f = Math.abs(Math.sin(e.t * 14 + b)) * 5 + 1;
        ctx.fillStyle = b ? '#FFD84D' : '#FFFFFF';
        ctx.beginPath(); ctx.ellipse(bx - 3, by, f, 4, 0, 0, TAU); ctx.ellipse(bx + 3, by, f, 4, 0, 0, TAU); ctx.fill();
      }
    },
    inaka(ctx, e) {
      peaks(ctx, e.x * 0.05, e.W, e.H, e.hy + 4, e.H * 0.12, e.H * 0.22, 260, '#8FA6C4', '#F4F7FB', 11);
      hills(ctx, e.x * 0.14, e.W, e.H, e.hy + e.H * 0.05, e.H * 0.04, 120, '#6E9C62', 1);
      const top = e.hy + e.H * 0.06;
      ctx.fillStyle = '#7DBF5A'; ctx.fillRect(0, top, e.W, e.ry - top);
      const rows = 6;
      for (let k = 0; k < rows; k++) { // paddy rows
        const y = top + (e.ry - top) * (k / rows);
        ctx.fillStyle = k % 2 ? 'rgba(255,255,255,0.10)' : 'rgba(30,90,40,0.12)';
        ctx.fillRect(0, y, e.W, (e.ry - top) / rows * 0.5);
      }
      tiles(e.x * 0.3, 260, e.W, (i, x) => {
        if (rnd(i, 2) > 0.45) house(ctx, x + 90 * rnd(i, 5), top + e.H * 0.05, e.H * 0.12, '#EDE3CF', '#47505E', e.night > 0.5);
      });
      const poleY = e.ry - 2, ph = e.H * 0.22, tw = 190; // utility poles + sagging wires
      tiles(e.x * 0.75, tw, e.W, (i, x) => {
        const px = x + 40;
        ctx.strokeStyle = 'rgba(30,30,40,0.7)'; ctx.lineWidth = 1;
        for (const dy of [0.92, 0.82]) {
          ctx.beginPath(); ctx.moveTo(px, poleY - ph * dy);
          ctx.quadraticCurveTo(px + tw / 2, poleY - ph * dy + 14, px + tw, poleY - ph * dy); ctx.stroke();
        }
        ctx.fillStyle = '#5A4A3C'; ctx.fillRect(px - 2.5, poleY - ph, 5, ph);
        ctx.fillRect(px - 12, poleY - ph * 0.9, 24, 3);
      });
    },
    sea(ctx, e) {
      const seaTop = e.hy + 2, seaBot = e.hy + (e.ry - e.hy) * 0.55;
      const g = ctx.createLinearGradient(0, seaTop, 0, seaBot);
      g.addColorStop(0, e.night > 0.5 ? '#1B2F57' : '#2E86C9'); g.addColorStop(1, e.night > 0.5 ? '#14284A' : '#62B7E3');
      ctx.fillStyle = g; ctx.fillRect(0, seaTop, e.W, seaBot - seaTop);
      tiles(e.x * 0.04, 400, e.W, (i, x) => { // islands
        if (rnd(i, 1) > 0.5) { ctx.fillStyle = '#5E7F9A'; ctx.beginPath(); ctx.ellipse(x + 200 * rnd(i, 2), seaTop + 2, 50 + 40 * rnd(i, 3), 12 + 10 * rnd(i, 4), 0, Math.PI, TAU); ctx.fill(); }
      });
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5;
      for (let k = 0; k < 18; k++) { // sparkles
        const sx = ((k * 97 - e.x * 0.1 + e.t * 8) % e.W + e.W) % e.W, sy = seaTop + 6 + (k * 37 % 100) / 100 * (seaBot - seaTop - 10);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 6 + Math.sin(e.t * 3 + k) * 3, sy); ctx.stroke();
      }
      tiles(e.x * 0.1, 300, e.W, (i, x) => { // sailboats
        if (rnd(i, 7) > 0.55) {
          const bx = x + 150 * rnd(i, 8), by = seaTop + (seaBot - seaTop) * 0.4 + Math.sin(e.t * 1.5 + i) * 1.5;
          ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.moveTo(bx, by - 2); ctx.lineTo(bx, by - 26); ctx.lineTo(bx + 14, by - 4); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#C0392B'; ctx.fillRect(bx - 10, by - 2, 26, 4);
        }
      });
      ctx.fillStyle = '#EBD9A7'; ctx.fillRect(0, seaBot, e.W, e.ry - seaBot); // beach
      tiles(e.x * 0.4, 520, e.W, (i, x) => { // lighthouse
        if (rnd(i, 12) > 0.6) {
          const lx = x + 200, ly = seaBot + 4, h = e.H * 0.26;
          ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.moveTo(lx - 10, ly); ctx.lineTo(lx - 6, ly - h); ctx.lineTo(lx + 6, ly - h); ctx.lineTo(lx + 10, ly); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#D7262E'; for (let k = 1; k < 4; k++) ctx.fillRect(lx - 9 + k * 0.6, ly - h * k / 4, 18 - k * 1.2, h * 0.09);
          ctx.fillStyle = '#333'; ctx.fillRect(lx - 8, ly - h - 10, 16, 10);
          ctx.fillStyle = e.night > 0.4 ? '#FFE27A' : '#F6F2C2'; ctx.fillRect(lx - 5, ly - h - 8, 10, 6);
          if (e.night > 0.4) {
            const a = Math.sin(e.t * 1.2);
            ctx.fillStyle = `rgba(255,232,140,${0.22 * e.night})`;
            ctx.beginPath(); ctx.moveTo(lx, ly - h - 5); ctx.lineTo(lx + a * 220, ly - h - 40); ctx.lineTo(lx + a * 220, ly - h + 30); ctx.closePath(); ctx.fill();
          }
        }
      });
      for (let k = 0; k < 3; k++) { // gulls
        const gx = ((e.t * (24 + k * 6) + k * 220) % (e.W + 40)) - 20, gy = e.hy - e.H * (0.12 + k * 0.06) + Math.sin(e.t * 2 + k) * 6;
        const f = Math.sin(e.t * 8 + k) * 4;
        ctx.strokeStyle = '#2B2B2B'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(gx - 8, gy - f); ctx.quadraticCurveTo(gx - 4, gy - 4, gx, gy); ctx.quadraticCurveTo(gx + 4, gy - 4, gx + 8, gy - f); ctx.stroke();
      }
    },
    touge(ctx, e) {
      peaks(ctx, e.x * 0.04, e.W, e.H, e.hy + 10, e.H * 0.28, e.H * 0.42, 300, '#6C7FA0', '#FFFFFF', 21);
      peaks(ctx, e.x * 0.12, e.W, e.H, e.hy + e.H * 0.08, e.H * 0.14, e.H * 0.24, 200, '#4E6B5C', null, 31);
      ctx.fillStyle = '#3F6B4A'; ctx.fillRect(0, e.hy + e.H * 0.07, e.W, e.ry - e.hy);
      tiles(e.x * 0.35, 46, e.W, (i, x) => pine(ctx, x + 20 * rnd(i, 1), e.hy + e.H * 0.16 + rnd(i, 2) * 8, e.H * lerp(0.12, 0.2, rnd(i, 3)), rnd(i, 4) > 0.5 ? '#2F5A3B' : '#285034'));
      tiles(e.x * 0.7, 60, e.W, (i, x) => pine(ctx, x + 20 * rnd(i, 5), e.ry - 4, e.H * lerp(0.16, 0.24, rnd(i, 6)), '#22472E'));
      tiles(e.x * 0.75, 900, e.W, (i, x) => { // 峠 sign
        const sx = x + 400, sy = e.ry - 4;
        ctx.fillStyle = '#7A7A7A'; ctx.fillRect(sx - 2, sy - 64, 4, 64);
        ctx.fillStyle = '#1E5BB8'; ctx.fillRect(sx - 34, sy - 82, 68, 26);
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2; ctx.strokeRect(sx - 31, sy - 79, 62, 20);
        ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 13px "Zen Kaku Gothic New", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('ローラー峠', sx, sy - 69);
      });
    },
    storm(ctx, e) {
      peaks(ctx, e.x * 0.04, e.W, e.H, e.hy + 10, e.H * 0.2, e.H * 0.36, 260, '#2C2A3A', null, 41);
      tiles(e.x * 0.06, 700, e.W, (i, x) => { // volcano
        const vx = x + 350, b = e.hy + 12, h = e.H * 0.34, top = 26;
        ctx.fillStyle = '#231F2C'; ctx.beginPath(); ctx.moveTo(vx - 170, b); ctx.lineTo(vx - top, b - h); ctx.lineTo(vx + top, b - h); ctx.lineTo(vx + 170, b); ctx.closePath(); ctx.fill();
        const glow = 0.6 + Math.sin(e.t * 3 + i) * 0.25;
        ctx.fillStyle = `rgba(255,96,32,${glow})`; ctx.beginPath(); ctx.ellipse(vx, b - h, top, 6, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(255,120,40,${glow * 0.8})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(vx - 8, b - h + 2); ctx.quadraticCurveTo(vx - 30, b - h * 0.6, vx - 55, b - h * 0.25); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(vx + 10, b - h + 2); ctx.quadraticCurveTo(vx + 22, b - h * 0.55, vx + 48, b - h * 0.3); ctx.stroke();
      });
      ctx.fillStyle = '#2E3530'; ctx.fillRect(0, e.hy + e.H * 0.05, e.W, e.ry - e.hy);
      tiles(e.x * 0.45, 56, e.W, (i, x) => pine(ctx, x + 20 * rnd(i, 1), e.hy + e.H * 0.17, e.H * lerp(0.1, 0.17, rnd(i, 2)), '#1C2620'));
      tiles(e.x * 0.75, 90, e.W, (i, x) => {
        ctx.fillStyle = '#4A4744'; const s = 6 + rnd(i, 3) * 12;
        ctx.beginPath(); ctx.ellipse(x + 40 * rnd(i, 4), e.ry - 2, s, s * 0.6, 0, Math.PI, TAU); ctx.fill();
      });
    },
    space(ctx, e) {
      tiles(e.x * 0.02, 600, e.W, (i, x) => { // planets
        if (rnd(i, 1) > 0.35) {
          const px = x + 300 * rnd(i, 2), py = e.H * lerp(0.12, 0.42, rnd(i, 3)), r = e.H * lerp(0.05, 0.11, rnd(i, 4));
          const c = ['#F2B705', '#9B6BFF', '#3FD0C9', '#FF6F91'][Math.floor(rnd(i, 5) * 4)];
          const g = ctx.createRadialGradient(px - r * 0.4, py - r * 0.4, r * 0.1, px, py, r);
          g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.25, c); g.addColorStop(1, '#1A1033');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill();
          if (rnd(i, 6) > 0.5) { ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(px, py, r * 1.7, r * 0.4, -0.3, 0, TAU); ctx.stroke(); }
        }
      });
      tiles(e.x * 0.25, 140, e.W, (i, x) => { // asteroids
        if (rnd(i, 7) > 0.5) {
          const ax = x + 100 * rnd(i, 8), ay = e.hy + e.H * lerp(-0.1, 0.12, rnd(i, 9)), s = 6 + 14 * rnd(i, 10);
          ctx.fillStyle = '#6E6585'; ctx.beginPath();
          for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU + e.t * 0.3; const rr = s * (0.7 + 0.3 * rnd(i, 11 + k)); ctx.lineTo(ax + Math.cos(a) * rr, ay + Math.sin(a) * rr); }
          ctx.closePath(); ctx.fill();
        }
      });
      tiles(e.x * 0.75, 110, e.W, (i, x) => { // neon posts
        const c = i % 2 ? '#3FF0FF' : '#FF4FD8';
        ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 12; ctx.fillRect(x, e.ry - 40, 3, 40); ctx.shadowBlur = 0;
      });
    },
  };

  /* ---------- scene object ---------- */
  class World {
    constructor(canvas, opts = {}) {
      this.c = canvas; this.ctx = canvas.getContext('2d');
      this.x = 0; this.t = 0; this.zone = 1; this.prevZone = 1; this.fade = 1; this.targetZone = 1; this.zoneSince = 0;
      this.speed = 0; this.cadence = 0; this.crank = 0; this.wheel = 0; this.intensity = 0.4; this.day = 0.12; this.grade = 0;
      this.parts = []; this.pops = []; this.flash = 0; this.nextBolt = 5; this._raf = null; this.compact = !!opts.compact;
      this.onTheme = opts.onTheme || null;
      this._stars = Array.from({ length: 90 }, (_, i) => [rnd(i, 1), rnd(i, 2) * 0.62, rnd(i, 3)]);
      this._ro = new ResizeObserver(() => this.resize());
      this._ro.observe(canvas);
      this.resize();
    }
    resize() {
      const r = this.c.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
      this.c.width = Math.round(this.W * dpr); this.c.height = Math.round(this.H * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    set(o) { Object.assign(this, o); }
    setZone(z) {
      z = clamp(z | 0, 1, 6);
      if (z !== this.targetZone) { this.targetZone = z; this.zoneSince = this.t; }
    }
    jumpZone(z) { this.zone = this.prevZone = this.targetZone = clamp(z | 0, 1, 6); this.fade = 1; }
    pop(emoji, text) { this.pops.push({ e: emoji, s: text, t0: this.t }); }
    start() {
      if (this._raf) return;
      let last = performance.now();
      const loop = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        this.frame(dt);
        this._raf = requestAnimationFrame(loop);
      };
      this._raf = requestAnimationFrame(loop);
    }
    stop() { if (this._raf) cancelAnimationFrame(this._raf); this._raf = null; }

    frame(dt) {
      const { ctx } = this;
      const W = this.W, H = this.H;
      this.t += dt;
      const R = clamp(H * (this.compact ? 0.11 : 0.072), 12, 46);
      const pxPerM = (R / 0.335) * 0.55;
      const v = this.speed / 3.6;
      this.x += v * dt * pxPerM;
      this.wheel += (v / 0.335) * dt;
      this.crank += (this.cadence / 60) * TAU * dt;
      if (this.targetZone !== this.zone && this.t - this.zoneSince > 2.5) {
        this.prevZone = this.zone; this.zone = this.targetZone; this.fade = 0;
        if (this.onTheme) this.onTheme(THEMES[this.zone]);
      }
      if (this.fade < 1) this.fade = Math.min(1, this.fade + dt / 1.6);

      const e = {
        W, H, x: this.x, t: this.t, R,
        hy: H * (this.compact ? 0.52 : 0.56), ry: H * (this.compact ? 0.74 : 0.79), gy: H * (this.compact ? 0.9 : 0.9),
        day: this.day, night: nightness(this.day),
      };
      if (this.fade < 1) {
        this.drawWorld(this.prevZone, e, 1);
        ctx.save(); ctx.globalAlpha = this.fade; this.drawWorld(this.zone, e, this.fade); ctx.restore();
      } else this.drawWorld(this.zone, e, 1);

      this.drawRider(e);
      this.drawParticles(e, dt);
      this.drawPops(e);
      if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${this.flash})`; ctx.fillRect(0, 0, W, H); this.flash = Math.max(0, this.flash - dt * 2.5); }
    }

    drawWorld(z, e, alpha) {
      const { ctx } = this;
      const key = THEMES[z].key;
      const { W, H } = e;
      // sky
      let sky = skyAt(e.day);
      let night = e.night;
      if (key === 'storm') { sky = { top: mixHex(sky.top, '#1E1B2B', 0.8), bot: mixHex(sky.bot, '#4B4A5E', 0.8) }; night = Math.max(night, 0.35); }
      if (key === 'space') { sky = { top: '#05030F', bot: '#1A0E3A' }; night = 1; }
      const g = ctx.createLinearGradient(0, 0, 0, e.ry);
      g.addColorStop(0, sky.top); g.addColorStop(1, sky.bot);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      if (night > 0.25 || key === 'space') { // stars
        ctx.fillStyle = '#FFFFFF';
        for (const [sx, sy, sz] of this._stars) {
          const a = (key === 'space' ? 1 : (night - 0.25) / 0.75) * (0.5 + 0.5 * Math.sin(this.t * 2 + sz * 20));
          ctx.globalAlpha = alpha * clamp(a, 0, 1);
          const px = ((sx * W - e.x * (key === 'space' ? 0.01 : 0)) % W + W) % W;
          ctx.fillRect(px, sy * e.hy, sz > 0.8 ? 2 : 1.2, sz > 0.8 ? 2 : 1.2);
        }
        ctx.globalAlpha = alpha;
      }
      if (key === 'space') {
        const ng = ctx.createRadialGradient(W * 0.7, H * 0.2, 0, W * 0.7, H * 0.2, W * 0.5);
        ng.addColorStop(0, 'rgba(155,107,255,0.35)'); ng.addColorStop(1, 'rgba(155,107,255,0)');
        ctx.fillStyle = ng; ctx.fillRect(0, 0, W, H);
      } else {
        this.drawCelestial(e, key);
        const cc = key === 'storm' ? '#3A3848' : night > 0.6 ? '#3A4470' : '#FFFFFF';
        tiles(e.x * 0.02 + this.t * 6, 260, W, (i, x) => {
          if (rnd(i, 50) > (key === 'storm' ? 0.05 : 0.45)) cloud(ctx, x + 100 * rnd(i, 51), e.hy * lerp(0.15, 0.55, rnd(i, 52)), lerp(28, 52, rnd(i, 53)) * (key === 'storm' ? 1.6 : 1), cc);
        });
      }
      DRAW[key](ctx, { ...e, night });
      // road
      const rg = ctx.createLinearGradient(0, e.ry, 0, H);
      if (key === 'space') { rg.addColorStop(0, '#1C0F3D'); rg.addColorStop(1, '#0B0620'); } else { rg.addColorStop(0, '#4A4D57'); rg.addColorStop(1, '#2F3138'); }
      ctx.fillStyle = rg; ctx.fillRect(0, e.ry, W, H - e.ry);
      ctx.fillStyle = key === 'space' ? '#3FF0FF' : '#D8D8D0'; ctx.fillRect(0, e.ry, W, 2);
      const dash = 46, dy = e.ry + (H - e.ry) * 0.62;
      ctx.fillStyle = key === 'space' ? '#FF4FD8' : '#F2F2EA';
      for (let x = -((e.x) % dash) - dash; x < W; x += dash) ctx.fillRect(x, dy, dash * 0.5, 3);
      // night shade over the land
      if (night > 0 && key !== 'space') {
        ctx.fillStyle = `rgba(8,12,40,${night * 0.5})`; ctx.fillRect(0, e.hy - H * 0.3, W, H);
      }
      // weather
      if (key === 'storm') {
        ctx.strokeStyle = 'rgba(190,200,230,0.45)'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (let k = 0; k < 70; k++) {
          const rx = (rnd(k, 61) * W + this.t * 60 - e.x * 0.1) % W, ry = (rnd(k, 62) * H + this.t * 700) % H;
          ctx.moveTo((rx + W) % W, ry); ctx.lineTo((rx + W) % W - 5, ry + 14);
        }
        ctx.stroke();
        if (alpha >= 1 && this.t > this.nextBolt) {
          this.flash = 0.75; this.nextBolt = this.t + 3 + Math.random() * 5;
          this._bolt = { x: W * (0.15 + Math.random() * 0.7), t: this.t };
        }
        if (this._bolt && this.t - this._bolt.t < 0.25) {
          ctx.strokeStyle = '#FFFBD0'; ctx.lineWidth = 3; ctx.beginPath();
          let bx = this._bolt.x, by = 0; ctx.moveTo(bx, by);
          for (let k = 0; k < 6; k++) { bx += (rnd(k, this._bolt.t) - 0.5) * 40; by += e.hy / 6; ctx.lineTo(bx, by); }
          ctx.stroke();
        }
      }
    }

    drawCelestial(e, key) {
      if (key === 'storm') return;
      const { ctx } = this;
      const d = ((e.day % 1) + 1) % 1;
      if (d > 0.02 && d < 0.7) {
        const k = (d - 0.02) / 0.68;
        const sx = e.W * (0.1 + 0.8 * k), sy = e.hy - Math.sin(k * Math.PI) * e.hy * 0.75;
        const warm = k > 0.75 || k < 0.12;
        const gg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 46);
        gg.addColorStop(0, warm ? 'rgba(255,170,90,0.55)' : 'rgba(255,245,200,0.55)'); gg.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(sx, sy, 46, 0, TAU); ctx.fill();
        ctx.fillStyle = warm ? '#FFB36B' : '#FFF4C2'; ctx.beginPath(); ctx.arc(sx, sy, 14, 0, TAU); ctx.fill();
      }
      if (d > 0.7 || d < 0.04) {
        const dd = d > 0.7 ? (d - 0.7) / 0.34 : (d + 0.3) / 0.34;
        const mx = e.W * (0.15 + 0.7 * dd), my = e.hy - Math.sin(dd * Math.PI) * e.hy * 0.65;
        ctx.fillStyle = '#F5F1DC'; ctx.beginPath(); ctx.arc(mx, my, 12, 0, TAU); ctx.fill();
        ctx.fillStyle = skyAt(e.day).top; ctx.beginPath(); ctx.arc(mx + 5, my - 3, 10, 0, TAU); ctx.fill();
      }
    }

    drawRider(e) {
      const { ctx } = this;
      const R = e.R, I = this.intensity;
      const bx = e.W * (this.compact ? 0.5 : 0.34), gy = e.gy;
      const bob = Math.sin(this.crank * 2) * R * 0.035 * Math.min(1, this.cadence / 60);
      const P = (x, y) => [bx + x * R, gy + y * R];
      const rear = P(-1.5, -1), front = P(1.5, -1), bb = P(-0.25, -0.8);
      const seat = P(-0.8, -2.35), headTop = P(1.05, -2.2), headBot = P(1.15, -1.75), bar = P(1.25, -2.45);

      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(bx, gy + 2, R * 2.4, R * 0.18, 0, 0, TAU); ctx.fill();
      // aura (Z6)
      if (this.zone >= 6) {
        for (let k = 0; k < 6; k++) {
          const a = this.t * 8 + k;
          const fx = bx - R * (1.5 + k * 0.5) - Math.sin(a) * 3, fy = gy - R * (1.3 + (k % 3) * 0.4);
          const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, R * (1.1 - k * 0.12));
          fg.addColorStop(0, 'rgba(255,240,150,0.9)'); fg.addColorStop(0.5, 'rgba(255,120,30,0.6)'); fg.addColorStop(1, 'rgba(255,60,0,0)');
          ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(fx, fy, R * (1.1 - k * 0.12), 0, TAU); ctx.fill();
        }
      }
      // speed lines
      if (this.speed > 38 || this.zone >= 5) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
        for (let k = 0; k < 5; k++) {
          const ly = gy - R * (0.6 + k * 0.55), len = R * (2 + rnd(k, Math.floor(this.t * 6)) * 2.5);
          const lx = bx - R * 2.6 - ((this.t * 900 + k * 70) % (R * 6));
          ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx - len, ly); ctx.stroke();
        }
      }
      // wheels
      for (const [wx, wy] of [rear, front]) {
        ctx.strokeStyle = '#1B1B1F'; ctx.lineWidth = R * 0.16; ctx.beginPath(); ctx.arc(wx, wy, R * 0.92, 0, TAU); ctx.stroke();
        ctx.strokeStyle = '#C9CCD3'; ctx.lineWidth = R * 0.05; ctx.beginPath(); ctx.arc(wx, wy, R * 0.78, 0, TAU); ctx.stroke();
        ctx.strokeStyle = 'rgba(220,224,232,0.8)'; ctx.lineWidth = 1;
        for (let k = 0; k < 6; k++) { const a = this.wheel + (k * Math.PI) / 3; ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + Math.cos(a) * R * 0.76, wy + Math.sin(a) * R * 0.76); ctx.stroke(); }
        ctx.fillStyle = '#2A2A2E'; ctx.beginPath(); ctx.arc(wx, wy, R * 0.1, 0, TAU); ctx.fill();
      }
      // far-side leg first (behind frame)
      const ca = this.crank;
      const crankL = R * 0.5;
      const pedA = [bb[0] + Math.cos(ca) * crankL, bb[1] + Math.sin(ca) * crankL];
      const pedB = [bb[0] + Math.cos(ca + Math.PI) * crankL, bb[1] + Math.sin(ca + Math.PI) * crankL];
      const hip = [seat[0] + R * 0.1, seat[1] - R * 0.15 + bob];
      this.drawLeg(hip, pedB, R, '#18203E');
      // frame
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = '#D7262E'; ctx.lineWidth = R * 0.17;
      ctx.beginPath();
      ctx.moveTo(rear[0], rear[1]); ctx.lineTo(bb[0], bb[1]); ctx.lineTo(headBot[0], headBot[1]); ctx.lineTo(headTop[0], headTop[1]);
      ctx.lineTo(seat[0] + R * 0.12, seat[1] + R * 0.25); ctx.lineTo(bb[0], bb[1]);
      ctx.moveTo(seat[0] + R * 0.12, seat[1] + R * 0.25); ctx.lineTo(rear[0], rear[1]);
      ctx.stroke();
      ctx.strokeStyle = '#B9BCC4'; ctx.lineWidth = R * 0.12;
      ctx.beginPath(); ctx.moveTo(headBot[0], headBot[1]); ctx.lineTo(front[0], front[1]); ctx.stroke();
      // bars + saddle
      ctx.strokeStyle = '#1B1B1F'; ctx.lineWidth = R * 0.12;
      ctx.beginPath(); ctx.moveTo(headTop[0], headTop[1]); ctx.lineTo(bar[0], bar[1]); ctx.quadraticCurveTo(bar[0] + R * 0.45, bar[1] + R * 0.05, bar[0] + R * 0.2, bar[1] + R * 0.5); ctx.stroke();
      ctx.fillStyle = '#1B1B1F'; ctx.beginPath(); ctx.ellipse(seat[0], seat[1] + R * 0.1, R * 0.38, R * 0.1, 0, 0, TAU); ctx.fill();
      // chainring + crank
      ctx.strokeStyle = '#8A8D96'; ctx.lineWidth = R * 0.08; ctx.beginPath(); ctx.arc(bb[0], bb[1], R * 0.3, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#2A2A2E'; ctx.lineWidth = R * 0.1;
      ctx.beginPath(); ctx.moveTo(pedB[0], pedB[1]); ctx.lineTo(pedA[0], pedA[1]); ctx.stroke();

      // gyoza body
      const lean = 0.14 + (this.zone >= 4 ? 0.06 : 0);
      const cx = seat[0] + R * 0.75, cy = seat[1] - R * 0.5 + bob;
      const w = R * 2.3, h = R * 1.35;
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(lean);
      const body = new Path2D();
      body.moveTo(-w / 2, 0);
      body.bezierCurveTo(-w * 0.36, -h * 1.28, w * 0.36, -h * 1.28, w / 2, 0);
      body.quadraticCurveTo(0, h * 0.32, -w / 2, 0);
      ctx.fillStyle = '#F6E8C8'; ctx.fill(body);
      ctx.save(); ctx.clip(body);
      const cg = ctx.createLinearGradient(0, -h * 0.3, 0, h * 0.3);
      cg.addColorStop(0, 'rgba(201,138,43,0)'); cg.addColorStop(0.45, 'rgba(214,150,60,0.85)'); cg.addColorStop(1, '#A8662A');
      ctx.fillStyle = cg; ctx.fillRect(-w, -h * 0.3, w * 2, h);
      ctx.restore();
      ctx.strokeStyle = '#6B4320'; ctx.lineWidth = Math.max(1.5, R * 0.07); ctx.stroke(body);
      // pleats along the ridge
      ctx.strokeStyle = '#D9C49B'; ctx.lineWidth = Math.max(1.2, R * 0.06);
      for (let k = 1; k <= 5; k++) {
        const tt = k / 6, mt = 1 - tt;
        const px = mt * mt * mt * (-w / 2) + 3 * mt * mt * tt * (-w * 0.36) + 3 * mt * tt * tt * (w * 0.36) + tt * tt * tt * (w / 2);
        const py = 3 * mt * mt * tt * (-h * 1.28) + 3 * mt * tt * tt * (-h * 1.28);
        ctx.beginPath(); ctx.moveTo(px - R * 0.12, py + R * 0.05); ctx.quadraticCurveTo(px, py + R * 0.35, px + R * 0.1, py + R * 0.45); ctx.stroke();
      }
      // headband from Z4
      if (this.zone >= 4) {
        const hbY = -h * 0.72;
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = R * 0.16;
        ctx.beginPath(); ctx.moveTo(w * 0.02, hbY - R * 0.05); ctx.quadraticCurveTo(w * 0.25, hbY + R * 0.12, w * 0.42, hbY + R * 0.38); ctx.stroke();
        const fl = Math.sin(this.t * 14) * R * 0.15;
        ctx.lineWidth = R * 0.1;
        ctx.beginPath(); ctx.moveTo(w * 0.02, hbY - R * 0.05); ctx.quadraticCurveTo(-w * 0.2, hbY - R * 0.2 + fl, -w * 0.42, hbY + fl * 1.5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(w * 0.02, hbY - R * 0.02); ctx.quadraticCurveTo(-w * 0.15, hbY + R * 0.1 - fl, -w * 0.36, hbY + R * 0.25 - fl); ctx.stroke();
        ctx.fillStyle = '#D7262E'; ctx.beginPath(); ctx.arc(w * 0.24, hbY + R * 0.1, R * 0.08, 0, TAU); ctx.fill();
      }
      // face
      this.drawFace(w, h, R, I);
      ctx.restore();

      // near-side leg and arm (in front)
      this.drawLeg(hip, pedA, R, '#22305A');
      const sh = [cx + Math.cos(lean) * w * 0.18 - Math.sin(lean) * (-h * 0.2), cy + Math.sin(lean) * w * 0.18 + Math.cos(lean) * (-h * 0.2)];
      const hand = [bar[0] + R * 0.12, bar[1] + R * 0.05];
      ctx.strokeStyle = '#6B4320'; ctx.lineWidth = R * 0.24; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sh[0], sh[1]); ctx.quadraticCurveTo((sh[0] + hand[0]) / 2, sh[1] + R * 0.35, hand[0], hand[1]); ctx.stroke();
      ctx.strokeStyle = '#F6E8C8'; ctx.lineWidth = R * 0.15;
      ctx.beginPath(); ctx.moveTo(sh[0], sh[1]); ctx.quadraticCurveTo((sh[0] + hand[0]) / 2, sh[1] + R * 0.35, hand[0], hand[1]); ctx.stroke();

      // emitters
      this._emit = { x: cx, y: cy - h * 0.9, R };
    }

    drawLeg(hip, ped, R, color) {
      const { ctx } = this;
      const L1 = R * 1.3, L2 = R * 1.3;
      const dx = ped[0] - hip[0], dy = ped[1] - hip[1];
      const d = Math.min(Math.hypot(dx, dy), L1 + L2 - 0.01);
      const base = Math.atan2(dy, dx);
      const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
      const k1 = [hip[0] + Math.cos(base - a) * L1, hip[1] + Math.sin(base - a) * L1];
      const k2 = [hip[0] + Math.cos(base + a) * L1, hip[1] + Math.sin(base + a) * L1];
      const knee = k1[0] > k2[0] ? k1 : k2;
      ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = R * 0.26;
      ctx.beginPath(); ctx.moveTo(hip[0], hip[1]); ctx.lineTo(knee[0], knee[1]); ctx.lineTo(ped[0], ped[1]); ctx.stroke();
      ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(ped[0], ped[1] - R * 0.05, R * 0.13, 0, TAU); ctx.fill();
      ctx.fillStyle = '#D7262E'; ctx.beginPath(); ctx.ellipse(ped[0] + R * 0.08, ped[1] + R * 0.04, R * 0.24, R * 0.12, 0, 0, TAU); ctx.fill();
    }

    drawFace(w, h, R, I) {
      const { ctx } = this;
      const ex1 = w * 0.18, ex2 = w * 0.34, ey = -h * 0.42;
      ctx.fillStyle = `rgba(255,120,130,${0.35 + clamp(I - 0.5, 0, 0.8) * 0.6})`;
      ctx.beginPath(); ctx.ellipse(w * 0.1, -h * 0.22, R * 0.16, R * 0.1, 0, 0, TAU); ctx.ellipse(w * 0.41, -h * 0.2, R * 0.12, R * 0.08, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#2B1C10'; ctx.fillStyle = '#2B1C10'; ctx.lineWidth = Math.max(1.6, R * 0.08); ctx.lineCap = 'round';
      if (I < 0.6) { // happy ^ ^
        for (const ex of [ex1, ex2]) { ctx.beginPath(); ctx.arc(ex, ey + R * 0.06, R * 0.11, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
      } else if (I < 1.05) { // dot eyes
        for (const ex of [ex1, ex2]) { ctx.beginPath(); ctx.ellipse(ex, ey, R * 0.07, R * 0.11, 0, 0, TAU); ctx.fill(); }
        if (I >= 0.9) { ctx.beginPath(); ctx.moveTo(ex1 - R * 0.12, ey - R * 0.22); ctx.lineTo(ex1 + R * 0.08, ey - R * 0.15); ctx.moveTo(ex2 - R * 0.06, ey - R * 0.15); ctx.lineTo(ex2 + R * 0.12, ey - R * 0.22); ctx.stroke(); }
      } else if (I < 1.2) { // > <
        ctx.beginPath(); ctx.moveTo(ex1 - R * 0.09, ey - R * 0.08); ctx.lineTo(ex1 + R * 0.06, ey); ctx.lineTo(ex1 - R * 0.09, ey + R * 0.08);
        ctx.moveTo(ex2 + R * 0.09, ey - R * 0.08); ctx.lineTo(ex2 - R * 0.06, ey); ctx.lineTo(ex2 + R * 0.09, ey + R * 0.08); ctx.stroke();
      } else { // fire eyes
        for (const ex of [ex1, ex2]) {
          ctx.fillStyle = '#FF7A1A'; ctx.beginPath(); ctx.moveTo(ex - R * 0.09, ey + R * 0.08);
          ctx.quadraticCurveTo(ex - R * 0.1, ey - R * 0.12, ex, ey - R * 0.2 - Math.sin(this.t * 20) * R * 0.04);
          ctx.quadraticCurveTo(ex + R * 0.1, ey - R * 0.12, ex + R * 0.09, ey + R * 0.08); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#FFE36B'; ctx.beginPath(); ctx.arc(ex, ey + R * 0.02, R * 0.045, 0, TAU); ctx.fill();
        }
      }
      ctx.fillStyle = '#2B1C10';
      const mx = w * 0.28, my = -h * 0.2;
      if (I < 0.9) { ctx.beginPath(); ctx.arc(mx, my - R * 0.04, R * 0.1, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
      else { const o = R * (0.06 + 0.05 * Math.abs(Math.sin(this.t * 6))); ctx.beginPath(); ctx.ellipse(mx, my, R * 0.08, o, 0, 0, TAU); ctx.fill(); }
    }

    drawParticles(e, dt) {
      const { ctx } = this;
      const em = this._emit;
      const I = this.intensity;
      if (em && this.cadence > 10) {
        if (Math.random() < clamp(I - 0.65, 0, 1.2) * dt * 10) {
          this.parts.push({ k: 'sweat', x: em.x + (Math.random() - 0.3) * em.R, y: em.y + em.R * 0.6, vx: -20 - Math.random() * 30, vy: -40 - Math.random() * 30, life: 1 });
        }
        if (I > 0.85 && Math.random() < dt * 6) {
          this.parts.push({ k: 'steam', x: em.x + (Math.random() - 0.5) * em.R * 1.6, y: em.y + em.R * 0.2, vx: -8, vy: -26, life: 1.4, ph: Math.random() * 6 });
        }
      }
      this.parts = this.parts.filter((p) => (p.life -= dt) > 0);
      for (const p of this.parts) {
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.k === 'sweat') {
          p.vy += 160 * dt;
          ctx.fillStyle = `rgba(120,200,255,${clamp(p.life, 0, 1)})`;
          ctx.beginPath(); ctx.moveTo(p.x, p.y - 4); ctx.quadraticCurveTo(p.x + 3, p.y + 1, p.x, p.y + 2); ctx.quadraticCurveTo(p.x - 3, p.y + 1, p.x, p.y - 4); ctx.fill();
        } else {
          ctx.strokeStyle = `rgba(255,255,255,${clamp(p.life / 1.4, 0, 1) * 0.7})`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(p.x, p.y);
          for (let k = 1; k <= 4; k++) ctx.lineTo(p.x + Math.sin(p.ph + k + this.t * 4) * 3, p.y - k * 4);
          ctx.stroke();
        }
      }
    }

    drawPops(e) {
      const { ctx } = this;
      this.pops = this.pops.filter((p) => this.t - p.t0 < 3.2);
      for (const p of this.pops) {
        const k = (this.t - p.t0) / 3.2;
        const bx = e.W * (this.compact ? 0.5 : 0.34) + e.R * 0.6;
        const y = e.gy - e.R * 5.3 - k * e.R * 1.6;
        const s = Math.min(1, k * 6) * (1 - Math.max(0, k - 0.8) * 5);
        ctx.save();
        ctx.globalAlpha = clamp(s, 0, 1);
        ctx.font = `${Math.round(e.R * 1.6 * (0.6 + 0.4 * Math.min(1, k * 6)))}px system-ui, "Apple Color Emoji", sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(p.e, bx, y);
        ctx.font = `bold ${Math.round(Math.max(13, e.R * 0.55))}px "Zen Kaku Gothic New", system-ui, sans-serif`;
        const tw = ctx.measureText(p.s).width + 18;
        ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#22305A'; ctx.lineWidth = 2;
        const by = y - e.R * 1.25;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx - tw / 2, by - 13, tw, 26, 13) : ctx.rect(bx - tw / 2, by - 13, tw, 26); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#22305A'; ctx.fillText(p.s, bx, by + 1);
        ctx.restore();
      }
    }
  }

  return { World, THEMES, skyAt, nightness };
})();
