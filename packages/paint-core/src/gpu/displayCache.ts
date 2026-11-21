import { type TgpuRoot, type TgpuTexture } from 'typegpu';
import { TILE_SIZE } from '../brush';
import { unpackTile, type TileData } from '../tilePixels';
import { viewLayout } from './shaders';
import type { createTileMipmaps } from './tileMipmaps';

/** Keeps committed display pixels independent of brush scratch residency, bounded to 96 MiB.
 * Reduced textures retain the mip levels required at the current screen scale. CPU snapshots stay full resolution.
 * Entries are RGBA8 tiles, or one-channel `r8unorm` ones for a mask's coverage (see `maskPlane`), a quarter the size.
 */
export function createDisplayCache(
  root: TgpuRoot,
  sampler: ReturnType<TgpuRoot['createSampler']>,
  generateMipmaps?: ReturnType<typeof createTileMipmaps>
) {
  const entries = new Map<string, ReturnType<typeof createEntry>>();
  let bytes = 0;
  /** Full mip chains that reduced entries are generated in, by format. */
  const scratch = new Map<DisplayFormat, ReturnType<typeof texture>>();
  const remove = (id: string, beforeInvalidate?: () => void) => {
    const entry = entries.get(id);
    if (!entry) return;
    beforeInvalidate?.();
    bytes -= entry.bytes;
    entry.texture.destroy();
    entry.camera.destroy();
    entries.delete(id);
  };
  const find = (id: string, version: TileData, scale: number, beforeInvalidate?: (source: TgpuTexture) => void) => {
    const entry = entries.get(id);
    const level = Math.max(0, Math.min(8, Math.floor(-Math.log2(scale))));
    if (!entry) return undefined;
    if (entry.version !== version || entry.level > level) {
      beforeInvalidate?.(entry.texture);
      remove(id);
      return undefined;
    }
    entries.delete(id);
    entries.set(id, entry);
    return entry;
  };
  return {
    /** Tests immutable source identity before loading pixels from IndexedDB.
     * beforeInvalidate receives the texture before destruction, so callers can submit its encoded readers.
     */
    find,
    /** Reuses immutable snapshots; zooming in replaces a coarse entry before drawing it.
     * Full-resolution entries start with mipLevelReady = 0; a minifying caller extends that valid prefix.
     * beforeInvalidate runs before replacement/eviction; uploading a fresh texture does not invalidate readers.
     */
    get(
      id: string,
      pixels: Uint8Array,
      scale: number,
      version: TileData = pixels,
      beforeInvalidate?: (source: TgpuTexture) => void,
      /** `r8unorm` takes `pixels` as one byte per pixel, a mask's coverage. */
      format: DisplayFormat = 'rgba8unorm'
    ) {
      const level = Math.max(0, Math.min(8, Math.floor(-Math.log2(scale))));
      let entry = find(id, version, scale, beforeInvalidate);
      if (entry) return entry;
      const required = entryBytes(level, format);
      while (bytes + required > DISPLAY_BYTES && entries.size) {
        const id = entries.keys().next().value!;
        beforeInvalidate?.(entries.get(id)!.texture);
        remove(id);
      }
      entry = createEntry(root, sampler, version, level, format);
      let upload = entry.texture;
      if (level > 0) {
        upload = scratch.get(format) ?? texture(root, 0, format);
        scratch.set(format, upload);
      }
      root.device.queue.writeTexture(
        { texture: root.unwrap(upload) },
        format === 'r8unorm' ? (pixels as Uint8Array<ArrayBuffer>) : unpackTile(pixels),
        { bytesPerRow: TILE_SIZE * bytesPerPixel[format] },
        [TILE_SIZE, TILE_SIZE]
      );
      if (level > 0) {
        if (generateMipmaps && format === 'rgba8unorm') generateMipmaps(upload, 0, 8);
        else upload.generateMipmaps();
        const encoder = root.device.createCommandEncoder();
        for (let mip = level; mip <= 8; mip++) {
          encoder.copyTextureToTexture(
            { texture: root.unwrap(upload), mipLevel: mip },
            { texture: root.unwrap(entry.texture), mipLevel: mip - level },
            [TILE_SIZE >> mip, TILE_SIZE >> mip]
          );
        }
        root.device.queue.submit([encoder.finish()]);
      }
      entries.set(id, entry);
      bytes += entry.bytes;
      return entry;
    },
    /** Invalidates an entry, submitting borrowed readers before destroying its texture when requested. */
    remove,
    /** Invalidates every entry whose id matches, for example all tiles of a deleted layer. Readers must be submitted. */
    removeWhere(matches: (id: string) => boolean) {
      for (const id of [...entries.keys()]) {
        if (matches(id)) {
          remove(id);
        }
      }
    },
    stats: () => ({
      tiles: entries.size,
      bytes: bytes + [...scratch.keys()].reduce((sum, format) => sum + entryBytes(0, format), 0)
    }),
    clear() {
      for (const id of entries.keys()) remove(id);
    },
    destroy() {
      for (const id of entries.keys()) remove(id);
      for (const texture of scratch.values()) texture.destroy();
      scratch.clear();
    }
  };
}

/** Formats of display-cache textures: RGBA8 pixels, or one channel of mask coverage. */
export type DisplayFormat = 'rgba8unorm' | 'r8unorm';

const bytesPerPixel: Record<DisplayFormat, number> = { rgba8unorm: 4, r8unorm: 1 };

/** Bytes of an entry reduced by `level`, with its mip chain. */
function entryBytes(level: number, format: DisplayFormat) {
  const side = TILE_SIZE >> level;
  return ((side * side * 4 - 1) / 3) * bytesPerPixel[format];
}

function createEntry(
  root: TgpuRoot,
  sampler: ReturnType<TgpuRoot['createSampler']>,
  version: TileData,
  level: number,
  format: DisplayFormat
) {
  const image = texture(root, level, format);
  const camera = root.createBuffer(viewLayout.entries.view.uniform).$usage('uniform');
  return {
    texture: image,
    camera,
    viewGroup: root.createBindGroup(viewLayout, { view: camera, image, sampler }),
    version,
    level,
    bytes: entryBytes(level, format),
    mipLevelReady: level === 0 ? 0 : 8 - level
  };
}

function texture(root: TgpuRoot, level: number, format: DisplayFormat) {
  return root
    .createTexture({ size: [TILE_SIZE >> level, TILE_SIZE >> level], format, mipLevelCount: 9 - level })
    .$usage('sampled', 'render');
}
const DISPLAY_BYTES = 96 * 1024 * 1024;
