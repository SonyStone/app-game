/**
 * ABR UUID-based Sample Matching Tests
 * Tests for UUID preservation, correct brush-tip-to-descriptor matching,
 * and pattern data round-trip.
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, test } from 'vitest';
import { AbrParser, AbrWriter, FILES_DIR } from './test-helpers';

describe('UUID-based Sample Matching', () => {
  test('should preserve sampledDataUuid during parsing and round-trip', () => {
    const parser = new AbrParser();
    const writer = new AbrWriter();

    // Parse AI_Brush_collection which has multiple sampled brushes with UUIDs
    const filePath = path.join(FILES_DIR, 'AI_Brush_collection.abr');
    if (!fs.existsSync(filePath)) {
      console.log('Skipping UUID test - AI_Brush_collection.abr not found');
      return;
    }

    const original = parser.parseFile(filePath);

    // Verify sampled brushes have UUIDs
    const sampledBrushes = original.brushes.filter((b) => b.type === 'sampled');
    expect(sampledBrushes.length).toBeGreaterThan(0);

    for (const brush of sampledBrushes) {
      expect(brush.sampledDataUuid).toBeDefined();
      expect(brush.sampledDataUuid!.length).toBe(36); // UUID format
    }

    // Write and re-parse
    const buffer = writer.write(original);
    const reparsed = parser.parse(buffer);

    // Verify UUIDs are preserved
    const reparsedSampled = reparsed.brushes.filter((b) => b.type === 'sampled');
    expect(reparsedSampled.length).toBe(sampledBrushes.length);

    for (let i = 0; i < sampledBrushes.length; i++) {
      expect(reparsedSampled[i].sampledDataUuid).toBe(sampledBrushes[i].sampledDataUuid);
    }
  });

  test('should match brush tips correctly by UUID when order differs', () => {
    const parser = new AbrParser();

    // Parse AI_Brush_collection
    const filePath = path.join(FILES_DIR, 'AI_Brush_collection.abr');
    if (!fs.existsSync(filePath)) {
      console.log('Skipping UUID order test - AI_Brush_collection.abr not found');
      return;
    }

    const result = parser.parseFile(filePath);

    // Expected brush tip sizes (verified from original analysis):
    // Paint Brush -> 800x838 (UUID: 5c5d4fe8...)
    // 样本画笔 3 1 -> 76x157 (UUID: 69d391fa...)
    // as 2 -> 35x15 (UUID: 68d8b7b8...)
    // g -> 134x90 (UUID: 48e9d21a...)
    // Skin Soft -> 186x194 (UUID: 3479c62f...)

    const paintBrush = result.brushes.find((b) => b.name === 'Paint Brush');
    expect(paintBrush).toBeDefined();
    expect(paintBrush!.brushTip).toBeDefined();
    expect(paintBrush!.brushTip!.width).toBe(800);
    expect(paintBrush!.brushTip!.height).toBe(838);

    const gBrush = result.brushes.find((b) => b.name === 'g');
    expect(gBrush).toBeDefined();
    expect(gBrush!.brushTip).toBeDefined();
    expect(gBrush!.brushTip!.width).toBe(134);
    expect(gBrush!.brushTip!.height).toBe(90);

    const skinSoftBrush = result.brushes.find((b) => b.name === 'Skin Soft');
    expect(skinSoftBrush).toBeDefined();
    expect(skinSoftBrush!.brushTip).toBeDefined();
    expect(skinSoftBrush!.brushTip!.width).toBe(186);
    expect(skinSoftBrush!.brushTip!.height).toBe(194);
  });

  test('pattern data should be preserved during round-trip', () => {
    const parser = new AbrParser();
    const writer = new AbrWriter();

    const filePath = path.join(FILES_DIR, 'AI_Brush_collection.abr');
    if (!fs.existsSync(filePath)) {
      console.log('Skipping pattern test - AI_Brush_collection.abr not found');
      return;
    }

    const original = parser.parseFile(filePath);

    // Should have pattern data
    expect(original.rawPatternData).toBeDefined();
    expect(original.rawPatternData!.length).toBeGreaterThan(0);

    // Write and re-parse
    const buffer = writer.write(original);
    const reparsed = parser.parse(buffer);

    // Pattern data should be preserved
    expect(reparsed.rawPatternData).toBeDefined();
    expect(reparsed.rawPatternData!.length).toBe(original.rawPatternData!.length);

    // Compare every byte without creating millions of individual assertions.
    const origPattern = original.rawPatternData!;
    const newPattern = reparsed.rawPatternData!;
    expect(Buffer.from(newPattern).equals(Buffer.from(origPattern))).toBe(true);
  });
});
