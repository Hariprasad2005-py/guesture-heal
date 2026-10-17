// frontend/src/games/pushWallScene.js
//
// Phaser 4 scene for Push Wall. Owns physics + rendering ONLY. All clinical
// scoring, telemetry, difficulty decisions and pose-derived push detection
// live in PushWall.jsx (React) and are pushed into this scene through the
// small public API at the bottom of the class. This scene never reads
// MediaPipe data directly — it only reacts to registerPush()/setDifficulty()/
// setPaused() calls, so it stays testable and reusable independent of the
// camera pipeline.
//
// Coordinate system: internal game width/height is fixed at 800x600 and
// Phaser's Scale Manager (FIT mode, set by the caller) handles resizing to
// fit the container — so all positions below are authored against 800x600.

import Phaser from "phaser";

const GAME_W = 800;
const GAME_H = 600;
const IMPACT_Y = GAME_H * 0.82; // the line the wave must be pushed back before crossing
const SPAWN_Y = -40;

const TIERS = [
  { name: "wood", color: 0xb98a52, highlight: 0xd9b48a, value: 10, massMul: 1 },
  { name: "stone", color: 0x8a94a6, highlight: 0xb7c0d1, value: 20, massMul: 1.4 },
  { name: "gold", color: 0xe8b93a, highlight: 0xffe28a, value: 40, massMul: 1.9 },
];

function tierForDifficulty(difficultyName) {
  if (difficultyName === "Advanced") {
    // weighted toward stone/gold
    return TIERS[1 + Math.floor(Math.random() * 2)];
  }
  if (difficultyName === "Intermediate") {
    return TIERS[Math.floor(Math.random() * 2)];
  }
  return TIERS[0];
}

function lerpRgb(a, b, t) {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
}

export class PushWallScene extends Phaser.Scene {
  constructor() {
    super("PushWallScene");

    // --- external state, written by the React bridge ---
    this._difficultySettings = { spawnRate: 3500, objectSize: 150, speed: 0.35 };
    this._paused = false;
    this._handMarkers = { left: null, right: null };
    this._onEvent = null; // (type, payload) => void, set by attachEventSink()

    // --- internal state ---
    this._waves = []; // { blocks: [...], tier, cleared, x, spawnedAt }
    this._spawnTimer = null;
    this._comboGlow = 0; // 0..1, drives background pulse intensity
    this._bgLinesGroup = [];
  }

  // ---------------- Phaser lifecycle ----------------

  create() {
    this.cameras.main.setBackgroundColor("#0b1120");
    this._buildBackdrop();

    // Procedural particle texture (no external assets — keeps this
    // self-contained, matching the rest of the app's no-asset-pipeline
    // approach).
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(4, 4, 4);
    g.generateTexture("pw-particle", 8, 8);
    g.destroy();

    this._particles = this.add.particles(0, 0, "pw-particle", {
      lifespan: 500,
      speed: { min: 80, max: 260 },
      scale: { start: 1.1, end: 0 },
      alpha: { start: 1, end: 0 },
      emitting: false,
    });

    // Impact line (visual guide for where the danger zone starts)
    this._impactGlow = this.add.rectangle(GAME_W / 2, IMPACT_Y, GAME_W, 28, 0xef4444, 0.06);
    this.tweens.add({ targets: this._impactGlow, alpha: 0.22, duration: 900, yoyo: true, repeat: -1 });
    this._impactLine = this.add.rectangle(GAME_W / 2, IMPACT_Y, GAME_W, 3, 0xef4444, 0.55);

    // Ambient vertical "energy lines" backdrop for production feel.
    for (let i = 0; i < 10; i++) {
      const x = (i / 10) * GAME_W + 20;
      const line = this.add.rectangle(x, GAME_H / 2, 2, GAME_H, 0x1e293b, 0.5);
      this._bgLinesGroup.push(line);
    }

    // Hand markers (positions pushed in from React via setHandPositions)
    this._handMarkers.left = this.add.circle(-100, -100, 16, 0x22d3ee, 0.9).setStrokeStyle(3, 0xffffff, 0.8);
    this._handMarkers.right = this.add.circle(-100, -100, 16, 0xf97316, 0.9).setStrokeStyle(3, 0xffffff, 0.8);

    // "L" / "R" labels so patients can see which dot is which hand.
    const labelStyle = (color) => ({
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: "16px",
      fontStyle: "bold",
      color,
      stroke: "#0b1120",
      strokeThickness: 4,
    });
    this._handLabels = {
      left: this.add.text(-100, -100, "L", labelStyle("#67e8f9")).setOrigin(0.5).setDepth(30),
      right: this.add.text(-100, -100, "R", labelStyle("#fdba74")).setOrigin(0.5).setDepth(30),
    };

    // Symmetry link — a line drawn between the two hand markers each frame,
    // color-coded by how in-sync the two arms currently are. Gives the
    // patient continuous visual feedback on bilateral symmetry, not just at
    // the moment of a push.
    this._symmetryLine = this.add.graphics();

    this._scheduleNextWave(true);

    this.events.on("shutdown", () => this._cleanup());
    this.events.on("destroy", () => this._cleanup());
  }

