import { describe, expect, it } from 'vitest';
import { moveCamera, rotationMatrix, screenToWorld, worldToScreen, type Camera } from './camera';

describe('camera geometry', () => {
  it.each([0, Math.PI / 2, -2.8])('round-trips document and screen points at rotation %s', (rotation) => {
    const camera = { x: 0.3, y: 0.8, zoom: 0.2, rotation };
    const world = { x: 0.4, y: 0.7 };
    const screen = worldToScreen(camera, world, 801, 601, 612 / 792);
    const result = screenToWorld(camera, screen, 801, 601, 612 / 792);
    expect(result.x).toBeCloseTo(world.x, 12);
    expect(result.y).toBeCloseTo(world.y, 12);

    const x = ((world.x - camera.x) * 601) / 801 / camera.zoom;
    const y = (world.y - camera.y) / ((camera.zoom * 612) / 792);
    const matrix = rotationMatrix(rotation, 601 / 801);
    expect((screen.x * 2) / 801 - 1).toBeCloseTo(matrix[0] * x + matrix[2] * y);
    expect(1 - (screen.y * 2) / 601).toBeCloseTo(matrix[1] * x + matrix[3] * y);
  });

  it.each([0, Math.PI / 2, -2.8])('keeps the gesture anchor fixed at rotation %s', (rotation) => {
    const camera: Camera = { x: 0.5, y: 0.5, zoom: 2, rotation };
    const from = { x: 310, y: 180 };
    const to = { x: 420, y: 240 };
    const anchor = screenToWorld(camera, from, 1200, 700, 612 / 792);
    moveCamera(camera, from, to, 1.7, 0.43, 1200, 700, 612 / 792);
    const result = screenToWorld(camera, to, 1200, 700, 612 / 792);
    expect(result.x).toBeCloseTo(anchor.x, 12);
    expect(result.y).toBeCloseTo(anchor.y, 12);
  });

  it('matches the shader rotation on a non-square viewport', () => {
    const camera = { x: 0.3, y: 0.8, zoom: 0.2, rotation: 0.7 };
    const point = { x: 420, y: 190 };
    const world = screenToWorld(camera, point, 1200, 700, 612 / 792);
    const x = (((world.x - camera.x) / camera.zoom) * 700) / 1200;
    const y = (world.y - camera.y) / ((camera.zoom * 612) / 792);
    const m = rotationMatrix(camera.rotation, 700 / 1200);
    expect(m[0]! * x + m[2]! * y).toBeCloseTo((point.x / 1200) * 2 - 1);
    expect(m[1]! * x + m[3]! * y).toBeCloseTo(1 - (point.y / 700) * 2);
  });

  it('pans from a large-document overview without snapping to the normal zoom limit', () => {
    const camera = { x: 20, y: -10, zoom: 120, rotation: 0 };
    const anchor = screenToWorld(camera, { x: 100, y: 200 }, 390, 844, 612 / 792);
    moveCamera(camera, { x: 100, y: 200 }, { x: 120, y: 230 }, 1, 0, 390, 844, 612 / 792);
    expect(camera.zoom).toBe(120);
    const moved = screenToWorld(camera, { x: 120, y: 230 }, 390, 844, 612 / 792);
    expect(moved.x).toBeCloseTo(anchor.x);
    expect(moved.y).toBeCloseTo(anchor.y);
    moveCamera(camera, { x: 120, y: 230 }, { x: 120, y: 230 }, 1.2, 0, 390, 844, 612 / 792);
    expect(camera.zoom).toBe(100);
  });

  it('clamps magnification without losing the cursor anchor', () => {
    const camera = { x: 0, y: 0, zoom: 1, rotation: 1 };
    const point = { x: 20, y: 30 };
    const anchor = screenToWorld(camera, point, 800, 600, 1);
    moveCamera(camera, point, point, 1e20, 0, 800, 600, 1);
    expect(camera.zoom).toBe(1 / 65536);
    expect(screenToWorld(camera, point, 800, 600, 1).x).toBeCloseTo(anchor.x);
  });
});
