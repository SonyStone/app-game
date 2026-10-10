import { expect, it } from 'vitest';
import { defaultCamera } from '../camera';
import { createCameraMotion } from './cameraMotion';

it('extrapolates a steady pan and zoom, and ignores a still or paused view', () => {
  const motion = createCameraMotion(100);
  const camera = (x: number, zoom = 1) => ({ ...defaultCamera(), x, zoom });
  expect(motion.update(camera(0), 0)).toBeUndefined();
  expect(motion.update(camera(0), 16)).toBeUndefined();
  // Velocity smoothing reaches the steady 1 px/ms after a few frames.
  let ahead;
  for (let frame = 1; frame <= 8; frame++) ahead = motion.update(camera(frame * 16), 16 + frame * 16);
  expect(ahead!.x).toBeCloseTo(128 + 100, 0);
  expect(ahead!.zoom).toBe(1);

  // A pause starts over.
  expect(motion.update(camera(200), 400)).toBeUndefined();
  expect(motion.update(camera(200), 416)).toBeUndefined();

  for (let frame = 1; frame <= 8; frame++) ahead = motion.update(camera(200, 1.01 ** frame), 416 + frame * 16);
  expect(ahead!.x).toBeCloseTo(200);
  expect(ahead!.zoom).toBeGreaterThan(1.01 ** 8);
  expect(ahead!.zoom).toBeLessThanOrEqual(2 * 1.01 ** 8);
});
