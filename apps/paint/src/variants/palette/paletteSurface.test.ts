import { describe, expect, it } from 'vitest';
import { clearSurface, createSurface, dab, dragKnife, isBlank, pressKnife, sampleColor, wipe } from './paletteSurface';
import type { Rgb } from './pigment';

const blue: Rgb = [24, 70, 196];
const yellow: Rgb = [255, 210, 26];

describe('palette surface', () => {
  it('starts blank and finds no paint to pick', () => {
    const surface = createSurface(40, 30);
    expect(isBlank(surface)).toBe(true);
    expect(sampleColor(surface, 20, 15, 3)).toBeUndefined();
  });

  it('lays an opaque dab that picks as its own color, and touches only its disk', () => {
    const surface = createSurface(60, 40);
    const dirty = dab(surface, 20, 20, 8, blue);
    expect(sampleColor(surface, 20, 20, 3)).toEqual(blue);
    expect(sampleColor(surface, 50, 20, 3)).toBeUndefined();
    expect(dirty).toEqual({ x: 12, y: 12, width: 17, height: 17 });
  });

  it('clips dabs at the edges', () => {
    const surface = createSurface(20, 20);
    expect(dab(surface, 0, 0, 5, blue)).toEqual({ x: 0, y: 0, width: 6, height: 6 });
    expect(dab(surface, -50, -50, 5, blue).width).toBe(0);
  });

  it('mixes two dabs to green when the knife drags one through the other', () => {
    const surface = createSurface(120, 40);
    dab(surface, 30, 20, 12, blue);
    dab(surface, 60, 20, 12, yellow);
    const knife = pressKnife(surface, 30, 20, 10);
    for (let x = 32; x <= 90; x += 2) {
      dragKnife(surface, knife, x, 20);
    }

    for (let x = 90; x >= 30; x -= 2) {
      dragKnife(surface, knife, x, 20);
    }

    const [r, g, b] = sampleColor(surface, 50, 20, 3)!;
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it('spreads paint into bare palette, thinning it out', () => {
    const surface = createSurface(120, 40);
    dab(surface, 20, 20, 10, blue);
    const knife = pressKnife(surface, 20, 20, 10);
    for (let x = 22; x <= 60; x += 2) {
      dragKnife(surface, knife, x, 20);
    }

    const alphaAt = (x: number) => surface.data[(20 * surface.width + x) * 4 + 3]!;
    expect(alphaAt(50)).toBeGreaterThan(0);
    expect(alphaAt(50)).toBeLessThan(255);
    expect(sampleColor(surface, 45, 20, 2)).toEqual(blue);
  });

  it('wipes and cleans', () => {
    const surface = createSurface(40, 40);
    dab(surface, 20, 20, 8, yellow);
    wipe(surface, 20, 20, 12);
    expect(sampleColor(surface, 20, 20, 3)).toBeUndefined();
    dab(surface, 20, 20, 8, yellow);
    clearSurface(surface);
    expect(isBlank(surface)).toBe(true);
  });
});
