import { err, ok, ResultAsync, type Result } from 'neverthrow';
import { onCleanup } from 'solid-js';
import { decodePdfCmykJpeg, jpegComponents, stripJpegExif } from './decodeCmykJpeg';
import {
  assembleTiledMip,
  expandPackedTile,
  mipTail,
  packedTileIndex,
  reduceMip,
  tilePixels,
  type RasterMip
} from './rasterPixels';
import type { RasterReply, RasterRequest } from './rasterWorkerTypes';
import { mipSize, tileSize, type Tile } from './virtualTiles';

/** Owns an image and mip cache across serial requests. Create once under the worker's owner, outside request scopes. */
export function createRasterDecoder() {
  let current: { id: number; bytes: ArrayBuffer; baseLevel: number; mips: RasterMip[] } | undefined;
  onCleanup(() => {
    current = undefined;
  });
  return { decode };

  /**
   * Decodes a request's mip tail and tiles. A request carrying `bytes` replaces the cached source and its
   * decoded mips; a request without bytes reuses the cache and fails unless the cache holds the same image id.
   * The reply's `id` always equals `request.id`. An aborted `signal` resolves an error between decoding steps.
   */
  function decode(request: RasterRequest, signal?: AbortSignal) {
    return ResultAsync.fromThrowable(
      async (): Promise<Result<RasterReply, string>> => {
        if (request.bytes) {
          current = { id: request.id, bytes: request.bytes, baseLevel: 0, mips: [] };
        }

        if (!current || current.id !== request.id) {
          return err('Image decoder source is missing');
        }

        const source = current;
        const cancelled = () => err('Image decoding was cancelled');
        const getMip = async (level: number): Promise<Result<RasterMip, string>> => {
          if (request.codec === 4) {
            // Tail mips of long, thin images can span several packed tiles.
            return assembleTiledMip(mipSize(request.width, level), mipSize(request.height, level), (x, y) =>
              signal?.aborted ? Promise.resolve(cancelled()) : readTile({ image: request.id, level, x, y })
            );
          }

          const requestedLevel = Math.min(
            level,
            request.decodeLevel ?? level,
            ...request.tiles.map((tile) => tile.level)
          );

          if (!source.mips.length || requestedLevel < source.baseLevel) {
            // Browser JPEG decoding can resize before readback. Keep exact source pixels
            // at level zero; avoid a full RGBA readback and CPU pyramid for distant images.
            const baseLevel = request.codec >= 2 && jpegComponents(source.bytes) !== 4 ? requestedLevel : 0;
            const decoded = await decodeSource(request, source.bytes, baseLevel);

            if (decoded.isErr()) {
              return err(decoded.error);
            }

            if (signal?.aborted) {
              return cancelled();
            }

            source.baseLevel = baseLevel;
            source.mips = [decoded.value];
          }

          while (source.mips.length <= level - source.baseLevel) {
            source.mips.push(reduceMip(source.mips.at(-1)!));
          }

          return ok(source.mips[level - source.baseLevel]!);
        };
        const readTile = async (tile: Tile): Promise<Result<ArrayBuffer, string>> => {
          if (request.codec !== 4) {
            return (await getMip(tile.level)).map((mip) => tilePixels(mip, tile.x, tile.y));
          }

          const records = new DataView(source.bytes);
          const index = packedTileIndex(request.width, request.height, tile);
          const offset = records.getUint32(16 + index * 8, true);
          const length = records.getUint32(20 + index * 8, true);
          const width = Math.min(tileSize, mipSize(request.width, tile.level) - tile.x * tileSize) + 2;
          const height = Math.min(tileSize, mipSize(request.height, tile.level) - tile.y * tileSize) + 2;
          const packed = await inflate(source.bytes.slice(offset, offset + length), width * height * 4);
          if (packed.isErr()) {
            return err(packed.error);
          }

          return ok(expandPackedTile(packed.value, width, height));
        };
        const tail =
          request.tailLevel === undefined
            ? undefined
            : await mipTail(request.width, request.height, request.tailLevel, getMip);
        if (tail && tail.isErr()) {
          return err(tail.error);
        }

        const tiles: RasterReply['tiles'] = [];

        for (const tile of request.tiles) {
          if (signal?.aborted) {
            return cancelled();
          }

          const decoded = await readTile(tile);

          if (decoded.isErr()) {
            return err(decoded.error);
          }

          tiles.push({ tile, pixels: decoded.value });
        }

        return ok({ id: request.id, tail: tail?.value, tiles });
      },
      (cause) => String(cause)
    )().andThen((result) => result);
  }
}

/** Decodes a whole source image at `level`; codecs 0/1 are raw/deflated RGBA8; 2/3 are JPEG, with 3 applying embedded color profiles. */
async function decodeSource(request: RasterRequest, bytes: ArrayBuffer, level = 0): Promise<Result<RasterMip, string>> {
  const { width, height, codec } = request;

  if (codec === 1) {
    return (await inflate(bytes, width * height * 4)).map((pixels) => ({ width, height, pixels }));
  }

  if (codec === 0) {
    return bytes.byteLength === width * height * 4
      ? ok({ width, height, pixels: new Uint8Array(bytes) })
      : err('Image pixels do not match their declared dimensions');
  }

  if (jpegComponents(bytes) === 4) {
    return decodePdfCmykJpeg(bytes, width, height);
  }

  // PDF ignores Exif orientation, but browsers apply it. imageOrientation 'none' is deprecated
  // (treated as 'from-image' by current Chrome) and absent from the current enum, so strip Exif instead.
  const bitmap = await createImageBitmap(new Blob([stripJpegExif(bytes)], { type: 'image/jpeg' }), {
    colorSpaceConversion: codec === 3 ? 'default' : 'none'
  });
  const targetWidth = mipSize(width, level);
  const targetHeight = mipSize(height, level);
  const canvas = new OffscreenCanvas(targetWidth, targetHeight);
  const context = canvas.getContext('2d');

  if (!context || bitmap.width !== width || bitmap.height !== height) {
    bitmap.close();
    return err('Unable to decode JPEG at its declared dimensions');
  }

  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  bitmap.close();
  return ok({
    width: targetWidth,
    height: targetHeight,
    pixels: new Uint8Array(context.getImageData(0, 0, targetWidth, targetHeight).data.buffer)
  });
}

async function inflate(bytes: ArrayBuffer, length: number) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  const pixels = new Uint8Array(length);
  let offset = 0;

  while (true) {
    const chunk = await reader.read();

    if (chunk.done) {
      break;
    }

    if (chunk.value.length > length - offset) {
      await reader.cancel();
      return err('Image exceeds its declared dimensions');
    }

    pixels.set(chunk.value, offset);
    offset += chunk.value.length;
  }

  if (offset !== length) {
    return err('Incomplete image pixels');
  }

  return ok(pixels);
}
