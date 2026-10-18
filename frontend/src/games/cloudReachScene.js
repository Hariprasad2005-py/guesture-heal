// frontend/src/games/cloudReachScene.js
//
// Phaser scene for Cloud Reach. Draws ONLY: themed backdrop, the target, the
// home pad, the patient's arm (shoulder-elbow-hand), the hand cursor, the hold
// ring and pop effects. All rules (reach detection, scoring, levels,
// telemetry) stay in CloudReach.jsx and are pushed in through the small API at
// the bottom. Positions come in as percentages (0-100) of the stage. The stage
// resizes to fill its container (Scale.RESIZE), so everything is laid out from
// the live width/height.

import Phaser from "phaser";

export const THEMES = [
  { id: "sky", name: "Sunny Sky", sky: ["#7dd3fc", "#bae6fd", "#f0f9ff"], hills: [0xa7f3d0, 0x6ee7b7], puff: 0xffffff, label: "#0f172a", home: 0x0f766e, target: "cloud" },
  { id: "sunset", name: "Sunset Glow", sky: ["#fdba74", "#fb7185", "#c4b5fd"], hills: [0xc4b5fd, 0x8b5cf6], puff: 0xfff1f2, label: "#4c1d95", home: 0x7c3aed, target: "cloud" },
  { id: "ocean", name: "Deep Ocean", sky: ["#67e8f9", "#0ea5e9", "#075985"], hills: [0xfde68a, 0xfcd34d], puff: 0xe0f2fe, label: "#082f49", home: 0xffffff, target: "bubble" },
  { id: "night", name: "Starry Night", sky: ["#1e1b4b", "#3730a3", "#6d28d9"], hills: [0x312e81, 0x1e1b4b], puff: 0xc7d2fe, label: "#e0e7ff", home: 0xfde047, target: "star" },
];

export class CloudReachScene extends Phaser.Scene {
  constructor() {
    super("CloudReachScene");
    this._paused = false;
    this._home = { x: 50, y: 70, r: 7 };
    this._target = null;
    this._hold = 0;
    this._hand = null;
    this._arm = null;
    this._dwelling = false;
    this._trail = [];
    this._targetKey = null;
    this._themeIdx = 0;
    this._static = [];
    this._bg = [];
    this.onSize = null;
  }

  // ---------- geometry helpers ----------
  get W() { return this.scale.width; }
  get H() { return this.scale.height; }
  get K() { return this.scale.height / 600; } // size unit
  px(p) { return (p / 100) * this.W; }
  py(p) { return (p / 100) * this.H; }

  create() {
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(5, 5, 5);
    g.generateTexture("cr-dot", 10, 10);
    g.destroy();
    this._particles = this.add.particles(0, 0, "cr-dot", {
      lifespan: 700, speed: { min: 90, max: 280 }, scale: { start: 1.2, end: 0 },
      alpha: { start: 1, end: 0 }, gravityY: 160, emitting: false,
    }).setDepth(40);

    this._guide = this.add.graphics().setDepth(5);
    this._homeG = this.add.graphics().setDepth(6);
    this._homeLabel = this.add.text(0, 0, "HOME", {
      fontFamily: "Inter, system-ui, sans-serif", fontSize: "13px", fontStyle: "bold", color: "#0f766e",
    }).setOrigin(0.5).setDepth(6).setAlpha(0.85);
    this._trailG = this.add.graphics().setDepth(8);
    this._armG = this.add.graphics().setDepth(12);
    this._arcG = this.add.graphics().setDepth(3);

    this._cloudC = this.add.container(-300, -300).setDepth(10);
    this._cloudGlow = this.add.ellipse(0, 0, 200, 150, 0xfde047, 0);
    this._cloudShadow = this.add.ellipse(6, 14, 170, 90, 0x64748b, 0.18);
    this._cloudBody = this.add.graphics();
    this._holdG = this.add.graphics();
    this._cloudLabel = this.add.text(0, 0, "", {
      fontFamily: "Inter, system-ui, sans-serif", fontSize: "13px", fontStyle: "bold", color: "#0f172a",
      backgroundColor: "rgba(255,255,255,0.78)", padding: { x: 6, y: 2 },
    }).setOrigin(0.5);
    this._cloudC.add([this._cloudGlow, this._cloudShadow, this._cloudBody, this._holdG, this._cloudLabel]);
    this._cloudC.setVisible(false);

    this._handC = this.add.container(-300, -300).setDepth(20);
    this._handGlow = this.add.circle(0, 0, 34, 0x2563eb, 0.18);
    this._handDot = this.add.circle(0, 0, 15, 0x2563eb, 0.35).setStrokeStyle(5, 0xffffff, 0.95);
    this._handCore = this.add.circle(0, 0, 4, 0xffffff, 1);
    this._handC.add([this._handGlow, this._handDot, this._handCore]);
    this._handC.setVisible(false);
    this.tweens.add({ targets: this._handGlow, scale: 1.25, alpha: 0.08, duration: 800, yoyo: true, repeat: -1 });

    this._buildStatic();
    this.scale.on("resize", () => {
      this._buildStatic();
      this._redrawHome();
      this._targetKey = null;
      if (this._target) this.setTarget(this._target);
      this.onSize?.(this.W, this.H);
    });
    this.onSize?.(this.W, this.H);
    this._redrawHome();
  }

