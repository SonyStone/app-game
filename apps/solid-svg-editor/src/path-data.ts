export const pathCommandLetters = ["M", "L", "H", "V", "Z", "A", "Q", "T", "C", "S"] as const;

export type PathCommandLetter = (typeof pathCommandLetters)[number];

export interface PathCommand {
  readonly command: string;
  readonly values: readonly number[];
}

export interface PathParameter {
  readonly name: string;
  readonly index: number;
}

const argCount = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  Z: 0,
  A: 7,
  Q: 4,
  T: 2,
  C: 6,
  S: 4
} as const satisfies Record<PathCommandLetter, number>;

const parameterNames = {
  M: ["x", "y"],
  L: ["x", "y"],
  H: ["x"],
  V: ["y"],
  Z: [],
  A: ["rx", "ry", "rot", "large", "sweep", "x", "y"],
  Q: ["x1", "y1", "x", "y"],
  T: ["x", "y"],
  C: ["x1", "y1", "x2", "y2", "x", "y"],
  S: ["x2", "y2", "x", "y"]
} as const satisfies Record<PathCommandLetter, readonly string[]>;

/**
 * Parses SVG path data into commands, following the SVG path grammar.
 *
 * Arc flags are read as single `0`/`1` characters, so compact data such as `a1 1 0 00 1 1` works.
 * An implicit repetition of `M`/`m` becomes `L`/`l`. Parsing stops at the first syntax error and
 * returns the commands read so far, which is how browsers render malformed path data.
 */
export function parsePathData(data: string): readonly PathCommand[] {
  const scanner = createPathScanner(data);
  const commands: PathCommand[] = [];
  let previousCommand = "";

  while (true) {
    scanner.skipWhitespace();

    if (scanner.done()) {
      break;
    }

    let command = scanner.readCommandLetter();

    if (!command) {
      if (!previousCommand || normalizeCommand(previousCommand) === "Z") {
        break;
      }

      command = normalizeCommand(previousCommand) === "M" ? implicitLineCommand(previousCommand) : previousCommand;
    }

    const values = readCommandValues(scanner, normalizeCommand(command));

    if (!values) {
      break;
    }

    commands.push({ command, values });
    previousCommand = command;
    scanner.skipSeparator();
  }

  return commands;
}

function readCommandValues(scanner: PathScanner, command: PathCommandLetter): number[] | undefined {
  const values: number[] = [];

  for (let index = 0; index < argCount[command]; index += 1) {
    if (index > 0) {
      scanner.skipSeparator();
    } else {
      scanner.skipWhitespace();
    }

    const isArcFlag = command === "A" && (index === 3 || index === 4);
    const value = isArcFlag ? scanner.readFlag() : scanner.readNumber();

    if (value === undefined) {
      return undefined;
    }

    values.push(value);
  }

  return values;
}

type PathScanner = ReturnType<typeof createPathScanner>;

function createPathScanner(data: string) {
  let position = 0;

  return {
    done: () => position >= data.length,
    skipWhitespace() {
      while (position < data.length && isPathWhitespace(data[position])) {
        position += 1;
      }
    },
    /** Skips whitespace with at most one comma, the `comma-wsp` production of the path grammar. */
    skipSeparator() {
      this.skipWhitespace();

      if (data[position] === ",") {
        position += 1;
        this.skipWhitespace();
      }
    },
    readCommandLetter(): string | undefined {
      const char = data[position];

      if (char === undefined || !isCommandToken(char)) {
        return undefined;
      }

      position += 1;
      return char;
    },
    readNumber(): number | undefined {
      numberPattern.lastIndex = position;
      const match = numberPattern.exec(data);

      if (!match) {
        return undefined;
      }

      position = numberPattern.lastIndex;
      return Number(match[0]);
    },
    readFlag(): number | undefined {
      const char = data[position];

      if (char !== "0" && char !== "1") {
        return undefined;
      }

      position += 1;
      return Number(char);
    }
  };
}

const numberPattern = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;

