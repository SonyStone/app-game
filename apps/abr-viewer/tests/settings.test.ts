import { AbrParser, AbrWriter, createAbrFile } from '@app-game/abr-parser/browser';
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { brushToFormValues, formValuesToBrush } from '../src/features/brush-detail/brush-form-schema';
import { settingGroups } from '../src/features/brush-detail/settings-fields';
import { renderPreviewPixels } from '../src/features/brush-preview/cpu';
import {
  createPreviewStroke,
  generateComputedBrushTip,
  stampStride,
  type PreviewInput
} from '../src/features/brush-preview/stroke';

const source = new AbrParser().parse(readFileSync('../../packages/abr-parser/files/Brushes To Implement.abr'));
const brush = source.brushes[0]!;

test('Eraser Mode uses Photoshop native IDs and defaults to Brush', () => {
  expect(settingGroups.tool.eraserMode.options).toEqual([
    { label: 'Brush', value: 1 },
    { label: 'Pencil', value: 2 },
    { label: 'Block', value: 3 }
  ]);
  expect(brushToFormValues({ ...brush, settings: {} }).tool.eraserMode).toBe(1);
  for (const mode of [1, 2, 3]) {
    const original = { ...brush, settings: { toolOptions: { __classId: 'ErTl', ErsB: mode } } };
    const values = brushToFormValues(original);
    expect(values.tool.eraserMode).toBe(mode);
  }
});

test('tool options edit and export without changing unknown or dormant settings', () => {
  const original = {
    ...brush,
    settings: {
      ...brush.settings,
      toolOptions: {
        __classId: 'MixB',
        flow: 73,
        Opct: 42,
        wetness: 12,
        dryness: 54,
        mix: 67,
        'Md  ': { type: 'BlnM', value: 'Mltp' },
        autoClean: true,
        futureOption: 123
      }
    }
  };
  const values = brushToFormValues(original);
  expect(values.tool).toMatchObject({
    type: 'MixB',
    flow: 73,
    opacity: 42,
    wetness: 12,
    load: 54,
    mix: 67,
    mode: 'Mltp',
    autoClean: true
  });
  expect(formValuesToBrush(original, values)).toBe(original);
  Object.assign(values.tool, { type: 'ErTl', flow: 25, opacity: 80, mode: 'Scrn', pressureOverridesSize: true });
  const edited = formValuesToBrush(original, values);
  const parsed = new AbrParser().parse(
    new AbrWriter().write({ ...createAbrFile([edited]), rawPatternData: source.rawPatternData })
  );
  expect(parsed.errors).toEqual([]);
  expect(parsed.brushes[0]!.settings.toolOptions).toMatchObject({
    __classId: 'ErTl',
    flow: 25,
    Opct: 80,
    'Md  ': { type: 'BlnM', value: 'Scrn' },
    usePressureOverridesSize: true,
    wetness: 12,
    dryness: 54,
    mix: 67,
    futureOption: 123
  });
  expect(brushToFormValues(parsed.brushes[0]!).tool).toEqual(values.tool);
});

/** Assert actual wire keys, independently of the editor's binding table. */
test('Photoshop mappings survive writing and parsing the edited preset', () => {
  const v = brushToFormValues(brush);
  v.useScattering = v.useTransfer = v.useColorDynamics = v.useBrushPose = true;
  Object.assign(v.scattering, { scatter: 137, count: 4, countJitter: 19, control: 1, fade: 47 });
  Object.assign(v.transfer, { opacityJitter: 13, opacityMinimum: 17, flowJitter: 19, flowMinimum: 23 });
  Object.assign(v.colorDynamics, { hueJitter: 17, saturationJitter: 23, brightnessJitter: 11, purity: -27 });
  Object.assign(v.brushPose, { tiltX: 21, tiltY: -32, rotation: 127, pressure: 63, overridePressure: true });
  v.useNoise = true;
  v.useBuildUp = true;
  v.useProtectTexture = true;
  const edited = formValuesToBrush(brush, v);
  const parsed = new AbrParser().parse(
    new AbrWriter().write({ ...createAbrFile([edited]), rawPatternData: source.rawPatternData })
  );
  expect(parsed.errors).toEqual([]);
  expect(parsed.brushes[0]!.settings).toMatchObject({
    'Cnt ': 4,
    scatterDynamics: { __classId: 'brVr', jitter: { unit: '#Prc', value: 137 }, bVTy: 1, fStp: 47 },
    opVr: { jitter: { value: 13 }, 'Mnm ': { value: 17 } },
    prVr: { jitter: { value: 19 }, 'Mnm ': { value: 23 } },
    'H   ': { value: 17 },
    Strt: { value: 23 },
    Brgh: { value: 11 },
    purity: { value: -27 },
    brushPoseTiltX: 21,
    brushPoseTiltY: -32,
    brushPoseAngle: 127,
    brushPosePressure: { value: 63 },
    overridePosePressure: true,
    Nose: true,
    'Rpt ': true,
    protectTexture: true
  });
  expect(brushToFormValues(parsed.brushes[0]!)).toEqual(v);
});

