import { expect, test } from '@playwright/test';
import {
  CrossBackendHandoffPartialError,
  executeAcknowledgedHandoff
} from '../src/explorer/crossBackendHandoff';

test('never removes the source when a cross-browser destination rejects the import', async () => {
  const calls: string[] = [];

  await expect(
    executeAcknowledgedHandoff(
      async () => {
        calls.push('receive');
        throw new Error('destination rejected');
      },
      async () => {
        calls.push('remove');
      }
    )
  ).rejects.toThrow('destination rejected');

  expect(calls).toEqual(['receive']);
});

test('reports a safe duplicate when source cleanup fails after destination acknowledgement', async () => {
  const calls: string[] = [];

  const operation = executeAcknowledgedHandoff(
    async () => {
      calls.push('receive');
    },
    async () => {
      calls.push('remove');
      throw new Error('source remained open');
    }
  );

  await expect(operation).rejects.toBeInstanceOf(CrossBackendHandoffPartialError);
  await expect(operation).rejects.toMatchObject({ destinationAccepted: true });
  expect(calls).toEqual(['receive', 'remove']);
});
