/**
 * A color typed or said by name or code: `red`, `dark blue`, `light sea green`, `#ff8800`, `#f80`, `ff8800` or
 * `rgb 255 136 0`, case and spacing ignored. A shade word (`dark`, `light`, `pale`, `deep`) in front of a name
 * without its own CSS entry darkens or lightens it; `grey` and `gray` are the same. Returns the color as lowercase
 * `#rrggbb` and a readable name, or `undefined` when the text is not a color.
 */
export function parseColor(text: string): { hex: string; name: string } | undefined {
  const words = text
    .trim()
    .toLowerCase()
    .replace(/grey/g, 'gray')
    .split(/[\s-]+/)
    .filter(Boolean);
  if (words.length === 0) {
    return undefined;
  }

  const code = parseCode(words);
  if (code) {
    return { hex: code, name: code };
  }

  const joined = words.join('');
  const named = namedColors[joined];
  if (named) {
    return { hex: named, name: words.join(' ') };
  }

  const [shade, ...rest] = words;
  const base = namedColors[rest.join('')];
  const amount = shade === undefined ? undefined : shades[shade];
  if (base && amount !== undefined) {
    return { hex: mix(base, amount < 0 ? '#000000' : '#ffffff', Math.abs(amount)), name: words.join(' ') };
  }

  return undefined;
}

/** A hex code, with or without `#`, or `rgb r g b`. Without `#` a code needs a letter, so `123456` stays a number. */
function parseCode(words: string[]) {
  if (words.length === 1) {
    const word = words[0]!;
    const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(word);
    if (match && (word.startsWith('#') || /[a-f]/.test(word))) {
      const digits = match[1]!;
      const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits;
      return `#${full}`;
    }
  }

  if (words[0] === 'rgb' && words.length === 4) {
    const channels = words.slice(1).map(Number);
    if (channels.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255)) {
      return toHex(channels);
    }
  }

  return undefined;
}

/** Mixes `hex` toward `target` by `amount` from 0 to 1, in encoded RGB. */
function mix(hex: string, target: string, amount: number) {
  const from = channelsOf(hex);
  const to = channelsOf(target);
  return toHex(from.map((channel, index) => Math.round(channel + (to[index]! - channel) * amount)));
}

function channelsOf(hex: string) {
  return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
}

function toHex(channels: number[]) {
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

/** Shade words: negative darkens toward black, positive lightens toward white. */
const shades: Record<string, number> = { dark: -0.4, deep: -0.25, light: 0.45, pale: 0.65, bright: 0.15 };

/** CSS named colors (`gray` spellings only, see `parseColor`), plus a few painters' names. */
const namedColors: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  gray: '#808080',
  darkgray: '#404040',
  lightgray: '#c0c0c0',
  silver: '#c0c0c0',
  dimgray: '#696969',
  slategray: '#708090',
  gainsboro: '#dcdcdc',
  red: '#ff0000',
  darkred: '#8b0000',
  crimson: '#dc143c',
  maroon: '#800000',
  firebrick: '#b22222',
  scarlet: '#ff2400',
  tomato: '#ff6347',
  coral: '#ff7f50',
  salmon: '#fa8072',
  orange: '#ff8800',
  darkorange: '#ff6a00',
  amber: '#ffbf00',
  gold: '#ffd700',
  yellow: '#ffff00',
  lightyellow: '#ffffe0',
  khaki: '#f0e68c',
  ochre: '#cc7722',
  olive: '#808000',
  lime: '#00ff00',
  chartreuse: '#7fff00',
  green: '#008000',
  darkgreen: '#006400',
  lightgreen: '#90ee90',
  forestgreen: '#228b22',
  seagreen: '#2e8b57',
  lightseagreen: '#20b2aa',
  mint: '#98ff98',
  emerald: '#50c878',
  teal: '#008080',
  turquoise: '#40e0d0',
  cyan: '#00ffff',
  aqua: '#00ffff',
  skyblue: '#87ceeb',
  lightblue: '#add8e6',
  steelblue: '#4682b4',
  royalblue: '#4169e1',
  cobalt: '#0047ab',
  blue: '#0000ff',
  darkblue: '#00008b',
  navy: '#000080',
  navyblue: '#000080',
  indigo: '#4b0082',
  ultramarine: '#3f00ff',
  violet: '#ee82ee',
  purple: '#800080',
  lavender: '#e6e6fa',
  lilac: '#c8a2c8',
  magenta: '#ff00ff',
  fuchsia: '#ff00ff',
  pink: '#ffc0cb',
  hotpink: '#ff69b4',
  rose: '#ff007f',
  brown: '#8b4513',
  chocolate: '#d2691e',
  sienna: '#a0522d',
  umber: '#635147',
  tan: '#d2b48c',
  beige: '#f5f5dc',
  ivory: '#fffff0',
  cream: '#fffdd0',
  peach: '#ffcba4',
  skin: '#e8b796'
};

/**
 * Colors offered as swatches and in search, in palette order: greys, then the hues around the wheel, then earth
 * tones. Each also parses with `parseColor`. Declared after the name table it reads.
 */
export const swatchColors: readonly { name: string; hex: string }[] = [
  'black',
  'dark gray',
  'gray',
  'light gray',
  'white',
  'red',
  'orange',
  'gold',
  'yellow',
  'lime',
  'green',
  'teal',
  'cyan',
  'sky blue',
  'blue',
  'navy',
  'purple',
  'magenta',
  'pink',
  'brown',
  'tan',
  'beige'
].map((name) => ({ name, hex: parseColor(name)!.hex }));
