import { expect, it } from 'vitest';
import type { Board } from './board';
import { chooseLook, resolveLook, type LookSpec } from './looks';

const looks: LookSpec[] = [
  { id: 'swatch', label: 'Swatch', min: { width: 0, height: 0 } },
  { id: 'disc', label: 'Disc', min: { width: 60, height: 60 } },
  { id: 'wheel', label: 'Wheel', min: { width: 124, height: 156 } }
];
const span = (columns: number, rows: number) => ({ columns, rows });
/** The room of a part of `columns` by `rows` cells of 28 px. */
const room = (columns: number, rows: number) => ({ width: columns * 32 - 4, height: rows * 32 - 4 });

it('shows the automatic look until one is chosen', () => {
  expect(resolveLook(undefined, span(3, 3), looks, 'swatch', room(3, 3))).toBe('swatch');
});

it('keeps a look chosen at a smaller size for larger ones, until a larger choice takes over', () => {
  const chosen = { '2x2': 'disc', '4x5': 'swatch' };

  expect(resolveLook(chosen, span(1, 1), looks, 'auto', room(1, 1))).toBe('auto');
  expect(resolveLook(chosen, span(3, 3), looks, 'auto', room(3, 3))).toBe('disc');
  expect(resolveLook(chosen, span(4, 5), looks, 'auto', room(4, 5))).toBe('swatch');
  expect(resolveLook(chosen, span(6, 6), looks, 'auto', room(6, 6))).toBe('swatch');
  // 5×4 does not cover 4×5, so the 2×2 choice still holds.
  expect(resolveLook(chosen, span(5, 4), looks, 'auto', room(5, 4))).toBe('disc');
});

it('skips a chosen look that does not fit the size', () => {
  expect(resolveLook({ '1x1': 'wheel' }, span(3, 3), looks, 'swatch', room(3, 3))).toBe('swatch');
});

it('decides a look by the room the part really has, not its cells', () => {
  // A 4×5 choice of the wheel needs 124 by 156 pixels: at 28 px cells it shows, at 20 px cells it does not.
  expect(resolveLook({ '4x5': 'wheel' }, span(4, 5), looks, 'swatch', room(4, 5))).toBe('wheel');
  expect(resolveLook({ '4x5': 'wheel' }, span(4, 5), looks, 'swatch', { width: 92, height: 116 })).toBe('swatch');
});

it('forgets a choice, dropping the empty map', () => {
  const board: Board = {
    panels: [
      {
        id: 'p',
        at: { x: 0, y: 0 },
        parts: [{ id: 'a', kind: 'color', cell: { column: 0, row: 0 }, span: span(2, 2) }]
      }
    ]
  };

  const chosen = chooseLook(board, 'a', span(2, 2), 'disc');
  expect(chosen.panels[0]!.parts[0]!.looks).toEqual({ '2x2': 'disc' });
  expect(chooseLook(chosen, 'a', span(2, 2), undefined).panels[0]!.parts[0]!.looks).toBeUndefined();
});
