import { describe, expect, test } from 'vitest';
import { Color } from './color';
import { chroma } from './index';
import { HueDegrees, LuminanceValue } from './types';

function expectTupleCloseTo(actual: readonly number[], expected: readonly number[], digits = 2): void {
  expect(actual).toHaveLength(expected.length);
  for (let index = 0; index < expected.length; index += 1) {
    expect(actual[index]).toBeCloseTo(expected[index] ?? 0, digits);
  }
}

describe('Color explicit parsers', () => {
  test('constructs explicit color spaces without io side effects', () => {
    expect(new Color([180, 1, 0.5], 'hsl').hex()).toBe('#00ffff');
    expect(new Color([255, 128, 0], 'rgb').hex()).toBe('#ff8000');
    expect(new Color('#ff0000', 'hex').rgb()).toEqual([255, 0, 0]);
    expect(new Color('rgb(0, 128, 255)', 'css').rgb()).toEqual([0, 128, 255]);
  });

  test('exposes color-space factories as Color statics', () => {
    expect(Color.hsl(180, 1, 0.5).hex()).toBe('#00ffff');
    expect(Color.rgb(255, 128, 0).hex()).toBe('#ff8000');
    expect(Color.hex('#336699').rgb()).toEqual([51, 102, 153]);
    expect(Color.gl(0.2, 0.4, 0.6, 0.5).rgba(false)).toEqual([51, 102, 153, 0.5]);
  });

  test('keeps the public chroma factory extended', () => {
    expect(chroma.Color).toBe(Color);
    expect(chroma.hsl(180, 1, 0.5).hex()).toBe('#00ffff');
    expect(chroma.valid('#336699')).toBe(true);
    const scaled = Color.scale(['#000', '#fff'])(0.5) as Color;
    expect(scaled.hex()).toBe('#808080');
  });
});

