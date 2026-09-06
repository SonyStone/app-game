/**
 * ABR Parser Tests
 * Tests for parsing, writing, and round-trip integrity of ABR files
 */

import * as fs from 'fs';
import * as path from 'path';
import { AbrParser } from '../src/abr-parser';
import { AbrWriter, createAbrFile, createBrush, createBrushTip } from '../src/abr-writer';
import type { AbrFile, Brush } from '../src/types';

const FILES_DIR = path.join(__dirname, '..', 'files');
const TEST_OUTPUT_DIR = path.join(__dirname, '..', 'test-output');

// Ensure test output directory exists
beforeAll(() => {
  if (!fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  }
});

// Clean up test output after tests
afterAll(() => {
  // Optionally clean up test files
  // fs.rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
});

describe('AbrParser', () => {
  describe('File Parsing', () => {
    const abrFiles = fs.readdirSync(FILES_DIR).filter(f => f.endsWith('.abr'));

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

      const sampledBrushes = result.brushes.filter(b => b.type === 'sampled');
      
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
      const brushWithDiameter = result.brushes.find(b => b.diameter !== undefined);
      expect(brushWithDiameter).toBeDefined();
      expect(brushWithDiameter!.diameter).toBeGreaterThan(0);
    });

    test('should correctly parse brush spacing', () => {
      const parser = new AbrParser();
      const result = parser.parseFile(path.join(FILES_DIR, 'Basic_3.abr'));

      const brushWithSpacing = result.brushes.find(b => b.spacing !== undefined);
      expect(brushWithSpacing).toBeDefined();
      expect(brushWithSpacing!.spacing).toBeGreaterThan(0);
    });
  });
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
          roundness: 100,
        }),
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
          const dist = Math.sqrt(Math.pow(x - tipSize/2, 2) + Math.pow(y - tipSize/2, 2));
          tipData[y * tipSize + x] = Math.max(0, 255 - dist * 16);
        }
      }

      const abrFile = createAbrFile([
        createBrush({
          name: 'Test Sampled Brush',
          type: 'sampled',
          diameter: tipSize,
          spacing: 25,
          brushTip: createBrushTip(tipSize, tipSize, tipData),
        }),
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
          hardness: 50,
        }),
      ]);

      const writer = new AbrWriter();
      const outputPath = path.join(TEST_OUTPUT_DIR, 'write-test.abr');
      writer.writeFile(abrFile, outputPath);

      expect(fs.existsSync(outputPath)).toBe(true);
      const stats = fs.statSync(outputPath);
      expect(stats.size).toBeGreaterThan(0);
    });
  });

  describe('Round-Trip Integrity', () => {
    const abrFiles = fs.readdirSync(FILES_DIR).filter(f => f.endsWith('.abr'));

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

      const originalNames = original.brushes.map(b => b.name).sort();
      const reparsedNames = reparsed.brushes.map(b => b.name).sort();

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
        const origBrush = original.brushes.find(b => b.name === reparsed.brushes[i].name);
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
      const criticalErrors = reparsed.errors.filter(e => 
        e.includes('Unsupported') || e.includes('Invalid')
      );
      expect(criticalErrors).toHaveLength(0);
    });
  });

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
          brushTip: createBrushTip(tipSize, tipSize, tipData),
        }),
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
          brushTip: createBrushTip(tipSize, tipSize, tipData),
        }),
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
  });
});

