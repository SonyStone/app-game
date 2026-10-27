// Production UI corpus. Research inputs are read only; no Photoshop or personal browser profile is used.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { loadavg } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const repo = fileURLToPath(new URL('../../..', import.meta.url));
const research = process.env.PSD_TEXT_MIXER_RESEARCH_ROOT;
if (!research) {
  throw new Error('Set PSD_TEXT_MIXER_RESEARCH_ROOT to the read-only fixture checkout.');
}
const output = '/tmp/psd-phase8-saves';
const screens = '/tmp/psd-phase8-screens';
await fs.mkdir(output, { recursive: true });
await fs.mkdir(screens, { recursive: true });
const codec = await import(`${repo}/packages/psd/wasm/photoshop_psd_wasm.js`);
await codec.default({ module_or_path: await fs.readFile(`${repo}/packages/psd/wasm/photoshop_psd_wasm_bg.wasm`) });
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const json = (value) => JSON.stringify(value, (_, value) => (typeof value === 'bigint' ? value.toString() : value), 2);
const discovery = [];
const seen = new Set();
for (const set of ['oracle-1', 'oracle-2']) {
  const root = path.join(research, 'fixtures/psd', set);
  for (const name of (await fs.readdir(root)).sort()) {
    const file = path.join(root, name, 'source-input/document.psd');
    const stat = await fs.stat(file).catch(() => undefined);
    if (!stat || stat.size > 8 * 1024 ** 2) {
      continue;
    }
    const bytes = await fs.readFile(file);
    const sourceHash = hash(bytes);
    if (seen.has(sourceHash) || bytes.readUInt32BE(18) * bytes.readUInt32BE(14) > 1_048_576) {
      continue;
    }
    seen.add(sourceHash);
    let session;
    try {
      session = new codec.PsdEditorSession(bytes);
      session.editStateMetadata([{ kind: 'resolutionNoResample', ppi: 91 }]);
      discovery.push({ file, sourceHash, admitted: true });
    } catch (error) {
      discovery.push({
        file,
        sourceHash,
        admitted: false,
        code: error.code,
        path: error.propertyPath,
        message: error.message
      });
    } finally {
      session?.dispose();
      session?.free();
    }
  }
}
await fs.writeFile(path.join(output, 'discovery.json'), json(discovery));
const admitted = discovery.filter((entry) => entry.admitted);
assert(admitted.length >= 20, 'Not enough public resolution fixtures; do not manufacture admissions.');
// Fifty distinct eligible documents, then ten different PPI edits on the first ten. No claimed tree admissions.
const sources = Array.from({ length: 60 }, (_, index) => ({
  ...admitted[index % admitted.length],
  ppi: index < admitted.length ? 91 : 137
}));
const attempts = [];
const saves = [];
const costs = [];
const errors = [];
let browser;
const dist = path.join(repo, 'apps/psd-viewer/dist');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm' };
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const file = path.resolve(dist, `.${pathname === '/' ? '/index.html' : pathname}`);
    assert(file.startsWith(dist + '/'));
    const bytes = await fs.readFile(file);
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream' });
    response.end(bytes);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
