import { err, ok } from 'neverthrow';
import { beforeEach, expect, it, vi } from 'vitest';
import { documentError } from '../../shared/errors';
import type { DecodedDocument } from './format/types';
import { maxDocumentFileBytes } from './limits';
import { convertPdf } from './pdf/convertPdf';
import { importPdf } from './pdf/importPdf';
import { readDocumentSource } from './readDocumentSource';

vi.mock('./pdf/importPdf', () => ({ importPdf: vi.fn() }));
vi.mock('./pdf/convertPdf', () => ({ convertPdf: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

it('sniffs GDOC bytes regardless of the filename and leaves conversion idle', async () => {
  const file = new File(['GDOC\r\n\x1a\ncontent'], 'renamed.pdf');
  const result = await readDocumentSource(file);

  const value = result._unsafeUnwrap();
  if (!(value instanceof ArrayBuffer)) throw new Error('Expected GDOC bytes');
  expect(new TextDecoder().decode(value)).toBe('GDOC\r\n\x1a\ncontent');
  expect(convertPdf).not.toHaveBeenCalled();
});

it('returns typed failures for other file types and oversized input', async () => {
  expect((await readDocumentSource(new File(['hello'], 'fake.pdf')))._unsafeUnwrapErr()).toMatchObject({
    code: 'unsupported-format'
  });
  const file = new File([], 'large.gdoc');
  Object.defineProperty(file, 'size', { value: maxDocumentFileBytes + 1 });
  expect((await readDocumentSource(file))._unsafeUnwrapErr()).toMatchObject({ code: 'document-limit' });
});

it('returns render data immediately and encodes GDOC only on request', async () => {
  const encoded = new TextEncoder().encode('GDOC result').buffer;
  vi.mocked(importPdf).mockResolvedValue(ok(scene));
  vi.mocked(convertPdf).mockResolvedValue(ok(encoded));
  const onConverted = vi.fn();
  const result = await readDocumentSource(new File(['%PDF-1.7'], 'example.pdf'), undefined, onConverted);

  expect(result._unsafeUnwrap()).toBe(scene);
  expect(convertPdf).not.toHaveBeenCalled();
  expect(onConverted).toHaveBeenCalledOnce();
  const file: File = (await onConverted.mock.calls[0]![0]())._unsafeUnwrap();
  expect(file.name).toBe('example.gdoc');
  expect(await file.text()).toBe('GDOC result');
});

it('does not publish a stale conversion after cancellation', async () => {
  const abort = new AbortController();
  const onConverted = vi.fn();
  vi.mocked(importPdf).mockImplementation(async () => {
    abort.abort();
    return ok(scene);
  });
  const result = await readDocumentSource(new File(['%PDF-1.7'], 'example.pdf'), abort.signal, onConverted);

  expect(result._unsafeUnwrapErr()).toMatchObject({ kind: 'aborted' });
  expect(onConverted).not.toHaveBeenCalled();
});

it('propagates unsupported PDF features without offering an incomplete download', async () => {
  vi.mocked(importPdf).mockResolvedValue(err(documentError('unsupported-pdf', 'Unsupported PDF on page 2: images')));
  const onConverted = vi.fn();
  const result = await readDocumentSource(new File(['%PDF-1.7'], 'example.pdf'), undefined, onConverted);

  expect(result._unsafeUnwrapErr()).toMatchObject({ code: 'unsupported-pdf' });
  expect(onConverted).not.toHaveBeenCalled();
});

it.each([128 * 1024 * 1024 + 1, maxDocumentFileBytes])(
  'accepts a PDF file size of %i before conversion',
  async (size) => {
    const file = new File(['%PDF-1.7'], 'large.pdf');
    Object.defineProperty(file, 'size', { value: size });
    vi.mocked(importPdf).mockResolvedValue(ok(scene));

    expect((await readDocumentSource(file))._unsafeUnwrap()).toBe(scene);
    expect(importPdf).toHaveBeenCalledOnce();
  }
);

it('rejects an over-budget file before reading its bytes', async () => {
  const file = new File([], 'large.pdf');
  Object.defineProperty(file, 'size', { value: maxDocumentFileBytes + 1 });
  const read = vi.spyOn(file, 'arrayBuffer');

  expect((await readDocumentSource(file))._unsafeUnwrapErr()).toMatchObject({ code: 'document-limit' });
  expect(read).not.toHaveBeenCalled();
  expect(convertPdf).not.toHaveBeenCalled();
});

const scene: DecodedDocument = {
  kind: 'glyphs',
  pages: [],
  positions: { x: new Float32Array(), y: new Float32Array() },
  glyphVertices: new ArrayBuffer(0),
  atlas: { buf: new ArrayBuffer(0), width: 1, height: 1 },
  atlasVertices: { buf: new ArrayBuffer(0), width: 1, height: 1 }
};

it('does not start an export after its document session has been replaced', async () => {
  vi.mocked(importPdf).mockResolvedValue(ok(scene));
  const abort = new AbortController();
  const onConverted = vi.fn();
  await readDocumentSource(new File(['%PDF-1.7'], 'example.pdf'), abort.signal, onConverted);
  abort.abort();
  expect((await onConverted.mock.calls[0]![0]())._unsafeUnwrapErr().kind).toBe('aborted');
  expect(convertPdf).not.toHaveBeenCalled();
});

it('cancels the actual file read and reports cancellation without starting PDF import', async () => {
  const abort = new AbortController();
  const result = await readDocumentSource(new File(['%PDF-1.7'], 'cancel.pdf'), abort.signal, undefined, (progress) => {
    if (progress.stage === 'readingFile') abort.abort();
  });
  expect(result._unsafeUnwrapErr().kind).toBe('aborted');
  expect(importPdf).not.toHaveBeenCalled();
});
