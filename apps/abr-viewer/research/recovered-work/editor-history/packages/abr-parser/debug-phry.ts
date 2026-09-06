import { BinaryReader } from './src/binary-reader';
import { DescriptorParser } from './src/descriptor-parser';
import * as fs from 'fs';

const data = fs.readFileSync('./files/Brushes To Implement.abr');
const reader = new BinaryReader(data);
reader.readUInt16BE(); reader.readUInt16BE(); // version

// Skip to find phry block
while (!reader.isEof() && reader.remaining >= 12) {
  const sig = reader.readString(4);
  if (sig !== '8BIM') break;
  const key = reader.readString(4);
  const len = reader.readUInt32BE();

  if (key === 'phry') {
    console.log('Found phry block at offset', reader.position - 12, 'length:', len);
    const blockData = new Uint8Array(reader.readBytes(len));
    const blockReader = new BinaryReader(blockData);
    const version = blockReader.readUInt32BE();
    console.log('Descriptor version:', version);

    const descParser = new DescriptorParser(blockReader);
    const desc = descParser.parseDescriptor();

    console.log('Top-level keys:', Object.keys(desc));

    const hierarchy = desc['hierarchy'];
    if (hierarchy && hierarchy.type === 'VlLs') {
      console.log('Hierarchy list items:', hierarchy.value.length);
      for (let i = 0; i < hierarchy.value.length; i++) {
        const item = hierarchy.value[i];
        if (item.type === 'Objc') {
          const nm = item.value['Nm  '];
          const name = nm && nm.type === 'TEXT' ? nm.value : '(none)';
          const zuid = item.value['zuid'];
          const uuid = zuid && zuid.type === 'TEXT' ? zuid.value : '(none)';
          const keys = Object.keys(item.value);
          console.log(`  [${i}] classId="${item.classId}" name="${name}" uuid="${uuid}" keys=[${keys.join(', ')}]`);
        }
      }
    }
  } else {
    reader.skip(len);
  }
}
