import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { installHarness } from '../compatibility/browserHarness.mjs';
import { makePdf } from '../fixtures/pdf.mjs';

const form = (content, properties, resources = '') =>
  `<< /Type /XObject /Subtype /Form /BBox [0 0 100 100] /Group << /S /Transparency /CS /DeviceRGB ${properties} >> /Resources << ${resources} >> /Length ${content.length} >>\nstream\n${content}\nendstream`;
const nestedGroupDepth = 8;
const nestedGroupResources = (level) =>
  `/XObject << /G${level} ${7 + level} 0 R >> /ExtGState << /L0 << /ca 0.8 >> /L1 << /ca 0.9 /BM /Multiply >> >>`;
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
  },
  {
    name: 'soft mask of an opaque non-isolated group leaves earlier parent paint unmasked',
    pdf: makePdf('0 0 1 rg 0 0 100 100 re f /Mask gs /G Do', {
      width: 100,
      height: 100,
      resources: '/XObject << /G 7 0 R >> /ExtGState << /Mask << /SMask << /S /Alpha /G 8 0 R >> >> >>',
      extraObjects: [form('1 0 0 rg 20 20 60 60 re f', '/I false'), form('1 g 40 40 20 20 re f', '/I true')]
    }),
    samples: [
      [50, 50, [255, 0, 0]],
      [30, 30, [0, 0, 255]],
      [10, 10, [0, 0, 255]]
    ]
  },
  {
    // Every level blends against an inherited backdrop; pass count must stay polynomial in depth.
    name: 'deeply nested non-isolated groups',
    pdf: makePdf('1 1 0 rg 0 0 100 100 re f 0 1 1 rg 0 0 50 100 re f /L0 gs /G0 Do', {
      width: 100,
      height: 100,
      resources: nestedGroupResources(0),
      extraObjects: Array.from({ length: nestedGroupDepth }, (_, level) =>
        form(
          level === nestedGroupDepth - 1
            ? '1 0 1 rg 10 10 80 80 re f /L1 gs 0 0 1 rg 30 30 40 40 re f'
            : `0.5 g ${10 + level * 4} 40 20 20 re f /L${(level + 1) % 2} gs /G${level + 1} Do`,
          '/I false',
          nestedGroupResources(level + 1)
        )
      )
    }),
    // Reference by hand at (75, 50): each level bakes Multiply into red, so red with alpha 0.8^4 * 0.9^4 covers yellow.
    samples: [
      [25, 50, [35, 82, 86]],
      [75, 50, [255, 186, 0]],
      [50, 50, [174, 181, 13]],
      [20, 20, [0, 186, 255]],
      [5, 5, [0, 255, 255]],
      [12, 50, [73, 119, 124]],
      [30, 50, [5, 106, 114]]
    ],
    // Nested backdrop removal used to double per level (2,058 passes at depth 8).
    maxPasses: 250
  },
  ...[0, 2].map((cap) => ({
    // PDF `l`, `v` and `y` hairlines repeat endpoints as control points; their caps need a defined tangent.
    name: `hairline cap ${cap} with coincident control points`,
    pdf: makePdf(
      `0 w ${cap} J 20 70.25 m 50 70.25 80 70.25 v S 20 40.25 m 50 40.25 80 40.25 y S 20 30.25 m 80 30.25 l S 20 10.25 m 40 10.25 60 10.25 80 10.25 c S`,
      { width: 100, height: 100 }
    ),
    samples: [],
    // `v` repeats its start, `l` both endpoints; the plain `c` row is the reference.
    // TODO: the `y` row's degenerate end still spreads half coverage one pixel past its butt cap.
    equal: [19, 19.5, 20, 20.5, 79.5, 80, 80.5, 81].flatMap((x) =>
      [70.5, 30.5, ...(x < 50 ? [40.5] : [])].map((y) => [
        [x, y],
        [x, 10.5]
      ])
    )
  }))
];
const browser = await chromium.launch({
  channel: process.env.GPU_TEXT_BROWSER_CHANNEL || undefined,
  headless: true,
  args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]
});

try {
  for (const entry of cases.filter(({ name }) => name.includes(process.env.GPU_TEXT_CASE ?? ''))) {
    const page = await browser.newPage({ viewport: { width: 200, height: 200 } });
    await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/compatibility-input.pdf', (route) =>
      route.fulfill({ body: entry.pdf, contentType: 'application/pdf' })
    );
    await page.goto(`${process.env.GPU_TEXT_URL ?? 'http://127.0.0.1:3180'}/tests/browser/empty.html`);
    await page.evaluate(installHarness);
    // Counts offscreen composition during preparation and settled drawing.
    await page.evaluate(() => {
      window.renderPasses = 0;
      const native = GPUCommandEncoder.prototype.beginRenderPass;
      GPUCommandEncoder.prototype.beginRenderPass = function (descriptor) {
        window.renderPasses++;
        return native.call(this, descriptor);
      };
    });
    const result = await page.evaluate(() => compatibility.open());
    assert.equal(result.ok, true, JSON.stringify(result));
    const passes = await page.evaluate(async () => {
      const result = await compatibility.draw(0, 200, 200);
      return result.ok ? window.renderPasses : -1;
    });
    assert.ok(passes >= 0 && passes <= (entry.maxPasses ?? Infinity), `${entry.name}: ${passes} render passes`);
    const screenshot = await page.locator('canvas').screenshot();

    if (process.env.GPU_TEXT_OUTPUT) {
      await mkdir(process.env.GPU_TEXT_OUTPUT, { recursive: true });
      await writeFile(`${process.env.GPU_TEXT_OUTPUT}/${entry.name.replaceAll(/\W+/g, '-')}.png`, screenshot);
    }
    const colors = await page.evaluate(
      async ({ png, samples }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${png}`;
        await image.decode();
        const context = new OffscreenCanvas(200, 200).getContext('2d');
        context.drawImage(image, 0, 0);
        return samples.map(([x, y]) => [...context.getImageData(x * 2, (100 - y) * 2, 1, 1).data].slice(0, 3));
      },
      { png: screenshot.toString('base64'), samples: [...entry.samples, ...(entry.equal ?? []).flat()] }
    );

    (entry.equal ?? []).forEach((_, index) => {
      const a = colors[entry.samples.length + index * 2];
      const b = colors[entry.samples.length + index * 2 + 1];
      assert.ok(
        a.every((value, channel) => Math.abs(value - b[channel]) <= 2),
        `${entry.name}: ${JSON.stringify(entry.equal[index])} ${JSON.stringify([a, b])}`
      );
    });
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
    console.log('PASS', entry.name, `(${passes} render passes)`);
  }
} finally {
  await browser.close();
}
