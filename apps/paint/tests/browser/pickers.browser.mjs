import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** Run against an isolated Vite server with PAINT_URL=http://127.0.0.1:<port>. */
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-webgpu', '--use-angle=metal']
});
try {
  assert.ok(process.env.PAINT_URL, 'PAINT_URL must point to this worktree’s Vite server');
  const page = await browser.newPage({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 2 });
  await page.goto(`${process.env.PAINT_URL}/variants.html`);
  const results = await page.evaluate(async () => {
    const { paintDisk } = await import('/src/features/color-wheel/paintDisk.ts');
    const { paintDisc } = await import('/src/shared/ui/colorDisc.ts');
    const { paintTriangle } = await import('/src/features/hue-triangle/paintTriangle.ts');
    const { referenceDisk, referenceDisc, referenceTriangle } =
      await import('/src/features/color-wheel/testing/referencePickers.ts');
    const results = [];
    function measure(kind, version, size, paint) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const coldStart = performance.now();
      paint(canvas, 0);
      const cold = performance.now() - coldStart;
      for (let i = 0; i < 12; i++) {
        paint(canvas, i);
      }
      const times = [];
      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        paint(canvas, i);
        times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b);
      results.push({
        kind,
        version,
        size,
        cold,
        median: times[50],
        p95: times[95],
        mean: times.reduce((a, b) => a + b, 0) / times.length
      });
    }
    measure('OKLCH', 'before', 480, (c, i) => referenceDisk(c, 0.2 + (i % 60) / 100));
    measure('Disc', 'before', 316, (c, i) => referenceDisc(c, i * 3.1, 316));
    measure('Triangle', 'before', 440, (c, i) => referenceTriangle(c, i * 3.1, i * 3.1));
    for (const size of [64, 144, 320, 424]) {
      measure('OKLCH', 'after', size, (c, i) => paintDisk(c, 0.2 + (i % 60) / 100));
      measure('Disc', 'after', size, (c, i) => paintDisc(c, i * 3.1, size));
      measure('Triangle', 'after', size, (c, i) => paintTriangle(c, i * 3.1, i * 3.1));
    }
    return results;
  });
  console.table(results);
  const output = process.env.PAINT_PICKER_METRICS ?? path.join(os.tmpdir(), 'paint-picker-metrics.json');
  await writeFile(
    output,
    JSON.stringify({ browser: browser.version(), dpr: 2, warmup: 12, samples: 100, results }, null, 2)
  );
  console.log(`Metrics: ${output}`);
  for (const metric of results.filter((r) => r.version === 'after' && r.size <= 320)) {
    assert.ok(metric.mean <= (metric.kind === 'OKLCH' ? 4 : 1), JSON.stringify(metric));
  }
} finally {
  await browser.close();
}
