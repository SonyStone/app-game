import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const assets = new URL('../src/features/examples/assets/', import.meta.url);
const corpus = `${process.env.PSD_TEXT_MIXER_RESEARCH_ROOT}/fixtures/psd/oracle-1`;
const text = `${corpus}/src__v1.1__v1.1_-_CS6__Source__Velositey.assets__Templates__footer-3ba97617090f-g0/source-input/document.psd`;
const many = `${corpus}/dribbble_psd__80488-e0f416fe634b-g0/source-input/document.psd`;
const recoveryRefusal = `${corpus}/Nintendo_Super_Famicom__Nintendo_Super_Famicom_Cartridge_Label_Template__Rear_-5313ea6a2cd8-g0/source-input/document.psd`;

/** Observes real uploads and worker requests without changing their scheduling. */
async function observe(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'psd:upload') {
          performance.mark('test:upload', { startTime: entry.startTime });
        }
      }
    }).observe({ type: 'measure' });
    const NativeWorker = Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        this.addEventListener('message', (event) => {
          performance.mark('test:reply', { detail: { type: event.data.type, samples: event.data.performance } });
        });
      }
      postMessage(message: { type: string }, transfer: Transferable[] | StructuredSerializeOptions = []) {
        performance.mark(`test:request:${message.type}`, {
          detail: {
            preview: !!document.querySelector('[data-preview]'),
            exact: !!document.querySelector('[data-render-state="exact"]')
          }
        });
        if (Array.isArray(transfer)) {
          super.postMessage(message, transfer);
        } else {
          super.postMessage(message, transfer);
        }
      }
    };
  });
}

test('presents a labeled preview before detection and reuses its prepared render', async ({ page }) => {
  await observe(page);
  await page.goto('/?telemetry=1');
  await page.locator('input[accept=".psd,.psb"]').setInputFiles(fileURLToPath(new URL('adjustment-stack.psd', assets)));
  await expect(page.locator('[data-render-id]')).toHaveAttribute('data-busy', 'false');
  const result = await page.evaluate(() => {
    const detection = performance.getEntriesByName('test:request:detectBlending')[0] as PerformanceMark;
    const upload = performance.getEntriesByName('test:upload')[0];
    const samples = performance
      .getEntriesByName('test:reply')
      .flatMap((entry) => (entry as PerformanceMark).detail.samples ?? []);
    return {
      firstUpload: upload?.startTime,
      detection: detection?.startTime,
      detail: detection?.detail,
      composites: samples.filter((sample) => sample.name === 'composite').length,
      reused: samples.filter((sample) => sample.name === 'render.reused').length
    };
  });
  expect(result.firstUpload).toBeLessThan(result.detection);
  expect(result.detail).toEqual({ preview: true, exact: false });
  expect(result.composites).toBe(2);
  expect(result.reused).toBe(1);
});

test('cancel and restart respond within 100ms while a large composite is running', async ({ page }) => {
  test.skip(!existsSync(many), 'Requires the public many-layer fixture.');
  await observe(page);
  await page.goto('/');
  await page.locator('input[accept=".psd,.psb"]').setInputFiles(many);
  await page.waitForFunction(() => performance.getEntriesByName('test:request:detectBlending').length > 0);
  const canceled = await page.evaluate(async () => {
    const start = performance.now();
    const button = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Cancel')!;
    button.click();
    await new Promise(requestAnimationFrame);
    return {
      ms: performance.now() - start,
      status: document.querySelector('footer')?.textContent,
      restart: [...document.querySelectorAll('button')].some((button) => button.textContent === 'Restart')
    };
  });
  expect(canceled.ms).toBeLessThan(100);
  expect(canceled.status).toContain('Canceled');
  expect(canceled.restart).toBe(true);
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
  // Replacing the restarted open is also immediate and must not republish its late pixels.
  await page.locator('input[accept=".psd,.psb"]').setInputFiles(fileURLToPath(new URL('adjustment-stack.psd', assets)));
  await expect(page.locator('[data-render-id]')).toHaveAttribute('data-busy', 'false');
  await expect(page.locator('footer')).toContainText('Rendered 96 × 96');
  await page.screenshot({ path: test.info().outputPath('restarted.png') });
  console.log('Cancel input-to-frame:', canceled.ms);
});

test('bounds 82 text statuses so document inspection stays available', async ({ page }) => {
  test.skip(!existsSync(text), 'Requires the public text-heavy fixture.');
  await page.goto('/');
  await page.locator('input[accept=".psd,.psb"]').setInputFiles(text);
  const panel = page.getByRole('region', { name: 'Fonts', exact: true });
  await expect(panel.locator('[data-text-layer]')).toHaveCount(82);
  const size = await panel.evaluate((element) => ({ height: element.clientHeight, content: element.scrollHeight }));
  expect(size.height).toBeLessThanOrEqual(360);
  expect(size.content).toBeGreaterThan(size.height);
  await expect(page.getByRole('button', { name: 'Document', exact: true })).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath('bounded-fonts.png') });
});

test('offers strict reading after recovery exceeds resources and opens the next valid file', async ({ page }) => {
  test.setTimeout(60_000);
  test.skip(!existsSync(recoveryRefusal), 'Requires the public 117-text-layer fixture.');
  await observe(page);
  await page.goto('/');
  const picker = page.locator('input[accept=".psd,.psb"]');
  await picker.setInputFiles(recoveryRefusal);
  await expect(page.locator('footer')).toContainText('Failed to open');
  await page.getByRole('button', { name: 'Retry strict reading' }).click();
  await expect(page.getByText('Strict reading.', { exact: false }).last()).toBeVisible();
  await expect(page.locator('[data-render-id]')).toHaveAttribute('data-busy', 'false', { timeout: 30_000 });
  await picker.setInputFiles(fileURLToPath(new URL('adjustment-stack.psd', assets)));
  await expect(page.locator('footer')).toContainText('Rendered 96 × 96');
});
