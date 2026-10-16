import { expect, it } from 'vitest';
import { anchorOf, layoutId, parsePageLayout, placementOf, type PlacedPart } from './pageLayout';

const screen = { width: 1200, height: 900 };

it('anchors a box to the edge of the third its center lies in', () => {
  expect(anchorOf({ x: 20, y: 20, width: 100, height: 100 }, screen)).toEqual({ x: 'left', y: 'top' });
  expect(anchorOf({ x: 550, y: 400, width: 100, height: 100 }, screen)).toEqual({ x: 'center', y: 'middle' });
  expect(anchorOf({ x: 1000, y: 780, width: 180, height: 100 }, screen)).toEqual({ x: 'right', y: 'bottom' });
});

it('keeps a part as far from its edge, or from the middle, as on the screen it was built for', () => {
  const part = (anchor: PlacedPart['anchor']): PlacedPart => ({
    part: 'p',
    x: 1000,
    y: 100,
    width: 180,
    height: 60,
    anchor
  });

  expect(placementOf(part({ x: 'right', y: 'top' }), screen)).toEqual({
    position: 'absolute',
    right: '20px',
    top: '100px'
  });
  expect(placementOf(part({ x: 'center', y: 'bottom' }), screen)).toEqual({
    position: 'absolute',
    left: 'calc(50% + 490px)',
    bottom: '740px',
    translate: '-50% 0'
  });
});

it('reads a layout, and drops one that is malformed', () => {
  const layout = {
    version: 1,
    name: ' Two panels ',
    screen,
    parts: [{ part: 'studio-layers', x: 0, y: 0, width: 284, height: 400, anchor: { x: 'left', y: 'top' } }]
  };

  expect(parsePageLayout(layout)?.name).toBe('Two panels');
  expect(parsePageLayout({ ...layout, version: 2 })).toBeUndefined();
  expect(parsePageLayout({ ...layout, parts: [{ part: 'x', x: 0 }] })).toBeUndefined();
  expect(parsePageLayout('nope')).toBeUndefined();
});

it('names a page file after its name', () => {
  expect(layoutId('My Puck page, take 2!')).toBe('my-puck-page-take-2');
  expect(layoutId('Café')).toBe('cafe');
  expect(layoutId('???')).toBe('page');
});
