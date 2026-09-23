import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { makePdf } from '../fixtures/pdf.mjs';

const output = process.env.GPU_TEXT_OUTPUT ?? '/tmp/gpu-text-groups';
const baseURL = process.env.GPU_TEXT_URL ?? 'http://127.0.0.1:3180';
await mkdir(output, { recursive: true });

const form = (content, resources = '') =>
  `<< /Type /XObject /Subtype /Form /BBox [0 0 600 600] /Group << /S /Transparency /I true /CS /DeviceRGB >> /Resources << ${resources} >> /Length ${content.length} >>\nstream\n${content}\nendstream`;
const pdf = makePdf(
  `0 0 1 rg 0 0 400 600 re f
q /Half gs /G Do Q
/O Do
q /Lum gs 1 0 0 rg 400 220 80 50 re f Q
q /Alpha gs 0 1 0 rg 500 220 80 50 re f Q
0 0 0 RG 0 w 450 50 m 450 550 l S`,
  {
    resources:
      '/XObject << /G 7 0 R /O 8 0 R >> /ExtGState << /Half << /ca 0.5 >> /Lum << /SMask << /S /Luminosity /G 9 0 R >> >> /Alpha << /SMask << /S /Alpha /G 9 0 R >> >> >>',
    extraObjects: [
      form('1 0 0 rg 50 50 200 150 re f 0 1 0 rg 150 50 200 150 re f'),
      form(
        '/N gs 1 0 0 rg 50 300 200 100 re f /M gs 0 1 0 rg 150 300 200 100 re f',
        '/ExtGState << /N << /ca 0.5 >> /M << /ca 0.5 /BM /Multiply >> >>'
      ),
      form('0.5 g 400 200 200 100 re f')
    ]
  }
);
await writeFile(`${output}/groups.pdf`, pdf);
const browser = await chromium.launch({
  channel: process.env.GPU_TEXT_BROWSER_CHANNEL || undefined,
  headless: true,
  args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]
});
const page = await browser.newPage({ viewport: { width: 800, height: 800 } });
await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') {
    errors.push(m.text());
  }
});

try {
  await page.route('**/groups-check', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0"></body></html>' })
  );
  await page.goto(`${baseURL}/groups-check`);
  const stats = await page.evaluate(
    async (bytes) => {
      const { convertPdf } = await import('/src/features/document/pdf/convertPdf.ts');
      const { readGdoc } = await import('/src/features/document/format/readGdoc.ts');
      const { layoutPages } = await import('/src/features/document/document.ts');
      const { createFrame } = await import('/src/features/document/rendering/createFrame.ts');
      const { createTypeGpuRenderer } = await import('/src/features/document/rendering/createTypeGpuRenderer.ts');
      const { mountRenderingGpu } = await import('/tests/browser/renderingHarness.ts');
      const data = (await readGdoc((await convertPdf(new Uint8Array(bytes).buffer))._unsafeUnwrap()))._unsafeUnwrap();
      const documentData = {
        ...data,
        pages: layoutPages(data.pages, 2)._unsafeUnwrap(),
        images: new Map(),
        imageVertices: new ArrayBuffer(0)
      };
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 800;
      document.body.append(canvas);
      const { gpu, dispose } = await mountRenderingGpu(
        canvas,
        Math.max(data.curves.byteLength, data.instances.byteLength)
      );
      const renderer = (await createTypeGpuRenderer(gpu, documentData))._unsafeUnwrap();
      window.drawGraphics = async (camera) => {
        renderer.render(createFrame(documentData, camera, 800, 800))._unsafeUnwrap();
        (await renderer.settle())._unsafeUnwrap();
      };
      window.disposeGraphics = () => {
        renderer.destroy();
        dispose();
      };
      await drawGraphics({ x: 0.5, y: 0.5, zoom: 0.5, rotation: 0 });
      return {
        curves: data.curves.byteLength / 32,
        clips: data.clips.byteLength / 80,
        bins: data.curveBins.byteLength
      };
    },
    [...pdf]
  );

  const png = await page.locator('canvas').screenshot({ path: `${output}/groups.png` });
  const pixels = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const context = new OffscreenCanvas(800, 800).getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    return [
      [100, 100],
      [200, 100],
      [300, 100],
      [200, 350],
      [440, 245],
      [540, 245]
    ].map(([x, y]) => [...context.getImageData(Math.round((x * 4) / 3), Math.round(((600 - y) * 4) / 3), 1, 1).data]);
  }, png.toString('base64'));
  assert.deepEqual(pixels.slice(0, 3), [
    [128, 0, 128, 255],
    [0, 128, 128, 255],
    [0, 128, 128, 255]
  ]);
  assert.ok(
    pixels[3].slice(0, 3).every((channel) => Math.abs(channel - 64) <= 1),
    JSON.stringify(pixels)
  );

  assert.deepEqual(pixels.slice(4), [
    [255, 127, 127, 255],
    [0, 255, 0, 255]
  ]);

  for (const zoom of [0.5, 0.125]) {
    await page.evaluate((zoom) => drawGraphics({ x: 0.75, y: 0.5, zoom, rotation: 0 }), zoom);
    const screenshot = await page.locator('canvas').screenshot();
    const ink = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const context = new OffscreenCanvas(800, 800).getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      const row = context.getImageData(390, 400, 20, 1).data;
      let sum = 0;
      for (let i = 0; i < row.length; i += 4) {
        sum += 1 - row[i] / 255;
      }
      return sum;
    }, screenshot.toString('base64'));
    assert.ok(Math.abs(ink - 1) < 0.12, `Hairline width ${ink} at zoom ${zoom}`);
  }
  await page.evaluate(() => drawGraphics({ x: 0.35, y: 0.4, zoom: 0.15, rotation: 0.7 }));
  await page.locator('canvas').screenshot({ path: `${output}/graphics-detail.png` });
  await page.evaluate(() => disposeGraphics());
  assert.deepEqual(errors, []);
  console.log(
    'PASS isolated group opacity, Multiply on transparent backdrop, one-pixel hairlines at two zoom levels',
    stats
  );
} finally {
  await browser.close();
}
