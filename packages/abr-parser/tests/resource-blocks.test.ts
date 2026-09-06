/**
 * ABR Resource Block Recognition Tests
 * Verifies that all resource blocks in every ABR file are recognized and parsed.
 * No raw/unknown blocks should exist — all data must be available for editing.
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, test } from 'vitest';
import { abrFiles, FILES_DIR } from './test-helpers';

/** Known 8BIM resource block keys */
const KNOWN_BLOCK_KEYS = new Set(['samp', 'patt', 'desc', 'phry']);

/**
 * Scan a buffer for 8BIM resource blocks and return their keys.
 */
function scanResourceBlocks(buffer: Uint8Array): { key: string; offset: number; size: number }[] {
  const blocks: { key: string; offset: number; size: number }[] = [];
  let pos = 4; // Skip version header (2 bytes version + 2 bytes subversion)

  while (pos < buffer.length - 12) {
    // Skip null padding bytes between blocks (some files pad to 2- or 4-byte boundaries)
    while (pos < buffer.length - 12 && buffer[pos] === 0x00) {
      pos++;
    }

    if (pos >= buffer.length - 12) break;

    // Check for 8BIM signature
    if (
      buffer[pos] !== 0x38 || // '8'
      buffer[pos + 1] !== 0x42 || // 'B'
      buffer[pos + 2] !== 0x49 || // 'I'
      buffer[pos + 3] !== 0x4d // 'M'
    ) {
      break;
    }

    // Read 4-char key
    const key = String.fromCharCode(buffer[pos + 4], buffer[pos + 5], buffer[pos + 6], buffer[pos + 7]);

    // Read block size (4 bytes, big-endian)
    const size = ((buffer[pos + 8] << 24) | (buffer[pos + 9] << 16) | (buffer[pos + 10] << 8) | buffer[pos + 11]) >>> 0;

    blocks.push({ key, offset: pos, size });
    pos += 12 + size;
  }

  return blocks;
}

describe('Resource Block Recognition', () => {
  test.each(abrFiles)('all blocks in %s should be recognized', (fileName) => {
    const filePath = path.join(FILES_DIR, fileName);
    const buffer = new Uint8Array(fs.readFileSync(filePath));
    const blocks = scanResourceBlocks(buffer);

    expect(blocks.length).toBeGreaterThan(0);

    for (const block of blocks) {
      expect(
        KNOWN_BLOCK_KEYS.has(block.key),
        `Unrecognized block key '${block.key}' at offset ${block.offset} in ${fileName}`
      ).toBe(true);
    }
  });

  test.each(abrFiles)('%s should contain a desc block', (fileName) => {
    const filePath = path.join(FILES_DIR, fileName);
    const buffer = new Uint8Array(fs.readFileSync(filePath));
    const blocks = scanResourceBlocks(buffer);

    const descBlocks = blocks.filter((b) => b.key === 'desc');
    expect(descBlocks.length).toBeGreaterThanOrEqual(1);
  });

  test.each(abrFiles)('block sizes in %s should be consistent with file size', (fileName) => {
    const filePath = path.join(FILES_DIR, fileName);
    const buffer = new Uint8Array(fs.readFileSync(filePath));
    const blocks = scanResourceBlocks(buffer);

    // The total of header (4 bytes) + all blocks (12 + size each) + inter-block padding
    // should account for nearly all bytes
    let totalAccountedBytes = 4; // version header
    for (const block of blocks) {
      totalAccountedBytes += 12 + block.size;
    }

    // Some files have null padding bytes between blocks and/or trailing padding.
    // The unaccounted bytes should be small (just alignment padding).
    const unaccountedBytes = buffer.length - totalAccountedBytes;
    expect(unaccountedBytes).toBeGreaterThanOrEqual(0);
    // Allow padding: up to 2 bytes between each block pair + up to 4 trailing bytes
    const maxPadding = (blocks.length - 1) * 2 + 4;
    expect(unaccountedBytes).toBeLessThanOrEqual(maxPadding);
  });
});
