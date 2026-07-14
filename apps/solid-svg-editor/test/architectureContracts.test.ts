import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('editor architecture contracts', () => {
  it('keeps public editor contracts independent from legacy svg-db metadata', async () => {
    const contractFiles = [
      'src/editor/capabilities.ts',
      'src/editor/kernel.ts'
    ] as const;
    const contents = await readSources(contractFiles);

    for (const { file, source } of contents) {
      expect(source, `${file} should use editor contract types, not svg-db`).not.toMatch(/from ['"].*\.\.\/svg-db['"]/);
    }
  });

  it('keeps core SVG capabilities upstream of the legacy svg-db facade', async () => {
    const coreCapabilityFiles = [
      'src/editor/svg-capabilities/coreSvgContribution.ts',
      'src/editor/svg-capabilities/coreHandleProviders.ts',
      'src/editor/svg-capabilities/coreBoundsProviders.ts',
      'src/editor/svg-capabilities/coreSvgMetadata.ts'
    ] as const;
    const contents = await readSources(coreCapabilityFiles);

    for (const { file, source } of contents) {
      expect(source, `${file} should own core SVG metadata instead of importing the svg-db facade`).not.toMatch(/from ['"].*svg-db['"]/);
    }
  });

  it('keeps the retired svg-db compatibility facade out of source', async () => {
    await expect(access(resolve('src/svg-db.ts'))).rejects.toThrow();
  });
});

async function readSources(files: readonly string[]): Promise<readonly { readonly file: string; readonly source: string }[]> {
  return Promise.all(
    files.map(async (file) => ({
      file,
      source: await readFile(resolve(file), 'utf8')
    }))
  );
}
