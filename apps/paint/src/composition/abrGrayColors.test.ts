import {
  brushToFormValues,
  descriptorColorClipped,
  descriptorRgbColor,
  formValuesToBrush
} from '@app-game/abr-brush/form';
import { AbrParser, AbrWriter, createAbrFile } from '@app-game/abr-parser/browser';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import native from '../../../../packages/abr-brush/fixtures/photoshop-profile-colors.json';
import { viewerBrush } from '../brushLibrary/viewerBrush';

it.each(native.cases.filter((row) => row.model === 'Gray'))(
  'matches native Gray $channels sRGB pixels',
  ({ channels, pixel }) => {
    const original = preset(channels[0]!);
    const expected = '#' + pixel.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('');
    expect(descriptorRgbColor(original.settings.toolOptions.FrgC)).toBe(expected);
    expect(brushToFormValues(original).tool.foreground).toBe(expected);
    expect(viewerBrush(original).color).toBe(expected);
    expect(descriptorColorClipped(original.settings.toolOptions.FrgC)).toBe(false);
  }
);

it('matches native fractional Gray fills and stays within one level of the measured Brush pixels', () => {
  const csv = readFileSync(new URL('../../../../packages/abr-brush/fixtures/photoshop-gray-paint.csv', import.meta.url), 'utf8');
  for (const row of csv.trim().split('\n').slice(1)) {
    const [gray, fill, , , , , , brush] = row.split(',');
    const actual = descriptorRgbColor(preset(Number(gray)).settings.toolOptions.FrgC)!;
    expect(actual).toBe('#' + fill!.toLowerCase());
    const channel = Number.parseInt(actual.slice(1, 3), 16);
    expect(Math.abs(channel - Number.parseInt(brush!.slice(0, 2), 16))).toBeLessThanOrEqual(1);
  }
});

it('preserves fractional Gray and unknown fields through edits and ABR export until the color changes', () => {
  const original = preset(49.125);
  const values = brushToFormValues(original);
  values.tool.flow = 17;
  const roundTrip = (brush: ReturnType<typeof formValuesToBrush>) =>
    new AbrParser().parse(new AbrWriter().write(createAbrFile([brush]))).brushes[0]!;
  const saved = roundTrip(formValuesToBrush(original, values));
  expect(saved.settings.toolOptions).toMatchObject({ FrgC: original.settings.toolOptions.FrgC, flow: 17 });
  const changed = brushToFormValues(saved);
  changed.tool.foreground = '#123456';
  expect(roundTrip(formValuesToBrush(saved, changed)).settings.toolOptions).toMatchObject({
    FrgC: { __classId: 'RGBC', 'Rd  ': 18, 'Grn ': 52, 'Bl  ': 86 }
  });
  changed.tool.foreground = '';
  expect(roundTrip(formValuesToBrush(saved, changed)).settings.toolOptions).not.toHaveProperty('FrgC');
});

it('accepts percentage units and rejects malformed Gray without guessing', () => {
  expect(descriptorRgbColor({ __classId: 'Grsc', 'Gry ': { unit: '#Prc', value: 50 } })).toBe('#808080');
  expect(descriptorRgbColor({ __classId: 'Grsc', 'Gry ': 90 })).toBe('#1a1a1a');
  for (const value of [-1, 101, NaN, Infinity, undefined, '50', { unit: '#Pxl', value: 50 }]) {
    expect(descriptorRgbColor({ __classId: 'Grsc', 'Gry ': value })).toBeUndefined();
  }
  expect(() => viewerBrush(preset(NaN))).toThrow('Unsupported saved foreground color');
});

function preset(gray: number) {
  return {
    id: 'gray',
    name: 'Gray',
    type: 'computed' as const,
    spacing: 25,
    settings: { toolOptions: { __classId: 'PbTl', FrgC: { __classId: 'Grsc', 'Gry ': gray, futureField: 17 } } }
  };
}
