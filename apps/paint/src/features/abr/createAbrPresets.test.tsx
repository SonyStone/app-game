import type { BrushAsset } from '@app-game/abr-brush/library';
// @vitest-environment jsdom
import { ok, type Result } from 'neverthrow';
import { webcrypto } from 'node:crypto';
import { createRoot, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import type { PaintError } from '../../shared/errors';
import { createBrushLibrary, type BrushPreset } from '../brush-library';
import { sampledPreset } from '../../../tests/sampledPreset';
import { createAbrPresets, type AbrPreset } from './createAbrPresets';

const disposers: (() => void)[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  disposers.splice(0).forEach((dispose) => dispose());
});

it('imports a preset into the library once per viewer brush and chooses it', async () => {
  const choose = vi.fn<(preset: BrushPreset) => Promise<Result<void, PaintError>>>(async () => ok());
  const { presets, library } = setup({ choose });
  const prepared = { ...abrPreset(), stroke: { minimum: 0.2, maximum: 0.6, firmness: 3 } };
  expect(await presets.usePreset(prepared, 'abr:1')).toEqual(ok());
  const chosen = choose.mock.calls[0]![0];
  expect(chosen).toMatchObject({
    name: 'Ink',
    source: 'abr:1',
    settings: {
      engine: sampledPreset().engine,
      tool: 'brush',
      size: 40,
      spacing: 0.1,
      color: '#123456'
    }
  });
  // Unset preset values are not part of the import, so the brush keeps its own.
  expect(chosen.settings).not.toHaveProperty('opacity');
  expect(chosen.settings).not.toHaveProperty('stroke');
  expect(chosen.resourceIds).toEqual([sampledPreset().resource.id, 'pattern']);
  expect((await library.resources(chosen))._unsafeUnwrap().map(({ id }) => id)).toEqual([sampledPreset().resource.id, 'pattern']);

  await presets.usePreset({ ...abrPreset(), name: 'Edited ink' }, 'abr:1');
  flush();
  expect(choose.mock.calls[1]![0].id).toBe(chosen.id);
  expect(
    library
      .presets()
      .filter((preset) => !preset.builtIn)
      .map(({ name }) => name)
  ).toEqual(['Edited ink']);
});

it('stores a document for an editable import', async () => {
  const choose = vi.fn<(preset: BrushPreset) => Promise<Result<void, PaintError>>>(async () => ok());
  const { presets, library } = setup({ choose });
  vi.stubGlobal('crypto', webcrypto);
  const asset = {
    id: 'original',
    name: 'Ink',
    preset: { kind: 'brush', sourceId: 'original', tip: { kind: 'computed', diameter: 40 } },
    resources: [],
    source: {}
  } as unknown as BrushAsset;
  (await presets.usePreset(abrPreset(), 'abr:original', asset))._unsafeUnwrap();
  const imported = choose.mock.calls[0];
  expect(imported).toBeDefined();
  expect(library.presets().find((p) => p.source === 'abr:original')?.abrDocument).toContain('photoshop-v1');
});

it('refuses presets without a tip and imports nothing while Paint is busy', async () => {
  const choose = vi.fn();
  const { presets, library } = setup({ choose, canChange: () => false });
  expect((await presets.usePreset(abrPreset(), 'abr:1'))._unsafeUnwrapErr()).toMatchObject({
    kind: 'engine',
    code: 'busy'
  });

  const ready = setup({ choose });
  expect((await ready.presets.usePreset({ ...abrPreset(), resources: [] }, 'abr:1'))._unsafeUnwrapErr()).toMatchObject({
    code: 'invalid-preset'
  });
  flush();
  expect(choose).not.toHaveBeenCalled();
  expect([...library.presets(), ...ready.library.presets()].every((preset) => preset.builtIn)).toBe(true);
});

function setup(options: Partial<Parameters<typeof createAbrPresets>[0]>) {
  return createRoot((dispose) => {
    disposers.push(dispose);
    const library = createBrushLibrary({});
    const presets = createAbrPresets({ library, choose: async () => ok(), canChange: () => true, ...options });
    return { library, presets };
  });
}

function abrPreset(): AbrPreset {
  const preset = sampledPreset();
  return {
    ...preset,
    resources: [preset.resource, { ...preset.resource, id: 'pattern' }],
    size: 40,
    spacing: 0.1,
    color: '#123456'
  };
}
