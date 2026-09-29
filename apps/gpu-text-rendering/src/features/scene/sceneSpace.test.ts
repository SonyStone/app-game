import { describe, expect, it } from 'vitest';
import { makeAffineSpace, type AffineTransform } from './SceneSpace';

describe('affine scene space', () => {
  const screenToClip = (point: { x: number; y: number }) => ({ x: point.x / 400 - 1, y: 1 - point.y / 300 });

  it('maps local points through origin and axes, and back', () => {
    const space = makeAffineSpace(
      () => ({ origin: { x: 600, y: 200 }, axisX: { x: 30, y: 10 }, axisY: { x: -5, y: -40 } }),
      screenToClip
    );

    expect(space.toScreen({ x: 2, y: 1 })).toEqual({ x: 655, y: 180 });
    expect(space.toClip({ x: 2, y: 1 })).toEqual(screenToClip({ x: 655, y: 180 }));
    const local = space.fromScreen({ x: 655, y: 180 });
    expect(local.x).toBeCloseTo(2, 12);
    expect(local.y).toBeCloseTo(1, 12);
  });

  it('reads the current transform on every projection', () => {
    let transform: AffineTransform = { origin: { x: 0, y: 0 }, axisX: { x: 1, y: 0 }, axisY: { x: 0, y: 1 } };
    const space = makeAffineSpace(() => transform, screenToClip);

    expect(space.toScreen({ x: 3, y: 4 })).toEqual({ x: 3, y: 4 });
    transform = { origin: { x: 10, y: 100 }, axisX: { x: 2, y: 0 }, axisY: { x: 0, y: -2 } };
    expect(space.toScreen({ x: 3, y: 4 })).toEqual({ x: 16, y: 92 });
    expect(space.fromScreen({ x: 16, y: 92 })).toEqual({ x: 3, y: 4 });
  });
});
