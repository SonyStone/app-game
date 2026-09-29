import { render } from '@solidjs/web';
import { errAsync, ok, okAsync, ResultAsync } from 'neverthrow';
import { createRoot, createSignal, flush, Show } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DocumentSource } from '../../../tests/fixtures/DocumentSource';
import type { AbortedError, DocumentError } from '../../shared/errors';
import { documentError } from '../../shared/errors';
import { runWorkerRequest } from '../../shared/worker/runWorkerRequest';
import type { createDocumentExport } from '../viewer/createDocumentExport';
import { createDocumentSource } from './createDocumentSource';
import type { TextDocument } from './document';
import type { DecodedDocument } from './format/types';
import ConvertWorker from './pdf/convert.worker?worker';
import ImportWorker from './pdf/import.worker?worker';

vi.mock('../../shared/worker/runWorkerRequest', () => ({ runWorkerRequest: vi.fn() }));
vi.mock('./pdf/import.worker?worker', () => ({ default: class ImportWorker {} }));
vi.mock('./pdf/convert.worker?worker', () => ({ default: class ConvertWorker {} }));
vi.mock('./format/decode.worker?worker', () => ({ default: class DecodeWorker {} }));
const readGdoc = vi.fn<(input: string | ArrayBuffer) => ResultAsync<DecodedDocument, DocumentError | AbortedError>>();
const importPdf = vi.fn<(input: ArrayBuffer) => ResultAsync<DecodedDocument, DocumentError | AbortedError>>();
const convertPdf = vi.fn<(input: ArrayBuffer) => ResultAsync<ArrayBuffer, DocumentError | AbortedError>>();
const cleanups: (() => void)[] = [];

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:export');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  vi.mocked(runWorkerRequest).mockImplementation(async (create, input) => {
    const worker: unknown = create();
    if (worker instanceof ImportWorker) return await importPdf(input as ArrayBuffer);
    if (worker instanceof ConvertWorker) return await convertPdf(input as ArrayBuffer);
    return await readGdoc(input as string | ArrayBuffer);
  });
});
afterEach(() => {
  cleanups.splice(0).forEach((dispose) => dispose());
  vi.restoreAllMocks();
});

it.each([undefined, new File(['GDOC\r\n\x1a\n'], 'direct.gdoc')])(
  'accepts a fixed file or demo value and cancels it without an accessor',
  async (file) => {
    readGdoc.mockReturnValue(okAsync(scene()));
    const source = createRoot((dispose) => {
      cleanups.push(dispose);
      return createDocumentSource(file);
    });
    await vi.waitFor(() => expect(source.ready()).toBe(true));
    const document = source.prepared()!;
    expect(document.file).toBe(file);
    expect(document.signal.aborted).toBe(false);
    source.cancel();
    flush();
    expect(document.signal.aborted).toBe(true);
    expect(source.active()).toBe(false);
    expect(source.ready()).toBe(false);
    expect(source.prepared()).toBeUndefined();
    expect(source.error()).toBeUndefined();
    expect(readGdoc).toHaveBeenCalledOnce();
  }
);

it('renders progress and cancellation while a replacement document is pending', async () => {
  readGdoc.mockReturnValue(okAsync(scene()));
  let complete!: (result: Awaited<ReturnType<typeof importPdf>>) => void;
  importPdf.mockReturnValue(
    new ResultAsync(
      new Promise((resolve) => {
        complete = resolve;
      })
    )
  );
  const host = document.createElement('div');
  let source!: ReturnType<typeof createDocumentSource>;
  let select!: (file: File) => void;
  cleanups.push(
    render(() => {
      const [file, setFile] = createSignal<File>();
      select = setFile;
      source = createDocumentSource(file);
      return (
        <>
          <output>{!source.active() ? 'cancelled' : source.ready() ? 'ready' : source.progress()?.stage}</output>
          <span>{source.prepared() ? 'document' : ''}</span>
        </>
      );
    }, host)
  );
  await vi.waitFor(() => expect(host.querySelector('output')?.textContent).toBe('ready'));
  select(new File(['%PDF-1.7'], 'pending.pdf'));
  await vi.waitFor(() => expect(importPdf).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(host.querySelector('output')?.textContent).toBe('loadingDecoder'));
  source.cancel();
  flush();
  expect(host.querySelector('output')?.textContent).toBe('cancelled');
  complete(ok(scene()));
});

