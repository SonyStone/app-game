import { fromAbsoluteCommands, toAbsoluteCommands, type AbsoluteCommand, type PathCommand } from '../path-data';

/**
 * Operations on selected path commands, ported from GodSVG's inner selections. Every operation works on absolute
 * coordinates and writes each command back in its own absolute or relative form, so commands that are not part of
 * the operation keep their geometry.
 */

/** Selected commands of one path; the pivot anchors Shift range selection. */
export type CommandSelection = {
  readonly nodeId: string;
  readonly indices: readonly number[];
  readonly pivot: number;
};

/**
 * The selection after clicking a command, like GodSVG: a plain click selects only it, Ctrl/Cmd toggles it, and Shift
 * adds the range from the pivot. Clicking a command of another path starts a new selection there.
 */
export function nextCommandSelection(
  current: CommandSelection | undefined,
  nodeId: string,
  index: number,
  modifiers: { readonly ctrl: boolean; readonly shift: boolean }
): CommandSelection | undefined {
  if (!current || current.nodeId !== nodeId || (!modifiers.ctrl && !modifiers.shift)) {
    return { nodeId, indices: [index], pivot: index };
  }

  if (modifiers.shift) {
    const from = Math.min(current.pivot, index);
    const to = Math.max(current.pivot, index);
    const range = Array.from({ length: to - from + 1 }, (_, offset) => from + offset);
    return { ...current, indices: [...new Set([...current.indices, ...range])] };
  }

  if (current.indices.includes(index)) {
    const indices = current.indices.filter((item) => item !== index);
    return indices.length > 0 ? { nodeId, indices, pivot: current.pivot === index ? (indices[0] ?? index) : current.pivot } : undefined;
  }

  return { nodeId, indices: [...current.indices, index], pivot: index };
}

/** Selects the whole subpath containing a command, as GodSVG does on double-click. */
export function subpathSelection(commands: readonly PathCommand[], nodeId: string, index: number): CommandSelection | undefined {
  const range = subpathAt(commands, index);
  return range ? { nodeId, indices: rangeIndices(range), pivot: range.start } : undefined;
}

/** The commands after an edit, and where the selected commands ended up. */
export type CommandsEdit = { readonly commands: readonly PathCommand[]; readonly indices: readonly number[] };

/** A subpath as an inclusive command range. */
export type SubpathRange = { readonly start: number; readonly end: number };

/** Subpaths as GodSVG counts them: they start at index 0, at every `M`, and after every `Z`. */
export function subpathRanges(commands: readonly PathCommand[]): readonly SubpathRange[] {
  const starts = commands.flatMap((command, index) => {
    const previous = commands[index - 1];
    const startsSubpath = index === 0 || command.command.toUpperCase() === 'M' || previous?.command.toUpperCase() === 'Z';
    return startsSubpath ? [index] : [];
  });

  return starts.map((start, index) => ({ start, end: (starts[index + 1] ?? commands.length) - 1 }));
}

/** The subpath containing a command. */
export function subpathAt(commands: readonly PathCommand[], index: number): SubpathRange | undefined {
  return subpathRanges(commands).find((range) => range.start <= index && index <= range.end);
}

/** Whether the selection consists of whole subpaths only (needed to move or reverse them). */
export function isWholeSubpaths(commands: readonly PathCommand[], indices: readonly number[]): boolean {
  const selected = new Set(indices);

  if (selected.size === 0) {
    return false;
  }

  return subpathRanges(commands).every((range) => {
    const covered = rangeIndices(range).filter((index) => selected.has(index)).length;
    return covered === 0 || covered === range.end - range.start + 1;
  });
}

/** Removes commands; the remaining commands keep their absolute geometry. */
export function deleteCommands(commands: readonly PathCommand[], indices: readonly number[]): readonly PathCommand[] {
  const removed = new Set(indices);
  return fromAbsoluteCommands(toAbsoluteCommands(commands).filter((_, index) => !removed.has(index)));
}

/**
 * Moves the selected whole subpaths one step up (`-1`) or down (`1`) among the subpaths, like GodSVG. A subpath that
 * does not start with `M` gets one at its start point when it moves away from the subpath it continued.
 */
export function moveSubpaths(commands: readonly PathCommand[], indices: readonly number[], direction: -1 | 1): CommandsEdit {
  const ranges = subpathRanges(commands);
  const selected = new Set(indices);
  const isSelected = (range: SubpathRange) => selected.has(range.start);
  const order = ranges.map((_, index) => index);
  const steps = direction === 1 ? [...order].reverse() : order;

  for (const subpath of steps) {
    const position = order.indexOf(subpath);
    const neighbor = position + direction;
    const range = ranges[subpath];
    const neighborRange = ranges[order[neighbor] ?? -1];

    if (range && neighborRange && isSelected(range) && !isSelected(neighborRange)) {
      order[position] = order[neighbor] ?? subpath;
      order[neighbor] = subpath;
    }
  }

  return rebuild(commands, order.map((index) => ranges[index]).filter((range): range is SubpathRange => Boolean(range)), selected);
}

