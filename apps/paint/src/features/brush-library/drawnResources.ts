import type { BrushResource } from '@app-game/abr-paint/resources';
import { ok, type Result } from 'neverthrow';
import type { BrushPreset } from './brushPresets';

/**
 * The images a sample of `preset` needs to show it as the tools draw it now: its saved images (`library.resources`)
 * and those of its accepted document edit (`edited`), which replace saved images of the same id. Fails as
 * `library.resources` does.
 */
export async function drawnResources<E>(
  library: { resources: (preset: BrushPreset) => Promise<Result<BrushResource[], E>> },
  edited: (id: string) => readonly BrushResource[] | undefined,
  preset: BrushPreset
): Promise<Result<BrushResource[], E>> {
  const saved = await library.resources(preset);
  const extra = edited(preset.id);
  if (!extra?.length || saved.isErr()) {
    return saved;
  }

  const byId = new Map(saved.value.map((resource) => [resource.id, resource]));
  for (const resource of extra) {
    byId.set(resource.id, resource);
  }

  return ok([...byId.values()]);
}
