import { describe, expect, it } from 'vitest';
import { discPoint } from '../../shared/ui/colorDisc';
import { disc, discCenter, discPick } from './disc';

const view = { left: 0, top: 0, width: 1280, height: 800 };

describe('discCenter', () => {
  it('puts the current color under the finger', () => {
    const color = { h: 210, s: 0.6, v: 0.4 };
    const finger = { x: 640, y: 400 };
    const center = discCenter(finger, color, view);
    const { u, v } = discPoint(color.s, color.v);
    expect(center.x + u * disc.inner).toBeCloseTo(finger.x);
    expect(center.y + v * disc.inner).toBeCloseTo(finger.y);
  });

  it('stays inside the view at the edge', () => {
    const center = discCenter({ x: 1275, y: 795 }, { h: 0, s: 1, v: 0 }, view);
    expect(center.x + disc.outer).toBeLessThanOrEqual(1280);
    expect(center.y + disc.outer).toBeLessThanOrEqual(800);
  });
});

describe('discPick', () => {
  const center = { x: 400, y: 400 };
  const color = { h: 120, s: 0.5, v: 0.5 };

  it('reads saturation and brightness inside the disc, keeping the hue', () => {
    const { u, v } = discPoint(0.8, 0.3);
    const picked = discPick(center, { x: 400 + u * disc.inner, y: 400 + v * disc.inner }, color);
    expect(picked.h).toBe(120);
    expect(picked.s).toBeCloseTo(0.8);
    expect(picked.v).toBeCloseTo(0.3);
  });

  it('reads the hue clockwise from the right on the ring and beyond it', () => {
    expect(discPick(center, { x: 400 + 110, y: 400 }, color)).toEqual({ ...color, h: 0 });
    expect(discPick(center, { x: 400, y: 400 + 110 }, color).h).toBeCloseTo(90);
    expect(discPick(center, { x: 400 - 300, y: 400 }, color).h).toBeCloseTo(180);
  });
});
