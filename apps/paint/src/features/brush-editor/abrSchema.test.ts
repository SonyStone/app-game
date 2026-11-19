import { brushToFormValues, formValuesToBrush, type BrushFormValues } from '@app-game/abr-brush/form';
import type { BrushAsset } from '@app-game/abr-brush/library';
import { settingGroups } from '@app-game/abr-brush/settings-fields';
import { initAbr } from '@app-game/abr-parser';
import { defaultBrush, type Brush } from '@app-game/paint-core/brush';
import { describe, expect, it } from 'vitest';
import { abrCategories, abrCategoriesFor, abrValues } from './abrSchema';
import { brushSettingsDiffer, legacyPressureCategory, snapshotBrushSettings } from './schema';

const source = {
  id: 'test',
  name: 'Test',
  preset: { tip: { kind: 'computed', diameter: 30 } },
  resources: []
} as unknown as BrushAsset;

function brush(): Brush {
  return { ...defaultBrush(), engine: { id: 'abr', settings: { values: brushToFormValues(source), tipId: 'tip' } } };
}

/** `b` with the fields of `patch` written into its engine values, at their root or in `group`. */
function edit(b: Brush, group: keyof BrushFormValues | undefined, patch: Record<string, unknown>): Brush {
  const values = abrValues(b);
  const next = group ? { ...values, [group]: { ...(values[group] as object), ...patch } } : { ...values, ...patch };
  return { ...b, engine: { ...b.engine!, settings: { ...(b.engine!.settings as object), values: next } } };
}

/** The setting `id` of the ABR category `category`. */
function setting(category: string, id: string) {
  const found = abrCategories.find((c) => c.id === category)!.settings.find((r) => r.id === id);
  if (!found) {
    throw new Error(`No setting ${id}`);
  }

  return found;
}

