import { describe, expect, it } from 'vitest';
import type { BrushPreset } from '../../features/brush-library';
import { brushSets, setOf } from './brushSets';

const preset = (id: string, extra: Partial<BrushPreset> = {}): BrushPreset => ({
  id,
  name: id,
  settings: {},
  resourceIds: [],
  ...extra
});

describe('brushSets', () => {
  const presets = [
    preset('round', { builtIn: true }),
    preset('eraser', { builtIn: true }),
    preset('ink', { source: 'abr:1' }),
    preset('mine')
  ];

  it('groups recent, built-in, imported and own brushes', () => {
    const sets = brushSets(presets, ['mine', 'gone', 'round']);
    expect(sets.map((set) => [set.id, set.presets.map(({ id }) => id)])).toEqual([
      ['recent', ['mine', 'round']],
      ['basic', ['round', 'eraser']],
      ['imported', ['ink']],
      ['mine', ['mine']]
    ]);
  });

  it('leaves out empty sets but keeps the built-in one', () => {
    expect(brushSets([preset('round', { builtIn: true })], []).map((set) => set.id)).toEqual(['basic']);
    expect(brushSets([], []).map((set) => set.id)).toEqual(['basic']);
  });

  it('opens on the set holding the preset, not on Recent', () => {
    const sets = brushSets(presets, ['ink']);
    expect(setOf(sets, 'ink')).toBe('imported');
    expect(setOf(sets, 'unknown')).toBe('basic');
  });
});
