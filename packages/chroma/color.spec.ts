import { describe, expect, it } from 'vitest';
import { Color } from './color';
import { chroma } from './index';

describe('Color explicit parsers', () => {
  it('constructs explicit color spaces without io side effects', () => {
    expect(new Color([180, 1, 0.5], 'hsl').hex()).toBe('#00ffff');
    expect(new Color([255, 128, 0], 'rgb').hex()).toBe('#ff8000');
    expect(new Color('#ff0000', 'hex').rgb()).toEqual([255, 0, 0]);
    expect(new Color('rgb(0, 128, 255)', 'css').rgb()).toEqual([0, 128, 255]);
  });

  it('exposes color-space factories as Color statics', () => {
    expect(Color.hsl(180, 1, 0.5).hex()).toBe('#00ffff');
    expect(Color.rgb(255, 128, 0).hex()).toBe('#ff8000');
    expect(Color.hex('#336699').rgb()).toEqual([51, 102, 153]);
    expect(Color.gl(0.2, 0.4, 0.6, 0.5).rgba(false)).toEqual([51, 102, 153, 0.5]);
  });

  it('keeps the public chroma factory extended', () => {
    expect(chroma.Color).toBe(Color);
    expect(chroma.hsl(180, 1, 0.5).hex()).toBe('#00ffff');
    expect(chroma.valid('#336699')).toBe(true);
    const scaled = Color.scale(['#000', '#fff'])(0.5) as Color;
    expect(scaled.hex()).toBe('#808080');
  });
});
