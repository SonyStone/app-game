import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { loadavg } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Run with baseline wasm directory and output JSON. Measures editor open, untouched streaming,
// and rename transaction latency on the existing benchmark matrix, independently of browser rendering.
const [baseline, output = '/tmp/psd-visual-save-ab.json'] = process.argv.slice(2);
if (!baseline || !process.env.PSD_TEXT_MIXER_RESEARCH_ROOT) {
  throw new Error('Supply baseline wasm directory and PSD_TEXT_MIXER_RESEARCH_ROOT.');
}
const root = process.env.PSD_TEXT_MIXER_RESEARCH_ROOT;
const matrix = await readFile(new URL('./bench-repeat.mjs', import.meta.url), 'utf8');
const cases = [...matrix.matchAll(/\[\s*'([^']+)',\s*'([^']+)',\s*'(psd|psb)'\s*\]/g)].map((match) => match.slice(1));
cases.push(['admitted-control', null, 'psd']);
const rows = [];
for (let round = 1; round <= 3; round++) {
  for (const [name, directory, ext] of cases) {
    const file = directory
      ? `${root}/fixtures/psd/oracle-1/${directory}/source-input/document.${ext}`
      : new URL('../../../packages/psd/test/editor/source-host-rgb8.psd', import.meta.url).pathname;
    for (const variant of round % 2
      ? ['previous', 'current', 'currentStrict']
      : ['currentStrict', 'current', 'previous']) {
      const module =
        variant === 'previous' ? resolve(baseline) : new URL('../../../packages/psd/wasm', import.meta.url).pathname;
      const row = JSON.parse(
        execFileSync(
          process.execPath,
          [
            '--input-type=module',
            '-e',
            `
        import { readFile } from 'node:fs/promises';
        import { loadavg } from 'node:os';
        const codec = await import(${JSON.stringify(pathToFileURL(`${module}/photoshop_psd_wasm.js`).href)});
        await codec.default({ module_or_path: await readFile(${JSON.stringify(`${module}/photoshop_psd_wasm_bg.wasm`)}) });
        const bytes = new Uint8Array(await readFile(${JSON.stringify(file)}));
        const row = { load: loadavg(), bytes: bytes.length };
        let editor;
        try {
          let start = performance.now();
          editor = new codec.PsdEditorSession(bytes);
          row.openMs = performance.now() - start;
          start = performance.now();
          const saved = editor.prepareSave(false);
          let count = 0;
          while (true) { const chunk = saved.nextChunk(1024 * 1024); if (!chunk) { break; } count += chunk.length; }
          saved.dispose(); saved.free();
          row.untouchedSaveMs = performance.now() - start;
          row.savedBytes = count;
          const processInfo = editor.inspectProcess();
          const layer = processInfo.layers.find(layer => layer.layerId !== null && layer.right > layer.left && layer.bottom > layer.top && layer.channelIds.includes(0));
          const context = {
            contract: ${JSON.stringify(variant !== 'currentStrict' ? 'photoshop26.visual/v3' : 'photoshop26.reopen-equivalent/v5-source-host')}, sourceBytes: bytes,
            editTime: Date.now()/1000,
            save: { basename: 'benchmark', saveTime: new Date().toISOString().slice(0,19)+'+00:00', exifTime: '2026:10:29 12:00:00', instanceId: 'xmp.iid:'+crypto.randomUUID(), documentId: 'adobe:docid:photoshop:'+crypto.randomUUID(), softwareAgent: 'PSD Viewer', linearBlending: false },
            typeRendering: { textGamma: 1.45 }, colorPolicy: { workingRGB: 'sRGB IEC61966-2.1', rgb: 'preserve', missingProfile: 'leaveUntagged' }
          };
          start = performance.now();
          try {
            const result = editor.editRasterTreeExact([{ kind: processInfo.mode === 3 && processInfo.depth === 8 ? 'rename' : 'renameProcessLayer', layerId: layer.layerId, name: 'Benchmark rename' }], context);
            row.editMs = performance.now()-start; row.route = result.saveNote?.route ?? 'v5'; row.admitted = true;
          } catch (error) { row.editMs = performance.now()-start; row.admitted = false; row.refusal = error.propertyPath ?? error.message; }
        } catch (error) { row.error = error.message; }
        finally { if (editor) { editor.dispose(); editor.free(); } }
        console.log(JSON.stringify(row));
      `
          ],
          { maxBuffer: 1024 * 1024, encoding: 'utf8' }
        )
      );
      rows.push({ round, name, variant, ...row });
      await writeFile(
        output,
        JSON.stringify(
          { scope: 'WASM editor open, untouched stream and rename; not browser presentation', load: loadavg(), rows },
          null,
          2
        )
      );
      console.log(
        round,
        name,
        variant,
        row.openMs?.toFixed(1),
        row.untouchedSaveMs?.toFixed(1),
        row.editMs?.toFixed(1),
        row.admitted ?? row.error
      );
    }
  }
}
