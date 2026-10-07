/** How color values are written, named after GodSVG's formatter settings. */
export type ColorFormat = {
  /** When to write a color keyword such as `red` instead of hex. */
  readonly useNamedColors: 'always' | 'when-shorter-or-equal' | 'when-shorter' | 'never';
  /** Hex with 3 digits when possible, always 6 digits, or `rgb(r, g, b)`. */
  readonly primarySyntax: 'three-or-six-digit-hex' | 'six-digit-hex' | 'rgb';
  /** Upper-case hex digits. */
  readonly capitalHex: boolean;
};

/**
 * Rewrites a color value with the format options, following GodSVG: hex, `rgb()`, `hsl()`, and keywords are normalized
 * to one hex value, then written in the primary syntax, as a keyword when allowed. `none`, `currentColor`, and
 * `url(...)` references keep their meaning (a url only loses inner spaces); anything else is returned unchanged.
 */
export function formatColor(value: string, format: ColorFormat): string {
  const text = value.trim();

  if (text === '' || text === 'none' || text === 'currentColor') {
    return text;
  }

  const url = /^url\(\s*(.*?)\s*\)$/.exec(text);

  if (url) {
    return `url(${url[1]})`;
  }

  const hex = colorToHex(text);

  if (!hex) {
    return value;
  }

  const written = writeHex(hex, format);
  const keyword = format.useNamedColors === 'never' ? undefined : keywordByHex.get(hex);

  if (!keyword) {
    return written;
  }

  const useKeyword =
    format.useNamedColors === 'always' ||
    keyword.length < written.length ||
    (format.useNamedColors === 'when-shorter-or-equal' && keyword.length === written.length);

  return useKeyword ? keyword : written;
}

/**
 * Converts a hex (`#rgb`/`#rrggbb`), `rgb()`, `hsl()`, or keyword color to lower-case `#rrggbb`; `undefined` for other
 * values. Channels outside 0–255 (or 0–100%) are clamped like browsers do.
 */
export function colorToHex(value: string): string | undefined {
  const text = value.trim();
  const keyword = namedColors[text as keyof typeof namedColors];

  if (keyword) {
    return keyword;
  }

  if (/^#[0-9a-fA-F]{6}$/.test(text)) {
    return text.toLowerCase();
  }

  if (/^#[0-9a-fA-F]{3}$/.test(text)) {
    return `#${[...text.slice(1)].map((digit) => digit + digit).join('')}`.toLowerCase();
  }

  const rgb = /^rgb\(([^,]+),([^,]+),([^,]+)\)$/.exec(text);

  if (rgb) {
    const channels = rgb.slice(1).map(rgbChannel);
    return channels.every((channel) => channel !== undefined) ? hexFromChannels(channels as number[]) : undefined;
  }

  const hsl = /^hsl\(([^,]+),([^,]+)%\s*,([^,]+)%\s*\)$/.exec(text);

  if (hsl) {
    const [hue, saturation, lightness] = hsl.slice(1).map((part) => Number(part.trim()));

    if (hue === undefined || saturation === undefined || lightness === undefined || [hue, saturation, lightness].some(Number.isNaN)) {
      return undefined;
    }

    return hexFromChannels(hslChannels(hue, saturation / 100, lightness / 100).map(Math.round));
  }

  return undefined;
}

function writeHex(hex: string, format: ColorFormat): string {
  if (format.primarySyntax === 'rgb') {
    const [r, g, b] = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
    return `rgb(${r}, ${g}, ${b})`;
  }

  const digits = format.capitalHex ? hex.toUpperCase() : hex;
  const [, r1, r2, g1, g2, b1, b2] = digits;
  const canShorten = format.primarySyntax === 'three-or-six-digit-hex' && r1 === r2 && g1 === g2 && b1 === b2;

  return canShorten ? `#${r1}${g1}${b1}` : digits;
}