function isPathWhitespace(char: string | undefined): boolean {
  return char === " " || char === "\t" || char === "\n" || char === "\r" || char === "\f";
}

function isCommandToken(token: string): boolean {
  return /^[AaCcHhLlMmQqSsTtVvZz]$/.test(token);
}

function normalizeCommand(command: string): PathCommandLetter {
  const normalized = command.toUpperCase();
  return pathCommandLetters.includes(normalized as PathCommandLetter) ? (normalized as PathCommandLetter) : "M";
}

function implicitLineCommand(command: string): string {
  return command === command.toLowerCase() ? "l" : "L";
}

export function formatPathData(commands: readonly PathCommand[], compact = false): string {
  const separator = compact ? " " : " ";
  return commands
    .map((command) => {
      const values = command.values.map(formatPathNumber).join(separator);
      return values ? `${command.command}${compact ? "" : " "}${values}` : command.command;
    })
    .join(compact ? "" : " ");
}

export function formatPathNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  if (Object.is(value, -0)) {
    return "0";
  }

  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, "").replace(/\.$/, "");
}

export function commandParameters(command: string): readonly PathParameter[] {
  return parameterNames[normalizeCommand(command)].map((name, index) => ({ name, index }));
}

export function updateCommandValue(commands: readonly PathCommand[], commandIndex: number, valueIndex: number, value: number): readonly PathCommand[] {
  return commands.map((command, index) => {
    if (index !== commandIndex) {
      return command;
    }

    const values = [...command.values];
    values[valueIndex] = value;
    return { ...command, values };
  });
}

export function insertCommand(commands: readonly PathCommand[], afterIndex: number, command: string): readonly PathCommand[] {
  const nextCommand = createCommand(command);
  const next = [...commands];
  const insertIndex = Math.max(0, Math.min(afterIndex + 1, next.length));
  next.splice(insertIndex, 0, nextCommand);
  return next;
}

export function deleteCommand(commands: readonly PathCommand[], commandIndex: number): readonly PathCommand[] {
  return commands.filter((_, index) => index !== commandIndex);
}

/**
 * Converts one command to another type, keeping its end point and, where possible, its shape, following GodSVG.
 *
 * Curves converted to curves keep their control points (quadratic to cubic is exact); line-like segments become
 * straight curves with evenly spaced control points. The case of `command` selects absolute or relative output.
 */
export function convertCommand(commands: readonly PathCommand[], commandIndex: number, command: string): readonly PathCommand[] {
  const segment = absoluteSegments(commands)[commandIndex];

  if (!segment) {
    return commands;
  }

  const target = normalizeCommand(command);
  const relative = command === command.toLowerCase();
  const absoluteValues = convertedSegmentValues(segment, target);
  const values = relative ? toRelativeValues(target, absoluteValues, segment.start) : absoluteValues;
  const converted = { command: relative ? target.toLowerCase() : target, values };

  return commands.map((item, index) => (index === commandIndex ? converted : item));
}

function convertedSegmentValues(segment: AbsoluteSegment, target: PathCommandLetter): number[] {
  const { start, end, source } = segment;
  const quadraticControl = segment.quadraticControl;

  switch (target) {
    case "M":
    case "L":
    case "T":
      return [end.x, end.y];
    case "H":
      return [end.x];
    case "V":
      return [end.y];
    case "Z":
      return [];
    case "A":
      return source.letter === "A" ? [...source.values] : [1, 1, 0, 0, 0, end.x, end.y];
    case "Q": {
      const control = quadraticControl ?? exactQuadraticFromCubic(segment) ?? lerpPoint(start, end, 1 / 2);
      return [control.x, control.y, end.x, end.y];
    }
    case "C": {
      if (quadraticControl) {
        const [first, second] = cubicControlsFromQuadratic(start, quadraticControl, end);
        return [first.x, first.y, second.x, second.y, end.x, end.y];
      }

      const first = segment.cubicControls?.[0] ?? lerpPoint(start, end, 1 / 3);
      const second = segment.cubicControls?.[1] ?? lerpPoint(start, end, 2 / 3);
      return [first.x, first.y, second.x, second.y, end.x, end.y];
    }
    case "S": {
      const second = segment.cubicControls?.[1] ?? shorthandCubicFromQuadratic(segment) ?? lerpPoint(start, end, 2 / 3);
      return [second.x, second.y, end.x, end.y];
    }
  }
}

