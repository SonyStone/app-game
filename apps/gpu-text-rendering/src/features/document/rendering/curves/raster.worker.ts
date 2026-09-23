import { err, ok, ResultAsync, type Result } from 'neverthrow';
import { decodePdfCmykJpeg, jpegComponents } from './decodeCmykJpeg';
import { expandPackedTile, mipTail, packedTileIndex, reduceMip, tilePixels, type RasterMip } from './rasterPixels';
import { mipSize, tileExtent, tileSize, type Tile } from './virtualTiles';

/** Jobs carry at most sixteen tiles. The worker retains only the current image's decoded pyramid. */
export type RasterRequest = {
  id: number;
  bytes?: ArrayBuffer;
  width: number;
  height: number;
  codec: number;
  tailLevel?: number;
  /** Finest visible mip, including tiles queued after this bounded batch. */
  decodeLevel?: number;
  tiles: Tile[];
};

/** Transferable pixels, independent of any GPU allocation or residency decision. */
export type RasterReply = {
  id: number;
  tail?: { width: number; height: number; pixels: ArrayBuffer };
  tiles: { tile: Tile; pixels: ArrayBuffer }[];
};

let current: { id: number; bytes: ArrayBuffer; baseLevel: number; mips: RasterMip[] } | undefined;

self.onmessage = (event: MessageEvent<RasterRequest>) => {
  const request = event.data;

  void ResultAsync.fromThrowable(
    async (): Promise<Result<RasterReply, string>> => {
      if (request.bytes) {
        current = { id: request.id, bytes: request.bytes, baseLevel: 0, mips: [] };
      }

      if (!current || current.id !== request.id) {
        return err('Image decoder source is missing');
      }

      const source = current;
      const getMip = async (level: number): Promise<Result<RasterMip, string>> => {
        if (request.codec === 4) {
          const width = mipSize(request.width, level);
          const height = mipSize(request.height, level);
          const tile = await readTile({ image: request.id, level, x: 0, y: 0 });
          if (tile.isErr()) {
            return err(tile.error);
          }

          const pixels = new Uint8Array(width * height * 4);

          for (let y = 0; y < height; y++) {
            pixels.set(new Uint8Array(tile.value, ((y + 1) * tileExtent + 1) * 4, width * 4), y * width * 4);
          }

          return ok({ width, height, pixels });
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
        const decoded = await readTile(tile);

        if (decoded.isErr()) {
          return err(decoded.error);
        }

        tiles.push({ tile, pixels: decoded.value });
      }

      return ok({ id: request.id, tail: tail?.value, tiles });
    },
    (cause) => String(cause)
  )()
    .andThen((result) => result)
    .then((result) => {
      const reply = result.isOk()
        ? { ok: true as const, value: result.value }
        : { ok: false as const, error: result.error };
      self.postMessage(reply, {
        transfer: reply.ok
          ? [...(reply.value.tail ? [reply.value.tail.pixels] : []), ...reply.value.tiles.map((tile) => tile.pixels)]
          : []
      });
    });
};

async function decodeSource(request: RasterRequest, bytes: ArrayBuffer, level = 0): Promise<Result<RasterMip, string>> {
  const { width, height, codec } = request;

  if (codec < 2) {
    const pixels = codec === 1 ? await inflate(bytes, width * height * 4) : ok(new Uint8Array(bytes));
    return pixels.map((pixels) => ({ width, height, pixels }));
  }

  if (jpegComponents(bytes) === 4) {
    return decodePdfCmykJpeg(bytes, width, height);
  }

  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }), {
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
