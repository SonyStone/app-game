/**
 * Shared test helpers, constants, and setup for ABR parser tests
 */

import * as fs from 'fs';
import * as path from 'path';
import { AbrParser } from '../src/node';
import { AbrWriter } from '../src/node';
import { createAbrFile, createBrush, createBrushTip } from '../src/abr-writer';

export const FILES_DIR = path.join(__dirname, '..', 'files');
export const TEST_OUTPUT_DIR = path.join(__dirname, '..', 'test-output');

/** All .abr files in the files/ directory */
export const abrFiles = fs.readdirSync(FILES_DIR).filter((f) => f.endsWith('.abr'));

/** Ensure test output directory exists (call in beforeAll) */
export function ensureTestOutputDir(): void {
  if (!fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  }
}

export { AbrParser, AbrWriter, createAbrFile, createBrush, createBrushTip };
