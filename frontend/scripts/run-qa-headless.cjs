const puppeteer = require('puppeteer');
const fs = require('fs');

(async function run(){
  const url = process.env.QA_URL || 'http://localhost:5174/qa-tests';
  console.log('Opening QA URL:', url);
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    page.on('console', msg => {
      try { console.log('PAGE LOG:', msg.type(), msg.text()); } catch(_){}
    });
    page.on('pageerror', err => console.error('PAGE ERROR:', err.toString()));
    page.setDefaultNavigationTimeout(60000);
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // wait longer for client-side rendering
    try {
      await page.waitForSelector('button', { timeout: 20000 });
    } catch (e) {
      console.warn('No button selector within 20s, capturing page content for diagnosis');
      const html = await page.content();
      require('fs').writeFileSync('qa-headless-page.html', html);
      console.log('Saved qa-headless-page.html');
      throw e;
    }

    async function waitForSuiteComplete(timeout = 60000) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const disabled = await page.$eval('button', (b) => b.disabled);
        if (!disabled) {
          await new Promise((r) => setTimeout(r, 800));
          const stillDisabled = await page.$eval('button', (b) => b.disabled);
          if (!stillDisabled) return true;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      return false;
    }

    const finished = await waitForSuiteComplete(120000);
    if (!finished) console.warn('Timeout waiting for suite to complete (button still disabled or tests running)');

    // dump current page HTML for debugging/inspection
    try { const html = await page.content(); require('fs').writeFileSync('qa-headless-page.html', html); console.log('Saved qa-headless-page.html'); } catch(e) { console.warn('Failed to save page HTML', e); }

    const summary = await page.evaluate(() => {
      const controls = Array.from(document.querySelectorAll('.mb-4 > div, .mb-4 > button')).map(n => n.textContent.trim());
      const listParent = document.querySelector('.grid.grid-cols-1.gap-3');
      const cards = [];
      if (listParent) {
        for (const child of Array.from(listParent.children)) {
          const nameEl = child.querySelector('.font-bold');
          const reasonEl = child.querySelector('.text-sm.text-slate-400');
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
      return { controls, cards };
    });

    fs.writeFileSync('qa-headless-result.json', JSON.stringify(summary, null, 2));
    console.log('Result saved to qa-headless-result.json');
    await browser.close();
    console.log(JSON.stringify(summary, null, 2));
  } catch (err) {
    console.error('QA headless error:', err);
    try { await browser.close(); } catch (_) {}
    process.exitCode = 2;
  }
})();
