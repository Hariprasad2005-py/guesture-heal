// frontend/src/utils/researchLogger.js
//
// Instrumentation for the paper's empirical evaluation (latency, landmark
// detection rate, metric repeatability). It does NOTHING unless explicitly
// switched on, so normal patients/therapists never pay any cost:
//
//   1. Open the app once with  ?research=1  on the URL, e.g.
//        http://localhost:5173/?research=1
//      (the switch is remembered for that browser tab via sessionStorage)
//   2. In the browser console:
//        __research.start('normal')      // before a test run: normal | low_light | rapid
//        ... play the game ...
//        __research.stop()
//        __research.download()           // saves the CSV
//
// One CSV row == one frame that was handed to MediaPipe. That matters for
// the detection-rate test: frames where tracking FAILED are rows too
// (landmarks_valid = 0), otherwise the rate would be inflated.
//
// Latency definition (state this in the paper): time from the moment the
// frame is passed to MediaPipe (t0) to the first game-loop tick that reads
// that frame (t1). It is software processing latency; it does not include
// camera sensor/driver/exposure delay.

const VALID_VIS = 0.5;       // landmark visibility above this counts as "present"
const MS_WINDOW = 30;        // rolling window (frames) for movement smoothness
const HEADERS = [
  'timestamp', 'frame_id', 'inference_ms', 'latency_ms', 'landmarks_valid',
  'tracked_side', 'ROM', 'BS', 'MS', 'TI', 'condition', 'session_id',
];

function readEnabled() {
  try {
    if (typeof window === 'undefined') return false;
    const q = new URLSearchParams(window.location.search).get('research');
    if (q === '1') window.sessionStorage.setItem('gh_research', '1');
    if (q === '0') window.sessionStorage.removeItem('gh_research');
    return window.sessionStorage.getItem('gh_research') === '1';
  } catch {
    return false;
  }
}

const armValid = (s, e, w) =>
  (s?.visibility ?? 0) > VALID_VIS &&
  (e?.visibility ?? 0) > VALID_VIS &&
  (w?.visibility ?? 0) > VALID_VIS;

class ResearchLogger {
  constructor() {
    this.enabled = readEnabled();
    this.rows = [];
    this.rowByFrame = new Map();
    this.sessionId = null;
    this.condition = null;
    this.running = false;
    this._lastWrist = null;       // previous tracked-wrist position, for TI
    this._velHistory = [];        // recent wrist speeds, for MS
    this._lastSpeed = null;
    this._deltaV = [];            // recent |change in speed|, for MS
  }

  // ---- session control ----------------------------------------------------
  start(condition = 'normal') {
    if (!this.enabled) return console.warn('[research] not enabled. Reload with ?research=1');
    this.sessionId = `${condition}_${Date.now()}`;
    this.condition = condition;
    this.running = true;
    this._lastWrist = null;
    this._lastSpeed = null;
    this._deltaV = [];
    console.log(`[research] STARTED ${this.sessionId}`);
  }

  stop() {
    if (!this.running) return;
    const n = this.rows.filter((r) => r.session_id === this.sessionId).length;
    console.log(`[research] STOPPED ${this.sessionId} — ${n} frames logged`);
    this.running = false;
  }

