import { type TgpuRoot, type TgpuTexture } from 'typegpu';
import { TILE_SIZE } from '../brush';
import { unpackTile, type TileData } from '../tilePixels';
import { viewLayout } from './shaders';
import type { createTileMipmaps } from './tileMipmaps';

/** Keeps committed display pixels independent of brush scratch residency, bounded to 96 MiB.
 * Reduced textures retain the mip levels required at the current screen scale. CPU snapshots stay full resolution.
 */
export function createDisplayCache(
  root: TgpuRoot,
  sampler: ReturnType<TgpuRoot['createSampler']>,
  generateMipmaps?: ReturnType<typeof createTileMipmaps>
) {
  const entries = new Map<string, ReturnType<typeof createEntry>>();
  let bytes = 0;
  let scratch: ReturnType<typeof texture> | undefined;
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
      beforeInvalidate?: (source: TgpuTexture) => void
    ) {
      const level = Math.max(0, Math.min(8, Math.floor(-Math.log2(scale))));
      let entry = find(id, version, scale, beforeInvalidate);
      if (entry) return entry;
      const side = TILE_SIZE >> level;
      const required = ((side * side * 4 - 1) / 3) * 4;
      while (bytes + required > DISPLAY_BYTES && entries.size) {
        const id = entries.keys().next().value!;
        beforeInvalidate?.(entries.get(id)!.texture);
        remove(id);
      }
      entry = createEntry(root, sampler, version, level);
      const upload = level === 0 ? entry.texture : (scratch ??= texture(root, 0));
      root.device.queue.writeTexture(
        { texture: root.unwrap(upload) },
        unpackTile(pixels),
        { bytesPerRow: TILE_SIZE * 4 },
        [TILE_SIZE, TILE_SIZE]
      );
      if (level > 0) {
        if (generateMipmaps) generateMipmaps(upload, 0, 8);
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
    stats: () => ({ tiles: entries.size, bytes: bytes + (scratch ? 349524 : 0) }),
    clear() {
      for (const id of entries.keys()) remove(id);
    },
    destroy() {
      for (const id of entries.keys()) remove(id);
      scratch?.destroy();
      scratch = undefined;
    }
  };
}

function createEntry(root: TgpuRoot, sampler: ReturnType<TgpuRoot['createSampler']>, version: TileData, level: number) {
  const image = texture(root, level);
  const camera = root.createBuffer(viewLayout.entries.view.uniform).$usage('uniform');
  const side = TILE_SIZE >> level;
  return {
    texture: image,
    camera,
    viewGroup: root.createBindGroup(viewLayout, { view: camera, image, sampler }),
    version,
    level,
    bytes: ((side * side * 4 - 1) / 3) * 4,
    mipLevelReady: level === 0 ? 0 : 8 - level
  };
}

function texture(root: TgpuRoot, level: number) {
  return root
    .createTexture({ size: [TILE_SIZE >> level, TILE_SIZE >> level], format: 'rgba8unorm', mipLevelCount: 9 - level })
    .$usage('sampled', 'render');
}
const DISPLAY_BYTES = 96 * 1024 * 1024;
