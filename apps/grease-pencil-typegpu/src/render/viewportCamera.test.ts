import { expect, it } from 'vitest';
import { getCameraBasis } from './cameraMatrices';
import { dot3, scale3 } from './vector';
import { createDefaultCamera, lockCameraToWorkplane, orbitCamera } from './viewportCamera';

it('orbits along screen directions after every quarter roll, without moving the pivot or zoom', () => {
  for (const roll of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const initial = { ...createDefaultCamera(), roll, target: [3, -2, 5] as [number, number, number] };
    const basis = getCameraBasis(initial);
    const horizontal = structuredClone(initial);
    const vertical = structuredClone(initial);
    orbitCamera(horizontal, 0.1, 0);
    orbitCamera(vertical, 0, 0.1);
    const horizontalDirection = scale3(getCameraBasis(horizontal).forward, -1);
    const verticalDirection = scale3(getCameraBasis(vertical).forward, -1);
    expect(dot3(horizontalDirection, basis.right)).toBeLessThan(0);
    expect(Math.abs(dot3(horizontalDirection, basis.up))).toBeLessThan(1e-6);
    expect(dot3(verticalDirection, basis.up)).toBeGreaterThan(0);
    expect(Math.abs(dot3(verticalDirection, basis.right))).toBeLessThan(1e-6);
    expect(horizontal.target).toEqual(initial.target);
    expect(vertical.distance).toBe(initial.distance);
  }
});

it('preserves deliberate roll through repeated diagonal drags without accumulating tilt', () => {
  for (const roll of [0, 0.43, -1.2, Math.PI]) {
    const camera = { ...createDefaultCamera(), roll };
    for (let i = 0; i < 200; i++) {
      orbitCamera(camera, 2, i % 2 ? -1 : 1);
      const rollError = Math.atan2(Math.sin(camera.roll - roll), Math.cos(camera.roll - roll));
      expect(rollError).toBeCloseTo(0, 10);
    }
  }
});

it('keeps the frame continuous at both elevation limits, including the next gesture', () => {
  for (const sign of [-1, 1]) {
    const camera = { ...createDefaultCamera(), pitch: sign * 1.2, roll: 0.43 };
    orbitCamera(camera, 0, sign * 10000);
    expect(Math.abs(camera.pitch)).toBeLessThan(Math.PI / 2);
    expect(camera.roll).toBeCloseTo(0.43);
    const basis = getCameraBasis(camera);
    orbitCamera(camera, 0.01, 0);
    expect(dot3(basis.up, getCameraBasis(camera).up)).toBeGreaterThan(0.999999);
    expect(camera.roll).toBeCloseTo(0.43);
  }
});

it('leaves 2D locked to its plane when the rotate tool changes canvas roll', () => {
  const camera = createDefaultCamera();
  lockCameraToWorkplane(camera, { origin: [1, 2, 3], rotation: [0.3, 0.2, 0.1], gridScale: 1 }, true);
  camera.roll = 0.7;
  const before = structuredClone(camera);
  orbitCamera(camera, 20, 80);
  expect(camera.roll).toBeCloseTo(0.58);
  expect({ ...camera, roll: before.roll }).toEqual(before);
});
