import { describe, expect, it } from 'vitest';

import {
  addPoint,
  convertCommand,
  createCommand,
  formatPathData,
  formatPoints,
  parsePathData,
  parsePoints,
  toggleRelative,
  updateCommandValue,
  updatePoint
} from '../src/path-data';

describe('path-data commands', () => {
  it('parses implicit line commands after move commands', () => {
    expect(parsePathData('M 10 20 30 40 l 5 6')).toEqual([
      { command: 'M', values: [10, 20] },
      { command: 'L', values: [30, 40] },
      { command: 'l', values: [5, 6] }
    ]);
  });

  it('updates, converts, toggles, and formats commands', () => {
    const commands = parsePathData('M 10 20 L 30 45');
    const updated = updateCommandValue(commands, 1, 1, 40);
    const relative = toggleRelative(updated, 1);
    const arc = convertCommand(relative, 1, 'a');

    expect(relative[1]).toEqual({ command: 'l', values: [20, 20] });
    expect(arc[1]).toEqual({ command: 'a', values: [20, 20, 0, 0, 0, 0, 0] });
    expect(formatPathData([createCommand('A')])).toBe('A 1 1 0 0 0 0 0');
  });
});

describe('path-data points', () => {
  it('parses and formats point lists', () => {
    const points = parsePoints('0,0 10 20 30,40');
    const updated = updatePoint(points, 1, 0, 12.5);

    expect(points).toEqual([
      [0, 0],
      [10, 20],
      [30, 40]
    ]);
    expect(formatPoints(updated)).toBe('0 0 12.5 20 30 40');
    expect(formatPoints(addPoint(updated))).toBe('0 0 12.5 20 30 40 70 80');
  });
});