/**
 * Reverses the direction of the selected whole subpaths, like GodSVG. Curves keep their shape: cubic controls swap,
 * arcs flip their sweep, and shorthand curves become explicit `C`/`Q` because their implied controls would change.
 */
export function reverseSubpaths(commands: readonly PathCommand[], indices: readonly number[]): CommandsEdit {
  const absolute = toAbsoluteCommands(commands);
  const points = endPoints(absolute);
  const controls = explicitControls(commands);
  const selected = new Set(indices);
  const output: AbsoluteCommand[] = [];
  const outputIndices: number[] = [];

  for (const range of subpathRanges(commands)) {
    const original = absolute.slice(range.start, range.end + 1);

    if (!selected.has(range.start) || range.end === range.start) {
      pushRange(output, outputIndices, original, selected.has(range.start));
      continue;
    }

    const startCommand = absolute[range.start];
    const closed = absolute[range.end]?.letter === 'Z';
    const firstSegment = startCommand?.letter === 'M' ? range.start + 1 : range.start;
    const lastSegment = closed ? range.end - 1 : range.end;
    const start = startCommand?.letter === 'M' ? points[range.start] : points[range.start - 1];
    const last = points[lastSegment];
    const reversed: AbsoluteCommand[] = [];

    if (!start || !last) {
      pushRange(output, outputIndices, original, true);
      continue;
    }

    if (closed) {
      reversed.push({ letter: 'M', relative: startCommand?.relative ?? false, values: [start.x, start.y] });

      if (!samePoint(start, last)) {
        reversed.push({ letter: 'L', relative: absolute[lastSegment]?.relative ?? false, values: [last.x, last.y] });
      }
    } else {
      reversed.push({ letter: 'M', relative: startCommand?.relative ?? false, values: [last.x, last.y] });
    }

    // In a closed subpath the closing Z draws the reversed first segment when it is a straight line.
    const firstIsStraight = ['L', 'H', 'V'].includes(absolute[firstSegment]?.letter ?? '');
    const stop = closed && firstIsStraight ? firstSegment + 1 : firstSegment;

    for (let index = lastSegment; index >= stop; index -= 1) {
      const command = absolute[index];
      const from = index === firstSegment ? start : points[index - 1];

      if (command && from) {
        reversed.push(reverseSegment(command, from, controls[index]));
      }
    }

    if (closed) {
      reversed.push(absolute[range.end] ?? { letter: 'Z', relative: false, values: [] });
    }

    pushRange(output, outputIndices, reversed, true);
  }

  return { commands: fromAbsoluteCommands(output), indices: outputIndices };
}

/**
 * Makes the selected command's end point the start of its closed subpath, one selection per subpath, like GodSVG's
 * "Set as origin". The subpath is rotated; a straight segment ending at the new origin is dropped because the closing
 * `Z` draws it. Shorthand curves in the subpath become explicit `C`/`Q`.
 */
export function setSubpathOrigins(commands: readonly PathCommand[], indices: readonly number[]): CommandsEdit {
  const absolute = toAbsoluteCommands(commands);
  const points = endPoints(absolute);
  const controls = explicitControls(commands);
  const output: AbsoluteCommand[] = [];
  const outputIndices: number[] = [];

  for (const range of subpathRanges(commands)) {
    const original = absolute.slice(range.start, range.end + 1);
    const closed = absolute[range.end]?.letter === 'Z';
    const startCommand = absolute[range.start];
    const firstSegment = startCommand?.letter === 'M' ? range.start + 1 : range.start;
    const selected = indices.find((index) => index >= firstSegment && index < range.end);
    const origin = startCommand?.letter === 'M' ? points[range.start] : points[range.start - 1];
    const newOrigin = selected === undefined ? undefined : points[selected];

    if (!closed || selected === undefined || !origin || !newOrigin) {
      pushRange(output, outputIndices, original, false);
      continue;
    }

    const explicit = (index: number) => explicitSegment(absolute[index], controls[index]);
    const lastSegment = range.end - 1;
    const lastPoint = points[lastSegment];
    const rotated: AbsoluteCommand[] = [{ letter: 'M', relative: startCommand?.relative ?? false, values: [newOrigin.x, newOrigin.y] }];

    for (let index = selected + 1; index <= lastSegment; index += 1) {
      rotated.push(explicit(index));
    }

    if (lastPoint && !samePoint(lastPoint, origin)) {
      rotated.push({ letter: 'L', relative: absolute[lastSegment]?.relative ?? false, values: [origin.x, origin.y] });
    }

    for (let index = firstSegment; index < selected; index += 1) {
      rotated.push(explicit(index));
    }

    if (!['L', 'H', 'V'].includes(absolute[selected]?.letter ?? '')) {
      rotated.push(explicit(selected));
    }

    rotated.push(absolute[range.end] ?? { letter: 'Z', relative: false, values: [] });
    outputIndices.push(output.length);
    output.push(...rotated);
  }

  return { commands: fromAbsoluteCommands(output), indices: outputIndices };
}