  // ---------- themed backdrop ----------
  _clearStatic() {
    this._static.forEach((o) => o.destroy());
    this._static = [];
    this._bg = [];
  }

  _buildStatic() {
    this._clearStatic();
    const th = THEMES[this._themeIdx];
    const W = this.W, H = this.H, K = this.K;
    const add = (o) => { this._static.push(o); return o; };

    const key = `cr-sky-${th.id}-${Math.round(H)}`;
    if (!this.textures.exists(key)) {
      const tex = this.textures.createCanvas(key, 4, Math.max(2, Math.round(H)));
      const ctx = tex.getContext();
      const grd = ctx.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, th.sky[0]); grd.addColorStop(0.55, th.sky[1]); grd.addColorStop(1, th.sky[2]);
      ctx.fillStyle = grd; ctx.fillRect(0, 0, 4, H); tex.refresh();
    }
    add(this.add.image(W / 2, H / 2, key).setDisplaySize(W, H).setDepth(0));

    if (th.id === "sky") {
      add(this.add.circle(W - 120 * K, 90 * K, 70 * K, 0xfef08a, 0.35).setDepth(1));
      add(this.add.circle(W - 120 * K, 90 * K, 44 * K, 0xfde047, 0.9).setDepth(1));
    } else if (th.id === "sunset") {
      add(this.add.circle(W * 0.5, H * 0.78, 130 * K, 0xfef3c7, 0.25).setDepth(1));
      add(this.add.circle(W * 0.5, H * 0.78, 78 * K, 0xfb923c, 0.95).setDepth(1));
    } else if (th.id === "night") {
      add(this.add.circle(W - 130 * K, 100 * K, 60 * K, 0xe0e7ff, 0.18).setDepth(1));
      add(this.add.circle(W - 130 * K, 100 * K, 36 * K, 0xfef9c3, 1).setDepth(1));
      for (let i = 0; i < 50; i++) {
        const s = add(this.add.circle(Phaser.Math.Between(0, W), Phaser.Math.Between(0, H * 0.8), Phaser.Math.FloatBetween(1, 2.6), 0xffffff, 0.8).setDepth(1));
        this.tweens.add({ targets: s, alpha: 0.15, duration: Phaser.Math.Between(700, 1800), yoyo: true, repeat: -1, delay: Phaser.Math.Between(0, 1200) });
      }
    }

