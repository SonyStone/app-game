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

it('admits the header and reads all content through one stream', async () => {
  vi.stubGlobal('location', { search: '' });
  const expected = new Uint8Array(200_000);
  expected.set(new Uint8Array(await documentFile(1600, 1200).arrayBuffer()));
  for (let index = 26; index < expected.length; index++) {
    expected[index] = index % 251;
  }

  const file = new File([expected], 'document.psd');
  const stream = vi.spyOn(file, 'stream');
  const whole = vi.spyOn(file, 'arrayBuffer');
  const slice = vi.spyOn(file, 'slice');
  const read = await fileSource(file).read();
  expect(new Uint8Array(read as ArrayBuffer)).toEqual(expected);
  expect(stream).toHaveBeenCalledTimes(1);
  expect(whole).not.toHaveBeenCalled();
  expect(slice).not.toHaveBeenCalled();
});

it('admits a fragmented header and cancels the huge-canvas stream before content', async () => {
  vi.stubGlobal('location', { search: '' });
  const file = documentFile(300000, 300000, 2);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const cancel = vi.fn();
  vi.spyOn(file, 'stream').mockReturnValue(
    new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.subarray(0, 7));
        controller.enqueue(bytes.subarray(7, 19));
        controller.enqueue(bytes.subarray(19));
      },
      cancel
    })
  );
  const whole = vi.spyOn(file, 'arrayBuffer');
  expect(await fileSource(file).read()).toBe(file);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(whole).not.toHaveBeenCalled();
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
