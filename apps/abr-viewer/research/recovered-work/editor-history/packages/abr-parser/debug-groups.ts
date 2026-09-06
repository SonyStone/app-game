import { BinaryReader } from './src/binary-reader';
import { DescriptorParser } from './src/descriptor-parser';
import { AbrParser } from './src/abr-parser';
import { AbrWriter } from './src/abr-writer';
import * as fs from 'fs';

function flattenValue(value: any): any {
  if (!value) return value;
  switch (value.type) {
    case 'long':
    case 'doub':
    case 'bool':
    case 'TEXT':
      return value.value;
    case 'enum':
      return { _enum: value.typeId, value: value.value };
    case 'UntF':
      return { _unit: value.unit, value: value.value };
    case 'Objc': {
      const result: any = { __classId: value.classId };
      for (const [k, v] of Object.entries(value.value)) {
        result[k] = flattenValue(v);
      }
      return result;
    }
    case 'VlLs':
      return value.value.map((v: any) => flattenValue(v));
    default:
      return value;
  }
}

function analyzeFile(filePath: string) {
  console.log('\n====== Analyzing:', filePath, '======');
  const data = fs.readFileSync(filePath);
  console.log('File size:', data.length);
  const reader = new BinaryReader(data);

  const ver = reader.readUInt16BE();
  const subVer = reader.readUInt16BE();
  console.log('Version:', ver, 'SubVersion:', subVer);

  while (!reader.isEof() && reader.remaining >= 12) {
    const sig = reader.readString(4);
    if (sig !== '8BIM') break;
    const key = reader.readString(4);
    const len = reader.readUInt32BE();
    console.log('Block:', key, 'Length:', len);

    if (key === 'desc') {
      const blockData = new Uint8Array(reader.readBytes(len));
      const blockReader = new BinaryReader(blockData);
      const version = blockReader.readUInt32BE();

      const descParser = new DescriptorParser(blockReader);
      const desc = descParser.parseDescriptor();

      console.log('  Top-level keys:', Object.keys(desc));

      const brsh = desc['Brsh'];
      if (brsh && brsh.type === 'VlLs') {
        console.log('  Brsh list items:', brsh.value.length);
        for (let i = 0; i < brsh.value.length; i++) {
          const item = brsh.value[i];
          if (item.type === 'Objc') {
            const nm = item.value['Nm  '];
            const name = nm && nm.type === 'TEXT' ? nm.value : '(no name)';
            const hasSubBrsh = item.value['Brsh'] && (item.value['Brsh'] as any).type === 'VlLs';
            const subCount = hasSubBrsh ? ((item.value['Brsh'] as any).value as any[]).length : 0;
            console.log(`    [${i}] classId="${item.classId}" name="${name}" keys=[${Object.keys(item.value).join(', ')}]${hasSubBrsh ? ` HAS SUB-BRUSHES(${subCount})` : ''}`);

            // If this is a group/folder, print more details
            if (item.classId !== 'brushPreset') {
              console.log(`      DETAILS:`, JSON.stringify(flattenValue(item), null, 2).substring(0, 500));
            }

            // Recurse into sub-brushes
            if (hasSubBrsh) {
              const subBrsh = item.value['Brsh'] as any;
              for (let j = 0; j < subBrsh.value.length; j++) {
                const sub = subBrsh.value[j];
                if (sub.type === 'Objc') {
                  const subNm = sub.value['Nm  '];
                  const subName = subNm && subNm.type === 'TEXT' ? subNm.value : '(no name)';
                  const hasSubSub = sub.value['Brsh'] && (sub.value['Brsh'] as any).type === 'VlLs';
                  const subSubCount = hasSubSub ? ((sub.value['Brsh'] as any).value as any[]).length : 0;
                  console.log(`      [${i}.${j}] classId="${sub.classId}" name="${subName}"${hasSubSub ? ` HAS SUB-BRUSHES(${subSubCount})` : ''}`);
                }
              }
            }
          }
        }
      }
    } else {
      reader.skip(len);
    }
  }
}

// Analyze original
analyzeFile('./files/Brushes To Implement.abr');

// Now check the DIFFERENCE between the files more closely
// Specifically look at what brushGroup contains

console.log('\n\n====== BRUSH GROUP DETAILS ======');
function analyzeGroups(filePath: string) {
  console.log('\n--- File:', filePath, '---');
  const data = fs.readFileSync(filePath);
  const reader = new BinaryReader(data);
  reader.readUInt16BE(); reader.readUInt16BE(); // skip version

  while (!reader.isEof() && reader.remaining >= 12) {
    const sig = reader.readString(4);
    if (sig !== '8BIM') break;
    const key = reader.readString(4);
    const len = reader.readUInt32BE();

    if (key === 'desc') {
      const blockData = new Uint8Array(reader.readBytes(len));
      const blockReader = new BinaryReader(blockData);
      blockReader.readUInt32BE(); // version

      const descParser = new DescriptorParser(blockReader);
      const desc = descParser.parseDescriptor();

      const brsh = desc['Brsh'];
      if (brsh && brsh.type === 'VlLs') {
        // Look at first brush's brushGroup
        for (let i = 0; i < Math.min(3, brsh.value.length); i++) {
          const item = brsh.value[i];
          if (item.type === 'Objc') {
            const nm = item.value['Nm  '];
            const name = nm && nm.type === 'TEXT' ? nm.value : '?';
            const bg = item.value['brushGroup'];
            console.log(`  [${i}] name="${name}"`);
            if (bg) {
              console.log(`    brushGroup:`, JSON.stringify(flattenValue(bg), null, 4));
            }
          }
        }
      }
    } else {
      reader.skip(len);
    }
  }
}

