import { resolveResources } from '@app-game/abr-parser';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { deserialize, serialize } from 'node:v8';
import {
  adobeBrushCacheDirectory,
  adobeBrushFixtureDigests,
  readAdobeBrushFixture
} from '../../../scripts/adobe-brush-fixture.mjs';
import { loadBrushLibrary, type BrushAsset } from '../src/library';

/**
 * Loads named presets from a pinned Adobe brush pack without parsing the whole pack on every run.
 *
 * The first call parses the full pack once and caches a snapshot of just these presets under
 * `.tmp/adobe-brushes/presets/`, keyed by the pack's pinned SHA-256 and the names. Each snapshot keeps the preset
 * descriptor, its decoded primary tip and only the embedded resources it references (dual tip, pattern). The pack's
 * source bytes are dropped, so the presets suit sampling, form and preset-preparation tests but not ABR writing.
 * Returns presets in the order of `names`; throws when a name is missing. Requires `initAbr`.
 *
 * Checks that must cover every preset of a pack read it with `readAdobeBrushFixture`; the complete Megapack check
 * lives only in `@app-game/abr-paint`'s `megapack.test.ts`.
 */
export async function readAdobeBrushPresets(filename: string, names: readonly string[]): Promise<BrushAsset[]> {
  const key = createHash('sha256')
    .update(`${adobeBrushFixtureDigests[filename]}\0${names.join('\0')}`)
    .digest('hex')
    .slice(0, 16);
  const directory = `${adobeBrushCacheDirectory}presets/`;
  const path = `${directory}${filename.replace(/\.abr$/, '')}-${key}.bin`;
  const cached = await readFile(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return undefined;
    }

    throw error;
  });

  if (cached) {
    return deserialize(cached) as BrushAsset[];
  }

  const presets = selectPresets(filename, loadBrushLibrary(await readAdobeBrushFixture(filename)).brushes, names).map(
    detachPreset
  );
  await mkdir(directory, { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, serialize(presets));
  await rename(temporary, path);
  return presets;
}

function selectPresets(filename: string, brushes: readonly BrushAsset[], names: readonly string[]) {
  return names.map((name) => {
    const brush = brushes.find((candidate) => candidate.name === name);

    if (!brush) {
      throw new Error(`Adobe fixture ${filename} has no preset named ${name}`);
    }

    return brush;
  });
}

/** Keeps the preset's own resources; the library shares every resource of the pack with every preset. */
function detachPreset(brush: BrushAsset): BrushAsset {
  const selected = resolveResources(
    brush.resources.map((entry) => entry.resource),
    brush.preset
  );
  const referenced = [selected.sample, selected.dualSample, selected.pattern].filter((resource) => !!resource);

  return {
    ...brush,
    resources: brush.resources.filter((entry) =>
      referenced.some(
        (resource) =>
          resource.kind === entry.resource.kind &&
          resource.id === entry.resource.id &&
          resource.section === entry.resource.section &&
          resource.index === entry.resource.index
      )
    ),
    source: { format: brush.source.format, bytes: new Uint8Array() }
  };
}
