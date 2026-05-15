import { Color } from '../color';

type InterpolatedMode = 'hsl' | 'hsv' | 'hcg' | 'hsi' | 'lch' | 'hcl' | 'oklch';
type HueMode = 'hsl' | 'hsv' | 'hcg' | 'hsi' | 'hcl' | 'oklch';

type ColorChannelReader = () => number[];

function readChannels(color: Color, mode: HueMode): number[] {
  const reader = color[mode];
  if (typeof reader !== 'function') {
    throw new Error(`Missing color reader for ${mode}`);
  }

  const value = (reader as ColorChannelReader).call(color);
  return Array.isArray(value) ? [...value] : [];
}

export function interpolateHsx(col1: Color, col2: Color, f: number, mode: InterpolatedMode): Color {
  const targetMode: HueMode = mode === 'lch' ? 'hcl' : mode;
  let xyz0 = readChannels(col1, targetMode);
  let xyz1 = readChannels(col2, targetMode);

  if (mode === 'oklch') {
    xyz0 = xyz0.reverse();
    xyz1 = xyz1.reverse();
  }

  const [hue0, sat0, lbv0] = xyz0;
  const [hue1, sat1, lbv1] = xyz1;

  let sat: number | undefined;
  let hue: number;
  let dh: number;

  if (!Number.isNaN(hue0) && !Number.isNaN(hue1)) {
    if (hue1 > hue0 && hue1 - hue0 > 180) {
      dh = hue1 - (hue0 + 360);
    } else if (hue1 < hue0 && hue0 - hue1 > 180) {
      dh = hue1 + 360 - hue0;
    } else {
      dh = hue1 - hue0;
    }
    hue = hue0 + f * dh;
  } else if (!Number.isNaN(hue0)) {
    hue = hue0;
    if ((lbv1 === 1 || lbv1 === 0) && targetMode !== 'hsv') {
      sat = sat0;
    }
  } else if (!Number.isNaN(hue1)) {
    hue = hue1;
    if ((lbv0 === 1 || lbv0 === 0) && targetMode !== 'hsv') {
      sat = sat1;
    }
  } else {
    hue = Number.NaN;
  }

  const resolvedSat = sat ?? sat0 + f * (sat1 - sat0);
  const lightnessBrightnessValue = lbv0 + f * (lbv1 - lbv0);

  return mode === 'oklch'
    ? new Color([lightnessBrightnessValue, resolvedSat, hue], mode)
    : new Color([hue, resolvedSat, lightnessBrightnessValue], targetMode);
}