describe('chroma docs examples', () => {
  test('supports documented constructors for numeric and tuple input', () => {
    expect(chroma('hotpink').hex()).toBe('#ff69b4');
    expect(chroma('#ff3399').hex()).toBe('#ff3399');
    expect(chroma('F39').hex()).toBe('#ff3399');
    expect(chroma(0xff3399).hex()).toBe('#ff3399');
    expect(chroma(255, 51, 153).hex()).toBe('#ff3399');
    expect(chroma([255, 51, 153]).hex()).toBe('#ff3399');
    expect(chroma(330, 1, 0.6, 'hsl').hex()).toBe('#ff3399');
    expect(chroma({ h: 120, s: 1, l: 0.75 }).hex()).toBe('#80ff80');
    expect(chroma({ c: 1, m: 0.5, y: 0, k: 0.2 }).hex()).toBe('#0066cc');
  });

  test('matches documented validity examples', () => {
    expect(chroma.valid('red')).toBe(true);
    expect(chroma.valid('bread')).toBe(false);
    expect(chroma.valid('#F0000D')).toBe(true);
    expect(chroma.valid('#FOOOOD')).toBe(false);
  });

  test('matches documented color-space factory examples', () => {
    expect(chroma.hsl(330, 1, 0.6).hex()).toBe('#ff3399');
    expect(chroma.lab(40, -20, 50).hex()).toBe('#536600');
    expect(chroma.lab(50, -20, 50).hex()).toBe('#6e7f15');
    expect(chroma.lab(80, -20, 50).hex()).toBe('#c0cf66');
    expect(chroma.lch(80, 40, 130).hex()).toBe('#aad28c');
    expect(chroma.hcl(130, 40, 80).hex()).toBe('#aad28c');
    expect(chroma.oklab(0.4, -0.2, 0.5).hex()).toBe('#624400');
    expect(chroma.oklab(0.5, -0.2, 0.5).hex()).toBe('#806100');
    expect(chroma.oklch(0.5, 0.2, 240).hex()).toBe('#0069c7');
    expect(chroma.cmyk(0.2, 0.8, 0, 0).hex()).toBe('#cc33ff');
    expect(chroma.gl(0.6, 0, 0.8).hex()).toBe('#9900cc');
    expect(chroma.gl(0.6, 0, 0.8, 0.5).hex()).toBe('#9900cc80');
    expect(chroma.temperature(2000).hex()).toBe('#ff8b14');
    expect(chroma.temperature(3500).hex()).toBe('#ffc38a');
    expect(chroma.temperature(6500).hex()).toBe('#fffafe');
  });

  test('matches documented utility examples', () => {
    expect(chroma.mix('red', 'blue').hex()).toBe('#b400b4');
    expect(chroma.mix('red', 'blue', 0.25).hex()).toBe('#dd0080');
    expect(chroma.mix('red', 'blue', 0.75).hex()).toBe('#8000dd');
    expect(chroma.mix('red', 'blue', 0.5, 'rgb').hex()).toBe('#800080');
    expect(chroma.mix('red', 'blue', 0.5, 'hsl').hex()).toBe('#ff00ff');
    expect(chroma.average(['red', 'rgba(0,0,0,0.5)']).css()).toBe('rgba(180,0,0,0.75)');
    expect(chroma.blend('4CBBFC', 'EEEE22', 'multiply').hex()).toBe('#47af22');
    expect(chroma.blend('4CBBFC', 'EEEE22', 'darken').hex()).toBe('#4cbb22');
    expect(chroma.blend('4CBBFC', 'EEEE22', 'lighten').hex()).toBe('#eeeefc');
    expect(chroma.contrast('pink', 'hotpink')).toBeCloseTo(1.721, 3);
    expect(chroma.contrast('pink', 'purple')).toBeCloseTo(6.124, 3);
    expect(chroma.distance('#fff', '#ff0', 'rgb')).toBe(255);
    expect(chroma.distance('#fff', '#ff0')).toBeCloseTo(96.948, 3);
    expect(chroma.deltaE('#ededee', '#edeeed')).toBeCloseTo(1.321, 3);
    expect(chroma.deltaE('#000000', '#ffffff')).toBe(100);
    expect(
      chroma.limits(
        [2, 3.5, 3.6, 3.8, 3.8, 4.1, 4.3, 4.4, 4.6, 4.9, 5.2, 5.3, 5.4, 5.7, 5.8, 5.9, 6.2, 6.5, 6.8, 7.2, 8],
        'e',
        4
      )
    ).toEqual([2, 3.5, 5, 6.5, 8]);
    expect(
      chroma.limits(
        [2, 3.5, 3.6, 3.8, 3.8, 4.1, 4.3, 4.4, 4.6, 4.9, 5.2, 5.3, 5.4, 5.7, 5.8, 5.9, 6.2, 6.5, 6.8, 7.2, 8],
        'q',
        4
      )
    ).toEqual([2, 4.1, 5.2, 5.9, 8]);
    expectTupleCloseTo(
      chroma.limits(
        [2, 3.5, 3.6, 3.8, 3.8, 4.1, 4.3, 4.4, 4.6, 4.9, 5.2, 5.3, 5.4, 5.7, 5.8, 5.9, 6.2, 6.5, 6.8, 7.2, 8],
        'l',
        4
      ),
      [2, 2.83, 4, 5.66, 8],
      2
    );
  });

  test('matches documented instance examples', () => {
    expect(chroma('rgba(255,0,0,0.35)').alpha()).toBe(0.35);
    expect(chroma('red').alpha(0.5).hex()).toBe('#ff000080');
    expect(chroma('hotpink').darken().hex()).toBe('#c93384');
    expect(chroma('hotpink').darken(2).hex()).toBe('#930058');
    expect(chroma('hotpink').brighten().hex()).toBe('#ff9ce6');
    expect(chroma('hotpink').brighten(2).hex()).toBe('#ffd1ff');
    expect(chroma('slategray').saturate().hex()).toBe('#4b83ae');
    expect(chroma('slategray').saturate(2).hex()).toBe('#0087cd');
    expect(chroma('hotpink').desaturate().hex()).toBe('#e77dae');
    expect(chroma('hotpink').desaturate(2).hex()).toBe('#cd8ca8');
    expect(chroma('hotpink').mix('blue').hex()).toBe('#b44add');
    expect(chroma('hotpink').mix('blue', 0.25).hex()).toBe('#dd5bc9');
    expect(chroma('skyblue').set('hsl.h', 0).hex()).toBe('#eb8787');
    expect(chroma('hotpink').set('lch.c', 30).hex()).toBe('#ce8ca9');
    expect(chroma('orangered').set('lab.l', '*0.5').hex()).toBe('#a10000');
    expect(chroma('orangered').get('rgb.g')).toBe(69);
    expect(chroma('orangered').get('lab.l')).toBeCloseTo(57.582, 3);
    expect(chroma('orange').hex()).toBe('#ffa500');
    expect(chroma('orange').alpha(0.5).hex()).toBe('#ffa50080');
    expect(chroma('orange').alpha(0.5).hex('rgb')).toBe('#ffa500');
    expect(chroma('orange').hex('argb')).toBe('#ffffa500');
    expect(chroma('#ffa500').name()).toBe('orange');
    expect(chroma('#ffa505').name()).toBe('#ffa505');
    expect(chroma('orange').css()).toBe('rgb(255,165,0)');
    expect(chroma('orange').rgb()).toEqual([255, 165, 0]);
    expect(chroma('hsla(20, 100%, 40%, 0.5)').rgba()).toEqual([204, 68, 0, 0.5]);
    expectTupleCloseTo(chroma('orange').hsl(), [38.82, 1, 0.5], 2);
    expect(Number.isNaN(chroma('white').hsl()[0])).toBe(true);
    expectTupleCloseTo(chroma('orange').hsv(), [38.82, 1, 1], 2);
    expect(Number.isNaN(chroma('white').hsv()[0])).toBe(true);
    expectTupleCloseTo(chroma('orange').hsi(), [39.64, 1, 0.55]);
    expect(Number.isNaN(chroma('white').hsi()[0])).toBe(true);
    expectTupleCloseTo(chroma('orange').lab(), [74.94, 23.93, 78.95]);
    expectTupleCloseTo(chroma('skyblue').lch(), [79.21, 25.94, 235.11]);
    expectTupleCloseTo(chroma('skyblue').hcl(), [235.11, 25.94, 79.21]);
    expectTupleCloseTo(chroma('orange').oklab(), [0.79, 0.06, 0.16]);
    expectTupleCloseTo(chroma('skyblue').oklch(), [0.81, 0.08, 225.75]);
    expect(chroma('#0000ff').num()).toBe(255);
    expect(chroma('#ff8a13').temperature()).toBe(2000);
    expectTupleCloseTo(chroma('33cc00').gl(), [0.2, 0.8, 0, 1]);
    expect(chroma('white').luminance()).toBe(1);
    expect(chroma('aquamarine').luminance()).toBeCloseTo(0.808, 3);
    expect(chroma('hotpink').luminance()).toBeCloseTo(0.347, 3);
    expect(chroma('darkslateblue').luminance()).toBeCloseTo(0.066, 3);
    expect(chroma('black').luminance()).toBe(0);
    expect(chroma('white').luminance(0.5).hex()).toBe('#bcbcbc');
    expect(
      chroma('aquamarine')
        .luminance(0.5 as LuminanceValue)
        .hex()
    ).toBe('#67ceab');
    expect(
      chroma('aquamarine')
        .luminance(0.5 as LuminanceValue, 'lab')
        .hex()
    ).toBe('#67ceab');
    expect(
      chroma('aquamarine')
        .luminance(0.5 as LuminanceValue, 'hsl')
        .hex()
    ).toBe('#67ceab');
    const clipped = chroma.hcl(50 as HueDegrees, 40, 20);
    expect(clipped.hex()).toBe('#581d00');
    expect(clipped.clipped()).toBe(true);
    expect(chroma.hcl(50, 40, 40).clipped()).toBe(false);
  });

  test('matches documented scale, brewer, bezier, and cubehelix examples', () => {
    expect(chroma.brewer.OrRd).toEqual([
      '#fff7ec',
      '#fee8c8',
      '#fdd49e',
      '#fdbb84',
      '#fc8d59',
      '#ef6548',
      '#d7301f',
      '#b30000',
      '#7f0000'
    ]);
    expect(chroma.scale('OrRd').colors(5)).toEqual(['#fff7ec', '#fdd49e', '#fc8d59', '#d7301f', '#7f0000']);
    expect(chroma.scale(['white', 'black']).colors(12)).toEqual([
      '#ffffff',
      '#e8e8e8',
      '#d1d1d1',
      '#b9b9b9',
      '#a2a2a2',
      '#8b8b8b',
      '#747474',
      '#5d5d5d',
      '#464646',
      '#2e2e2e',
      '#171717',
      '#000000'
    ]);
    expect(chroma.scale('RdBu').colors(5)).toEqual(['#67001f', '#e58368', '#f7f7f7', '#6bacd1', '#053061']);
    expect(chroma.scale(chroma.brewer.RdBu.slice(1, -1)).colors(5)).toEqual([
      '#b2182b',
      '#f4a582',
      '#f7f7f7',
      '#92c5de',
      '#2166ac'
    ]);
    const scaleColors = chroma.scale('OrRd').colors();
    expect(scaleColors.map((value) => (value instanceof Color ? value.hex() : value))).toEqual(chroma.brewer.OrRd);
    expect(
      chroma
        .scale('OrRd')(null as never)
        .hex()
    ).toBe('#cccccc');
    expect(
      chroma
        .scale('OrRd')
        .nodata('#eee')(null as never)
        .hex()
    ).toBe('#eeeeee');
    expect(chroma.bezier(['yellow', 'red', 'black']).scale().colors(5)).toEqual([
      '#ffff00',
      '#f5a900',
      '#bf5e0b',
      '#6c280e',
      '#000000'
    ]);
    expect(chroma.cubehelix().start(200).rotations(-0.35).gamma(0.7).lightness([0.3, 0.8]).scale().colors(5)).toEqual([
      '#46799d',
      '#55a4a0',
      '#77c39b',
      '#a6d5a1',
      '#d6e2bc'
    ]);
  });
});
