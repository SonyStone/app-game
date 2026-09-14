import type { BrushTipImage } from '../../lib/abr';
import type { PreviewResourceSource } from './resources';
import type { PreviewInput } from './stroke';

/** Reuse the current raster until layout changes by more than 50%. CSS handles intermediate sizes. */
export function thumbnailSize(width: number, previous = 0) {
  if (previous && width >= previous / 1.5 && width <= previous * 1.5) return previous;
  return Math.max(128, Math.min(2048, 2 ** Math.round(Math.log2(width))));
}

/** Content-addressed keys survive reloads, while edits and resource replacements invalidate previews. */
export async function thumbnailKey(input: PreviewInput, tip?: BrushTipImage, resources: PreviewResourceSource = {}) {
  const parts = await Promise.all([tip?.data, resources.pattern?.data, resources.dualSample?.data].map(hashBytes));
  return hashBytes(new TextEncoder().encode(JSON.stringify([
    { ...input, values: { ...input.values, name: '' } }, parts,
    tip && [tip.width, tip.height, tip.depth],
    resources.pattern && [resources.pattern.width, resources.pattern.height, resources.pattern.mode],
    resources.dualSample?.subVersion, resources.dualHardness, resources.missing
  ])));
}

/** Cached PNGs own no GPU resources. Storage failure only disables persistence, never drawing. */
export async function readThumbnail(key: string): Promise<Blob | undefined> {
  const hit = memory.get(key);
  if (hit) {
    memory.delete(key);
    memory.set(key, hit);
    return hit;
  }
  try {
    const cache = await openCache();
    const response = await cache?.match(cacheUrl(key));
    if (!response) return;
    const blob = await response.blob();
    remember(key, blob);
    return blob;
  } catch (error) { warn(error); }
}

/** Encode a copy before the presentation canvas consumes the transferred bitmap. */
export function storeThumbnail(key: string, bitmap: ImageBitmap) {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  void canvas.convertToBlob({ type: 'image/png' }).then(async blob => {
    remember(key, blob);
    const cache = await openCache();
    if (!cache) return;
    await cache.put(cacheUrl(key), new Response(blob));
    const keys = await cache.keys();
    // Thumbnails are disposable, unlike the user's brush library.
    await Promise.all(keys.slice(0, Math.max(0, keys.length - 512)).map(request => cache.delete(request)));
  }).catch(warn);
}

function remember(key: string, blob: Blob) {
  memory.delete(key);
  memory.set(key, blob);
  let bytes = [...memory.values()].reduce((sum, value) => sum + value.size, 0);
  for (const [oldKey, old] of memory) {
    if (bytes <= 16 * 1024 * 1024) break;
    memory.delete(oldKey);
    bytes -= old.size;
  }
}

function hashBytes(bytes?: Uint8Array): Promise<string> {
  if (!bytes) return Promise.resolve('none');
  let result = hashes.get(bytes);
  if (!result) {
    result = crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>).then(buffer =>
      Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join(''));
    hashes.set(bytes, result);
  }
  return result;
}
function openCache() { return typeof caches === 'undefined' ? undefined : caches.open('abr-thumbnails-v1'); }
function cacheUrl(key: string) { return new URL(`/__abr_thumbnail__/${key}`, location.origin).href; }
function warn(error: unknown) {
  if (!warned) console.warn('Brush thumbnail cache unavailable:', error);
  warned = true;
}
const memory = new Map<string, Blob>();
const hashes = new WeakMap<Uint8Array, Promise<string>>();
let warned = false;
