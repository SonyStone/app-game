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
    expect(new Set(brushCategories.map((category) => category.id)).size).toBe(5);
    expect(brushCategories.map((category) => category.group)).toEqual([
      'basics',
      'basics',
      'basics',
      'advanced',
      'advanced'
    ]);
    for (const setting of settings) {
      expect(setting.id).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
      expect(getBrushSetting(setting.id)).toBe(setting);
    }
    expect(getBrushSetting('missing')).toBeUndefined();
  });

  for (const [engine, original] of brushes) {
    for (const mode of modes) {
      it(`${engine}/${mode} preserves engine applicability and mode enablement`, () => {
        const brush = { ...original, stroke: { ...original.stroke, mode } };
        expect(brushCategories.filter((category) => category.applies(brush)).map((category) => category.id)).toEqual(
          engine === 'abr'
            ? ['painting', 'brush-tip', 'stroke-correction', 'pen-pressure']
            : ['painting', 'brush-tip', 'pressure', 'stroke-correction', 'pen-pressure']
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
          'stabilization',
          'stabilizer-level',
          'catch-up',
          'pressure-minimum',
          'pressure-maximum',
          'pressure-firmness'
        ]);
        for (const row of rows) {
          const enabled =
            row.id === 'stabilization'
              ? mode === 'normal' || mode === 'smooth'
              : row.id === 'stabilizer-level'
                ? mode === 'stabilizer'
                : row.id === 'catch-up'
                  ? mode === 'smooth'
                  : ['pressure-minimum', 'pressure-maximum', 'pressure-firmness'].includes(row.id)
                    ? ['normal', 'smooth', 'stabilizer'].includes(mode)
                    : true;
          expect(row.enabled(brush), row.id).toBe(enabled);
        }
      });
    }
  }

  for (const [engine, brush] of brushes) {
    for (const setting of brushCategories.flatMap((category) => category.settings)) {
      if (setting.kind !== 'number') {
        continue;
      }

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

  it('preserves the independent Leonardo levels and normalizes every stroke patch', () => {
    const setting = numeric('stabilization');
    for (const mode of modes) {
      const brush = { ...defaultBrush(), stroke: { ...defaultBrush().stroke, mode } };
      const patch = setting.write(brush, 23);
      expect(patch.stroke?.[mode === 'smooth' ? 'smooth' : 'normal']).toBe(23);
      expect(patch.stroke?.[mode === 'smooth' ? 'normal' : 'smooth']).toBe(mode === 'smooth' ? 1 : 10);
    }
    const brush = defaultBrush();
    for (const setting of brushCategories.flatMap((category) => category.settings)) {
      if (setting.kind === 'toggle') {
        const patch = setting.write(brush, !setting.read(brush));
        expect(setting.read({ ...brush, ...patch })).toBe(!setting.read(brush));
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
      brushCategories
        .flatMap((category) => category.settings)
        .filter((setting) => setting.kind === 'number')
        .map((setting) => [setting.id, setting.min(brush), setting.max(brush), setting.step, setting.unit])
    ).toEqual([
      ['size', 1, 512, 1, 'px'],
      ['opacity', 1, 100, 1, '%'],
      ['flow', 1, 100, 1, '%'],
      ['hardness', 0, 100, 1, '%'],
      ['spacing', 1, 1000, 1, '%'],
      ['stabilization', 0, 49, 1, ''],
      ['stabilizer-level', 0, 22, 1, ''],
      ['pressure-minimum', 0, 79, 1, '%'],
      ['pressure-maximum', 6, 100, 1, '%'],
      ['pressure-firmness', 10, 500, 5, '%']
    ]);
    expect(numeric('size').max(brushes[2]![1])).toBe(5000);
    expect(numeric('size').curve?.(brush)).toBeDefined();
    expect(numeric('spacing').curve?.(brush)).toBeDefined();
    expect(numeric('stabilizer-level').format?.(18)).toBe('S-3');
    expect(getBrushSetting('smoothing')).toMatchObject({
      options: [
        { value: 'none', label: 'None (raw input)' },
        { value: 'studio', label: 'Studio' },
        { value: 'normal', label: 'Leonardo normal' },
        { value: 'smooth', label: 'Leonardo smooth' },
        { value: 'stabilizer', label: 'Stabilizer (Paint Tool SAI)' }
      ]
    });
    expect(brushCategories.find((category) => category.id === 'stroke-correction')!.about).toBeUndefined();
    expect(getBrushSetting('color-mixing')).toMatchObject({
      options: [
        { value: 'linear', label: 'Smooth color' },
        { value: 'classic', label: 'Classic' }
      ]
    });
  });

  it('describes each smoothing mode, with one note shared by both Leonardo modes', () => {
    const smoothing = getBrushSetting('smoothing');
    if (smoothing?.kind !== 'choice') {
      throw new Error('Expected the smoothing choice');
    }

    const description = (value: string) => smoothing.options.find((option) => option.value === value)!.description;
    expect(description('none')).toMatch(/^No path smoothing/);
    expect(description('studio')).toMatch(/^Paint's original smoothing/);
    expect(description('normal')).toMatch(/^Higher stabilization/);
    expect(description('smooth')).toBe(description('normal'));
    expect(description('stabilizer')).toMatch(/^As in Paint Tool SAI/);
    expect(getBrushSetting('color-mixing')).toMatchObject({ options: [{}, {}] });
  });

  it('summarizes painting, tips, pressure, and correction modes', () => {
    const brush = defaultBrush();
    const status = (id: string, b = brush) => brushCategories.find((category) => category.id === id)!.status(b);
    expect(status('painting')).toBe('32 px · 100%');
    expect(status('brush-tip')).toBe('Soft round · 65%');
    expect(status('brush-tip', brushes[1]![1])).toBe('Textured tip · 12%');
    expect(status('brush-tip', brushes[2]![1])).toBe('ABR brush');
    expect(brushCategories.find((category) => category.id === 'brush-tip')!.note?.(brushes[2]![1])).toBe(
      'ABR presets keep their own tip shape and pressure dynamics.'
    );
    for (const [pressureSize, pressureFlow, expected] of [
      [true, true, 'Size + Flow'],
      [true, false, 'Size'],
      [false, true, 'Flow'],
      [false, false, 'Off']
    ] as const) {
      expect(status('pressure', { ...brush, pressureSize, pressureFlow })).toBe(expected);
    }
    const expected = ['None', 'Studio', 'Leonardo normal · 1', 'Leonardo smooth · 10', 'Stabilizer · S-3'];
    modes.forEach((mode, index) => {
      const b = { ...brush, stroke: { ...brush.stroke, mode, stabilizer: 18 } };
      expect(status('stroke-correction', b)).toBe(expected[index]);
      expect(status('pen-pressure', b)).toBe(['none', 'studio'].includes(mode) ? 'Off' : '5–80%');
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
    for (const setting of brushCategories.flatMap((category) => category.settings)) {
      const patch =
        setting.kind === 'number'
          ? setting.write(brush, setting.read(brush) === setting.max(brush) ? setting.min(brush) : setting.max(brush))
          : setting.kind === 'toggle'
            ? setting.write(brush, !setting.read(brush))
            : setting.write(brush, setting.options.find((option) => option.value !== setting.read(brush))!.value);
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
