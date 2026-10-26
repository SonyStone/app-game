import type { PsdImage } from '@app-game/psd/viewer';

/** Encodes straight display RGBA8 directly, preserving hidden RGB and low-alpha samples without a canvas roundtrip. */
export async function pngBytes(image: PsdImage): Promise<Uint8Array<ArrayBuffer>> {
  if (
    image.width <= 0 ||
    image.height <= 0 ||
    image.width * image.height > 16_777_216 ||
    image.pixels.length !== image.width * image.height * 4
  ) {
    throw new Error('PNG export requires a nonempty admitted RGB8 image of at most 16 million pixels.');
  }

  const rows = new Uint8Array(image.height * (1 + image.width * 4));
  for (let row = 0; row < image.height; row++) {
    rows.set(
      image.pixels.subarray(row * image.width * 4, (row + 1) * image.width * 4),
      row * (1 + image.width * 4) + 1
    );
  }

  const stream = new Blob([rows]).stream().pipeThrough(new CompressionStream('deflate'));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, image.width);
  view.setUint32(4, image.height);
  header.set([8, 6, 0, 0, 0], 8);
  const chunks = [
    Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10),
    chunk('IHDR', header),
    chunk('IDAT', compressed),
    chunk('IEND', new Uint8Array())
  ];
  const output = new Uint8Array(chunks.reduce((total, bytes) => total + bytes.length, 0));
  let offset = 0;
  for (const bytes of chunks) {
    output.set(bytes, offset);
    offset += bytes.length;
  }

  return output;
}

/** PNG length/type/data/CRC container, network byte order. */
function chunk(type: string, data: Uint8Array) {
  const bytes = new Uint8Array(data.length + 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, data.length);
  bytes.set(new TextEncoder().encode(type), 4);
  bytes.set(data, 8);
  let crc = 0xffffffff;
  for (const value of bytes.subarray(4, data.length + 8)) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }

  view.setUint32(bytes.length - 4, (crc ^ 0xffffffff) >>> 0);
  return bytes;
}
