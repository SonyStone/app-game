import { packBits } from './packBits';
import { blendKeys, maxPsdSide, type PsdDocument, type PsdLayer } from './psd';

/**
 * Writes a PSD of 8-bit RGB layers with transparency, PackBits-compressed as Photoshop saves them. `composite` is
 * the flattened image, straight RGBA of the canvas, shown by programs that do not read layers. Layer names are
 * stored both as Pascal strings and as Unicode. Throws when the canvas is larger than a PSD allows.
 */
export function writePsd(document: PsdDocument, composite: Uint8Array): Uint8Array {
  const { width, height } = document;
  if (width < 1 || height < 1 || width > maxPsdSide || height > maxPsdSide) {
    throw new Error(`A PSD is 1 to ${maxPsdSide} pixels on each side; this canvas is ${width} × ${height}.`);
  }

  const out = new ByteWriter();
  // Header: 4 channels (RGB and the composite's transparency), 8 bits, RGB color.
  out.text('8BPS');
  out.u16(1);
  out.zeros(6);
  out.u16(4);
  out.u32(height);
  out.u32(width);
  out.u16(8);
  out.u16(3);
  // No color mode data or image resources.
  out.u32(0);
  out.u32(0);

  const layerSection = new ByteWriter();
  const layerInfo = new ByteWriter();
  // A negative count says the composite's first alpha channel holds its transparency.
  layerInfo.i16(-document.layers.length);
  const channels = document.layers.map(layerChannels);
  document.layers.forEach((layer, index) => writeRecord(layerInfo, layer, channels[index]!));
  for (const layer of channels) {
    for (const channel of layer) {
      layerInfo.bytes(channel.data);
    }
  }

  if (layerInfo.length % 2) {
    layerInfo.u8(0);
  }

  layerSection.u32(layerInfo.length);
  layerSection.bytes(layerInfo.finish());
  // No global layer mask.
  layerSection.u32(0);
  out.u32(layerSection.length);
  out.bytes(layerSection.finish());

  writeComposite(out, composite, width, height);
  return out.finish();
}

/** A layer's channels, alpha first, each compressed with its compression code and row lengths. */
function layerChannels(layer: PsdLayer) {
  return ([-1, 0, 1, 2] as const).map((id) => {
    const offset = id === -1 ? 3 : id;
    const data = new ByteWriter();
    data.u16(1);
    const rows = Array.from({ length: layer.height }, (_, y) => {
      const row = new Uint8Array(layer.width);
      for (let x = 0; x < layer.width; x++) {
        row[x] = layer.pixels[(y * layer.width + x) * 4 + offset]!;
      }

      return packBits(row);
    });
    rows.forEach((row) => data.u16(row.length));
    rows.forEach((row) => data.bytes(row));
    return { id, data: data.finish() };
  });
}

/** A layer record: bounds, channel lengths, blending, flags and name. */
function writeRecord(out: ByteWriter, layer: PsdLayer, channels: ReturnType<typeof layerChannels>) {
  out.i32(layer.top);
  out.i32(layer.left);
  out.i32(layer.top + layer.height);
  out.i32(layer.left + layer.width);
  out.u16(channels.length);
  for (const channel of channels) {
    out.i16(channel.id);
    out.u32(channel.data.length);
  }

  out.text('8BIM');
  out.text(blendKeys[layer.blend]);
  out.u8(Math.round(Math.min(1, Math.max(0, layer.opacity)) * 255));
  out.u8(layer.clipping ? 1 : 0);
  // Bit 0: transparency locked; bit 1: hidden; bit 3: bit 4 is meaningful (pixels are relevant).
  out.u8((layer.transparencyLocked ? 1 : 0) | (layer.visible ? 0 : 2) | 8);
  out.u8(0);

  const extra = new ByteWriter();
  // No layer mask and no blending ranges.
  extra.u32(0);
  extra.u32(0);
  const name = new TextEncoder().encode(layer.name.replace(/[^\x20-\x7e]/g, '?')).subarray(0, 255);
  extra.u8(name.length);
  extra.bytes(name);
  extra.zeros((4 - ((name.length + 1) % 4)) % 4);
  // The Unicode name, `luni`.
  const unicode = new ByteWriter();
  unicode.u32(layer.name.length);
  for (let index = 0; index < layer.name.length; index++) {
    unicode.u16(layer.name.charCodeAt(index));
  }

  if (unicode.length % 4) {
    unicode.zeros(4 - (unicode.length % 4));
  }

  extra.text('8BIM');
  extra.text('luni');
  extra.u32(unicode.length);
  extra.bytes(unicode.finish());
  out.u32(extra.length);
  out.bytes(extra.finish());
}

/** The flattened image: PackBits rows of red, green, blue and alpha in turn. */
function writeComposite(out: ByteWriter, composite: Uint8Array, width: number, height: number) {
  out.u16(1);
  const rows: Uint8Array[] = [];
  for (let channel = 0; channel < 4; channel++) {
    for (let y = 0; y < height; y++) {
      const row = new Uint8Array(width);
      for (let x = 0; x < width; x++) {
        row[x] = composite[(y * width + x) * 4 + channel]!;
      }

      rows.push(packBits(row));
    }
  }

  rows.forEach((row) => out.u16(row.length));
  rows.forEach((row) => out.bytes(row));
}

/** Big-endian bytes appended to growing chunks. */
class ByteWriter {
  private chunks: Uint8Array[] = [];
  private current = new Uint8Array(1 << 16);
  private used = 0;
  length = 0;

  u8(value: number) {
    this.reserve(1);
    this.current[this.used++] = value & 255;
    this.length++;
  }

  u16(value: number) {
    this.u8(value >> 8);
    this.u8(value);
  }

  i16(value: number) {
    this.u16(value & 0xffff);
  }

  u32(value: number) {
    this.u16(value >>> 16);
    this.u16(value & 0xffff);
  }

  i32(value: number) {
    this.u32(value >>> 0);
  }

  text(value: string) {
    for (let index = 0; index < value.length; index++) {
      this.u8(value.charCodeAt(index));
    }
  }

  zeros(count: number) {
    for (let index = 0; index < count; index++) {
      this.u8(0);
    }
  }

  bytes(data: Uint8Array) {
    this.flush();
    this.chunks.push(data);
    this.length += data.length;
  }

  finish(): Uint8Array {
    this.flush();
    const result = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }

  private reserve(count: number) {
    if (this.used + count > this.current.length) {
      this.flush();
    }
  }

  private flush() {
    if (this.used > 0) {
      this.chunks.push(this.current.slice(0, this.used));
      this.current = new Uint8Array(1 << 16);
      this.used = 0;
    }
  }
}
