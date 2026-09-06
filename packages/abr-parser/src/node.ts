import { readFileSync, writeFileSync } from 'node:fs';
import { AbrParser as BufferAbrParser } from './abr-parser';
import { AbrWriter as BufferAbrWriter } from './abr-writer';
import type { AbrFile } from './types';

/** Adds synchronous filesystem access to the browser-safe brush parser. */
export class AbrParser extends BufferAbrParser {
  /** Reads and parses a local ABR file; filesystem errors propagate to the caller. */
  parseFile(filePath: string): AbrFile {
    return this.parse(readFileSync(filePath));
  }
}

/** Adds synchronous file output to the browser-safe brush writer. */
export class AbrWriter extends BufferAbrWriter {
  /** Writes an ABR file to disk; filesystem errors propagate to the caller. */
  writeFile(abrFile: AbrFile, filePath: string): void {
    writeFileSync(filePath, this.write(abrFile));
  }
}
