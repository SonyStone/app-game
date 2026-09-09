import { defaultBrush } from '../brush';
import { defaultCamera } from '../camera';
import { createDocument } from '../document';
import { createPaintRenderer } from './renderer';

/** A zero-flow touch must not change existing artwork's filtering, even under strong magnification. */
export async function verifyStrokeFiltering(report: (message: string) => void) {
  await verifyConsecutiveStrokes(report);
  const document = createDocument();
  const pixels = new Uint8Array(256 * 256 * 4);
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++)
      pixels.set((x + y) % 6 < 3 ? [170, 30, 0, 200] : [0, 60, 150, 180], (y * 256 + x) * 4);
  document.active.tiles.set('0,0', pixels);
  const canvas = new OffscreenCanvas(320, 256);
  const size = { width: 320, height: 256 };
  const errors: string[] = [];
  const renderer = await createPaintRenderer(canvas, (message) => errors.push(message), {
    virtualTexture: true,
    onError: (error) => errors.push(String(error))
  });
  const read = async () => {
    const copy = new OffscreenCanvas(canvas.width, canvas.height).getContext('2d')!;
    copy.drawImage(canvas, 0, 0);
    return copy.getImageData(0, 0, canvas.width, canvas.height).data;
  };
  try {
    await renderer.prepareOverview(document.layers);
    for (const [zoom, dpr, angle] of [[4, 1, 0], [16, 1, 0.31], [32, 2, 0]] as const) {
      const camera = { ...defaultCamera(), x: 128.3, y: 128.7, zoom, angle };
      const draw = async () => {
        renderer.invalidateView();
        await renderer.render(document.layers, camera, size, dpr);
        await renderer.submitted();
      };
      const deadline = performance.now() + 5000;
      for (;;) {
        await draw();
        const pages = renderer.debugPages();
        if (pages.length && pages.every((page) => page.resident && !page.fallback && page.level === 0)) break;
        if (performance.now() > deadline) throw new Error('Fine overview pages did not become resident');
        await new Promise((resolve) => setTimeout(resolve, 16));
      }
      const before = await read();
      const compare = async (phase: string) => {
        await draw();
        const after = await read();
        let difference = 0;
        for (let i = 0; i < before.length; i++) difference = Math.max(difference, Math.abs(before[i]! - after[i]!));
        if (difference > 2) throw new Error(`${zoom}x DPR ${dpr} ${phase}: unchanged pixels jumped by ${difference}/255`);
        report(`PASS: ${zoom}x DPR ${dpr} ${phase}, unchanged pixels differ by ${difference}/255`);
      };
      renderer.begin(document.active, defaultBrush());
      await renderer.paint([{ x: 128, y: 128, radius: 8, flow: 0 }]);
      await compare('during touch');
      renderer.cancel();
      await compare('after cancel');
      renderer.begin(document.active, defaultBrush());
      await renderer.paint([{ x: 128, y: 128, radius: 8, flow: 0 }]);
      document.commit(await renderer.finish());
      await renderer.prepareOverview(document.layers);
      await compare('after commit');
      renderer.begin(document.active, defaultBrush());
      await renderer.paint([{ x: 128, y: 128, radius: 8, flow: 0 }]);
      await compare('immediate next stroke');
      renderer.cancel();
    }
    if (errors.length) throw new Error(errors.join('\n'));
  } finally {
    renderer.destroy();
  }
}

/** The next stroke must not expose a coarse replacement of a just-committed neighboring tile. */
async function verifyConsecutiveStrokes(report: (message: string) => void) {
  const document = createDocument();
  for (let tx = 0; tx < 2; tx++) {
    const pixels = new Uint8Array(256 * 256 * 4);
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 256; x++)
        pixels.set((x + tx * 256 + y) % 6 < 3 ? [170, 30, 0, 200] : [0, 60, 150, 180], (y * 256 + x) * 4);
    document.active.tiles.set(`${tx},0`, pixels);
  }
  const canvas = new OffscreenCanvas(320, 200);
  const errors: string[] = [];
  const renderer = await createPaintRenderer(canvas, (message) => errors.push(message), {
    virtualTexture: true,
    onError: (error) => errors.push(String(error))
  });
  const camera = { ...defaultCamera(), x: 256, y: 128, zoom: 1 };
  const size = { width: 320, height: 200 };
  const draw = async () => {
    await renderer.render(document.layers, camera, size, 1);
    await renderer.submitted();
    const copy = new OffscreenCanvas(320, 200).getContext('2d')!;
    copy.drawImage(canvas, 0, 0);
    return copy.getImageData(0, 0, 320, 200).data;
  };
  try {
    await renderer.prepareOverview(document.layers);
    const deadline = performance.now() + 5000;
    for (;;) {
      await draw();
      const pages = renderer.debugPages();
      if (pages.length && pages.every((page) => page.resident && !page.fallback)) break;
      if (performance.now() > deadline) throw new Error('Consecutive stroke detail did not become resident');
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
    for (const [tool, flow] of [['brush', 0], ['brush', 1], ['eraser', 1]] as const) {
      renderer.begin(document.active, { ...defaultBrush(), tool });
      await renderer.paint([{ x: 128, y: 128, radius: 16, flow }]);
      const before = await draw();
      document.commit(await renderer.finish());
      await renderer.prepareOverview(document.layers);
      const uploaded = renderer.stats().virtual!.uploadedBytes;
      await renderer.prepareOverview(document.layers);
      if (renderer.stats().virtual!.uploadedBytes !== uploaded)
        throw new Error('Unchanged pages were uploaded again during repeated preparation');
      renderer.begin(document.active, defaultBrush());
      await renderer.paint([{ x: 384, y: 128, radius: 8, flow: 0 }]);
      const after = await draw();
      let difference = 0;
      for (let i = 0; i < before.length; i++) difference = Math.max(difference, Math.abs(before[i]! - after[i]!));
      if (difference > 2) throw new Error(`Consecutive ${tool} flow ${flow}: pixels jumped by ${difference}/255`);
      report(`PASS: consecutive ${tool} flow ${flow} in different tiles, pixels differ by ${difference}/255`);
      renderer.cancel();
    }
    if (errors.length) throw new Error(errors.join('\n'));
  } finally {
    renderer.destroy();
  }
}