it('imports PDF, lays out pages and offers export only after a valid document is ready', async () => {
  importPdf.mockReturnValue(okAsync(scene()));
  convertPdf.mockReturnValue(okAsync(new TextEncoder().encode('GDOC result').buffer));
  const session = mount(new File(['%PDF-1.7'], 'example.pdf'));
  await vi.waitFor(() => expect(session.loaded).toHaveBeenCalledOnce());
  expect(readGdoc).not.toHaveBeenCalled();
  expect(convertPdf).not.toHaveBeenCalled();
  expect(session.loaded.mock.calls[0]![0].pages[0]).toMatchObject({ x: -0, y: 0 });
  session.converted.mock.calls[0]![0].save();
  await vi.waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce());
  const file = vi.mocked(URL.createObjectURL).mock.calls[0]![0] as File;
  expect(file.name).toBe('example.gdoc');
  expect(await file.text()).toBe('GDOC result');
});

it('decodes GDOC without offering PDF export', async () => {
  readGdoc.mockReturnValue(okAsync(scene()));
  const session = mount(new File(['GDOC\r\n\x1a\n'], 'example.pdf'));
  await vi.waitFor(() => expect(session.loaded).toHaveBeenCalledOnce());
  expect(importPdf).not.toHaveBeenCalled();
  expect(session.converted).not.toHaveBeenCalled();
});

it('ignores an import that finishes after disposal', async () => {
  let complete!: (value: Awaited<ReturnType<typeof importPdf>>) => void;
  importPdf.mockReturnValue(
    new ResultAsync(
      new Promise((resolve) => {
        complete = resolve;
      })
    )
  );
  const session = mount(new File(['%PDF-1.7'], 'example.pdf'));
  await vi.waitFor(() => expect(importPdf).toHaveBeenCalledOnce());
  session.dispose();
  complete(ok(scene()));
  await Promise.resolve();
  flush();
  expect(session.loaded).not.toHaveBeenCalled();
  expect(session.converted).not.toHaveBeenCalled();
});

it.each(['decode', 'layout'] as const)(
  'stops at a %s failure without publishing a document or export',
  async (stage) => {
    importPdf.mockReturnValue(
      stage === 'decode'
        ? errAsync(documentError('unsupported-pdf', 'Unsupported PDF'))
        : okAsync({ ...scene(), pages: [] })
    );
    const session = mount(new File(['%PDF-1.7'], 'example.pdf'));
    await vi.waitFor(() => expect(session.error).toHaveBeenCalledOnce());
    expect(session.loaded).not.toHaveBeenCalled();
    expect(session.converted).not.toHaveBeenCalled();
  }
);

it('does not start an export after disposal', async () => {
  importPdf.mockReturnValue(okAsync(scene()));
  const session = mount(new File(['%PDF-1.7'], 'example.pdf'));
  await vi.waitFor(() => expect(session.converted).toHaveBeenCalledOnce());
  session.dispose();
  session.converted.mock.calls[0]![0].save();
  flush();
  expect(convertPdf).not.toHaveBeenCalled();
});

it('unmounts the ready branch on downstream failure and reports it once', async () => {
  readGdoc.mockReturnValue(okAsync(scene()));
  const session = mount(new File(['GDOC\r\n\x1a\n'], 'example.gdoc'));
  await vi.waitFor(() => expect(session.loaded).toHaveBeenCalledOnce());
  const [, fail] = session.children.mock.calls[0]!;
  fail(documentError('decode', 'Downstream failure'));
  flush();
  fail(documentError('decode', 'Late failure'));
  expect(session.error).toHaveBeenCalledOnce();
});