/**
 * Inserts a command after `afterIndex`, ending at `target` (default: where the previous command ends, so it starts at
 * zero length). Control points sit on the segment like GodSVG's `insert_command`; the command's case picks absolute
 * or relative, and the other commands keep their geometry.
 */
export function insertCommandAfter(commands: readonly PathCommand[], afterIndex: number, letter: string, target?: Point): CommandsEdit {
  const absolute = toAbsoluteCommands(commands);
  const start = endPoints(absolute)[afterIndex] ?? { x: 0, y: 0 };
  const end = target ?? start;
  const upper = letter.toUpperCase();
  const lerp = (t: number) => [start.x + (end.x - start.x) * t, start.y + (end.y - start.y) * t];
  const values: Record<string, readonly number[]> = {
    M: [end.x, end.y],
    L: [end.x, end.y],
    T: [end.x, end.y],
    H: [end.x],
    V: [end.y],
    Z: [],
    A: [1, 1, 0, 0, 0, end.x, end.y],
    Q: [...lerp(1 / 2), end.x, end.y],
    S: [...lerp(2 / 3), end.x, end.y],
    C: [...lerp(1 / 3), ...lerp(2 / 3), end.x, end.y]
  };
  const inserted: AbsoluteCommand = {
    letter: (upper in values ? upper : 'L') as AbsoluteCommand['letter'],
    relative: letter === letter.toLowerCase(),
    values: values[upper] ?? [end.x, end.y]
  };
  const output = [...absolute.slice(0, afterIndex + 1), inserted, ...absolute.slice(afterIndex + 1)];

  return { commands: fromAbsoluteCommands(output), indices: [afterIndex + 1] };
}

/** Which selection operations apply, following GodSVG's context menu rules. */
export function commandSelectionActions(
  commands: readonly PathCommand[],
  indices: readonly number[]
): { readonly moveUp: boolean; readonly moveDown: boolean; readonly reverse: boolean; readonly setOrigin: boolean } {
  const whole = isWholeSubpaths(commands, indices);
  const selected = new Set(indices);
  const min = Math.min(...indices);
  const max = Math.max(...indices);
  const unselectedIn = (from: number, to: number) => Array.from({ length: Math.max(0, to - from) }, (_, offset) => from + offset).some((index) => !selected.has(index));
  const reversible = subpathRanges(commands).some(
    (range) => selected.has(range.start) && range.end > range.start && !(range.end === range.start + 1 && commands[range.end]?.command.toUpperCase() === 'Z')
  );
  // GodSVG: one selected command per subpath, each in a closed subpath, and the rotation must change something.
  const ranges = indices.map((index) => subpathAt(commands, index));
  const oneClosedPerSubpath =
    ranges.every((range) => range && commands[range.end]?.command.toUpperCase() === 'Z') &&
    new Set(ranges.map((range) => range?.start)).size === indices.length;
  const setOrigin =
    oneClosedPerSubpath && formatSignature(setSubpathOrigins(commands, indices).commands) !== formatSignature(commands);

  return {
    moveUp: whole && unselectedIn(0, max + 1),
    moveDown: whole && unselectedIn(min, commands.length),
    reverse: whole && reversible,
    setOrigin
  };
}

function formatSignature(commands: readonly PathCommand[]): string {
  return commands.map((command) => `${command.command}${command.values.join(',')}`).join(' ');
}

function rebuild(commands: readonly PathCommand[], order: readonly SubpathRange[], selected: ReadonlySet<number>): CommandsEdit {
  const absolute = toAbsoluteCommands(commands);
  const points = endPoints(absolute);
  const output: AbsoluteCommand[] = [];
  const outputIndices: number[] = [];
  let previousEnd = -1;

  for (const range of order) {
    const part = absolute.slice(range.start, range.end + 1);
    const first = part[0];
    const start = points[range.start - 1];

    // A subpath that continued the previous one needs its own move once it is placed elsewhere.
    if (first && first.letter !== 'M' && previousEnd !== range.start - 1 && start) {
      part.unshift({ letter: 'M', relative: first.relative, values: [start.x, start.y] });
    }

    pushRange(output, outputIndices, part, selected.has(range.start));
    previousEnd = range.end;
  }

  return { commands: fromAbsoluteCommands(output), indices: outputIndices };
}

