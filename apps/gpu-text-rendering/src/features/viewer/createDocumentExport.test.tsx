import type { AbortedError } from '@app-game/solid-gpu/errors';
import { runWorkerRequest } from '@app-game/solid-gpu/worker';
import { render } from '@solidjs/web';
import { errAsync, ok, okAsync, ResultAsync } from 'neverthrow';
import { createSignal, flush } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { downloadFile } from '../../shared/downloadFile';
import { documentError, type DocumentError } from '../../shared/errors';
import type { PreparedDocument } from '../document/createDocumentSource';
import type { TextDocument } from '../document/document';
import { createDocumentExport } from './createDocumentExport';

vi.mock('@app-game/solid-gpu/worker/runWorkerRequest', () => ({ runWorkerRequest: vi.fn() }));

vi.mock('../../shared/downloadFile', () => ({ downloadFile: vi.fn() }));

const cleanups: (() => void)[] = [];
beforeEach(() => {
  vi.mocked(downloadFile).mockClear();
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:export');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(() => {
  cleanups.splice(0).forEach((dispose) => dispose());
  vi.restoreAllMocks();
});

it('converts only after a click, reuses the file for later downloads and releases the URL on disposal', async () => {
  const convert = vi.fn<Convert>(() => okAsync(new ArrayBuffer(4)));
  const session = setup(convert);
  expect(convert).not.toHaveBeenCalled();
  const saving = session.output.save();
  await session.output.save();
  flush();
  expect(session.output.pending()).toBe(true);
  expect((await saving).isOk()).toBe(true);
  flush();
  expect(session.output.pending()).toBe(false);
  expect(downloadFile).toHaveBeenCalledOnce();
  await session.output.save();
  expect(downloadFile).toHaveBeenCalledTimes(2);
  expect(convert).toHaveBeenCalledOnce();
  expect(URL.createObjectURL).toHaveBeenCalledOnce();
  expect(downloadFile).toHaveBeenCalledWith('blob:export', 'document.gdoc');
  session.dispose();
  expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
});

it('reacts to abort without replacing the accessor input', async () => {
  const file = new File(['pdf'], 'document.pdf');
  const read = vi.spyOn(FileReader.prototype, 'readAsArrayBuffer');
  const abortRead = vi.spyOn(FileReader.prototype, 'abort');
  const convert = vi.fn<Convert>();
  const session = setup(convert, file);
  const saving = session.output.save();
  flush();
  expect(session.output.pending()).toBe(true);

  session.abort();
  flush();
  expect(session.output.available()).toBe(false);
  expect(session.output.pending()).toBe(false);
  expect(session.output.error()).toBeUndefined();

  expect((await saving).isOk()).toBe(true);
  await session.output.save();
  expect(convert).not.toHaveBeenCalled();
  expect(downloadFile).not.toHaveBeenCalled();
  expect(read).toHaveBeenCalledOnce();
  expect(abortRead).toHaveBeenCalledOnce();
});

it('releases a fixed document download on abort and stays unavailable', async () => {
  const convert = vi.fn<Convert>(() => okAsync(new ArrayBuffer(4)));
  const session = setup(convert, new File(['pdf'], 'document.pdf'));
  await session.output.save();
  session.abort();
  flush();
  expect(session.output.available()).toBe(false);
  expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:export');
  await session.output.save();
  expect(downloadFile).toHaveBeenCalledOnce();
  session.dispose();
  expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
});

it('disables saving while no prepared document is available', async () => {
  const convert = vi.fn<Convert>(() => okAsync(new ArrayBuffer(4)));
  const session = setup(convert);
  session.select(undefined);
  flush();
  expect(session.output.available()).toBe(false);
  expect((await session.output.save()).isOk()).toBe(true);
  expect(convert).not.toHaveBeenCalled();
  session.select(new File(['pdf'], 'next.pdf'));
  flush();
  await session.output.save();
  expect(downloadFile).toHaveBeenCalledWith('blob:export', 'next.gdoc');
});

it('ignores a disposed export while another session remains pending', async () => {
  const old = deferred();
  const current = deferred();
  const convertOld = vi.fn(() => new ResultAsync(old.promise));
  const first = setup(convertOld);
  first.output.save();
  await vi.waitFor(() => expect(convertOld).toHaveBeenCalledOnce());
  first.dispose();
  const convertCurrent = vi.fn(() => new ResultAsync(current.promise));
  const second = setup(convertCurrent);
  second.output.save();
  await vi.waitFor(() => expect(convertCurrent).toHaveBeenCalledOnce());
  old.resolve(ok(new ArrayBuffer(4)));
  await settle();
  expect(second.output.pending()).toBe(true);
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(downloadFile).not.toHaveBeenCalled();
  current.resolve(ok(new ArrayBuffer(4)));
  await vi.waitFor(() => expect(downloadFile).toHaveBeenCalledOnce());
});

it('reports conversion errors and retries with fresh source bytes', async () => {
  const failure = documentError('unsupported-pdf', 'Cannot export');
  const convert = vi
    .fn<Convert>()
    .mockReturnValueOnce(errAsync(failure))
    .mockReturnValueOnce(okAsync(new ArrayBuffer(4)));
  const session = setup(convert);
  const result = await session.output.save();
  expect(result.isErr() && result.error).toBe(failure);
  await vi.waitFor(() => expect(session.output.error()).toBe('Cannot export'));
  expect(vi.mocked(downloadFile).mock.calls).toHaveLength(0);
  session.output.save();
  await vi.waitFor(() => expect(vi.mocked(downloadFile).mock.calls).toHaveLength(1));
  expect(session.output.error()).toBeUndefined();
  expect(convert).toHaveBeenCalledTimes(2);
  expect(convert.mock.calls[0]![0]).not.toBe(convert.mock.calls[1]![0]);
});

