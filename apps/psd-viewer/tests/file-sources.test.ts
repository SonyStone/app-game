import { afterEach, expect, it, vi } from 'vitest';
import { fileSource } from '../src/features/open-file/sources';

afterEach(() => vi.unstubAllGlobals());

it('reads a bounded small canvas asynchronously and preserves its bytes', async () => {
  vi.stubGlobal('location', { search: '' });
  const file = documentFile(1600, 1200);
  const source = fileSource(file);
  const read = await source.read();
  expect(read).toBeInstanceOf(ArrayBuffer);
  expect(new Uint8Array(read as ArrayBuffer)).toEqual(new Uint8Array(await file.arrayBuffer()));
});

it.each([
  { version: 1, bytes: 129 * 1024 ** 2 },
  { version: 2, bytes: 65 * 1024 ** 2 }
])('retains the Blob for version $version at $bytes bytes without a whole UI read', async ({ version, bytes }) => {
  vi.stubGlobal('location', { search: '' });
  const file = documentFile(1600, 1200, version);
  Object.defineProperty(file, 'size', { value: bytes });
  const whole = vi.spyOn(file, 'arrayBuffer');
  expect(await fileSource(file).read()).toBe(file);
  expect(whole).not.toHaveBeenCalled();
});

it('retains bounded reads for a huge canvas even when its compressed file is tiny', async () => {
  vi.stubGlobal('location', { search: '?current=1' });
  const file = documentFile(300000, 300000, 2);
  const whole = vi.spyOn(file, 'arrayBuffer');
  const source = fileSource(file);
  expect(source.mode).toBe('strict');
  expect(await source.read()).toBe(file);
  expect(whole).not.toHaveBeenCalled();
});

function documentFile(width: number, height: number, version = 1) {
  const bytes = new Uint8Array(26);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x38425053);
  view.setUint16(4, version);
  view.setUint32(14, height);
  view.setUint32(18, width);
  return new File([bytes], 'document.psd');
}
