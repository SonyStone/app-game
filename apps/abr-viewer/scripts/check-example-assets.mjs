import { open, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Rejects unresolved LFS pointers and unsupported ABR headers before deployment. */
export function validateExampleHeader(header, filename) {
  if (header.toString('utf8').startsWith('version https://git-lfs.github.com/spec/v1')) {
    throw new Error(
      `${filename}: Git LFS pointer instead of brush data. Run git lfs pull before building; ` +
      'on Vercel, enable Settings > Git > Git LFS and redeploy.'
    );
  }
  if (header.length < 4 || ![6, 9, 10].includes(header.readUInt16BE(0)) || ![1, 2].includes(header.readUInt16BE(2))) {
    throw new Error(`${filename}: invalid ABR header`);
  }
}

/** Checks only file headers, keeping memory use independent of brush-pack size. */
export async function checkExampleAssets(directory = new URL('../src/assets/examples/', import.meta.url)) {
  for (const filename of await readdir(directory)) {
    if (!filename.toLowerCase().endsWith('.abr')) continue;
    const file = await open(resolve(fileURLToPath(directory), filename), 'r');
    try {
      const header = Buffer.alloc(256);
      const { bytesRead } = await file.read(header, 0, header.length, 0);
      validateExampleHeader(header.subarray(0, bytesRead), filename);
    } finally {
      await file.close();
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await checkExampleAssets();
}