it('replaces a pending file and ignores its late result and captured failure handler', async () => {
  let complete!: (value: Awaited<ReturnType<typeof readGdoc>>) => void;
  readGdoc
    .mockReturnValueOnce(
      new ResultAsync(
        new Promise((resolve) => {
          complete = resolve;
        })
      )
    )
    .mockReturnValueOnce(okAsync(scene()));
  const session = mountReactive();
  await vi.waitFor(() => expect(readGdoc).toHaveBeenCalledOnce());
  const oldFail = session.source.fail;
  session.select(new File(['GDOC\r\n\x1a\n'], 'replacement.gdoc'));
  await vi.waitFor(() => expect(session.ready).toHaveBeenCalledOnce());
  expect(session.cancelled).toHaveBeenCalledOnce();
  complete(ok(scene()));
  oldFail(documentError('decode', 'Late error'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  flush();
  expect(session.ready).toHaveBeenCalledOnce();
  expect(session.source.error()).toBeUndefined();
});

it('cancels without changing the selection and loads the next selection', async () => {
  readGdoc.mockImplementation(() => okAsync(scene()));
  const session = mountReactive();
  await vi.waitFor(() => expect(session.ready).toHaveBeenCalledOnce());
  session.source.cancel();
  flush();
  expect(session.source.active()).toBe(false);
  expect(session.source.prepared()).toBeUndefined();
  expect(session.cancelled).toHaveBeenCalledOnce();
  expect(readGdoc).toHaveBeenCalledOnce();
  session.select(new File(['GDOC\r\n\x1a\n'], 'next.gdoc'));
  await vi.waitFor(() => expect(session.ready).toHaveBeenCalledTimes(2));
  expect(readGdoc).toHaveBeenCalledTimes(2);
  expect(readGdoc.mock.calls[1]![0]).toBeInstanceOf(ArrayBuffer);
});

it('ignores late completion after cancel and restarts when the demo is selected again', async () => {
  let complete!: (value: Awaited<ReturnType<typeof readGdoc>>) => void;
  readGdoc
    .mockReturnValueOnce(
      new ResultAsync(
        new Promise((resolve) => {
          complete = resolve;
        })
      )
    )
    .mockReturnValueOnce(okAsync(scene()));
  const session = mountReactive();
  await vi.waitFor(() => expect(readGdoc).toHaveBeenCalledOnce());
  session.source.cancel();
  flush();
  complete(ok(scene()));
  await new Promise((resolve) => setTimeout(resolve, 0));
  flush();
  expect(session.source.active()).toBe(false);
  expect(session.source.prepared()).toBeUndefined();
  expect(session.ready).not.toHaveBeenCalled();
  expect(readGdoc).toHaveBeenCalledOnce();
  session.select(undefined);
  await vi.waitFor(() => expect(session.ready).toHaveBeenCalledOnce());
  expect(session.source.active()).toBe(true);
  expect(readGdoc).toHaveBeenCalledTimes(2);
  expect(readGdoc.mock.calls[1]![0]).toEqual(expect.stringContaining('demo.gdoc'));
});

it('clears a failed file’s error and loads the next selection', async () => {
  const failure = documentError('decode', 'Invalid document');
  readGdoc.mockReturnValueOnce(errAsync(failure)).mockReturnValueOnce(okAsync(scene()));
  const session = mountReactive();
  await vi.waitFor(() => expect(session.source.error()).toEqual(failure));
  const oldFail = session.source.fail;
  session.select(new File(['GDOC\r\n\x1a\n'], 'valid.gdoc'));
  await vi.waitFor(() => expect(session.ready).toHaveBeenCalledOnce());
  oldFail(documentError('decode', 'Late failure'));
  expect(session.source.error()).toBeUndefined();
  expect(session.source.active()).toBe(true);
});

it('derives readiness without a loading boundary and resets it for each selection', async () => {
  let complete!: (result: Awaited<ReturnType<typeof readGdoc>>) => void;
  readGdoc.mockImplementation(
    () =>
      new ResultAsync(
        new Promise((resolve) => {
          complete = resolve;
        })
      )
  );
  vi.mocked(runWorkerRequest)
    .mockReset()
    .mockImplementation(async (_create, input) => await readGdoc(input as string | ArrayBuffer));
  const fixture = createRoot((dispose) => {
    cleanups.push(dispose);
    const [selection, select] = createSignal({});
    const source = createDocumentSource(() => {
      selection();
      return undefined;
    });
    return { source, select };
  });
  expect(fixture.source.ready()).toBe(false);
  await vi.waitFor(() => expect(readGdoc).toHaveBeenCalledOnce());
  complete(ok(scene()));
  await vi.waitFor(() => expect(fixture.source.ready()).toBe(true));
  const previous = fixture.source.prepared()!;
  fixture.select({});
  flush();
  expect(previous.signal.aborted).toBe(true);
  expect(fixture.source.ready()).toBe(false);
  await vi.waitFor(() => expect(readGdoc).toHaveBeenCalledTimes(2));
  fixture.source.cancel();
  complete(ok(scene()));
  await new Promise((resolve) => setTimeout(resolve, 0));
  flush();
  expect(fixture.source.ready()).toBe(false);
  expect(fixture.source.prepared()).toBeUndefined();
});

it('publishes loading failures even when only synchronous status is observed', async () => {
  readGdoc.mockReturnValue(errAsync(documentError('decode', 'Broken document')));
  const source = createRoot((dispose) => {
    cleanups.push(dispose);
    return createDocumentSource(() => undefined);
  });
  expect(source.ready()).toBe(false);
  await vi.waitFor(() => expect(source.error()?.message).toBe('Broken document'));
  expect(source.ready()).toBe(false);
});

it('derives decode errors from the document and records external failures separately', async () => {
  readGdoc.mockReturnValueOnce(errAsync(documentError('decode', 'Broken document')));
  const failed = createRoot((dispose) => {
    cleanups.push(dispose);
    return createDocumentSource(() => undefined);
  });
  await vi.waitFor(() => expect(failed.error()?.message).toBe('Broken document'));
  // Deriving the error no longer cancels the selection or hides the failed result.
  expect(failed.active()).toBe(true);
  expect(failed.prepared()).toBeUndefined();

  readGdoc.mockReturnValueOnce(okAsync(scene()));
  const loaded = createRoot((dispose) => {
    cleanups.push(dispose);
    return createDocumentSource(() => undefined);
  });
  await vi.waitFor(() => expect(loaded.ready()).toBe(true));
  const prepared = loaded.prepared()!;
  prepared.fail({ kind: 'gpu', code: 'render', message: 'Renderer failed' });
  flush();
  expect(prepared.signal.aborted).toBe(true);
  expect(loaded.prepared()).toBeUndefined();
  expect(loaded.error()?.message).toBe('Renderer failed');
});

function mountReactive() {
  const cancelled = vi.fn();
  vi.mocked(runWorkerRequest)
    .mockReset()
    .mockImplementation(async (_create, input, { signal }) => {
      signal.addEventListener('abort', cancelled, { once: true });
      return await readGdoc(input as string | ArrayBuffer);
    });
  let source!: ReturnType<typeof createDocumentSource>;
  let select!: (file: File | undefined) => void;
  const ready = vi.fn<(data: TextDocument) => void>();
  const dispose = render(() => {
    const [file, setFile] = createSignal<{ file?: File }>({});
    select = (file) => setFile({ file });
    source = createDocumentSource(() => file().file);
    return (
      <Show when={source.prepared()} keyed>
        {({ data }) => {
          ready(data);
          return null;
        }}
      </Show>
    );
  }, document.createElement('div'));
  cleanups.push(dispose);
  return { source, select, ready, cancelled };
}

function mount(file: File) {
  const loaded = vi.fn<(document: TextDocument) => void>();
  const converted = vi.fn<(exporter: ReturnType<typeof createDocumentExport>) => void>();
  const error = vi.fn();
  const children = vi.fn<Parameters<typeof DocumentSource>[0]['children']>((data, _fail, exporter) => {
    loaded(data);
    if (exporter) converted(exporter);
    return null;
  });
  const dispose = render(
    () => (
      <DocumentSource file={file} onError={error}>
        {children}
      </DocumentSource>
    ),
    document.createElement('div')
  );
  cleanups.push(dispose);
  flush();
  return { loaded, converted, error, dispose, children };
}

function scene(): DecodedDocument {
  return {
    kind: 'glyphs',
    pages: [{ width: 612, height: 792, beginVertex: 0, endVertex: 6 }],
    positions: { x: new Float32Array(), y: new Float32Array() },
    glyphVertices: new ArrayBuffer(0),
    atlas: { buf: new ArrayBuffer(0), width: 1, height: 1 },
    atlasVertices: { buf: new ArrayBuffer(0), width: 1, height: 1 }
  };
}