/** A cubic is exactly a quadratic when both control points derive from one quadratic control. */
function exactQuadraticFromCubic(segment: AbsoluteSegment): Point | undefined {
  const controls = segment.cubicControls;

  if (!controls) {
    return undefined;
  }

  const fromStart = { x: (3 * controls[0].x - segment.start.x) / 2, y: (3 * controls[0].y - segment.start.y) / 2 };
  const fromEnd = { x: (3 * controls[1].x - segment.end.x) / 2, y: (3 * controls[1].y - segment.end.y) / 2 };
  return nearlyEqualPoints(fromStart, fromEnd) ? fromStart : undefined;
}

/** A quadratic becomes an exact `S` only when the implied first control equals the converted one. */
function shorthandCubicFromQuadratic(segment: AbsoluteSegment): Point | undefined {
  if (!segment.quadraticControl) {
    return undefined;
  }

  const [first, second] = cubicControlsFromQuadratic(segment.start, segment.quadraticControl, segment.end);
  return nearlyEqualPoints(first, segment.impliedCubicControl) ? second : undefined;
}

function cubicControlsFromQuadratic(start: Point, control: Point, end: Point): readonly [Point, Point] {
  return [
    { x: start.x / 3 + (control.x * 2) / 3, y: start.y / 3 + (control.y * 2) / 3 },
    { x: end.x / 3 + (control.x * 2) / 3, y: end.y / 3 + (control.y * 2) / 3 }
  ];
}

function toRelativeValues(command: PathCommandLetter, values: readonly number[], start: Point): number[] {
  return values.map((value, index) => {
    const name = parameterNames[command][index];

    if (name === "x" || name === "x1" || name === "x2") {
      return value - start.x;
    }

    if (name === "y" || name === "y1" || name === "y2") {
      return value - start.y;
    }

    return value;
  });
}

type Point = { readonly x: number; readonly y: number };

/** A command in absolute coordinates, with the control points that shorthand commands imply. */
type AbsoluteSegment = {
  readonly source: { readonly letter: PathCommandLetter; readonly values: readonly number[] };
  readonly start: Point;
  readonly end: Point;
  /** Control point of `Q` or `T` (implied for `T`). */
  readonly quadraticControl: Point | undefined;
  /** Both control points of `C` or `S` (the first implied for `S`). */
  readonly cubicControls: readonly [Point, Point] | undefined;
  /** First control point an `S` at this position would get: the reflection of the previous cubic's second control. */
  readonly impliedCubicControl: Point;
};

function absoluteSegments(commands: readonly PathCommand[]): readonly AbsoluteSegment[] {
  const segments: AbsoluteSegment[] = [];
  let current: Point = { x: 0, y: 0 };
  let subpathStart: Point = { x: 0, y: 0 };
  let previous: AbsoluteSegment | undefined;

  for (const command of commands) {
    const letter = normalizeCommand(command.command);
    const relative = command.command === command.command.toLowerCase();
    const values = command.values.map((value, index) => {
      const name = parameterNames[letter][index];
      const isX = name === "x" || name === "x1" || name === "x2";
      const isY = name === "y" || name === "y1" || name === "y2";
      return relative && isX ? value + current.x : relative && isY ? value + current.y : value;
    });
    const point = (xIndex: number): Point => ({ x: values[xIndex] ?? 0, y: values[xIndex + 1] ?? 0 });
    const reflectedQuadratic = previous?.quadraticControl ? reflect(previous.quadraticControl, current) : current;
    const impliedCubicControl = previous?.cubicControls ? reflect(previous.cubicControls[1], current) : current;
    const end =
      letter === "Z" ? subpathStart
      : letter === "H" ? { x: values[0] ?? 0, y: current.y }
      : letter === "V" ? { x: current.x, y: values[0] ?? 0 }
      : point(values.length - 2);
    const segment: AbsoluteSegment = {
      source: { letter, values },
      start: current,
      end,
      quadraticControl: letter === "Q" ? point(0) : letter === "T" ? reflectedQuadratic : undefined,
      cubicControls: letter === "C" ? [point(0), point(2)] : letter === "S" ? [impliedCubicControl, point(0)] : undefined,
      impliedCubicControl
    };

    segments.push(segment);
    previous = segment;
    current = end;

    if (letter === "M") {
      subpathStart = end;
    }
  }

  return segments;
}