    // ground / seabed
    const gnd = add(this.add.graphics().setDepth(1));
    gnd.fillStyle(th.hills[0], 0.9);
    gnd.fillEllipse(W * 0.22, H + 20 * K, W * 0.8, 170 * K);
    gnd.fillStyle(th.hills[1], 0.95);
    gnd.fillEllipse(W * 0.75, H + 40 * K, W * 0.9, 190 * K);
    if (th.id === "ocean") {
      for (let i = 0; i < 7; i++) {
        const x = (i + 0.5) * (W / 7);
        gnd.lineStyle(5, 0x34d399, 0.9);
        gnd.beginPath(); gnd.moveTo(x, H);
        gnd.lineTo(x - 8, H - 40 * K); gnd.lineTo(x + 6, H - 80 * K); gnd.strokePath();
      }
    }

    // drifting background clouds / rising bubbles
    const n = th.id === "ocean" ? 16 : 6;
    for (let i = 0; i < n; i++) {
      let o;
      if (th.id === "ocean") {
        const r = Phaser.Math.Between(5, 16) * K;
        o = add(this.add.circle(0, 0, r, 0xffffff, 0.22).setStrokeStyle(2, 0xffffff, 0.5).setDepth(2));
        o.setPosition(Phaser.Math.Between(0, W), Phaser.Math.Between(0, H));
        o._vy = -Phaser.Math.FloatBetween(14, 38); o._vx = 0;
      } else {
        o = add(this._makePuff(Phaser.Math.Between(40, 90) * K, th.puff, th.id === "night" ? 0.18 : 0.55));
        o.setPosition(Phaser.Math.Between(0, W), 50 * K + i * (H / 8)).setDepth(2);
        o._vx = Phaser.Math.FloatBetween(4, 12); o._vy = 0;
      }
      this._bg.push(o);
    }
    this._homeLabel?.setColor(th.id === "night" || th.id === "ocean" ? "#ffffff" : "#" + th.home.toString(16).padStart(6, "0"));
  }

  _makePuff(size, color, alpha) {
    const c = this.add.container(0, 0);
    [[0, 0, size, size * 0.62], [-size * 0.5, size * 0.1, size * 0.7, size * 0.5],
      [size * 0.5, size * 0.12, size * 0.75, size * 0.5], [-size * 0.12, -size * 0.25, size * 0.6, size * 0.55]]
      .forEach(([x, y, w, h]) => c.add(this.add.ellipse(x, y, w, h, color, alpha)));
    return c;
  }

  update(_t, dt) {
    if (this._paused) return;
    const W = this.W, H = this.H;
    this._bg.forEach((o) => {
      o.x += (o._vx * dt) / 1000; o.y += (o._vy * dt) / 1000;
      if (o.x > W + 140) o.x = -140;
      if (o.y < -30) { o.y = H + 30; o.x = Phaser.Math.Between(0, W); }
    });
    if (this._hand) {
      this._trail.push({ x: this._hand.x, y: this._hand.y });
      if (this._trail.length > 16) this._trail.shift();
    } else if (this._trail.length) this._trail.shift();
    this._trailG.clear();
    this._trail.forEach((p, i) => {
      const k = (i + 1) / this._trail.length;
      this._trailG.fillStyle(this._dwelling ? 0x14b8a6 : 0x3b82f6, k * 0.35);
      this._trailG.fillCircle(this.px(p.x), this.py(p.y), (3 + k * 7) * this.K);
    });
    if (this._cloudC.visible && this._target && !this._popping && this._targetBob !== undefined) {
      this._targetBob += dt / 600;
      this._cloudC.y = this.py(this._target.y) + Math.sin(this._targetBob) * 4 * this.K;
    }
  }

  _redrawHome() {
    const g = this._homeG; if (!g) return;
    g.clear();
    const th = THEMES[this._themeIdx];
    const x = this.px(this._home.x), y = this.py(this._home.y), r = this._home.r * (this.H / 100);
    g.fillStyle(th.home, 0.14); g.fillCircle(x, y, r);
    g.lineStyle(3, th.home, 0.7); g.strokeCircle(x, y, r);
    g.lineStyle(2, th.home, 0.4); g.strokeCircle(x, y, r * 0.55);
    this._homeLabel.setPosition(x, y + r + 12);
  }

  _drawTarget(s, holding) {
    const th = THEMES[this._themeIdx];
    const g = this._cloudBody; g.clear();
    if (th.target === "bubble") {
      g.fillStyle(0xffffff, 0.22); g.fillCircle(0, 0, s * 0.95);
      g.lineStyle(4, holding ? 0x2dd4bf : 0xffffff, 0.95); g.strokeCircle(0, 0, s * 0.95);
      g.fillStyle(0xffffff, 0.75); g.fillEllipse(-s * 0.35, -s * 0.38, s * 0.35, s * 0.22);
      g.fillStyle(0xffffff, 0.35); g.fillCircle(s * 0.3, s * 0.35, s * 0.12);
      return;
    }
    if (th.target === "star") {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 === 0 ? s * 0.95 : s * 0.42;
        pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
      }
      g.fillStyle(holding ? 0xfef08a : 0xfde047, 1); g.fillPoints(pts, true);
      g.lineStyle(4, 0xffffff, 0.9); g.strokePoints(pts, true);
      return;
    }
    const fill = holding ? 0xf0fdfa : th.puff;
    g.fillStyle(0xcbd5e1, 0.5); g.fillEllipse(0, s * 0.28, s * 1.7, s * 0.55);
    g.fillStyle(fill, 1);
    g.fillEllipse(0, 0, s * 1.6, s * 0.9);
    g.fillEllipse(-s * 0.55, s * 0.1, s * 1.0, s * 0.75);
    g.fillEllipse(s * 0.55, s * 0.12, s * 1.05, s * 0.75);
    g.fillEllipse(-s * 0.15, -s * 0.32, s * 0.95, s * 0.8);
    g.fillEllipse(s * 0.3, -s * 0.22, s * 0.75, s * 0.65);
    g.lineStyle(3, holding ? 0x14b8a6 : 0xbfdbfe, 1); g.strokeEllipse(0, 0, s * 1.6, s * 0.9);
    g.fillStyle(0x64748b, 0.8); g.fillCircle(-s * 0.18, s * 0.02, 4); g.fillCircle(s * 0.18, s * 0.02, 4);
    g.lineStyle(3, 0x64748b, 0.8); g.beginPath(); g.arc(0, s * 0.06, s * 0.14, 0.2, Math.PI - 0.2, false); g.strokePath();
  }

  _drawHold() {
    const g = this._holdG; g.clear();
    if (!this._target) return;
    const r = this._targetRadius() + 14 * this.K;
    g.lineStyle(8, this._handRing || 0xffffff, this._handRing ? 0.85 : 0.5); g.strokeCircle(0, 0, r);
    if (this._hold > 0) {
      g.lineStyle(8, 0xf59e0b, 1); g.beginPath();
      g.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * Math.min(100, this._hold)) / 100, false);
      g.strokePath();
    }
  }

  _targetRadius() { return this._target ? this._target.size * 0.8 * this.K : 70; }

  _drawArm() {
    const g = this._armG; g.clear();
    if (!this._arm || !this._hand) return;
    const s = { x: this.px(this._arm.shoulder.x), y: this.py(this._arm.shoulder.y) };
    const e = { x: this.px(this._arm.elbow.x), y: this.py(this._arm.elbow.y) };
    const h = { x: this.px(this._hand.x), y: this.py(this._hand.y) };
    const th = THEMES[this._themeIdx];
    const dark = th.id === "night" || th.id === "ocean";
    g.lineStyle(9 * this.K, dark ? 0xffffff : 0x0f172a, 0.12);
    g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(e.x, e.y); g.lineTo(h.x, h.y); g.strokePath();
    g.lineStyle(5 * this.K, 0xfb923c, 0.95);
    g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(e.x, e.y); g.lineTo(h.x, h.y); g.strokePath();
    g.fillStyle(0x4ade80, 1); g.fillCircle(s.x, s.y, 8 * this.K);
    g.lineStyle(3, 0xffffff, 0.9); g.strokeCircle(s.x, s.y, 8 * this.K);
    g.fillStyle(0xfb923c, 1); g.fillCircle(e.x, e.y, 6 * this.K);
  }

  // ---------------- public API (called from React) ----------------
  setTheme(idx) {
    const i = ((idx % THEMES.length) + THEMES.length) % THEMES.length;
    if (i === this._themeIdx) return THEMES[i];
    this._themeIdx = i;
    this._buildStatic(); this._redrawHome(); this._targetKey = null;
    if (this._target) this.setTarget(this._target);
    return THEMES[i];
  }

  setHome(x, y, r) { this._home = { x, y, r }; this._redrawHome(); }

  setTarget(t) {
    if (!t) {
      this._target = null; this._targetKey = null; this._guide.clear();
      if (!this._popping) this._cloudC.setVisible(false);
      return;
    }
    const key = `${t.x}|${t.y}|${t.size}|${this._themeIdx}|${Math.round(this.H)}`;
    const isNew = key !== this._targetKey;
    this._target = t; this._targetKey = key;
    this._cloudC.setVisible(true);
    const s = t.size * 0.8 * this.K;
    if (isNew) {
      this.tweens.killTweensOf(this._cloudC);
      this._popping = false;
      this._cloudC.setPosition(this.px(t.x), this.py(t.y));
      this._cloudC.setScale(0.2).setAlpha(0);
      this.tweens.add({ targets: this._cloudC, scale: 1, alpha: 1, duration: 380, ease: "Back.Out" });
      this._targetBob = 0;
      this._cloudGlow.setSize(s * 2.6, s * 2);
      this._cloudShadow.setSize(s * 1.9, s * 0.9);
      const th = THEMES[this._themeIdx];
      const handTxt = t.hand ? (t.hand === "left" ? "LEFT HAND  " : "RIGHT HAND  ") : "";
      this._cloudLabel.setPosition(0, -s * 1.12).setText(handTxt + (t.label || "")).setColor(th.id === "night" ? "#1e1b4b" : "#0f172a");
      this._handRing = t.hand === "left" ? 0x22d3ee : t.hand === "right" ? 0xf97316 : 0xffffff;
      this._guide.clear();
      this._guide.lineStyle(3, th.id === "night" || th.id === "ocean" ? 0xffffff : 0x0f172a, 0.22);
      const x1 = this.px(this._home.x), y1 = this.py(this._home.y), x2 = this.px(t.x), y2 = this.py(t.y);
      const n = Math.max(2, Math.floor(Math.hypot(x2 - x1, y2 - y1) / 22));
      for (let i = 0; i < n; i += 2) {
        const a = i / n, b = Math.min(1, (i + 1) / n);
        this._guide.lineBetween(x1 + (x2 - x1) * a, y1 + (y2 - y1) * a, x1 + (x2 - x1) * b, y1 + (y2 - y1) * b);
      }
    }
    this._drawTarget(s, !!t.holding);
    this._cloudGlow.setAlpha(t.holding ? 0.35 : 0);
    this._drawHold();
  }

  setHold(progress) { this._hold = progress || 0; this._drawHold(); }

  setHand(pos, dwelling, side) {
    this._dwelling = !!dwelling;
    if (!pos) { this._hand = null; this._handC.setVisible(false); this._armG?.clear(); return; }
    this._hand = pos;
    this._handC.setVisible(true).setPosition(this.px(pos.x), this.py(pos.y));
    const col = dwelling ? 0x14b8a6 : side === "left" ? 0x06b6d4 : side === "right" ? 0xf97316 : 0x2563eb;
    this._handDot.setFillStyle(col, 0.4);
    this._handGlow.setFillStyle(col, 0.18);
    this._drawArm();
  }

  setArm(arm) { this._arm = arm; this._drawArm(); }

  // Shows the arc the patient can be asked to reach into at this level: a soft
  // fan around the shoulder, with a faint ring where a cloud can appear.
  setArc(anchor, positions) {
    const key = `${anchor.x}|${positions.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(";")}|${Math.round(this.W)}x${Math.round(this.H)}|${this._themeIdx}`;
    if (key === this._arcKey) return;
    this._arcKey = key;
    const g = this._arcG; g.clear();
    if (!positions.length) return;
    const th = THEMES[this._themeIdx];
    const light = th.id === "night" || th.id === "ocean" ? 0xffffff : 0x0f172a;
    const ax = this.px(anchor.x), ay = this.py(anchor.y);
    let minA = Infinity, maxA = -Infinity, maxR = 0;
    positions.forEach((p) => {
      const dx = this.px(p.x) - ax, dy = this.py(p.y) - ay;
      const a = Math.atan2(dy, dx);
      minA = Math.min(minA, a); maxA = Math.max(maxA, a);
      maxR = Math.max(maxR, Math.hypot(dx, dy));
    });
    const pad = 0.16;
    const r = maxR + 70 * this.K;
    g.fillStyle(light, 0.06);
    g.beginPath(); g.moveTo(ax, ay); g.arc(ax, ay, r, minA - pad, maxA + pad, false); g.closePath(); g.fillPath();
    g.lineStyle(2, light, 0.22);
    g.beginPath(); g.arc(ax, ay, r, minA - pad, maxA + pad, false); g.strokePath();
    g.lineStyle(2, light, 0.14);
    g.lineBetween(ax, ay, ax + Math.cos(minA - pad) * r, ay + Math.sin(minA - pad) * r);
    g.lineBetween(ax, ay, ax + Math.cos(maxA + pad) * r, ay + Math.sin(maxA + pad) * r);
    positions.forEach((p) => {
      g.lineStyle(2, light, 0.25);
      g.strokeCircle(this.px(p.x), this.py(p.y), 14 * this.K);
    });
  }

  levelUp(text) {
    const t = this.add.text(this.W / 2, this.H * 0.3, text, {
      fontFamily: "Inter, system-ui, sans-serif", fontSize: `${Math.round(40 * this.K)}px`, fontStyle: "bold", color: "#ffffff",
      stroke: "#0f766e", strokeThickness: 8,
    }).setOrigin(0.5).setDepth(60).setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 350, ease: "Back.Out" });
    this.tweens.add({ targets: t, alpha: 0, y: t.y - 40, delay: 1500, duration: 500, onComplete: () => t.destroy() });
    this._particles.setParticleTint(0xfde047);
    this._particles.explode(40, this.W / 2, this.H * 0.3);
  }

  popAt(xPct, yPct, label = "+1") {
    const x = this.px(xPct), y = this.py(yPct);
    this._particles.setParticleTint(0xfde047); this._particles.explode(26, x, y);
    this._particles.setParticleTint(0xffffff); this._particles.explode(14, x, y);
    const t = this.add.text(x, y - 20, label, {
      fontFamily: "Inter, system-ui, sans-serif", fontSize: `${Math.round(34 * this.K)}px`, fontStyle: "bold", color: "#f59e0b",
      stroke: "#ffffff", strokeThickness: 6,
    }).setOrigin(0.5).setDepth(50);
    this.tweens.add({ targets: t, y: y - 90 * this.K, alpha: 0, duration: 800, onComplete: () => t.destroy() });
    this._popping = true;
    this.tweens.add({
      targets: this._cloudC, scale: 1.5, alpha: 0, duration: 260,
      onComplete: () => { if (this._popping) { this._popping = false; if (!this._target) this._cloudC.setVisible(false); } },
    });
  }

  missPuff() {
    if (!this._target) return;
    this._popping = true;
    this.tweens.add({
      targets: this._cloudC, alpha: 0, duration: 420,
      onComplete: () => { if (this._popping) { this._popping = false; if (!this._target) this._cloudC.setVisible(false); } },
    });
  }

  setPaused(p) { this._paused = !!p; }
}

export function createCloudReachGame(containerEl) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: containerEl,
    transparent: false,
    backgroundColor: "#bae6fd",
    scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
    scene: [CloudReachScene],
  });
}

export default CloudReachScene;
