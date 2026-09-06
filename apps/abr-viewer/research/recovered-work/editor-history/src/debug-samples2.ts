/**
 * Debug script to analyze sample block structure (v2)
 */

import * as fs from 'fs';
import { BinaryReader } from './binary-reader';

function debugSamples(filePath: string) {
  console.log(`\nAnalyzing: ${filePath}\n`);
  
  const buffer = fs.readFileSync(filePath);
  const reader = new BinaryReader(buffer);
  
  // Read header
  const version = reader.readUInt16BE();
  const subVersion = reader.readUInt16BE();
  console.log(`Version: ${version}.${subVersion}`);
  
  // Find samp block
  while (!reader.isEof() && reader.remaining >= 12) {
    const startPos = reader.position;
    const signature = reader.readString(4);
    
    if (signature !== '8BIM') {
      reader.seek(startPos + 1);
      continue;
    }
    
    const key = reader.readString(4);
    const length = reader.readUInt32BE();
    
    console.log(`\nFound block: ${key}, length: ${length}`);
    
    if (key === 'samp') {
      console.log(`\n=== Sample Block Debug ===`);
      const sampStart = reader.position;
      
      // Parse samples
      let sampleNum = 0;
      while (reader.position < sampStart + length && sampleNum < 3) {
        const sampleStart = reader.position;
        const sampleLength = reader.readUInt32BE();
        console.log(`\nSample ${sampleNum}: length=${sampleLength}, pos=${sampleStart}`);
        
        if (sampleLength === 0 || sampleLength > length) {
          console.log(`  Invalid length, breaking`);
          break;
        }
        
        const sampleEnd = reader.position + sampleLength;
        
        // Read UUID (null-terminated string)
        const uuidChars: number[] = [];
        let byte = reader.readUInt8();
        let uuidCount = 0;
        while (byte !== 0 && uuidCount < 100 && !reader.isEof()) {
          uuidChars.push(byte);
          byte = reader.readUInt8();
          uuidCount++;
        }
        const uuid = String.fromCharCode(...uuidChars);
        console.log(`  UUID: "${uuid}"`);
        console.log(`  After UUID pos: ${reader.position}`);
        
        // Read misc
        const misc = reader.readUInt32BE();
        console.log(`  Misc: ${misc}`);
        
        // Read bounds
        const top = reader.readUInt32BE();
        const left = reader.readUInt32BE();  
        const bottom = reader.readUInt32BE();
        const right = reader.readUInt32BE();
        console.log(`  Bounds: top=${top}, left=${left}, bottom=${bottom}, right=${right}`);
        
        const width = right - left;
        const height = bottom - top;
        console.log(`  Size: ${width}x${height}`);
        
        // Read depth
        const depth = reader.readUInt16BE();
        console.log(`  Depth: ${depth}`);
        
        // Read compression
        const compression = reader.readUInt8();
        console.log(`  Compression: ${compression} (${compression === 0 ? 'raw' : compression === 1 ? 'RLE' : 'unknown'})`);
        
        // Move to next sample
        reader.seek(sampleEnd);
        sampleNum++;
      }
      
      return;
    }
    
    reader.skip(length);
  }
}

const testFile = 'files/MainBrushes.abr';
debugSamples(testFile);
