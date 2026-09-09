import { describe, expect, it } from 'vitest';
import { defaultCamera, worldToScreen } from '../camera';
import { dirtyRegion } from './dirtyRegion';

describe('dirty framebuffer regions', () => {
  it('clips to the framebuffer and omits empty/offscreen changes', () => {
    const size = { width: 512, height: 512 };
    expect(dirtyRegion([], defaultCamera(), size, size)).toBeUndefined();
    expect(dirtyRegion(['100,100'], defaultCamera(), size, size)).toBeUndefined();
    expect(dirtyRegion(['0,0'], defaultCamera(), size, size)).toEqual({ x: 254, y: 254, width: 258, height: 258 });
  });

  it('covers all transformed tile corners at fractional zoom, rotation, mirror and DPR', () => {
    const camera = { ...defaultCamera(), zoom: 0.23, angle: 0.7, mirrored: true };
    const size = { width: 512, height: 512 },
      pixels = { width: 1024, height: 1024 };
    const region = dirtyRegion(['-1,0'], camera, size, pixels)!;
    for (const x of [-256, 0])
      for (const y of [0, 256]) {
        const point = worldToScreen({ x, y }, camera, size);
        expect(region.x).toBeLessThanOrEqual(point.x * 2 - 2);
        expect(region.y).toBeLessThanOrEqual(point.y * 2 - 2);
        expect(region.x + region.width).toBeGreaterThanOrEqual(point.x * 2 + 2);
        expect(region.y + region.height).toBeGreaterThanOrEqual(point.y * 2 + 2);
      }
  });
});
