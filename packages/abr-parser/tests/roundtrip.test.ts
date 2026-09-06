/**
 * ABR Round-Trip Integrity Tests
 * Verifies that parsing then writing an ABR file preserves all brush data.
 */

import * as fs from 'fs';
import * as path from 'path';
import { beforeAll, describe, expect, test } from 'vitest';
import { abrFiles, AbrParser, AbrWriter, ensureTestOutputDir, FILES_DIR, TEST_OUTPUT_DIR } from './test-helpers';

beforeAll(() => {
  ensureTestOutputDir();
});

describe('Round-Trip Integrity', () => {
  test.each(abrFiles)('should preserve brush count in %s after round-trip', (fileName) => {
    const filePath = path.join(FILES_DIR, fileName);
    const parser = new AbrParser();
    const original = parser.parseFile(filePath);

    // Write and re-parse
    const writer = new AbrWriter();
    const buffer = writer.write(original);
    const reparsed = parser.parse(buffer);

    expect(reparsed.brushes.length).toBe(original.brushes.length);
  });

  test.each(abrFiles)('should preserve brush names in %s after round-trip', (fileName) => {
    const filePath = path.join(FILES_DIR, fileName);
    const parser = new AbrParser();
    const original = parser.parseFile(filePath);

    // Write and re-parse
    const writer = new AbrWriter();
    const buffer = writer.write(original);
    const reparsed = parser.parse(buffer);

    const originalNames = original.brushes.map((b) => b.name).sort();
    const reparsedNames = reparsed.brushes.map((b) => b.name).sort();

    expect(reparsedNames).toEqual(originalNames);
  });

  test.each(abrFiles)('should preserve brush types in %s after round-trip', (fileName) => {
    const filePath = path.join(FILES_DIR, fileName);
    const parser = new AbrParser();
    const original = parser.parseFile(filePath);

    // Write and re-parse
    const writer = new AbrWriter();
    const buffer = writer.write(original);
    const reparsed = parser.parse(buffer);

    for (let i = 0; i < original.brushes.length; i++) {
      const origBrush = original.brushes.find((b) => b.name === reparsed.brushes[i].name);
      if (origBrush) {
        expect(reparsed.brushes[i].type).toBe(origBrush.type);
      }
    }
  });

  test.each(abrFiles)('should preserve brush tip dimensions in %s after round-trip', (fileName) => {
    const filePath = path.join(FILES_DIR, fileName);
    const parser = new AbrParser();
    const original = parser.parseFile(filePath);

    // Write and re-parse
    const writer = new AbrWriter();
    const buffer = writer.write(original);
    const reparsed = parser.parse(buffer);

    // Match by index instead of name to handle duplicate names
    for (let i = 0; i < original.brushes.length; i++) {
      const origBrush = original.brushes[i];
      if (origBrush.brushTip && reparsed.brushes[i]) {
        const reparsedBrush = reparsed.brushes[i];
        expect(reparsedBrush.brushTip).toBeDefined();
        expect(reparsedBrush.brushTip!.width).toBe(origBrush.brushTip.width);
        expect(reparsedBrush.brushTip!.height).toBe(origBrush.brushTip.height);
      }
    }
  });

  test.each(abrFiles)('round-trip file of %s should be parseable without errors', (fileName) => {
    const filePath = path.join(FILES_DIR, fileName);
    const parser = new AbrParser();
    const original = parser.parseFile(filePath);

    // Write
    const writer = new AbrWriter();
    const buffer = writer.write(original);

    // Save for debugging
    const outputPath = path.join(TEST_OUTPUT_DIR, `roundtrip-${fileName}`);
    fs.writeFileSync(outputPath, buffer);

    // Re-parse should work
    const reparsed = parser.parse(buffer);

    // Should not have critical errors
    const criticalErrors = reparsed.errors.filter((e) => e.includes('Unsupported') || e.includes('Invalid'));
    expect(criticalErrors).toHaveLength(0);
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
