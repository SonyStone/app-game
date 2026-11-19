import type { BrushResource } from '@app-game/abr-paint/resources';
import { err, ok, type Result } from 'neverthrow';
import { createImmediateSignal } from '../../shared/createImmediateSignal';
import { brushError, type PaintError } from '../../shared/errors';
import { syncAbrPreset } from './abrHost';
import { builtInPresets, type BrushPreset } from './brushPresets';
import type { BrushStorage, StoredPreset } from './createBrushStorage';
import { readRoundPreset } from './nativeDocument';

/**
 * The brush library: built-in presets followed by the user's presets in creation order. Stored presets load lazily:
 * `load` reads one preset, `loadAll` the list, and neither reads images. `resources` reads a preset's images when it
 * is used, keeping recently used images in memory within `imageBudget`. Changes apply at once and are written to
 * `storage` in the background; images not yet written stay in memory regardless of the budget.
 *
 * Loading a legacy preset converts it once before publishing it. Sampled presets read their coverage during conversion.
 * A failed conversion keeps the original settings and images.
 * Must be created within a Solid owner.
 */
export function createBrushLibrary(options: {
  /** Persists user presets; omitted, presets last until the page closes. */
  storage?: Pick<BrushStorage, 'readPreset' | 'readPresets' | 'readResources' | 'putPreset' | 'deletePreset'> &
    Partial<Pick<BrushStorage, 'putPresets'>>;
  /** Bytes of stored images kept in memory after use. Default 64 MiB. */
  imageBudget?: number;
  onError?: (error: PaintError) => void;
}) {
  // Several commands in one event, such as import and select, must see each other's presets.
  const [known, setKnown, latestKnown] = createImmediateSignal<ReadonlyMap<string, StoredPreset>>(new Map());
  /** Presets deleted in this session, so that late reads do not bring them back. */
  const removed = new Set<string>();
  const images = createImageCache(options.imageBudget ?? 64 * 1024 * 1024);
  // Retain legacy image references when a migrated preset is subsequently renamed or saved.
  const sampledOriginals = new Map<string, Pick<BrushPreset, 'settings' | 'resourceIds'>>();
  const migrations = new Map<string, Promise<void>>();
  let importQueue: Promise<unknown> = Promise.resolve();
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
        await loadStored(stored);
      }

      return find(id);
    },
    loadAll,
    /**
     * The images of `preset`, from memory or storage. Fails with a `storage` error when an image is missing, for
     * example after the browser cleared site data.
     */
    resources,
    /** All coverage referenced by the editable document, including disabled sampler roles. */
    assets: (preset: BrushPreset) => resources(preset, preset.assetIds ?? []),
    add,
    /** Publishes a complete validated batch only after its IndexedDB transaction commits. */
    async addImported(batch: readonly { preset: BrushPreset; resources: readonly BrushResource[] }[]) {
      await loadAll();
      const presets: StoredPreset[] = [];
      const ids = new Set(latestKnown().keys());
      const resources = new Map<string, BrushResource>();
      let created = Math.max(Date.now(), ...[...latestKnown().values()].map((p) => p.created + 1));
      for (const item of batch) {
        const input = item.preset;
        const copy = input.id.startsWith('builtin:') || ids.has(input.id) || Object.hasOwn(Object.prototype, input.id);
        const preset = preparePreset({
          ...input,
          id: copy ? crypto.randomUUID() : input.id,
          derivedFrom: copy ? input.id : input.derivedFrom,
          created: created++
        });
        presets.push(preset);
        ids.add(preset.id);
        for (const image of item.resources) {
          resources.set(image.id, image);
        }
      }
      if (options.storage && !(await options.storage.putPresets?.(presets, [...resources.values()]))) {
        throw new Error('Imported brushes could not be saved');
      }
      for (const image of resources.values()) {
        images.put(image, !!options.storage);
      }
      images.trim();
      const next = new Map(latestKnown());
      for (const preset of presets) {
        removed.delete(preset.id);
        next.set(preset.id, preset);
      }
      setKnown(next);
    },
    /**
     * Adds an imported preset with its images, replacing the earlier import of the same `source` in place, so that
     * importing an edited brush again does not duplicate it. Reads the preset list to find that import.
     */
    async importPreset(
      preset: Omit<BrushPreset, 'id' | 'builtIn' | 'resourceIds'> & { source: string; resourceIds?: readonly string[] },
      resources: readonly BrushResource[]
    ): Promise<BrushPreset> {
      // A second conversion of the same source must see the first committed entry.
      const pending = importQueue.then(importOne);
      importQueue = pending.catch(() => undefined);
      return pending;

      async function importOne() {
        await loadAll();
        const resourceIds = preset.resourceIds ?? resources.map(({ id }) => id);
        const existing = [...latestKnown().values()].find((candidate) => candidate.source === preset.source);
        const imported = preparePreset({
          ...preset,
          resourceIds,
          id: existing?.id ?? crypto.randomUUID(),
          created: existing?.created ?? Math.max(Date.now(), ...[...latestKnown().values()].map((p) => p.created + 1))
        });
        if (!preset.abrDocument) {
          store(imported, resources);
          return withoutCreated(imported);
        }
        if (options.storage && !(await options.storage.putPreset(imported, resources))) {
          throw new Error('Imported brush could not be saved');
        }
        for (const image of resources) {
          images.put(image, !!options.storage);
        }
        images.trim();
        sampledOriginals.delete(imported.id);
        if (!removed.has(imported.id)) {
          remember(imported);
        }
        return withoutCreated(imported);
      }
    },
    /** Renames a loaded user preset or replaces its settings; built-in presets and unknown ids are ignored. */
    update(
      id: string,
      patch: Partial<Pick<BrushPreset, 'name' | 'settings' | 'abrDocument' | 'resourceIds'>>,
      resources: readonly BrushResource[] = []
    ) {
      const existing = latestKnown().get(id);
      if (existing) {
        store(preparePreset({ ...existing, ...patch }, !!patch.settings), resources);
      }
    },
    /** Deletes a user preset; built-in presets are ignored. Its images are deleted when no other preset uses them. */
    remove(id: string) {
      if (builtInPresets.some((preset) => preset.id === id)) {
        return;
      }

      removed.add(id);
      sampledOriginals.delete(id);
      options.storage?.deletePreset(id);
      const existing = latestKnown().get(id);
      if (existing) {
        const next = new Map(latestKnown());
        next.delete(id);
        if (!options.storage) {
          const used = new Set([...next.values()].flatMap((p) => [...p.resourceIds, ...(p.assetIds ?? [])]));
          for (const key of [...existing.resourceIds, ...(existing.assetIds ?? [])]) {
            if (!used.has(key)) {
              images.forget(key);
            }
          }
        }
        setKnown(next);
      }
    }
  };

  async function resources(
    preset: BrushPreset,
    ids = preset.resourceIds
  ): Promise<Result<BrushResource[], PaintError>> {
    const missing = ids.filter((id) => !images.has(id));
    const stored = missing.length > 0 ? await options.storage?.readResources(missing) : [];
    stored?.forEach((resource) => images.put(resource, true));
    const resources = ids.flatMap((id) => images.get(id) ?? []);
    images.trim();
    return resources.length === ids.length
      ? ok(resources)
      : err(brushError('storage', `The images of “${preset.name}” are missing. Import the brush again.`));
  }

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
    const added = preparePreset(
      { ...preset, id: crypto.randomUUID(), created: Math.max(Date.now(), latest + 1) },
      true
    );
    store(added, resources);
    return withoutCreated(added);
  }

  /** Reads every stored preset, without images, once; later calls share the first read. */
  function loadAll(): Promise<void> {
    listing ??= (async () => {
      for (const preset of (await options.storage?.readPresets()) ?? []) {
        if (!removed.has(preset.id) && !latestKnown().has(preset.id)) {
          await loadStored(preset);
        }
      }
    })();
    return listing;
  }

  function preparePreset<T extends BrushPreset>(preset: T, saveHost = false): T {
    if (!isRound(preset)) {
      const next = syncAbrPreset(preset, saveHost);
      if (next.nativeDocument) {
        const copy = { ...next };
        delete copy.nativeDocument;
        return copy;
      }
      return next;
    }
    try {
      return readRoundPreset(preset);
    } catch (cause) {
      reportConversion(preset, cause);
      const fallback = { ...preset };
      delete fallback.nativeDocument;
      return fallback;
    }
  }

  function reportConversion(preset: BrushPreset, cause: unknown) {
    options.onError?.(brushError('invalid-preset', 'Could not convert “' + preset.name + '”: ' + String(cause), cause));
  }

  async function loadStored(record: StoredPreset) {
    if (record.sampledDocument) {
      remember(materializeSampled(record));
      return;
    }
    if (record.nativeDocument) {
      try {
        remember(readRoundPreset(record, record.nativeDocument));
      } catch (cause) {
        reportConversion(record, cause);
        const fallback = { ...record };
        delete fallback.nativeDocument;
        remember(fallback);
      }
      return;
    }
    if (!record.abrDocument && (record.abrSource || isRound(record) || record.settings.engine?.id === 'textured')) {
      const pending = migrations.get(record.id);
      if (pending) {
        return pending;
      }
      const converting = migrate(record);
      migrations.set(record.id, converting);
      try {
        await converting;
      } finally {
        migrations.delete(record.id);
      }
    } else {
      remember(record);
    }
  }

  async function migrate(record: StoredPreset) {
    try {
      let converted: StoredPreset;
      let resources: readonly BrushResource[] = [];
      if (record.abrSource) {
        const { convertAbr } = await import('./abrPresetDocument');
        const item = await convertAbr(record.abrSource, record.settings);
        resources = item.resources;
        converted = syncAbrPreset(
          {
            ...record,
            ...item.preset,
            name: record.name,
            settings: { ...record.settings, engine: item.preset.settings.engine }
          },
          true
        );
      } else if (record.settings.engine?.id === 'textured') {
        const { convertSampled } = await import('./abrPresetDocument');
        const images = await options.storage!.readResources(record.resourceIds);
        const item = await convertSampled(record, images ?? []);
        converted = { ...record, sampledDocument: item.preset };
        resources = item.resources;
      } else {
        converted = readRoundPreset(record);
      }
      if (removed.has(record.id) || latestKnown().has(record.id)) {
        return;
      }
      // Keep the original round settings in storage for older readers, even for sparse presets.
      const stored = converted.nativeDocument ? { ...converted, settings: record.settings } : converted;
      if (await options.storage!.putPreset(stored, resources, record)) {
        record = materializeSampled(converted);
      } else {
        const latest = await options.storage!.readPreset(record.id);
        if (!latest) {
          return;
        }
        record = materializeSampled(latest);
        if (!record.abrDocument && !record.nativeDocument) {
          throw new Error('Conversion could not be saved');
        }
      }
    } catch (cause) {
      reportConversion(record, cause);
    }
    if (!removed.has(record.id) && !latestKnown().has(record.id)) {
      remember(record);
    }
  }

  function materializeSampled(record: StoredPreset): StoredPreset {
    const { sampledDocument, ...original } = record;
    if (!sampledDocument) {
      return original;
    }
    sampledOriginals.set(record.id, { settings: record.settings, resourceIds: record.resourceIds });
    return { ...original, ...sampledDocument };
  }

  function remember(preset: StoredPreset) {
    setKnown(new Map(latestKnown()).set(preset.id, preset));
  }

  /** Remembers a preset and writes it with its new images, which stay in memory until the write commits. */
  function store(preset: StoredPreset, resources: readonly BrushResource[] = []) {
    remember(preset);
    resources.forEach((resource) => images.put(resource, false));
    const original = sampledOriginals.get(preset.id);
    const { abrDocument, settings, resourceIds, assetIds } = preset;
    const record =
      original && abrDocument
        ? {
            ...preset,
            ...original,
            abrDocument: undefined,
            sampledDocument: { abrDocument, settings, resourceIds, assetIds }
          }
        : preset;
    void options.storage?.putPreset(record, resources).then((written) => {
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

  return { forget: (id: string) => entries.delete(id), has: (id: string) => entries.has(id), get, put, release, trim };

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

function isRound(preset: BrushPreset) {
  return !preset.abrSource && !preset.abrDocument && (!preset.settings.engine || preset.settings.engine.id === 'round');
}
