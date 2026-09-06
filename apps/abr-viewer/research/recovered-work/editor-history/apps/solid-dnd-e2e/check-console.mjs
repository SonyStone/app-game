import { firefox } from '@playwright/test';

const browser = await firefox.launch();
const page = await browser.newPage();
page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));
page.on('pageerror', err => console.log('PAGE_ERROR:', err.message));
await page.goto('http://localhost:3055/#overlay');
await page.waitForTimeout(3000);
const el = await page.locator('[data-fixture="overlay"]').count();
console.log('data-fixture=overlay count:', el);
const bodyHTML = await page.evaluate(() => document.body.innerHTML);
console.log('BODY_HTML:', bodyHTML.substring(0, 1000));
await browser.close();