  update(_time, deltaMs) {
    if (this._paused) return;
    const dt = deltaMs / 1000;

    // Advance each wave downward at a speed derived from difficulty.
    const fallSpeed = 40 + (this._difficultySettings.speed || 0.35) * 220;

    for (const wave of this._waves) {
      if (wave.cleared) {
        // Blocks are flying under physics: keep their highlight/glow attached.
        for (const block of wave.blocks) {
          if (!block.sprite.active) continue;
          block.highlight?.setPosition(block.sprite.x, block.sprite.y - block.size * 0.28);
          block.glow?.setPosition(block.sprite.x, block.sprite.y);
        }
        continue;
      }
      wave.y += fallSpeed * dt;
      for (const block of wave.blocks) {
        if (!block.sprite.active) continue;
        block.sprite.y = wave.y + block.offsetY;
        block.glow?.setPosition(block.sprite.x, block.sprite.y);
      }
      if (wave.y >= IMPACT_Y && !wave.breached) {
        wave.breached = true;
        this._breachWave(wave);
      }
    }

    // Drop fully-breached/cleared waves once their blocks are off-screen.
    this._waves = this._waves.filter((w) => {
      if (!w.breached && !w.cleared) return true;
      return w.blocks.some((b) => b.sprite.active);
    });

    // Fade the combo glow back down over time so it doesn't feel "stuck".
    if (this._comboGlow > 0) {
      this._comboGlow = Math.max(0, this._comboGlow - dt * 0.15);
      const alpha = 0.15 + this._comboGlow * 0.5;
      this._bgLinesGroup.forEach((l) => l.setFillStyle(0x1e293b, alpha));
    }
  }

  // Layered vertical gradient (navy -> indigo -> plum) plus twinkling stars.
  // Built from plain rectangles/circles so it needs no image assets.
  _buildBackdrop() {
    const top = [11, 17, 32];
    const mid = [30, 27, 75];
    const bottom = [72, 26, 70];
    const BANDS = 24;
    for (let i = 0; i < BANDS; i++) {
      const t = i / (BANDS - 1);
      const c = t < 0.6 ? lerpRgb(top, mid, t / 0.6) : lerpRgb(mid, bottom, (t - 0.6) / 0.4);
      const color = (c[0] << 16) | (c[1] << 8) | c[2];
      this.add
        .rectangle(GAME_W / 2, (i + 0.5) * (GAME_H / BANDS), GAME_W, GAME_H / BANDS + 1, color, 1)
        .setDepth(-10);
    }
    for (let i = 0; i < 42; i++) {
      const star = this.add
        .circle(Math.random() * GAME_W, Math.random() * GAME_H * 0.78, Math.random() * 1.4 + 0.5, 0xffffff, 0.2 + Math.random() * 0.5)
        .setDepth(-9);
      this.tweens.add({
        targets: star,
        alpha: 0.08,
        duration: 900 + Math.random() * 1800,
        yoyo: true,
        repeat: -1,
        delay: Math.random() * 1500,
      });
    }
  }

  // ---------------- wave lifecycle ----------------

  _scheduleNextWave(immediate = false) {
    if (this._spawnTimer) this._spawnTimer.remove();
    const delay = immediate ? 400 : (this._difficultySettings.spawnRate || 3500);
    this._spawnTimer = this.time.delayedCall(delay, () => {
      this._spawnWave();
      this._scheduleNextWave(false);
    });
  }

