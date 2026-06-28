import { chromium } from '@playwright/test';

const url = process.argv[2] || 'http://localhost:5173';
const out = process.argv[3] || 'shot.png';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game?.ready === true, { timeout: 15000 });
await page.waitForTimeout(800);
console.log('state=', await page.evaluate(() => window.__game.getState()));
console.log('money=', await page.evaluate(() => window.__game.getMoney()));
await page.screenshot({ path: out });
await browser.close();
console.log('saved', out);
