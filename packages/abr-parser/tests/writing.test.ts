/**
 * ABR Writer — Basic Writing Tests
 * Tests that ABR files can be created from scratch and written to disk.
 */

import * as fs from 'fs';
import * as path from 'path';
import { beforeAll, describe, expect, test } from 'vitest';
import {
  AbrWriter,
  createAbrFile,
  createBrush,
  createBrushTip,
  ensureTestOutputDir,
  TEST_OUTPUT_DIR
} from './test-helpers';

beforeAll(() => {
  ensureTestOutputDir();
});

describe('AbrWriter', () => {
  describe('Basic Writing', () => {
    test('should create a valid ABR file from scratch', () => {
      const abrFile = createAbrFile([
        createBrush({
          name: 'Test Round Brush',
          type: 'computed',
          diameter: 50,
          hardness: 100,
          spacing: 25,
          roundness: 100
        })
      ]);

      const writer = new AbrWriter();
      const buffer = writer.write(abrFile);

      expect(buffer).toBeDefined();
      expect(buffer.length).toBeGreaterThan(0);

      // Check magic bytes
      expect(buffer[0]).toBe(0x00); // Version 6 high byte
      expect(buffer[1]).toBe(0x06); // Version 6 low byte
      expect(buffer[2]).toBe(0x00); // SubVersion 2 high byte
      expect(buffer[3]).toBe(0x02); // SubVersion 2 low byte
    });

    test('should create ABR with sampled brush', () => {
      const tipSize = 32;
      const tipData = new Uint8Array(tipSize * tipSize);
      // Create a simple gradient
      for (let y = 0; y < tipSize; y++) {
        for (let x = 0; x < tipSize; x++) {
          const dist = Math.sqrt(Math.pow(x - tipSize / 2, 2) + Math.pow(y - tipSize / 2, 2));
          tipData[y * tipSize + x] = Math.max(0, 255 - dist * 16);
        }
      }

      const abrFile = createAbrFile([
        createBrush({
          name: 'Test Sampled Brush',
          type: 'sampled',
          diameter: tipSize,
          spacing: 25,
          brushTip: createBrushTip(tipSize, tipSize, tipData)
        })
      ]);

      const writer = new AbrWriter();
      const buffer = writer.write(abrFile);

      expect(buffer).toBeDefined();
      expect(buffer.length).toBeGreaterThan(100); // Should have substantial content
    });

    test('should write ABR file to disk', () => {
      const abrFile = createAbrFile([
        createBrush({
          name: 'Disk Test Brush',
          type: 'computed',
          diameter: 30,
          hardness: 50
        })
      ]);

      const writer = new AbrWriter();
      const outputPath = path.join(TEST_OUTPUT_DIR, 'write-test.abr');
      writer.writeFile(abrFile, outputPath);

      expect(fs.existsSync(outputPath)).toBe(true);
      const stats = fs.statSync(outputPath);
      expect(stats.size).toBeGreaterThan(0);
    });
  });
});