  // ---- called from the pose hook, once per frame handed to MediaPipe ------
  // `pose` is the object the hook already builds ({ raw, leftFlexion, ... }).
  // Pass pose = null when MediaPipe returned no landmarks / threw.
  beginFrame(frameId, t0, inferenceMs, pose) {
    if (!this.enabled || !this.running) return;

    const row = {
      timestamp: new Date().toISOString(),
      frame_id: frameId,
      inference_ms: Number(inferenceMs.toFixed(2)),
      latency_ms: '',
      landmarks_valid: 0,
      tracked_side: '',
      ROM: '', BS: '', MS: '', TI: '',
      condition: this.condition,
      session_id: this.sessionId,
      _t0: t0,
    };

    if (pose?.raw) {
      const r = pose.raw;
      const leftOk = armValid(r.leftShoulder, r.leftElbow, r.leftWrist);
      const rightOk = armValid(r.rightShoulder, r.rightElbow, r.rightWrist);

      if (leftOk || rightOk) {
        row.landmarks_valid = 1;

        // Tracked arm = the valid arm that is raised higher (the one doing
        // the exercise). If only one chain is valid, use that one.
        let side = leftOk ? 'left' : 'right';
        if (leftOk && rightOk) side = pose.leftFlexion >= pose.rightFlexion ? 'left' : 'right';
        const wrist = side === 'left' ? r.leftWrist : r.rightWrist;
        row.tracked_side = side;

        // ROM: shoulder flexion angle (deg) of the tracked arm this frame.
        // Per-session ROM is computed by the analysis script (P95 - P5).
        row.ROM = Number((side === 'left' ? pose.leftFlexion : pose.rightFlexion).toFixed(2));

        // BS: bilateral asymmetry = |left wrist y - right wrist y| in
        // normalized image units (0 = perfectly level). Only meaningful when
        // BOTH wrists are visible; blank otherwise.
        if ((r.leftWrist?.visibility ?? 0) > VALID_VIS && (r.rightWrist?.visibility ?? 0) > VALID_VIS) {
          row.BS = Number(Math.abs(r.leftWrist.y - r.rightWrist.y).toFixed(4));
        }

        // TI: frame-to-frame displacement of the tracked wrist
        // (normalized units). Jitter proxy; higher = shakier.
        if (this._lastWrist) {
          const d = Math.hypot(wrist.x - this._lastWrist.x, wrist.y - this._lastWrist.y);
          row.TI = Number(d.toFixed(5));

          // MS: mean |change in wrist speed| over the last MS_WINDOW frames.
          // Lower = smoother. (speed = displacement per frame)
          if (this._lastSpeed !== null) {
            this._deltaV.push(Math.abs(d - this._lastSpeed));
            if (this._deltaV.length > MS_WINDOW) this._deltaV.shift();
            if (this._deltaV.length >= MS_WINDOW) {
              row.MS = Number((this._deltaV.reduce((a, b) => a + b, 0) / this._deltaV.length).toFixed(6));
            }
          }
          this._lastSpeed = d;
        }
        this._lastWrist = { x: wrist.x, y: wrist.y };
      } else {
        this._lastWrist = null; this._lastSpeed = null; this._deltaV = [];
      }
    } else {
      this._lastWrist = null; this._lastSpeed = null; this._deltaV = [];
    }

    this.rows.push(row);
    this.rowByFrame.set(frameId, row);
  }

  // ---- called from the game loop when it first reads a frame --------------
  completeFrame(frameId) {
    if (!this.enabled || !this.running) return;
    const row = this.rowByFrame.get(frameId);
    if (!row || row.latency_ms !== '') return;
    row.latency_ms = Number((performance.now() - row._t0).toFixed(2));
  }

