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

  it('lays out decoded pages and terminates its worker on completion', async () => {
    const pending = loadDocument();
    await vi.waitFor(() => expect(workers).toHaveLength(1));
    const worker = workers[0]!;
    expect(worker.postMessage).toHaveBeenCalledWith(expect.stringContaining('demo.gdoc'), []);
    worker.reply({ ok: true, value: fixture() });
    const document = (await pending)._unsafeUnwrap();
    expect(document.pages[0]).toMatchObject({ width: 612, height: 792, x: -0, y: 0 });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it.each(['http', 'load', 'unsupported-format', 'checksum', 'document-limit', 'invalid-data'] as const)(
    'preserves the typed %s error from the worker',
    async (code) => {
      const pending = loadDocument();
      await vi.waitFor(() => expect(workers).toHaveLength(1));
      workers[0]!.reply({ ok: false, error: { kind: 'document', code, message: 'Details' } });
      expect((await pending)._unsafeUnwrapErr()).toMatchObject({ kind: 'document', code });
      expect(workers[0]!.terminate).toHaveBeenCalledOnce();
    }
  );

  it('does not allocate a worker when already cancelled', async () => {
    expect((await loadDocument(AbortSignal.abort()))._unsafeUnwrapErr().kind).toBe('aborted');
    expect(workers).toHaveLength(0);
  });

  it('terminates active decoding on cancellation and ignores late messages', async () => {
    const abort = new AbortController();
    const remove = vi.spyOn(abort.signal, 'removeEventListener');
    const pending = loadDocument(abort.signal);
    await vi.waitFor(() => expect(workers).toHaveLength(1));
    abort.abort();
    workers[0]!.reply({ ok: true, value: fixture() });
    expect((await pending)._unsafeUnwrapErr().kind).toBe('aborted');
    expect(workers[0]!.terminate).toHaveBeenCalledOnce();
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
    expect(workers[0]!.terminate).toHaveBeenCalledOnce();

    vi.stubGlobal(
      'Worker',
      class extends WorkerDouble {
        postMessage = vi.fn(() => {
          throw new Error('Clone');
        });
      }
    );
    expect((await readGdoc(new ArrayBuffer(1)))._unsafeUnwrapErr()).toMatchObject({ code: 'load' });
    expect(workers[1]!.terminate).toHaveBeenCalledOnce();

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

    expect(workers[0]!.terminate).not.toHaveBeenCalled();
    workers[0]!.reply({ ok: true, value: fixture() });
    expect((await pending).isOk()).toBe(true);
    expect(workers[0]!.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('allows PDF conversion to complete after several minutes', async () => {
    vi.useFakeTimers();
    const pending = convertPdf(new ArrayBuffer(1));
    flush();
    await vi.advanceTimersByTimeAsync(600_000);

    expect(workers[0]!.terminate).not.toHaveBeenCalled();
    const converted = new ArrayBuffer(8);
    workers[0]!.dispatchEvent(new MessageEvent('message', { data: { ok: true, value: converted } }));
    expect((await pending)._unsafeUnwrap()).toBe(converted);
    expect(workers[0]!.terminate).toHaveBeenCalledOnce();
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
    expect(workers[0]!.terminate).toHaveBeenCalledOnce();
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

function fixture(): DecodedDocument {
  return {
    pages: [{ width: 612, height: 792, beginVertex: 0, endVertex: 6, images: [] }],
    kind: 'glyphs',
    glyphVertices: new ArrayBuffer(72),
    positions: { x: new Float32Array(1), y: new Float32Array(1) },
    atlas: { buf: new ArrayBuffer(16), width: 4, height: 1 },
    atlasVertices: { buf: new ArrayBuffer(72), width: 1, height: 1 }
  };
}
