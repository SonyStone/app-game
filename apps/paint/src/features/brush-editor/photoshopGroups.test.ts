import type { BrushFormValues } from '@app-game/abr-brush/form';
import type { BrushAsset } from '@app-game/abr-brush/library';
import { settingGroups } from '@app-game/abr-brush/settings-fields';
import { initAbr, pixels } from '@app-game/abr-parser';
import { defaultBrush } from '@app-game/paint-core/brush';
import { describe, expect, it } from 'vitest';
import { convertAbr } from '../brush-library/abrPresetDocument';
import { brushView, type BrushView } from './brushView';
import { brushCategories } from './schema';

await initAbr();

const source: BrushAsset = {
  id: 'test',
  name: 'Test',
  preset: { kind: 'brush', sourceId: 'one', tip: { kind: 'computed', diameter: pixels(30) } },
  resources: [],
  source: { format: 'photoshop-abr/v1', bytes: new Uint8Array() }
};
const imported = await convertAbr(source);

/** The imported computed preset's view. */
function brush(): BrushView {
  return brushView(imported.preset.abrDocument, { ...defaultBrush(), ...imported.preset.settings });
}

/** `view` reading the fields of `patch` in its form values, at their root or in `group`, as rules and statuses do. */
function edit(view: BrushView, group: keyof BrushFormValues | undefined, patch: Record<string, unknown>): BrushView {
  const values = view.values;
  const next = group ? { ...values, [group]: { ...(values[group] as object), ...patch } } : { ...values, ...patch };
  return { ...view, values: next as BrushFormValues };
}

/** The view after a row wrote `text`. */
function after(view: BrushView, text: string) {
  return brushView(text, view.brush);
}

/** The categories generated from the Photoshop groups. */
const generated = [
  'shapeDynamics',
  'transfer',
  'scattering',
  'texture',
  'dualBrush',
  'colorDynamics',
  'brushPose',
  'bristle',
  'erodible'
];

/** The setting `id` of the category `category`. */
function setting(category: string, id: string) {
  const found = brushCategories.find((c) => c.id === category)!.settings.find((r) => r.id === id);
  if (!found) {
    throw new Error(`No setting ${id}`);
  }

  return found;
}

/** The status of the category `id` for `view`. */
function status(id: string, view: BrushView) {
  return brushCategories.find((c) => c.id === id)!.status(view);
}

