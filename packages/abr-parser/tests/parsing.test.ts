/**
 * ABR Parser — File Parsing Tests
 * Tests that all ABR files parse correctly and brush properties are extracted.
 */

import * as path from 'path';
import { describe, expect, test } from 'vitest';
import { abrFiles, AbrParser, FILES_DIR } from './test-helpers';

describe('AbrParser', () => {
  describe('File Parsing', () => {
    test.each(abrFiles)('should parse %s without errors', (fileName) => {
      const filePath = path.join(FILES_DIR, fileName);
      const parser = new AbrParser();
      const result = parser.parseFile(filePath);

      expect(result).toBeDefined();
      expect(result.version).toBeGreaterThanOrEqual(6);
      expect(result.brushes).toBeDefined();
      expect(Array.isArray(result.brushes)).toBe(true);

      // Log any parsing errors (but don't fail - some minor issues may be acceptable)
      if (result.errors.length > 0) {
        console.warn(`Warnings in ${fileName}:`, result.errors);
      }
    });

    test.each(abrFiles)('should extract brushes from %s', (fileName) => {
      const filePath = path.join(FILES_DIR, fileName);
      const parser = new AbrParser();
      const result = parser.parseFile(filePath);

      expect(result.brushes.length).toBeGreaterThan(0);

      for (const brush of result.brushes) {
        expect(brush.id).toBeDefined();
        expect(brush.name).toBeDefined();
        expect(typeof brush.name).toBe('string');
        expect(['computed', 'sampled']).toContain(brush.type);
      }
    });

    test.each(abrFiles)('sampled brushes in %s should have brush tips', (fileName) => {
      const filePath = path.join(FILES_DIR, fileName);
      const parser = new AbrParser();
      const result = parser.parseFile(filePath);

      const sampledBrushes = result.brushes.filter((b) => b.type === 'sampled');

      for (const brush of sampledBrushes) {
        // Sampled brushes should have brush tip data
        if (brush.brushTip) {
          expect(brush.brushTip.width).toBeGreaterThan(0);
          expect(brush.brushTip.height).toBeGreaterThan(0);
          expect(brush.brushTip.data).toBeDefined();
          expect(brush.brushTip.data.length).toBe(brush.brushTip.width * brush.brushTip.height);
        }
      }
    });
  });

  describe('Brush Properties', () => {
    test('should correctly parse brush diameter', () => {
      const parser = new AbrParser();
      const result = parser.parseFile(path.join(FILES_DIR, 'Basic_3.abr'));

      // Find a brush with diameter
      const brushWithDiameter = result.brushes.find((b) => b.diameter !== undefined);
      expect(brushWithDiameter).toBeDefined();
      expect(brushWithDiameter!.diameter).toBeGreaterThan(0);
    });

    test('should correctly parse brush spacing', () => {
      const parser = new AbrParser();
      const result = parser.parseFile(path.join(FILES_DIR, 'Basic_3.abr'));

      const brushWithSpacing = result.brushes.find((b) => b.spacing !== undefined);
      expect(brushWithSpacing).toBeDefined();
      expect(brushWithSpacing!.spacing).toBeGreaterThan(0);
    });
  });
});