test('opening a preset is a no-op and one edit leaves unrelated descriptor branches untouched', () => {
  const v = brushToFormValues(brush);
  expect(formValuesToBrush(brush, v)).toBe(brush);
  const original = brush.settings;
  v.scattering.scatter = 231;
  const edited = formValuesToBrush(brush, v);
  expect(edited.settings.Brsh).toBe(original.Brsh);
  expect(edited.settings.dualBrush).toBe(original.dualBrush);
  expect(edited.settings.prVr).toBe(original.prVr);
  expect(brushToFormValues(edited).scattering.scatter).toBe(231);
});

test('renaming a brush does not enable its dormant dual scattering settings', () => {
  const original = {
    ...brush,
    settings: {
      ...brush.settings,
      dualBrush: { __classId: 'dualBrush', useDualBrush: true, useScatter: false, Brsh: brush.settings.Brsh }
    }
  };
  const values = brushToFormValues(original);
  values.name += ' renamed';
  const edited = formValuesToBrush(original, values);
  expect(edited.settings.dualBrush).toBe(original.settings.dualBrush);
});

describe('all scalar controls round-trip while disabled', () => {
  for (const [group, fields] of Object.entries(settingGroups))
    for (const [key, field] of Object.entries(fields)) {
      if (field.kind === 'text') continue;
      test(`${group}.${key}`, () => {
        const v = brushToFormValues(brush),
          values = v[group as keyof typeof settingGroups] as Record<string, unknown>;
        const old = values[key];
        const next =
          field.kind === 'color'
            ? '#123456'
            : field.kind === 'boolean'
              ? !old
              : field.kind === 'choice'
                ? field.options!.find((option) => option.value !== old)!.value
                : old === field.min
                  ? field.max
                  : field.min;
        values[key] = next;
        const file = new AbrParser().parse(
          new AbrWriter().write({
            ...createAbrFile([formValuesToBrush(brush, v)]),
            rawPatternData: source.rawPatternData
          })
        );
        expect(file.errors).toEqual([]);
        expect(
          (brushToFormValues(file.brushes[0]!)[group as keyof typeof settingGroups] as Record<string, unknown>)[key]
        ).toBe(next);
      });
    }
});
function preview(): PreviewInput {
  return {
    values: brushToFormValues({
      id: 'p',
      name: 'Preview',
      type: 'computed',
      settings: {},
      diameter: 20,
      spacing: 15,
      hardness: 30
    }),
    width: 160,
    height: 64,
    dpr: 1,
    color: '#de6420',
    secondaryColor: '#226ddd',
    background: '#202020',
    opacity: 1,
    flow: 0.3
  };
}
const tip = generateComputedBrushTip(32, 30);
test('texture, dual brush and per-tip color each change painted pixels', () => {
  const input = preview(),
    base = renderPreviewPixels(input, tip);
  input.values.useTexture = true;
  input.values.texture.eachTip = true;
  input.values.texture.mode = 'Mltp';
  const pattern = {
    width: 4,
    height: 4,
    depth: 8 as const,
    data: Uint8Array.from({ length: 16 }, (_, i) => (i % 2 ? 255 : 0))
  };
  expect(renderPreviewPixels(input, tip, undefined, { pattern })).not.toEqual(base);
  input.values.useTexture = false;
  input.values.useDualBrush = true;
  input.values.dualBrush.diameter = 7;
  expect(renderPreviewPixels(input, tip, undefined, { dualTip: tip })).not.toEqual(base);
  input.values.useDualBrush = false;
  input.values.useColorDynamics = true;
  input.values.colorDynamics.applyPerTip = true;
  input.values.colorDynamics.foregroundBackgroundJitter = 100;
  expect(renderPreviewPixels(input, tip)).not.toEqual(base);
});
test('fade uses tip steps; pose overrides pressure', () => {
  const input = preview();
  input.values.useShapeDynamics = true;
  input.values.shapeDynamics.sizeControl = 1;
  input.values.shapeDynamics.sizeFade = 4;
  const stroke = createPreviewStroke(input, tip);
  expect(stroke.data[4 * stampStride + 2]).toBeCloseTo(0.025);
  input.values.shapeDynamics.sizeControl = 2;
  input.values.useBrushPose = true;
  input.values.brushPose.overridePressure = true;
  input.values.brushPose.pressure = 50;
  const posed = createPreviewStroke(input, tip);
  expect(posed.data[2]).toBeCloseTo(5);
  expect(posed.data[(posed.count - 1) * stampStride + 2]).toBeCloseTo(5);
});
test('build-up stamps while stationary; smoothing changes a jagged input path', () => {
  const input = preview();
  const point = { x: 0.5, y: 0.5, pressure: 1, tiltX: 0, tiltY: 0, rotation: 0, time: 0 };
  input.path = [point, { ...point, time: 1000 }];
  const once = createPreviewStroke(input, tip).count;
  input.values.useBuildUp = true;
  expect(createPreviewStroke(input, tip).count).toBeGreaterThan(once);
  input.values.useBuildUp = false;
  input.path = [
    { ...point, x: 0.1 },
    { ...point, x: 0.3, y: 0.8, time: 20 },
    { ...point, x: 0.6, y: 0.2, time: 40 },
    { ...point, x: 0.9, time: 60 }
  ];
  const rough = createPreviewStroke(input, tip).data;
  input.values.smoothing.amount = 90;
  expect(createPreviewStroke(input, tip).data).not.toEqual(rough);
});

