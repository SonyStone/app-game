/**
 * ABR Binary Format Tests
 * Tests for Photoshop compatibility, 8BIM block structure, descriptor format,
 * TEXT string encoding, class names, and padding correctness.
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, test } from 'vitest';
import { AbrParser, AbrWriter, createAbrFile, createBrush, FILES_DIR } from './test-helpers';

describe('Photoshop Compatibility', () => {
  test('written file should have correct 8BIM block structure', () => {
    const abrFile = createAbrFile([
      createBrush({
        name: 'Structure Test',
        type: 'computed',
        diameter: 30
      })
    ]);

    const writer = new AbrWriter();
    const buffer = writer.write(abrFile);

    // Check version header
    expect(buffer[0]).toBe(0x00);
    expect(buffer[1]).toBe(0x06);
    expect(buffer[2]).toBe(0x00);
    expect(buffer[3]).toBe(0x02);

    // Find 8BIM signature
    let found8BIM = false;
    for (let i = 4; i < buffer.length - 8; i++) {
      if (
        buffer[i] === 0x38 && // '8'
        buffer[i + 1] === 0x42 && // 'B'
        buffer[i + 2] === 0x49 && // 'I'
        buffer[i + 3] === 0x4d
      ) {
        // 'M'
        found8BIM = true;

        // Check that it's followed by a valid key (4 chars)
        const key = String.fromCharCode(buffer[i + 4], buffer[i + 5], buffer[i + 6], buffer[i + 7]);
        expect(['samp', 'desc', 'patt']).toContain(key);
        break;
      }
    }
    expect(found8BIM).toBe(true);
  });

  test('descriptor block should have correct structure', () => {
    const abrFile = createAbrFile([
      createBrush({
        name: 'Descriptor Test',
        type: 'computed',
        diameter: 50,
        hardness: 75,
        spacing: 25
      })
    ]);

    const writer = new AbrWriter();
    const buffer = writer.write(abrFile);

    // Find 'desc' block
    let descStart = -1;
    for (let i = 4; i < buffer.length - 8; i++) {
      if (
        buffer[i] === 0x38 &&
        buffer[i + 1] === 0x42 &&
        buffer[i + 2] === 0x49 &&
        buffer[i + 3] === 0x4d &&
        buffer[i + 4] === 0x64 &&
        buffer[i + 5] === 0x65 &&
        buffer[i + 6] === 0x73 &&
        buffer[i + 7] === 0x63
      ) {
        descStart = i + 8; // After '8BIMdesc'
        break;
      }
    }
    expect(descStart).toBeGreaterThan(0);

    // Read descriptor size (4 bytes, big-endian)
    const descSize =
      (buffer[descStart] << 24) | (buffer[descStart + 1] << 16) | (buffer[descStart + 2] << 8) | buffer[descStart + 3];
    expect(descSize).toBeGreaterThan(0);
    expect(descSize).toBeLessThan(buffer.length);
  });

  test('should match original file structure for computed brushes', () => {
    const parser = new AbrParser();
    const original = parser.parseFile(path.join(FILES_DIR, 'Basic_3.abr'));

    // Find a computed brush
    const computedBrush = original.brushes.find((b) => b.type === 'computed');
    expect(computedBrush).toBeDefined();

    // Create a file with just that brush
    const writer = new AbrWriter();
    const buffer = writer.write(createAbrFile([computedBrush!]));

    // Re-parse should work
    const reparsed = parser.parse(buffer);
    expect(reparsed.brushes.length).toBe(1);
    expect(reparsed.brushes[0].type).toBe('computed');
    expect(reparsed.brushes[0].name).toBe(computedBrush!.name);
  });

  describe('Binary Format Comparison', () => {
    test('written file should use correct object class names', () => {
      const parser = new AbrParser();
      const original = parser.parseFile(path.join(FILES_DIR, 'Basic_3.abr'));
      const originalBuffer = fs.readFileSync(path.join(FILES_DIR, 'Basic_3.abr'));

      const writer = new AbrWriter();
      const writtenBuffer = writer.write(original);

      // Check for presence of 'brushPreset' class name in original
      const originalStr = originalBuffer.toString('binary');
      const writtenStr = Buffer.from(writtenBuffer).toString('binary');

      // Original uses specific class names - check what they are
      const hasBrushPreset = originalStr.includes('brushPreset');
      const hasComputedBrush = originalStr.includes('computedBrush');

      console.log('Original has brushPreset:', hasBrushPreset);
      console.log('Original has computedBrush:', hasComputedBrush);

      // Our output should have similar structure
      if (hasBrushPreset) {
        expect(writtenStr.includes('brushPreset') || writtenStr.includes('Brsh')).toBe(true);
      }
    });
  });
});

describe('Binary Format Correctness', () => {
  test('TEXT strings should include null terminator', () => {
    const parser = new AbrParser();
    const writer = new AbrWriter();

    const testName = 'Test Brush Name';
    const abrFile = createAbrFile([createBrush({ name: testName, type: 'computed', diameter: 30 })]);

    const buffer = writer.write(abrFile);

    // Find TEXT marker in buffer
    let foundCorrectText = false;
    for (let i = 0; i < buffer.length - 10; i++) {
      if (buffer[i] === 0x54 && buffer[i + 1] === 0x45 && buffer[i + 2] === 0x58 && buffer[i + 3] === 0x54) {
        // Found TEXT marker, read length
        const len = (buffer[i + 4] << 24) | (buffer[i + 5] << 16) | (buffer[i + 6] << 8) | buffer[i + 7];
        // Length should be testName.length + 1 (for null terminator)
        if (len === testName.length + 1) {
          // Verify null terminator
          const lastCharOffset = i + 8 + (len - 1) * 2;
          const lastChar = (buffer[lastCharOffset] << 8) | buffer[lastCharOffset + 1];
          if (lastChar === 0) {
            foundCorrectText = true;
            break;
          }
        }
      }
    }

    expect(foundCorrectText).toBe(true);
  });

  test('descriptor class names should use length=1 for empty names', () => {
    const parser = new AbrParser();
    const writer = new AbrWriter();

    const abrFile = createAbrFile([createBrush({ name: 'Test', type: 'computed', diameter: 30 })]);

    const buffer = writer.write(abrFile);

    // Find desc block and check className length
    let descOffset = -1;
    for (let i = 4; i < buffer.length - 12; i++) {
      if (
        buffer[i] === 0x38 &&
        buffer[i + 1] === 0x42 &&
        buffer[i + 2] === 0x49 &&
        buffer[i + 3] === 0x4d &&
        buffer[i + 4] === 0x64 &&
        buffer[i + 5] === 0x65 &&
        buffer[i + 6] === 0x73 &&
        buffer[i + 7] === 0x63
      ) {
        // Found 8BIMdesc
        const size = (buffer[i + 8] << 24) | (buffer[i + 9] << 16) | (buffer[i + 10] << 8) | buffer[i + 11];
        descOffset = i + 12; // Start of descriptor data
        break;
      }
    }

    expect(descOffset).toBeGreaterThan(0);

    // Skip descriptor version (4 bytes), then check className length
    const classNameLen =
      (buffer[descOffset + 4] << 24) |
      (buffer[descOffset + 5] << 16) |
      (buffer[descOffset + 6] << 8) |
      buffer[descOffset + 7];

    // Should be 1 (empty class name uses length=1 with null char)
    expect(classNameLen).toBe(1);
  });

  test('resource blocks should not have extra padding', () => {
    const parser = new AbrParser();
    const writer = new AbrWriter();

    // Create a brush that will result in an odd-sized descriptor
    const abrFile = createAbrFile([createBrush({ name: 'A', type: 'computed', diameter: 30 })]);

    const buffer = writer.write(abrFile);

    // Parse 8BIM blocks and verify file size matches exactly
    let pos = 4; // Skip version
    let lastBlockEnd = pos;

    while (pos < buffer.length - 8) {
      // Check for 8BIM signature
      if (buffer[pos] !== 0x38 || buffer[pos + 1] !== 0x42 || buffer[pos + 2] !== 0x49 || buffer[pos + 3] !== 0x4d) {
        break;
      }

      // Read block size
      const size = (buffer[pos + 8] << 24) | (buffer[pos + 9] << 16) | (buffer[pos + 10] << 8) | buffer[pos + 11];

      lastBlockEnd = pos + 12 + size;
      pos = lastBlockEnd;
    }

    // File should end exactly where the last block ends (no padding)
    expect(buffer.length).toBe(lastBlockEnd);
  });

  test('written file should match original file structure after round-trip', () => {
    const parser = new AbrParser();
    const writer = new AbrWriter();

    const filePath = path.join(FILES_DIR, 'Basic_3.abr');
    const originalBuffer = fs.readFileSync(filePath);
    const original = parser.parse(originalBuffer);

    // Write without any changes
    const rewrittenBuffer = writer.write(original);
    const reparsed = parser.parse(rewrittenBuffer);

    // Should have same brushes
    expect(reparsed.brushes.length).toBe(original.brushes.length);

    // Each brush should have same name, type, and core properties
    for (let i = 0; i < original.brushes.length; i++) {
      expect(reparsed.brushes[i].name).toBe(original.brushes[i].name);
      expect(reparsed.brushes[i].type).toBe(original.brushes[i].type);
      expect(reparsed.brushes[i].diameter).toBe(original.brushes[i].diameter);
    }
  });
});
