/**
 * Debug script to analyze sample block structure in detail
 */

import * as fs from 'fs';
import { BinaryReader } from './binary-reader';

function debugSampleFormats(filePath: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Analyzing: ${filePath}`);
  console.log(`${'='.repeat(60)}\n`);
  
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
    
    console.log(`\nBlock: ${key}, length: ${length}, pos: ${startPos}`);
    
    if (key === 'samp' && length > 0) {
      const sampData = reader.readBytes(length);
      const sampReader = new BinaryReader(Buffer.from(sampData));
      
      // Parse first few samples
      let sampleNum = 0;
      while (!sampReader.isEof() && sampReader.remaining >= 4 && sampleNum < 3) {
        const sampleStart = sampReader.position;
        const sampleLength = sampReader.readUInt32BE();
        
        if (sampleLength === 0 || sampleLength > length) {
          console.log(`  Sample ${sampleNum}: invalid length ${sampleLength}`);
          break;
        }
        
        console.log(`\n  Sample ${sampleNum}:`);
        console.log(`    Length: ${sampleLength}`);
        console.log(`    Start: ${sampleStart}`);
        
        // Save position after length
        const dataStart = sampReader.position;
        
        // Try to find the bounds pattern (we know top=13 for first sample in MainBrushes)
        // Search for patterns like "00 00 00 XX" where XX is small (bounds are usually small numbers)
        console.log(`\n    Searching for bounds pattern...`);
        
        // Read first 350 bytes for analysis
        const previewLen = Math.min(350, sampleLength);
        const previewBytes = sampReader.peek(previewLen);
        
        // Look for the pattern: 4 small consecutive 32-bit values that could be bounds
        for (let offset = 30; offset < previewLen - 20; offset++) {
          const val1 = (previewBytes[offset] << 24) | (previewBytes[offset+1] << 16) | (previewBytes[offset+2] << 8) | previewBytes[offset+3];
          const val2 = (previewBytes[offset+4] << 24) | (previewBytes[offset+5] << 16) | (previewBytes[offset+6] << 8) | previewBytes[offset+7];
          const val3 = (previewBytes[offset+8] << 24) | (previewBytes[offset+9] << 16) | (previewBytes[offset+10] << 8) | previewBytes[offset+11];
          const val4 = (previewBytes[offset+12] << 24) | (previewBytes[offset+13] << 16) | (previewBytes[offset+14] << 8) | previewBytes[offset+15];
          
          // Check if these could be valid bounds (small positive numbers, bottom > top, right > left)
          if (val1 >= 0 && val1 < 5000 && 
              val2 >= 0 && val2 < 5000 && 
              val3 > val1 && val3 < 5000 &&
              val4 > val2 && val4 < 5000 &&
              (val3 - val1) > 5 && (val4 - val2) > 5 &&
              (val3 - val1) < 3000 && (val4 - val2) < 3000) {
            const width = val4 - val2;
            const height = val3 - val1;
            console.log(`    Possible bounds at offset ${offset}:`);
            console.log(`      top=${val1}, left=${val2}, bottom=${val3}, right=${val4}`);
            console.log(`      dimensions: ${width}x${height}`);
            
            // Check what comes after (depth and compression)
            if (offset + 18 < previewLen) {
              const depth = (previewBytes[offset+16] << 8) | previewBytes[offset+17];
              const compression = previewBytes[offset+18];
              console.log(`      depth=${depth}, compression=${compression}`);
              
              if ((depth === 8 || depth === 16) && (compression === 0 || compression === 1)) {
                console.log(`      *** LIKELY CORRECT! ***`);
              }
            }
          }
        }
        
        // Move to next sample
        const paddedEnd = sampleStart + 4 + sampleLength;
        // Pad to 4-byte boundary
        const nextSample = paddedEnd + ((4 - (paddedEnd % 4)) % 4);
        sampReader.seek(nextSample - sampleStart);
        sampleNum++;
      }
      
      // Only process first samp block
      return;
    }
    
    reader.skip(length);
  }
}

// Test with MainBrushes
debugSampleFormats('files/MainBrushes.abr');
