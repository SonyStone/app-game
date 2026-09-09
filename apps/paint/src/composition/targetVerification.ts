import { defaultBrush } from '../brush';
import { defaultCamera } from '../camera';
import { createDocument } from '../document';
import { createPaintRenderer } from '../gpu/renderer';

/** Real GPU check: differently sized HTML/offscreen targets share one renderer and survive detach/replacement. */
export async function verifyCanvasTargets(report: (message: string) => void) {
  const first = document.createElement('canvas'),
    second = document.createElement('canvas');
  const replacement = new OffscreenCanvas(192, 192);
  const errors: string[] = [];
  const renderer = await createPaintRenderer(first, (message) => errors.push(message));
  const doc = createDocument();
  try {
    const brush = { ...defaultBrush(), color: '#ff0000', hardness: 1, flow: 1, opacity: 1 };
    renderer.begin(doc.active, brush);
    await renderer.paint([{ x: 0, y: 0, radius: 24, flow: 1 }]);
    doc.commit(await renderer.finish());
    const render = async (canvas: HTMLCanvasElement | OffscreenCanvas, width: number, x = 0) => {
      await renderer.render(doc.layers, { ...defaultCamera(), x }, { width, height: width }, 1, true, canvas);
      await renderer.submitted();
      return centerPixel(canvas);
    };
    ink(await render(first, 128));
    paper(await render(second, 256, 1000));
    ink(await render(first, 128));
    report('PASS: one renderer presents different sizes/cameras without leaking the other target’s pixels');
    renderer.releaseTarget(first);
    ink(await render(replacement, 192));
    paper(await render(second, 256, 1000));
    // Reattach the same physical canvas after detaching it, exercising context reconfiguration.
    renderer.releaseTarget(replacement);
    ink(await render(replacement, 96));
    report('PASS: HTML/offscreen target replacement and reattachment preserve committed ink');
    renderer.releaseTarget(second);
    doc.undo();
    renderer.reset();
    paper(await render(replacement, 96));
    doc.redo();
    renderer.reset();
    ink(await render(replacement, 96));
    if (errors.length) throw new Error(errors.join('\n'));
    await verifyIncrementalTargets(report, false);
    await verifyIncrementalTargets(report, true);
    report('ALL CANVAS TARGET CHECKS PASSED');
  } finally {
    renderer.destroy();
  }
}

/** Checks actual pixels and recomposition work, including a view that misses another view's update. */
async function verifyIncrementalTargets(report: (message: string) => void, virtualTexture: boolean) {
  const a = new OffscreenCanvas(1024, 1024),
    b = new OffscreenCanvas(1024, 1024);
  const errors: string[] = [];
  const renderer = await createPaintRenderer(a, (message) => errors.push(message), { virtualTexture });
  const doc = createDocument();
  const size = { width: 1024, height: 1024 };
  const near = defaultCamera(),
    far = { ...near, x: 2000 };
  const render = async (target: OffscreenCanvas, camera = near) => {
    await renderer.render(doc.layers, camera, size, 1, false, target);
    await renderer.submitted();
    return renderer.stats().viewportUpdate;
  };
  const cached = (update: ReturnType<typeof renderer.stats>['viewportUpdate']) => {
    if (update.pixels !== 0) throw new Error(`Cached view recomposited ${update.pixels} pixels`);
  };
  const equivalentToFull = async (target: OffscreenCanvas, camera = near) => {
    await render(target, camera);
    const before = await pixels(target);
    renderer.invalidateView();
    await render(target, camera);
    const after = await pixels(target);
    if (before.some((value, i) => value !== after[i])) throw new Error('Incremental view differs from full redraw');
  };
  try {
    await render(a);
    await render(b, far);
    cached(await render(a));
    cached(await render(b, far));
    renderer.begin(doc.active, { ...defaultBrush(), color: '#ff0000', flow: 1, hardness: 1 });
    await renderer.paint([{ x: 32, y: 32, radius: 16, flow: 1 }]);
    const partial = await render(a);
    if (partial.full || partial.pixels <= 0 || partial.pixels >= 1024 ** 2)
      throw new Error('A small stroke did not produce a partial viewport update');
    cached(await render(b, far));
    cached(await render(a));
    const moved = await render(b);
    if (!moved.full) throw new Error('Camera navigation did not invalidate its view');
    cached(await render(a));
    report(
      `PASS: VT ${virtualTexture}: small stroke recomposited ${partial.pixels}/1048576 pixels; unchanged/offscreen views recomposited zero`
    );
    renderer.preview([{ x: 350, y: 32, radius: 12, flow: 1 }]);
    await render(a);
    await render(b);
    renderer.preview([]);
    const clearedA = await render(a),
      clearedB = await render(b);
    if (clearedA.pixels === 0 || clearedB.pixels === 0) throw new Error('Preview removal missed a target');
    await equivalentToFull(a);
    await equivalentToFull(b);
    renderer.cancel();
    await render(a);
    await render(b);
    await equivalentToFull(a);
    await equivalentToFull(b);
    if (errors.length) throw new Error(errors.join('\n'));
    renderer.begin(doc.active, { ...defaultBrush(), color: '#ff0000', flow: 1, hardness: 1 });
    await renderer.paint([{ x: 32, y: 32, radius: 16, flow: 1 }]);
    await render(a);
    await render(b);
    doc.commit(await renderer.finish());
    await renderer.prepareOverview(doc.layers);
    for (let i = 0; i < 30; i++) {
      await render(a);
      await render(b);
      if (!renderer.stats().virtual?.pending) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await equivalentToFull(a);
    await equivalentToFull(b);
    if (errors.length) throw new Error(errors.join('\n'));
    if (virtualTexture) {
      await render(a);
      const pages = JSON.stringify(renderer.debugPages());
      await render(b, far);
      await render(a);
      if (JSON.stringify(renderer.debugPages()) !== pages)
        throw new Error('Cached view used another target’s debug pages');
    }
    report(`PASS: VT ${virtualTexture}: preview removal, cancel and commit match full redraw in both targets`);
  } finally {
    renderer.destroy();
  }
}

async function pixels(canvas: OffscreenCanvas) {
  const bitmap = await createImageBitmap(await canvas.convertToBlob());
  try {
    const read = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = read.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, read.width, read.height).data;
  } finally {
    bitmap.close();
  }
}

async function centerPixel(canvas: HTMLCanvasElement | OffscreenCanvas) {
  const blob =
    'convertToBlob' in canvas
      ? await canvas.convertToBlob()
      : await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('Canvas export failed.'))))
        );
  const bitmap = await createImageBitmap(blob);
  try {
    const read = document.createElement('canvas');
    read.width = bitmap.width;
    read.height = bitmap.height;
    const context = read.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(read.width >> 1, read.height >> 1, 1, 1).data;
  } finally {
    bitmap.close();
  }
}
function ink(pixel: Uint8ClampedArray) {
  if (pixel[0]! < 220 || pixel[1]! > 80 || pixel[2]! > 80 || pixel[3] !== 255)
    throw new Error(`Expected red ink, got ${[...pixel]}`);
}
function paper(pixel: Uint8ClampedArray) {
  if (pixel[0]! < 230 || pixel[1]! < 230 || pixel[2]! < 230 || pixel[3] !== 255)
    throw new Error(`Expected paper, got ${[...pixel]}`);
}
