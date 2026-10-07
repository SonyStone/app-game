import { describe, expect, it } from 'vitest';

import { hexToRgb, hslToRgb, hsvToRgb, rgbToHex, rgbToHsl, rgbToHsv } from '../src/editor/colors';
import { restoreSettings } from '../src/editor/defaults';
import { defaultPalettes, palettePresets, restorePalettes } from '../src/editor/palettes';
import { documentGradients } from '../src/features/color-picker/document-gradients';
import { parseSvgMarkup } from '../src/svg-model';

describe('color model conversions', () => {
  it('round-trips through HSV and HSL', () => {
    for (const hex of ['#000000', '#ffffff', '#ff0000', '#123456', '#cc1414', '#808080', '#00ffaa']) {
      const rgb = hexToRgb(hex)!;

      expect(rgbToHex(hsvToRgb(rgbToHsv(rgb))), hex).toBe(hex);
      expect(rgbToHex(hslToRgb(rgbToHsl(rgb))), hex).toBe(hex);
    }
  });

  it('matches known HSV and HSL values', () => {
    expect(rgbToHsv({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 1, v: 1 });
    expect(rgbToHsl({ r: 0, g: 128, b: 0 })).toMatchObject({ h: 120, s: 1 });
    expect(rgbToHex(hsvToRgb({ h: 240, s: 1, v: 1 }))).toBe('#0000ff');
    expect(hexToRgb('red')).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRgb('none')).toBeUndefined();
  });
});

describe('palettes', () => {
  it('starts with the Pure preset and migrates the old flat color list', () => {
    expect(defaultPalettes()).toEqual([palettePresets.pure]);
    expect(restorePalettes(['#000', '#fff'])).toEqual([
      { title: 'Palette', colors: [{ value: '#000', name: '#000' }, { value: '#fff', name: '#fff' }] }
    ]);
    expect(restorePalettes([{ title: 'Mine', colors: [{ value: 'red', name: 'Red' }] }])).toEqual([
      { title: 'Mine', colors: [{ value: 'red', name: 'Red' }] }
    ]);
    expect(restorePalettes([{ title: 1 }])).toEqual(defaultPalettes());
    expect(restoreSettings(JSON.stringify({ palettes: ['#123456'] })).palettes[0]?.colors[0]?.value).toBe('#123456');
  });

  it('has GodSVG grayscale steps', () => {
    expect(palettePresets.grayscale.colors.map((color) => color.value)).toEqual([
      '#000', '#1a1a1a', '#333333', '#4d4d4d', '#666666', '#808080', '#999999', '#b3b3b3', '#cccccc', '#e6e6e6', '#fff'
    ]);
  });
});

describe('documentGradients', () => {
  it('lists gradients with ids and builds CSS previews from their stops', () => {
    const parsed = parseSvgMarkup(
      '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="a"><stop offset="0" stop-color="red"/><stop offset="100%" stop-color="#00f"/></linearGradient><radialGradient/></defs></svg>'
    );

    if (!parsed.ok) {
      throw new Error(parsed.message);
    }

    expect(documentGradients(parsed.root)).toEqual([
      { id: 'a', kind: 'linear', preview: 'linear-gradient(90deg, #ff0000 0%, #0000ff 100%)' }
    ]);
  });
});