  _spawnWave() {
    if (this._paused) return;

    const settings = this._difficultySettings;
    const tier = tierForDifficulty(settings.difficultyName);
    const blockSize = Math.max(36, Math.min(64, (settings.objectSize || 100) * 0.42));
    const blockCount = 4;
    const spacing = blockSize + 10;
    const totalWidth = blockCount * spacing;
    const startX = GAME_W / 2 - totalWidth / 2 + spacing / 2;

    const blocks = [];
    for (let i = 0; i < blockCount; i++) {
      const x = startX + i * spacing;
      // Soft additive halo behind each block (colour = tier) for a glowing look.
      const glow = this.add.rectangle(x, SPAWN_Y, blockSize + 16, blockSize + 16, tier.color, 0.22);
      glow.setBlendMode(Phaser.BlendModes.ADD);
      const rect = this.add.rectangle(x, SPAWN_Y, blockSize, blockSize, tier.color, 1);
      rect.setStrokeStyle(2, 0x0b1120, 0.4);
      const highlight = this.add.rectangle(
        x,
        SPAWN_Y - blockSize * 0.28,
        blockSize * 0.82,
        blockSize * 0.22,
        tier.highlight,
        0.55
      );
      this.physics.add.existing(rect);
      rect.body.setAllowGravity(false);
      rect.body.setImmovable(true);

      blocks.push({ sprite: rect, highlight, glow, size: blockSize, offsetY: 0 });
    }

    this._waves.push({
      y: SPAWN_Y,
      blocks,
      tier,
      cleared: false,
      breached: false,
    });
  }

  _breachWave(wave) {
    // Wall reached the patient without a qualifying push — visual "impact"
    // feedback, then the wave's blocks are flung toward the camera/off the
    // bottom and cleaned up.
    this.cameras.main.shake(180, 0.006);
    this.cameras.main.flash(120, 239, 68, 68, false);
    this._particles.setParticleTint(0xef4444);
    this._particles.explode(24, GAME_W / 2, IMPACT_Y);

    wave.blocks.forEach((b) => {
      this.tweens.add({
        targets: [b.sprite, b.highlight, b.glow],
        y: "+=140",
        alpha: 0,
        duration: 380,
        ease: "Cubic.easeIn",
        onComplete: () => {
          b.sprite.destroy();
          b.highlight.destroy();
          b.glow?.destroy();
        },
      });
    });

    this._emit("wall-breach", { tier: wave.tier.name });
  }

  // ---------------- public API (called from PushWall.jsx) ----------------

  attachEventSink(fn) {
    this._onEvent = fn;
  }

  _emit(type, payload) {
    this._onEvent?.(type, payload);
  }

  setDifficulty(settings) {
    this._difficultySettings = { ...this._difficultySettings, ...settings };
  }

  setPaused(paused) {
    this._paused = paused;
    if (paused && this._spawnTimer) this._spawnTimer.paused = true;
    if (!paused && this._spawnTimer) this._spawnTimer.paused = false;
  }

  // Normalized 0-1 screen-space positions (0,0 = top-left), already mirrored
  // to match the mirrored camera feed shown alongside this canvas.
  setHandPositions(leftPct, rightPct) {
    if (!this._handMarkers.left || !this._handMarkers.right) return;

    const labels = this._handLabels || {};

    if (leftPct) {
      const lx = (leftPct.x / 100) * GAME_W;
      const ly = (leftPct.y / 100) * GAME_H;
      this._handMarkers.left.setPosition(lx, ly);
      this._handMarkers.left.setVisible(true);
      labels.left?.setPosition(lx, ly - 28).setVisible(true);
    } else {
      this._handMarkers.left.setVisible(false);
      labels.left?.setVisible(false);
    }

    if (rightPct) {
      const rx = (rightPct.x / 100) * GAME_W;
      const ry = (rightPct.y / 100) * GAME_H;
      this._handMarkers.right.setPosition(rx, ry);
      this._handMarkers.right.setVisible(true);
      labels.right?.setPosition(rx, ry - 28).setVisible(true);
    } else {
      this._handMarkers.right.setVisible(false);
      labels.right?.setVisible(false);
    }

    this._symmetryLine.clear();
    if (leftPct && rightPct) {
      const lx = (leftPct.x / 100) * GAME_W;
      const ly = (leftPct.y / 100) * GAME_H;
      const rx = (rightPct.x / 100) * GAME_W;
      const ry = (rightPct.y / 100) * GAME_H;
      const dy = Math.abs(ly - ry);
      // Green when arms are level (good symmetry), amber->red as they
      // diverge vertically — cheap, continuous, at-a-glance feedback.
      const color = dy < 30 ? 0x10b981 : dy < 70 ? 0xf59e0b : 0xef4444;
      this._symmetryLine.lineStyle(2, color, 0.55);
      this._symmetryLine.lineBetween(lx, ly, rx, ry);
    }
  }

