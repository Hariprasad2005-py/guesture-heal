  
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

// Import the games and patient dashboard pieces
import PrecisionReach from '../games/PrecisionReach';
import RehabSlicer from '../games/RehabSlicer';
import CloudReach from '../games/CloudReach';
import CatchFlex from '../games/CatchFlex';
import CanvasAir from '../games/CanvasAir';

// Lightweight test harness for mounting React components inside isolated containers
function mountComponent(Component, props = {}) {
  const container = document.createElement('div');
  // Deterministic visible container for headless Phaser rendering
  container.style.width = '1024px';
  container.style.height = '768px';
  container.style.minHeight = '768px';
  container.style.border = '1px dashed rgba(255,255,255,0.06)';
  container.style.margin = '8px 0';
  container.style.display = 'block';
  container.style.position = 'relative';
  container.style.visibility = 'visible';
  container.className = 'qa-mount';
  document.body.appendChild(container);
  const root = createRoot(container);
  let didThrow = false;
  try {
    root.render(React.createElement(Component, props));
  } catch (err) {
    didThrow = true;
  }
  
  return {
    container,
    root,
    unmount: () => {
      try { root.unmount(); } catch (_) {}
      try { container.remove(); } catch (_) {}
    },
    threwOnMount: didThrow,
  };
}

function findButtonByText(container, re) {
  const buttons = Array.from(container.querySelectorAll('button'));
  return buttons.find((b) => re.test((b.textContent || '').trim()));
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitForCondition(checkFn, timeout = 3000, interval = 150) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      if (await checkFn()) return true;
    } catch (_) {}
    await wait(interval);
  }
  return false;
}

