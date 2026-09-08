import {
  brushToFormValues,
  brushWithResolvedColors,
  descriptorRgbColor,
  formValuesToBrush,
  record
} from '@app-game/abr-brush/form';
import { AbrParser, AbrWriter, createAbrFile } from '@app-game/abr-parser/browser';
import { expect, it, vi } from 'vitest';
import { viewerBrush } from '../brushLibrary/viewerBrush';

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
  expect(viewerBrush(detached).color).toBe('#bba08a');
  expect(original.settings.toolOptions.FrgC).toMatchObject({ __classId: 'CMYC', 'Cyn ': 20.125 });
  // The handoff has only RGB values; a retired transform cannot affect it.
  convert.mockImplementation(() => {
    throw new Error('disposed');
  });
  expect(viewerBrush(detached).color).toBe('#bba08a');
});

it('keeps CMYK bytes and unknown fields through unrelated edits/export, but supports RGB edit and clear', () => {
  const original = preset();
  const convert = () => [187, 160, 138] as const;
  const roundTrip = (brush: Parameters<typeof formValuesToBrush>[0]) =>
    new AbrParser().parse(new AbrWriter().write(createAbrFile([brush]))).brushes[0]!;
  const values = brushToFormValues(original, convert);
  expect(formValuesToBrush(original, values, convert)).toBe(original);
  values.tool.flow = 45;
  const saved = roundTrip(formValuesToBrush(original, values, convert));
  expect(saved.settings.toolOptions).toMatchObject({ FrgC: original.settings.toolOptions.FrgC, flow: 45 });
  const next = brushToFormValues(saved, convert);
  next.tool.foreground = '#123456';
  expect(record(roundTrip(formValuesToBrush(saved, next, convert)).settings.toolOptions).FrgC).toMatchObject({
    __classId: 'RGBC',
    'Rd  ': 18,
    'Grn ': 52,
    'Bl  ': 86
  });
  next.tool.foreground = '';
  expect(roundTrip(formValuesToBrush(saved, next, convert)).settings.toolOptions).not.toHaveProperty('FrgC');
});

it('validates percentages before calling the profile, and keeps RGB presets independent of ICC', () => {
  const convert = vi.fn(() => [12, 34, 56] as const);
  for (const bad of [-1, 101, NaN, Infinity, undefined, '50', { unit: '#Pxl', value: 50 }]) {
    expect(descriptorRgbColor({ ...preset().settings.toolOptions.FrgC, 'Cyn ': bad }, convert)).toBeUndefined();
  }
  expect(convert).not.toHaveBeenCalled();
  expect(
    descriptorRgbColor({ ...preset().settings.toolOptions.FrgC, 'Cyn ': { unit: '#Prc', value: 50 } }, convert)
  ).toBe('#0c2238');
  const rgb = {
    ...preset(),
    settings: { toolOptions: { FrgC: { __classId: 'RGBC', 'Rd  ': 18, 'Grn ': 52, 'Bl  ': 86 } } }
  };
  expect(brushWithResolvedColors(rgb)).toBe(rgb);
  expect(descriptorRgbColor(preset().settings.toolOptions.FrgC, () => [NaN, 0, 0])).toBeUndefined();
});
function preset() {
  return {
    id: 'cmyk',
    name: 'CMYK',
    type: 'computed' as const,
    spacing: 25,
    settings: {
      toolOptions: {
        __classId: 'PbTl',
        FrgC: {
          __classId: 'CMYC',
          'Cyn ': 20.125,
          Mgnt: 30,
          'Ylw ': 40,
          Blck: 10,
          futureField: 17
        }
      }
    }
  };
}
