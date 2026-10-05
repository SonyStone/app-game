import type { BrushResource } from '@app-game/abr-paint/resources';
import { err, ok, type Result } from 'neverthrow';
import { createImmediateSignal } from '../../shared/createImmediateSignal';
import { brushError, type PaintError } from '../../shared/errors';
import { builtInPresets, type BrushPreset } from './brushPresets';
import type { BrushStorage, StoredPreset } from './createBrushStorage';

/**
 * The brush library: built-in presets followed by the user's presets in creation order. Stored presets load lazily:
 * `load` reads one preset, `loadAll` the list, and neither reads images. `resources` reads a preset's images when it
 * is used, keeping recently used images in memory within `imageBudget`. Changes apply at once and are written to
 * `storage` in the background; images not yet written stay in memory regardless of the budget.
 *
 * The library knows nothing about brush engines: a preset's engine settings and images are opaque here.
 * Must be created within a Solid owner.
 */
export function createBrushLibrary(options: {
  /** Persists user presets; omitted, presets last until the page closes. */
  storage?: Pick<BrushStorage, 'readPreset' | 'readPresets' | 'readResources' | 'putPreset' | 'deletePreset'>;
  /** Bytes of stored images kept in memory after use. Default 64 MiB. */
  imageBudget?: number;
}) {
  // Several commands in one event, such as import and select, must see each other's presets.
  const [known, setKnown, latestKnown] = createImmediateSignal<ReadonlyMap<string, StoredPreset>>(new Map());
  /** Presets deleted in this session, so that late reads do not bring them back. */
  const removed = new Set<string>();
  const images = createImageCache(options.imageBudget ?? 64 * 1024 * 1024);
  let listing: Promise<void> | undefined;

  return {
    /** Built-in presets, then the user's presets loaded so far, in creation order; see `loadAll`. */
    presets(): BrushPreset[] {
      const user = [...known().values()].sort((left, right) => left.created - right.created);
      return [...builtInPresets, ...user.map(withoutCreated)];
    },
    find,
    /** Loads one preset without its images; `undefined` when it does not exist or was deleted. */
    async load(id: string): Promise<BrushPreset | undefined> {
      const found = find(id);
      if (found || removed.has(id) || !options.storage) {
        return found;
      }

      const stored = await options.storage.readPreset(id);
      if (stored && !removed.has(id) && !latestKnown().has(id)) {
        remember(stored);
      }

      return find(id);
    },
    loadAll,
    /**
     * The images of `preset`, from memory or storage. Fails with a `storage` error when an image is missing, for
     * example after the browser cleared site data.
     */
    async resources(preset: BrushPreset): Promise<Result<BrushResource[], PaintError>> {
      const missing = preset.resourceIds.filter((id) => !images.has(id));
      const stored = missing.length > 0 ? await options.storage?.readResources(missing) : [];
      stored?.forEach((resource) => images.put(resource, true));
      const resources = preset.resourceIds.flatMap((id) => images.get(id) ?? []);
      images.trim();
      return resources.length === preset.resourceIds.length
        ? ok(resources)
        : err(brushError('storage', `The images of “${preset.name}” are missing. Import the brush again.`));
    },
    add,
    /**
     * Adds an imported preset with its images, replacing the earlier import of the same `source` in place, so that
     * importing an edited brush again does not duplicate it. Reads the preset list to find that import.
     */
    async importPreset(
      preset: Omit<BrushPreset, 'id' | 'builtIn' | 'resourceIds'> & { source: string },
      resources: readonly BrushResource[]
    ): Promise<BrushPreset> {
      await loadAll();
      const resourceIds = resources.map(({ id }) => id);
      const existing = [...latestKnown().values()].find((candidate) => candidate.source === preset.source);
      if (!existing) {
        return add({ ...preset, resourceIds }, resources);
      }

      const replaced = { ...preset, resourceIds, id: existing.id, created: existing.created };
      store(replaced, resources);
      return withoutCreated(replaced);
    },
    /** Renames a loaded user preset or replaces its settings; built-in presets and unknown ids are ignored. */
    update(id: string, patch: Partial<Pick<BrushPreset, 'name' | 'settings'>>) {
      const existing = latestKnown().get(id);
      if (existing) {
        store({ ...existing, ...patch });
      }
    },
    /** Deletes a user preset; built-in presets are ignored. Its images are deleted when no other preset uses them. */
    remove(id: string) {
      if (builtInPresets.some((preset) => preset.id === id)) {
        return;
      }

      removed.add(id);
      options.storage?.deletePreset(id);
      const existing = latestKnown().get(id);
      if (existing) {
        images.release(existing.resourceIds);
        const next = new Map(latestKnown());
        next.delete(id);
        setKnown(next);
      }
    }
  };

  /** A built-in or loaded preset, including presets added earlier in the current event. */
  function find(id: string): BrushPreset | undefined {
    const preset = builtInPresets.find((candidate) => candidate.id === id) ?? latestKnown().get(id);
    return preset && withoutCreated(preset);
  }

  /**
   * Adds a user preset and returns it with its new id. `resources` are new images among `preset.resourceIds`; images
   * of other presets are referenced by id only.
   */
  function add(preset: Omit<BrushPreset, 'id' | 'builtIn'>, resources: readonly BrushResource[] = []): BrushPreset {
    const latest = Math.max(0, ...[...latestKnown().values()].map(({ created }) => created));
    // Strictly increasing, so presets created within one millisecond keep their order.
    const added = { ...preset, id: crypto.randomUUID(), created: Math.max(Date.now(), latest + 1) };
    store(added, resources);
    return withoutCreated(added);
  }

  /** Reads every stored preset, without images, once; later calls share the first read. */
  function loadAll(): Promise<void> {
    listing ??= (async () => {
      for (const preset of (await options.storage?.readPresets()) ?? []) {
        if (!removed.has(preset.id) && !latestKnown().has(preset.id)) {
          remember(preset);
        }
      }
    })();
    return listing;
  }

  function remember(preset: StoredPreset) {
    setKnown(new Map(latestKnown()).set(preset.id, preset));
  }

  /** Remembers a preset and writes it with its new images, which stay in memory until the write commits. */
  function store(preset: StoredPreset, resources: readonly BrushResource[] = []) {
    remember(preset);
    resources.forEach((resource) => images.put(resource, false));
    void options.storage?.putPreset(preset, resources).then((written) => {
      if (written) {
        images.release(resources.map(({ id }) => id));
      }
    });
  }
}

