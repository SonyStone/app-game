import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { makePdf } from '../fixtures/pdf.mjs';

// Page one has only text. Page two has backdrop-dependent groups followed by
// live text, a translucent overlay and a hairline. No external PDF is required.
const text = '0 0 0 rg BT /F1 4 Tf 30 80 Td (Sharp foreground) Tj ET';
const form = '0 0.3 1 rg 20 10 60 35 re f';
const content = `1 0.2 0.1 rg 0 0 100 100 re f q /Half gs /G Do /G Do /G Do /G Do Q ${text} q /Overlay gs 0 1 0 rg 60 76 10 10 re f Q 0 w 10 90 m 90 90 l S`;
const pdf = makePdf(content, {
  width: 100,
  height: 100,
  pages: 2,
  resources: '/XObject << /G 8 0 R >> /ExtGState << /Half << /ca 0.5 /BM /Multiply >> /Overlay << /ca 0.5 >> >>',
  extraObjects: [
    `<< /Type /XObject /Subtype /Form /BBox [0 0 100 100] /Group << /S /Transparency /I false >> /Resources << >> /Length ${form.length} >>\nstream\n${form}\nendstream`,
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`
  ]
});
// Equal-length replacement preserves the generated xref offsets.
const firstContents = pdf.indexOf('/Contents 4 0 R');
pdf.write('/Contents 9 0 R', firstContents);
const browser = await chromium.launch({
  channel: process.env.GPU_TEXT_BROWSER_CHANNEL || undefined,
  headless: true,
  args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]
});
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  await page.route('**/selective.pdf', (route) => route.fulfill({ body: pdf }));
  await page.route('**/selective-check', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<body style="margin:0"></body>' })
  );
  await page.goto(`${process.env.GPU_TEXT_URL ?? 'http://localhost:3180'}/selective-check`);
  const result = await page.evaluate(async () => {
    const { convertPdf } = await import('/src/features/document/pdf/convertPdf.ts');
    const { readGdoc } = await import('/src/features/document/format/readGdoc.ts');
    const { layoutPages } = await import('/src/features/document/document.ts');
    const { createTypeGpuRenderer } = await import('/src/features/document/rendering/createTypeGpuRenderer.ts');
    const { createFrame } = await import('/src/features/document/rendering/createFrame.ts');
    const { mountRenderingGpu } = await import('/tests/browser/renderingHarness.ts');
    const data = (
      await readGdoc((await convertPdf(await (await fetch('/selective.pdf')).arrayBuffer()))._unsafeUnwrap())
    )._unsafeUnwrap();
    const doc = {
      ...data,
      pages: layoutPages(data.pages, 2)._unsafeUnwrap(),
      images: new Map(),
      imageVertices: new ArrayBuffer(0)
    };
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    document.body.append(canvas);
    const { gpu, dispose } = await mountRenderingGpu(canvas, data.instances.byteLength);
    const NativeChannel = window.MessageChannel;
    const held = [];
    let frozen = true;
    window.MessageChannel = class extends NativeChannel {
      constructor() {
        super();
        const send = this.port2.postMessage.bind(this.port2);
        this.port2.postMessage = (...args) => {
          if (frozen) {
            held.push(() => send(...args));
          } else {
            send(...args);
          }
        };
      }
    };
    const renderer = (await createTypeGpuRenderer(gpu, doc))._unsafeUnwrap();
    window.MessageChannel = NativeChannel;

    const capture = async (camera, vectorOnly, settle = false) => {
      const frame = createFrame(doc, camera, canvas.width, canvas.height, vectorOnly);
      renderer.render(frame)._unsafeUnwrap();
      if (settle) {
        (await renderer.settle())._unsafeUnwrap();
      }
      await gpu.device.queue.onSubmittedWorkDone();
      // The swapchain texture may have been presented during async settling.
      // Copy a fresh submission synchronously, before the browser clears it.
      renderer.render(frame)._unsafeUnwrap();
      const context = new OffscreenCanvas(canvas.width, canvas.height).getContext('2d');
      context.drawImage(canvas, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const difference = (a, b) => a.reduce((sum, channel, i) => sum + Math.abs(channel - b[i]), 0) / a.length;
    const errors = [];
    for (const index of [0, 1]) {
      const p = doc.pages[index];
      const camera = { x: -p.x + 0.52, y: 0.81 - p.y, zoom: 0.09, rotation: 0 };
      const cached = await capture(camera, false);
      const missing = renderer.refinement.missing;
      const direct = await capture(camera, true);
      errors.push({ page: index, missing, difference: difference(cached, direct) });
    }
    frozen = false;
    held.splice(0).forEach((send) => send());
    const settled = [];
    const p = doc.pages[1];
    for (const rotation of [0, 0.4]) {
      const camera = { x: -p.x + 0.5, y: 0.5 - p.y, zoom: 0.55, rotation };
      const cached = await capture(camera, false, true);
      const direct = await capture(camera, true, true);
      settled.push(difference(cached, direct));
    }
    const composition = renderer.refinement;
    renderer.destroy();
    dispose();
    return { errors, settled, composition };
  });
  console.log(result);
  assert.equal(result.composition.pages, 1, 'only the complex page should use composed tiles');
  assert.equal(result.composition.directPages, 1);
  assert.equal(result.composition.foregroundPages, 1);
  assert.ok(result.errors[1].missing > 0, 'must compare the foreground before cache refinement');
  for (const { difference } of result.errors) {
    assert.ok(difference < 0.1, `live foreground differs before refinement: ${difference}`);
  }
  for (const difference of result.settled) {
    assert.ok(difference < 2, `ordered composition differs from direct rendering: ${difference}`);
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS selective composition: cheap pages, live foreground before refinement, backdrop blends and rotation'
  );
} finally {
  await browser.close();
}