function reflect(point: Point, center: Point): Point {
  return { x: 2 * center.x - point.x, y: 2 * center.y - point.y };
}

function lerpPoint(from: Point, to: Point, t: number): Point {
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

function nearlyEqualPoints(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
}

export function toggleRelative(commands: readonly PathCommand[], commandIndex: number): readonly PathCommand[] {
  const start = commandStartPoints(commands)[commandIndex] ?? { x: 0, y: 0 };

  return commands.map((item, index) => {
    if (index !== commandIndex) {
      return item;
    }

    const normalized = normalizeCommand(item.command);
    const isRelative = item.command === item.command.toLowerCase();

    if (normalized === "Z") {
      return { ...item, command: item.command === "Z" ? "z" : "Z" };
    }

    const values = item.values.map((value, valueIndex) => {
      const parameter = commandParameters(normalized)[valueIndex];

      if (!parameter) {
        return value;
      }

      if (parameter.name === "x" || parameter.name === "x1" || parameter.name === "x2") {
        return isRelative ? value + start.x : value - start.x;
      }

      if (parameter.name === "y" || parameter.name === "y1" || parameter.name === "y2") {
        return isRelative ? value + start.y : value - start.y;
      }

      return value;
    });

    return { ...item, command: isRelative ? normalized : normalized.toLowerCase(), values };
  });
}

function commandStartPoints(commands: readonly PathCommand[]): readonly Point[] {
  return absoluteSegments(commands).map((segment) => segment.start);
}

export function createCommand(command: string): PathCommand {
  const normalized = normalizeCommand(command);
  const relative = command === command.toLowerCase();
  const letter = relative ? normalized.toLowerCase() : normalized;
  const values = Array.from({ length: argCount[normalized] }, (_, index) => defaultValueForParameter(normalized, index));

  return { command: letter, values };
}

function defaultValueForParameter(command: PathCommandLetter, index: number): number {
  if (command === "A" && (index === 0 || index === 1)) {
    return 1;
  }

  return 0;
}

export function parsePoints(points: string): readonly [number, number][] {
  const nums = points
    .trim()
    .split(/[\s,]+/)
    .map((part) => Number.parseFloat(part))
    .filter((value) => Number.isFinite(value));
  const result: [number, number][] = [];

  for (let i = 0; i < nums.length - 1; i += 2) {
    const x = nums[i];
    const y = nums[i + 1];

    if (x !== undefined && y !== undefined) {
      result.push([x, y]);
    }
  }

  return result;
}

export function formatPoints(points: readonly [number, number][]): string {
  return points.map(([x, y]) => `${formatPathNumber(x)} ${formatPathNumber(y)}`).join(" ");
}

export function updatePoint(points: readonly [number, number][], pointIndex: number, axis: 0 | 1, value: number): readonly [number, number][] {
  return points.map((point, index) => {
    if (index !== pointIndex) {
      return point;
    }

    return axis === 0 ? [value, point[1]] : [point[0], value];
  });
}

export function addPoint(points: readonly [number, number][]): readonly [number, number][] {
  const last = points[points.length - 1] ?? [0, 0];
  return [...points, [last[0] + 40, last[1] + 40]];
}

export function deletePoint(points: readonly [number, number][], pointIndex: number): readonly [number, number][] {
  return points.filter((_, index) => index !== pointIndex);
}
