import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Optional production behavior measurements. Each repeat has a new temporary Chrome profile.
const root = `${process.env.PSD_TEXT_MIXER_RESEARCH_ROOT}/fixtures/psd/oracle-1`;
const many = `${root}/dribbble_psd__80488-e0f416fe634b-g0/source-input/document.psd`;
const refused = `${root}/Nintendo_Super_Famicom__Nintendo_Super_Famicom_Cartridge_Label_Template__Rear_-5313ea6a2cd8-g0/source-input/document.psd`;
const next = fileURLToPath(new URL('../src/features/examples/assets/adjustment-stack.psd', import.meta.url));
const results = [];
for (let run = 1; run <= Number(process.env.PSD_BENCH_RUNS ?? 3); run++) {
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    channel: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? undefined : 'chrome',
    headless: true
  });
  const result = { run, pageErrors: [] };
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: Number(process.env.PSD_BENCH_DPR ?? 1)
    });
    await context.addInitScript(() => {
      const NativeWorker = Worker;
      window.Worker = class extends NativeWorker {
        postMessage(message, ...rest) {
          if (message.type === 'detectBlending') {
            performance.mark('bench:detection');
          }
          return super.postMessage(message, ...rest);
        }
      };
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => result.pageErrors.push(error.message));
    await page.goto(`${process.env.PSD_BENCH_URL}/?telemetry=1`);
    const picker = page.locator('input[accept=".psd,.psb"]');
    await picker.setInputFiles(many);
    await page.waitForFunction(() => performance.getEntriesByName('bench:detection').length > 0);
    result.cancel = await page.evaluate(async () => {
      const start = performance.now();
      [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Cancel').click();
      await new Promise(requestAnimationFrame);
      return {
        inputToFrameMs: performance.now() - start,
        status: document.querySelector('footer').textContent.trim(),
        restartAvailable: [...document.querySelectorAll('button')].some(
          (button) => button.textContent.trim() === 'Restart'
        )
      };
    });
    await page.getByRole('button', { name: 'Restart', exact: true }).click();
    await picker.setInputFiles(next);
    await page.waitForFunction(() => document.querySelector('footer').textContent.includes('Rendered 96 × 96'));
    result.nextFileOpened = true;
    await picker.setInputFiles(refused);
    await page.locator('[data-failure="budget"]').waitFor();
    result.failureStatus = await page.locator('footer').innerText();
    await page.getByRole('button', { name: 'Retry strict reading' }).click();
    await page.waitForFunction(
      () => document.querySelector('[data-preview]') || document.querySelector('[data-render-id]')
    );
    result.strictFallback = await page.locator('body').innerText();
    await page.screenshot({ path: `${process.env.PSD_BENCH_OUT}/assets/strict-fallback-r${run}.png` });
  } catch (error) {
    result.error = String(error);
  } finally {
    await browser.close();
  }
  results.push(result);
  console.log(
    JSON.stringify({
      run,
      cancel: result.cancel,
      nextFileOpened: result.nextFileOpened,
      failureStatus: result.failureStatus,
      error: result.error
    })
  );
}
await writeFile(`${process.env.PSD_BENCH_OUT}/opening-behaviors.json`, JSON.stringify(results, null, 2));
