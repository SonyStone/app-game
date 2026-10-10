import { describe, expect, it } from 'vitest';
import { near, placeBesideDock } from './placement';

const view = { width: 1280, height: 800 };

describe('placeBesideDock', () => {
  it('puts the card left of a dock on the right, level with the control', () => {
    const anchor = { left: 1170, top: 120, width: 96, height: 44 };
    expect(placeBesideDock(anchor, { width: 240, height: 100 }, 'right', view)).toEqual({ left: 922, top: 120 });
  });

  it('puts the card right of a dock on the left', () => {
    const anchor = { left: 14, top: 120, width: 96, height: 44 };
    expect(placeBesideDock(anchor, { width: 240, height: 100 }, 'left', view)).toEqual({ left: 118, top: 120 });
  });

  it('moves a tall card up to stay in the window, but not above the margin', () => {
    const anchor = { left: 1170, top: 600, width: 96, height: 44 };
    expect(placeBesideDock(anchor, { width: 240, height: 400 }, 'right', view).top).toBe(392);
    expect(placeBesideDock(anchor, { width: 240, height: 900 }, 'right', view).top).toBe(8);
  });

  it('keeps a wide card inside the window', () => {
    const anchor = { left: 100, top: 10, width: 96, height: 44 };
    expect(placeBesideDock(anchor, { width: 300, height: 100 }, 'right', view).left).toBe(8);
  });
});

describe('near', () => {
  it('includes a margin around the rectangle', () => {
    const rect = { left: 100, top: 100, width: 50, height: 50 };
    expect(near({ x: 70, y: 120 }, rect, 32)).toBe(true);
    expect(near({ x: 60, y: 120 }, rect, 32)).toBe(false);
  });
});
