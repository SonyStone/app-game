import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadDocument } from './document';
import { readGdoc } from './format/readGdoc';
import type { DecodeReply, DecodedDocument } from './format/types';
import { convertPdf } from './pdf/convertPdf';

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
  it('lays out decoded pages and terminates its worker on completion', async () => {
    const pending = loadDocument();
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
    abort.abort();
    workers[0]!.reply({ ok: true, value: fixture() });
    expect((await pending)._unsafeUnwrapErr().kind).toBe('aborted');
    expect(workers[0]!.terminate).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('cancels only the replaced document session', async () => {
    const abort = new AbortController();
    const previous = loadDocument(abort.signal);
    const next = loadDocument();
    abort.abort();
    workers[1]!.reply({ ok: true, value: fixture() });
    expect((await previous).isErr()).toBe(true);
    expect((await next).isOk()).toBe(true);
  });

  it('contains worker construction, posting and execution failures', async () => {
    const pending = loadDocument();
    const preventDefault = vi.fn();
    workers[0]!.onerror?.({ message: 'WASM failed', preventDefault } as unknown as ErrorEvent);
    expect((await pending)._unsafeUnwrapErr()).toMatchObject({ code: 'decode', message: 'WASM failed' });
    expect(preventDefault).toHaveBeenCalledOnce();
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
    await vi.advanceTimersByTimeAsync(600_000);

    expect(workers[0]!.terminate).not.toHaveBeenCalled();
    const converted = new ArrayBuffer(8);
    workers[0]!.onmessage?.({ data: { ok: true, value: converted } } as MessageEvent);
    expect((await pending)._unsafeUnwrap()).toBe(converted);
    expect(workers[0]!.terminate).toHaveBeenCalledOnce();
  });

  it('cancels a long PDF conversion and ignores its late completion', async () => {
    vi.useFakeTimers();
    const abort = new AbortController();
    const remove = vi.spyOn(abort.signal, 'removeEventListener');
    const pending = convertPdf(new ArrayBuffer(1), abort.signal);
    await vi.advanceTimersByTimeAsync(180_000);
    abort.abort();
    workers[0]!.onmessage?.({ data: { ok: true, value: new ArrayBuffer(8) } } as MessageEvent);

    expect((await pending)._unsafeUnwrapErr()).toMatchObject({ kind: 'aborted' });
    expect(workers[0]!.terminate).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('consumes supplied bytes through the transfer list', async () => {
    const bytes = new ArrayBuffer(4);
    const pending = readGdoc(bytes);
    expect(workers[0]!.postMessage).toHaveBeenCalledWith(bytes, [bytes]);
    workers[0]!.reply({ ok: true, value: fixture() });
    expect((await pending).isOk()).toBe(true);
  });
});

class WorkerDouble {
  onmessage?: (event: MessageEvent<DecodeReply>) => void;
  onerror?: (event: ErrorEvent) => void;
  onmessageerror?: () => void;
  terminate = vi.fn();
  postMessage = vi.fn();

  constructor() {
    workers.push(this);
  }

  reply(data: DecodeReply) {
    this.onmessage?.({ data } as MessageEvent<DecodeReply>);
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
