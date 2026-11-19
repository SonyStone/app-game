import { defaultBrush, type Brush } from '@app-game/paint-core/brush';
import { normalizeStrokeSettings, type StrokeSettings } from '@app-game/paint-core/strokeSettings';
import { describe, expect, it } from 'vitest';
import {
  brushCategories,
  brushSettingsDiffer,
  getBrushSetting,
  snapshotBrushSettings,
  type NumberSetting
} from './index';
import { legacyPressureCategory, numberSettings } from './schema';

const modes: StrokeSettings['mode'][] = ['none', 'studio', 'normal', 'smooth', 'stabilizer'];
const brushes: [string, Brush][] = [
  ['round', defaultBrush()],
  ['textured', { ...defaultBrush(), engine: { id: 'textured', settings: {} } }],
  ['abr', { ...defaultBrush(), engine: { id: 'abr', settings: {} } }]
];

describe('brush editor schema', () => {
  it('has unique kebab-case IDs and finds every setting, including hidden ones', () => {
    const settings = brushCategories.flatMap((category) => category.settings);
    expect(new Set(settings.map((setting) => setting.id)).size).toBe(settings.length);
    expect(new Set(brushCategories.map((category) => category.id)).size).toBe(4);
    expect(brushCategories.map((category) => category.group)).toEqual(['basics', 'basics', 'basics', 'advanced']);
    // The brush's own pressure numbers are no category's any more, but old board parts still find them.
    expect(brushCategories.map((category) => category.id)).not.toContain('pressure-curve');
    for (const setting of [...settings, ...legacyPressureCategory.settings]) {
      expect(setting.id).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
      expect(getBrushSetting(setting.id)).toBe(setting);
    }
    expect(getBrushSetting('missing')).toBeUndefined();
    expect(getBrushSetting('stabilizer-level')).toBeUndefined();
  });

  for (const [engine, original] of brushes) {
    for (const mode of modes) {
      it(`${engine}/${mode} preserves engine applicability and mode enablement`, () => {
        const brush = { ...original, stroke: { ...original.stroke, mode } };
        expect(brushCategories.filter((category) => category.applies(brush)).map((category) => category.id)).toEqual(
          engine === 'abr'
            ? ['painting', 'stroke-correction']
            : ['painting', 'brush-tip', 'dynamics', 'stroke-correction']
        );
        const rows = brushCategories
          .flatMap((category) => category.settings)
          .filter((setting) => setting.applies(brush));
        expect(rows.map((row) => row.id)).toEqual([
          'size',
          'opacity',
          'flow',
          'color-mixing',
          ...(engine === 'round' ? ['hardness'] : engine === 'textured' ? ['spacing'] : []),
          ...(engine === 'abr' ? [] : ['pressure-size', 'pressure-flow']),
          'smoothing',
          'catch-up'
        ]);
        // An ABR preset smooths by itself in the Leonardo modes and Studio, so only the stabilizer trails and calibrates.
        const trails = engine === 'abr' ? mode === 'stabilizer' : ['normal', 'smooth', 'stabilizer'].includes(mode);
        for (const row of [...rows, ...legacyPressureCategory.settings]) {
          const legacy = ['pressure-minimum', 'pressure-maximum', 'pressure-firmness'];
          const enabled = row.id === 'catch-up' || legacy.includes(row.id) ? trails : true;
          expect(row.enabled(brush), row.id).toBe(enabled);
        }
      });
    }
  }

  for (const [engine, brush] of brushes) {
    for (const setting of numberSettings(brushCategories.flatMap((category) => category.settings))) {
      it(`${engine}/${setting.id} clamps, rounds, and round-trips UI units`, () => {
        const readWrite = (value: number) => setting.read({ ...brush, ...setting.write(brush, value) });
        expect(readWrite(-Infinity)).toBeCloseTo(setting.min(brush));
        expect(readWrite(Infinity)).toBeCloseTo(setting.max(brush));
        const value = Math.ceil(setting.min(brush) / setting.step) * setting.step + setting.step;
        expect(readWrite(value)).toBeCloseTo(value);
        expect(readWrite(value + setting.step * 0.4)).toBeCloseTo(value);
        expect(readWrite(value + setting.step * 0.6)).toBeCloseTo(value + setting.step);
        const patch = setting.write(brush, value);
        if (patch.stroke) {
          expect(patch.stroke).toEqual(normalizeStrokeSettings(patch.stroke));
        }
        expect(brush).toEqual(
          engine === 'round' ? defaultBrush() : { ...defaultBrush(), engine: { id: engine, settings: {} } }
        );
      });
    }
  }

  it('normalizes every stroke patch of a switch or a choice', () => {
    const brush = { ...defaultBrush(), stroke: { ...defaultBrush().stroke, mode: 'stabilizer' as const } };
    for (const setting of brushCategories.flatMap((category) => category.settings)) {
      if (setting.kind === 'toggle') {
        const patch = setting.write(brush, !setting.read(brush));
        expect(setting.read({ ...brush, ...patch })).toBe(!setting.read(brush));
        if (patch.stroke) {
          expect(patch.stroke).toEqual(normalizeStrokeSettings(patch.stroke));
        }
      }
      if (setting.kind === 'choice') {
        for (const option of setting.options) {
          const patch = setting.write(brush, option.value);
          expect(setting.read({ ...brush, ...patch })).toBe(option.value);
          if (patch.stroke) {
            expect(patch.stroke).toEqual(normalizeStrokeSettings(patch.stroke));
          }
        }
        expect(() => setting.write(brush, 'invalid')).toThrow(RangeError);
      }
    }
  });

  it('keeps pressure bounds increasing at both extremes and with fractional initial bounds', () => {
    for (const minimum of [0, 0.05, 0.054, 0.99]) {
      for (const maximum of [minimum + 0.01, 1]) {
        const brush = { ...defaultBrush(), stroke: { ...defaultBrush().stroke, minimum, maximum } };
        for (const id of ['pressure-minimum', 'pressure-maximum']) {
          const setting = numeric(id);
          for (const value of [-100, 0, 50, 100, 200]) {
            const stroke = setting.write(brush, value).stroke!;
            expect(stroke.minimum).toBeLessThan(stroke.maximum);
            expect(stroke.maximum - stroke.minimum).toBeGreaterThanOrEqual(0.01 - 1e-12);
          }
        }
      }
    }
  });

  it('provides the panel ranges, steps, units, curves, and named options', () => {
    const brush = defaultBrush();
    expect(
      numberSettings(brushCategories.flatMap((category) => category.settings)).map((setting) => [
        setting.id,
        setting.min(brush),
        setting.max(brush),
        setting.step,
        setting.unit
      ])
    ).toEqual([
      ['size', 1, 512, 1, 'px'],
      ['opacity', 1, 100, 1, '%'],
      ['flow', 1, 100, 1, '%'],
      ['hardness', 0, 100, 1, '%'],
      ['spacing', 1, 1000, 1, '%'],
      ['smoothing', 0, 22, 1, '']
    ]);
    expect(
      legacyPressureCategory.settings.map((setting) => [
        setting.id,
        (setting as NumberSetting).min(brush),
        (setting as NumberSetting).max(brush),
        (setting as NumberSetting).step
      ])
    ).toEqual([
      ['pressure-minimum', 0, 79, 1],
      ['pressure-maximum', 6, 100, 1],
      ['pressure-firmness', 10, 500, 5]
    ]);
    expect(numeric('size').max(brushes[2]![1])).toBe(5000);
    expect(numeric('size').curve?.(brush)).toBeDefined();
    expect(numeric('spacing').curve?.(brush)).toBeDefined();
    // Smoothing's levels are plain numbers, the strong ones above 15 in a zone of their own.
    expect(numeric('smoothing').format).toBeUndefined();
    expect(numeric('smoothing').levels?.map((level) => level.label)).toEqual(
      Array.from({ length: 23 }, (_, level) => String(level))
    );
    expect(
      numeric('smoothing')
        .levels?.filter((level) => level.zone)
        .map((level) => level.value)
    ).toEqual([16, 17, 18, 19, 20, 21, 22]);
    expect(getBrushSetting('color-mixing')).toMatchObject({
      options: [
        { value: 'linear', label: 'Smooth color' },
        { value: 'classic', label: 'Classic' }
      ]
    });
  });

  it('carries no explanatory text: no option, category or row has a description, an about or a note', () => {
    for (const category of brushCategories) {
      expect(Object.keys(category).sort()).toEqual(['applies', 'group', 'id', 'label', 'settings', 'status']);
      for (const setting of category.settings) {
        if (setting.kind === 'choice') {
          for (const option of setting.options) {
            expect(Object.keys(option).sort()).toEqual(['label', 'value']);
          }
        }
      }
    }
  });

  it('summarizes painting, tips, pressure, and correction modes', () => {
    const brush = defaultBrush();
    const status = (id: string, b = brush) => brushCategories.find((category) => category.id === id)!.status(b);
    expect(status('painting')).toBe('32 px · 100%');
    expect(status('brush-tip')).toBe('Soft round · 65%');
    expect(status('brush-tip', brushes[1]![1])).toBe('Textured tip · 12%');
    expect(status('brush-tip', brushes[2]![1])).toBe('ABR brush');
    for (const [pressureSize, pressureFlow, expected] of [
      [true, true, 'Pressure → Size + Flow'],
      [true, false, 'Pressure → Size'],
      [false, true, 'Pressure → Flow'],
      [false, false, 'Off']
    ] as const) {
      expect(status('dynamics', { ...brush, pressureSize, pressureFlow })).toBe(expected);
    }
    const expected = ['Off', 'Off', '1', '10', '18'];
    modes.forEach((mode, index) => {
      const b = { ...brush, stroke: { ...brush.stroke, mode, stabilizer: 18 } };
      expect(status('stroke-correction', b)).toBe(expected[index]);
      expect(legacyPressureCategory.status(b)).toBe(['none', 'studio'].includes(mode) ? 'Off' : '5–80%');
    });
  });

  it('snapshots exactly edited fields and supports cancel without restoring tool, engine, or colors', () => {
    const brush = defaultBrush();
    const snapshot = snapshotBrushSettings(brush);
    expect(Object.keys(snapshot).sort()).toEqual(
      ['size', 'opacity', 'flow', 'mixing', 'hardness', 'spacing', 'pressureSize', 'pressureFlow', 'stroke'].sort()
    );
    expect(snapshot.stroke).not.toBe(brush.stroke);
    expect(brushSettingsDiffer(brush, snapshot)).toBe(false);
    for (const setting of [...brushCategories, legacyPressureCategory].flatMap((category) => category.settings)) {
      const patch =
        setting.kind === 'number'
          ? setting.write(brush, setting.read(brush) === setting.max(brush) ? setting.min(brush) : setting.max(brush))
          : setting.kind === 'toggle'
            ? setting.write(brush, !setting.read(brush))
            : setting.kind === 'choice'
              ? setting.write(brush, setting.options.find((option) => option.value !== setting.read(brush))!.value)
              : {};
      const edited = { ...brush, ...patch };
      expect(brushSettingsDiffer(edited, snapshot), setting.id).toBe(true);
      expect(brushSettingsDiffer({ ...edited, ...snapshot }, snapshot)).toBe(false);
    }
    const other = {
      ...brush,
      color: '#ffffff',
      backgroundColor: '#000000',
      tool: 'eraser' as const,
      engine: { id: 'abr', settings: {} }
    };
    expect(brushSettingsDiffer(other, snapshot)).toBe(false);
    brush.stroke.normal = 40;
    expect(snapshot.stroke.normal).toBe(1);
    expect(brushSettingsDiffer(brush, snapshot)).toBe(true);
  });
});

function numeric(id: string): NumberSetting {
  const setting = getBrushSetting(id);
  if (setting?.kind !== 'number') {
    throw new Error(`Expected number setting ${id}`);
  }

  return setting;
}
