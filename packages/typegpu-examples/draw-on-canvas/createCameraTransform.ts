import { createMemo, createSignal } from 'solid-js';
import * as d from 'typegpu/data';

export function createCameraTransform() {
  // Camera expressed as separate components so we can pan independently
  // of scale/rotation. tx,ty are translation; s is uniform scale; r is rotation (radians).
  const [camera, setCamera] = createSignal({ tx: 0, ty: 0, s: 200, r: 0 });

  let isPointerDown = false;
  let lastPointerPosition: [number, number] | null = null;

  // Build matrix from camera params: row-major
  // [ s*cos  -s*sin  0 ]
  // [ s*sin   s*cos  0 ]
  // [  tx      ty    1 ]
  const transform = createMemo(() => {
    const { s, r, tx, ty } = camera();
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    return d.mat3x3f(s * cos, -s * sin, 0, s * sin, s * cos, 0, tx, ty, 1);
  });

  const handlers = {
    onPointerDown: (
      e: PointerEvent & {
        currentTarget: HTMLCanvasElement;
        target: Element;
      }
    ) => {
      e.stopPropagation();
      isPointerDown = true;
      lastPointerPosition = [e.clientX, e.clientY];
    },
    onPointerUp: (
      e: PointerEvent & {
        currentTarget: HTMLCanvasElement;
        target: Element;
      }
    ) => {
      e.stopPropagation();
      isPointerDown = false;
      lastPointerPosition = null;
    },
    onPointerCancel: (
      e: PointerEvent & {
        currentTarget: HTMLCanvasElement;
        target: Element;
      }
    ) => {
      e.stopPropagation();
      isPointerDown = false;
      lastPointerPosition = null;
    },
    onPointerLeave: (
      e: PointerEvent & {
        currentTarget: HTMLCanvasElement;
        target: Element;
      }
    ) => {
      e.stopPropagation();
      isPointerDown = false;
      lastPointerPosition = null;
    },
    onPointerMove: (
      e: PointerEvent & {
        currentTarget: HTMLCanvasElement;
        target: Element;
      }
    ) => {
      e.stopPropagation();
      // Should zoom on alt key
      if (e.altKey) {
        // Zoom (uniform scale) — use multiplicative scale so it composes nicely
        const scaleAmount = 1 + e.movementY * -0.01;
        setCamera((c) => ({ ...c, s: Math.max(0.001, c.s * scaleAmount) }));
        return;
      }

      if (e.shiftKey) {
        // Rotate
        const rotationAmount = e.movementX * 0.01;
        setCamera((c) => ({ ...c, r: c.r + rotationAmount }));
        return;
      }

      // Pan normally — screen delta is independent of camera transform
      if (isPointerDown && lastPointerPosition) {
        const dx = e.clientX - lastPointerPosition[0];
        const dy = e.clientY - lastPointerPosition[1];

        setCamera((c) => {
          // Simply add screen-space movement to translation
          // (the transform matrix will handle rotation/scale when rendering)
          return { ...c, tx: c.tx + dx, ty: c.ty + dy };
        });

        lastPointerPosition = [e.clientX, e.clientY];
      }
    }
  };

  return { transform, handlers };
}
