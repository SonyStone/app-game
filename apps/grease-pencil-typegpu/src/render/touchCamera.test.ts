import { describe, expect, it } from 'vitest';
import { getCameraBasis } from './cameraMatrices';
import { transformTouchCamera } from './touchCamera';
import { add3, scale3 } from './vector';
import { createDefaultCamera, lockCameraToWorkplane, screenToWorkplane, worldToScreen } from './viewportCamera';

const viewport = { left: 20, top: 80, width: 900, height: 700 };
const canvas = { getBoundingClientRect: () => viewport } as HTMLCanvasElement;
const plane = { origin: [0, 0, 0], rotation: [0, 0, 0], gridScale: 1 } as const;

for (const mode of ['2d', '3d'] as const) {
  describe(`${mode} tablet camera`, () => {
    it('keeps an off-center anchor under the fingers during simultaneous pan, zoom, and twist', () => {
      const camera = createDefaultCamera();
      if (mode === '2d') lockCameraToWorkplane(camera, { ...plane, origin: [0, 0, 0], rotation: [0, 0, 0] });
      const basis = getCameraBasis(camera);
      const anchor = add3(camera.target, add3(scale3(basis.right, 1.2), scale3(basis.up, 0.8)));
      const from = worldToScreen(canvas, camera, viewport.width, viewport.height, anchor)!;
      const to = { x: from.x + 83, y: from.y - 47 };
      transformTouchCamera(camera, viewport, { from, to, scale: 1.8, rotation: 0.6 });
      const projected = worldToScreen(canvas, camera, viewport.width, viewport.height, anchor)!;
      expect(projected.x).toBeCloseTo(to.x, 3);
      expect(projected.y).toBeCloseTo(to.y, 3);
      expect(camera.distance).toBeCloseTo(7.5 / 1.8);
      expect(camera.roll).toBeCloseTo(-0.6);
      expect(camera.mode).toBe(mode);
    });

    it('clamps zoom while preserving the pinch anchor', () => {
      const camera = createDefaultCamera();
      const from = { x: 470, y: 430 };
      const anchor = [...camera.target] as typeof camera.target;
      transformTouchCamera(camera, viewport, { from, to: { x: 510, y: 450 }, scale: 1e6, rotation: 0 });
      const projected = worldToScreen(canvas, camera, viewport.width, viewport.height, anchor)!;
      expect(camera.distance).toBe(1.6);
      expect(projected.x).toBeCloseTo(510, 3);
      expect(projected.y).toBeCloseTo(450, 3);
    });
  });
}

it('keeps drawing coordinates on the locked plane after a rotated paper gesture', () => {
  const camera = createDefaultCamera();
  const workplane = { origin: [0, 0, 0], rotation: [0.2, 0.3, 0.1], gridScale: 1 } satisfies Parameters<
    typeof lockCameraToWorkplane
  >[1];
  lockCameraToWorkplane(camera, workplane);
  transformTouchCamera(camera, viewport, {
    from: { x: 400, y: 300 },
    to: { x: 500, y: 350 },
    scale: 1.5,
    rotation: Math.PI / 2
  });
  const point = screenToWorkplane(canvas, camera, workplane, viewport.width, viewport.height, 310, 280)!;
  const projected = worldToScreen(canvas, camera, viewport.width, viewport.height, point)!;
  expect(projected.x).toBeCloseTo(310, 2);
  expect(projected.y).toBeCloseTo(280, 2);
});
