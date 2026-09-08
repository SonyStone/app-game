import {
  brushToFormValues,
  descriptorColorClipped,
  descriptorRgbColor,
  formValuesToBrush
} from '@app-game/abr-brush/form';
import { AbrParser, AbrWriter, createAbrFile } from '@app-game/abr-parser/browser';
import { labD50ToRgb } from '../../../chroma/io/lab/labD50ToRgb';
import { expect, it } from 'vitest';
import native from '../../../abr-brush/fixtures/photoshop-lab-raster.json';
import { viewerBrush } from '../brushLibrary/viewerBrush';

it.each(native.cases)('converts Lab $lab while exposing sRGB gamut loss', ({ lab, pixel }) => {
  const color = descriptor(lab);
  const raw = labD50ToRgb(lab[0]!, lab[1]!, lab[2]!);
  const clipped = raw.some((channel) => channel < -0.001 || channel > 255.001);
  expect(descriptorColorClipped(color)).toBe(clipped);
  const original = preset(lab);
  const hex = descriptorRgbColor(color)!;
  expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  expect(brushToFormValues(original).tool.foreground).toBe(hex);
  expect(viewerBrush(original).color).toBe(hex);
  // Native fills, not SolidColor.rgb, are the rendered-color oracle. Out-of-gamut ACE mapping is not reproduced.
  if (!clipped) {
    const expected = '#' + pixel.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('');
    expect(hex).toBe(expected);
  }
});

it('keeps the number of native in-gamut comparisons explicit', () => {
  expect(native.cases.filter(({ lab }) => !descriptorColorClipped(descriptor(lab)))).toHaveLength(23);
});

it('preserves Lab precision and unknown keys until an explicit RGB edit or clear, including ABR round trips', () => {
  const original = preset([50.125, 20.25, -10.75]);
  const values = brushToFormValues(original);
  values.tool.flow = 17;
  const changed = formValuesToBrush(original, values);
  const read = (brush: typeof changed) =>
    new AbrParser().parse(new AbrWriter().write(createAbrFile([brush]))).brushes[0]!;
  const reopened = read(changed);
  expect(reopened.settings.toolOptions).toMatchObject({ FrgC: original.settings.toolOptions.FrgC, flow: 17 });
  const edited = brushToFormValues(reopened);
  edited.tool.foreground = '#123456';
  const rgb = read(formValuesToBrush(reopened, edited));
  expect(rgb.settings.toolOptions).toMatchObject({ FrgC: { __classId: 'RGBC', 'Rd  ': 18, 'Grn ': 52, 'Bl  ': 86 } });
  expect(descriptorColorClipped((rgb.settings.toolOptions as Record<string, unknown>).FrgC)).toBe(false);
  edited.tool.foreground = '';
  expect(read(formValuesToBrush(reopened, edited)).settings.toolOptions).not.toHaveProperty('FrgC');
});

it('rejects invalid Lab channels and units without emitting malformed colors', () => {
  for (const color of [
    descriptor([-1, 0, 0]),
    descriptor([101, 0, 0]),
    descriptor([50, -129, 0]),
    descriptor([50, 0, 128]),
    descriptor([NaN, 0, 0]),
    descriptor([50, Infinity, 0]),
    descriptor([50]),
    { ...descriptor([50, 0, 0]), Lmnc: { unit: '#Pxl', value: 50 } }
  ]) {
    expect(descriptorRgbColor(color)).toBeUndefined();
    expect(descriptorColorClipped(color)).toBe(false);
  }
});

function descriptor(lab: readonly number[]) {
  return { __classId: 'LbCl', Lmnc: lab[0], 'A   ': lab[1], 'B   ': lab[2], futureField: 17 };
}
function preset(lab: readonly number[]) {
  return {
    id: 'lab',
    name: 'Lab',
    type: 'computed' as const,
    spacing: 25,
    settings: { toolOptions: { __classId: 'PbTl', FrgC: descriptor(lab) } }
  };
}
