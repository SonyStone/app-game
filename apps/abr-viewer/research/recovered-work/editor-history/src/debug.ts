/**
 * Debug script to analyze ABR file structure
 */

import * as fs from 'fs';
import { BinaryReader } from './binary-reader';
import { DescriptorParser } from './descriptor-parser';

const PHOTOSHOP_SIGNATURE = '8BIM';

function analyzeFile(filePath: string) {
  const buffer = fs.readFileSync(filePath);
  const reader = new BinaryReader(buffer);

  console.log(`Analyzing: ${filePath}`);
  console.log(`File size: ${buffer.length} bytes`);
  console.log('');

  // Read version
  const version = reader.readUInt16BE();
  const subVersion = reader.readUInt16BE();
  console.log(`Version: ${version}.${subVersion}`);
  console.log('');

  // Read resource blocks
  console.log('Resource blocks:');
  console.log('-'.repeat(60));

  while (!reader.isEof() && reader.remaining >= 12) {
    const blockStart = reader.position;
    const signature = reader.readString(4);

    if (signature !== PHOTOSHOP_SIGNATURE) {
      console.log(`Invalid signature at ${blockStart}: "${signature}"`);
      break;
    }

    const key = reader.readString(4);
    const length = reader.readUInt32BE();

    console.log(`Block: ${key}`);
    console.log(`  Offset: ${blockStart}`);
    console.log(`  Length: ${length}`);

    if (length > 0 && reader.remaining >= length) {
      const data = reader.readBytes(length);
      
      if (key === 'desc') {
        console.log('  Content: Descriptor');
        try {
          const descReader = new BinaryReader(Buffer.from(data));
          const descVersion = descReader.readUInt32BE();
          console.log(`    Descriptor version: ${descVersion}`);
          
          const parser = new DescriptorParser(descReader);
          const desc = parser.parseDescriptor();
          
          console.log(`    Keys found: ${Object.keys(desc).join(', ')}`);
          
          // Show structure
          for (const [k, v] of Object.entries(desc)) {
            console.log(`    ${k}: ${v.type}`);
            if (v.type === 'VlLs') {
              console.log(`      Items: ${v.value.length}`);
              for (let i = 0; i < Math.min(3, v.value.length); i++) {
                const item = v.value[i];
                console.log(`      [${i}]: ${item.type}`);
                if (item.type === 'Objc') {
                  console.log(`        Keys: ${Object.keys(item.value).join(', ').substring(0, 100)}...`);
                }
              }
            } else if (v.type === 'Objc') {
              console.log(`      Keys: ${Object.keys(v.value).join(', ').substring(0, 100)}...`);
            }
          }
        } catch (err) {
          console.log(`    Error parsing descriptor: ${err}`);
        }
      } else if (key === 'samp') {
        console.log('  Content: Sample data (brush images)');
        if (length > 0) {
          const sampReader = new BinaryReader(Buffer.from(data));
          // Try to read sample structure
          let sampleCount = 0;
          while (!sampReader.isEof() && sampReader.remaining >= 4) {
            const sampleLength = sampReader.readUInt32BE();
            if (sampleLength === 0) break;
            sampleCount++;
            if (sampReader.remaining >= sampleLength) {
              sampReader.skip(sampleLength);
            } else {
              break;
            }
          }
          console.log(`    Samples: ${sampleCount}`);
        }
      }
    } else if (length > 0) {
      console.log(`  Warning: Not enough data remaining (${reader.remaining})`);
      break;
    }

    console.log('');
  }
}

// Test with all ABR files
const files = [
  'files/Basic_3.abr',
  'files/MainBrushes.abr',
];

for (const file of files) {
  if (fs.existsSync(file)) {
    analyzeFile(file);
    console.log('='.repeat(60));
    console.log('');
  }
}
