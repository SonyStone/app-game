import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { installHarness } from '../compatibility/browserHarness.mjs';
import { makePdf } from '../fixtures/pdf.mjs';

const form = (content, properties, resources = '') =>
  `<< /Type /XObject /Subtype /Form /BBox [0 0 100 100] /Group << /S /Transparency /CS /DeviceRGB ${properties} >> /Resources << ${resources} >> /Length ${content.length} >>\nstream\n${content}\nendstream`;
const cases = [
  {
    name: 'curved stroke does not paint the extensions of its tangent lines',
    pdf: makePdf('0.5 w 80 50 m 80 66.5685 66.5685 80 50 80 c 33.4315 80 20 66.5685 20 50 c 20 33.4315 33.4315 20 50 20 c 66.5685 20 80 33.4315 80 50 c h S', { width: 100, height: 100 }),
    samples: [[22, 20, [255, 255, 255]], [78, 20, [255, 255, 255]], [80, 78, [255, 255, 255]]]
  },
  {
    name: 'page paper is outside the transparent compositing group',
    pdf: makePdf('/D gs 1 0 0 rg 10 10 80 80 re f', {
      width: 100, height: 100,
      resources: '/ExtGState << /D << /BM /Difference >> >>'
    }),
    samples: [[50, 50, [255, 0, 0]], [5, 5, [255, 255, 255]]]
  },
  ...[false, true].map((isolated) => ({
    name: `group opacity with isolation ${isolated}`,
    pdf: makePdf('1 1 0 rg 0 0 100 100 re f /Half gs /G Do', {
      width: 100,
      height: 100,
      resources: '/XObject << /G 7 0 R >> /ExtGState << /Half << /ca 0.5 >> >>',
      extraObjects: [
        form('/M gs 0 0 1 rg 10 10 80 80 re f', `/I ${isolated}`, '/ExtGState << /M << /BM /Multiply >> >>')
      ]
    }),
    samples: [
      [50, 50, isolated ? [128, 128, 128] : [128, 128, 0]],
      [5, 5, [255, 255, 0]]
    ]
  })),
  {
    name: 'knockout uses shape independently of opacity',
    pdf: makePdf('/G Do', {
      width: 100,
      height: 100,
      resources: '/XObject << /G 7 0 R >>',
      extraObjects: [
        form(
          '1 0 0 rg 10 10 60 80 re f /Half gs 0 0 1 rg 40 10 50 80 re f',
          '/I true /K true',
          '/ExtGState << /Half << /ca 0.5 >> >>'
        )
      ]
    }),
    samples: [
      [20, 50, [255, 0, 0]],
      [50, 50, [128, 128, 255]],
      [80, 50, [128, 128, 255]]
    ]
  },
  {
    name: 'mask transfer applies outside mask bounds',
    pdf: makePdf('/Mask gs 0 0 1 rg 0 0 100 100 re f', {
      width: 100,
      height: 100,
      resources:
        '/ExtGState << /Mask << /SMask << /S /Alpha /G 7 0 R /TR << /FunctionType 2 /Domain [0 1] /C0 [0.25] /C1 [0.75] /N 1 >> >> >> >>',
      extraObjects: [form('1 g 40 40 20 20 re f', '/I true')]
    }),
    samples: [
      [50, 50, [64, 64, 255]],
      [10, 10, [191, 191, 255]]
    ]
  }
];
const browser = await chromium.launch({
  channel: process.env.GPU_TEXT_BROWSER_CHANNEL || undefined,
  headless: true,
  args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]
});

try {
  for (const entry of cases) {
    const page = await browser.newPage({ viewport: { width: 200, height: 200 } });
    await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/compositing-check', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0"></body></html>' })
    );
    await page.route('**/compatibility-input.pdf', (route) =>
      route.fulfill({ body: entry.pdf, contentType: 'application/pdf' })
    );
    await page.goto(`${process.env.GPU_TEXT_URL ?? 'http://127.0.0.1:3180'}/compositing-check`);
    await page.evaluate(installHarness);
    const result = await page.evaluate(() => compatibility.open());
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal((await page.evaluate(() => compatibility.draw(0, 200, 200))).ok, true);
    const screenshot = await page.locator('canvas').screenshot();
    const colors = await page.evaluate(
      async ({ png, samples }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${png}`;
        await image.decode();
        const context = new OffscreenCanvas(200, 200).getContext('2d');
        context.drawImage(image, 0, 0);
        return samples.map(([x, y]) => [...context.getImageData(x * 2, (100 - y) * 2, 1, 1).data].slice(0, 3));
      },
      { png: screenshot.toString('base64'), samples: entry.samples }
    );

    entry.samples.forEach(([, , expected], index) => {
      assert.ok(
        expected.every((value, channel) => Math.abs(value - colors[index][channel]) <= 2),
        `${entry.name}: ${JSON.stringify(colors)}`
      );
    });
    assert.equal((await page.evaluate(() => compatibility.prepare())).ok, true);
    assert.equal((await page.evaluate(() => compatibility.draw(0, 200, 200))).ok, true);
    assert.deepEqual(await page.locator('canvas').screenshot(), screenshot, 'GDOC must reopen identically');
    assert.deepEqual(errors, []);
    await page.close();
    console.log('PASS', entry.name);
  }
} finally {
  await browser.close();
}
