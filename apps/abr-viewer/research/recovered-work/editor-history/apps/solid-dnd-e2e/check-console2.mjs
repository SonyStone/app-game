import { firefox } from '@playwright/test';

const browser = await firefox.launch();
const page = await browser.newPage();
const logs = [];
page.on('console', msg => logs.push(`CONSOLE[${msg.type()}]: ${msg.text()}`));
page.on('pageerror', err => logs.push(`PAGE_ERROR: ${err.message}`));

try {
  await page.goto('http://localhost:4173/#overlay', { timeout: 10000 });
  await page.waitForTimeout(2000);

  const count = await page.locator('[data-fixture="overlay"]').count();
  logs.push(`data-fixture=overlay count: ${count}`);

  const bodyHTML = await page.evaluate(() => document.body.innerHTML);
  logs.push(`BODY_HTML: ${bodyHTML.substring(0, 2000)}`);
} catch (err) {
  logs.push(`NAVIGATION_ERROR: ${err.message}`);
}

for (const log of logs) console.log(log);
await browser.close();
