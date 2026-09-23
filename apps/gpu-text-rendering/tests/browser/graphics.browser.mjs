import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { makePdf } from '../fixtures/pdf.mjs';

const output = process.env.GPU_TEXT_OUTPUT ?? '/tmp/gpu-text-graphics';
const baseURL = process.env.GPU_TEXT_URL ?? 'http://127.0.0.1:3180';
await mkdir(output, { recursive: true });

let circle = '';
for (let i = 0; i < 5000; i++) {
  const angle = (i * Math.PI * 2) / 5000;
  circle += `${450 + 80 * Math.cos(angle)} ${400 + 80 * Math.sin(angle)} ${i === 0 ? 'm' : 'l'}\n`;
}

const pattern = '0 1 0 rg 0 0 5 10 re f';
const pdf = makePdf(
  `
  0 0 1 RG 20 w 1 J 1 j 50 100 m 250 100 l 250 200 l S
  1 0 0 RG 10 w 0 J [30 20] 0 d 50 50 m 300 50 l S
  q 50 300 m 300 300 l 50 550 l h W n
    0 1 0 rg 0 250 350 350 re f
    q 100 300 150 250 re W n 1 0 0 rg 0 250 350 350 re f Q
  Q
  0 0 1 rg ${circle} h f
  1 0 1 rg 350 50 20 20 re f
  q 0.5 0.5 0.5 rg 350 100 200 100 re f /GS gs 1 0 0 rg 350 100 200 100 re f Q
  /Pattern cs /P scn 350 220 200 60 re f
`,
  {
    resources: '/ExtGState << /GS << /BM /Multiply /ca 0.5 >> >> /Pattern << /P 7 0 R >>',
    extraObjects: [
      `<< /Type /Pattern /PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 10 10] /XStep 10 /YStep 10 /Resources << >> /Length ${pattern.length} >>\nstream\n${pattern}\nendstream`
    ]
  }
);
await writeFile(`${output}/graphics.pdf`, pdf);
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
  await page.route('**/graphics-check', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0"></body></html>' })
  );
  await page.goto(`${baseURL}/graphics-check`);
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
      const result = await createTypeGpuRenderer(gpu, documentData);
      if (result.isErr()) {
        throw new Error(result.error.message);
      }
      const renderer = result.value;
      window.drawGraphics = async (camera) => {
        const drawn = renderer.render(createFrame(documentData, camera, 800, 800));
        if (drawn.isErr()) {
          throw new Error(drawn.error.message);
        }
        const settled = await renderer.settle();
        if (settled.isErr()) {
          throw new Error(settled.error.message);
        }
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

  assert.ok(stats.curves > 5000);
  assert.equal(stats.clips, 1);
  assert.ok(stats.bins > 2048);
  const png = await page.locator('canvas').screenshot({ path: `${output}/graphics.png` });
  const pixels = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const context = new OffscreenCanvas(800, 800).getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    return [
      [75, 350],
      [150, 350],
      [250, 500],
      [450, 400],
      [550, 400],
      [100, 100],
      [45, 100],
      [30, 100],
      [60, 50],
      [90, 50],
      [360, 60],
      [400, 150],
      [352, 250],
      [357, 250]
    ].map(([x, y]) => [...context.getImageData(Math.round((x * 4) / 3), Math.round(((600 - y) * 4) / 3), 1, 1).data]);
  }, png.toString('base64'));
  assert.deepEqual(pixels, [
    [0, 255, 0, 255],
    [255, 0, 0, 255],
    [255, 255, 255, 255],
    [0, 0, 255, 255],
    [255, 255, 255, 255],
    [0, 0, 255, 255],
    [0, 0, 255, 255],
    [255, 255, 255, 255],
    [255, 0, 0, 255],
    [255, 255, 255, 255],
    [255, 0, 255, 255],
    [128, 64, 64, 255],
    [0, 255, 0, 255],
    [255, 255, 255, 255]
  ]);
  await page.evaluate(() => drawGraphics({ x: 0.35, y: 0.4, zoom: 0.15, rotation: 0.7 }));
  await page.locator('canvas').screenshot({ path: `${output}/graphics-detail.png` });
  await page.evaluate(() => disposeGraphics());
  assert.deepEqual(errors, []);
  console.log(
    'PASS tiling patterns, Multiply, strokes/caps/dashes, analytic nested clipping, restore, large binned path, zoom and rotation',
    stats
  );
} finally {
  await browser.close();
}
