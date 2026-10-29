// Real production UI saves. Research sources are read-only; browsers use temporary profiles.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
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
assert(research, 'Set PSD_TEXT_MIXER_RESEARCH_ROOT to the read-only fixture checkout.');
const output = process.env.PSD_EDIT_SAVES ?? '/tmp/psd-viewer-v5-saves';
const screens = process.env.PSD_EDIT_SCREENS ?? '/tmp/psd-viewer-v5-screens';
const reportFile = process.env.PSD_EDIT_REPORT ?? '/tmp/psd-viewer-v5-report.json';
await fs.mkdir(output, { recursive: true });
await fs.mkdir(screens, { recursive: true });
const codec = await import(`${repo}/packages/psd/wasm/photoshop_psd_wasm.js`);
await codec.default({ module_or_path: await fs.readFile(`${repo}/packages/psd/wasm/photoshop_psd_wasm_bg.wasm`) });
const viewer = await import(`${repo}/packages/psd/wasm-viewer/photoshop_psd_viewer.js`);
await viewer.default({
  module_or_path: await fs.readFile(`${repo}/packages/psd/wasm-viewer/photoshop_psd_viewer_bg.wasm`)
});
const textGamma = process.env.PSD_EDIT_TEXT_GAMMA === 'off' ? null : 1.45;
const contract = 'photoshop26.reopen-equivalent/v5-source-host';
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const json = (value) => JSON.stringify(value, (_, value) => (typeof value === 'bigint' ? value.toString() : value), 2);
const evidence = path.join(research, 'evidence');
const own = JSON.parse(await fs.readFile(`${evidence}/2026-10-25-psd-E-own-5/census-final.json`)).operations;
const publicRows = JSON.parse(await fs.readFile(`${evidence}/2026-10-27-psd-E-own-agent/public-requests.json`));
const families = [
  'rename',
  'opacity',
  'pixels',
  'out',
  'delete',
  'group-group-selected',
  'group-opacity',
  'group-blend',
  'group-visibility',
  'group-out',
  'group-delete',
  'group-ungroup'
];
const metric = Object.fromEntries(
  families.map((family, index) => [family, [387, 168, 353, 343, 199, 380, 189, 189, 189, 167, 167, 167][index]])
);
const census = [];
const attempts = [];
const saves = [];
const errors = [];
const costs = [];
if (process.env.PSD_EDIT_RESUME === '1') {
  const previous = JSON.parse(await fs.readFile(path.join(output, 'manifest.json')));
  attempts.push(...previous.attempts);
  saves.push(...previous.saves);
}