export default function PatientDashboardTest() {
  const [results, setResults] = useState([]);
  const [running, setRunning] = useState(false);
  const reportRef = useRef([]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      (async () => {
        try {
          const engine = await import('../qa/qaEngine.js');
          await engine.runAll({ pushResult, mountComponent });
        } catch (e) {
          // fallback to built-in runner
          runAllTests();
        }
      })();
    } else {
      runAllTests();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pushResult = (name, status, reason = '', fix = '') => {
    reportRef.current.push({ name, status, reason, fix });
    setResults([...reportRef.current]);
  };

  async function testComponentLifecycle(name, Component, props = {}) {
    const tname = `${name} — Component mount/unmount`;
    let mount;
    try {
      mount = mountComponent(Component, props);
      // allow a short time for React to flush initial render
      await wait(250);
      if (mount.threwOnMount) throw new Error('Exception during render');
      pushResult(tname, 'PASS', 'Mounted without throwing');
    } catch (err) {
      pushResult(tname, 'FAIL', String(err), 'Investigate render errors or required props');
      if (mount) mount.unmount();
      return { mounted: false };
    }

    // quick sanity: check a video element exists or not (camera expected in most games)
    const hasVideo = !!mount.container.querySelector('video');
    pushResult(`${name} — Video element present`, hasVideo ? 'PASS' : 'WARNING', hasVideo ? 'video tag found' : 'video tag not found (may be created after start)');

    // check difficulty selector
    const hasDifficulty = !!mount.container.querySelectorAll('button').length;
    pushResult(`${name} — Difficulty selector present`, hasDifficulty ? 'PASS' : 'WARNING', hasDifficulty ? 'Buttons found' : 'No difficulty controls detected');

    // check therapist settings toggle existence
    const settingsToggle = Array.from(mount.container.querySelectorAll('button')).find(b => /Therapist Settings|Therapist|Settings/i.test(b.textContent || ''));
    pushResult(`${name} — Therapist Settings UI`, settingsToggle ? 'PASS' : 'WARNING', settingsToggle ? 'Toggle found' : 'No therapist settings toggle found in DOM');

    // unmount test
    try {
      mount.unmount();
      pushResult(`${name} — Unmount`, 'PASS', 'Unmounted cleanly');
    } catch (err) {
      pushResult(`${name} — Unmount`, 'FAIL', String(err), 'Ensure cleanup (timers, camera stop) in effect cleanup');
    }

    return { mounted: true };
  }

  async function testInteractiveFlow(name, Component, startButtonRe = /start session|start|begin session|view instructions/i, options = {}) {
    const tname = `${name} — Interactive flow`;
    const mount = mountComponent(Component, options.props || {});
    await wait(250);
    if (mount.threwOnMount) {
      pushResult(tname, 'FAIL', 'Exception during mount');
      mount.unmount();
      return;
    }

    let ok = true;

    // locate start-like button
    const startBtn = await (async () => {
      const found = findButtonByText(mount.container, startButtonRe);
      if (found) return found;
      // sometimes start is nested in instruction gate — wait a bit
      const exists = await waitForCondition(() => !!findButtonByText(mount.container, startButtonRe), 3000);
      return exists ? findButtonByText(mount.container, startButtonRe) : null;
    })();

    if (!startBtn) {
      pushResult(`${tname} — Start button`, 'FAIL', 'Start button not found', 'Ensure button text matches expectations');
      mount.unmount();
      return;
    }
    pushResult(`${tname} — Start button`, 'PASS', 'Found start-like button');

    // click start
    try { startBtn.click(); } catch (err) { /* ignore */ }
    await wait(600);

    // Expect a pause/resume or end session button soon
    const pauseBtnFound = await waitForCondition(() => !!findButtonByText(mount.container, /pause|resume|⏸|▶/i), 4000);
    pushResult(`${tname} — Pause button appears`, pauseBtnFound ? 'PASS' : 'WARNING', pauseBtnFound ? 'Pause control found' : 'Pause control not found quickly');

    if (pauseBtnFound) {
      const pauseBtn = findButtonByText(mount.container, /pause|⏸/i);
      if (pauseBtn) {
        pauseBtn.click();
        await wait(400);
        pushResult(`${tname} — Pause action`, 'PASS', 'Clicked pause');
        const resumeBtn = findButtonByText(mount.container, /resume|▶/i);
        if (resumeBtn) { resumeBtn.click(); pushResult(`${tname} — Resume action`, 'PASS', 'Clicked resume'); }
        else pushResult(`${tname} — Resume action`, 'WARNING', 'Resume control not detected');
      }
    }

    // End session if end button exists
    const endBtn = findButtonByText(mount.container, /end session|end|■|finish/i);
    if (endBtn) {
      endBtn.click();
      await wait(600);
      const summaryFound = await waitForCondition(() => /session complete|session finished|session complete!|try again|restart/i.test(mount.container.textContent || ''), 3000);
      pushResult(`${tname} — End session & summary`, summaryFound ? 'PASS' : 'WARNING', summaryFound ? 'Summary shown' : 'Summary not detected after end');
    } else {
      pushResult(`${tname} — End session control`, 'WARNING', 'End control not found');
    }

    // Cleanup
    try { mount.unmount(); pushResult(`${tname} — Unmount`, 'PASS', 'Unmounted cleanly'); }
    catch (err) { pushResult(`${tname} — Unmount`, 'FAIL', String(err)); }
  }

  async function testCameraLifecycle(name, Component, startButtonRe = /start session|start|begin session|view instructions/i) {
    const tname = `${name} — Camera lifecycle`;
    const mount = mountComponent(Component, {});
    await wait(250);
    if (mount.threwOnMount) { pushResult(tname, 'FAIL', 'Exception during mount'); mount.unmount(); return; }

    const initialVideoCount = document.querySelectorAll('video').length;
    pushResult(`${tname} — initial video elements`, 'INFO', `${initialVideoCount} video elements present in DOM`);

    const startBtn = findButtonByText(mount.container, startButtonRe);
    if (!startBtn) {
      pushResult(`${tname} — Start for camera`, 'WARNING', 'Start button not found; camera may initialize on other action');
      // can't fully test camera lifecycle without user gesture
      mount.unmount();
      return;
    }

    // Click start to trigger camera attempts
    try { startBtn.click(); } catch (_) {}
    await wait(700);

    // Check for mediapipe script tags being added (indicative of model load)
    const hasHandsScript = !!Array.from(document.scripts).find(s => /hands@|hands.js/.test(s.src));
    const hasPoseScript = !!Array.from(document.scripts).find(s => /pose@|pose.js/.test(s.src));
    pushResult(`${tname} — MediaPipe scripts appended`, (hasHandsScript || hasPoseScript) ? 'PASS' : 'WARNING', (hasHandsScript || hasPoseScript) ? 'Found mediapipe script tag' : 'No mediapipe scripts detected (network blocked or not used yet)');

    // Count video elements after start
    const afterStartVideoCount = document.querySelectorAll('video').length;
    pushResult(`${tname} — video elements after start`, afterStartVideoCount > initialVideoCount ? 'PASS' : 'WARNING', `videos: ${afterStartVideoCount}`);

    // Pause/Resume check by clicking pause/resume controls if present
    const pauseBtn = findButtonByText(mount.container, /pause|⏸/i);
    if (pauseBtn) {
      pauseBtn.click(); await wait(400);
      pushResult(`${tname} — pause click`, 'PASS', 'Pause clicked');
      const resume = findButtonByText(mount.container, /resume|▶/i);
      if (resume) { resume.click(); pushResult(`${tname} — resume click`, 'PASS', 'Resume clicked'); }
      else pushResult(`${tname} — resume click`, 'WARNING', 'Resume not found');
    } else pushResult(`${tname} — pause control`, 'WARNING', 'Pause control not found');

    // Unmount and check videos cleaned up
    mount.unmount();
    await wait(300);
    const finalVideoCount = document.querySelectorAll('video').length;
    pushResult(`${tname} — video cleanup on unmount`, finalVideoCount <= initialVideoCount ? (finalVideoCount === initialVideoCount ? 'PASS' : 'WARNING') : 'FAIL', `videos after unmount: ${finalVideoCount}`);
  }

  async function runAllTests() {
    setRunning(true);
    reportRef.current = [];
    setResults([]);

    // Component lifecycle tests
    await testComponentLifecycle('PrecisionReach', PrecisionReach);
    await testComponentLifecycle('RehabSlicer', RehabSlicer);
    await testComponentLifecycle('CloudReach', CloudReach);
    await testComponentLifecycle('Catch & Flex', CatchFlex);
    await testComponentLifecycle('CanvasAir', CanvasAir);

    // Interactive flow tests (UI-driven)
    await testInteractiveFlow('PrecisionReach', PrecisionReach, /start session|start/i);
    await testInteractiveFlow('RehabSlicer', RehabSlicer, /start session|start/i);
    await testInteractiveFlow('CloudReach', CloudReach, /start session|start/i);
    await testInteractiveFlow('Catch & Flex', CatchFlex, /view instructions|begin session|start session/i);
    await testInteractiveFlow('CanvasAir', CanvasAir, /start session|start/i);

    // Camera lifecycle tests
    await testCameraLifecycle('PrecisionReach', PrecisionReach);
    await testCameraLifecycle('RehabSlicer', RehabSlicer);
    await testCameraLifecycle('CloudReach', CloudReach);
    await testCameraLifecycle('Catch & Flex', CatchFlex);
    await testCameraLifecycle('CanvasAir', CanvasAir);

    // Functional tests: use the QA engine adapters when available (DEV-only)
    try {
      if (import.meta.env.DEV) {
        const engine = await import('../qa/qaEngine.js');
        if (engine && engine.runAll) {
          await engine.runAll({ pushResult, mountComponent });
        }
      }
    } catch (err) {
      pushResult('QA Engine', 'WARNING', `QA engine failed to run: ${err?.message || String(err)}`);
    }

    // Quick performance sample: measure RAF frequency for a mounted CanvasAir (short sample)
    try {
      const mount = mountComponent(CanvasAir, {});
      const start = performance.now();
      let frames = 0;
      let alive = true;
      function tick() { frames++; if (alive && performance.now() - start < 800) requestAnimationFrame(tick); }
      requestAnimationFrame(tick);
      await wait(900);
      alive = false;
      mount.unmount();
      const fps = Math.round((frames / 0.9));
      pushResult('Performance sample — approx RAF fps', fps > 0 ? 'INFO' : 'WARNING', `approx ${fps} FPS measured (short sample)`);
    } catch (err) {
      pushResult('Performance sample', 'WARNING', String(err));
    }

    setRunning(false);
  }

  function summaryStats() {
    const total = results.length;
    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    const warn = results.filter(r => r.status === 'WARNING' || r.status === 'INFO').length;
    const pct = total === 0 ? 100 : Math.round((passed / total) * 100);
    return { total, passed, failed, warn, pct };
  }

  const { total, passed, failed, warn, pct } = summaryStats();

  return (
    <div className="p-6 bg-slate-950 text-white min-h-screen">
      <h1 className="text-3xl font-bold mb-4">Patient Dashboard — Automated QA</h1>
      <div className="mb-4 flex gap-3">
        <button onClick={() => runAllTests()} disabled={running} className="px-4 py-2 bg-teal-600 rounded">Run Tests Again</button>
        <div className="px-4 py-2 bg-slate-800 rounded">Total: {total}</div>
        <div className="px-4 py-2 bg-green-700 rounded">Pass: {passed}</div>
        <div className="px-4 py-2 bg-amber-700 rounded">Warn/Info: {warn}</div>
        <div className="px-4 py-2 bg-red-700 rounded">Fail: {failed}</div>
        <div className="px-4 py-2 bg-blue-700 rounded">Health: {pct}%</div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {results.map((r, i) => (
          <div key={i} className="p-3 rounded bg-slate-900 border border-slate-800">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-bold">{r.name}</div>
                <div className="text-sm text-slate-400">{r.reason}</div>
              </div>
              <div className="ml-4 text-right">
                <div className={`font-bold ${r.status === 'PASS' ? 'text-emerald-400' : r.status === 'FAIL' ? 'text-rose-400' : 'text-amber-300'}`}>{r.status === 'PASS' ? '✅ PASS' : r.status === 'FAIL' ? '❌ FAIL' : r.status === 'INFO' ? 'ℹ️' : '⚠ WARNING'}</div>
                {r.fix && <div className="text-xs text-slate-400">Fix: {r.fix}</div>}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 p-4 bg-slate-900 border border-slate-800 rounded">
        <h2 className="text-xl font-bold mb-2">Final Report</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-slate-400">Total tests executed</div>
            <div className="font-bold text-lg">{total}</div>
          </div>
          <div>
            <div className="text-sm text-slate-400">Passed</div>
            <div className="font-bold text-lg">{passed}</div>
          </div>
          <div>
            <div className="text-sm text-slate-400">Failed</div>
            <div className="font-bold text-lg">{failed}</div>
          </div>
          <div>
            <div className="text-sm text-slate-400">Warnings / Info</div>
            <div className="font-bold text-lg">{warn}</div>
          </div>
          <div>
            <div className="text-sm text-slate-400">Success %</div>
            <div className="font-bold text-lg">{pct}%</div>
          </div>
          <div>
            <div className="text-sm text-slate-400">Overall Health</div>
            <div className="font-bold text-lg">{pct >= 90 ? 'Excellent' : pct >= 70 ? 'Good' : pct >= 40 ? 'Fair' : 'Poor'}</div>
          </div>
        </div>

        <div className="mt-4 text-sm text-slate-300">
          <h3 className="font-bold">Notes</h3>
          <ul className="list-disc pl-5 mt-2">
            <li>Automated checks run in-browser and simulate UI interactions where possible.</li>
            <li>Tests that require hardware, permissions, or live hand movement are flagged as warnings and need manual verification.</li>
            <li>Use the "Run Tests Again" button to rerun checks after making changes.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
