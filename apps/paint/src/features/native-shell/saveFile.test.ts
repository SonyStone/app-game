// @vitest-environment jsdom
import { err, ok } from 'neverthrow';
import { expect, it } from 'vitest';
import { saveFile } from './saveFile';
import { NativeShellError, type NativeShellClient } from './shellClient';

/** A shell that saves into `chunks`, failing the chunk call numbered `failAt` (1-based) if given. */
function fakeShell(failAt?: number) {
  const calls: { method: string; params: Record<string, string> }[] = [];
  let chunk = 0;
  const client = {
    request: (method: string, params: Record<string, string>) => {
      calls.push({ method, params });
      if (method === 'saveBegin') {
        return Promise.resolve(ok({ id: 'save-1' }));
      }

      if (method === 'saveChunk' && ++chunk === failAt) {
        return Promise.resolve(err(new NativeShellError('failed', 'disk full')));
      }

      return Promise.resolve(ok(method === 'saveEnd' ? { name: 'a.png', uri: 'content://a' } : {}));
    }
  } as unknown as NativeShellClient;
  return { client, calls };
}

it('streams a file to the shell in chunks and finishes it', async () => {
  const bytes = new Uint8Array((1 << 20) + 3).map((_, index) => index % 251);
  const shell = fakeShell();

  await saveFile(new Blob([bytes], { type: 'image/png' }), 'a.png', shell.client);

  expect(shell.calls.map((call) => call.method)).toEqual(['saveBegin', 'saveChunk', 'saveChunk', 'saveEnd']);
  expect(shell.calls[0]!.params).toEqual({ name: 'a.png', mime: 'image/png' });
  const sent = shell.calls
    .filter((call) => call.method === 'saveChunk')
    .flatMap((call) => [...atob(call.params.data!)].map((char) => char.charCodeAt(0)));
  expect(sent).toEqual([...bytes]);
});

it('drops a file the shell failed to write and reports the failure', async () => {
  const shell = fakeShell(1);

  await expect(saveFile(new Blob([new Uint8Array(10)]), 'b.psd', shell.client)).rejects.toMatchObject({
    code: 'failed'
  });
  expect(shell.calls.map((call) => call.method)).toEqual(['saveBegin', 'saveChunk', 'saveCancel']);
});