it('reports file-read failures without starting conversion', async () => {
  const file = new File(['pdf'], 'document.pdf');
  vi.spyOn(FileReader.prototype, 'readAsArrayBuffer').mockImplementationOnce(() => {
    throw new Error('Read failed');
  });
  const convert = vi.fn<Convert>();
  const session = setup(convert, file);
  const result = await session.output.save();
  expect(result.isErr() && result.error).toMatchObject({ kind: 'document', code: 'load', message: 'Read failed' });
  await vi.waitFor(() => expect(session.output.error()).toBe('Read failed'));
  expect(convert).not.toHaveBeenCalled();
  session.output.dismissError();
  flush();
  expect(session.output.error()).toBeUndefined();
});

it('does not start conversion when disposed during the file read', async () => {
  const file = new File(['pdf'], 'document.pdf');
  const read = vi.spyOn(FileReader.prototype, 'readAsArrayBuffer');
  const abortRead = vi.spyOn(FileReader.prototype, 'abort');
  const convert = vi.fn<Convert>();
  const session = setup(convert, file);
  const saving = session.output.save();
  session.dispose();
  expect((await saving).isOk()).toBe(true);
  await session.output.save();
  expect(read).toHaveBeenCalledOnce();
  expect(abortRead).toHaveBeenCalledOnce();
  expect(convert).not.toHaveBeenCalled();
  expect(downloadFile).not.toHaveBeenCalled();
});

it.each(['throw', 'reject'] as const)('handles an unexpected conversion %s and allows retry', async (failure) => {
  const convert = vi
    .fn<Convert>()
    .mockImplementationOnce(() => {
      if (failure === 'throw') {
        throw new Error('Unexpected failure');
      }

      return new ResultAsync(Promise.reject(new Error('Unexpected failure')));
    })
    .mockReturnValueOnce(okAsync(new ArrayBuffer(4)));
  const session = setup(convert);
  const result = await session.output.save();
  expect(result.isErr() && result.error).toMatchObject({ kind: 'document', message: 'Unexpected failure' });
  flush();
  expect(session.output.error()).toBe('Unexpected failure');
  expect(session.output.pending()).toBe(false);
  expect(downloadFile).not.toHaveBeenCalled();
  await session.output.save();
  flush();
  expect(session.output.error()).toBeUndefined();
  expect(downloadFile).toHaveBeenCalledOnce();
});

it('releases cached downloads when the source changes and hides export for GDOC', async () => {
  const convert = vi.fn<Convert>(() => okAsync(new ArrayBuffer(4)));
  const session = setup(convert);
  await session.output.save();
  session.select(new File(['gdoc'], 'next.gdoc'));
  flush();
  expect(session.current()).toBeUndefined();
  expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  await session.output.save();
  expect(convert).toHaveBeenCalledOnce();
});

it.each(['cancel', 'fail'] as const)('suppresses a conversion completed after source %s', async (stop) => {
  const conversion = deferred();
  const convert = vi.fn(() => new ResultAsync(conversion.promise));
  const session = setup(convert);
  const saving = session.output.save();
  await vi.waitFor(() => expect(convert).toHaveBeenCalledOnce());
  session[stop]();
  conversion.resolve(ok(new ArrayBuffer(4)));
  await saving;
  flush();
  expect(session.current()).toBeUndefined();
  expect(session.cancelled).toHaveBeenCalled();
  expect(downloadFile).not.toHaveBeenCalled();
});

type Convert = (bytes: ArrayBuffer) => ResultAsync<ArrayBuffer, DocumentError | AbortedError>;

function setup(convert: Convert, file = new File(['pdf'], 'document.pdf')) {
  let output!: ReturnType<typeof createDocumentExport>;
  let select!: (file?: File) => void;
  let cancel!: () => void;
  let fail!: () => void;
  const cancelled = vi.fn();
  const controller = new AbortController();
  vi.mocked(runWorkerRequest).mockImplementation(async (_create, bytes, { signal }) => {
    signal.addEventListener('abort', cancelled, { once: true });
    return await convert(bytes as ArrayBuffer);
  });
  const dispose = render(() => {
    const [document, setDocument] = createSignal<PreparedDocument | undefined>(prepared(file));
    output = createDocumentExport(document);
    select = (file) => setDocument(file ? prepared(file) : undefined);
    cancel = () => {
      controller.abort();
      setDocument(undefined);
    };
    fail = () => {
      controller.abort();
      setDocument(undefined);
    };
    return null;
  }, document.createElement('div'));
  cleanups.push(dispose);
  flush();
  return {
    output,
    current: () => (output.available() ? output : undefined),
    dispose,
    select,
    cancel,
    fail,
    abort: () => controller.abort(),
    cancelled
  };

  function prepared(file: File): PreparedDocument {
    return {
      data: {
        kind: 'glyphs',
        pages: [],
        positions: { x: new Float32Array(), y: new Float32Array() },
        glyphVertices: new ArrayBuffer(0),
        atlas: { buf: new ArrayBuffer(0), width: 1, height: 1 },
        atlasVertices: { buf: new ArrayBuffer(0), width: 1, height: 1 }
      } satisfies TextDocument,
      format: file.name.endsWith('.gdoc') ? 'gdoc' : 'pdf',
      file,
      signal: controller.signal,
      fail: () => null
    };
  }
}

function deferred() {
  let resolve!: (value: Awaited<ReturnType<Convert>>) => void;
  const promise = new Promise<Awaited<ReturnType<Convert>>>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function settle() {
  for (let i = 0; i < 30; i++) {
    await Promise.resolve();
    flush();
  }
}
