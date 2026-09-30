import { expect, it } from 'vitest';
import { abortedError, checkAborted, errorMessage, gpuError } from './errors';

it('uses Error messages and string message properties of plain error objects', () => {
  expect(errorMessage(new Error('Broken'))).toBe('Broken');
  expect(errorMessage(gpuError('device', 'Device failed'))).toBe('Device failed');
  expect(errorMessage({ message: 'Plain failure' })).toBe('Plain failure');
});

it('stringifies causes without a string message', () => {
  expect(errorMessage('Failed')).toBe('Failed');
  expect(errorMessage(42)).toBe('42');
  expect(errorMessage(null)).toBe('null');
  expect(errorMessage({ message: 1 })).toBe('[object Object]');
});

it('reports cancellation as a typed result', () => {
  expect(checkAborted().isOk()).toBe(true);
  expect(checkAborted(new AbortController().signal).isOk()).toBe(true);
  expect(checkAborted(AbortSignal.abort())._unsafeUnwrapErr()).toEqual(abortedError());
});