function rgbChannel(text: string): number | undefined {
  const trimmed = text.trim();
  const percent = trimmed.endsWith('%');
  const number = Number(percent ? trimmed.slice(0, -1) : trimmed);

  if (trimmed === '' || Number.isNaN(number)) {
    return undefined;
  }

  return Math.round(Math.min(255, Math.max(0, percent ? (number / 100) * 255 : number)));
}

function hexFromChannels(channels: readonly number[]): string {
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

/** RGB channels 0–255. */
export type Rgb = { readonly r: number; readonly g: number; readonly b: number };

/** Hue in degrees 0–360; saturation, value, and lightness 0–1. */
export type Hsv = { readonly h: number; readonly s: number; readonly v: number };
export type Hsl = { readonly h: number; readonly s: number; readonly l: number };

/** `#rrggbb` (or `#rgb`) to channels; `undefined` for other text. */
export function hexToRgb(hex: string): Rgb | undefined {
  const normalized = colorToHex(hex);

  if (!normalized?.startsWith('#')) {
    return undefined;
  }

  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((start) => Number.parseInt(normalized.slice(start, start + 2), 16));
  return { r, g, b };
}

/** Channels to lower-case `#rrggbb`, rounding and clamping each channel. */
export function rgbToHex(rgb: Rgb): string {
  return hexFromChannels([rgb.r, rgb.g, rgb.b].map((channel) => Math.round(Math.min(255, Math.max(0, channel)))));
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const [red, green, blue] = [r / 255, g / 255, b / 255];
  const max = Math.max(red, green, blue);
  const delta = max - Math.min(red, green, blue);
  return { h: hueOf(red, green, blue, max, delta), s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const channel = (n: number) => {
    const k = (n + h / 60) % 6;
    return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255;
  };
  return { r: channel(5), g: channel(3), b: channel(1) };
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const [red, green, blue] = [r / 255, g / 255, b / 255];
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const l = (max + min) / 2;
  return { h: hueOf(red, green, blue, max, delta), s: delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1)), l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const [r = 0, g = 0, b = 0] = hslChannels(h, s, l);
  return { r, g, b };
}

function hueOf(red: number, green: number, blue: number, max: number, delta: number): number {
  if (delta === 0) {
    return 0;
  }

  const sector = max === red ? ((green - blue) / delta) % 6 : max === green ? (blue - red) / delta + 2 : (red - green) / delta + 4;
  return (sector * 60 + 360) % 360;
}

/** CSS hsl() to RGB channels (unrounded); saturation and lightness are 0–1 and clamped. */
function hslChannels(hue: number, saturation: number, lightness: number): number[] {
  const s = Math.min(1, Math.max(0, saturation));
  const l = Math.min(1, Math.max(0, lightness));
  const h = ((hue % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);

  return [0, 8, 4].map((n) => {
    const k = (n + h / 30) % 12;
    return (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255;
  });
}

/** SVG 1.1 color keywords, as listed by GodSVG. */
export const namedColors = {
  aliceblue: '#f0f8ff', antiquewhite: '#faebd7', aqua: '#00ffff', aquamarine: '#7fffd4',
  azure: '#f0ffff', beige: '#f5f5dc', bisque: '#ffe4c4', black: '#000000',
  blanchedalmond: '#ffebcd', blue: '#0000ff', blueviolet: '#8a2be2', brown: '#a52a2a',
  burlywood: '#deb887', cadetblue: '#5f9ea0', chartreuse: '#7fff00', chocolate: '#d2691e',
  coral: '#ff7f50', cornflowerblue: '#6495ed', cornsilk: '#fff8dc', crimson: '#dc143c',
  cyan: '#00ffff', darkblue: '#00008b', darkcyan: '#008b8b', darkgoldenrod: '#b8860b',
  darkgray: '#a9a9a9', darkgreen: '#006400', darkgrey: '#a9a9a9', darkkhaki: '#bdb76b',
  darkmagenta: '#8b008b', darkolivegreen: '#556b2f', darkorange: '#ff8c00', darkorchid: '#9932cc',
  darkred: '#8b0000', darksalmon: '#e9967a', darkseagreen: '#8fbc8f', darkslateblue: '#483d8b',
  darkslategray: '#2f4f4f', darkslategrey: '#2f4f4f', darkturquoise: '#00ced1', darkviolet: '#9400d3',
  deeppink: '#ff1493', deepskyblue: '#00bfff', dimgray: '#696969', dimgrey: '#696969',
  dodgerblue: '#1e90ff', firebrick: '#b22222', floralwhite: '#fffaf0', forestgreen: '#228b22',
  fuchsia: '#ff00ff', gainsboro: '#dcdcdc', ghostwhite: '#f8f8ff', gold: '#ffd700',
  goldenrod: '#daa520', gray: '#808080', green: '#008000', greenyellow: '#adff2f',
  grey: '#808080', honeydew: '#f0fff0', hotpink: '#ff69b4', indianred: '#cd5c5c',
  indigo: '#4b0082', ivory: '#fffff0', khaki: '#f0e68c', lavender: '#e6e6fa',
  lavenderblush: '#fff0f5', lawngreen: '#7cfc00', lemonchiffon: '#fffacd', lightblue: '#add8e6',
  lightcoral: '#f08080', lightcyan: '#e0ffff', lightgoldenrodyellow: '#fafad2', lightgray: '#d3d3d3',
  lightgreen: '#90ee90', lightgrey: '#d3d3d3', lightpink: '#ffb6c1', lightsalmon: '#ffa07a',
  lightseagreen: '#20b2aa', lightskyblue: '#87cefa', lightslategray: '#778899', lightslategrey: '#778899',
  lightsteelblue: '#b0c4de', lightyellow: '#ffffe0', lime: '#00ff00', limegreen: '#32cd32',
  linen: '#faf0e6', magenta: '#ff00ff', maroon: '#800000', mediumaquamarine: '#66cdaa',
  mediumblue: '#0000cd', mediumorchid: '#ba55d3', mediumpurple: '#9370db', mediumseagreen: '#3cb371',
  mediumslateblue: '#7b68ee', mediumspringgreen: '#00fa9a', mediumturquoise: '#48d1cc', mediumvioletred: '#c71585',
  midnightblue: '#191970', mintcream: '#f5fffa', mistyrose: '#ffe4e1', moccasin: '#ffe4b5',
  navajowhite: '#ffdead', navy: '#000080', oldlace: '#fdf5e6', olive: '#808000',
  olivedrab: '#6b8e23', orange: '#ffa500', orangered: '#ff4500', orchid: '#da70d6',
  palegoldenrod: '#eee8aa', palegreen: '#98fb98', paleturquoise: '#afeeee', palevioletred: '#db7093',
  papayawhip: '#ffefd5', peachpuff: '#ffdab9', peru: '#cd853f', pink: '#ffc0cb',
  plum: '#dda0dd', powderblue: '#b0e0e6', purple: '#800080', red: '#ff0000',
  rosybrown: '#bc8f8f', royalblue: '#4169e1', saddlebrown: '#8b4513', salmon: '#fa8072',
  sandybrown: '#f4a460', seagreen: '#2e8b57', seashell: '#fff5ee', sienna: '#a0522d',
  silver: '#c0c0c0', skyblue: '#87ceeb', slateblue: '#6a5acd', slategray: '#708090',
  slategrey: '#708090', snow: '#fffafa', springgreen: '#00ff7f', steelblue: '#4682b4',
  tan: '#d2b48c', teal: '#008080', thistle: '#d8bfd8', tomato: '#ff6347',
  turquoise: '#40e0d0', violet: '#ee82ee', wheat: '#f5deb3', white: '#ffffff',
  whitesmoke: '#f5f5f5', yellow: '#ffff00', yellowgreen: '#9acd32',
} as const;

/** Keyword for each hex value; synonyms such as `aqua`/`cyan` resolve to the first one, as in GodSVG. */
const keywordByHex = new Map<string, string>();

for (const [name, hex] of Object.entries(namedColors)) {
  if (!keywordByHex.has(hex)) {
    keywordByHex.set(hex, name);
  }
}
