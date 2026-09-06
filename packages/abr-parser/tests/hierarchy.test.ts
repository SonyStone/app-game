/**
 * ABR Hierarchy / Folder Structure Tests
 * Tests for parsing, writing, and round-tripping folder hierarchy (phry blocks).
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, test } from 'vitest';
import { AbrParser, AbrWriter, createAbrFile, createBrush, FILES_DIR } from './test-helpers';

describe('Hierarchy / Folder Structure', () => {
  const parser = new AbrParser();
  const writer = new AbrWriter();

  test('should parse hierarchy from ABR files with folders', () => {
    const filePath = path.join(FILES_DIR, 'Brushes To Implement.abr');
    if (!fs.existsSync(filePath)) {
      console.log('Skipping hierarchy test - file not found');
      return;
    }

    const result = parser.parseFile(filePath);

    // Should have hierarchy data
    expect(result.rawHierarchyData).toBeDefined();
    expect(result.rawHierarchyData!.length).toBeGreaterThan(0);
    expect(result.hierarchy).toBeDefined();
    expect(result.hierarchy!.length).toBeGreaterThan(0);

    // Should have groups, groupEnds, and presets
    const groups = result.hierarchy!.filter((h) => h.type === 'group');
    const groupEnds = result.hierarchy!.filter((h) => h.type === 'groupEnd');
    const presets = result.hierarchy!.filter((h) => h.type === 'preset');

    expect(groups.length).toBeGreaterThan(0);
    expect(groupEnds.length).toBe(groups.length);
    expect(presets.length).toBe(result.brushes.length);

    // Groups should have names
    for (const group of groups) {
      expect(group.name).toBeDefined();
      expect(group.name!.length).toBeGreaterThan(0);
    }
  });

  test('should preserve hierarchy during round-trip', () => {
    const filePath = path.join(FILES_DIR, 'Brushes To Implement.abr');
    if (!fs.existsSync(filePath)) {
      console.log('Skipping hierarchy roundtrip test - file not found');
      return;
    }

    const original = parser.parseFile(filePath);
    expect(original.hierarchy).toBeDefined();

    // Write and re-parse
    const buffer = writer.write(original);
    const reparsed = parser.parse(buffer);

    // Hierarchy should be preserved
    expect(reparsed.rawHierarchyData).toBeDefined();
    expect(reparsed.rawHierarchyData!.length).toBe(original.rawHierarchyData!.length);
    expect(reparsed.hierarchy).toBeDefined();
    expect(reparsed.hierarchy!.length).toBe(original.hierarchy!.length);

    // Verify each hierarchy item matches
    for (let i = 0; i < original.hierarchy!.length; i++) {
      expect(reparsed.hierarchy![i].type).toBe(original.hierarchy![i].type);
      expect(reparsed.hierarchy![i].name).toBe(original.hierarchy![i].name);
      expect(reparsed.hierarchy![i].uuid).toBe(original.hierarchy![i].uuid);
    }
  });

  test('ABR files without folders should have no hierarchy', () => {
    const filePath = path.join(FILES_DIR, 'Basic_3.abr');
    if (!fs.existsSync(filePath)) {
      console.log('Skipping test - file not found');
      return;
    }

    const result = parser.parseFile(filePath);

    // Should not have hierarchy data
    expect(result.rawHierarchyData).toBeUndefined();
    expect(result.hierarchy).toBeUndefined();
  });

  test('should construct hierarchy from parsed data', () => {
    // Create an ABR file with hierarchy from scratch
    const brushes = [
      createBrush({ name: 'Brush 1', type: 'computed', diameter: 10 }),
      createBrush({ name: 'Brush 2', type: 'computed', diameter: 20 }),
      createBrush({ name: 'Brush 3', type: 'computed', diameter: 30 })
    ];

    const abrFile = createAbrFile(brushes);
    abrFile.hierarchy = [
      { type: 'group', name: 'My Folder', uuid: 'test-uuid-1234' },
      { type: 'preset' },
      { type: 'preset' },
      { type: 'group', name: 'Sub Folder', uuid: 'test-uuid-5678' },
      { type: 'preset' },
      { type: 'groupEnd' },
      { type: 'groupEnd' }
    ];

    // Write and re-parse
    const buffer = writer.write(abrFile);
    const reparsed = parser.parse(buffer);

    // Hierarchy should be preserved
    expect(reparsed.hierarchy).toBeDefined();
    expect(reparsed.hierarchy!.length).toBe(7);
    expect(reparsed.hierarchy![0]).toEqual({ type: 'group', name: 'My Folder', uuid: 'test-uuid-1234' });
    expect(reparsed.hierarchy![1]).toEqual({ type: 'preset' });
    expect(reparsed.hierarchy![3]).toEqual({ type: 'group', name: 'Sub Folder', uuid: 'test-uuid-5678' });
    expect(reparsed.hierarchy![5]).toEqual({ type: 'groupEnd' });
    expect(reparsed.hierarchy![6]).toEqual({ type: 'groupEnd' });
  });
});
