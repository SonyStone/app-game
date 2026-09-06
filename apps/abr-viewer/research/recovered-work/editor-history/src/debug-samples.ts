/**
 * Debug script to analyze sample block structure
 */

import * as fs from 'fs';
import { BinaryReader } from './binary-reader';

function analyzeSamples(filePath: string) {
  const buffer = fs.readFileSync(filePath);
  const reader = new BinaryReader(buffer);

  console.log(`Analyzing samples in: ${filePath}`);
  console.log(`File size: ${buffer.length} bytes`);
  console.log('');

  // Skip version header
  reader.skip(4);

  // Find samp block
  while (!reader.isEof() && reader.remaining >= 12) {
    const sig = reader.readString(4);
    if (sig !== '8BIM') {
      console.log(`Invalid signature at ${reader.position - 4}: ${sig}`);
      break;
    }

    const key = reader.readString(4);
    const length = reader.readUInt32BE();

    if (key === 'samp' && length > 0) {
      console.log(`Found samp block at offset ${reader.position - 12}, length ${length}`);
      console.log('');

      // Read sample block
      const data = reader.readBytes(length);
      const sampReader = new BinaryReader(Buffer.from(data));

      let sampleIndex = 0;
      while (!sampReader.isEof() && sampReader.remaining >= 4) {
        const sampleLength = sampReader.readUInt32BE();
        if (sampleLength === 0) {
          console.log(`Sample ${sampleIndex}: length 0, stopping`);
          break;
        }

        const sampleStart = sampReader.position;
        console.log(`Sample ${sampleIndex}:`);
        console.log(`  Length: ${sampleLength} bytes`);
        console.log(`  Start offset: ${sampleStart}`);

        // Show first 40 bytes as hex
        const preview = sampReader.peek(Math.min(40, sampleLength));
        console.log(`  First bytes: ${preview.toString('hex').match(/.{2}/g)?.join(' ')}`);

        // Try to parse header
        const misc = sampReader.readUInt32BE();
        console.log(`  Misc/Unknown: ${misc} (0x${misc.toString(16)})`);

        const top = sampReader.readUInt32BE();
        const left = sampReader.readUInt32BE();
        const bottom = sampReader.readUInt32BE();
        const right = sampReader.readUInt32BE();
        
        const width = right - left;
        const height = bottom - top;
        console.log(`  Bounds: top=${top}, left=${left}, bottom=${bottom}, right=${right}`);
        console.log(`  Dimensions: ${width}x${height}`);

        if (width > 0 && height > 0 && width < 10000 && height < 10000) {
          const depth = sampReader.readUInt16BE();
          const compression = sampReader.readUInt8();
          console.log(`  Depth: ${depth} bits`);
          console.log(`  Compression: ${compression} (${compression === 0 ? 'raw' : compression === 1 ? 'RLE' : 'unknown'})`);
        }

        console.log('');

        // Move to next sample
        sampReader.seek(sampleStart + sampleLength);
        sampleIndex++;
      }

      console.log(`Total samples found: ${sampleIndex}`);
    } else if (length > 0) {
      reader.skip(length);
    }
  }
}

// Test with sample file
const files = [
  'files/MainBrushes.abr',
  'files/AI_Brush_collection.abr',
];

for (const file of files) {
  if (fs.existsSync(file)) {
    analyzeSamples(file);
    console.log('='.repeat(60));
    console.log('');
  }
}
