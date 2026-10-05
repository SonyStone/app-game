import type { TgpuRoot } from 'typegpu';
import type { BrushResource } from '../resources';

/** Device-owned LRU of mipmapped r8unorm coverage textures keyed by BrushResource.id.
 * IDs are content/version-specific, so a new wrapper object for the same ID reuses the upload.
 * A size mismatch under a reused ID is treated as a miss and replaces the stale texture.
 */
export function createAbrTextureCache(root: TgpuRoot, { budget = abrBrushBudget, maxEntries = 256 } = {}) {
  const entries = new Map<string, CoverageTexture>();
  let uploads = 0;

  return {
    /** Throws, without changing the cache, when resources cannot fit the device or the budget
     * alongside reservedBytes of other preset sources.
     */
    validate(required: readonly BrushResource[], reservedBytes: number) {
      const limit = root.device.limits.maxTextureDimension2D;
      for (const resource of required) {
        if (resource.width > limit || resource.height > limit) {
          throw new Error('ABR resource exceeds this device’s texture size.');
        }
      }

      if (required.reduce((sum, resource) => sum + mipmappedBytes(resource), reservedBytes) > budget) {
        throw new Error('ABR mipmaps exceed the 64 MiB GPU brush budget.');
      }
    },
    /** Evicts least-recently used unrelated textures until required resources fit, then uploads misses.
     * Returns textures in the order of required. On an upload failure every cached texture is destroyed,
     * leaving an empty but usable cache, and the error is rethrown.
     */
    acquire(required: readonly BrushResource[], reservedBytes: number) {
      const keep = new Set(required.map((resource) => resource.id));
      const missing = required.filter((resource, index) =>
        !isCached(resource) && required.findIndex((other) => other.id === resource.id) === index);
      const additional = missing.reduce((sum, resource) => sum + mipmappedBytes(resource), reservedBytes);

      for (const [id, texture] of entries) {
        if (cachedBytes() + additional <= budget && entries.size + missing.length <= maxEntries) {
          break;
        }

        if (keep.has(id) && isCached(required.find((resource) => resource.id === id)!)) {
          continue;
        }

        texture.destroy();
        entries.delete(id);
      }

      try {
        return required.map(upload);
      } catch (error) {
        destroyAll();
        throw error;
      }
    },
    /** Number of resident textures. */
    get size() {
      return entries.size;
    },
    /** Total uploads since creation; cache hits do not count. */
    get uploads() {
      return uploads;
    },
    /** Estimated resident bytes, including mip levels. */
    bytes: cachedBytes,
    destroy: destroyAll
  };

  function destroyAll() {
    for (const texture of entries.values()) {
      texture.destroy();
    }

    entries.clear();
  }

  function isCached(resource: BrushResource) {
    const texture = entries.get(resource.id);
    return !!texture && texture.props.size[0] === resource.width && texture.props.size[1] === resource.height;
  }

  function cachedBytes() {
    let sum = 0;
    for (const texture of entries.values()) {
      sum += (texture.props.size[0] * texture.props.size[1] * 4) / 3;
    }

    return sum;
  }

  function upload(resource: BrushResource) {
    const cached = entries.get(resource.id);
    if (cached && isCached(resource)) {
      entries.delete(resource.id);
      entries.set(resource.id, cached);
      return cached;
    }

    cached?.destroy();
    entries.delete(resource.id);
    const texture = createCoverageTexture(root, resource.width, resource.height);
    entries.set(resource.id, texture);
    uploads++;
    root.device.queue.writeTexture(
      { texture: root.unwrap(texture) },
      resource.pixels,
      { bytesPerRow: resource.width },
      [resource.width, resource.height]
    );
    texture.generateMipmaps();
    return texture;
  }
}

/** Mipmapped coverage texture owned by the cache. */
export type CoverageTexture = ReturnType<typeof createCoverageTexture>;

function createCoverageTexture(root: TgpuRoot, width: number, height: number) {
  const mipLevelCount = Math.floor(Math.log2(Math.max(width, height))) + 1;
  return root.createTexture({ size: [width, height], format: 'r8unorm', mipLevelCount }).$usage('sampled', 'render');
}

/** Shared GPU byte budget for one preset's textures and prepared tip/pattern sources. */
export const abrBrushBudget = 64 * 1024 * 1024;

/** Estimated bytes of a full mip chain for one r8unorm resource. */
export function mipmappedBytes(resource: Pick<BrushResource, 'width' | 'height'>) {
  return (resource.width * resource.height * 4) / 3;
}
