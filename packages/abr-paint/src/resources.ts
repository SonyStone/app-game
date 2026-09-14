/** Decoded brush coverage, one byte per pixel: 0 is transparent, 255 is fully covered.
 * Use a content/version-specific ID. Color patterns need a separate format; ABR decoding happens before upload.
 */
export type BrushResource = {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly format: 'r8unorm';
  /** Borrowed by engines for the stroke lifetime. Do not mutate or transfer this buffer. */
  readonly pixels: Uint8Array;
};

/** Bounds decoded CPU memory. Upload copies bytes once; strokes borrow and pin them without copying.
 * Idle entries are evicted in LRU order. A failed upload never evicts existing resources.
 * The runtime owns this cache, including across document imports and renderer recovery.
 */
export function createBrushResources({ maxBytes = 64 * 1024 * 1024, maxEntries = 4096 } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || !Number.isSafeInteger(maxEntries) || maxEntries <= 0)
    throw new Error('Brush resource limits must be positive safe integers.');
  const entries = new Map<string, { resource: BrushResource; pins: number }>();
  let bytes = 0;
  let disposed = false;
  const ensureOpen = () => {
    if (disposed) throw new Error('Brush resource cache is disposed.');
  };
  const remove = (id: string) => {
    const entry = entries.get(id);
    if (!entry) return;
    bytes -= entry.resource.pixels.byteLength;
    entries.delete(id);
  };
  return {
    /** Accepts only decoded coverage. Throws on invalid data, duplicate IDs or insufficient unpinned space.
     * Returns evicted IDs so the sender can invalidate its residency bookkeeping.
     */
    put(input: BrushResource) {
      ensureOpen();
      validateResource(input);
      if (entries.has(input.id)) throw new Error(`Brush resource "${input.id}" already exists. Use a new version ID.`);
      const size = input.pixels.byteLength;
      let requiredBytes = bytes + size - maxBytes;
      let requiredEntries = entries.size + 1 - maxEntries;
      const evicted: string[] = [];
      for (const [id, entry] of entries) {
        if (requiredBytes <= 0 && requiredEntries <= 0) break;
        if (entry.pins) continue;
        evicted.push(id);
        requiredBytes -= entry.resource.pixels.byteLength;
        requiredEntries--;
      }
      if (requiredBytes > 0 || requiredEntries > 0)
        throw new Error('Brush resource cache is full. Active stroke resources cannot be evicted.');
      // Allocate before mutating the cache, so allocation failure also preserves existing entries.
      const resource: BrushResource = Object.freeze({
        id: input.id,
        width: input.width,
        height: input.height,
        format: input.format,
        pixels: new Uint8Array(input.pixels)
      });
      for (const id of evicted) remove(id);
      entries.set(resource.id, { resource, pins: 0 });
      bytes += size;
      return evicted;
    },
    /** Removes an idle resource. An active stroke keeps ownership until finish or cancel. */
    delete(id: string) {
      ensureOpen();
      if (entries.get(id)?.pins) throw new Error(`Brush resource "${id}" is in use by a stroke.`);
      remove(id);
    },
    /** Pins resources lazily for one stroke. Repeated get calls borrow the same pixels. */
    open() {
      ensureOpen();
      const held = new Map<string, NonNullable<ReturnType<typeof entries.get>>>();
      let released = false;
      return {
        /** Throws on a cache miss before an engine should create any GPU stroke state. */
        get(id: string): BrushResource {
          ensureOpen();
          if (released) throw new Error('Brush resource scope is released.');
          const entry = entries.get(id);
          if (!entry) throw new Error(`Brush resource "${id}" is not loaded. Upload it before starting the stroke.`);
          if (!held.has(id)) {
            entry.pins++;
            held.set(id, entry);
          }
          entries.delete(id);
          entries.set(id, entry);
          return entry.resource;
        },
        /** Idempotent; called by the runtime on success, cancellation and failures. */
        release() {
          if (released) return;
          released = true;
          for (const entry of held.values()) entry.pins--;
          held.clear();
        }
      };
    },
    /** Includes pinned entries in bytes; metadata and transport copies are outside this budget. */
    stats() {
      let pinnedBytes = 0;
      for (const { resource, pins } of entries.values()) if (pins) pinnedBytes += resource.pixels.byteLength;
      return { bytes, entries: entries.size, pinnedBytes };
    },
    /** Call after cancelling the active stroke. Subsequent uploads/reads fail explicitly. */
    dispose() {
      disposed = true;
      entries.clear();
      bytes = 0;
    }
  };
}

/** One cache per mounted runtime. Factories must not return a cache shared with another runtime. */
export type BrushResourcesFactory = () => ReturnType<typeof createBrushResources>;
/** Engines borrow decoded textures; only the runtime can release their scope. */
export type BrushResourceReader = Pick<ReturnType<ReturnType<typeof createBrushResources>['open']>, 'get'>;

function validateResource(input: BrushResource) {
  if (!input || typeof input.id !== 'string' || !input.id.trim() || input.id.length > 512)
    throw new Error('Brush resources need an ID of 1–512 characters.');
  if (input.format !== 'r8unorm') throw new Error('Unsupported brush resource format.');
  if (![input.width, input.height].every((n) => Number.isInteger(n) && n > 0 && n <= 16384))
    throw new Error('Brush resource dimensions must be integers from 1 to 16384.');
  if (!(input.pixels instanceof Uint8Array) || input.pixels.byteLength !== input.width * input.height)
    throw new Error('Brush resource pixels must contain exactly width × height coverage bytes.');
}
