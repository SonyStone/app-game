import { err, ok } from 'neverthrow';
import { beforeEach, expect, it, vi } from 'vitest';
import { documentError } from '../../shared/errors';
import { maxDocumentFileBytes } from './limits';
import { convertPdf } from './pdf/convertPdf';
import { readDocumentSource } from './readDocumentSource';

vi.mock('./pdf/convertPdf', () => ({ convertPdf: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

it('sniffs GDOC bytes regardless of the filename and leaves conversion idle', async () => {
  const file = new File(['GDOC\r\n\x1a\ncontent'], 'renamed.pdf');
  const result = await readDocumentSource(file);

  expect(new TextDecoder().decode(result._unsafeUnwrap())).toBe('GDOC\r\n\x1a\ncontent');
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

it('retains a downloadable GDOC before its buffer is consumed by the decoder', async () => {
  const encoded = new TextEncoder().encode('GDOC result').buffer;
  vi.mocked(convertPdf).mockResolvedValue(ok(encoded));
  const onConverted = vi.fn();
  const result = await readDocumentSource(new File(['%PDF-1.7'], 'example.pdf'), undefined, onConverted);

  expect(result._unsafeUnwrap()).toBe(encoded);
  expect(onConverted).toHaveBeenCalledOnce();
  const file: File = onConverted.mock.calls[0]![0];
  expect(file.name).toBe('example.gdoc');
  expect(await file.text()).toBe('GDOC result');
});

it('does not publish a stale conversion after cancellation', async () => {
  const abort = new AbortController();
  const onConverted = vi.fn();
  vi.mocked(convertPdf).mockImplementation(async () => {
    abort.abort();
    return ok(new ArrayBuffer(0));
  });
  const result = await readDocumentSource(new File(['%PDF-1.7'], 'example.pdf'), abort.signal, onConverted);

  expect(result._unsafeUnwrapErr()).toMatchObject({ kind: 'aborted' });
  expect(onConverted).not.toHaveBeenCalled();
});

it('propagates unsupported PDF features without offering an incomplete download', async () => {
  vi.mocked(convertPdf).mockResolvedValue(err(documentError('unsupported-pdf', 'Unsupported PDF on page 2: images')));
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
    const converted = new ArrayBuffer(8);
    vi.mocked(convertPdf).mockResolvedValue(ok(converted));

    expect((await readDocumentSource(file))._unsafeUnwrap()).toBe(converted);
    expect(convertPdf).toHaveBeenCalledOnce();
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
