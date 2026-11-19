import { expect, it } from 'vitest';
import { newPresetName } from './newPresetName';

it('numbers a new brush after the one it comes from, never repeating a name or piling up suffixes', () => {
  expect(newPresetName('Soft round', ['Soft round', 'Eraser'])).toBe('Soft round 2');
  expect(newPresetName('Soft round', ['Soft round', 'Soft round 2', 'Soft round 3'])).toBe('Soft round 4');
  expect(newPresetName('Soft round 2', ['Soft round', 'Soft round 2'])).toBe('Soft round 3');
  expect(newPresetName('Soft round 2', ['Soft round 3', 'Soft round 4'])).toBe('Soft round 5');
  expect(newPresetName(' Ink  ', [])).toBe('Ink 2');
  expect(newPresetName('Brush 9', [])).toBe('Brush 10');
  expect(newPresetName('2', [])).toBe('2 2');
});
