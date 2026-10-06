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

  it('keeps explicit move commands that start new subpaths', () => {
    expect(parsePathData('M0 0 L10 10 M20 20 L30 30 Z m 5 5 h 1').map((item) => item.command)).toEqual(['M', 'L', 'M', 'L', 'Z', 'm', 'h']);
  });

  it('parses compact arc flags and numbers without separators', () => {
    expect(parsePathData('M12 2a10 10 0 100 20 10 10 0 000-20z')).toEqual([
      { command: 'M', values: [12, 2] },
      { command: 'a', values: [10, 10, 0, 1, 0, 0, 20] },
      { command: 'a', values: [10, 10, 0, 0, 0, 0, -20] },
      { command: 'z', values: [] }
    ]);
    expect(parsePathData('M0 0.5.5 1l1e-5-2E2')).toEqual([
      { command: 'M', values: [0, 0.5] },
      { command: 'L', values: [0.5, 1] },
      { command: 'l', values: [1e-5, -200] }
    ]);
  });

  it('stops at the first error and keeps the commands before it', () => {
    expect(parsePathData('M10')).toEqual([]);
    expect(parsePathData('M0 0 L10')).toEqual([{ command: 'M', values: [0, 0] }]);
    expect(parsePathData('M 0 0 L 1 1 2')).toEqual([
      { command: 'M', values: [0, 0] },
      { command: 'L', values: [1, 1] }
    ]);
    expect(parsePathData('M0 0 A1 1 0 2 0 5 5')).toEqual([{ command: 'M', values: [0, 0] }]);
    expect(parsePathData('M0 0 Z 5 5')).toEqual([
      { command: 'M', values: [0, 0] },
      { command: 'Z', values: [] }
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
