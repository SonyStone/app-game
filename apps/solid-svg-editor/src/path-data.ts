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
  return scanPathData(data).commands;
}

/**
 * Parses path data only when all of it is valid; returns `undefined` on a syntax error. Use it before rewriting a
 * value, so malformed data is kept as written instead of being cut at the error.
 */
export function tryParsePathData(data: string): readonly PathCommand[] | undefined {
  const { commands, complete } = scanPathData(data);
  return complete ? commands : undefined;
}

function scanPathData(data: string): { readonly commands: readonly PathCommand[]; readonly complete: boolean } {
  const scanner = createPathScanner(data);
  const commands: PathCommand[] = [];
  let previousCommand = "";

  while (true) {
    scanner.skipWhitespace();

    if (scanner.done()) {
      return { commands, complete: true };
    }

    let command = scanner.readCommandLetter();

    if (!command) {
      if (!previousCommand || normalizeCommand(previousCommand) === "Z") {
        return { commands, complete: false };
      }

      command = normalizeCommand(previousCommand) === "M" ? implicitLineCommand(previousCommand) : previousCommand;
    }

    const values = readCommandValues(scanner, normalizeCommand(command));

    if (!values) {
      return { commands, complete: false };
    }

    commands.push({ command, values });
    previousCommand = command;
    scanner.skipSeparator();
  }
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

/** Path data output options, named after GodSVG's formatter settings. */
export type PathDataFormat = {
  /** Drop the leading zero of fractions: `0.5` → `.5`. */
  readonly compressNumbers: boolean;
  /** Omit spaces after command letters and before numbers that start with `-` or `.`. */
  readonly minimizeSpacing: boolean;
  /** Write arc flags without separators: `a5 5 0 0110 10`. */
  readonly removeSpacingAfterFlags: boolean;
  /** Omit a command letter that repeats the previous one (and `L` after `M`). */
  readonly removeConsecutiveCommands: boolean;
};

/** Spaced-out output with every command letter, used for values the editor writes itself. */
export const readablePathFormat = {
  compressNumbers: false,
  minimizeSpacing: false,
  removeSpacingAfterFlags: false,
  removeConsecutiveCommands: false
} as const satisfies PathDataFormat;

/**
 * Writes path commands as text, following GodSVG's path data output. Numbers keep up to 6 decimals (arc rotation 4),
 * the precision GodSVG uses.
 */
export function formatPathData(commands: readonly PathCommand[], format: PathDataFormat = readablePathFormat): string {
  let output = "";
  let previousLetter = "";
  let previousNumber = "";

  for (const command of commands) {
    const letter = command.command;
    const numbers = commandNumberTexts(command, format.compressNumbers);
    const first = numbers[0] ?? "";

    if (isRepeatedCommand(previousLetter, letter, format)) {
      output += numberSeparator(previousNumber, first, format.minimizeSpacing);
    } else {
      output += `${output && !format.minimizeSpacing ? " " : ""}${letter}${numbers.length > 0 && !format.minimizeSpacing ? " " : ""}`;
    }

    output += normalizeCommand(letter) === "A" ? arcText(numbers, format) : joinNumbers(numbers, format.minimizeSpacing);
    previousLetter = letter;
    previousNumber = numbers[numbers.length - 1] ?? previousNumber;
  }

  return output;
}

function isRepeatedCommand(previous: string, letter: string, format: PathDataFormat): boolean {
  if (!format.removeConsecutiveCommands || previous === "" || normalizeCommand(letter) === "Z") {
    return false;
  }

  return (letter === previous && normalizeCommand(letter) !== "M") || (previous === "M" && letter === "L") || (previous === "m" && letter === "l");
}

function commandNumberTexts(command: PathCommand, compress: boolean): string[] {
  const isArc = normalizeCommand(command.command) === "A";
  return command.values.map((value, index) => {
    const text = formatPathNumber(value, isArc && index === 2 ? angleDecimals : numberDecimals);
    return compress ? text.replace(/^(-?)0\./, "$1.") : text;
  });
}

/** Arc numbers: radii and rotation, the two single-character flags, then the end point. */
function arcText(numbers: readonly string[], format: PathDataFormat): string {
  const [rx = "0", ry = "0", rotation = "0", large = "0", sweep = "0", x = "0", y = "0"] = numbers;
  const head = joinNumbers([rx, ry, rotation], format.minimizeSpacing);

  if (format.removeSpacingAfterFlags) {
    return `${head} ${large}${sweep}${x}${numberSeparator(x, y, format.minimizeSpacing)}${y}`;
  }

  return `${head} ${large} ${sweep}${x.startsWith("-") && format.minimizeSpacing ? "" : " "}${joinNumbers([x, y], format.minimizeSpacing)}`;
}

function joinNumbers(numbers: readonly string[], minimizeSpacing: boolean): string {
  return numbers.reduce((output, number, index) => {
    const previous = numbers[index - 1];
    return previous === undefined ? number : output + numberSeparator(previous, number, minimizeSpacing) + number;
  }, "");
}

/** A space is needed unless the next number starts with a sign, or with `.` after a number that has one (GodSVG). */
function numberSeparator(previous: string, next: string, minimizeSpacing: boolean): string {
  if (!minimizeSpacing) {
    return " ";
  }

  return next.startsWith("-") || next.startsWith("+") || (previous.includes(".") && next.startsWith(".")) ? "" : " ";
}

const numberDecimals = 6;
const angleDecimals = 4;

/** Formats a path number with at most `decimals` decimals and no trailing zeros; `-0` and non-finite give `0`. */
export function formatPathNumber(value: number, decimals = numberDecimals): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  const rounded = Number(value.toFixed(decimals));
  return Object.is(rounded, -0) ? "0" : String(rounded);
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

/**
 * Converts one command to another type, keeping its end point and, where possible, its shape, following GodSVG.
 *
 * Curves converted to curves keep their control points (quadratic to cubic is exact); line-like segments become
 * straight curves with evenly spaced control points. The case of `command` selects absolute or relative output.
 */
export function convertCommand(commands: readonly PathCommand[], commandIndex: number, command: string): readonly PathCommand[] {
  return convertCommands(commands, new Map([[commandIndex, command]]));
}

/**
 * Converts several commands at once (index → target letter) like `convertCommand`, measuring every command on the
 * original geometry. Meant for exact conversions, which keep the geometry of the commands around them.
 */
function convertCommands(commands: readonly PathCommand[], targets: ReadonlyMap<number, string>): readonly PathCommand[] {
  const segments = absoluteSegments(commands);

  return commands.map((item, index) => {
    const command = targets.get(index);
    const segment = segments[index];

    if (command === undefined || !segment) {
      return item;
    }

    const target = normalizeCommand(command);
    const relative = command === command.toLowerCase();
    const absoluteValues = convertedSegmentValues(segment, target);
    const values = relative ? toRelativeValues(target, absoluteValues, segment.start) : absoluteValues;
    return { command: relative ? target.toLowerCase() : target, values };
  });
}

/**
 * The optimizer's path simplification, following GodSVG: each command becomes the shortest command type that draws
 * exactly the same segment. Flat curves and arcs become `L`, `H`, or `V`; lines become `H` or `V`; curves whose
 * control points are implied become `T` or `S`; cubics equal to a quadratic become `Q`; circular arcs lose their
 * rotation. Absolute or relative form is kept. Conversions that would change how a following `S`/`T` is drawn are
 * skipped.
 */
export function simplifyPathCommands(commands: readonly PathCommand[]): readonly PathCommand[] {
  const segments = absoluteSegments(commands);
  const targets = new Map<number, string>();
  let next: readonly PathCommand[] = commands;

  segments.forEach((segment, index) => {
    const following = segments[index + 1]?.source.letter;
    const target = simplerCommand(segment, following);

    if (target) {
      const original = commands[index]?.command ?? target;
      targets.set(index, original === original.toLowerCase() ? target.toLowerCase() : target);
    }

    if (!target && segment.source.letter === "A" && segment.source.values[0] === segment.source.values[1] && segment.source.values[2] !== 0) {
      next = updateCommandValue(next, index, 2, 0);
    }
  });

  return targets.size > 0 ? convertCommands(next, targets) : next;
}

function simplerCommand(segment: AbsoluteSegment, following: PathCommandLetter | undefined): PathCommandLetter | undefined {
  const letter = segment.source.letter;
  const followedByT = following === "T";
  const followedByS = following === "S";
  const straight = straightLetter(segment);

  switch (letter) {
    case "L":
      return straight === "L" ? undefined : straight;
    case "A": {
      const [rx, ry] = segment.source.values;
      const flat = rx === 0 || ry === 0 || nearlyEqualPoints(segment.start, segment.end);
      return flat ? straight : undefined;
    }
    case "Q":
    case "T": {
      const control = segment.quadraticControl;

      if (control && !followedByT && isPointOnSegment(control, segment.start, segment.end)) {
        return straight;
      }

      return letter === "Q" && control && nearlyEqualPoints(control, segment.impliedQuadraticControl) ? "T" : undefined;
    }
    case "C":
    case "S": {
      const controls = segment.cubicControls;

      if (!controls) {
        return undefined;
      }

      if (!followedByS && controls.every((control) => isPointOnSegment(control, segment.start, segment.end))) {
        return straight;
      }

      const quadratic = exactQuadraticFromCubic(segment);

      if (quadratic && !followedByS && !followedByT && nearlyEqualPoints(quadratic, segment.impliedQuadraticControl)) {
        return "T";
      }

      if (letter === "C" && nearlyEqualPoints(controls[0], segment.impliedCubicControl)) {
        return "S";
      }

      return letter === "C" && quadratic && !followedByS && !followedByT ? "Q" : undefined;
    }
    default:
      return undefined;
  }
}

/** The line command that draws a straight segment: `H` or `V` when axis-aligned, otherwise `L`. */
function straightLetter(segment: AbsoluteSegment): PathCommandLetter {
  if (segment.end.y === segment.start.y) {
    return "H";
  }

  return segment.end.x === segment.start.x ? "V" : "L";
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
  /** Control point a `T` at this position would get: the reflection of the previous quadratic's control. */
  readonly impliedQuadraticControl: Point;
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
      impliedCubicControl,
      impliedQuadraticControl: reflectedQuadratic
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

/** Equal within the 6-decimal output precision, relative to the magnitude of the coordinates. */
function nearlyEqualPoints(a: Point, b: Point): boolean {
  return nearlyEqual(a.x, b.x) && nearlyEqual(a.y, b.y);
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
}

/** A command with absolute coordinates and a flag for whether it is written relative. */
export type AbsoluteCommand = {
  readonly letter: PathCommandLetter;
  readonly relative: boolean;
  readonly values: readonly number[];
};

/** Commands in absolute coordinates, keeping each command's relative flag; see `fromAbsoluteCommands`. */
export function toAbsoluteCommands(commands: readonly PathCommand[]): readonly AbsoluteCommand[] {
  return absoluteSegments(commands).map((segment, index) => ({
    letter: segment.source.letter,
    relative: isRelativeCommand(commands[index]?.command ?? ""),
    values: segment.source.values
  }));
}

/**
 * Writes absolute commands back, making relative ones relative to their new start point. Restructuring a path
 * (deleting, reordering, reversing) in absolute form keeps every other command's geometry, as in GodSVG.
 */
export function fromAbsoluteCommands(commands: readonly AbsoluteCommand[]): readonly PathCommand[] {
  let current: Point = { x: 0, y: 0 };
  let subpathStart: Point = { x: 0, y: 0 };

  return commands.map((command) => {
    const values = command.relative ? toRelativeValues(command.letter, command.values, current) : [...command.values];
    const names: readonly string[] = parameterNames[command.letter];
    const xIndex = names.lastIndexOf("x");
    const yIndex = names.lastIndexOf("y");

    if (command.letter === "Z") {
      current = subpathStart;
    } else {
      current = { x: xIndex === -1 ? current.x : command.values[xIndex] ?? current.x, y: yIndex === -1 ? current.y : command.values[yIndex] ?? current.y };
    }

    if (command.letter === "M") {
      subpathStart = current;
    }

    return { command: command.relative ? command.letter.toLowerCase() : command.letter, values };
  });
}

function isRelativeCommand(command: string): boolean {
  return command !== "" && command === command.toLowerCase();
}

/** One drawn command of a path in absolute coordinates, for outlines in the viewport. */
export type PathSegmentOutline = {
  readonly index: number;
  /** A standalone path drawing just this command, starting with `M` at its start point. */
  readonly d: string;
  /** Control-point tangents (start → first control, second control → end) of curve commands. */
  readonly tangents: readonly (readonly [Point, Point])[];
};

/**
 * Splits a path into per-command outlines so each command can be highlighted on its own, like GodSVG's contours.
 * `M` draws nothing; shorthand curves use their implied control points; `Z` becomes the closing line.
 */
export function pathSegmentOutlines(commands: readonly PathCommand[]): readonly PathSegmentOutline[] {
  return absoluteSegments(commands).flatMap((segment, index): PathSegmentOutline[] => {
    const { start, end } = segment;
    const move = `M ${start.x} ${start.y}`;
    const cubic = segment.cubicControls;
    const quadratic = segment.quadraticControl;

    switch (segment.source.letter) {
      case "M":
        return [];
      case "C":
      case "S":
        return cubic
          ? [{ index, d: `${move} C ${cubic[0].x} ${cubic[0].y} ${cubic[1].x} ${cubic[1].y} ${end.x} ${end.y}`, tangents: [[start, cubic[0]], [cubic[1], end]] }]
          : [];
      case "Q":
      case "T":
        return quadratic
          ? [{ index, d: `${move} Q ${quadratic.x} ${quadratic.y} ${end.x} ${end.y}`, tangents: [[start, quadratic], [quadratic, end]] }]
          : [];
      case "A": {
        const [rx = 0, ry = 0, rotation = 0, large = 0, sweep = 0] = segment.source.values;
        return [{ index, d: `${move} A ${rx} ${ry} ${rotation} ${large} ${sweep} ${end.x} ${end.y}`, tangents: [] }];
      }
      default:
        return [{ index, d: `${move} L ${end.x} ${end.y}`, tangents: [] }];
    }
  });
}

/**
 * Returns the vertices of a single-subpath path made only of straight segments, and whether it ends with `Z`, or
 * `undefined` when a segment is curved. Lines, `H`/`V`, zero-radius arcs, and curves whose control points lie on the
 * segment count as straight, matching GodSVG's exact conversion to lines.
 */
export function straightPathVertices(
  commands: readonly PathCommand[]
): { readonly points: readonly Point[]; readonly closed: boolean } | undefined {
  const [first, ...rest] = absoluteSegments(commands);

  if (!first) {
    return { points: [], closed: false };
  }

  if (first.source.letter !== "M") {
    return undefined;
  }

  const points: Point[] = [first.end];
  let closed = false;

  for (const [index, segment] of rest.entries()) {
    if (segment.source.letter === "Z" && index === rest.length - 1) {
      closed = true;
      continue;
    }

    if (!isStraightSegment(segment)) {
      return undefined;
    }

    points.push(segment.end);
  }

  return { points, closed };
}

function isStraightSegment(segment: AbsoluteSegment): boolean {
  switch (segment.source.letter) {
    case "L":
    case "H":
    case "V":
      return true;
    case "M":
    case "Z":
      return false;
    case "A":
      return segment.source.values[0] === 0 || segment.source.values[1] === 0;
    default: {
      const controls = segment.quadraticControl ? [segment.quadraticControl] : (segment.cubicControls ?? []);
      return controls.every((control) => isPointOnSegment(control, segment.start, segment.end));
    }
  }
}

/** Whether `point` lies on the segment from `start` to `end`, within floating-point tolerance (GodSVG's check). */
export function isPointOnSegment(point: Point, start: Point, end: Point): boolean {
  const startToPoint = squaredDistance(start, point);
  const endToPoint = squaredDistance(end, point);
  const startToEnd = squaredDistance(start, end);

  if (startToPoint < 1e-12 || endToPoint < 1e-12) {
    return true;
  }

  if (startToEnd < startToPoint || startToEnd < endToPoint) {
    return false;
  }

  const cross = (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x);
  return Math.abs(cross) <= 1e-9 * startToEnd;
}

function squaredDistance(a: Point, b: Point): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

/** Rewrites every command after the first as relative, keeping the geometry. */
export function toRelativeCommands(commands: readonly PathCommand[]): readonly PathCommand[] {
  return commands.reduce<readonly PathCommand[]>((next, command, index) => {
    const isAbsolute = command.command !== command.command.toLowerCase();
    return index > 0 && isAbsolute ? toggleRelative(next, index) : next;
  }, commands);
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
