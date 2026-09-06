/**
 * ABR Brush Tip Image Tests
 * Tests for brush tip pixel data integrity, RLE compression, and image round-trip.
 */

import { describe, expect, test } from 'vitest';
import { AbrParser, AbrWriter, createAbrFile, createBrush, createBrushTip } from './test-helpers';

describe('Brush Tip Image Integrity', () => {
  test('should preserve brush tip pixel data after round-trip', () => {
    const tipSize = 16;
    const tipData = new Uint8Array(tipSize * tipSize);
    // Create test pattern
    for (let i = 0; i < tipData.length; i++) {
      tipData[i] = i % 256;
    }

    const abrFile = createAbrFile([
      createBrush({
        name: 'Pixel Test Brush',
        type: 'sampled',
        diameter: tipSize,
        brushTip: createBrushTip(tipSize, tipSize, tipData)
      })
    ]);

    const parser = new AbrParser();
    const writer = new AbrWriter();

    const buffer = writer.write(abrFile);
    const reparsed = parser.parse(buffer);

    expect(reparsed.brushes.length).toBe(1);
    expect(reparsed.brushes[0].brushTip).toBeDefined();

    const reparsedTip = reparsed.brushes[0].brushTip!;
    expect(reparsedTip.width).toBe(tipSize);
    expect(reparsedTip.height).toBe(tipSize);
    expect(reparsedTip.data.length).toBe(tipData.length);

    // Verify pixel data matches
    for (let i = 0; i < tipData.length; i++) {
      expect(reparsedTip.data[i]).toBe(tipData[i]);
    }
  });

  test('should handle RLE compression correctly', () => {
    const tipSize = 64;
    const tipData = new Uint8Array(tipSize * tipSize);
    // Create pattern with runs (good for RLE)
    for (let y = 0; y < tipSize; y++) {
      const value = y < tipSize / 2 ? 255 : 0; // Top half white, bottom black
      for (let x = 0; x < tipSize; x++) {
        tipData[y * tipSize + x] = value;
      }
    }

    const abrFile = createAbrFile([
      createBrush({
        name: 'RLE Test Brush',
        type: 'sampled',
        diameter: tipSize,
        brushTip: createBrushTip(tipSize, tipSize, tipData)
      })
    ]);

    const parser = new AbrParser();
    const writer = new AbrWriter({ useRleCompression: true });

    const buffer = writer.write(abrFile);
    const reparsed = parser.parse(buffer);

    const reparsedTip = reparsed.brushes[0].brushTip!;

    // Verify pixels match
    let mismatches = 0;
    for (let i = 0; i < tipData.length; i++) {
      if (reparsedTip.data[i] !== tipData[i]) {
        mismatches++;
      }
    }
    expect(mismatches).toBe(0);
  });

  test('should handle very large brush tip', () => {
    const tipSize = 512;
    const tipData = new Uint8Array(tipSize * tipSize).fill(128);

    const abrFile = createAbrFile([
      createBrush({
        name: 'Large Brush',
        type: 'sampled',
        diameter: tipSize,
        brushTip: createBrushTip(tipSize, tipSize, tipData)
      })
    ]);

    const parser = new AbrParser();
    const writer = new AbrWriter();

    const buffer = writer.write(abrFile);
    // RLE is very efficient for uniform data, so compressed size can be much smaller
    expect(buffer.length).toBeGreaterThan(1000);

    const reparsed = parser.parse(buffer);
    expect(reparsed.brushes[0].brushTip!.width).toBe(tipSize);
    expect(reparsed.brushes[0].brushTip!.height).toBe(tipSize);

    // Verify pixel data integrity
    const reparsedTip = reparsed.brushes[0].brushTip!;
    let allMatch = true;
    for (let i = 0; i < tipData.length; i++) {
      if (reparsedTip.data[i] !== tipData[i]) {
        allMatch = false;
        break;
      }
    }
    expect(allMatch).toBe(true);
  });
});
