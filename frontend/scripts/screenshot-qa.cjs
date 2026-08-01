const puppeteer = require('puppeteer');

(async () => {
  const url = process.env.QA_URL || 'http://localhost:5174/qa-tests';
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.setViewport({ width: 1280, height: 900 });
  await page.goto(url, { waitUntil: 'networkidle2' });
  // wait for results to be rendered
  await page.waitForSelector('.grid.grid-cols-1.gap-3', { timeout: 30000 });
  await page.screenshot({ path: 'qa-screenshot.png', fullPage: true });
  console.log('Saved qa-screenshot.png');
  await browser.close();
})();
