import { tgpu } from 'typegpu';
import { expect, it } from 'vitest';
import { compositeFragment } from '../src/features/brush-preview/shaders';

it('resolves the ABR preview compositor with a separate global-opacity uniform', () => {
  expect(tgpu.resolve([compositeFragment])).toContain('compositeOpacity');
});