test('saved RGB colors preserve fractional source values until edited and can be removed on export', () => {
  const original = {
    ...brush,
    settings: {
      ...brush.settings,
      toolOptions: {
        __classId: 'PbTl',
        FrgC: { __classId: 'RGBC', 'Rd  ': 18.4, 'Grn ': 52, 'Bl  ': 86, futureChannel: 9 },
        BckC: { __classId: 'RGBC', 'Rd  ': 255, 'Grn ': 255, 'Bl  ': 255 }
      }
    }
  };
  const values = brushToFormValues(original);
  expect(values.tool.foreground).toBe('#123456');
  expect(formValuesToBrush(original, values)).toBe(original);
  values.name = 'Only renamed';
  expect(formValuesToBrush(original, values).settings.toolOptions).toEqual(original.settings.toolOptions);
  values.tool.foreground = '#fa8040';
  values.tool.background = '';
  const edited = formValuesToBrush(original, values);
  const parsed = new AbrParser().parse(
    new AbrWriter().write({
      ...createAbrFile([edited]),
      rawPatternData: source.rawPatternData
    })
  );
  expect(parsed.errors).toEqual([]);
  expect(parsed.brushes[0]!.settings.toolOptions).toMatchObject({
    FrgC: { __classId: 'RGBC', 'Rd  ': 250, 'Grn ': 128, 'Bl  ': 64, futureChannel: 9 }
  });
  expect(parsed.brushes[0]!.settings.toolOptions).not.toHaveProperty('BckC');
  expect(brushToFormValues(parsed.brushes[0]!).tool.background).toBe('');
});

test('unrecognized saved color descriptors survive unrelated edits', () => {
  const original = {
    ...brush,
    settings: {
      ...brush.settings,
      toolOptions: {
        __classId: 'PbTl',
        FrgC: { __classId: 'futureColorSpace', channel: 42 }
      }
    }
  };
  const values = brushToFormValues(original);
  expect(values.tool.foreground).toBe('');
  values.tool.flow = 31;
  expect(formValuesToBrush(original, values).settings.toolOptions).toMatchObject({
    FrgC: original.settings.toolOptions.FrgC
  });
});
