import { expect, it } from 'vitest';
import { documentError, errorMessage } from './errors';

it('uses Error messages and string message properties of plain error objects', () => {
  expect(errorMessage(new Error('Broken'))).toBe('Broken');
  expect(errorMessage(documentError('decode', 'Invalid document'))).toBe('Invalid document');
  expect(errorMessage({ message: 'Plain failure' })).toBe('Plain failure');
});

it('stringifies causes without a string message', () => {
  expect(errorMessage('Failed')).toBe('Failed');
  expect(errorMessage(42)).toBe('42');
  expect(errorMessage(null)).toBe('null');
  expect(errorMessage({ message: 1 })).toBe('[object Object]');
});
