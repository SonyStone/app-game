import { describe, expect, it } from 'vitest';
import { arrowSize, placePopover } from './placePopover';

const view = { width: 1180, height: 820 };

describe('placePopover', () => {
  it('centers the card and its arrow under the button', () => {
    const placed = placePopover({ left: 500, top: 0, width: 44, height: 44 }, 320, view);
    expect(placed.left).toBe(522 - 160);
    expect(placed.arrow).toBe(160);
    expect(placed.top).toBe(44 + arrowSize);
    expect(placed.maxHeight).toBe(820 - 44 - arrowSize - 8);
  });

  it('keeps the card inside the view and the arrow over the button', () => {
    const right = placePopover({ left: 1120, top: 0, width: 44, height: 44 }, 320, view);
    expect(right.left).toBe(1180 - 8 - 320);
    expect(right.arrow).toBe(1142 - right.left);

    const left = placePopover({ left: 0, top: 0, width: 80, height: 44 }, 320, view);
    expect(left.left).toBe(8);
    expect(left.arrow).toBe(32);
  });

  it('narrows a card wider than the view and keeps the arrow off the corners', () => {
    const placed = placePopover({ left: 0, top: 0, width: 10, height: 44 }, 500, { width: 400, height: 600 });
    expect(placed.width).toBe(384);
    expect(placed.arrow).toBe(22);
  });
});
