import { expect, it } from 'vitest';
import { mergeSimilar } from './mergeSimilar';

it('adds distinct colors at the front', () => {
  expect(mergeSimilar([], '#c8553d')).toEqual(['#c8553d']);
  expect(mergeSimilar(['#c8553d', '#3d6a8c'], '#ffffff')).toEqual(['#ffffff', '#c8553d', '#3d6a8c']);
});

it('moves an earlier, nearly identical color to the front instead of adding the new one', () => {
  expect(mergeSimilar(['#ffffff', '#c8553d', '#3d6a8c'], '#c9563e')).toEqual(['#c8553d', '#ffffff', '#3d6a8c']);
  expect(mergeSimilar(['#ffffff', '#c8553d'], '#c8553d')).toEqual(['#c8553d', '#ffffff']);
});

it('takes the threshold as a CIE76 difference', () => {
  expect(mergeSimilar(['#c8553d'], '#d0603f')).toHaveLength(2);
  expect(mergeSimilar(['#c8553d'], '#d0603f', 20)).toEqual(['#c8553d']);
  expect(mergeSimilar(['#c8553d'], '#c9563e', 0)).toEqual(['#c9563e', '#c8553d']);
});
