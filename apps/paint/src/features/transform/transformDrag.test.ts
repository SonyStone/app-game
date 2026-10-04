// @vitest-environment jsdom
import { ok } from 'neverthrow';
import { createRoot, flush } from 'solid-js';
import { expect, it, vi } from 'vitest';
import { createTransform, type BoxState, type Quad } from './createTransform';
import { boxPoints, distortBox, moveBox, rotateBox } from './transformDrag';

const bounds = { left: 0, top: 0, right: 100, bottom: 50 };
const square: Quad = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 50 },
  { x: 0, y: 50 }
];
const distorted: BoxState & { corners: Quad } = {
  offset: { x: 0, y: 0 },
  scale: { x: 1, y: 1 },
  angle: 0,
  corners: square
};

it('moves one corner, an edge or the whole distorted box, and refuses to fold it', () => {
  expect(distortBox(distorted, { x: 1, y: 1 }, { x: 0, y: 0 }, { x: 10, y: 5 }).corners![2]).toEqual({ x: 110, y: 55 });
  expect(distortBox(distorted, { x: 0, y: -1 }, { x: 0, y: 0 }, { x: 0, y: -20 }).corners).toEqual([
    { x: 0, y: -20 },
    { x: 100, y: -20 },
    { x: 100, y: 50 },
    { x: 0, y: 50 }
  ]);
  expect(moveBox(distorted, { x: 0, y: 0 }, { x: 5, y: 5 }).corners![0]).toEqual({ x: 5, y: 5 });
  // Dragging the top-left corner past the opposite one would fold the quad.
  expect(distortBox(distorted, { x: -1, y: -1 }, { x: 0, y: 0 }, { x: 150, y: 80 })).toBe(distorted);

  const turned = rotateBox(bounds, distorted, { x: 150, y: 25 }, { x: 50, y: 125 }, false).corners!;
  expect(turned[0]!.x).toBeCloseTo(75);
  expect(turned[0]!.y).toBeCloseTo(-25);
  // Handles of a distorted box sit in perspective; its corners exactly where they were put.
  expect(boxPoints(bounds, distorted).corners).toEqual([...square]);
});

it('distorts the box by its corners, flips and turns them, and returns to the box when turned off', async () => {
  const run = vi.fn(async (command: { command: { phase: string } }) =>
    ok(command.command.phase === 'begin' ? { bounds } : undefined)
  );
  const transform = createRoot(() =>
    createTransform({
      run: run as never,
      selection: () => [],
      canStart: () => true,
      onSelection: () => {},
      onError: () => {}
    })
  );
  await transform.start();
  flush();
  transform.setBox({ offset: { x: 10, y: 0 }, scale: { x: 1, y: 1 }, angle: 0 });
  transform.distort(true);
  flush();
  expect(transform.box().corners).toEqual([
    { x: 10, y: 0 },
    { x: 110, y: 0 },
    { x: 110, y: 50 },
    { x: 10, y: 50 }
  ]);

  transform.flip('x');
  flush();
  expect(transform.box().corners![0]).toEqual({ x: 110, y: 0 });
  transform.rotate();
  flush();
  // A quarter turn about the center (60, 25).
  expect(transform.box().corners![0]!.x).toBeCloseTo(85);
  expect(transform.box().corners![0]!.y).toBeCloseTo(75);

  transform.distort(false);
  flush();
  expect(transform.box()).toEqual({ offset: { x: 10, y: 0 }, scale: { x: 1, y: 1 }, angle: 0 });
  await vi.waitFor(() => expect(run.mock.calls.length).toBeGreaterThan(1));
  const update = run.mock.calls.find(([command]) => command.command.phase === 'update')![0] as never as {
    command: { matrix: number[] };
  };
  expect(update.command.matrix).toHaveLength(9);
});
