import { createCameraTour } from '../../src/features/camera/createCameraTour';
import type { TextDocument } from '../../src/features/document/document';
import { createFrame } from '../../src/features/document/rendering/createFrame';
import type { TextRenderer } from '../../src/features/document/rendering/createTypeGpuRenderer';
import { makeGpuFrameGate } from '../../src/features/scene/makeGpuFrameGate';
import type { GpuContext } from '../../src/shared/gpu/context';

/** Captures actual tour zoom-out before settling, then compares each view with its fully refined counterpart. */
export async function measureAutoZoom(
  renderer: TextRenderer,
  document: TextDocument,
  canvas: HTMLCanvasElement,
  gpu: GpuContext,
  focus: { x: number; y: number },
  page: number
) {
  const camera = { ...focus, zoom: 1 / 128, rotation: 0 };
  const tour = createCameraTour(camera);
  const tourDocument = { ...document, pages: [document.pages[page - 1]!] };
  const random = Math.random;
  Math.random = () => 0.5;
  tour.update(0, tourDocument);
  Math.random = random;
  let current = createFrame(document, camera, canvas.width, canvas.height);
  renderer.render(current)._unsafeUnwrap();
  (await renderer.settle())._unsafeUnwrap();
  let failure: unknown;
  const gate = makeGpuFrameGate(
    () => gpu.device.queue.onSubmittedWorkDone(),
    () => {},
    (error) => {
      failure = error;
    }
  );
  const captures: { at: number; frame: typeof current; moving: string; refinement: typeof renderer.refinement }[] = [];
  const marks = [1000, 2500, 4500, 6500];
  const intervals: number[] = [];
  const start = await new Promise<number>(requestAnimationFrame);
  let previous = start;
  let submitted = 0;

  while (performance.now() - start < 7000) {
    const now = await new Promise<number>(requestAnimationFrame);
    intervals.push(now - previous);
    previous = now;
    tour.update(now - start, tourDocument);
    gate
      .draw(() => {
        current = createFrame(document, camera, canvas.width, canvas.height);
        submitted++;
        return renderer.render(current);
      })
      ._unsafeUnwrap();

    if (now - start >= (marks[captures.length] ?? Infinity)) {
      captures.push({ at: now - start, frame: current, moving: canvas.toDataURL(), refinement: renderer.refinement });
    }
  }

  gate.destroy();
  const shots = [];
  for (const capture of captures) {
    renderer.render(capture.frame)._unsafeUnwrap();
    (await renderer.settle())._unsafeUnwrap();
    const settled = canvas.toDataURL();
    const left = await pixels(capture.moving);
    const right = await pixels(settled);
    let sum = 0;
    let changed = 0;
    for (let index = 0; index < left.length; index++) {
      const difference = Math.abs(left[index]! - right[index]!);
      sum += difference;
      changed += Number(difference > 16);
    }
    shots.push({
      at: capture.at,
      zoom: 1 / capture.frame.mul[1],
      refinement: capture.refinement,
      meanError: sum / left.length,
      changedChannelsPercent: (100 * changed) / left.length,
      moving: capture.moving,
      settled
    });
  }
  const sorted = [...intervals].sort((a, b) => a - b);
  return { submitted, failure, rafP95: sorted[Math.floor(sorted.length * 0.95)], rafMax: sorted.at(-1), shots };
}

async function pixels(url: string) {
  const bitmap = await createImageBitmap(await (await fetch(url)).blob());
  const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return context.getImageData(0, 0, context.canvas.width, context.canvas.height).data;
}
