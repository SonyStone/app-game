import { type TgpuRoot } from 'typegpu';
import { TILE_SIZE } from '../brush';
import { viewLayout } from './shaders';

/** Keeps committed display pixels independent of brush scratch residency, bounded to 96 MiB.
 * Reduced textures retain the mip levels required at the current screen scale. CPU snapshots stay full resolution.
 */
export function createDisplayCache(root: TgpuRoot, sampler: ReturnType<TgpuRoot['createSampler']>) {
  const entries = new Map<string, ReturnType<typeof createEntry>>();
  let bytes = 0;
  let scratch: ReturnType<typeof texture> | undefined;
  const remove = (id: string) => {
    const entry = entries.get(id);
    if (!entry) return;
    bytes -= entry.bytes;
    entry.texture.destroy();
    entry.camera.destroy();
    entries.delete(id);
  };
  return {
    /** Reuses immutable snapshots; zooming in replaces a coarse entry before drawing it. */
    get(id: string, pixels: Uint8Array, scale: number) {
      const level = Math.max(0, Math.min(8, Math.floor(-Math.log2(scale))));
      let entry = entries.get(id);
      if (entry && (entry.pixels !== pixels || entry.level > level)) {
        remove(id);
        entry = undefined;
      }
      if (entry) {
        entries.delete(id);
        entries.set(id, entry);
        return entry;
      }
      const side = TILE_SIZE >> level;
      const required = ((side * side * 4 - 1) / 3) * 4;
      while (bytes + required > DISPLAY_BYTES && entries.size) remove(entries.keys().next().value!);
      entry = createEntry(root, sampler, pixels, level);
      const upload = level === 0 ? entry.texture : (scratch ??= texture(root, 0));
      root.device.queue.writeTexture(
        { texture: root.unwrap(upload) },
        pixels as Uint8Array<ArrayBuffer>,
        { bytesPerRow: TILE_SIZE * 4 },
        [TILE_SIZE, TILE_SIZE]
      );
      upload.generateMipmaps();
      if (level > 0) {
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

function createEntry(
  root: TgpuRoot,
  sampler: ReturnType<TgpuRoot['createSampler']>,
  pixels: Uint8Array,
  level: number
) {
  const image = texture(root, level);
  const camera = root.createBuffer(viewLayout.entries.view.uniform).$usage('uniform');
  const side = TILE_SIZE >> level;
  return {
    texture: image,
    camera,
    viewGroup: root.createBindGroup(viewLayout, { view: camera, image, sampler }),
    pixels,
    level,
    bytes: ((side * side * 4 - 1) / 3) * 4,
    mipmapsDirty: false
  };
}

function texture(root: TgpuRoot, level: number) {
  return root
    .createTexture({ size: [TILE_SIZE >> level, TILE_SIZE >> level], format: 'rgba8unorm', mipLevelCount: 9 - level })
    .$usage('sampled', 'render');
}
const DISPLAY_BYTES = 96 * 1024 * 1024;