/** The brush library of one editor; see {@link createBrushLibrary}. */
export type BrushLibrary = ReturnType<typeof createBrushLibrary>;

function withoutCreated(preset: BrushPreset & { created?: number }): BrushPreset {
  const copy = { ...preset };
  delete copy.created;
  return copy;
}

/**
 * Images in least-recently-used order. Evictable images are stored and can be read again; the others stay until
 * `release` marks them evictable.
 */
function createImageCache(budget: number) {
  const entries = new Map<string, { resource: BrushResource; evictable: boolean }>();

  return { has: (id: string) => entries.has(id), get, put, release, trim };

  /** The image with `id`, marking it as the most recently used. */
  function get(id: string): BrushResource | undefined {
    const entry = entries.get(id);
    if (entry) {
      entries.delete(id);
      entries.set(id, entry);
    }

    return entry?.resource;
  }

  /** Adds an image as the most recently used; an image waiting to be written stays unevictable. */
  function put(resource: BrushResource, evictable: boolean) {
    const waiting = entries.get(resource.id)?.evictable === false;
    entries.delete(resource.id);
    entries.set(resource.id, { resource, evictable: evictable && !waiting });
  }

  /** Marks images as stored, so that `trim` may evict them. */
  function release(ids: readonly string[]) {
    for (const id of ids) {
      const entry = entries.get(id);
      if (entry) {
        entry.evictable = true;
      }
    }

    trim();
  }

  /** Evicts the least recently used stored images beyond the budget. */
  function trim() {
    let bytes = 0;
    for (const { resource } of entries.values()) {
      bytes += resource.pixels.byteLength;
    }

    for (const [id, entry] of entries) {
      if (bytes <= budget) {
        return;
      }

      if (entry.evictable) {
        entries.delete(id);
        bytes -= entry.resource.pixels.byteLength;
      }
    }
  }
}
