import { chromium } from '@playwright/test';
import { ResultAsync } from 'neverthrow';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { installHarness } from './browserHarness.mjs';

// A discovery run records unsupported features without aborting the rest of the corpus.
// A separate comparison step produces the visual report and checks the reviewed baseline.
const directory = process.argv[2];
assert.ok(directory, 'Usage: node tests/compatibility/run.browser.mjs <external-corpus-directory>');
const run = promisify(execFile);
const baseURL = process.env.GPU_TEXT_URL ?? 'http://127.0.0.1:3180';
const output = path.resolve(process.env.GPU_TEXT_OUTPUT ?? path.join(directory, 'results'));
const manifest = JSON.parse(
  await readFile(process.env.GPU_TEXT_MANIFEST ?? new URL('./manifest.json', import.meta.url))
);
const filter = process.env.GPU_TEXT_CASE;
const cases = manifest.cases.filter((entry) => !filter || entry.id.includes(filter));
assert.ok(cases.length, 'No matching cases');
await mkdir(output, { recursive: true });
const poppler = await run('pdftoppm', ['-v']);
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]
});
const report = {
  createdAt: new Date().toISOString(),
  pdfjsRevision: manifest.pdfjsRevision,
  poppler: (poppler.stderr || poppler.stdout).split('\n')[0],
  chromium: browser.version(),
  rasterSize: 800,
  blockedSources: manifest.blockedSources,
  cases: []
};

try {
  for (const entry of cases) {
    const result = await ResultAsync.fromPromise(checkDocument(entry), (cause) => String(cause));
    const record = result.isOk() ? result.value : { ...entry, pages: [], status: 'harness-error', error: result.error };
    report.cases.push(record);
    await writeFile(path.join(output, 'render-report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(entry.id, record.status, record.error?.message ?? record.error ?? `${record.pages?.length ?? 0} pages`);
  }
} finally {
  await browser.close();
}

if (report.cases.some((entry) => entry.status === 'harness-error')) {
  process.exitCode = 1;
}

/** Captures every selected page, then repeats it using fresh resources decoded from the retained GDOC. */
async function checkDocument(entry) {
  const input = path.resolve(directory, entry.file);
  const bytes = await readFile(input);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, `${entry.id}: source changed`);
  const destination = path.join(output, entry.id);
  await mkdir(destination, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 800, height: 800 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(90_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });

  try {
    await page.route('**/compatibility-input.pdf', (route) =>
      route.fulfill({ path: input, contentType: 'application/pdf' })
    );
    await page.route('**/compatibility-check', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0;background:white"></body></html>' })
    );
    await page.goto(`${baseURL}/compatibility-check`);
    await evaluate(page, installHarness);
    const opened = await evaluate(page, () =>
      compatibility.open().then(
        (result) => result,
        (error) => ({
          ok: false,
          stage: 'execution',
          error: { code: error?.code ?? 'exception', message: error?.message ?? String(error) }
        })
      )
    );
    const record = { ...entry, ...opened, localSource: pathToFileURL(input).href, consoleErrors: errors, pages: [] };

    if (!opened.ok) {
      record.status =
        opened.error.code === 'unsupported-pdf'
          ? 'unsupported'
          : opened.error.code === 'document-limit'
            ? 'limit'
            : 'error';
      return record;
    }

    const indices = entry.pages === 'all' ? opened.pages.map((_, i) => i + 1) : entry.pages;

    for (const number of indices) {
      const metadata = opened.pages[number - 1];
      assert.ok(metadata, `${entry.id}: page ${number} is missing`);
      const scale = 800 / Math.max(metadata.width, metadata.height);
      const width = Math.max(1, Math.round(metadata.width * scale));
      const height = Math.max(1, Math.round(metadata.height * scale));
      await page.setViewportSize({ width, height });
      const drawn = await evaluate(page, ({ index, width, height }) => compatibility.draw(index, width, height), {
        index: number - 1,
        width,
        height
      });

      if (!drawn.ok) {
        return { ...record, status: 'render-error', error: drawn.error, failedPage: number };
      }
      await page.locator('canvas').screenshot({ path: path.join(destination, `${number}-actual.png`) });
      const reference = await renderReference(
        'pdftoppm',
        [
          '-f',
          String(number),
          '-l',
          String(number),
          '-cropbox',
          '-singlefile',
          '-png',
          '-scale-dimension-before-rotation',
          '-scale-to-x',
          String(width),
          '-scale-to-y',
          String(height),
          input,
          path.join(destination, `${number}-reference`)
        ],
        { timeout: 60_000 }
      );
      record.pages.push({ number, width, height, referenceWarnings: reference.stderr });
    }

    const download = page.waitForEvent('download');
    await evaluate(page, () => compatibility.download());
    const saved = path.join(destination, 'document.gdoc');
    await (await download).saveAs(saved);
    await page.route('**/compatibility-input.gdoc', (route) =>
      route.fulfill({ path: saved, contentType: 'application/octet-stream' })
    );
    // A fresh decoder, GPU device, renderer and virtual-texture cache must reproduce the same pixels.
    const reopened = await evaluate(page, (url) => compatibility.prepare(url), `${baseURL}/compatibility-input.gdoc`);
    assert.ok(reopened.ok, `${entry.id}: GDOC reopen failed: ${JSON.stringify(reopened)}`);

    for (const { number, width, height } of record.pages) {
      await page.setViewportSize({ width, height });
      const drawn = await evaluate(page, ({ index, width, height }) => compatibility.draw(index, width, height), {
        index: number - 1,
        width,
        height
      });
      assert.ok(drawn.ok, `${entry.id}: GDOC render failed: ${JSON.stringify(drawn)}`);
      await page.locator('canvas').screenshot({ path: path.join(destination, `${number}-reopened.png`) });
    }

    record.status = errors.length ? 'error' : 'rendered';
    record.reopened = true;
    return record;
  } finally {
    await page.close();
  }
}

/** Closing an overdue page also terminates its workers; a stuck document cannot block the remaining corpus. */
async function evaluate(page, callback, argument) {
  const deadline = setTimeout(() => void page.close(), 90_000);

  try {
    return await page.evaluate(callback, argument);
  } finally {
    clearTimeout(deadline);
  }
}

/** Keeps repeated parser warnings bounded while still failing on reference process errors. */
function renderReference(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let warningBytes = 0;
    child.stderr.on('data', (chunk) => {
      warningBytes += chunk.length;
      stderr += chunk.toString().slice(0, Math.max(0, 8192 - stderr.length));
    });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code !== 0) {
        reject(new Error(`Reference exited ${code ?? signal}: ${stderr}`));
        return;
      }

      resolve({ stderr: stderr + (warningBytes > 8192 ? `\n[truncated ${warningBytes} warning bytes]` : '') });
    });
  });
}
