import { describe, expect, it } from 'vitest';
import { createCamera, followTarget, screenToWorld } from '../../arena/camera';
import { createScope } from './scope';

const screen = { width: 1440, height: 900 };

describe("the Sniper's scope", () => {
  it('widens the view about the cursor and back, keeping the ground under a still cursor within a pixel', () => {
    const camera = { ...createCamera({ x: 120, y: -40 }), zoom: 1.6, rotation: 0.3 };
    const scope = createScope();
    const cursor = { x: 1310, y: 210 };
    const aimed = screenToWorld(camera, cursor, screen);
    const tank = { x: 120, y: -40 };
    let drift = 0;
    let widest = camera.zoom;

    // A full charge of 2.5 s, the shot, and 1.5 s for the view to close again, at 60 frames a second.
    for (let frame = 0; frame < 240; frame++) {
      scope.step(camera, screen, cursor, frame < 150, 1 / 60);
      followTarget(camera, tank, screen, scope.followMargin(0.2));
      const now = screenToWorld(camera, cursor, screen);
      drift = Math.max(drift, Math.hypot(now.x - aimed.x, now.y - aimed.y));
      widest = Math.min(widest, camera.zoom);
    }

    expect(drift).toBeLessThan(1);
    expect(widest).toBeCloseTo(1.6 * 0.65, 2);
    expect(camera.zoom).toBeCloseTo(1.6, 3);
    expect(scope.amount).toBe(0);
  });
});