describe('generated ABR settings', () => {
  it('generates rows for every engine group, without stored-only fields', () => {
    expect(generated.every((id) => brushCategories.some((c) => c.id === id))).toBe(true);
    expect(brushCategories.every((c) => c.settings.length > 0)).toBe(true);
    const rows = brushCategories.flatMap((c) => c.settings);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    expect(rows.some((r) => /stored only|Tip Wear|Load solid|Pattern Name|Saved foreground/.test(r.label))).toBe(false);
  });

  it('round trips every generated field through the document', () => {
    for (const category of brushCategories.filter((c) => generated.includes(c.id))) {
      for (const row of category.settings) {
        const b = brush();
        const next =
          row.kind === 'number'
            ? row.write(b, row.min(b) + 1)
            : row.kind === 'toggle'
              ? row.write(b, !row.read(b))
              : row.write(b, row.options.at(-1)!.value);
        const written = after(b, next);
        // Reading the document anew gives what the edit wrote.
        expect(row.read(after(written, written.text)), row.id).toEqual(row.read(written));
      }
    }
  });

  it('keeps switched-off rows visible and disabled, and enables them with the group', () => {
    for (const category of brushCategories.filter((c) =>
      ['shapeDynamics', 'scattering', 'colorDynamics', 'transfer', 'brushPose'].includes(c.id)
    )) {
      const toggle = category.settings[0]!;
      expect(toggle.kind).toBe('toggle');
      if (toggle.kind !== 'toggle') {
        continue;
      }
      const off = after(brush(), toggle.write(brush(), false));
      expect(category.status(off)).toBe('Off');
      expect(category.settings.slice(1).every((r) => !r.enabled(off))).toBe(true);
      const on = after(off, toggle.write(off, true));
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

  it('can switch on a texture whose pattern the document has, and greys per-tip rows until they apply', () => {
    const category = brushCategories.find((c) => c.id === 'texture')!;
    const b = { ...brush(), images: { pattern: true, dual: false } };
    const toggle = category.settings[0]!;
    expect(toggle.enabled(b)).toBe(true);
    expect(category.settings.slice(1).every((r) => !r.enabled(b))).toBe(true);
    const on = edit(b, undefined, { useTexture: true });
    const perTip = ['depthJitter', 'depthControl', 'minimumDepth', 'depthFade'].map((key) => `abr-texture-${key}`);
    expect(category.settings.filter((r) => !r.enabled(on)).map((r) => r.id)).toEqual(perTip);
    const varied = edit(on, 'texture', { eachTip: true, depthControl: 1 });
    expect(category.settings.every((r) => r.enabled(varied))).toBe(true);
  });

  it('requires a texture pattern, not a stored second tip, and only shows physical groups for physical tips', () => {
    const b = brush();
    expect(brushCategories.find((c) => c.id === 'texture')!.settings.every((r) => !r.enabled(b))).toBe(true);
    const dual = brushCategories.find((c) => c.id === 'dualBrush')!;
    expect(dual.settings[0]!.enabled(b)).toBe(true);
    // A named sampled second tip needs its image; nothing can stand in for it.
    const named = edit(b, 'dualBrush', { tipId: 'missing' });
    expect(dual.settings.every((r) => !r.enabled(named))).toBe(true);
    expect(dual.status(edit(named, undefined, { useDualBrush: true }))).toBe('No embedded second tip');
    expect(dual.settings[0]!.enabled({ ...named, images: { pattern: false, dual: true } })).toBe(true);
    expect(brushCategories.find((c) => c.id === 'bristle')!.applies(b)).toBe(false);
    expect(brushCategories.find((c) => c.id === 'erodible')!.applies(b)).toBe(false);
  });

  it('groups each category under short headings and places every engine field once', () => {
    const transfer = brushCategories.find((c) => c.id === 'transfer')!.settings.filter((r) => r.applies(brush()));
    expect(transfer.map((r) => [r.section, r.label])).toEqual([
      [undefined, 'Use transfer'],
      ...['Opacity', 'Flow'].flatMap((section) =>
        ['Jitter', 'Control', 'Minimum', 'Fade length'].map((label) => [section, label])
      )
    ]);
    const shape = brushCategories.find((c) => c.id === 'shapeDynamics')!.settings;
    expect([...new Set(shape.flatMap((r) => r.section ?? []))]).toEqual(['Size', 'Angle', 'Roundness', 'Flip']);

    const hidden: Record<string, string[]> = {
      // The tool's Opacity and Flow are the rows every brush shares.
      tool: [
        'type',
        'foreground',
        'background',
        'pressureSmoothing',
        'legacy',
        'loadSolidColorOnly',
        'opacity',
        'flow'
      ],
      texture: ['patternId', 'patternName'],
      dualBrush: ['tipId'],
      erodible: ['physics'],
      // Smoothing has its own category: see the Smoothing test.
      smoothing: Object.keys(settingGroups.smoothing)
    };
    for (const [group, fields] of Object.entries(settingGroups)) {
      const placed = brushCategories
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
    for (const category of brushCategories) {
      const runs = category.settings.map((r) => r.section).filter((name, i, all) => name && name !== all[i - 1]);
      expect(runs, category.id).toEqual([...new Set(runs)]);
    }
  });

  it('greys a row whose value has no effect under the current control, as the engine reads it', () => {
    const shape = edit(brush(), undefined, { useShapeDynamics: true, tipKind: 'sampledBrush' });
    const enabled = (category: string, id: string, b: BrushView) => setting(category, id).enabled(b);
    const sizeRows = ['sizeFade', 'minimumDiameter', 'tiltScale', 'sizeMinimum'].map((k) => `abr-shapeDynamics-${k}`);
    const sizeState = (b: BrushView) => sizeRows.map((id) => enabled('shapeDynamics', id, b));
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
    const opacityState = (b: BrushView) =>
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
    expect(brushCategories.find((c) => c.id === 'colorDynamics')!.label).toBe('Color dynamics');
  });

  it('shows the smoothing that changes an ABR stroke under one name: the Smoothing level, then the preset’s own', () => {
    expect(brushCategories.filter((c) => /smooth|correction/i.test(`${c.id} ${c.label}`)).map((c) => c.label)).toEqual([
      'Stroke correction'
    ]);
    const category = brushCategories.find((c) => c.id === 'stroke-correction')!;
    expect(category.settings.map((r) => [r.section, r.label])).toEqual([
      [undefined, 'Smoothing'],
      [undefined, 'Catch up on pen lift'],
      ['Photoshop smoothing', 'Amount'],
      ['Photoshop smoothing', 'Pulled string'],
      ['Photoshop smoothing', 'Catch up'],
      ['Photoshop smoothing', 'Catch up at stroke end'],
      ['Photoshop smoothing', 'Adjust for zoom']
    ]);
    const level = setting('stroke-correction', 'smoothing');
    const amount = setting('stroke-correction', 'abr-smoothing-amount');
    if (level.kind !== 'number' || amount.kind !== 'number') {
      throw new Error('Expected the Smoothing level and an amount');
    }

    // At level 0 the preset smooths as Photoshop does; above it the stabilizer replaces that.
    const b = brush();
    expect(level.read(b)).toBe(0);
    expect(amount.enabled(b)).toBe(true);
    expect(setting('stroke-correction', 'catch-up').enabled(b)).toBe(false);
    const stabilized = after(b, level.write(b, 6));
    expect(stabilized.brush.stroke).toMatchObject({ mode: 'stabilizer', stabilizer: 6 });
    expect(status('stroke-correction', stabilized)).toBe('6');
    expect(amount.enabled(stabilized)).toBe(false);
    expect(setting('stroke-correction', 'catch-up').enabled(stabilized)).toBe(true);
    expect(after(stabilized, level.write(stabilized, 0)).brush.stroke.mode).toBe('studio');

    const smoothed = after(b, amount.write(b, 30));
    expect(smoothed.values.useSmoothing).toBe(true);
    expect(smoothed.values.smoothing.amount).toBe(30);
    expect(status('stroke-correction', smoothed)).toBe('30%');
    const off = after(smoothed, amount.write(smoothed, 0));
    expect(off.values.useSmoothing).toBe(false);
    expect(amount.read(off)).toBe(0);
    expect(status('stroke-correction', off)).toBe('Off');
    expect(setting('stroke-correction', 'abr-smoothing-pulledString').enabled(off)).toBe(false);

    // Raw input reads as level 0 and no amount; a raised amount lets the preset smooth again.
    const raw = {
      ...smoothed,
      brush: { ...smoothed.brush, stroke: { ...smoothed.brush.stroke, mode: 'none' as const } }
    };
    expect(level.read(raw)).toBe(0);
    expect(amount.read(raw)).toBe(0);
    expect(status('stroke-correction', raw)).toBe('Off');
    const again = after(raw, amount.write(raw, 40));
    expect(again.brush.stroke.mode).toBe('studio');
    expect(amount.read(again)).toBe(40);
  });

  it('carries no explanatory text in any category', () => {
    for (const category of brushCategories) {
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
