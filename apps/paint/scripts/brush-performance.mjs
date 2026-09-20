import { readAdobeBrushFixture } from '../../../scripts/adobe-brush-fixture.mjs';
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { compareBrushPerformance } from './compare-brush-performance.mjs';

const { values } = parseArgs({ options: {
  cdp: { type: 'string' }, url: { type: 'string', default: 'http://localhost:3030' },
  device: { type: 'string' }, record: { type: 'string' }, baseline: { type: 'string' }, output: { type: 'string' },
  verify: { type: 'boolean', default: false }
} });
if (!values.cdp || !values.device || Number(!!values.record) + Number(!!values.baseline) !== 1)
  throw new Error('Use --cdp URL --device NAME and exactly one of --record FILE or --baseline FILE. Start the Paint dev server first.');

const browser = await chromium.connectOverCDP(values.cdp);
const page = await browser.contexts()[0].newPage();
try {
  const url = new URL('/__brush-performance', values.url).href;
  await page.route(url, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Brush performance checks</title>' }));
  const fixture = await readAdobeBrushFixture('megapack.abr');
  await page.route(new URL('/__megapack.abr', values.url).href, route => route.fulfill({ contentType: 'application/octet-stream', body: fixture }));
  await page.goto(url);
  await page.exposeFunction('reportBrushPerformance', message => console.log(message));
  const result = await page.evaluate(async (verify) => {
    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) throw new Error('WebGPU unavailable. Unlock the tablet and leave Chrome visible.');
    const lock = await navigator.wakeLock.request('screen');
    try {
      const { measureBrushPerformance, verifyBrushPerformanceOutput } = await import('/src/performance/brushPerformance.ts');
      if (verify) await verifyBrushPerformanceOutput(message => window.reportBrushPerformance(message));
      return { schema: 1, environment: {
        userAgent: navigator.userAgent, dpr: devicePixelRatio, width: innerWidth, height: innerHeight,
        gpu: { vendor: adapter.info.vendor, architecture: adapter.info.architecture, description: adapter.info.description }
      }, cases: await measureBrushPerformance(message => window.reportBrushPerformance(message), await (await fetch('/__megapack.abr')).blob()) };
    } finally { await lock.release(); }
  }, values.verify);
  result.environment.device = values.device;
  result.recordedAt = new Date().toISOString();
  result.commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  result.dirty = !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
  if (values.output) await writeFile(values.output, JSON.stringify(result, null, 2) + '\n');
  if (values.record) {
    // Never silently replace an accepted baseline with slower results.
    await writeFile(values.record, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log(`Recorded ${values.record}; visually review changed brush output before accepting a new baseline.`);
  } else {
    const failures = compareBrushPerformance(JSON.parse(await readFile(values.baseline, 'utf8')), result);
    if (failures.length) throw new Error(failures.join('\n'));
    console.log('Brush performance baseline passed.');
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await page.close();
  // Detach without browser.close(), which would close the user's tablet Chrome session.
}
process.exit(process.exitCode ?? 0);
