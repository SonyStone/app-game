import { defaultBrush } from '../brush';
import { defaultCamera } from '../camera';
import { createDocument } from '../document';
import { createPaintRenderer } from './renderer';

/** Compares thin curves at 5% in a large viewport with the full-resolution tile/mipmap path. */
export async function verifyOverviewQuality(report: (message: string) => void) {
  const errors: string[] = [];
  const canvas = new OffscreenCanvas(1, 1);
  const renderer = await createPaintRenderer(canvas, (e) => errors.push(e), {
    virtualTexture: true,
    onError: (e) => errors.push(String(e))
  });
  const document = createDocument();
  const size = { width: 2537, height: 2050 };
  const camera = { ...defaultCamera(), zoom: 0.05 };
  try {
    renderer.begin(document.active, { ...defaultBrush(), size: 32, hardness: 0.8, opacity: 1 });
    await renderer.paint(
      Array.from({ length: 1601 }, (_, i) => {
        const x = (i - 800) * 5;
        return { x, y: Math.sin(x / 800) * 1200, radius: 16, flow: 1 };
      })
    );
    document.commit(await renderer.finish());
    await renderer.prepareOverview(document.layers);
    await renderer.render(document.layers, camera, size, 2, true);
    await renderer.submitted();
    const reference = await pixels(canvas);
    let complete = false;
    for (let i = 0; i < 300; i++) {
      await renderer.render(document.layers, camera, size, 2);
      await renderer.submitted();
      if (renderer.debugPages().every((p) => p.resident && !p.fallback)) {
        complete = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (!complete) throw new Error('Overview did not finish refining');
    const levels = [...new Set(renderer.debugPages().map((p) => p.level))];
    if (levels.length !== 1 || levels[0] !== 3) throw new Error(`Empty viewport area reduced detail to LOD ${levels}`);
    const actual = await pixels(canvas);
    let error = 0,
      channels = 0,
      maxError = 0;
    for (let i = 0; i < actual.length; i += 4) {
      if (actual[i]! > 240 && reference[i]! > 240) continue;
      for (let c = 0; c < 3; c++) {
        const delta = Math.abs(actual[i + c]! - reference[i + c]!);
        error += delta;
        channels++;
        maxError = Math.max(maxError, delta);
      }
    }
    const mean = error / Math.max(channels, 1);
    report(
      `5% thin curves, 2537×2050 CSS px / DPR 2: LOD ${levels}; foreground mean difference ${mean.toFixed(2)}/255, max ${maxError} against native tile mipmaps`
    );
    if (!channels || mean > 12) throw new Error('Overview quality differs too much from original tile rendering');
    if (errors.length) throw new Error(errors.join('\n'));
    report('PASS: large empty viewport preserves thin-line detail without growing the GPU page pool');
  } finally {
    renderer.destroy();
  }
}

async function pixels(canvas: OffscreenCanvas) {
  const bitmap = await createImageBitmap(await canvas.convertToBlob());
  const copy = new OffscreenCanvas(canvas.width, canvas.height);
  const context = copy.getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return context.getImageData(0, 0, copy.width, copy.height).data;
}
