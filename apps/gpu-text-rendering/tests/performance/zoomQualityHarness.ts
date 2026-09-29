import { layoutPages } from '../../src/features/document/layoutPages';
import { createFrame } from '../../src/features/document/rendering/createFrame';
import { mountRenderingGpu } from '../browser/renderingHarness';
import { createTypeGpuRenderer, readGdoc } from '../browser/workerHarness';

/**
 * Measures refinement flicker: drives a smooth zoom at display rate, recording each frame's sharpness in a
 * centered crop, then re-renders sampled cameras after all detail settles for comparison.
 */
export async function prepareZoomProbe(url: string) {
  const data = (await readGdoc(await (await fetch(url)).arrayBuffer()))._unsafeUnwrap();
  const document = { ...data, pages: layoutPages(data.pages, 2)._unsafeUnwrap() };
  const canvas = window.document.createElement('canvas');
  canvas.width = Math.round(innerWidth * devicePixelRatio);
  canvas.height = Math.round(innerHeight * devicePixelRatio);
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh';
  window.document.body.append(canvas);
  const { gpu } = await mountRenderingGpu(
    canvas,
    Math.max((document as { instances: ArrayBuffer }).instances.byteLength, 256 * 1024 * 1024)
  );
  const renderer = (await createTypeGpuRenderer(gpu, document))._unsafeUnwrap();
  const first = document.pages[0]!;
  const camera = { x: 0.5, y: 0.5, zoom: 1, rotation: 0 };
  const crop = window.document.createElement('canvas');
  const size = Math.min(canvas.width, canvas.height, 768);
  crop.width = crop.height = size;
  const context = crop.getContext('2d', { willReadFrequently: true })!;

  const render = () => renderer.render(createFrame(document, camera, canvas.width, canvas.height))._unsafeUnwrap();

  /** Mean absolute luminance gradient of the centered crop; blur lowers it. */
  function sharpness() {
    context.drawImage(canvas, (canvas.width - size) / 2, (canvas.height - size) / 2, size, size, 0, 0, size, size);
    const pixels = context.getImageData(0, 0, size, size).data;
    let sum = 0;
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const i = (y * size + x) * 4;
        const l = pixels[i]! + pixels[i + 1]! + pixels[i + 2]!;
        sum += Math.abs(l - pixels[i + 4]! - pixels[i + 5]! - pixels[i + 6]!);
        sum += Math.abs(l - pixels[i + size * 4]! - pixels[i + size * 4 + 1]! - pixels[i + size * 4 + 2]!);
      }
    }
    return sum / (size - 1) ** 2;
  }

  return {
    pages: document.pages.length,
    /** Page center in world units. */
    focus(index: number) {
      const page = document.pages[index]!;
      return { x: -page.x + page.width / first.width / 2, y: 1 - page.y - page.height / first.height / 2 };
    },
    /** Moves through `path` at display rate; returns per-frame sharpness, time and refinement counters. */
    async run(path: { x: number; y: number; zoom: number }[], settleFirst = true, captures: number[] = []) {
      Object.assign(camera, path[0]);
      render();
      if (settleFirst) {
        await renderer.settle();
        render();
      }
      const frames = [];
      for (const point of path) {
        await new Promise(requestAnimationFrame);
        Object.assign(camera, point);
        const started = performance.now();
        render();
        frames.push({
          ...point,
          sharpness: sharpness(),
          at: started,
          refinement: renderer.refinement,
          png: captures.includes(frames.length) ? canvas.toDataURL() : undefined
        });
      }
      return frames;
    },
    /** Settled sharpness of one camera. */
    async reference(point: { x: number; y: number; zoom: number }) {
      Object.assign(camera, point);
      render();
      await renderer.settle();
      await new Promise((resolve) => setTimeout(resolve, 150));
      // The canvas is readable only in the task that rendered it; presentation clears it.
      render();
      return sharpness();
    },
    /** A point given as fractions of a page's width and height from its top-left corner, in world units. */
    pagePoint(index: number, u: number, v: number) {
      const page = document.pages[index]!;
      return { x: -page.x + (u * page.width) / first.width, y: 1 - page.y - (v * page.height) / first.height };
    },
    /**
     * Settles `point`, then measures GPU throughput: five batches of `frames` back-to-back renders with a sub-pixel
     * pan, each ended by one fence. Returns the median and worst batch's milliseconds per frame.
     */
    async timing(point: { x: number; y: number; zoom: number }, frames = 30) {
      Object.assign(camera, point);
      render();
      await renderer.settle();
      await gpu.device.queue.onSubmittedWorkDone();
      const samples = [];
      for (let batch = 0; batch < 5; batch++) {
        await new Promise(requestAnimationFrame);
        const started = performance.now();
        for (let i = 0; i < frames; i++) {
          camera.x = point.x + Math.sin(i / 4) * point.zoom * 0.002;
          render();
        }
        await gpu.device.queue.onSubmittedWorkDone();
        samples.push((performance.now() - started) / frames);
      }
      samples.sort((a, b) => a - b);
      return { median: samples[2]!, p95: samples[4]!, refinement: renderer.refinement };
    },
    /** PNG of the current canvas after rendering `point` without waiting. */
    async capture(point: { x: number; y: number; zoom: number }) {
      Object.assign(camera, point);
      render();
      return canvas.toDataURL();
    }
  };
}
