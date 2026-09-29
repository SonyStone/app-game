import { chromium } from '@playwright/test';
import { createReadStream, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';

/**
 * Refinement flicker probe for one GDOC (for example a corpus run's `document.gdoc`):
 *
 *   node tests/performance/zoomQuality.browser.mjs document.gdoc [page index]
 *
 * Zooms around the page at display rate, then prints every sixth frame's sharpness against the same camera once all
 * detail has settled (`ratio`, below 0.85 marked blurry) and `JUMPS`: [frame, zoom, change] where sharpness changed by
 * more than ~10% between consecutive frames. `CAPTURE=2,30` writes those frames to `/tmp/zq-frame-<n>.png`.
 */
const [file, pageArg] = process.argv.slice(2);
const url = process.env.GPU_TEXT_URL ?? 'http://127.0.0.1:3180';
const captures = (process.env.CAPTURE ?? '').split(',').filter(Boolean).map(Number);
const server = createServer((_request, response) => {
  response.writeHead(200, { 'Access-Control-Allow-Origin': '*' });
  createReadStream(file).pipe(response);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({
  channel: process.env.GPU_TEXT_BROWSER_CHANNEL ?? 'chrome',
  headless: process.env.GPU_TEXT_HEADED !== '1',
  args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]
});
const page = await browser.newPage({ viewport: { width: 1512, height: 900 }, deviceScaleFactor: 2 });
page.on('pageerror', (error) => console.log('BROWSER', error.message));
await page.goto(`${url}/tests/browser/empty.html`);
const result = await page.evaluate(
  async ([source, pageArg, captures]) => {
    const { prepareZoomProbe } = await import('/tests/performance/zoomQualityHarness.ts');
    const probe = await prepareZoomProbe(source);
    const center = probe.focus(pageArg === undefined ? Math.floor(probe.pages / 2) : Number(pageArg));
    // Wheel-like zoom: page view to 1/16 of it and back, 2 s each way, then a faster, deeper cycle.
    const path = [];
    const leg = (from, to, frames) => {
      for (let i = 0; i < frames; i++) {
        path.push({ ...center, zoom: from * (to / from) ** (i / (frames - 1)) });
      }
    };
    leg(0.7, 0.7 / 16, 120);
    leg(0.7 / 16, 0.7, 120);
    leg(0.7, 0.7 / 32, 60);
    leg(0.7 / 32, 0.7, 60);
    const frames = await probe.run(path, true, captures);
    const references = [];
    for (let i = 0; i < frames.length; i += 6) {
      references.push([i, await probe.reference(frames[i])]);
    }
    return { frames, references };
  },
  [`http://127.0.0.1:${server.address().port}/`, pageArg, captures]
);

for (const [i, reference] of result.references) {
  const frame = result.frames[i];
  const ratio = frame.sharpness / reference;
  console.log(
    `${String(i).padStart(3)} zoom ${frame.zoom.toFixed(4)} sharp ${frame.sharpness.toFixed(1)} ` +
      `ref ${reference.toFixed(1)} ratio ${ratio.toFixed(2)}${ratio < 0.85 ? '  <-- blurry' : ''} ` +
      `missing ${frame.refinement?.missing ?? '-'}`
  );
}

// Zoom changes sharpness by only a few percent per frame; larger steps are visible sharp/blurry switches.
const jumps = result.frames
  .map((frame, i) => [
    i,
    +frame.zoom.toFixed(4),
    i ? +(frame.sharpness / result.frames[i - 1].sharpness).toFixed(2) : 1
  ])
  .filter(([, , change]) => change < 0.9 || change > 1.12);
console.log('JUMPS', JSON.stringify(jumps));

for (const [i, frame] of result.frames.entries()) {
  if (frame.png) {
    writeFileSync(`/tmp/zq-frame-${i}.png`, Buffer.from(frame.png.split(',')[1], 'base64'));
  }
}

await browser.close();
server.close();
