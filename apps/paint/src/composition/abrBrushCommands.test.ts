import { expect, it } from 'vitest';
import { abrBrushCommand } from './abrBrushCommands';

it('accepts finite world points and rejects malformed canvas load commands', () => {
  expect(abrBrushCommand.parse({ type: 'load-canvas', point: { x: -123.5, y: 256 } })).toEqual({
    type: 'load-canvas',
    point: { x: -123.5, y: 256 }
  });
  for (const point of [{ x: NaN, y: 0 }, { x: 0, y: Infinity }, { x: '12', y: 0 }, { x: 0 }])
    expect(abrBrushCommand.safeParse({ type: 'load-canvas', point }).success).toBe(false);
  expect(abrBrushCommand.safeParse({ type: 'load-canvas', point: { x: 0, y: 0 }, size: Infinity }).success).toBe(false);
});
