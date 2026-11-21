import type { BrushResource } from '@app-game/abr-paint/resources';
import { err, ok } from 'neverthrow';
import { expect, it } from 'vitest';
import type { BrushPreset } from './brushPresets';
import { drawnResources } from './drawnResources';

const preset: BrushPreset = { id: 'p', name: 'P', settings: {}, resourceIds: ['tip', 'pattern'] };

function image(id: string, width = 1): BrushResource {
  return { id, width, height: 1, format: 'r8unorm', pixels: new Uint8Array(width) };
}

it('adds the images of the preset’s edit to its saved ones, an edited image replacing a saved one', async () => {
  const library = { resources: async () => ok([image('tip'), image('pattern')]) };
  const edited = (id: string) => (id === 'p' ? [image('pattern', 2), image('mask')] : undefined);
  const result = await drawnResources(library, edited, preset);
  expect(result._unsafeUnwrap().map(({ id, width }) => [id, width])).toEqual([
    ['tip', 1],
    ['pattern', 2],
    ['mask', 1]
  ]);
});

it('gives the saved images alone without an edit, and the library’s failure as it is', async () => {
  const saved = [image('tip')];
  expect((await drawnResources({ resources: async () => ok(saved) }, () => undefined, preset))._unsafeUnwrap()).toBe(
    saved
  );
  const failed = await drawnResources({ resources: async () => err('gone') }, () => [image('mask')], preset);
  expect(failed._unsafeUnwrapErr()).toBe('gone');
});
