import { expect, test } from 'vitest';
import { existsSync } from 'node:fs';
import { brushExamples } from '../src/lib/brush-examples';

test('all examples link to Adobe and have no bundled ABR copy', () => {
  expect(brushExamples).toHaveLength(8);
  for (const example of brushExamples) {
    expect(example.url).toBe(`https://download.adobe.com/pub/adobe/photoshop/brushes/${example.filename}`);
    expect(existsSync(new URL(`../src/assets/examples/${example.filename}`, import.meta.url))).toBe(false);
  }
});
