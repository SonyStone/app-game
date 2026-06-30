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

export function parsePathData(data: string): readonly PathCommand[] {
  const tokens = tokenizePathData(data);
  const commands: PathCommand[] = [];
  let index = 0;
  let activeCommand = "";

  while (index < tokens.length) {
    const token = tokens[index];

    if (!token) {
      break;
    }

    if (isCommandToken(token)) {
      activeCommand = token;
      index += 1;
    } else if (!activeCommand) {
      index += 1;
      continue;
    }

    const commandLetter = normalizeCommand(activeCommand);
    const count = argCount[commandLetter];

    if (count === 0) {
      commands.push({ command: activeCommand, values: [] });
      activeCommand = "";
      continue;
    }

    let values = readNumbers(tokens, index, count);

    while (values.length === count) {
      const command = commands.length > 0 && normalizeCommand(activeCommand) === "M" ? implicitLineCommand(activeCommand) : activeCommand;
      commands.push({ command, values });
      index += count;

      const next = tokens[index];

      if (!next || isCommandToken(next)) {
        break;
      }

      values = readNumbers(tokens, index, count);
    }
  }

  return commands;
}

function tokenizePathData(data: string): readonly string[] {
  return data.match(/[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:(?:\d*\.\d+)|(?:\d+\.?))(?:[eE][-+]?\d+)?/g) ?? [];
}

function isCommandToken(token: string): boolean {
  return /^[AaCcHhLlMmQqSsTtVvZz]$/.test(token);
}

function normalizeCommand(command: string): PathCommandLetter {
  const normalized = command.toUpperCase();
  return pathCommandLetters.includes(normalized as PathCommandLetter) ? (normalized as PathCommandLetter) : "M";
}

function readNumbers(tokens: readonly string[], start: number, count: number): number[] {
  const values: number[] = [];

  for (let i = 0; i < count; i += 1) {
    const token = tokens[start + i];

    if (!token || isCommandToken(token)) {
      return [];
    }

    const value = Number.parseFloat(token);

    if (!Number.isFinite(value)) {
      return [];
    }

    values.push(value);
  }

  return values;
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

export function convertCommand(commands: readonly PathCommand[], commandIndex: number, command: string): readonly PathCommand[] {
  const normalized = normalizeCommand(command);
  const relative = command === command.toLowerCase();
  const letter = relative ? normalized.toLowerCase() : normalized;
  const needed = argCount[normalized];

  return commands.map((item, index) => {
    if (index !== commandIndex) {
      return item;
    }

    const values = [...item.values].slice(0, needed);

    while (values.length < needed) {
      values.push(defaultValueForParameter(normalized, values.length));
    }

    return { command: letter, values };
  });
}

export function toggleRelative(commands: readonly PathCommand[], commandIndex: number): readonly PathCommand[] {
  return commands.map((item, index) => {
    if (index !== commandIndex) {
      return item;
    }

    const normalized = normalizeCommand(item.command);

    if (normalized === "Z") {
      return { ...item, command: item.command === "Z" ? "z" : "Z" };
    }

    return { ...item, command: item.command === item.command.toLowerCase() ? normalized : normalized.toLowerCase() };
  });
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