/** Genuine clocks, fresh identities and source bytes are the only runtime inputs to v5. */
function context(file, bytes) {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return {
    contract,
    sourceBytes: bytes,
    typeRendering: { textGamma },
    colorPolicy: { workingRGB: 'sRGB IEC61966-2.1', rgb: 'preserve', missingProfile: 'leaveUntagged' },
    editTime: now.valueOf() / 1000,
    save: {
      basename: path.parse(file).name,
      saveTime: now.toISOString().slice(0, 19) + '+00:00',
      exifTime: `${now.getFullYear()}:${pad(now.getMonth() + 1)}:${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
      instanceId: `xmp.iid:${crypto.randomUUID()}`,
      documentId: `adobe:docid:photoshop:${crypto.randomUUID()}`,
      softwareAgent: 'PSD Viewer',
      linearBlending: false
    }
  };
}

/** Reproduces the frozen command using target identity/geometry only, never its captured host context. */
function command(row, input) {
  const layerId = row.targetId;
  const native = input.readUInt16BE(24) !== 3 || input.readUInt16BE(22) !== 8;
  if (row.op === 'pixels') {
    const [left, top, right, bottom] = row.bounds;
    const width = right - left,
      height = bottom - top;
    if (native) {
      const colors = input.readUInt16BE(24) === 4 ? 4 : input.readUInt16BE(24) === 1 ? 1 : 3;
      const size = width * height * (input.readUInt16BE(22) / 8);
      return {
        kind: 'replaceProcessPlanes',
        layerId,
        planes: Array.from({ length: colors + 1 }, (_, index) => new Uint8Array(size).fill(index === colors ? 255 : 0))
      };
    }
    return {
      kind: 'replacePixels',
      layerId,
      pixels: {
        left,
        top,
        width,
        height,
        rgba: Uint8Array.from({ length: width * height * 4 }, (_, index) => (index % 4 === 3 ? 255 : 0))
      }
    };
  }
  if (native && row.op === 'rename') {
    return { kind: 'renameProcessLayer', layerId, name: 'renamed' };
  }
  if (native && ['opacity', 'group-opacity'].includes(row.op)) {
    return { kind: 'setProcessOpacity', layerId, opacity: 173 };
  }
  switch (row.op) {
    case 'rename':
      return { kind: 'rename', layerId, name: 'renamed' };
    case 'opacity':
    case 'group-opacity':
      return { kind: 'opacity', layerId, opacity: 173 };
    case 'out':
    case 'group-out':
      return { kind: 'move', layerId, index: 0 };
    case 'delete':
    case 'group-delete':
      return { kind: 'delete', layerId };
    case 'group-blend':
      return { kind: 'blend', layerId, blend: 'multiply' };
    case 'group-visibility':
      return { kind: 'visible', layerId, visible: row.visible ?? false };
    case 'group-ungroup':
      return { kind: 'ungroupLayer', layerId };
    case 'group-group-selected':
      return { kind: 'groupSelectedLayers', layerIds: [layerId], name: 'Group 1', expanded: true };
    case 'fill':
      return { kind: 'fill', layerId, fill: 173 };
    case 'blend':
      return { kind: 'blend', layerId, blend: 'multiply' };
    case 'visibility':
      return { kind: 'visible', layerId, visible: row.visible ?? false };
    case 'resolution':
      return { kind: 'resolutionNoResample', ppi: 144 };
    case 'fileInfoCopyright':
      return { kind: 'fileInfoCopyright', status: 'publicDomain' };
    default:
      throw new Error(row.op);
  }
}

/** Always releases the frozen resource, including on read failure. */
function collect(save) {
  try {
    const chunks = [];
    for (let chunk; (chunk = save.nextChunk(1024 * 1024)); ) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } finally {
    save.dispose();
    save.free();
  }
}

/** Read-only independent reopen records complete order, hierarchy, persisted IDs and scalar properties. */
function stack(bytes) {
  const editor = new codec.PsdEditorSession(bytes);
  const document = viewer.PsdDocumentHandle.open(bytes);
  try {
    const ids = new Map(editor.inspectSource().layers.map((layer) => [layer.recordIndex, layer.layerId]));
    const project = (nodes) =>
      nodes.map((node) => ({
        id: ids.get(node.index),
        name: node.name,
        visible: node.visible,
        opacity: node.opacity,
        fill: node.fill,
        blend: node.blendMode,
        children: project(node.children ?? [])
      }));
    return project(document.layers());
  } finally {
    editor.dispose();
    editor.free();
    document.free();
  }
}

/** Executes a single independent transaction. Only a named missing-event refusal permits a preparation retry. */
function probe(row, bytes, expectedStack = false) {
  const session = new codec.PsdEditorSession(bytes);
  const ctx = context(row.file, bytes);
  const edit = command(row, bytes);
  try {
    if (['resolution', 'fileInfoCopyright'].includes(row.op)) {
      session.editStateMetadata([
        {
          ...edit,
          ...(row.op === 'fileInfoCopyright'
            ? {
                saveContext: {
                  modifiedAt: ctx.save.saveTime,
                  instanceId: ctx.save.instanceId,
                  documentId: ctx.save.documentId,
                  softwareAgent: ctx.save.softwareAgent
                }
              }
            : {})
        }
      ]);
    } else {
      try {
        session.editRasterTreeExact([edit], ctx);
      } catch (error) {
        if (!error.propertyPath?.includes('save.xmp.initial-event')) {
          throw error;
        }
        ctx.initialEvent = {
          instanceId: `xmp.iid:${crypto.randomUUID()}`,
          when: new Date().toISOString().slice(0, 19) + '+00:00'
        };
        session.editRasterTreeExact([edit], ctx);
      }
    }
    return { admitted: true, expectedStack: expectedStack ? stack(collect(session.prepareSave(false))) : undefined };
  } catch (error) {
    assert.equal(session.revision, 0n);
    assert.deepEqual(collect(session.prepareSave(false)), bytes);
    return { admitted: false, refusal: { code: error.code, propertyPath: error.propertyPath, message: error.message } };
  } finally {
    session.dispose();
    session.free();
  }
}

/** Family denominators include refusals; UI sampling is reported separately from the complete API census. */
function shares(rows) {
  return [...new Set(rows.map((row) => row.op))].map((op) => {
    const group = rows.filter((row) => row.op === op);
    return {
      family: op,
      admitted: group.filter((row) => row.admitted).length,
      attempts: group.length,
      share: group.filter((row) => row.admitted).length / group.length
    };
  });
}

async function persist() {
  await fs.writeFile(path.join(output, 'manifest.json'), json({ contract, saves, attempts, errors }));
  await fs.writeFile(
    reportFile,
    json({
      textGamma,
      batch19Metric: 'evidence/2026-10-23-psd-batch-19/METRIC.md',
      generatedAt: new Date().toISOString(),
      editedSaves: saves.length,
      distinctSavedSources: new Set(saves.map((row) => row.sourceHash)).size,
      census: {
        own: shares(census.filter((row) => row.cohort === 'own')),
        public: shares(census.filter((row) => row.cohort === 'public')),
        comparison: families.map((family) => {
          const rows = census.filter((row) => row.cohort === 'own' && row.op === family);
          const denominator = family.startsWith('group-') && family !== 'group-group-selected' ? 225 : 466;
          return {
            family,
            measured: `${rows.filter((row) => row.admitted).length}/${rows.length}`,
            metric: `${metric[family]}/${denominator}`
          };
        })
      },
      ui: { admission: shares(attempts), attempts: attempts.length, costs },
      refusals: Object.entries(
        Object.groupBy(
          attempts.filter((row) => !row.admitted),
          (row) => row.refusal.propertyPath ?? row.refusal.code
        )
      ).map(([reason, rows]) => ({ reason, count: rows.length })),
      operands:
        'Pristine source bytes, runtime clocks, crypto.randomUUID, PSD Viewer agent and user choices only. No host profile requested.',
      limitations: [
        'Photoshop verification is pending a later round.',
        'The full API census and deliberately stratified real-UI sample have separate denominators.',
        'The color-fill UI supports opaque RGB8 samples; native process replacement is measured only in the API census.'
      ],
      errors
    })
  );
}

// Reuse only this driver's completed census when resuming UI work.
const censusFile = path.join(output, 'census.json');
if (process.env.PSD_EDIT_RESUME === '1') {
  census.push(...JSON.parse(await fs.readFile(censusFile)));
} else {
  for (const [cohort, rows] of [
    ['own', own],
    ['public', publicRows]
  ]) {
    let previous, bytes;
    for (const row of rows
      .filter((row) => row.applicable && row.targetId > 0)
      .sort((a, b) => a.source.localeCompare(b.source))) {
      const file = path.resolve(research, row.source);
      if (file !== previous) {
        previous = file;
        bytes = await fs.readFile(file);
      }
      const result = probe({ ...row, file }, bytes);
      census.push({
        cohort,
        file,
        sourceHash: hash(bytes),
        op: row.op,
        targetId: row.targetId,
        bounds: row.bounds,
        split: row.split,
        mode: bytes.readUInt16BE(24),
        depth: bytes.readUInt16BE(22),
        ...result
      });
      if (census.length % 250 === 0) {
        console.log(`Census ${census.length}, load ${loadavg()}`);
      }
    }
  }
  await fs.writeFile(censusFile, json(census));
}
await persist();
/** Drag sampling needs two distinct root siblings; self-move decisions remain in the complete census. */
function uiRequestAvailable(row) {
  if (row.op === 'pixels') {
    return row.mode === 3 && row.depth === 8;
  }
  if (row.op === 'out' || row.op === 'group-out') {
    const roots = stack(readFileSync(row.file));
    return roots.length > 1 && roots[0].id !== row.targetId && roots.some((layer) => layer.id === row.targetId);
  }
  return true;
}

const selected = [];
for (const family of families) {
  const eligible = census.filter(
    (row) => row.cohort === 'own' && row.op === family && row.admitted && uiRequestAvailable(row)
  );
  // Spread positives over source-profile directories and tune/held-out inputs, not just the easiest prefix.
  const strata = Object.values(
    Object.groupBy(
      eligible,
      (row) => `${path.relative(research, row.file).split(path.sep).slice(0, 4).join('/')}|${row.split}`
    )
  );
  for (let index = 0; selected.filter((row) => row.op === family).length < 11; index++) {
    for (const group of strata) {
      if (group[index] && selected.filter((row) => row.op === family).length < 11) {
        selected.push(group[index]);
      }
    }
    assert(index < eligible.length, `No UI positives for ${family}`);
  }
  selected.push(
    ...census
      .filter((row) => row.cohort === 'public' && row.op === family && !row.admitted && uiRequestAvailable(row))
      .slice(0, 2)
  );
  selected.push(
    ...census
      .filter((row) => row.cohort === 'own' && row.op === family && !row.admitted && uiRequestAvailable(row))
      .slice(0, 1)
  );
}
// Own-agent first-preparation and source-host leaf controls are independent of the frozen original census.
for (const directory of ['E-own-agent', 'E-own-source']) {
  for (const name of (await fs.readdir(path.join(research, 'fixtures/psd', directory)))
    .filter((name) => /\.(psd|psb)$/.test(name))
    .sort()) {
    const file = path.join(research, 'fixtures/psd', directory, name);
    const bytes = await fs.readFile(file);
    const editor = new codec.PsdEditorSession(bytes);
    try {
      const targetId = editor.inspectProcess().layers.find((layer) => layer.layerId !== null)?.layerId;
      if (!targetId) {
        continue;
      }
      const row = { file, op: 'rename', targetId, sourceHash: hash(bytes), cohort: directory };
      selected.push({ ...row, ...probe(row, bytes) });
    } finally {
      editor.dispose();
      editor.free();
    }
  }
}
for (const op of ['fill', 'blend', 'visibility', 'resolution', 'fileInfoCopyright']) {
  for (const row of census
    .filter((row) => row.cohort === 'own' && row.op === 'rename' && row.admitted && row.mode === 3 && row.depth === 8)
    .slice(0, 3)) {
    const candidate = { ...row, op };
    selected.push({ ...candidate, ...probe(candidate, await fs.readFile(candidate.file)) });
  }
}
const metadataFile = path.join(repo, 'packages/psd/test/editor/metadata.psd');
const metadataBytes = await fs.readFile(metadataFile);
selected.push({
  file: metadataFile,
  op: 'fileInfoCopyright',
  targetId: 4,
  sourceHash: hash(metadataBytes),
  cohort: 'owned-metadata-control'
});

let resolutionSources = 0;
for (const file of new Set(census.filter((row) => row.cohort === 'public').map((row) => row.file))) {
  const bytes = await fs.readFile(file);
  const row = { file, op: 'resolution', targetId: 0, sourceHash: hash(bytes), cohort: 'public-metadata' };
  if (probe(row, bytes).admitted) {
    selected.push(row);
    if (++resolutionSources === 3) {
      break;
    }
  }
}
assert.equal(resolutionSources, 3, 'Need three real public resolution controls.');

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
let browser;
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;

/** Waits for real worker acknowledgments but never sends an edit outside the UI. */
async function operate(page, row) {
  const count = await page.evaluate(() => window.__editorReplies.length);
  const button = (name) => page.getByRole('button', { name, exact: true });
  if (!['resolution', 'fileInfoCopyright'].includes(row.op)) {
    await page.getByLabel('Edit layer', { exact: true }).selectOption(String(row.targetId));
  }
  switch (row.op) {
    case 'rename':
      await page.getByLabel('Layer name', { exact: true }).fill('renamed');
      await button('Rename layer').click();
      break;
    case 'opacity':
    case 'group-opacity':
      await page.getByLabel('Edit opacity', { exact: true }).fill('173');
      await button('Apply opacity').click();
      break;
    case 'fill':
      await page.getByLabel('Edit Fill', { exact: true }).fill('173');
      await button('Apply Fill').click();
      break;
    case 'blend':
    case 'group-blend':
      await page.getByLabel('Edit blend mode', { exact: true }).selectOption('multiply');
      await button('Apply blend mode').click();
      break;
    case 'visibility':
    case 'group-visibility':
      await page.getByRole('button', { name: /^(Hide|Show) layer$/ }).click();
      break;
    case 'pixels':
      await page.getByText('Replace layer pixels', { exact: true }).click();
      await button('Fill layer pixels').click();
      break;
    case 'delete':
    case 'group-delete':
      await button('Delete layer').click();
      break;
    case 'group-ungroup':
      await button('Ungroup layer').click();
      break;
    case 'out':
    case 'group-out': {
      await page.getByText('Reorder by drag and group selection', { exact: true }).click();
      const source = page.locator(`[data-edit-layer-id="${row.targetId}"]`);
      const destination = page.locator('[data-edit-layer-id]').first();
      assert.notEqual(
        await source.getAttribute('data-edit-layer-id'),
        await destination.getAttribute('data-edit-layer-id'),
        'A UI move must change the stack'
      );
      await source.dragTo(destination);
      break;
    }
    case 'group-group-selected': {
      await page.getByText('Reorder by drag and group selection', { exact: true }).click();
      await page.locator(`[data-edit-layer-id="${row.targetId}"] input`).check();
      await page.getByLabel('Group name', { exact: true }).fill('Group 1');
      await button('Group selected layers').click();
      break;
    }
    case 'resolution':
      await page.getByLabel('Resolution ppi').fill('144');
      await button('Apply resolution').click();
      break;
    case 'fileInfoCopyright':
      await button('Apply copyright').click();
      break;
    default:
      throw new Error(row.op);
  }
  await page.waitForFunction((count) => window.__editorReplies.length > count, count);
  return page.evaluate(() => window.__editorReplies.at(-1));
}

try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args: ['--enable-unsafe-webgpu']
  });
  const browserContext = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  await browserContext.addInitScript(() => {
    Reflect.set(window, 'showSaveFilePicker', undefined);
    window.__editorReplies = [];
    const Native = Worker;
    window.Worker = class extends Native {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', ({ data }) => {
          if (data.type === 'editor') {
            window.__editorReplies.push(data.result);
          }
        });
      }
    };
  });
  const page = await browserContext.newPage();
  page.setDefaultTimeout(60_000);
  page.on('pageerror', (error) => errors.push(error.message));
  for (const row of selected) {
    if (attempts.some((attempt) => attempt.source === row.file && attempt.op === row.op)) {
      continue;
    }
    await page.goto(url);
    await page.locator('input[accept=".psd,.psb"]').setInputFiles(row.file);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.waitForFunction(() =>
      document.querySelector('[aria-label="Editor status"]')?.textContent.includes('Revision 0.')
    );
    await page.getByText('Advanced', { exact: true }).click();
    await page.getByText('File Info and resolution', { exact: true }).first().click();
    await page.getByLabel('Blend text colors using gamma', { exact: true }).setChecked(textGamma !== null);
    const original = await fs.readFile(row.file);
    if (row.op === 'visibility' || row.op === 'group-visibility') {
      const flattened = (nodes) => nodes.flatMap((node) => [node, ...flattened(node.children)]);
      row.visible = !flattened(stack(original)).find((node) => node.id === row.targetId).visible;
    }
    const expected = probe(row, original, true);
    const reply = await operate(page, row);
    const admitted = reply.ok;
    const attempt = {
      source: row.file,
      sourceHash: row.sourceHash,
      cohort: row.cohort,
      op: row.op,
      contract: ['resolution', 'fileInfoCopyright'].includes(row.op) ? 'editStateMetadata' : contract,
      edits: [command(row, original)],
      admitted,
      expectedAdmission: expected.admitted,
      refusal: admitted ? undefined : reply.error,
      load: loadavg()
    };
    // Omit potentially large sample buffers from the manifest; black opaque replacement is reproducible from geometry.
    if (row.op === 'pixels') {
      attempt.edits = [{ kind: 'replacePixels', layerId: row.targetId, bounds: row.bounds, rgba: 'opaque black' }];
    }
    attempts.push(attempt);
    assert.equal(admitted, expected.admitted, json(attempt));
    if (!admitted) {
      assert.equal(await page.getByLabel('Guarded editing').getAttribute('data-editor-revision'), '0');
      if (
        !(await fs.stat(`${screens}/readable-refusal.png`).catch(() => undefined)) &&
        /type|font/i.test(reply.error.propertyPath ?? '')
      ) {
        await page.locator('[data-refusal-code]').scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${screens}/readable-refusal.png` });
      }
    } else {
      costs.push(reply.value.state.cost);
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Save as…' }).click();
      const download = await downloadPromise;
      const filename = `${String(saves.length + 1).padStart(3, '0')}-${row.sourceHash.slice(0, 12)}-${row.op}.${path.extname(row.file).slice(1)}`;
      await download.saveAs(path.join(output, filename));
      await page.waitForFunction(() =>
        document.querySelector('[aria-label="Save status"]')?.textContent.includes('Saved revision 1')
      );
      const bytes = await fs.readFile(path.join(output, filename));
      const reopened = stack(bytes);
      assert.deepEqual(reopened, expected.expectedStack, `${row.op} stack mismatch`);
      assert.notEqual(hash(bytes), hash(original));
      saves.push({
        filename,
        source: row.file,
        sourceHash: row.sourceHash,
        outputHash: hash(bytes),
        edits: attempt.edits,
        contract: attempt.contract,
        expectedOutcome: { stack: reopened, photoshopVerification: 'pending later round' },
        reopen: 'psd-rs core editor and production viewer passed'
      });
      if (saves.length === 1) {
        await page.getByLabel('How to save').scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${screens}/save-option.png` });
        await page.getByLabel('Layer name', { exact: true }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${screens}/admitted-edit.png` });
      }
    }
    console.log(
      `UI ${attempts.length}/${selected.length}: ${row.op} ${admitted ? `saved ${saves.length}` : reply.error.propertyPath}`
    );
    await persist();
  }
  assert(saves.length >= 120, `Only ${saves.length} edited saves`);
  assert.deepEqual(errors, []);
} catch (error) {
  errors.push(error.stack ?? String(error));
  throw error;
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  await persist();
}
