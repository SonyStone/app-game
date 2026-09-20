import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';

/** Downloads regression fixtures once into the ignored repository cache, outside build assets. */
export async function readAdobeBrushFixture(filename) {
  if (!/^[\w-]+\.abr$/.test(filename)) throw new Error('Invalid Adobe brush filename');
  const directory = new URL('../.tmp/adobe-brushes/', import.meta.url);
  const path = new URL(filename, directory);
  try {
    return await readFile(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const response = await fetch(`https://download.adobe.com/pub/adobe/photoshop/brushes/${filename}`);
  if (!response.ok) throw new Error(`Adobe fixture ${filename}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 4 || ![6, 9, 10].includes(bytes.readUInt16BE(0))) {
    throw new Error(`Adobe fixture ${filename}: invalid ABR header`);
  }
  await mkdir(directory, { recursive: true });
  const temporary = new URL(`${filename}.${randomUUID()}.tmp`, directory);
  await writeFile(temporary, bytes);
  await rename(temporary, path);
  return bytes;
}
