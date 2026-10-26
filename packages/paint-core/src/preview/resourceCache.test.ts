import { expect, test } from 'vitest';
import { createPreviewResourceCache, previewBytesKey } from './resourceCache';

test('decoded resources survive structured-clone identities and obey worker cache limits', () => {
  const cache = createPreviewResourceCache(128 * 128 * 2);
  const source = { dualHardness: 50 };
  const first = cache.read(source);
  expect(cache.read(structuredClone(source))).toBe(first);
  expect(first.dualTip).toBeDefined();
  cache.read({ dualHardness: 100 });
  cache.read({ dualHardness: 0 });
  expect(cache.read(source)).not.toBe(first);
  cache.clear();
  expect(cache.read(source)).not.toBe(first);
});

test('resource identities include content and preserve the source bytes', () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  expect(previewBytesKey(bytes)).toBe(previewBytesKey(bytes.slice()));
  expect(previewBytesKey(bytes)).not.toBe(previewBytesKey(new Uint8Array([4, 3, 2, 1])));
  expect(bytes).toEqual(new Uint8Array([1, 2, 3, 4]));
});
