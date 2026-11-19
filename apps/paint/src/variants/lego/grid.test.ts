import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { frameAt, nearestCell, spanAfter, type Part } from './board';
import { createGrid } from './grid';
import { lookOf } from './parts';

it.each([44, 32])('round trips cells, snaps a resize and frames a plate at %i px', (cell) => {
  const grid = createGrid(() => cell);
  const part: Part = { id: 'wheel', kind: 'color:wheel', cell: { column: 2, row: -1 }, span: { columns: 4, rows: 2 } };
  const origin = { x: 12, y: 25 };
  const frame = frameAt(grid.pitch(), { id: 'plate', at: origin, parts: [part] }, origin);
  expect(frame.rect.width).toBe(4 * cell + 3 * 4 + 12);
  expect(frame.rect.height).toBe(2 * cell + 4 + 12);
  expect(nearestCell(grid.pitch(), origin, { x: frame.rect.left + 6, y: frame.rect.top + 6 })).toEqual(part.cell);
  expect(spanAfter(grid.pitch(), part.span, { x: grid.pitch() * 0.51, y: -grid.pitch() * 0.49 })).toEqual({
    columns: 5,
    rows: 2
  });
});

it('uses the 28 px default for an absent or invalid host size', () => {
  for (const size of [undefined, 0, -8, NaN, Infinity]) {
    expect(createGrid(() => size).cell()).toBe(28);
  }
});

it('measures a part in pixels and finds the least span for a room at any cell size', () => {
  const grid = createGrid(() => 28);
  expect(grid.room({ columns: 4, rows: 1 })).toEqual({ width: 124, height: 28 });
  expect(grid.minimumSpan({ width: 140, height: 0 })).toEqual({ columns: 5, rows: 1 });
  expect(grid.minimumSpan({ width: 124, height: 28 })).toEqual({ columns: 4, rows: 1 });
  expect(createGrid(() => 44).minimumSpan({ width: 140, height: 140 })).toEqual({ columns: 3, rows: 3 });
});

it('keeps a four-cell look choice until its controls fit again', () => {
  const part = { kind: 'color:wheel', span: { columns: 4, rows: 4 }, looks: { '4x4': 'coolorus' } };
  for (const [cell, expected] of [
    [44, 'coolorus'],
    [32, 'disc'],
    [44, 'coolorus']
  ] as const) {
    expect(lookOf(part, createGrid(() => cell).room(part.span))).toBe(expected);
  }
});

it('keeps reference cell and pitch literals out of editor geometry', () => {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const files = readdirSync(here, { recursive: true, encoding: 'utf8' }).filter(
    (name) => /\.(css|tsx?)$/.test(name) && !name.includes('.test.')
  );
  const offenders = files.flatMap((name) => {
    const source = readFileSync(here + name, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    // RGB channels, the reference declaration, pressure-graph sampling and the rooms in CSS pixels that looks need,
    // whatever the cell, are independent of the grid's cells.
    const code = source
      .replace(/rgba?\([^)]*\)/g, '')
      .replace(/\{ width: \d+, height: \d+ \}/g, '')
      .replace('const referenceCell = 44;', '')
      .replace('width: 236, Picker: Triangle', '')
      .replace('const pictureSamples = 48;', '');
    // Captions follow their text, not the cell size (see `textFit.ts`).
    return /(?<![\w.#])(?:(?:44|48|92|140|188|236|284)(?:px)?|(?:36|40)px)\b|cell\(\) >= referenceCell/.test(code)
      ? [name]
      : [];
  });
  expect(offenders).toEqual([]);
});