  // ---- export -------------------------------------------------------------
  download(filename = `gestureheal_${this.condition || 'log'}_${Date.now()}.csv`) {
    const lines = [HEADERS.join(',')];
    this.rows.forEach((r) => lines.push(HEADERS.map((h) => r[h]).join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    console.log(`[research] exported ${this.rows.length} rows -> ${filename}`);
  }

  clear() { this.rows = []; this.rowByFrame.clear(); }
  get rowCount() { return this.rows.length; }

  // ---- plain-text report: everything the paper needs, computed in-browser --
  report() {
    const num = (v) => (v === '' || v === undefined ? null : Number(v));
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const sd = (a) => {
      if (a.length < 2) return 0;
      const m = mean(a);
      return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
    };
    const pct = (a, p) => {
      if (!a.length) return NaN;
      const s = [...a].sort((x, y) => x - y);
      const k = ((s.length - 1) * p) / 100;
      const lo = Math.floor(k), hi = Math.ceil(k);
      return s[lo] + (s[hi] - s[lo]) * (k - lo);
    };
    const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : 'n/a');
    const f3 = (x) => (Number.isFinite(x) ? x.toFixed(4) : 'n/a');

    const sessions = new Map();
    this.rows.forEach((r) => {
      if (!sessions.has(r.session_id)) sessions.set(r.session_id, []);
      sessions.get(r.session_id).push(r);
    });

    const L = [];
    const vid = typeof document !== 'undefined' ? document.querySelector('video') : null;
    L.push('GESTUREHEAL RESEARCH REPORT');
    L.push(`Browser: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a'}`);
    L.push(`CPU threads: ${typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 'n/a'} | Screen: ${typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : 'n/a'}`);
    L.push(`Camera stream: ${vid && vid.videoWidth ? `${vid.videoWidth}x${vid.videoHeight}` : 'n/a (no video element on this page)'}`);
    L.push(`Runs: ${sessions.size} | Frames logged: ${this.rows.length}`);

    // Test 1 — latency
    const lat = this.rows.map((r) => num(r.latency_ms)).filter((v) => v !== null);
    const inf = this.rows.map((r) => num(r.inference_ms)).filter((v) => v !== null);
    const validN = this.rows.filter((r) => r.landmarks_valid === 1).length;
    L.push('', 'TEST 1 - LATENCY (software only: frame to MediaPipe -> game loop reads it)');
    if (lat.length) {
      L.push(`  end-to-end: mean ${f1(mean(lat))} +/- ${f1(sd(lat))} ms, p95 ${f1(pct(lat, 95))} ms, n=${lat.length}`);
      L.push(`  model inference only: mean ${f1(mean(inf))} +/- ${f1(sd(inf))} ms, p95 ${f1(pct(inf, 95))} ms`);
      L.push(`  frames the game actually reflected: ${lat.length}/${validN} valid frames (${f1((100 * lat.length) / Math.max(1, validN))}%)`);
    } else {
      L.push('  NO latency values. The game loop was not running while recording (start recording during active play).');
    }

    // Test 2 — detection rate per condition
    L.push('', 'TEST 2 - LANDMARK DETECTION RATE (shoulder+elbow+wrist all visibility > 0.5)');
    const byCond = new Map();
    sessions.forEach((rs) => {
      const c = rs[0].condition;
      if (!byCond.has(c)) byCond.set(c, []);
      byCond.get(c).push(rs);
    });
    byCond.forEach((runs, c) => {
      const all = runs.flat();
      const rates = runs.map((rs) => (100 * rs.filter((r) => r.landmarks_valid === 1).length) / rs.length);
      const pooled = (100 * all.filter((r) => r.landmarks_valid === 1).length) / all.length;
      L.push(`  ${c}: ${f1(pooled)}% over ${all.length} frames | per-run ${f1(mean(rates))} +/- ${f1(sd(rates))}% (runs=${runs.length})`);
    });

    // Test 3 — repeatability across 'normal' runs
    L.push('', "TEST 3 - REPEATABILITY (CV across 'normal' runs)");
    const normal = byCond.get('normal') || [];
    const perRun = normal.map((rs) => {
      const v = rs.filter((r) => r.landmarks_valid === 1);
      const col = (k) => v.map((r) => num(r[k])).filter((x) => x !== null);
      const rom = col('ROM'), bs = col('BS'), ms = col('MS'), ti = col('TI');
      const t = rs.map((r) => Date.parse(r.timestamp));
      const dur = (Math.max(...t) - Math.min(...t)) / 1000;
      return {
        ROM: rom.length > 10 ? pct(rom, 95) - pct(rom, 5) : null,
        BS: bs.length ? mean(bs) : null,
        MS: ms.length ? mean(ms) : null,
        TI: ti.length ? mean(ti) : null,
        fps: dur > 0 ? rs.length / dur : NaN,
      };
    });
    if (normal.length < 3) {
      L.push(`  need at least 3 'normal' runs, have ${normal.length}`);
    } else {
      L.push(`  runs=${normal.length} | frame rate per run: ${perRun.map((p) => f1(p.fps)).join(', ')} FPS`);
      ['ROM', 'BS', 'MS', 'TI'].forEach((k) => {
        const vals = perRun.map((p) => p[k]).filter((x) => x !== null);
        if (vals.length < 3) { L.push(`  ${k}: only ${vals.length} run(s) had data, no CV`); return; }
        const m = mean(vals);
        L.push(`  ${k}: CV ${f1((100 * sd(vals)) / m)}%   run values: ${vals.map(f3).join(', ')}`);
      });
    }
    return L.join('\n');
  }
}

export const researchLogger = new ResearchLogger();

if (researchLogger.enabled && typeof window !== 'undefined') {
  let nextCondition = 'normal';
  let dot = null;

  const showDot = (on) => {
    try {
      if (on && !dot) {
        dot = document.createElement('div');
        dot.textContent = `● REC ${nextCondition}`;
        dot.style.cssText =
          'position:fixed;top:8px;right:8px;z-index:99999;background:#dc2626;color:#fff;' +
          'font:700 12px system-ui;padding:4px 10px;border-radius:999px;pointer-events:none;';
        document.body.appendChild(dot);
      } else if (!on && dot) {
        dot.remove();
        dot = null;
      }
    } catch { /* cosmetic only */ }
  };

  const toggle = () => {
    if (researchLogger.running) {
      researchLogger.stop();
      showDot(false);
    } else {
      researchLogger.start(nextCondition);
      showDot(true);
    }
  };

  window.__research = {
    // Console API (still available)
    start: (c) => { if (c) nextCondition = c; researchLogger.start(nextCondition); showDot(true); },
    stop: () => { researchLogger.stop(); showDot(false); },
    download: () => researchLogger.download(),
    clear: () => researchLogger.clear(),
    count: () => researchLogger.rowCount,
    // Set which condition the NEXT hotkey-started run is labelled as:
    //   __research.condition('low_light')   (normal | low_light | rapid)
    condition: (c) => { nextCondition = c; console.log(`[research] next run labelled: ${c}`); },
  };

  // Report panel: shows the finished numbers and copies them to the clipboard.
  let panel = null;
  const showReport = () => {
    if (panel) { panel.remove(); panel = null; return; }
    const text = researchLogger.report();
    try { navigator.clipboard?.writeText(text); } catch { /* user can still copy from the box */ }
    panel = document.createElement('div');
    panel.style.cssText =
      'position:fixed;inset:5%;z-index:99999;background:#0f172a;color:#e2e8f0;border:2px solid #38bdf8;' +
      'border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:8px;font:13px system-ui;';
    const note = document.createElement('div');
    note.textContent = 'Copied to clipboard. Paste it to Claude. (Alt+Shift+R closes this panel)';
    const box = document.createElement('textarea');
    box.value = text; box.readOnly = true;
    box.style.cssText = 'flex:1;background:#020617;color:#e2e8f0;border:1px solid #334155;border-radius:8px;padding:10px;font:12px ui-monospace,Consolas,monospace;';
    panel.append(note, box);
    document.body.appendChild(panel);
    box.focus(); box.select();
  };

  // Hotkeys so DevTools can stay CLOSED while measuring:
  //   Alt+Shift+L  start/stop recording   Alt+Shift+R  show + copy the report
  //   Alt+Shift+D  download raw CSV (optional backup)
  window.addEventListener('keydown', (e) => {
    if (!(e.altKey && e.shiftKey)) return;
    if (e.code === 'KeyL') { e.preventDefault(); toggle(); }
    if (e.code === 'KeyR') { e.preventDefault(); showReport(); }
    if (e.code === 'KeyD') { e.preventDefault(); researchLogger.download(); }
  });

  console.log('[research] enabled. Alt+Shift+L = start/stop, Alt+Shift+R = report, Alt+Shift+D = raw CSV. __research.condition("low_light") sets the label.');
}
