import { describe, expect, it } from 'vitest';

import {
  deleteCommands,
  isWholeSubpaths,
  moveSubpaths,
  reverseSubpaths,
  setSubpathOrigins,
  subpathRanges
} from '../src/editor/path-selection';
import { formatPathData, parsePathData } from '../src/path-data';

const text = (commands: Parameters<typeof formatPathData>[0]) => formatPathData(commands);

describe('subpaths', () => {
  it('start at index 0, at every M, and after every Z', () => {
    expect(subpathRanges(parsePathData('M0 0 L1 1 Z L5 5 M9 9 L8 8'))).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 3 },
      { start: 4, end: 5 }
    ]);
    expect(isWholeSubpaths(parsePathData('M0 0 L1 1 M5 5 L6 6'), [2, 3])).toBe(true);
    expect(isWholeSubpaths(parsePathData('M0 0 L1 1 M5 5 L6 6'), [2])).toBe(false);
  });
});

describe('deleteCommands', () => {
  it('keeps the absolute geometry of the remaining relative commands', () => {
    expect(text(deleteCommands(parsePathData('M0 0 l10 0 l0 10'), [1]))).toBe('M 0 0 l 10 10');
  });
});

describe('moveSubpaths', () => {
  it('swaps subpaths and rewrites relative moves from their new start', () => {
    const edit = moveSubpaths(parsePathData('M0 0 l1 1 m5 5 l1 1'), [2, 3], -1);

    expect(text(edit.commands)).toBe('m 6 6 l 1 1 M 0 0 l 1 1');
    expect(edit.indices).toEqual([0, 1]);
  });

  it('gives a subpath continuing after Z its own move when it leaves', () => {
    expect(text(moveSubpaths(parsePathData('M0 0 L5 0 Z L0 5 M9 9 L8 8'), [3], 1).commands)).toBe('M 0 0 L 5 0 Z M 9 9 L 8 8 M 0 0 L 0 5');
  });
});

describe('reverseSubpaths', () => {
  it('reverses open subpaths, swapping cubic controls', () => {
    expect(text(reverseSubpaths(parsePathData('M0 0 L10 0 C10 5 5 10 0 10'), [0, 1, 2]).commands)).toBe('M 0 10 C 5 10 10 5 10 0 L 0 0');
  });

  it('reverses closed subpaths, letting Z draw the first straight segment', () => {
    expect(text(reverseSubpaths(parsePathData('M0 0 L10 0 L10 10 Z'), [0, 1, 2, 3]).commands)).toBe('M 0 0 L 10 10 L 10 0 Z');
  });

  it('makes shorthand curves explicit and flips arc sweeps', () => {
    expect(text(reverseSubpaths(parsePathData('M0 0 C0 5 5 5 5 0 S10 -5 10 0 A5 5 0 0 1 20 0'), [0, 1, 2, 3]).commands)).toBe(
      'M 20 0 A 5 5 0 0 0 10 0 C 10 -5 5 -5 5 0 C 5 5 0 5 0 0'
    );
  });
});

describe('setSubpathOrigins', () => {
  it('rotates a closed subpath to start at the selected point', () => {
    const edit = setSubpathOrigins(parsePathData('M0 0 L10 0 L10 10 Z'), [1]);

    expect(text(edit.commands)).toBe('M 10 0 L 10 10 L 0 0 Z');
    expect(edit.indices).toEqual([0]);
  });

  it('leaves open subpaths alone', () => {
    expect(text(setSubpathOrigins(parsePathData('M0 0 L10 0 L10 10'), [1]).commands)).toBe('M 0 0 L 10 0 L 10 10');
  });
});

describe('command selection clicks', () => {
  it('replaces, toggles, and extends like GodSVG', async () => {
    const { nextCommandSelection, subpathSelection, insertCommandAfter, commandSelectionActions } = await import('../src/editor/path-selection');
    const one = nextCommandSelection(undefined, 'p', 2, { ctrl: false, shift: false });

    expect(one).toEqual({ nodeId: 'p', indices: [2], pivot: 2 });
    expect(nextCommandSelection(one, 'p', 4, { ctrl: false, shift: true })?.indices).toEqual([2, 3, 4]);
    expect(nextCommandSelection(one, 'p', 4, { ctrl: true, shift: false })).toEqual({ nodeId: 'p', indices: [2, 4], pivot: 4 });
    expect(nextCommandSelection(one, 'p', 2, { ctrl: true, shift: false })).toBeUndefined();
    expect(nextCommandSelection(one, 'q', 4, { ctrl: false, shift: true })).toEqual({ nodeId: 'q', indices: [4], pivot: 4 });
    expect(subpathSelection(parsePathData('M0 0 L1 1 M5 5 L6 6 Z'), 'p', 3)?.indices).toEqual([2, 3, 4]);

    const inserted = insertCommandAfter(parsePathData('M10 10 l5 0 l0 5'), 1, 'L');
    expect(text(inserted.commands)).toBe('M 10 10 l 5 0 L 15 10 l 0 5');

    const actions = commandSelectionActions(parsePathData('M0 0 L1 1 Z M5 5 L6 6 L7 5 Z'), [3, 4, 5, 6]);
    expect(actions).toEqual({ moveUp: true, moveDown: false, reverse: true, setOrigin: false });
  });
});
