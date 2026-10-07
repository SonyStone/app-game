import { formatPathNumber } from '../path-data';

/** How transform lists are written, named after GodSVG's formatter settings. */
export type TransformListFormat = {
  /** Drop the leading zero of fractions: `0.5` → `.5`. */
  readonly compressNumbers: boolean;
  /** Omit spaces before numbers that start with `-` or `.`. */
  readonly minimizeSpacing: boolean;
  /** Omit parameters equal to their defaults: `translate(5)`, `rotate(45)`, `scale(2)`. */
  readonly removeUnnecessaryParams: boolean;
};

/** One transform function with every parameter filled in (`translate(5)` is read as `translate(5 0)`). */
export type TransformFunction = {
  readonly type: 'matrix' | 'translate' | 'rotate' | 'scale' | 'skewX' | 'skewY';
  readonly values: readonly number[];
};

/**
 * Parses a transform list strictly; returns `undefined` for anything malformed (unknown functions, wrong parameter
 * counts, stray text), so callers can keep such values as written. Omitted optional parameters are filled with their
 * defaults, as GodSVG does.
 */
export function parseTransformFunctions(value: string): readonly TransformFunction[] | undefined {
  const functions: TransformFunction[] = [];
  const pattern = /\s*(matrix|translate|rotate|scale|skewX|skewY)\s*\(([^)]*)\)\s*,?/y;
  let position = 0;

  while (position < value.length) {
    pattern.lastIndex = position;
    const match = pattern.exec(value);

    if (!match) {
      return value.slice(position).trim() === '' ? functions : undefined;
    }

    const type = match[1] as TransformFunction['type'];
    const values = parseNumbers(match[2] ?? '');
    const filled = values ? withDefaults(type, values) : undefined;

    if (!filled) {
      return undefined;
    }

    functions.push({ type, values: filled });
    position = pattern.lastIndex;
  }

  return functions;
}

/** Writes transform functions with the format options; angles keep 4 decimals, other numbers 6. */
export function formatTransformFunctions(functions: readonly TransformFunction[], format: TransformListFormat): string {
  return functions.map((item) => `${item.type}(${joinNumbers(shownValues(item, format), item.type, format)})`).join(' ');
}

function withDefaults(type: TransformFunction['type'], values: readonly number[]): readonly number[] | undefined {
  const [first, second] = values;

  switch (type) {
    case 'matrix':
      return values.length === 6 ? values : undefined;
    case 'translate':
      return first !== undefined && values.length <= 2 ? [first, second ?? 0] : undefined;
    case 'scale':
      return first !== undefined && values.length <= 2 ? [first, second ?? first] : undefined;
    case 'rotate':
      return values.length === 1 || values.length === 3 ? [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0] : undefined;
    case 'skewX':
    case 'skewY':
      return values.length === 1 ? values : undefined;
  }
}

function shownValues(item: TransformFunction, format: TransformListFormat): readonly number[] {
  const [first = 0, second = 0, third = 0] = item.values;

  if (!format.removeUnnecessaryParams) {
    return item.values;
  }

  switch (item.type) {
    case 'translate':
      return second === 0 ? [first] : item.values;
    case 'scale':
      return second === first ? [first] : item.values;
    case 'rotate':
      return second === 0 && third === 0 ? [first] : item.values;
    default:
      return item.values;
  }
}

function joinNumbers(values: readonly number[], type: TransformFunction['type'], format: TransformListFormat): string {
  const texts = values.map((value, index) => {
    const isAngle = type === 'skewX' || type === 'skewY' || (type === 'rotate' && index === 0);
    const text = formatPathNumber(value, isAngle ? 4 : 6);
    return format.compressNumbers ? text.replace(/^(-?)0\./, '$1.') : text;
  });

  return texts.reduce((output, text, index) => {
    const previous = texts[index - 1];

    if (previous === undefined) {
      return text;
    }

    const tight = format.minimizeSpacing && (text.startsWith('-') || (previous.includes('.') && text.startsWith('.')));
    return `${output}${tight ? '' : ' '}${text}`;
  }, '');
}

/** Reads numbers separated by whitespace and at most one comma; signs and `.` may also separate (`5-3`, `.5.5`). */
function parseNumbers(text: string): number[] | undefined {
  const pattern = /\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*(,?)/y;
  const values: number[] = [];
  let position = 0;
  let trailingComma = false;

  while (position < text.length && text.slice(position).trim() !== '') {
    pattern.lastIndex = position;
    const match = pattern.exec(text);

    if (!match) {
      return undefined;
    }

    values.push(Number(match[1]));
    trailingComma = match[2] === ',';
    position = pattern.lastIndex;
  }

  return trailingComma ? undefined : values;
}
