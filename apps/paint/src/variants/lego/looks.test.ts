import { expect, it } from 'vitest';
import type { Board } from './board';
import { chooseLook, resolveLook, type LookSpec } from './looks';

const looks: LookSpec[] = [
  { id: 'swatch', label: 'Swatch', min: { columns: 1, rows: 1 } },
  { id: 'disc', label: 'Disc', min: { columns: 2, rows: 2 } },
  { id: 'wheel', label: 'Wheel', min: { columns: 4, rows: 5 } }
];
const span = (columns: number, rows: number) => ({ columns, rows });

it('shows the automatic look until one is chosen', () => {
  expect(resolveLook(undefined, span(3, 3), looks, 'swatch')).toBe('swatch');
});

it('keeps a look chosen at a smaller size for larger ones, until a larger choice takes over', () => {
  const chosen = { '2x2': 'disc', '4x5': 'swatch' };

  expect(resolveLook(chosen, span(1, 1), looks, 'auto')).toBe('auto');
  expect(resolveLook(chosen, span(3, 3), looks, 'auto')).toBe('disc');
  expect(resolveLook(chosen, span(4, 5), looks, 'auto')).toBe('swatch');
  expect(resolveLook(chosen, span(6, 6), looks, 'auto')).toBe('swatch');
  // 5×4 does not cover 4×5, so the 2×2 choice still holds.
  expect(resolveLook(chosen, span(5, 4), looks, 'auto')).toBe('disc');
});

it('skips a chosen look that does not fit the size', () => {
  expect(resolveLook({ '1x1': 'wheel' }, span(3, 3), looks, 'swatch')).toBe('swatch');
});

it('forgets a choice, dropping the empty map', () => {
  const board: Board = {
    panels: [
      { id: 'p', at: { x: 0, y: 0 }, parts: [{ id: 'a', kind: 'color', cell: { column: 0, row: 0 }, span: span(2, 2) }] }
    ]
  };

  const chosen = chooseLook(board, 'a', span(2, 2), 'disc');
  expect(chosen.panels[0]!.parts[0]!.looks).toEqual({ '2x2': 'disc' });
  expect(chooseLook(chosen, 'a', span(2, 2), undefined).panels[0]!.parts[0]!.looks).toBeUndefined();
});
