import { decodePreviewResources, type PreviewResourceSource } from '@app-game/abr-brush/resources';

/** Shares decoded pattern/dual images across targets and settings edits, within a bounded worker lifetime. */
export function createPreviewResourceCache(maxBytes = 48 * 1024 * 1024) {
  const entries = new Map<string, { value: ReturnType<typeof decodePreviewResources>; bytes: number }>();
  let bytes = 0;
  return {
    /** Borrows immutable decoded images; hits accept new transport identities with identical bytes. */
    read(source: PreviewResourceSource) {
      const key = JSON.stringify(source, (_key, value) =>
        value instanceof Uint8Array ? previewBytesKey(value) : value
      );
      const hit = entries.get(key);
      if (hit) {
        entries.delete(key);
        entries.set(key, hit);
        return hit.value;
      }

      const value = decodePreviewResources(source);
      const size = (value.pattern?.data.byteLength ?? 0) + (value.dualTip?.data.byteLength ?? 0);
      if (size <= maxBytes) {
        for (const [key, old] of entries) {
          if (bytes + size <= maxBytes && entries.size < 64) {
            break;
          }
          entries.delete(key);
          bytes -= old.bytes;
        }
        entries.set(key, { value, bytes: size });
        bytes += size;
      }
      return value;
    },
    /** Releases every decoded image at worker teardown. */
    clear() {
      entries.clear();
      bytes = 0;
    }
  };
}

/** Two independent 32-bit lanes identify immutable resource content across structured clones. */
export function previewBytesKey(bytes: Uint8Array) {
  let a = 2166136261;
  let b = 0x9747b28c;
  for (const byte of bytes) {
    a = Math.imul(a ^ byte, 16777619);
    b = Math.imul(b ^ byte, 0x5bd1e995);
    b ^= b >>> 15;
  }
  return `${bytes.length}:${a >>> 0}:${b >>> 0}`;
}
