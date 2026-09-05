import { expect, it } from 'vitest';
import type { DrawingWorkplane } from '../document';
import { createDefaultCamera, orbitCamera, panCamera, resetCameraView, zoomCamera } from './viewportCamera';
import { createViewportCameraMemory } from './viewportCameraMemory';

const plane: DrawingWorkplane = { origin: [0, 0, 0], rotation: [0, 0, 0], gridScale: 1 };

it('restores independent pan, zoom, orbit and roll through repeated 2D/3D switches', () => {
  const camera = createDefaultCamera();
  const memory = createViewportCameraMemory(camera);
  orbitCamera(camera, 80, 30);
  panCamera(camera, 45, -20);
  zoomCamera(camera, 150);
  camera.roll = 0.3;
  const space = structuredClone(camera);

  memory.switchMode('2d', plane);
  panCamera(camera, -90, 60);
  zoomCamera(camera, -250);
  orbitCamera(camera, 70, 0);
  const paper = structuredClone(camera);
  for (let i = 0; i < 3; i++) {
    memory.switchMode('3d', plane);
    expect(camera).toEqual(space);
    memory.switchMode('2d', plane);
    expect(camera).toEqual(paper);
  }
});

it('remembers the initial 3D pose when the app opens directly in 2D', () => {
  const camera = createDefaultCamera();
  const initial = structuredClone(camera);
  const memory = createViewportCameraMemory(camera);
  memory.switchMode('2d', plane);
  memory.switchMode('3d', plane);
  expect(camera).toEqual(initial);
});

it('keeps saved vectors independent from subsequent live camera edits', () => {
  const camera = createDefaultCamera();
  const memory = createViewportCameraMemory(camera);
  memory.switchMode('2d', plane);
  camera.target = [1, 2, 3];
  memory.switchMode('3d', plane);
  camera.target[0] = 99;
  memory.switchMode('2d', plane);
  expect(camera.target).toEqual([1, 2, 3]);
});

it('realigns a changed workplane instead of restoring an incompatible paper pose', () => {
  const camera = createDefaultCamera();
  const memory = createViewportCameraMemory(camera);
  memory.switchMode('2d', plane);
  camera.target = [8, 9, 0];
  camera.roll = 0.8;
  memory.switchMode('3d', plane);
  memory.switchMode('2d', { ...plane, origin: [2, 3, 4], rotation: [Math.PI / 2, 0, 0] });
  expect(camera.target).toEqual([2, 3, 4]);
  expect(camera.roll).toBe(0);
  expect(camera.lockedNormal?.[1]).toBeCloseTo(-1);
});

it('honors explicit reset without losing the other mode, and saves the reset as the new pose', () => {
  const camera = createDefaultCamera();
  const memory = createViewportCameraMemory(camera);
  memory.switchMode('2d', plane);
  camera.roll = 1.2;
  camera.target = [2, 4, 0];
  memory.switchMode('3d', plane);
  resetCameraView(camera);
  memory.switchMode('2d', plane);
  expect(camera.roll).toBe(1.2);
  memory.switchMode('2d', plane, true);
  expect(camera.roll).toBe(0);
  expect(camera.target).toEqual(plane.origin);
  const paper = structuredClone(camera);
  memory.switchMode('3d', plane);
  expect(camera).toEqual(createDefaultCamera());
  memory.switchMode('2d', plane);
  expect(camera).toEqual(paper);
});
