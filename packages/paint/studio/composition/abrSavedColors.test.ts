import { brushToFormValues, descriptorRgbColor, formValuesToBrush } from '@app-game/abr-brush/form';
import { AbrParser, AbrWriter, createAbrFile } from '@app-game/abr-parser/browser';
import { expect, it } from 'vitest';
import native from '../../../abr-brush/fixtures/photoshop-colors.json';
import { viewerBrush } from '../brushLibrary/viewerBrush';

it.each(native.hsb)('converts native HSB $hsb to $hex in the editor and Paint', ({ hsb, hex }) => {
  const brush = preset(hsb[0]!, hsb[1]!, hsb[2]!);
  expect(brushToFormValues(brush).tool.foreground).toBe(hex);
  expect(viewerBrush(brush).color).toBe(hex);
});

it('preserves HSB precision and unknown fields through unrelated edits and ABR export/reimport', () => {
  const original = preset(359.5, 73.25, 42.5);
  const values = brushToFormValues(original);
  values.tool.flow = 37;
  const edited = formValuesToBrush(original, values);
  const file = new AbrParser().parse(new AbrWriter().write(createAbrFile([edited])));
  expect(file.errors).toEqual([]);
  expect(file.brushes[0]!.settings.toolOptions).toMatchObject({
    FrgC: original.settings.toolOptions.FrgC,
    BckC: original.settings.toolOptions.BckC,
    flow: 37
  });
  expect(viewerBrush(file.brushes[0]!).backgroundColor).toBe('#00ff00');
  const reopened = brushToFormValues(file.brushes[0]!);
  reopened.tool.foreground = '#123456';
  reopened.tool.background = '';
  const recolored = formValuesToBrush(file.brushes[0]!, reopened);
  const roundtrip = new AbrParser().parse(new AbrWriter().write(createAbrFile([recolored])));
  expect(roundtrip.errors).toEqual([]);
  expect(roundtrip.brushes[0]!.settings.toolOptions).toMatchObject({
    FrgC: { __classId: 'RGBC', 'Rd  ': 18, 'Grn ': 52, 'Bl  ': 86 }
  });
  expect(roundtrip.brushes[0]!.settings.toolOptions).not.toHaveProperty('BckC');
  expect(viewerBrush(roundtrip.brushes[0]!).color).toBe('#123456');
});

it('rejects malformed channels/units and profile-dependent colors instead of guessing', () => {
  const valid = preset(60, 100, 100).settings.toolOptions.FrgC;
  expect(descriptorRgbColor({ ...valid, 'H   ': 360 })).toBe('#ff0000');
  expect(descriptorRgbColor({ ...valid, Strt: { unit: '#Prc', value: 0 } })).toBe('#ffffff');
  for (const invalid of [
    { ...valid, 'H   ': { unit: '#Pxl', value: 60 } },
    { ...valid, 'H   ': { unit: '#Ang', value: -1 } },
    { ...valid, 'H   ': 361 },
    { ...valid, Strt: 101 },
    { ...valid, Brgh: NaN },
    { ...valid, Brgh: '50' },
    { ...valid, Strt: undefined },
    { __classId: 'Grsc', 'Gry ': 101 },
    { __classId: 'CMYC', 'Cyn ': 0, Mgnt: 0, 'Ylw ': 0, Blck: 50 }
  ])
    expect(descriptorRgbColor(invalid)).toBeUndefined();
});

function preset(hue: number, saturation: number, brightness: number) {
  return {
    id: 'saved-hsb',
    name: 'Saved HSB',
    type: 'computed' as const,
    spacing: 25,
    settings: {
      toolOptions: {
        __classId: 'PbTl',
        FrgC: {
          __classId: 'HSBC',
          'H   ': { unit: '#Ang', value: hue },
          Strt: saturation,
          Brgh: brightness,
          futureField: 17
        },
        BckC: { __classId: 'HSBC', 'H   ': { unit: '#Ang', value: 120 }, Strt: 100, Brgh: 100 }
      }
    }
  };
}
