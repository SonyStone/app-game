import { expect, it } from 'vitest';
import { blend, colorName, nameKit } from './kitNames';

const part = (kind: string, columns: number, rows: number) => ({
  id: kind,
  kind,
  cell: { column: 0, row: 0 },
  span: { columns, rows }
});
const label = (kind: string) => ({ 'value:hue': 'Hue', 'color:hex': 'Hex', 'color:wheel': 'Picker' })[kind] ?? 'Brightness';

it('runs two names together into one word', () => {
  expect(blend('Hue', 'Hex')).toBe('Huex');
  expect(blend('Wheel', 'Brightness')).toBe('Wheelness');
});

it('names a color by its hue, or black, white or gray', () => {
  expect(colorName('#d03030')).toBe('Red');
  expect(colorName('#4360a1')).toBe('Blue');
  expect(colorName('#f4f4f4')).toBe('White');
  expect(colorName('#111111')).toBe('Black');
  expect(colorName('#808080')).toBe('Gray');
});

it('names a kit from its parts, shape, color and family, drawn at random', () => {
  const parts = [part('color:hex', 2, 1), part('value:hue', 5, 1)];
  const names = (draws: number[]) => {
    let index = 0;
    return nameKit(parts, { label, color: '#d03030', random: () => draws[index++] ?? 0 });
  };

  // Hue and Hex lie in a 5×2 strip: no shape word; the color part brings the color.
  expect(names([0])).toBe('Huex Red');
  // The series is drawn first (word, then noun), the combination last.
  expect(names([0, 0, 0.99])).toBe('Red Dial Station');
  expect(nameKit([part('color:wheel', 2, 6)], { label, random: () => 0.5 })).toBe('Tall Chroma Studio');
});