function pushRange(output: AbsoluteCommand[], indices: number[], part: readonly AbsoluteCommand[], selected: boolean): void {
  if (selected) {
    indices.push(...part.map((_, offset) => output.length + offset));
  }

  output.push(...part);
}

/** End point of every command in absolute coordinates (`Z` ends at its subpath's start). */
function endPoints(commands: readonly AbsoluteCommand[]): readonly { x: number; y: number }[] {
  let current = { x: 0, y: 0 };
  let subpathStart = current;

  return commands.map((command) => {
    const values = command.values;

    if (command.letter === 'Z') {
      current = subpathStart;
    } else if (command.letter === 'H') {
      current = { x: values[0] ?? current.x, y: current.y };
    } else if (command.letter === 'V') {
      current = { x: current.x, y: values[0] ?? current.y };
    } else {
      current = { x: values[values.length - 2] ?? current.x, y: values[values.length - 1] ?? current.y };
    }

    if (command.letter === 'M') {
      subpathStart = current;
    }

    return current;
  });
}

type Controls = { readonly cubic?: readonly [Point, Point]; readonly quadratic?: Point };
type Point = { readonly x: number; readonly y: number };

/** Explicit control points of every curve, including the implied ones of `S` and `T`. */
function explicitControls(commands: readonly PathCommand[]): readonly Controls[] {
  const absolute = toAbsoluteCommands(commands);
  const points = endPoints(absolute);
  let previous: Controls = {};

  return absolute.map((command, index) => {
    const start = points[index - 1] ?? { x: 0, y: 0 };
    const v = command.values;
    const reflect = (point: Point | undefined): Point => (point ? { x: 2 * start.x - point.x, y: 2 * start.y - point.y } : start);
    let controls: Controls = {};

    if (command.letter === 'C') {
      controls = { cubic: [{ x: v[0] ?? 0, y: v[1] ?? 0 }, { x: v[2] ?? 0, y: v[3] ?? 0 }] };
    } else if (command.letter === 'S') {
      controls = { cubic: [reflect(previous.cubic?.[1]), { x: v[0] ?? 0, y: v[1] ?? 0 }] };
    } else if (command.letter === 'Q') {
      controls = { quadratic: { x: v[0] ?? 0, y: v[1] ?? 0 } };
    } else if (command.letter === 'T') {
      controls = { quadratic: reflect(previous.quadratic) };
    }

    previous = controls;
    return controls;
  });
}

/** A segment as an explicit command (`S` → `C`, `T` → `Q`), so moving it elsewhere keeps its shape. */
function explicitSegment(command: AbsoluteCommand | undefined, controls: Controls | undefined): AbsoluteCommand {
  if (!command) {
    return { letter: 'Z', relative: false, values: [] };
  }

  const end = command.values.slice(-2);

  if (command.letter === 'S' && controls?.cubic) {
    return { letter: 'C', relative: command.relative, values: [controls.cubic[0].x, controls.cubic[0].y, controls.cubic[1].x, controls.cubic[1].y, ...end] };
  }

  if (command.letter === 'T' && controls?.quadratic) {
    return { letter: 'Q', relative: command.relative, values: [controls.quadratic.x, controls.quadratic.y, ...end] };
  }

  return command;
}

/** The same segment drawn from its end back to `start`. */
function reverseSegment(command: AbsoluteCommand, start: Point, controls: Controls | undefined): AbsoluteCommand {
  const relative = command.relative;

  switch (command.letter) {
    case 'H':
      return { letter: 'H', relative, values: [start.x] };
    case 'V':
      return { letter: 'V', relative, values: [start.y] };
    case 'A': {
      const [rx = 0, ry = 0, rotation = 0, large = 0, sweep = 0] = command.values;
      return { letter: 'A', relative, values: [rx, ry, rotation, large, sweep === 1 ? 0 : 1, start.x, start.y] };
    }
    case 'C':
    case 'S':
      return controls?.cubic
        ? { letter: 'C', relative, values: [controls.cubic[1].x, controls.cubic[1].y, controls.cubic[0].x, controls.cubic[0].y, start.x, start.y] }
        : { letter: 'L', relative, values: [start.x, start.y] };
    case 'Q':
    case 'T':
      return controls?.quadratic
        ? { letter: 'Q', relative, values: [controls.quadratic.x, controls.quadratic.y, start.x, start.y] }
        : { letter: 'L', relative, values: [start.x, start.y] };
    default:
      return { letter: 'L', relative, values: [start.x, start.y] };
  }
}

function rangeIndices(range: SubpathRange): readonly number[] {
  return Array.from({ length: range.end - range.start + 1 }, (_, offset) => range.start + offset);
}

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
}