async function open(page, file) {
  await page.goto(url);
  await page.locator('input[accept=".psd,.psb"]').setInputFiles(file);
  await page.getByRole('button', { name: 'Edit', exact: true }).waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Save as…' }).waitFor();
  await page.waitForFunction(() =>
    document.querySelector('[aria-label="Editor status"]')?.textContent.includes('Revision 0.')
  );
}
async function record(page, source, family, operation) {
  const before = Number(await page.getByLabel('Guarded editing').getAttribute('data-editor-revision'));
  const replies = await page.evaluate(() => window.__editorReplies.length);
  await operation();
  await page.waitForFunction((count) => window.__editorReplies.length > count, replies);
  const reply = await page.evaluate(() => window.__editorReplies.at(-1));
  const after = reply.ok && reply.value.kind === 'state' ? reply.value.state.revision : before;
  attempts.push({
    source: source.file,
    sourceHash: source.sourceHash,
    family,
    contract:
      family === 'resolution' || family.startsWith('fileInfo')
        ? 'editStateMetadata'
        : 'photoshop26.reopen-equivalent/v3-carried-untouched',
    admitted: reply.ok,
    before,
    after,
    refusal: reply.ok ? undefined : reply.error,
    load: loadavg()
  });
  if (!reply.ok) {
    assert.equal(Number(await page.getByLabel('Guarded editing').getAttribute('data-editor-revision')), before);
  }
  return reply;
}
try {
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--enable-unsafe-webgpu']
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => {
    // Force the supported download branch; OS save modals cannot be automated by headless Chrome.
    Reflect.set(window, 'showSaveFilePicker', undefined);
    window.__editorReplies = [];
    const Native = Worker;
    window.Worker = class extends Native {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', (event) => {
          if (event.data.type === 'editor') {
            window.__editorReplies.push(event.data.result);
          }
        });
      }
    };
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  for (let index = 0; index < sources.length; index++) {
    const source = sources[index];
    await open(page, source.file);
    if (index === 0) {
      await page.screenshot({ path: `${screens}/edit-mode.png` });
    }
    const result = await record(page, source, 'resolution', async () => {
      await page.getByLabel('Resolution ppi').fill(String(source.ppi));
      await page.getByRole('button', { name: 'Apply resolution', exact: true }).click();
    });
    assert(result.ok, json(result));
    costs.push(result.value.state.cost);
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save as…' }).click();
    const download = await downloaded;
    const filename = `${String(index + 1).padStart(3, '0')}-${source.sourceHash.slice(0, 12)}-resolution-${source.ppi}.psd`;
    await download.saveAs(path.join(output, filename));
    await page.waitForFunction(() =>
      document.querySelector('[aria-label="Save status"]')?.textContent.includes('Saved revision')
    );
    if (index === 0) {
      await page.screenshot({ path: `${screens}/save-flow.png` });
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      await page.waitForFunction(() =>
        document.querySelector('[aria-label="Editor status"]')?.textContent.includes('Revision 2.')
      );
      const undone = await page.evaluate(() => window.__editorReplies.at(-1));
      costs.push(undone.value.state.cost);
      await page.getByRole('button', { name: 'Redo', exact: true }).click();
      await page.waitForFunction(() =>
        document.querySelector('[aria-label="Editor status"]')?.textContent.includes('Revision 3.')
      );
      costs.push((await page.evaluate(() => window.__editorReplies.at(-1))).value.state.cost);
    }
    const bytes = await fs.readFile(path.join(output, filename));
    const original = await fs.readFile(source.file);
    const before = new codec.PsdEditorSession(original);
    const after = new codec.PsdEditorSession(bytes);
    try {
      assert.deepEqual(after.inspectProcess(), before.inspectProcess());
      assert.deepEqual(after.inspectSource().layers, before.inspectSource().layers);
      // Independent full decoder verifies stack order, names, blend/opacity and every decoded layer sample.
      assert.deepEqual(codec.readPsd(bytes), codec.readPsd(original));
      assert.notEqual(hash(bytes), hash(original));
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      let at = 30 + view.getUint32(26);
      const end = at + 4 + view.getUint32(at);
      at += 4;
      let ppi;
      while (at < end) {
        const id = view.getUint16(at + 4);
        const pascal = bytes[at + 6] + 1;
        const lengthAt = at + 6 + pascal + (pascal % 2);
        const length = view.getUint32(lengthAt);
        if (id === 1005) {
          ppi = view.getUint32(lengthAt + 4) / 65536;
        }
        at = lengthAt + 4 + length + (length % 2);
      }
      assert.equal(ppi, source.ppi);
      saves.push({
        filename,
        source: source.file,
        sourceHash: source.sourceHash,
        outputHash: hash(bytes),
        edits: [{ kind: 'resolutionNoResample', ppi: source.ppi }],
        contract: 'editStateMetadata',
        expectedOutcome: {
          stack: after.inspectProcess().layers,
          resolutionPpi: source.ppi,
          layerSamples: 'byte-identical decoded samples',
          photoshop26: 'pending separate research round'
        },
        reopen: 'psd-rs/WASM passed'
      });
    } finally {
      before.dispose();
      before.free();
      after.dispose();
      after.free();
    }
    console.log(`Saved and reopened ${index + 1}/60`);
    await fs.writeFile(path.join(output, 'manifest.json'), json({ saves, attempts, errors }));
  }
  // Distinct public input fixtures exercise every requested tree family, as actual UI requests.
  for (const source of admitted.filter((_, index) => [0, 6, 8].includes(index))) {
    await open(page, source.file);
    await page.getByLabel('Edit layer', { exact: true }).selectOption({ index: 1 });
    for (const [family, button] of [
      ['rename', 'Rename layer'],
      ['visibility', 'Hide layer'],
      ['opacity', 'Apply opacity'],
      ['fill', 'Apply Fill'],
      ['blend', 'Apply blend mode'],
      ['delete', 'Delete layer'],
      ['ungroup', 'Ungroup layer'],
      ['fileInfoTitle', 'Apply title'],
      ['fileInfoCopyright', 'Apply copyright']
    ]) {
      await record(page, source, family, async () => {
        const control =
          family === 'visibility'
            ? page.getByRole('button', { name: /^(Hide|Show) layer$/ })
            : page.getByRole('button', { name: button, exact: true });
        await control.click();
      });
    }
    await page.getByText('Reorder by drag and group selection', { exact: true }).click();
    await page.locator('[aria-label^="Group selection:"]').first().check();
    await record(page, source, 'group', () => page.getByRole('button', { name: 'Group selected layers' }).click());
    const rows = page.locator('[data-edit-layer-id]');
    if ((await rows.count()) >= 2) {
      await record(page, source, 'reorder', () => rows.first().dragTo(rows.nth(1)));
    }
    await page.getByText('Refusal details', { exact: true }).click();
    await page.screenshot({ path: `${screens}/refused-edit.png` });
  }
  // Negative resolution admission on three additional public fixtures.
  for (const source of discovery.filter((entry) => !entry.admitted).slice(0, 3)) {
    await open(page, source.file);
    await record(page, source, 'resolution', () => page.getByRole('button', { name: 'Apply resolution' }).click());
  }
  assert(saves.length >= 60);
  assert(attempts.filter((entry) => !entry.admitted).length >= 20);
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  await fs.writeFile(path.join(output, 'manifest.json'), json({ saves, attempts, errors }));
  const groups = new Map();
  for (const attempt of attempts) {
    const key = `${attempt.family}|${attempt.contract}`;
    const group = groups.get(key) ?? { family: attempt.family, contract: attempt.contract, attempts: 0, admitted: 0 };
    group.attempts++;
    group.admitted += Number(attempt.admitted);
    groups.set(key, group);
  }
  const refusalCounts = new Map();
  for (const attempt of attempts.filter((entry) => !entry.admitted)) {
    const key = `${attempt.refusal.code}|${attempt.refusal.propertyPath ?? ''}`;
    refusalCounts.set(key, (refusalCounts.get(key) ?? 0) + 1);
  }
  const report = {
    generatedAt: new Date().toISOString(),
    publicDiscovery: {
      eligible: admitted.length,
      inspected: discovery.length,
      selection:
        'oracle-1/2 original public inputs, unique SHA256, PSD, <=8 MiB and <=1,048,576 pixels; resolution eligibility preflight is separate from UI attempt denominator'
    },
    editedSaves: saves.length,
    distinctSavedSources: new Set(saves.map((save) => save.sourceHash)).size,
    admissions: [...groups.values()].map((group) => ({ ...group, share: group.admitted / group.attempts })),
    topRefusals: [...refusalCounts].sort((a, b) => b[1] - a[1]).map(([reason, count]) => ({ reason, count })),
    hostOperands: {
      savingAgent: 'PSD Viewer',
      asked: [],
      refused: [
        'Raster/tree exact-save Adobe Photoshop identity',
        'File Info copyright hardcoded Photoshop agent',
        'complete active PostScript font inventory',
        'localized Background/proof/transparency labels',
        'Photoshop host preferences and compositor identity'
      ],
      rationale:
        'No admitted operation consumes save clocks/UUIDs. These are not fabricated. Raster and copyright paths refuse before any edit; resolution preserves existing attribution and needs only explicit PPI.'
    },
    undo: {
      strategy:
        'reopen original and replay at most 64 exact committed metadata commands; one frozen save; eager source <=64 MiB',
      samples: costs,
      maxMilliseconds: Math.max(0, ...costs.map((cost) => cost.milliseconds)),
      maxReplayed: Math.max(0, ...costs.map((cost) => cost.replayed))
    },
    limitations: [
      'No truthful raster/tree or copyright edit admission exists in the bundled backend. All 60 edited saves are resolution metadata edits, not 60 successful tree edits.',
      'Photoshop 26 opening is intentionally deferred to a separate research round.'
    ],
    errors
  };
  await fs.writeFile('/tmp/psd-phase8-report.json', json(report));
}
