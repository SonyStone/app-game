import { unpackBits } from './packBits';
import { blendKeys, type PsdBlend, type PsdDocument, type PsdLayer } from './psd';

/**
 * Reads the raster layers of an 8-bit RGB PSD, raw or PackBits-compressed. Group folders are flattened into their
 * layers, layer masks are ignored, and a document without layers becomes one layer of its flattened image. Throws a
 * readable error for other color modes, bit depths, PSB files and ZIP-compressed layers.
 */
export function readPsd(buffer: ArrayBuffer | Uint8Array): PsdDocument {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const input = new ByteReader(bytes);
  if (input.text(4) !== '8BPS') {
    throw new Error('This is not a Photoshop document.');
  }

  const version = input.u16();
  if (version !== 1) {
    throw new Error('Large documents (PSB) are not supported; save as PSD.');
  }

  input.skip(6);
  const channelCount = input.u16();
  const height = input.u32(),
    width = input.u32();
  const depth = input.u16(),
    mode = input.u16();
  if (depth !== 8 || mode !== 3) {
    throw new Error('Only 8-bit RGB Photoshop documents can be opened.');
  }

  input.skip(input.u32());
  input.skip(input.u32());

  const layerSectionEnd = input.u32() + input.offset;
  const layers = layerSectionEnd > input.offset ? readLayerInfo(input) : [];
  input.offset = layerSectionEnd;
  if (layers.length > 0) {
    return { width, height, layers };
  }

  return { width, height, layers: [readComposite(input, width, height, channelCount)] };
}

/** The layer info: records, then each layer's channel data. Folder markers are left out. */
function readLayerInfo(input: ByteReader): PsdLayer[] {
  const length = input.u32();
  if (length === 0) {
    return [];
  }

  const count = Math.abs(input.i16());
  const records = Array.from({ length: count }, () => readRecord(input));
  const layers: PsdLayer[] = [];
  for (const record of records) {
    const width = record.right - record.left,
      height = record.bottom - record.top;
    const pixels = new Uint8Array(width * height * 4);
    if (!record.channels.some(({ id }) => id === -1)) {
      // No transparency channel: opaque.
      for (let index = 3; index < pixels.length; index += 4) {
        pixels[index] = 255;
      }
    }

    for (const channel of record.channels) {
      const end = input.offset + channel.length;
      const offset = channel.id === -1 ? 3 : channel.id;
      if (offset >= 0 && offset < 4 && width > 0 && height > 0) {
        const plane = readPlane(input, width, height);
        for (let index = 0; index < plane.length; index++) {
          pixels[index * 4 + offset] = plane[index]!;
        }
      }

      input.offset = end;
    }

    if (!record.folder) {
      layers.push({
        name: record.name,
        left: record.left,
        top: record.top,
        width,
        height,
        pixels,
        opacity: record.opacity / 255,
        visible: !(record.flags & 2),
        blend: record.blend,
        clipping: record.clipping,
        transparencyLocked: !!(record.flags & 1)
      });
    }
  }

  return layers;
}

/** A layer record, up to its additional information, of which the Unicode name and folder markers are kept. */
function readRecord(input: ByteReader) {
  const top = input.i32(),
    left = input.i32(),
    bottom = input.i32(),
    right = input.i32();
  const channels = Array.from({ length: input.u16() }, () => ({ id: input.i16(), length: input.u32() }));
  if (input.text(4) !== '8BIM') {
    throw new Error('A layer of this PSD is corrupt.');
  }

  const key = input.text(4);
  const blend =
    (Object.entries(blendKeys) as [PsdBlend, string][]).find(([, candidate]) => candidate === key)?.[0] ?? 'normal';
  const opacity = input.u8(),
    clipping = input.u8() === 1,
    flags = input.u8();
  input.skip(1);
  const extraEnd = input.u32() + input.offset;
  input.skip(input.u32());
  input.skip(input.u32());
  const nameLength = input.u8();
  let name = new TextDecoder('latin1').decode(input.take(nameLength));
  input.skip((4 - ((nameLength + 1) % 4)) % 4);
  let folder = false;
  while (input.offset + 12 <= extraEnd) {
    const signature = input.text(4);
    if (signature !== '8BIM' && signature !== '8B64') {
      break;
    }

    const tag = input.text(4);
    const end = input.u32() + input.offset;
    if (tag === 'luni') {
      const characters = input.u32();
      name = String.fromCharCode(...Array.from({ length: characters }, () => input.u16()));
    } else if (tag === 'lsct') {
      // Section dividers: 1 and 2 open a folder, 3 closes one.
      folder = input.u32() !== 0;
    }

    input.offset = end;
  }

  input.offset = extraEnd;
  return { top, left, bottom, right, channels, blend, opacity, clipping, flags, name, folder };
}

/** One channel of `width` × `height` pixels after its compression code. */
function readPlane(input: ByteReader, width: number, height: number): Uint8Array {
  const compression = input.u16();
  if (compression === 0) {
    return input.take(width * height).slice();
  }

  if (compression !== 1) {
    throw new Error('This PSD has ZIP-compressed layers, which cannot be opened yet.');
  }

  const lengths = Array.from({ length: height }, () => input.u16());
  const plane = new Uint8Array(width * height);
  lengths.forEach((length, row) => plane.set(unpackBits(input.take(length), width), row * width));
  return plane;
}

/** The flattened image as one layer, for documents saved without layers. */
function readComposite(input: ByteReader, width: number, height: number, channels: number): PsdLayer {
  const compression = input.u16();
  const lengths = compression === 1 ? Array.from({ length: channels * height }, () => input.u16()) : [];
  const pixels = new Uint8Array(width * height * 4).fill(255);
  for (let channel = 0; channel < channels; channel++) {
    for (let y = 0; y < height; y++) {
      const row = compression === 1 ? unpackBits(input.take(lengths[channel * height + y]!), width) : input.take(width);
      if (channel < 4) {
        for (let x = 0; x < width; x++) {
          pixels[(y * width + x) * 4 + channel] = row[x]!;
        }
      }
    }
  }

  return {
    name: 'Background',
    left: 0,
    top: 0,
    width,
    height,
    pixels,
    opacity: 1,
    visible: true,
    blend: 'normal',
    clipping: false,
    transparencyLocked: false
  };
}

/** Big-endian reads from a byte array; reading past its end throws. */
class ByteReader {
  offset = 0;
  private view: DataView;

  constructor(private bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  u8() {
    this.need(1);
    return this.view.getUint8(this.offset++);
  }

  u16() {
    this.need(2);
    const value = this.view.getUint16(this.offset);
    this.offset += 2;
    return value;
  }

  i16() {
    this.need(2);
    const value = this.view.getInt16(this.offset);
    this.offset += 2;
    return value;
  }

  u32() {
    this.need(4);
    const value = this.view.getUint32(this.offset);
    this.offset += 4;
    return value;
  }

  i32() {
    this.need(4);
    const value = this.view.getInt32(this.offset);
    this.offset += 4;
    return value;
  }

  text(length: number) {
    return String.fromCharCode(...this.take(length));
  }

  take(length: number) {
    this.need(length);
    const slice = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }

  skip(length: number) {
    this.need(length);
    this.offset += length;
  }

  private need(length: number) {
    if (this.offset + length > this.bytes.length) {
      throw new Error('This PSD ends early.');
    }
  }
}
