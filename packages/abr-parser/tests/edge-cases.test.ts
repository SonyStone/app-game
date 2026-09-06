/**
 * ABR Edge Cases & Brush Renaming Tests
 * Tests for empty names, special characters, large brushes, mixed types, and rename operations.
 */

import * as path from 'path';
import { describe, expect, test } from 'vitest';
import { AbrParser, AbrWriter, createAbrFile, createBrush, createBrushTip, FILES_DIR } from './test-helpers';

describe('Edge Cases', () => {
  test('should handle empty brush name', () => {
    const abrFile = createAbrFile([
      createBrush({
        name: '',
        type: 'computed',
        diameter: 30
      })
    ]);

    const parser = new AbrParser();
    const writer = new AbrWriter();

    const buffer = writer.write(abrFile);
    const reparsed = parser.parse(buffer);

    expect(reparsed.brushes.length).toBe(1);
  });

  test('should handle brush name with special characters', () => {
    const specialName = 'Test 日本語 Brush & <Special>';
    const abrFile = createAbrFile([
      createBrush({
        name: specialName,
        type: 'computed',
        diameter: 30
      })
    ]);

    const parser = new AbrParser();
    const writer = new AbrWriter();

    const buffer = writer.write(abrFile);
    const reparsed = parser.parse(buffer);

    expect(reparsed.brushes[0].name).toBe(specialName);
  });

  test('should handle very large brush', () => {
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

  test('should handle multiple brushes of mixed types', () => {
    const tipSize = 32;
    const tipData = new Uint8Array(tipSize * tipSize).fill(200);

    const abrFile = createAbrFile([
      createBrush({ name: 'Computed 1', type: 'computed', diameter: 30 }),
      createBrush({
        name: 'Sampled 1',
        type: 'sampled',
        diameter: tipSize,
        brushTip: createBrushTip(tipSize, tipSize, tipData)
      }),
      createBrush({ name: 'Computed 2', type: 'computed', diameter: 50, hardness: 50 }),
      createBrush({
        name: 'Sampled 2',
        type: 'sampled',
        diameter: tipSize,
        brushTip: createBrushTip(tipSize, tipSize, new Uint8Array(tipSize * tipSize).fill(100))
      })
    ]);

    const parser = new AbrParser();
    const writer = new AbrWriter();

    const buffer = writer.write(abrFile);
    const reparsed = parser.parse(buffer);

    expect(reparsed.brushes.length).toBe(4);
    expect(reparsed.brushes.filter((b) => b.type === 'computed').length).toBe(2);
    expect(reparsed.brushes.filter((b) => b.type === 'sampled').length).toBe(2);
  });
});

describe('Brush Renaming', () => {
  test('should preserve brush after renaming to longer name', () => {
    const parser = new AbrParser();
    const writer = new AbrWriter();

    const filePath = path.join(FILES_DIR, 'Basic_3.abr');
    const original = parser.parseFile(filePath);

    const brush = original.brushes.find((b) => b.name.includes('Hard Flat'));
    expect(brush).toBeDefined();

    const originalName = brush!.name;
    brush!.name = 'Hard Flat 41 123qwe Extended Name';

    const buffer = writer.write(original);
    const reparsed = parser.parse(buffer);

    expect(reparsed.brushes.length).toBe(original.brushes.length);

    const renamedBrush = reparsed.brushes.find((b) => b.name === 'Hard Flat 41 123qwe Extended Name');
    expect(renamedBrush).toBeDefined();
    expect(renamedBrush!.type).toBe(brush!.type);
  });

  test('should preserve brush after renaming to shorter name', () => {
    const parser = new AbrParser();
    const writer = new AbrWriter();

    const filePath = path.join(FILES_DIR, 'Basic_3.abr');
    const original = parser.parseFile(filePath);

    const brush = original.brushes.find((b) => b.name.includes('Hard Flat'));
    expect(brush).toBeDefined();

    brush!.name = 'HF';

    const buffer = writer.write(original);
    const reparsed = parser.parse(buffer);

    const renamedBrush = reparsed.brushes.find((b) => b.name === 'HF');
    expect(renamedBrush).toBeDefined();
  });

  test('should handle brush name with unicode characters', () => {
    const parser = new AbrParser();
    const writer = new AbrWriter();

    const abrFile = createAbrFile([
      createBrush({
        name: 'Кисть 日本語 Brush 🎨',
        type: 'computed',
        diameter: 30
      })
    ]);

    const buffer = writer.write(abrFile);
    const reparsed = parser.parse(buffer);

    expect(reparsed.brushes[0].name).toBe('Кисть 日本語 Brush 🎨');
  });

  test('should preserve all brush settings after rename', () => {
    const parser = new AbrParser();
    const writer = new AbrWriter();

    const filePath = path.join(FILES_DIR, 'Basic_3.abr');
    const original = parser.parseFile(filePath);

    const brush = original.brushes.find((b) => b.name.includes('Hard Flat'));
    expect(brush).toBeDefined();

    const originalSettings = JSON.stringify(brush!.settings);
    const originalDiameter = brush!.diameter;
    const originalSpacing = brush!.spacing;

    brush!.name = 'Renamed Brush';

    const buffer = writer.write(original);
    const reparsed = parser.parse(buffer);

    const renamedBrush = reparsed.brushes.find((b) => b.name === 'Renamed Brush');
    expect(renamedBrush).toBeDefined();
    expect(renamedBrush!.diameter).toBe(originalDiameter);
    expect(renamedBrush!.spacing).toBe(originalSpacing);
  });
});
