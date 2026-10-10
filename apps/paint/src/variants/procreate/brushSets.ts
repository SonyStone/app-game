import type { BrushPreset } from '../../features/brush-library';

/**
 * The Brush Library's sets, in the order its left column lists them: recently used brushes, the built-in brushes,
 * imported ABR brushes and the user's own saved brushes. Sets without brushes are left out, except the built-in
 * set, which always has the default brushes.
 */
export function brushSets(presets: readonly BrushPreset[], recent: readonly string[]): BrushSet[] {
  const byId = new Map(presets.map((preset) => [preset.id, preset]));
  const sets: BrushSet[] = [
    { id: 'recent', name: 'Recent', presets: recent.flatMap((id) => byId.get(id) ?? []) },
    { id: 'basic', name: 'Basic', presets: presets.filter((preset) => preset.builtIn) },
    { id: 'imported', name: 'Imported', presets: presets.filter((preset) => !preset.builtIn && isImported(preset)) },
    { id: 'mine', name: 'My brushes', presets: presets.filter((preset) => !preset.builtIn && !isImported(preset)) }
  ];
  return sets.filter((set) => set.id === 'basic' || set.presets.length > 0);
}

/** One set of the Brush Library's left column. */
export type BrushSet = { id: 'recent' | 'basic' | 'imported' | 'mine'; name: string; presets: BrushPreset[] };

/** The set to show first: the one holding `preset` other than Recent, or the built-in set. */
export function setOf(sets: readonly BrushSet[], preset: string): BrushSet['id'] {
  const holding = sets.find((set) => set.id !== 'recent' && set.presets.some((candidate) => candidate.id === preset));
  return holding?.id ?? 'basic';
}

/** The preset came from an imported file, such as an ABR brush. */
function isImported(preset: BrushPreset) {
  return preset.source !== undefined;
}
