import { brushToFormValues, formValuesToBrush } from '@app-game/abr-brush/form';
import type { BrushAsset } from '@app-game/abr-brush/library';
import { initAbr } from '@app-game/abr-parser';
import { defaultBrush, type Brush } from '@app-game/paint-core/brush';
import { describe, expect, it } from 'vitest';
import { abrCategories, abrCategoriesFor, abrValues } from './abrSchema';
import { brushSettingsDiffer, snapshotBrushSettings } from './schema';

const source = {
  id: 'test',
  name: 'Test',
  preset: { tip: { kind: 'computed', diameter: 30 } },
  resources: []
} as unknown as BrushAsset;

function brush(): Brush {
  return { ...defaultBrush(), engine: { id: 'abr', settings: { values: brushToFormValues(source), tipId: 'tip' } } };
}

describe('generated ABR settings', () => {
  it('generates rows for every engine group, in reference order', () => {
    expect(abrCategories.map((c) => c.id)).toEqual([
      'tool',
      'brush-tip',
      'shapeDynamics',
      'transfer',
      'scattering',
      'texture',
      'dualBrush',
      'colorDynamics',
      'brushPose',
      'smoothing',
      'bristle',
      'erodible',
      'stroke-correction',
      'pressure-curve'
    ]);
    expect(abrCategories.every((c) => c.settings.length > 0)).toBe(true);
    const rows = abrCategories.flatMap((c) => c.settings);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    expect(rows.some((r) => /stored only|Tip Wear|Load solid|Pattern Name|Saved foreground/.test(r.label))).toBe(false);
  });

  it('round trips every generated ABR field through the descriptor conversion', () => {
    for (const category of abrCategories.slice(0, 12)) {
      for (const row of category.settings) {
        const b = brush();
        const next =
          row.kind === 'number'
            ? row.write(b, row.min(b) + 1)
            : row.kind === 'toggle'
              ? row.write(b, !row.read(b))
              : row.write(b, row.options.at(-1)!.value);
        const edited = { ...b, ...next };
        const decoded = brushToFormValues(formValuesToBrush(source, abrValues(edited)));
        // Form writes preserve sampled hardness, but this fixture has a computed primary and secondary tip.
        expect(row.read({ ...edited, engine: { ...edited.engine!, settings: { values: decoded } } }), row.id).toEqual(
          row.read(edited)
        );
      }
    }
  });

  it('keeps switched-off rows visible and disabled, and enables them with the group', () => {
    for (const category of abrCategories.filter((c) =>
      ['shapeDynamics', 'scattering', 'dualBrush', 'colorDynamics', 'transfer', 'brushPose', 'smoothing'].includes(c.id)
    )) {
      const toggle = category.settings[0]!;
      expect(toggle.kind).toBe('toggle');
      if (toggle.kind !== 'toggle') {
        continue;
      }
      const off = { ...brush(), ...toggle.write(brush(), false) };
      expect(category.status(off)).toBe('Off');
      expect(category.settings.slice(1).every((r) => !r.enabled(off))).toBe(true);
      const on = { ...off, ...toggle.write(off, true) };
      expect(category.settings.slice(1).every((r) => r.enabled(on))).toBe(true);
      expect(
        category.settings
          .slice(1)
          .filter((r) => r.applies(off))
          .map((r) => r.id)
      ).toEqual(
        category.settings
          .slice(1)
          .filter((r) => r.applies(on))
          .map((r) => r.id)
      );
    }
  });

  it('retains ABR values in the cancel baseline without sharing mutable objects', () => {
    const b = brush();
    const baseline = snapshotBrushSettings(b, true);
    const row = abrCategories.find((c) => c.id === 'scattering')!.settings.find((r) => r.kind === 'number')!;
    if (row.kind !== 'number') {
      throw new Error('Expected scatter number');
    }
    const changed = { ...b, ...row.write(b, 250) };
    expect(brushSettingsDiffer(changed, baseline)).toBe(true);
    expect(brushSettingsDiffer({ ...changed, ...structuredClone(baseline) }, baseline)).toBe(false);
  });

  it('can re-enable an embedded texture after preparation removed its dormant runtime ID', async () => {
    await initAbr();
    const textured = {
      ...source,
      preset: { ...source.preset, texture: { identifier: 'grain', name: 'Grain' }, textureEnabled: false },
      resources: [{ resource: { kind: 'pattern', id: 'grain', name: 'Grain', section: 0, index: 0 }, source: {} }]
    } as unknown as BrushAsset;
    const category = abrCategoriesFor(textured).find((c) => c.id === 'texture')!;
    const b = brush();
    const toggle = category.settings[0]!;
    expect(toggle.enabled(b)).toBe(true);
    expect(category.settings.slice(1).every((r) => !r.enabled(b))).toBe(true);
    if (toggle.kind !== 'toggle') {
      throw new Error('Expected texture switch');
    }
    const on = { ...b, ...toggle.write(b, true) };
    expect(category.settings.every((r) => r.enabled(on))).toBe(true);
  });

  it('requires a texture resource and only shows physical groups for physical tips', () => {
    const b = brush();
    const texture = abrCategories.find((c) => c.id === 'texture')!;
    expect(texture.settings.every((r) => !r.enabled(b))).toBe(true);
    expect(abrCategories.find((c) => c.id === 'bristle')!.applies(b)).toBe(false);
    expect(abrCategories.find((c) => c.id === 'erodible')!.applies(b)).toBe(false);
  });
});
