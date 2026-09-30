import { err, ok, type Result } from 'neverthrow';
import { lastLevel, mipSize, tileExtent, tileSize, type Tile } from './virtualTiles';

/** One independently decoded mip, with straight (unpremultiplied) RGBA8 samples in row-major order. */
export type RasterMip = { width: number; height: number; pixels: Uint8Array<ArrayBuffer> };

/** Area reduction includes the final row/column of odd and narrow images. */
export function reduceMip(source: RasterMip): RasterMip {
  const width = Math.max(1, Math.floor(source.width / 2));
  const height = Math.max(1, Math.floor(source.height / 2));
  const pixels = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    const top = Math.floor((y * source.height) / height);
    const bottom = Math.floor(((y + 1) * source.height) / height);

    for (let x = 0; x < width; x++) {
      const left = Math.floor((x * source.width) / width);
      const right = Math.floor(((x + 1) * source.width) / width);

      for (let channel = 0; channel < 4; channel++) {
        let sum = 0;

        for (let sy = top; sy < bottom; sy++) {
          for (let sx = left; sx < right; sx++) {
            sum += source.pixels[(sy * source.width + sx) * 4 + channel]!;
          }
        }

        pixels[(y * width + x) * 4 + channel] = Math.round(sum / ((bottom - top) * (right - left)));
      }
    }
  }

  return { width, height, pixels };
}

/** Copies neighboring texels into gutters; only image edges clamp, never internal tile edges. */
export function tilePixels(source: RasterMip, x: number, y: number) {
  const pixels = new Uint32Array(tileExtent * tileExtent);
  const sourcePixels = new Uint32Array(source.pixels.buffer, source.pixels.byteOffset, source.width * source.height);
  const left = x * tileSize - 1;
  const begin = Math.max(0, left);
  const end = Math.min(source.width, left + tileExtent);
  const offset = begin - left;

  for (let row = 0; row < tileExtent; row++) {
    const sy = Math.max(0, Math.min(source.height - 1, y * tileSize + row - 1));
    const from = sy * source.width;
    const to = row * tileExtent;
    pixels.fill(sourcePixels[from]!, to, to + offset);
    pixels.set(sourcePixels.subarray(from + begin, from + end), to + offset);
    pixels.fill(sourcePixels[from + source.width - 1]!, to + offset + end - begin, to + tileExtent);
  }

  return pixels.buffer;
}

/**
 * Widens a packed tile to premultiplied RGBA8. `channels` is 1 (opaque gray), 3 (opaque RGB) or 4, which is
 * returned unchanged; Rust validation has already rejected other counts.
 */
export function expandChannels(pixels: Uint8Array<ArrayBuffer>, channels: number): Uint8Array<ArrayBuffer> {
  if (channels === 4) {
    return pixels;
  }

  const count = pixels.length / channels;
  const rgba = new Uint8Array(count * 4);
  // One little-endian word per texel (R | G << 8 | B << 16 | 255 << 24); WebGPU platforms are little-endian.
  const words = new Uint32Array(rgba.buffer);

  if (channels === 1) {
    for (let i = 0; i < count; i++) {
      words[i] = (pixels[i]! * 0x10101) | 0xff000000;
    }
  } else {
    for (let i = 0; i < count; i++) {
      words[i] = pixels[i * 3]! | (pixels[i * 3 + 1]! << 8) | (pixels[i * 3 + 2]! << 16) | 0xff000000;
    }
  }

  return rgba;
}

/** Expands only boundary tiles; full tiles transfer their decoded buffer without another pixel copy. */
export function expandPackedTile(pixels: Uint8Array<ArrayBuffer>, width: number, height: number): ArrayBuffer {
  if (width === tileExtent && height === tileExtent) {
    return pixels.buffer;
  }

  const expanded = new Uint32Array(tileExtent * tileExtent);
  const source = new Uint32Array(pixels.buffer, pixels.byteOffset, width * height);

  for (let y = 0; y < height; y++) {
    const row = y * tileExtent;
    expanded.set(source.subarray(y * width, (y + 1) * width), row);
    expanded.fill(source[(y + 1) * width - 1]!, row + width, row + tileExtent);
  }

  for (let y = height; y < tileExtent; y++) {
    expanded.copyWithin(y * tileExtent, (height - 1) * tileExtent, height * tileExtent);
  }

  return expanded.buffer;
}

/**
 * Reassembles one mip level from its packed gutter tiles, reading every tile the level spans.
 * `readTile` returns a `tileExtent`² RGBA8 tile whose interior starts one texel inside its gutter.
 */
export async function assembleTiledMip(
  width: number,
  height: number,
  readTile: (x: number, y: number) => Promise<Result<ArrayBuffer, string>>
): Promise<Result<RasterMip, string>> {
  const pixels = new Uint8Array(width * height * 4);

  for (let ty = 0; ty < Math.ceil(height / tileSize); ty++) {
    for (let tx = 0; tx < Math.ceil(width / tileSize); tx++) {
      const tile = await readTile(tx, ty);

      if (tile.isErr()) {
        return err(tile.error);
      }

      const columns = Math.min(tileSize, width - tx * tileSize);
      const rows = Math.min(tileSize, height - ty * tileSize);
      const source = new Uint8Array(tile.value);

      for (let y = 0; y < rows; y++) {
        const from = ((y + 1) * tileExtent + 1) * 4;
        pixels.set(source.subarray(from, from + columns * 4), ((ty * tileSize + y) * width + tx * tileSize) * 4);
      }
    }
  }

  return ok({ width, height, pixels });
}

/** Canonical level-major GDOC tile index. Image dimensions have already been validated by Rust. */
export function packedTileIndex(width: number, height: number, tile: Pick<Tile, 'level' | 'x' | 'y'>) {
  let index = 0;

  for (let level = 0; level < tile.level; level++) {
    index += Math.ceil(mipSize(width, level) / tileSize) * Math.ceil(mipSize(height, level) / tileSize);
  }

  return index + tile.y * Math.ceil(mipSize(width, tile.level) / tileSize) + tile.x;
}

/** Packs the terminal mip chain horizontally with a one-texel border around every level. */
export async function mipTail(
  width: number,
  height: number,
  level: number,
  get: (level: number) => Promise<Result<RasterMip, string>>
) {
  let tailWidth = 0;
  const tailHeight = mipSize(height, level) + 2;

  for (let l = level; l <= lastLevel(width, height); l++) {
    tailWidth += mipSize(width, l) + 2;
  }

  const pixels = new Uint8Array(tailWidth * tailHeight * 4);
  let offset = 0;

  for (let l = level; l <= lastLevel(width, height); l++) {
    const result = await get(l);

    if (result.isErr()) {
      return err(result.error);
    }

    const mip = result.value;
    for (let y = 0; y < mip.height + 2; y++) {
      const sy = Math.max(0, Math.min(mip.height - 1, y - 1));

      for (let x = 0; x < mip.width + 2; x++) {
        const sx = Math.max(0, Math.min(mip.width - 1, x - 1));
        const from = (sy * mip.width + sx) * 4;
        pixels.set(mip.pixels.subarray(from, from + 4), (y * tailWidth + offset + x) * 4);
      }
    }

    offset += mip.width + 2;
  }

  return ok({ width: tailWidth, height: tailHeight, pixels: pixels.buffer });
}
