import { readFileSync } from 'fs';

const buffer = readFileSync('/workspace/files/Chunky_Chalk_Brush_by_MarkWinters.abr');

// Read version
const version = buffer.readUInt16BE(0);
const subVersion = buffer.readUInt16BE(2);
console.log('Version:', version, 'SubVersion:', subVersion);

// Find sample blocks
let pos = 4;
while (pos < buffer.length - 12) {
  const sig = buffer.toString('ascii', pos, pos + 4);
  if (sig !== '8BIM') {
    pos++;
    continue;
  }
  
  const key = buffer.toString('ascii', pos + 4, pos + 8);
  const length = buffer.readUInt32BE(pos + 8);
  
  console.log(`Block at ${pos}: ${key}, length ${length}`);
  
  if (key === 'samp') {
    // Parse sample block
    const sampleData = buffer.slice(pos + 12, pos + 12 + length);
    let samplePos = 0;
    let sampleIndex = 0;
    
    while (samplePos < sampleData.length - 4) {
      const brushLength = sampleData.readUInt32BE(samplePos);
      if (brushLength === 0) break;
      
      samplePos += 4;
      
      // Read UUID (37 bytes + null)
      const uuidBytes = sampleData.slice(samplePos, samplePos + 37);
      const uuid = uuidBytes.toString('ascii').replace(/\0/g, '');
      console.log(`  Sample ${sampleIndex}: UUID = "${uuid}", length = ${brushLength}`);
      
      samplePos += brushLength;
      // Align to 4-byte boundary
      while (samplePos % 4 !== 0) samplePos++;
      sampleIndex++;
    }
  }
  
  pos += 12 + length;
}
