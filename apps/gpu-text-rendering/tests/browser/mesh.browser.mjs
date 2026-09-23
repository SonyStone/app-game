import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { installHarness } from '../compatibility/browserHarness.mjs';
import { makePdf } from '../fixtures/pdf.mjs';

/** Original mesh fixtures exercise interpolation before color conversion, coverage and round-trip loading. */
function meshPdf(kind, { alpha = 1, background = false, nonlinear = false } = {}) {
  const corners = [
    [0, 0],
    [0, 85],
    [0, 170],
    [0, 255],
    [85, 255],
    [170, 255],
    [255, 255],
    [255, 170],
    [255, 85],
    [255, 0],
    [170, 0],
    [85, 0]
  ];
  let bytes;
  let properties;
  if (kind === 4) {
    bytes = nonlinear
      ? [0, 0, 0, 0, 0, 255, 0, 255, 0, 0, 255, 128]
      : [0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 255, 0, 0, 0, 255, 0, 0, 255];
    properties = '/BitsPerFlag 8';
  } else if (kind === 5) {
    bytes = [0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255];
    properties = '/VerticesPerRow 2';
  } else {
    bytes = [
      0,
      ...corners.flat(),
      ...(kind === 7 ? [85, 85, 85, 170, 170, 170, 170, 85] : []),
      255,
      0,
      0,
      0,
      255,
      0,
      0,
      0,
      255,
      255,
      255,
      255
    ];
    properties = '/BitsPerFlag 8';
  }
  const hex = Buffer.from(bytes).toString('hex') + '>';
  const extra = nonlinear ? '/Function << /FunctionType 2 /Domain [0 1] /C0 [1 0 0] /C1 [0 0 1] /N 2 >>' : '';
  return makePdf('/A gs /S sh', {
    width: 100,
    height: 100,
    resources: `/Shading << /S 7 0 R >> /ExtGState << /A << /ca ${alpha} >> >>`,
    extraObjects: [
      `<< /ShadingType ${kind} /ColorSpace /DeviceRGB /BitsPerCoordinate 8 /BitsPerComponent 8 ${properties} /Decode [10 90 10 90 0 1 ${nonlinear ? '' : '0 1 0 1'}] ${extra} ${background ? '/Background [1 1 0]' : ''} /Filter /ASCIIHexDecode /Length ${hex.length} >>\nstream\n${hex}\nendstream`
    ]
  });
}

const cases = [
  ...[4, 5].map((kind) => ({ name: `type-${kind}`, pdf: meshPdf(kind), point: [30, 30], color: [128, 64, 64] })),
  ...[6, 7].map((kind) => ({ name: `type-${kind}`, pdf: meshPdf(kind), point: [30, 30], color: [191, 96, 64] })),
  { name: 'opacity', pdf: meshPdf(4, { alpha: 0.5 }), point: [30, 30], color: [191, 159, 159] },
  { name: 'background', pdf: meshPdf(4, { background: true }), point: [5, 5], color: [255, 255, 0] },
  { name: 'nonlinear-function', pdf: meshPdf(4, { nonlinear: true }), point: [30, 30], color: [219, 0, 36] }
];
const output = process.env.GPU_TEXT_OUTPUT ?? '/tmp/gpu-text-mesh';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.GPU_TEXT_BROWSER_CHANNEL ?? 'chrome',
  headless: true,
  args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]
});
try {
  for (const entry of cases) {
    const page = await browser.newPage({ viewport: { width: 200, height: 200 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
    await page.route('**/mesh-check', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<body style="margin:0">' })
    );
    await page.route('**/compatibility-input.pdf', (route) =>
      route.fulfill({ body: entry.pdf, contentType: 'application/pdf' })
    );
    await writeFile(`${output}/${entry.name}.pdf`, entry.pdf);
    await page.goto(`${process.env.GPU_TEXT_URL ?? 'http://localhost:3180'}/mesh-check`);
    await page.evaluate(installHarness);
    const result = await page.evaluate(() => compatibility.open());
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal((await page.evaluate(() => compatibility.draw(0, 200, 200))).ok, true);
    const capture = await page.evaluate(async (point) => {
      const png = document.querySelector('canvas').toDataURL();
      const image = new Image();
      image.src = png;
      await image.decode();
      const ctx = new OffscreenCanvas(200, 200).getContext('2d');
      ctx.drawImage(image, 0, 0);
      return { png, color: [...ctx.getImageData(point[0] * 2, (100 - point[1]) * 2, 1, 1).data].slice(0, 3) };
    }, entry.point);
    assert.ok(
      entry.color.every((v, i) => Math.abs(v - capture.color[i]) <= 4),
      `${entry.name}: ${capture.color}, expected ${entry.color}`
    );
    await writeFile(`${output}/${entry.name}.png`, Buffer.from(capture.png.split(',')[1], 'base64'));
    assert.equal((await page.evaluate(() => compatibility.prepare())).ok, true);
    assert.equal((await page.evaluate(() => compatibility.draw(0, 200, 200))).ok, true);
    assert.equal(await page.evaluate(() => document.querySelector('canvas').toDataURL()), capture.png);
    assert.deepEqual(errors, []);
    await page.close();
    console.log('PASS', entry.name, capture.color);
  }
} finally {
  await browser.close();
}
