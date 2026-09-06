import { afterEach, expect, test, vi } from 'vitest';
import { validateExampleHeader } from '../scripts/check-example-assets.mjs';
import { brushExamples, fetchBrushExample } from '../src/lib/brush-examples';

const pointer = 'version https://git-lfs.github.com/spec/v1\noid sha256:997b59bfd9\nsize 23013784\n';
afterEach(() => vi.unstubAllGlobals());

test('the build guard rejects unresolved LFS assets with a deployment fix', () => {
  expect(() => validateExampleHeader(Buffer.from(pointer), 'spring.abr')).toThrow('enable Settings > Git');
  expect(() => validateExampleHeader(Buffer.from('<!doctype html>'), 'spring.abr')).toThrow('invalid ABR');
  expect(() => validateExampleHeader(Buffer.from([0, 10, 0, 2]), 'megapack.abr')).not.toThrow();
});

test('a successful HTTP response containing a pointer reports the real failure before parsing', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(pointer)));
  await expect(fetchBrushExample(brushExamples[0])).rejects.toThrow('Git LFS pointer');
});

test('SPA fallback HTML is not imported as a brush', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<!doctype html><html></html>')));
  await expect(fetchBrushExample(brushExamples[0])).rejects.toThrow('web page instead of the brush file');
});

test('valid binary downloads retain their exact bytes and original filename', async () => {
  const bytes = Uint8Array.from([0, 6, 0, 2, 255, 128, 0, 31]);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(bytes)));
  const file = await fetchBrushExample(brushExamples[0]);
  expect(file.name).toBe('Spring-Brushes-2024.abr');
  expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);
});
