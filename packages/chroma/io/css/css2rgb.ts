import type { ColorSpaces, CssColorString } from '../../types';
import { hsl2rgb } from '../hsl/hsl2rgb';
import { input } from '../input';

const RE_RGB = /^rgb\(\s*(-?\d+),\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/;
const RE_RGBA = /^rgba\(\s*(-?\d+),\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*([01]|[01]?\.\d+)\)$/;
const RE_RGB_PCT = /^rgb\(\s*(-?\d+(?:\.\d+)?)%,\s*(-?\d+(?:\.\d+)?)%\s*,\s*(-?\d+(?:\.\d+)?)%\s*\)$/;
const RE_RGBA_PCT =
  /^rgba\(\s*(-?\d+(?:\.\d+)?)%,\s*(-?\d+(?:\.\d+)?)%\s*,\s*(-?\d+(?:\.\d+)?)%\s*,\s*([01]|[01]?\.\d+)\)$/;
const RE_HSL = /^hsl\(\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)%\s*,\s*(-?\d+(?:\.\d+)?)%\s*\)$/;
const RE_HSLA = /^hsla\(\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)%\s*,\s*(-?\d+(?:\.\d+)?)%\s*,\s*([01]|[01]?\.\d+)\)$/;

const { round } = Math;

type Css2Rgb = ((css: CssColorString) => ColorSpaces['rgba'] | undefined) & {
  test: (value: string) => boolean;
};

export const css2rgb = ((css: CssColorString) => {
  const normalizedCss = css.toLowerCase().trim();
  let m: RegExpMatchArray | null;

  if (input.format.named) {
    try {
      return input.format.named(normalizedCss);
    } catch {
      // ignore named-color misses and continue with CSS parsing
    }
  }

  // rgb(250,20,0)
  if ((m = normalizedCss.match(RE_RGB))) {
    const rgb = m.slice(1, 4).map(Number);
    return [rgb[0] ?? 0, rgb[1] ?? 0, rgb[2] ?? 0, 1];
  }

  // rgba(250,20,0,0.4)
  if ((m = normalizedCss.match(RE_RGBA))) {
    return m.slice(1, 5).map(Number);
  }

  // rgb(100%,0%,0%)
  if ((m = normalizedCss.match(RE_RGB_PCT))) {
    const rgb = m.slice(1, 4).map((value) => round(Number(value) * 2.55));
    return [rgb[0] ?? 0, rgb[1] ?? 0, rgb[2] ?? 0, 1];
  }

  // rgba(100%,0%,0%,0.4)
  if ((m = normalizedCss.match(RE_RGBA_PCT))) {
    const rgb = m.slice(1, 5).map(Number);
    return [round((rgb[0] ?? 0) * 2.55), round((rgb[1] ?? 0) * 2.55), round((rgb[2] ?? 0) * 2.55), rgb[3] ?? 1];
  }

  // hsl(0,100%,50%)
  if ((m = normalizedCss.match(RE_HSL))) {
    const hsl = m.slice(1, 4).map(Number);
    hsl[1] = (hsl[1] ?? 0) * 0.01;
    hsl[2] = (hsl[2] ?? 0) * 0.01;
    const rgb = hsl2rgb(hsl);
    rgb[3] = 1;
    return rgb;
  }

  // hsla(0,100%,50%,0.5)
  if ((m = normalizedCss.match(RE_HSLA))) {
    const hsl = m.slice(1, 4).map(Number);
    hsl[1] = (hsl[1] ?? 0) * 0.01;
    hsl[2] = (hsl[2] ?? 0) * 0.01;
    const rgb = hsl2rgb(hsl);
    rgb[3] = Number(m[4]);
    return rgb;
  }
  return undefined;
}) as Css2Rgb;

css2rgb.test = (s: string) => {
  return (
    RE_RGB.test(s) || RE_RGBA.test(s) || RE_RGB_PCT.test(s) || RE_RGBA_PCT.test(s) || RE_HSL.test(s) || RE_HSLA.test(s)
  );
};