  // Called when PushWall.jsx's bilateral push detector fires a qualifying
  // push. `force` is 0-1, `symmetry` is 0-1 (1 = perfectly even). Returns
  // a result object synchronously so React can score it immediately rather
  // than waiting on the next 'push-hit'/'push-early' event tick.
  registerPush(force = 1, symmetry = 1) {
    const target = this._waves.find((w) => !w.cleared && !w.breached && this._waveInRange(w));

    if (!target) {
      this._emit("push-early", {});
      return { hit: false };
    }

    target.cleared = true;
    if (this._spawnTimer) {
      /* wave already scheduled independently; nothing to cancel here */
    }

    const boostX = 180 + force * 260;
    const boostY = -(160 + force * 220);
    const tint = symmetry > 0.85 ? 0x10b981 : 0xffffff;

    target.blocks.forEach((b, i) => {
      const dir = i % 2 === 0 ? -1 : 1;
      b.sprite.body.setAllowGravity(true);
      b.sprite.body.setImmovable(false);
      b.sprite.body.setVelocity(dir * boostX * (0.6 + Math.random() * 0.6), boostY * (0.7 + Math.random() * 0.5));
      b.sprite.body.setAngularVelocity(dir * 260);
      this.tweens.add({
        targets: [b.sprite, b.highlight, b.glow],
        alpha: 0,
        duration: 650,
        delay: 150,
        onComplete: () => {
          b.sprite.destroy();
          b.highlight.destroy();
          b.glow?.destroy();
        },
      });
    });

    this._particles.setParticleTint(tint);
    this._particles.explode(30, GAME_W / 2, target.y);
    this.cameras.main.shake(120, 0.004 + force * 0.006);

    this._comboGlow = Math.min(1, this._comboGlow + 0.35);

    // Floating score + shockwave ring at the point of impact.
    const hitX = GAME_W / 2;
    const hitY = target.y;
    const scoreText = this.add
      .text(hitX, hitY, `+${target.tier.value}`, {
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: "36px",
        fontStyle: "bold",
        color: symmetry > 0.85 ? "#34d399" : "#ffffff",
        stroke: "#0b1120",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(50);
    this.tweens.add({
      targets: scoreText,
      y: hitY - 100,
      alpha: 0,
      duration: 850,
      ease: "Cubic.easeOut",
      onComplete: () => scoreText.destroy(),
    });
    const ring = this.add.circle(hitX, hitY, 30, 0xffffff, 0).setStrokeStyle(4, tint, 0.9).setDepth(40);
    this.tweens.add({
      targets: ring,
      scale: 6,
      alpha: 0,
      duration: 450,
      ease: "Cubic.easeOut",
      onComplete: () => ring.destroy(),
    });

    const result = { hit: true, tier: target.tier.name, value: target.tier.value, perfectSymmetry: symmetry > 0.85 };
    this._emit("push-hit", result);
    return result;
  }

  _waveInRange(wave) {
    // "In range" means the wave's leading edge is close enough to the
    // impact line to be a deliberate, well-timed push — not a wave still
    // near the top of the screen.
    return wave.y > IMPACT_Y - 220 && wave.y < IMPACT_Y + 30;
  }

  _cleanup() {
    if (this._spawnTimer) this._spawnTimer.remove();
  }
}

export function createPushWallGame(containerEl) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    width: GAME_W,
    height: GAME_H,
    parent: containerEl,
    transparent: false,
    backgroundColor: "#0b1120",
    physics: {
      default: "arcade",
      arcade: { gravity: { y: 0 }, debug: false },
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [PushWallScene],
  });
}

export default PushWallScene;
