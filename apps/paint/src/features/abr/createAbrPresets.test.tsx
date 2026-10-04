// @vitest-environment jsdom
import { ok, type Result } from 'neverthrow';
import { createRoot, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import type { PaintError } from '../../shared/errors';
import { createBrushLibrary, type BrushPreset } from '../brush-library';
import { createAbrPresets, type AbrPreset } from './createAbrPresets';

const disposers: (() => void)[] = [];
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
});

it('imports a preset into the library once per viewer brush and chooses it', async () => {
  const choose = vi.fn<(preset: BrushPreset) => Promise<Result<void, PaintError>>>(async () => ok());
  const { presets, library } = setup({ choose });
  expect(await presets.usePreset(abrPreset(), 'abr:1')).toEqual(ok());
  const chosen = choose.mock.calls[0]![0];
  expect(chosen).toMatchObject({
    name: 'Ink',
    source: 'abr:1',
    settings: {
      engine: { id: 'textured', settings: { tipId: 'tip' } },
      tool: 'brush',
      size: 40,
      spacing: 0.1,
      color: '#123456'
    }
  });
  // Unset preset values are not part of the import, so the brush keeps its own.
  expect(chosen.settings).not.toHaveProperty('opacity');
  expect(chosen.resourceIds).toEqual(['tip', 'pattern']);
  expect((await library.resources(chosen))._unsafeUnwrap().map(({ id }) => id)).toEqual(['tip', 'pattern']);

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
  const resource = (id: string) => ({
    id,
    width: 1,
    height: 1,
    format: 'r8unorm' as const,
    pixels: new Uint8Array([255])
  });
  return {
    name: 'Ink',
    engine: { id: 'textured', settings: { tipId: 'tip' } },
    resources: [resource('tip'), resource('pattern')],
    size: 40,
    spacing: 0.1,
    color: '#123456'
  } as unknown as AbrPreset;
}