function analyzeGroupsFull(filePath: string) {
  console.log('\n--- File:', filePath, '---');
  const data = fs.readFileSync(filePath);
  const reader = new BinaryReader(data);
  reader.readUInt16BE(); reader.readUInt16BE(); // skip version

  while (!reader.isEof() && reader.remaining >= 12) {
    const sig = reader.readString(4);
    if (sig !== '8BIM') break;
    const key = reader.readString(4);
    const len = reader.readUInt32BE();

    if (key === 'desc') {
      const blockData = new Uint8Array(reader.readBytes(len));
      const blockReader = new BinaryReader(blockData);
      blockReader.readUInt32BE(); // version

      const descParser = new DescriptorParser(blockReader);
      const desc = descParser.parseDescriptor();

      const brsh = desc['Brsh'];
      if (brsh && brsh.type === 'VlLs') {
        // Check ALL items for brushGroup details
        for (let i = 0; i < brsh.value.length; i++) {
          const item = brsh.value[i];
          if (item.type === 'Objc') {
            const nm = item.value['Nm  '];
            const name = nm && nm.type === 'TEXT' ? nm.value : '?';
            const bg = item.value['brushGroup'];
            if (bg && bg.type === 'Objc') {
              const useBG = bg.value['useBrushGroup'];
              const bgName = bg.value['Nm  '];
              const subBrsh = bg.value['Brsh'];
              const hasSubBrsh = subBrsh && subBrsh.type === 'VlLs';
              const keys = Object.keys(bg.value);
              console.log(`  [${i}] name="${name}" brushGroup keys=[${keys.join(', ')}]`);
              if (useBG) console.log(`    useBrushGroup=${flattenValue(useBG)}`);
              if (bgName) console.log(`    groupName="${flattenValue(bgName)}"`);
              if (hasSubBrsh) console.log(`    has sub-brushes: ${(subBrsh as any).value.length}`);
              // Print the FULL brushGroup
              console.log(`    FULL: ${JSON.stringify(flattenValue(bg), null, 2).substring(0, 1000)}`);
            } else {
              console.log(`  [${i}] name="${name}" NO brushGroup`);
            }
          }
        }
      }
    } else {
      reader.skip(len);
    }
  }
}

console.log('\n\n====== FULL BRUSH GROUP ANALYSIS ======');
analyzeGroupsFull('./files/Brushes To Implement.abr');

// Now let's do a hex dump of the differences between the two files
console.log('\n\n====== FILE STRUCTURE COMPARISON ======');
function dumpBlocks(filePath: string) {
  console.log(`\n--- ${filePath} ---`);
  const data = fs.readFileSync(filePath);
  const reader = new BinaryReader(data);
  const ver = reader.readUInt16BE();
  const subVer = reader.readUInt16BE();
  console.log(`Version: ${ver}.${subVer}`);
  console.log(`File size: ${data.length}`);

  let blockNum = 0;
  while (!reader.isEof() && reader.remaining >= 12) {
    const pos = reader.position;
    const sig = reader.readString(4);
    if (sig !== '8BIM') {
      console.log(`  Non-8BIM at offset ${pos}: "${sig}" (0x${sig.charCodeAt(0).toString(16)} 0x${sig.charCodeAt(1).toString(16)} 0x${sig.charCodeAt(2).toString(16)} 0x${sig.charCodeAt(3).toString(16)})`);
      break;
    }
    const key = reader.readString(4);
    const len = reader.readUInt32BE();
    console.log(`  Block #${blockNum}: key="${key}" offset=${pos} dataOffset=${reader.position} length=${len}`);
    reader.skip(len);
    blockNum++;
  }
  
  if (!reader.isEof()) {
    console.log(`  Remaining bytes after blocks: ${reader.remaining} at offset ${reader.position}`);
    // Show first bytes of remaining data
    const remaining = Math.min(32, reader.remaining);
    const bytes = [];
    for (let i = 0; i < remaining; i++) {
      bytes.push(reader.readUInt8().toString(16).padStart(2, '0'));
    }
    console.log(`  First bytes: ${bytes.join(' ')}`);
  }
}

dumpBlocks('./files/Brushes To Implement.abr');
dumpBlocks('./files/Brushes To Implement Roundtrip.abr');
