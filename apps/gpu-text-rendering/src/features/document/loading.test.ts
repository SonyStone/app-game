import { isWorkerShutdown, workerShutdownGraceMs } from '@app-game/solid-gpu/worker';
import { flush } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { convertPdf, loadDocument, readGdoc } from '../../../tests/browser/workerHarness';
import type { DecodeReply, DecodedDocument } from './format/types';

let workers: WorkerDouble[];

beforeEach(() => {
  workers = [];
  vi.stubGlobal('Worker', WorkerDouble);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('document worker ownership', () => {
  it.each(['gdoc', 'pdf'] as const)('reports %s startup before the worker responds', async (format) => {
    const progress = vi.fn();
    const pending = loadDocument(
      undefined,
      format === 'pdf' ? new File(['%PDF-1.7'], 'file.pdf') : undefined,
      progress
    );
    await vi.waitFor(() => expect(workers).toHaveLength(1));
    flush();
    expect(progress).toHaveBeenCalledWith({ stage: 'loadingDecoder' });
    workers[0]!.dispatchEvent(
      new MessageEvent('message', { data: { progress: { stage: 'processingPages', completed: 1, total: 2 } } })
    );
    flush();
    expect(progress).toHaveBeenCalledWith({ stage: 'processingPages', completed: 1, total: 2 });
    workers[0]!.reply({ ok: true, value: fixture() });
    expect((await pending).isOk()).toBe(true);
  });

  it('lays out decoded pages and shuts its worker down on completion', async () => {
    const pending = loadDocument();
    await vi.waitFor(() => expect(workers).toHaveLength(1));
    const worker = workers[0]!;
    expect(worker.postMessage).toHaveBeenCalledWith(expect.stringContaining('demo.gdoc'), []);
    worker.reply({ ok: true, value: fixture() });
    const document = (await pending)._unsafeUnwrap();
    expect(document.pages[0]).toMatchObject({ width: 612, height: 792, x: -0, y: 0 });
    expect(released(worker)).toBe(true);
  });

  it.each(['http', 'load', 'unsupported-format', 'checksum', 'document-limit', 'invalid-data'] as const)(
    'preserves the typed %s error from the worker',
    async (code) => {
      const pending = loadDocument();
      await vi.waitFor(() => expect(workers).toHaveLength(1));
      workers[0]!.reply({ ok: false, error: { kind: 'document', code, message: 'Details' } });
      expect((await pending)._unsafeUnwrapErr()).toMatchObject({ kind: 'document', code });
      expect(released(workers[0]!)).toBe(true);
    }
  );

  it('does not allocate a worker when already cancelled', async () => {
    expect((await loadDocument(AbortSignal.abort()))._unsafeUnwrapErr().kind).toBe('aborted');
    expect(workers).toHaveLength(0);
  });

  it('shuts active decoding down on cancellation and ignores late messages', async () => {
    const abort = new AbortController();
    const remove = vi.spyOn(abort.signal, 'removeEventListener');
    const pending = loadDocument(abort.signal);
    await vi.waitFor(() => expect(workers).toHaveLength(1));
    abort.abort();
    workers[0]!.reply({ ok: true, value: fixture() });
    expect((await pending)._unsafeUnwrapErr().kind).toBe('aborted');
    expect(released(workers[0]!)).toBe(true);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('cancels only the replaced document session', async () => {
    const abort = new AbortController();
    const previous = loadDocument(abort.signal);
    await vi.waitFor(() => expect(workers).toHaveLength(1));
    const next = loadDocument();
    await vi.waitFor(() => expect(workers).toHaveLength(2));
    abort.abort();
    workers[1]!.reply({ ok: true, value: fixture() });
    expect((await previous).isErr()).toBe(true);
    expect((await next).isOk()).toBe(true);
  });

  it('contains worker construction, posting and execution failures', async () => {
    const pending = loadDocument();
    await vi.waitFor(() => expect(workers).toHaveLength(1));
    const event = new ErrorEvent('error', { message: 'WASM failed', cancelable: true });
    workers[0]!.dispatchEvent(event);
    expect((await pending)._unsafeUnwrapErr()).toMatchObject({ code: 'decode', message: 'WASM failed' });
    expect(event.defaultPrevented).toBe(true);
    expect(released(workers[0]!)).toBe(true);

    vi.stubGlobal(
      'Worker',
      class extends WorkerDouble {
        postMessage = vi.fn(() => {
          throw new Error('Clone');
        });
      }
    );
    expect((await readGdoc(new ArrayBuffer(1)))._unsafeUnwrapErr()).toMatchObject({ code: 'load' });
    expect(released(workers[1]!)).toBe(true);

    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw new Error('Blocked');
        }
      }
    );
    expect((await loadDocument())._unsafeUnwrapErr()).toMatchObject({ code: 'load' });
  });

  it('allows decoding to finish after the former 60-second deadline', async () => {
    vi.useFakeTimers();
    const pending = readGdoc(new ArrayBuffer(1));
    flush();
    await vi.advanceTimersByTimeAsync(180_000);

    expect(released(workers[0]!)).toBe(false);
    workers[0]!.reply({ ok: true, value: fixture() });
    expect((await pending).isOk()).toBe(true);
    expect(released(workers[0]!)).toBe(true);
    await vi.advanceTimersByTimeAsync(workerShutdownGraceMs);
    expect(workers[0]!.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('allows PDF conversion to complete after several minutes', async () => {
    vi.useFakeTimers();
    const pending = convertPdf(new ArrayBuffer(1));
    flush();
    await vi.advanceTimersByTimeAsync(600_000);

    expect(released(workers[0]!)).toBe(false);
    const converted = new ArrayBuffer(8);
    workers[0]!.dispatchEvent(new MessageEvent('message', { data: { ok: true, value: converted } }));
    expect((await pending)._unsafeUnwrap()).toBe(converted);
    expect(released(workers[0]!)).toBe(true);
  });

  it('cancels a long PDF conversion and ignores its late completion', async () => {
    vi.useFakeTimers();
    const abort = new AbortController();
    const remove = vi.spyOn(abort.signal, 'removeEventListener');
    const pending = convertPdf(new ArrayBuffer(1), abort.signal);
    flush();
    await vi.advanceTimersByTimeAsync(180_000);
    abort.abort();
    workers[0]!.dispatchEvent(new MessageEvent('message', { data: { ok: true, value: new ArrayBuffer(8) } }));

    expect((await pending)._unsafeUnwrapErr()).toMatchObject({ kind: 'aborted' });
    expect(released(workers[0]!)).toBe(true);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('consumes supplied bytes through the transfer list', async () => {
    const bytes = new ArrayBuffer(4);
    const pending = readGdoc(bytes);
    flush();
    expect(workers[0]!.postMessage).toHaveBeenCalledWith(bytes, [bytes]);
    workers[0]!.reply({ ok: true, value: fixture() });
    expect((await pending).isOk()).toBe(true);
  });
});

class WorkerDouble extends EventTarget {
  terminate = vi.fn();
  postMessage = vi.fn();

  constructor() {
    super();
    workers.push(this);
  }

  reply(data: DecodeReply) {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
}

/** Cooperative shutdown posts a control message; terminate() alone means the message could not be sent. */
function released(worker: WorkerDouble) {
  return (
    worker.postMessage.mock.calls.some(([message]) => isWorkerShutdown(message)) ||
    worker.terminate.mock.calls.length > 0
  );
}

function fixture(): DecodedDocument {
  return {
    pages: [{ width: 612, height: 792, beginVertex: 0, endVertex: 6 }],
    kind: 'glyphs',
    glyphVertices: new ArrayBuffer(72),
    positions: { x: new Float32Array(1), y: new Float32Array(1) },
    atlas: { buf: new ArrayBuffer(16), width: 4, height: 1 },
    atlasVertices: { buf: new ArrayBuffer(72), width: 1, height: 1 }
  };
}
