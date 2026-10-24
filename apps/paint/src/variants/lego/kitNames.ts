import { partsBounds, type Part } from './board';

/**
 * A short, playful name for a new kit of `parts`, in the manner of LEGO sets: two or three plain words drawn at
 * random from what the kit is. The words come from
 * - its two largest parts' names run together, Hue and Hex into "Huex", Wheel and Brightness into "Wheelness";
 * - a series after the family most of it belongs to, such as "Dial Station" for values;
 * - its shape when it stands out, "Tall", "Wide", "Square" or "Tiny";
 * - the current `color`'s name when the kit holds color parts, such as "Red".
 * So a kit may be "Huex Red", "Wheelness Tall", "Picker Dial Station" or "Square Prism Cruiser". `label` gives a
 * part kind's name; `random` returns numbers in [0, 1), `Math.random` by default.
 */
export function nameKit(
  parts: readonly Part[],
  options: { label: (kind: string) => string; color?: string; random?: () => number }
) {
  const random = options.random ?? Math.random;
  const pick = <T>(choices: readonly T[]) => choices[Math.floor(random() * choices.length)]!;
  const names = [...parts]
    .sort((a, b) => b.span.columns * b.span.rows - a.span.columns * a.span.rows)
    .map((part) => word(options.label(part.kind)))
    .filter((name, index, all) => name && all.indexOf(name) === index);
  if (names.length === 0) {
    return 'Kit';
  }

  const first = names[0]!;
  const blended = names.length > 1 ? blend(first, names[1]!) : first;
  const series = `${pick(seriesWords[family(parts)])} ${pick(seriesNouns)}`;
  const shape = shapeWord(parts);
  const color = parts.some((part) => part.kind.startsWith('color:')) && options.color ? colorName(options.color) : undefined;
  const choices = [
    color && [blended, color],
    shape && [blended, shape],
    [first, series],
    shape && [shape, series],
    [blended, series],
    color && [color, series]
  ].filter((words): words is string[] => Array.isArray(words));

  return pick(choices).join(' ');
}

/**
 * `a` and `b` run together into one word: `a`, less a last vowel when `b`'s ending starts with one, then `b` from
 * its last vowel, with the consonant before it unless that one starts `b`. Hue and Hex give "Huex", Wheel and
 * Brightness "Wheelness".
 */
export function blend(a: string, b: string) {
  const head = a.toLowerCase();
  const tail = ending(b.toLowerCase());
  const joined = vowel(tail[0]) && vowel(head[head.length - 1]) ? head.slice(0, -1) + tail : head + tail;
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/** The plain name of a color `hex`: its hue's, or black, white or gray when it has little color. */
export function colorName(hex: string) {
  const value = Number.parseInt(hex.replace('#', '').slice(0, 6), 16);
  if (Number.isNaN(value)) {
    return undefined;
  }

  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => channel / 255) as [
    number,
    number,
    number
  ];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 0.18) {
    return 'Black';
  }

  if (max - min < 0.12 * max) {
    return max > 0.85 ? 'White' : 'Gray';
  }

  const delta = max - min;
  const hue =
    max === r ? ((g - b) / delta + 6) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  const degrees = hue * 60;
  return hueNames.find(([until]) => degrees < until)?.[1] ?? 'Red';
}

/** The family most of `parts` belongs to by the cells they cover. */
function family(parts: readonly Part[]): keyof typeof seriesWords {
  const cells = new Map<string, number>();
  for (const part of parts) {
    const name = part.kind.split(':')[0]!;
    cells.set(name, (cells.get(name) ?? 0) + part.span.columns * part.span.rows);
  }

  const [largest] = [...cells].sort((a, b) => b[1] - a[1])[0] ?? ['color'];
  return largest in seriesWords ? (largest as keyof typeof seriesWords) : 'color';
}

/** A word for the shape `parts` take together when it stands out, otherwise undefined. */
function shapeWord(parts: readonly Part[]) {
  const { columns, rows } = partsBounds(parts);
  if (columns * rows <= 2) {
    return 'Tiny';
  }

  if (rows >= columns * 2 && rows >= 3) {
    return 'Tall';
  }

  if (columns >= rows * 2 && columns >= 3) {
    return 'Wide';
  }

  return columns === rows && columns >= 3 ? 'Square' : undefined;
}

/** The first word of a part's `label`, letters only, capitalized: "Fore/back" gives "Fore". */
function word(label: string) {
  const letters = label.split(/[^A-Za-z]+/).find((piece) => piece.length > 0) ?? '';
  return letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase();
}

/** `name` from its last vowel run, with the consonant before it unless that one starts it. */
function ending(name: string) {
  let end = name.length;
  while (end > 0 && !vowel(name[end - 1])) {
    end -= 1;
  }

  let start = end;
  while (start > 0 && vowel(name[start - 1])) {
    start -= 1;
  }

  if (end === 0) {
    return name;
  }

  return start >= 2 ? name.slice(start - 1) : name.slice(start);
}

function vowel(letter: string | undefined) {
  return letter !== undefined && 'aeiouy'.includes(letter);
}

/** A series' first word by family, after LEGO themes. */
const seriesWords = {
  color: ['Prism', 'Chroma', 'Spectrum'],
  value: ['Dial', 'Slider', 'Knob'],
  action: ['Tool', 'Gadget', 'Gear'],
  preset: ['Brush', 'Bristle', 'Stroke']
} as const;

/** A series' second word. */
const seriesNouns = ['Station', 'Cruiser', 'Garage', 'Studio', 'Express', 'Outpost'] as const;

/** Hue names by the degree each ends at. */
const hueNames: readonly (readonly [number, string])[] = [
  [15, 'Red'],
  [40, 'Orange'],
  [65, 'Yellow'],
  [160, 'Green'],
  [195, 'Teal'],
  [255, 'Blue'],
  [290, 'Purple'],
  [335, 'Pink'],
  [361, 'Red']
];