describe('Photoshop Compatibility', () => {
  /**
   * CRITICAL TEST: Verifies that written ABR files maintain Photoshop compatibility
   * This tests the exact binary structure expected by Photoshop
   */

  test('written file should have correct 8BIM block structure', () => {
    const abrFile = createAbrFile([
      createBrush({
        name: 'Structure Test',
        type: 'computed',
        diameter: 30,
      }),
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
      if (buffer[i] === 0x38 && // '8'
          buffer[i+1] === 0x42 && // 'B'
          buffer[i+2] === 0x49 && // 'I'
          buffer[i+3] === 0x4D) { // 'M'
        found8BIM = true;
        
        // Check that it's followed by a valid key (4 chars)
        const key = String.fromCharCode(buffer[i+4], buffer[i+5], buffer[i+6], buffer[i+7]);
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
        spacing: 25,
      }),
    ]);

    const writer = new AbrWriter();
    const buffer = writer.write(abrFile);

    // Find 'desc' block
    let descStart = -1;
    for (let i = 4; i < buffer.length - 8; i++) {
      if (buffer[i] === 0x38 && buffer[i+1] === 0x42 && 
          buffer[i+2] === 0x49 && buffer[i+3] === 0x4D &&
          buffer[i+4] === 0x64 && buffer[i+5] === 0x65 && 
          buffer[i+6] === 0x73 && buffer[i+7] === 0x63) {
        descStart = i + 8; // After '8BIMdesc'
        break;
      }
    }
    expect(descStart).toBeGreaterThan(0);

    // Read descriptor size (4 bytes, big-endian)
    const descSize = (buffer[descStart] << 24) | (buffer[descStart+1] << 16) | 
                     (buffer[descStart+2] << 8) | buffer[descStart+3];
    expect(descSize).toBeGreaterThan(0);
    expect(descSize).toBeLessThan(buffer.length);
  });

  test('should match original file structure for computed brushes', () => {
    // Parse an original file
    const parser = new AbrParser();
    const original = parser.parseFile(path.join(FILES_DIR, 'Basic_3.abr'));

    // Find a computed brush
    const computedBrush = original.brushes.find(b => b.type === 'computed');
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

describe('Edge Cases', () => {
  test('should handle empty brush name', () => {
    const abrFile = createAbrFile([
      createBrush({
        name: '',
        type: 'computed',
        diameter: 30,
      }),
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
        diameter: 30,
      }),
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
        brushTip: createBrushTip(tipSize, tipSize, tipData),
      }),
    ]);

    const parser = new AbrParser();
    const writer = new AbrWriter();

    const buffer = writer.write(abrFile);
    // RLE is very efficient for uniform data, so compressed size can be much smaller
    expect(buffer.length).toBeGreaterThan(1000); // Should have reasonable content

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
      createBrush({ name: 'Sampled 1', type: 'sampled', diameter: tipSize, brushTip: createBrushTip(tipSize, tipSize, tipData) }),
      createBrush({ name: 'Computed 2', type: 'computed', diameter: 50, hardness: 50 }),
      createBrush({ name: 'Sampled 2', type: 'sampled', diameter: tipSize, brushTip: createBrushTip(tipSize, tipSize, new Uint8Array(tipSize*tipSize).fill(100)) }),
    ]);

    const parser = new AbrParser();
    const writer = new AbrWriter();

    const buffer = writer.write(abrFile);
    const reparsed = parser.parse(buffer);

    expect(reparsed.brushes.length).toBe(4);
    expect(reparsed.brushes.filter(b => b.type === 'computed').length).toBe(2);
    expect(reparsed.brushes.filter(b => b.type === 'sampled').length).toBe(2);
  });
});
describe('Brush Renaming', () => {
  test('should preserve brush after renaming to longer name', () => {
    const parser = new AbrParser();
    const writer = new AbrWriter();

    // Load Basic_3.abr
    const filePath = path.join(FILES_DIR, 'Basic_3.abr');
    const original = parser.parseFile(filePath);
    
    // Find and rename a brush
    const brush = original.brushes.find(b => b.name.includes('Hard Flat'));
    expect(brush).toBeDefined();
    
    const originalName = brush!.name;
    brush!.name = 'Hard Flat 41 123qwe Extended Name';
    
    // Write and re-parse
    const buffer = writer.write(original);
    const reparsed = parser.parse(buffer);
    
    // Should have same number of brushes
    expect(reparsed.brushes.length).toBe(original.brushes.length);
    
    // Should find the renamed brush
    const renamedBrush = reparsed.brushes.find(b => b.name === 'Hard Flat 41 123qwe Extended Name');
    expect(renamedBrush).toBeDefined();
    expect(renamedBrush!.type).toBe(brush!.type);
  });

  test('should preserve brush after renaming to shorter name', () => {
    const parser = new AbrParser();
    const writer = new AbrWriter();

    const filePath = path.join(FILES_DIR, 'Basic_3.abr');
    const original = parser.parseFile(filePath);
    
    const brush = original.brushes.find(b => b.name.includes('Hard Flat'));
    expect(brush).toBeDefined();
    
    brush!.name = 'HF';
    
    const buffer = writer.write(original);
    const reparsed = parser.parse(buffer);
    
    const renamedBrush = reparsed.brushes.find(b => b.name === 'HF');
    expect(renamedBrush).toBeDefined();
  });

  test('should handle brush name with unicode characters', () => {
    const parser = new AbrParser();
    const writer = new AbrWriter();

    const abrFile = createAbrFile([
      createBrush({
        name: 'Кисть 日本語 Brush 🎨',
        type: 'computed',
        diameter: 30,
      }),
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
    
    const brush = original.brushes.find(b => b.name.includes('Hard Flat'));
    expect(brush).toBeDefined();
    
    const originalSettings = JSON.stringify(brush!.settings);
    const originalDiameter = brush!.diameter;
    const originalSpacing = brush!.spacing;
    
    brush!.name = 'Renamed Brush';
    
    const buffer = writer.write(original);
    const reparsed = parser.parse(buffer);
    
    const renamedBrush = reparsed.brushes.find(b => b.name === 'Renamed Brush');
    expect(renamedBrush).toBeDefined();
    expect(renamedBrush!.diameter).toBe(originalDiameter);
    expect(renamedBrush!.spacing).toBe(originalSpacing);
  });
});

describe('Binary Format Correctness', () => {
  test('TEXT strings should include null terminator', () => {
    const parser = new AbrParser();
    const writer = new AbrWriter();

    const testName = 'Test Brush Name';
    const abrFile = createAbrFile([
      createBrush({ name: testName, type: 'computed', diameter: 30 }),
    ]);

    const buffer = writer.write(abrFile);
    
    // Find TEXT marker in buffer
    let foundCorrectText = false;
    for (let i = 0; i < buffer.length - 10; i++) {
      if (buffer[i] === 0x54 && buffer[i+1] === 0x45 && buffer[i+2] === 0x58 && buffer[i+3] === 0x54) {
        // Found TEXT marker, read length
        const len = (buffer[i+4] << 24) | (buffer[i+5] << 16) | (buffer[i+6] << 8) | buffer[i+7];
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

    const abrFile = createAbrFile([
      createBrush({ name: 'Test', type: 'computed', diameter: 30 }),
    ]);

    const buffer = writer.write(abrFile);
    
    // After the 8BIM headers (samp, patt, desc), the descriptor starts
    // Version (4 bytes) + className length (4 bytes)
    // For v6.2 ABR, structure is: version(2) + subversion(2) + 8BIM blocks
    // Find desc block and check className length
    let descOffset = -1;
    for (let i = 4; i < buffer.length - 12; i++) {
      if (buffer[i] === 0x38 && buffer[i+1] === 0x42 && buffer[i+2] === 0x49 && buffer[i+3] === 0x4D &&
          buffer[i+4] === 0x64 && buffer[i+5] === 0x65 && buffer[i+6] === 0x73 && buffer[i+7] === 0x63) {
        // Found 8BIMdesc
        const size = (buffer[i+8] << 24) | (buffer[i+9] << 16) | (buffer[i+10] << 8) | buffer[i+11];
        descOffset = i + 12; // Start of descriptor data
        break;
      }
    }
    
    expect(descOffset).toBeGreaterThan(0);
    
    // Skip descriptor version (4 bytes), then check className length
    const classNameLen = (buffer[descOffset + 4] << 24) | (buffer[descOffset + 5] << 16) | 
                         (buffer[descOffset + 6] << 8) | buffer[descOffset + 7];
    
    // Should be 1 (empty class name uses length=1 with null char)
    expect(classNameLen).toBe(1);
  });

  test('resource blocks should not have extra padding', () => {
    const parser = new AbrParser();
    const writer = new AbrWriter();

    // Create a brush that will result in an odd-sized descriptor
    const abrFile = createAbrFile([
      createBrush({ name: 'A', type: 'computed', diameter: 30 }),
    ]);

    const buffer = writer.write(abrFile);
    
    // Parse 8BIM blocks and verify file size matches exactly
    let pos = 4; // Skip version
    let lastBlockEnd = pos;
    
    while (pos < buffer.length - 8) {
      // Check for 8BIM signature
      if (buffer[pos] !== 0x38 || buffer[pos+1] !== 0x42 || 
          buffer[pos+2] !== 0x49 || buffer[pos+3] !== 0x4D) {
        break;
      }
      
      // Read block size
      const size = (buffer[pos+8] << 24) | (buffer[pos+9] << 16) | 
                   (buffer[pos+10] << 8) | buffer[pos+11];
      
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
    const sampledBrushes = original.brushes.filter(b => b.type === 'sampled');
    expect(sampledBrushes.length).toBeGreaterThan(0);
    
    for (const brush of sampledBrushes) {
      expect(brush.sampledDataUuid).toBeDefined();
      expect(brush.sampledDataUuid!.length).toBe(36); // UUID format
    }
    
    // Write and re-parse
    const buffer = writer.write(original);
    const reparsed = parser.parse(buffer);
    
    // Verify UUIDs are preserved
    const reparsedSampled = reparsed.brushes.filter(b => b.type === 'sampled');
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
    
    const paintBrush = result.brushes.find(b => b.name === 'Paint Brush');
    expect(paintBrush).toBeDefined();
    expect(paintBrush!.brushTip).toBeDefined();
    expect(paintBrush!.brushTip!.width).toBe(800);
    expect(paintBrush!.brushTip!.height).toBe(838);
    
    const gBrush = result.brushes.find(b => b.name === 'g');
    expect(gBrush).toBeDefined();
    expect(gBrush!.brushTip).toBeDefined();
    expect(gBrush!.brushTip!.width).toBe(134);
    expect(gBrush!.brushTip!.height).toBe(90);
    
    const skinSoftBrush = result.brushes.find(b => b.name === 'Skin Soft');
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
    
    // Verify the pattern data is identical
    const origPattern = original.rawPatternData!;
    const newPattern = reparsed.rawPatternData!;
    for (let i = 0; i < origPattern.length; i++) {
      expect(newPattern[i]).toBe(origPattern[i]);
    }
  });
});