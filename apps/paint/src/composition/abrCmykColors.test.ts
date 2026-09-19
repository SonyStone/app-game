import {
  brushToFormValues,
  brushWithResolvedColors,
  descriptorRgbColor,
  formValuesToBrush,
  record
} from '@app-game/abr-brush/form';
import { prepareAbrBrush } from '@app-game/abr-paint/preset';
import { expect, it, vi } from 'vitest';
import { fixtureWithFields, nativeObject, roundTripBrush } from '../../tests/abrFixture';

it('uses the explicit CMYK converter for form colors and detaches the host RGB snapshot', () => {
  const original = preset();
  const convert = vi.fn(() => [187, 160, 138] as const);
  expect(brushToFormValues(original).tool.foreground).toBe('');
  expect(() => brushWithResolvedColors(original)).toThrow('CMYK ICC profile');
  const values = brushToFormValues(original, convert);
  expect(values.tool.foreground).toBe('#bba08a');
  expect(convert).toHaveBeenCalledWith([20.125, 30, 40, 10]);
  const detached = brushWithResolvedColors(original, convert);
  expect(detached).not.toBe(original);
  expect(prepareAbrBrush(detached).color).toBe('#bba08a');
  expect(original.preset.toolOptions!.foregroundColor).toMatchObject({ kind: 'CMYC', cyan: 20.125 });
  // The handoff has only RGB values; a retired transform cannot affect it.
  convert.mockImplementation(() => {
    throw new Error('disposed');
  });
  expect(prepareAbrBrush(detached).color).toBe('#bba08a');
});

it('keeps CMYK bytes and unknown fields through unrelated edits/export, but supports RGB edit and clear', () => {
  const original = preset();
  const convert = () => [187, 160, 138] as const;
  const roundTrip = roundTripBrush;
  const values = brushToFormValues(original, convert);
  expect(formValuesToBrush(original, values, convert)).toBe(original);
  values.tool.flow = 45;
  const saved = roundTrip(formValuesToBrush(original, values, convert));
  expect(saved.preset.toolOptions!).toMatchObject({
    foregroundColor: original.preset.toolOptions!.foregroundColor,
    flow: 45
  });
  const next = brushToFormValues(saved, convert);
  next.tool.foreground = '#123456';
  expect(record(roundTrip(formValuesToBrush(saved, next, convert)).preset.toolOptions!).foregroundColor).toMatchObject({
    kind: 'RGBC',
    red: 18,
    green: 52,
    blue: 86,
    extensions: original.preset.toolOptions!.foregroundColor!.extensions
  });
  next.tool.foreground = '';
  expect(roundTrip(formValuesToBrush(saved, next, convert)).preset.toolOptions!).not.toHaveProperty('foregroundColor');
});

it('validates percentages before calling the profile, and keeps RGB presets independent of ICC', () => {
  const convert = vi.fn(() => [12, 34, 56] as const);
  for (const bad of [-1, 101, NaN, Infinity, undefined, '50', { unit: '#Pxl', value: 50 }]) {
    expect(descriptorRgbColor({ ...preset().preset.toolOptions!.foregroundColor, cyan: bad }, convert)).toBeUndefined();
  }
  expect(convert).not.toHaveBeenCalled();
  expect(
    descriptorRgbColor({ ...preset().preset.toolOptions!.foregroundColor, cyan: { unit: '#Prc', value: 50 } }, convert)
  ).toBe('#0c2238');
  const rgb = {
    ...preset(),
    preset: {
      ...preset().preset,
      toolOptions: { kind: 'PbTl', foregroundColor: { kind: 'RGBC', red: 18, green: 52, blue: 86 } }
    }
  };
  expect(brushWithResolvedColors(rgb)).toBe(rgb);
  expect(descriptorRgbColor(preset().preset.toolOptions!.foregroundColor, () => [NaN, 0, 0])).toBeUndefined();
});
function preset() {
  return fixtureWithFields({
    toolOptions: nativeObject('PbTl', {
      FrgC: nativeObject('CMYC', {
        'Cyn ': { Double: 20.125 },
        Mgnt: { Double: 30 },
        'Ylw ': { Double: 40 },
        Blck: { Double: 10 },
        futureField: { Integer: 17 }
      })
    })
  });
}
