import { expect, it, vi } from 'vitest';
import { maxDocumentFileBytes } from './limits';
import { readDocumentFile } from './readDocumentFile';

it('identifies GDOC by its bytes regardless of the filename', async () => {
  const result = await readDocumentFile(new File(['GDOC\r\n\x1a\ncontent'], 'renamed.pdf'));
  const value = result._unsafeUnwrap();
  expect(value.format).toBe('gdoc');
  expect(new TextDecoder().decode(value.bytes)).toBe('GDOC\r\n\x1a\ncontent');
});

it('returns PDF bytes without importing or converting them', async () => {
  const value = (await readDocumentFile(new File(['%PDF-1.7'], 'example.gdoc')))._unsafeUnwrap();
  expect(value.format).toBe('pdf');
  expect(new TextDecoder().decode(value.bytes)).toBe('%PDF-1.7');
});

it('rejects unsupported signatures', async () => {
  expect((await readDocumentFile(new File(['hello'], 'fake.pdf')))._unsafeUnwrapErr()).toMatchObject({
    code: 'unsupported-format'
  });
});

it.each([128 * 1024 * 1024 + 1, maxDocumentFileBytes])('accepts a file size of %i', async (size) => {
  const file = new File(['%PDF-1.7'], 'large.pdf');
  Object.defineProperty(file, 'size', { value: size });
  expect((await readDocumentFile(file))._unsafeUnwrap().format).toBe('pdf');
});

it('rejects an over-budget file before reading its bytes', async () => {
  const file = new File([], 'large.pdf');
  Object.defineProperty(file, 'size', { value: maxDocumentFileBytes + 1 });
  const read = vi.spyOn(FileReader.prototype, 'readAsArrayBuffer');
  try {
    expect((await readDocumentFile(file))._unsafeUnwrapErr()).toMatchObject({ code: 'document-limit' });
    expect(read).not.toHaveBeenCalled();
  } finally {
    read.mockRestore();
  }
});

it('cancels the actual file read', async () => {
  const abort = new AbortController();
  const result = await readDocumentFile(new File(['%PDF-1.7'], 'cancel.pdf'), abort.signal, () => abort.abort());
  expect(result._unsafeUnwrapErr().kind).toBe('aborted');
});
