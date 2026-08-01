const puppeteer = require('puppeteer');
const fs = require('fs');

async function run() {
  const url = process.env.QA_URL || 'http://localhost:5174/qa-tests';
  console.log('Opening QA URL:', url);
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // wait until the Run Tests button is enabled and then wait for completion
    await page.waitForSelector('button', { timeout: 10000 });

    // wait for initial tests to start and complete: poll for disabled attribute removal on Run Tests Again
    async function waitForSuiteComplete(timeout = 60000) {
      const start = Date.now();
      // Wait until button exists and is not disabled for at least 800ms
      while (Date.now() - start < timeout) {
        const disabled = await page.$eval('button', (b) => b.disabled);
        if (!disabled) {
          // ensure stable enabled for 800ms
          await new Promise((r) => setTimeout(r, 800));
          const stillDisabled = await page.$eval('button', (b) => b.disabled);
          if (!stillDisabled) return true;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      return false;
    }

    // Wait for auto-run to finish (the page auto-runs on load)
    const finished = await waitForSuiteComplete(45000);
    if (!finished) console.warn('Timeout waiting for suite to complete (button still disabled or tests running)');

    // scrape top summary
    const summary = await page.evaluate(() => {
      const summaryNode = document.querySelector('.mb-4 .px-4');
      // gather total/pass/fail/warn from top controls
      const controls = Array.from(document.querySelectorAll('.mb-4 > div, .mb-4 > button'))
        .map(n => n.textContent.trim());
      const result = { controls };

      // gather result cards
      const listParent = document.querySelector('.grid.grid-cols-1.gap-3');
      const cards = [];
      if (listParent) {
        for (const child of Array.from(listParent.children)) {
          const nameEl = child.querySelector('.font-bold');
          const reasonEl = child.querySelector('.text-sm.text-slate-400');
          // status element is the right-side .font-bold that contains PASS/FAIL
          const statusEl = Array.from(child.querySelectorAll('.font-bold')).find(el => /PASS|FAIL|WARNING|INFO|✅|❌|ℹ️/.test(el.textContent));
          const fixEl = child.querySelector('.text-xs.text-slate-400');
          cards.push({
            name: nameEl ? nameEl.textContent.trim() : '(no name)',
            reason: reasonEl ? reasonEl.textContent.trim() : '',
            status: statusEl ? statusEl.textContent.trim() : '',
            fix: fixEl ? fixEl.textContent.trim() : ''
          });
        }
      }
      // final report stats
      const final = {};
      const finalLabels = Array.from(document.querySelectorAll('.mt-8 .font-bold'))
        .map(el => el.textContent.trim());
      final.labels = finalLabels;
      return { controls: result.controls, cards };
    });

    console.log(JSON.stringify({ summary }, null, 2));
    // save to file
    fs.writeFileSync('qa-headless-result.json', JSON.stringify(summary, null, 2));
    await browser.close();
    return { ok: true, summary };
  } catch (err) {
    console.error('QA headless error:', err);
    try { await browser.close(); } catch (_) {}
    process.exitCode = 2;
    return { ok: false, err: String(err) };
  }
}

run().then((r) => {
  if (!r.ok) process.exit(2);
  console.log('Done');
});
