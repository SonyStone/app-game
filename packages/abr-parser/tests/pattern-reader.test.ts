import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { AbrParser } from '../src/abr-parser';
import { decodePattern, readPatternIndex } from '../src/pattern-reader';

describe('embedded pattern decoding', () => {
  const file = new AbrParser().parse(readFileSync('files/Brushes To Implement.abr'));
  test('indexes original resources without changing their encoded data', () => {
    const raw = file.rawPatternData!;
    const before = new Uint8Array(raw);
    const patterns = readPatternIndex(raw);
    expect(patterns.length).toBeGreaterThan(0);
    for (const pattern of patterns) {
      expect(pattern.id).toHaveLength(36);
      const tip = decodePattern(pattern);
      expect(tip.width * tip.height).toBe(tip.data.length);
      expect(tip.data.some((v) => v > 0)).toBe(true);
    }
    expect(raw).toEqual(before);
  });
  test('rejects truncated resources and unsupported color modes', () => {
    const raw = file.rawPatternData!;
    expect(() => readPatternIndex(raw.subarray(0, raw.length - 8))).toThrow();
    const pattern = readPatternIndex(raw)[0]!;
    expect(() => decodePattern({ ...pattern, mode: 9 })).toThrow('unsupported color mode');
    expect(() => decodePattern({ ...pattern, data: pattern.data.subarray(0, 20) })).toThrow();
  });
});
