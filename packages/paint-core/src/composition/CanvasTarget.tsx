import { createEffect, onCleanup } from 'solid-js';
import type { Camera, ViewSize } from '../camera';
import { usePaintRuntime } from './PaintApplication';

/** Reactive presentation target. Changing canvas/view props queues a replacement on the same renderer.
 * Each physical canvas may belong to one target. Use id="main" to replace the primary/export target.
 * HTML canvases stay local; transfer an OffscreenCanvas to its worker once before assigning it there.
 */
export function CanvasTarget(props: {
  id: string;
  canvas: HTMLCanvasElement | OffscreenCanvas | undefined;
  camera: Camera;
  size: ViewSize;
  dpr: number;
}) {
  const runtime = usePaintRuntime();
  const id = props.id;
  createEffect(
    () =>
      props.canvas
        ? { canvas: props.canvas, camera: { ...props.camera }, size: { ...props.size }, dpr: props.dpr }
        : undefined,
    (target) => runtime.setTarget(id, target)
  );
  onCleanup(() => runtime.setTarget(id, undefined));
  return null;
}

/** Snapshot used by runtime scheduling. Updating a signal never mutates an in-flight draw's target. */
export type CanvasTargetValue = {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  camera: Camera;
  size: ViewSize;
  dpr: number;
};
