/** Separates immutable ABR byte arrays from tree metadata. Binary records are written in
 * 8 MiB chunks, below Chromium's per-value limit, and reused across settings-only saves.
 */
export function packBrushData(value: unknown) {
  const seen = new Map<object, unknown>();
  const buffers = new Map<string, Uint8Array>();
  function visit(value: unknown): unknown {
    if (!value || typeof value !== 'object') return value;
    if (value instanceof Uint8Array) {
      let id = identities.get(value);
      if (!id) { id = crypto.randomUUID(); identities.set(value, id); }
      buffers.set(id, value);
      return { abrBytes: id, length: value.byteLength };
    }
    const existing = seen.get(value);
    if (existing) return existing;
    const result: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : {};
    seen.set(value, result);
    for (const [key, child] of Object.entries(value)) Object.assign(result, { [key]: visit(child) });
    return result;
  }
  return { value: visit(value), buffers };
}

/** Rehydrates shared typed arrays once and retains their identities for subsequent saves. */
export async function unpackBrushData(value: unknown, read: (id: string, length: number) => Promise<Uint8Array>): Promise<unknown> {
  const seen = new Map<object, unknown>();
  const buffers = new Map<string, Uint8Array>();
  async function visit(value: unknown): Promise<unknown> {
    if (!value || typeof value !== 'object') return value;
    if ('abrBytes' in value && typeof value.abrBytes === 'string' && 'length' in value && typeof value.length === 'number') {
      let bytes = buffers.get(value.abrBytes);
      if (!bytes) {
        bytes = await read(value.abrBytes, value.length);
        buffers.set(value.abrBytes, bytes);
        identities.set(bytes, value.abrBytes);
      }
      return bytes;
    }
    const existing = seen.get(value);
    if (existing) return existing;
    const result: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : {};
    seen.set(value, result);
    // Sequential reads bound temporary allocations while restoring a large pack.
    for (const [key, child] of Object.entries(value)) Object.assign(result, { [key]: await visit(child) });
    return result;
  }
  return visit(value);
}
const identities = new WeakMap<Uint8Array, string>();