/** The status of the ABR category `id` for `b`. */
function status(id: string, b: Brush) {
  return abrCategories.find((c) => c.id === id)!.status(b);
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
      'erodible'
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
      ['shapeDynamics', 'scattering', 'dualBrush', 'colorDynamics', 'transfer', 'brushPose'].includes(c.id)
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
      // Rows that depend on another row's value, such as a Fade length on its control, stay greyed until it is set.
      expect(category.settings.slice(1).some((r) => r.enabled(on))).toBe(true);
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
    const perTip = ['depthJitter', 'depthControl', 'minimumDepth', 'depthFade'].map((key) => `abr-texture-${key}`);
    expect(category.settings.filter((r) => !r.enabled(on)).map((r) => r.id)).toEqual(perTip);
    const varied = edit(on, 'texture', { eachTip: true, depthControl: 1 });
    expect(category.settings.every((r) => r.enabled(varied))).toBe(true);
  });

  it('requires a texture resource and only shows physical groups for physical tips', () => {
    const b = brush();
    const texture = abrCategories.find((c) => c.id === 'texture')!;
    expect(texture.settings.every((r) => !r.enabled(b))).toBe(true);
    expect(abrCategories.find((c) => c.id === 'bristle')!.applies(b)).toBe(false);
    expect(abrCategories.find((c) => c.id === 'erodible')!.applies(b)).toBe(false);
  });

  it('groups each category under short headings and places every engine field once', () => {
    const transfer = abrCategories.find((c) => c.id === 'transfer')!.settings.filter((r) => r.applies(brush()));
    expect(transfer.map((r) => [r.section, r.label])).toEqual([
      [undefined, 'Use transfer'],
      ...['Opacity', 'Flow'].flatMap((section) =>
        ['Jitter', 'Control', 'Minimum', 'Fade length'].map((label) => [section, label])
      )
    ]);
    const shape = abrCategories.find((c) => c.id === 'shapeDynamics')!.settings;
    expect([...new Set(shape.flatMap((r) => r.section ?? []))]).toEqual(['Size', 'Angle', 'Roundness', 'Flip']);

    const hidden: Record<string, string[]> = {
      tool: ['type', 'foreground', 'background', 'pressureSmoothing', 'legacy', 'loadSolidColorOnly'],
      texture: ['patternId', 'patternName'],
      dualBrush: ['tipId'],
      erodible: ['physics'],
      // Smoothing has its own category: see the Smoothing test.
      smoothing: Object.keys(settingGroups.smoothing)
    };
    for (const [group, fields] of Object.entries(settingGroups)) {
      const placed = abrCategories
        .flatMap((c) => c.settings)
        .filter((r) => r.id.startsWith(`abr-${group}-`))
        .map((r) => r.id.slice(`abr-${group}-`.length))
        .filter((key) => !key.startsWith('use'));
      expect(placed.length, group).toBe(new Set(placed).size);
      expect(new Set([...placed, ...(hidden[group] ?? [])]), group).toEqual(
        new Set([...Object.keys(fields), ...(group === 'smoothing' ? ['amount'] : [])])
      );
    }

    // A section's rows are consecutive, so it shows as one group.
    for (const category of abrCategories) {
      const runs = category.settings.map((r) => r.section).filter((name, i, all) => name && name !== all[i - 1]);
      expect(runs, category.id).toEqual([...new Set(runs)]);
    }
  });

  it('greys a row whose value has no effect under the current control, as the engine reads it', () => {
    const shape = edit(brush(), undefined, { useShapeDynamics: true, tipKind: 'sampledBrush' });
    const enabled = (category: string, id: string, b: Brush) => setting(category, id).enabled(b);
    const sizeRows = ['sizeFade', 'minimumDiameter', 'tiltScale', 'sizeMinimum'].map((k) => `abr-shapeDynamics-${k}`);
    const sizeState = (b: Brush) => sizeRows.map((id) => enabled('shapeDynamics', id, b));
    const sizeControl = (control: number, jitter = 0) =>
      edit(shape, 'shapeDynamics', { sizeControl: control, sizeJitter: jitter });
    // Off: fade, tilt scale and both minimums have no effect; a jitter makes the minimum diameter its floor.
    expect(sizeState(sizeControl(0))).toEqual([false, false, false, false]);
    expect(sizeState(sizeControl(0, 20))).toEqual([false, true, false, false]);
    expect(sizeState(sizeControl(1))).toEqual([true, true, false, true]);
    expect(sizeState(sizeControl(2))).toEqual([false, true, false, true]);
    // Pen Tilt stretches by Tilt scale and ignores the control minimum.
    expect(sizeState(sizeControl(3))).toEqual([false, true, true, false]);
    // A generated tip reads the minimum diameter, never the size control minimum.
    expect(
      enabled(
        'shapeDynamics',
        'abr-shapeDynamics-sizeMinimum',
        edit(sizeControl(2), undefined, { tipKind: 'computedBrush' })
      )
    ).toBe(false);
    // "Always use pressure for size" replaces the control.
    const forced = edit(sizeControl(1), 'tool', { pressureOverridesSize: true });
    expect(enabled('shapeDynamics', 'abr-shapeDynamics-sizeControl', forced)).toBe(false);
    expect(enabled('shapeDynamics', 'abr-shapeDynamics-sizeFade', forced)).toBe(false);

    const transfer = edit(brush(), undefined, { useTransfer: true });
    const opacity = (control: number) => edit(transfer, 'transfer', { opacityControl: control });
    const opacityState = (b: Brush) =>
      ['Jitter', 'Control', 'Minimum', 'Fade'].map((k) => enabled('transfer', `abr-transfer-opacity${k}`, b));
    expect(opacityState(opacity(0))).toEqual([true, true, false, false]);
    expect(opacityState(opacity(2))).toEqual([true, true, true, false]);
    expect(opacityState(opacity(1))).toEqual([true, true, true, true]);
    expect(opacityState(edit(opacity(1), 'tool', { pressureOverridesOpacity: true }))).toEqual([
      false,
      false,
      false,
      false
    ]);

    const scattering = edit(brush(), undefined, { useScattering: true });
    expect(enabled('scattering', 'abr-scattering-control', scattering)).toBe(false);
    const scattered = edit(scattering, 'scattering', { scatter: 50, control: 1 });
    expect(enabled('scattering', 'abr-scattering-control', scattered)).toBe(true);
    expect(enabled('scattering', 'abr-scattering-fade', scattered)).toBe(true);
    expect(enabled('scattering', 'abr-scattering-countFade', scattered)).toBe(false);

    const color = edit(brush(), undefined, { useColorDynamics: true });
    expect(enabled('colorDynamics', 'abr-colorDynamics-fade', color)).toBe(false);
    expect(enabled('colorDynamics', 'abr-colorDynamics-fade', edit(color, 'colorDynamics', { control: 1 }))).toBe(true);
  });

  it('says in each status which controls a dynamic uses, or what it varies, in a line that fits the column', () => {
    const shape = edit(brush(), undefined, { useShapeDynamics: true });
    expect(status('shapeDynamics', shape)).toBe('No variation');
    expect(status('shapeDynamics', edit(shape, 'shapeDynamics', { sizeJitter: 20 }))).toBe('Size jitter 20%');
    expect(status('shapeDynamics', edit(shape, 'shapeDynamics', { sizeControl: 2, angleControl: 6 }))).toBe(
      'Pressure + Direction'
    );
    const transfer = edit(brush(), undefined, { useTransfer: true });
    expect(status('transfer', edit(transfer, 'transfer', { flowControl: 2 }))).toBe('Pressure');
    const color = edit(brush(), undefined, { useColorDynamics: true });
    expect(status('colorDynamics', edit(color, 'colorDynamics', { hueJitter: 27, saturationJitter: 25 }))).toBe(
      'Hue 27% · Sat. 25%'
    );
    expect(status('scattering', edit(brush(), undefined, { useScattering: true }))).toMatch(/^Spread \d+% · ×\d+$/);
    expect(abrCategories.find((c) => c.id === 'colorDynamics')!.label).toBe('Color dynamics');
  });

  it('shows the smoothing that changes an ABR stroke under one name: the Smoothing level, then the preset’s own', () => {
    expect(abrCategories.filter((c) => /smooth|correction/i.test(`${c.id} ${c.label}`)).map((c) => c.label)).toEqual([
      'Smoothing'
    ]);
    const category = abrCategories.find((c) => c.id === 'smoothing')!;
    expect(category.settings.map((r) => [r.section, r.label])).toEqual([
      [undefined, 'Smoothing'],
      [undefined, 'Catch up on pen lift'],
      ['Photoshop smoothing', 'Amount'],
      ['Photoshop smoothing', 'Pulled string'],
      ['Photoshop smoothing', 'Catch up'],
      ['Photoshop smoothing', 'Catch up at stroke end'],
      ['Photoshop smoothing', 'Adjust for zoom']
    ]);
    const level = setting('smoothing', 'smoothing');
    const amount = setting('smoothing', 'abr-smoothing-amount');
    if (level.kind !== 'number' || amount.kind !== 'number') {
      throw new Error('Expected the Smoothing level and an amount');
    }

    // At level 0 the preset smooths as Photoshop does; above it the stabilizer replaces that, and the curve applies.
    const b = brush();
    expect(level.read(b)).toBe(0);
    expect(amount.enabled(b)).toBe(true);
    expect(setting('smoothing', 'catch-up').enabled(b)).toBe(false);
    const stabilized = { ...b, ...level.write(b, 6) };
    expect(stabilized.stroke).toMatchObject({ mode: 'stabilizer', stabilizer: 6 });
    expect(status('smoothing', stabilized)).toBe('6');
    expect(amount.enabled(stabilized)).toBe(false);
    expect(setting('smoothing', 'catch-up').enabled(stabilized)).toBe(true);
    // The brush's own pressure numbers, kept for old boards, apply to an ABR brush only in the stabilizer.
    expect(legacyPressureCategory.settings[0]!.enabled(stabilized)).toBe(true);
    expect(legacyPressureCategory.settings[0]!.enabled(b)).toBe(false);
    expect({ ...stabilized, ...level.write(stabilized, 0) }.stroke.mode).toBe('studio');

    const smoothed = { ...b, ...amount.write(b, 30) };
    expect(abrValues(smoothed).useSmoothing).toBe(true);
    expect(abrValues(smoothed).smoothing.amount).toBe(30);
    expect(status('smoothing', smoothed)).toBe('30%');
    const off = { ...smoothed, ...amount.write(smoothed, 0) };
    expect(abrValues(off).useSmoothing).toBe(false);
    expect(amount.read(off)).toBe(0);
    expect(status('smoothing', off)).toBe('Off');
    expect(setting('smoothing', 'abr-smoothing-pulledString').enabled(off)).toBe(false);

    // Raw input reads as level 0 and no amount; a raised amount lets the preset smooth again.
    const raw = { ...smoothed, stroke: { ...smoothed.stroke, mode: 'none' as const } };
    expect(level.read(raw)).toBe(0);
    expect(amount.read(raw)).toBe(0);
    expect(status('smoothing', raw)).toBe('Off');
    const again = { ...raw, ...amount.write(raw, 40) };
    expect(again.stroke.mode).toBe('studio');
    expect(amount.read(again)).toBe(40);
  });

  it('carries no explanatory text in any category', () => {
    for (const category of abrCategories) {
      expect(Object.keys(category), category.id).not.toContain('about');
      expect(Object.keys(category), category.id).not.toContain('note');
      for (const row of category.settings) {
        if (row.kind === 'choice') {
          expect(
            row.options.every((option) => Object.keys(option).sort().join() === 'label,value'),
            row.id
          ).toBe(true);
        }
      }
    }
  });
});
