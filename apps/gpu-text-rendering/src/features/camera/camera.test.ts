import { describe, expect, it } from 'vitest';
import {
  documentBounds,
  fitCamera,
  moveCamera,
  pageRects,
  rotationMatrix,
  screenToWorld,
  worldToScreen,
  type Camera
} from './camera';

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
    const moved = moveCamera(camera, from, to, 1.7, 0.43, 1200, 700, 612 / 792);
    expect(camera).toEqual({ x: 0.5, y: 0.5, zoom: 2, rotation });
    const result = screenToWorld(moved, to, 1200, 700, 612 / 792);
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
    const panned = moveCamera(camera, { x: 100, y: 200 }, { x: 120, y: 230 }, 1, 0, 390, 844, 612 / 792);
    expect(panned.zoom).toBe(120);
    const moved = screenToWorld(panned, { x: 120, y: 230 }, 390, 844, 612 / 792);
    expect(moved.x).toBeCloseTo(anchor.x);
    expect(moved.y).toBeCloseTo(anchor.y);
    expect(moveCamera(panned, { x: 120, y: 230 }, { x: 120, y: 230 }, 1.2, 0, 390, 844, 612 / 792).zoom).toBe(100);
  });

  it('clamps magnification without losing the cursor anchor', () => {
    const camera = { x: 0, y: 0, zoom: 1, rotation: 1 };
    const point = { x: 20, y: 30 };
    const anchor = screenToWorld(camera, point, 800, 600, 1);
    const moved = moveCamera(camera, point, point, 1e20, 0, 800, 600, 1);
    expect(moved.zoom).toBe(1 / 65536);
    expect(screenToWorld(moved, point, 800, 600, 1).x).toBeCloseTo(anchor.x);
  });

  it.each([0, -1, Infinity, NaN])('returns the same camera for scale %s', (scale) => {
    const camera = { x: 0, y: 0, zoom: 1, rotation: 0 };
    expect(moveCamera(camera, { x: 1, y: 1 }, { x: 2, y: 2 }, scale, 0, 800, 600, 1)).toBe(camera);
    expect(moveCamera(camera, { x: 1, y: 1 }, { x: 2, y: 2 }, 1, 0, 0, 600, 1)).toBe(camera);
  });

  it('describes laid-out pages bottom-left first in first-page units and bounds them', () => {
    const pages = [
      { x: 0.5, y: 0.5, width: 612, height: 792 },
      { x: -1.5, y: 0.25, width: 1224, height: 396 }
    ];
    expect(pageRects(pages)).toEqual([
      { x: -0.5, y: -0.5, width: 1, height: 1 },
      { x: 1.5, y: 0.25, width: 2, height: 0.5 }
    ]);
    expect(documentBounds(pages)).toEqual({ left: -0.5, right: 3.5, bottom: -0.5, top: 0.75 });
  });

  it.each([
    { top: 0, right: 0, bottom: 0, left: 0 },
    { top: 44, right: 24, bottom: 84, left: 24 },
    { top: 10, right: 160, bottom: 90, left: 8 }
  ])('fits bounds inside the viewport less padding %j, touching one pair of sides', (padding) => {
    const bounds = { left: -1, right: 3.5, bottom: -2, top: 1 };
    const aspect = 612 / 792;
    const camera = fitCamera(bounds, { width: 800, height: 600 }, aspect, padding);
    const corner = (x: number, y: number) => worldToScreen(camera, { x, y }, 800, 600, aspect);
    const topLeft = corner(bounds.left, bounds.top);
    const bottomRight = corner(bounds.right, bounds.bottom);
    expect(camera.rotation).toBe(0);
    expect(topLeft.x).toBeGreaterThanOrEqual(padding.left - 1e-9);
    expect(topLeft.y).toBeGreaterThanOrEqual(padding.top - 1e-9);
    expect(bottomRight.x).toBeLessThanOrEqual(800 - padding.right + 1e-9);
    expect(bottomRight.y).toBeLessThanOrEqual(600 - padding.bottom + 1e-9);
    const horizontal = topLeft.x - padding.left + (800 - padding.right - bottomRight.x);
    const vertical = topLeft.y - padding.top + (600 - padding.bottom - bottomRight.y);
    expect(Math.min(horizontal, vertical)).toBeCloseTo(0);
    expect(topLeft.x - padding.left).toBeCloseTo(800 - padding.right - bottomRight.x);
    expect(topLeft.y - padding.top).toBeCloseTo(600 - padding.bottom - bottomRight.y);
  });
});
