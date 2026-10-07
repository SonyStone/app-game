import { describe, expect, it } from 'vitest';

import { isPaletteXml, palettePresets, palettesFromXml, paletteToXml, paletteWarnings } from '../src/editor/palettes';

describe('palette XML', () => {
  it("round-trips GodSVG's format", () => {
    const xml = paletteToXml({ title: 'A "q"', colors: [{ value: '#f00', name: 'Red' }, { value: '#00f', name: '' }] });

    expect(xml).toBe('<palette title="A &quot;q&quot;">\n\t<color value="#f00" name="Red"/>\n\t<color value="#00f"/>\n</palette>');
    expect(palettesFromXml(xml)).toEqual([{ title: 'A "q"', colors: [{ value: '#f00', name: 'Red' }, { value: '#00f', name: '' }] }]);
  });

  it('skips invalid colors and recognizes palette text', () => {
    expect(palettesFromXml('<palette title=" T "><color value="nope"/><color value="red" name="R"/></palette>')).toEqual([
      { title: 'T', colors: [{ value: 'red', name: 'R' }] }
    ]);
    expect(palettesFromXml('<palette')).toEqual([]);
    expect(isPaletteXml('<!-- c -->\n<palette title="x"/>')).toBe(true);
    expect(isPaletteXml('<svg/>')).toBe(false);
  });

  it("gives GodSVG's palette warnings", () => {
    const pure = palettePresets.pure;

    expect(paletteWarnings({ title: '', colors: [] }, [])).toEqual(["Unnamed palettes won't be shown."]);
    expect(paletteWarnings(pure, [pure, pure])).toEqual(["Multiple palettes can't have the same name."]);
    expect(paletteWarnings({ title: 'X', colors: [{ value: '#fff', name: 'W' }, { value: 'white', name: 'W' }] }, [])).toEqual([
      'This palette has identically defined colors.'
    ]);
  });
});
