import { expect, it } from 'vitest';
import { blend, colorName, nameKit } from './kitNames';

const part = (kind: string, columns: number, rows: number) => ({
  id: kind,
  kind,
  cell: { column: 0, row: 0 },
  span: { columns, rows }
});
const label = (kind: string) =>
  ({ 'value:hue': 'Hue', 'color:hex': 'Hex', 'color:wheel': 'Picker' })[kind] ?? 'Brightness';

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
  // Hue over Hex make a 3×2 block, a shape that does not stand out.
  const parts = [part('color:hex', 2, 1), { ...part('value:hue', 3, 1), cell: { column: 0, row: 1 } }];
  // The series is drawn first (word, then noun), the combination last.
  const named = (choice: number) => {
    const draws = [0, 0, choice];
    let index = 0;
    return nameKit(parts, { label, color: '#d03030', random: () => draws[index++] ?? 0 });
  };

  // The hex brings the color.
  expect(named(0)).toBe('Huex Red');
  expect(named(0.5)).toBe('Hue Dial Station');
  expect(named(0.99)).toBe('Red Hue');
  expect(nameKit([part('color:wheel', 2, 6)], { label, random: () => 0.7 })).toBe('Tall Picker');
});

it('nearly always names a kit after a part it holds', () => {
  const parts = [part('color:wheel', 5, 5), part('preset:eraser', 5, 4)];
  const eraserLabel = (kind: string) => (kind === 'preset:eraser' ? 'Eraser' : 'Picker');
  const names = Array.from({ length: 40 }, (_, index) =>
    nameKit(parts, { label: eraserLabel, color: '#4360a1', random: () => ((index * 7919) % 97) / 97 })
  );

  expect(names.filter((name) => /Picker|Eraser|Pick/.test(name)).length).toBeGreaterThan(30);
  expect(names.some((name) => name.includes('Eraser'))).toBe(true);
});
