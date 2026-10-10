import { describe, expect, it } from 'vitest';
import { clusterLayout, type Box, type ClusterLayout } from './layout';

const landscape = { width: 1180, height: 820 };
const portrait = { width: 820, height: 1180 };

describe('clusterLayout', () => {
  it('opens with the QuickMenu under the pen in the middle of an iPad in landscape, three columns at full size', () => {
    const layout = clusterLayout({ x: 590, y: 410 }, landscape, 'left');
    expect(layout.center).toEqual({ x: 590, y: 410 });
    expect(layout).toMatchObject({ scale: 1, kind: 'wide', side: 'left' });
    // The tools and the brush cards are on the pen hand's side, color and layers on the other.
    expect(layout.boxes.tools.x).toBeLessThan(layout.boxes.ring.x);
    expect(layout.boxes.library.x).toBeLessThan(layout.boxes.ring.x);
    expect(layout.boxes.color.x).toBeGreaterThan(layout.boxes.ring.x);
  });

  it('mirrors the cluster for the right hand', () => {
    const left = clusterLayout({ x: 590, y: 410 }, landscape, 'left');
    const right = clusterLayout({ x: 590, y: 410 }, landscape, 'right');
    expect(right.side).toBe('right');
    expect(right.boxes.tools.x).toBe(-(left.boxes.tools.x + left.boxes.tools.width));
    expect(right.boxes.color.x).toBe(-(left.boxes.color.x + left.boxes.color.width));
  });

  it('lines up the tops and bottoms of the two side columns', () => {
    const { boxes } = clusterLayout({ x: 590, y: 410 }, landscape, 'left');
    expect(boxes.library.y).toBe(boxes.color.y);
    expect(boxes.studio.y + boxes.studio.height).toBe(boxes.layers.y + boxes.layers.height);
  });

  it.each([
    ['landscape', landscape],
    ['portrait', portrait]
  ])('keeps every part inside the %s viewport, without overlaps, wherever the pen opens it', (_name, viewport) => {
    for (const x of [0, 20, viewport.width / 3, viewport.width / 2, viewport.width - 20, viewport.width]) {
      for (const y of [0, 20, viewport.height / 2, viewport.height - 20, viewport.height]) {
        for (const hand of ['left', 'right'] as const) {
          const layout = clusterLayout({ x, y }, viewport, hand);
          const boxes = Object.values(layout.boxes).map((box) => onScreen(layout, box));
          for (const box of boxes) {
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.y).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
            expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
          }

          for (const [index, a] of boxes.entries()) {
            for (const b of boxes.slice(index + 1)) {
              expect(overlaps(a, b), `${JSON.stringify(a)} overlaps ${JSON.stringify(b)}`).toBe(false);
            }
          }
        }
      }
    }
  });

  it('stacks color and layers with the QuickMenu in portrait, below it near the top and above it near the bottom', () => {
    const top = clusterLayout({ x: 410, y: 140 }, portrait, 'left');
    expect(top).toMatchObject({ kind: 'tall', scale: 1, center: { x: 524, y: 140 } });
    expect(top.boxes.color.y).toBeGreaterThan(0);
    expect(top.boxes.layers.y).toBeGreaterThan(top.boxes.color.y);

    // The view pill under the QuickMenu keeps it 142 px above the bottom margin.
    const bottom = clusterLayout({ x: 410, y: 1100 }, portrait, 'left');
    expect(bottom.center.y).toBe(1180 - 10 - 142);
    expect(bottom.boxes.layers.y + bottom.boxes.layers.height).toBeLessThan(0);
  });

  it('swaps the columns at an edge without room for the hand’s side, so the QuickMenu stays nearer to the pen', () => {
    const layout = clusterLayout({ x: 140, y: 590 }, portrait, 'left');
    expect(layout.side).toBe('right');
    expect(layout.center.x).toBe(148);
    expect(layout.boxes.tools.x).toBeGreaterThan(0);
  });

  it('keeps the pen hand’s side when swapping would bring the QuickMenu only a little closer', () => {
    expect(clusterLayout({ x: 470, y: 410 }, landscape, 'left').side).toBe('left');
  });

  it('scales the cluster down only when nothing fits', () => {
    const layout = clusterLayout({ x: 300, y: 300 }, { width: 600, height: 600 }, 'left');
    expect(layout.scale).toBeLessThan(1);
    expect(layout.scale).toBeGreaterThan(0.5);
  });
});

/** A part's box in client pixels. */
function onScreen(layout: ClusterLayout, box: Box): Box {
  return {
    x: layout.center.x + box.x * layout.scale,
    y: layout.center.y + box.y * layout.scale,
    width: box.width * layout.scale,
    height: box.height * layout.scale
  };
}

/** Whether two boxes share more than an edge. */
function overlaps(a: Box, b: Box) {
  const slack = 0.01;
  return (
    a.x + slack < b.x + b.width &&
    b.x + slack < a.x + a.width &&
    a.y + slack < b.y + b.height &&
    b.y + slack < a.y + a.height
  );
}
