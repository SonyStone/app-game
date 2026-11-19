import type { AbrBrushSettings } from '@app-game/abr-paint/engine';
import type { BrushResource } from '@app-game/abr-paint/resources';
import { defaultBrush, type Brush } from '@app-game/paint-core/brush';
import { brushSchema, parseDocument } from '@app-game/paint-core/paintbrush/document';
import { normalizeStrokeSettings } from '@app-game/paint-core/strokeSettings';
import type { Result } from 'neverthrow';
import { createEffect, createMemo, createSignal, untrack } from 'solid-js';
import { createImmediateSignal } from '../../shared/createImmediateSignal';
import type { PaintError } from '../../shared/errors';
import {
  applyPreset,
  defaultPresetGroups,
  presetChanges,
  presetSettings,
  type BrushLibrary,
  type BrushPreset,
  type BrushStorage,
  type PresetGroup
} from '../brush-library';
import { patchAbrValues } from '../brush-library/abrDocument';
import { hostExtension, hostSettings, syncAbrPreset } from '../brush-library/abrHost';
import { nativePresetText, readRoundPreset } from '../brush-library/nativeDocument';

/**
 * Owns the active tool and the brush settings captured by the next stroke. The brush and the eraser each use a preset
 * from the library and keep their own brush, restored when the tool is chosen again; colors are shared.
 *
 * The eraser either erases with the brush, through `clear` (its `clear` mode), keeping only its own size, or erases
 * with its own preset (its `preset` mode). A brush that cannot erase, such as a Mixer Brush, falls back on the
 * eraser's preset.
 *
 * Settings changed on the fly are remembered per preset: choosing a preset again restores them, until the preset is
 * reset or saved. While sizes are shared, presets do not change the size: each tool keeps its own.
 *
 * With `storage`, the tool state is restored after loading the presets it uses, and only those, and saved after every
 * change; changes made before the restore win over it. Must be created within a Solid owner.
 */
export function createBrushTools(options: {
  library: Pick<BrushLibrary, 'find' | 'load' | 'add' | 'addStored' | 'update' | 'remove'> &
    Partial<Pick<BrushLibrary, 'assets'>>;
  onError?: (message: string) => void;
  storage?: Pick<BrushStorage, 'readState' | 'writeState'>;
  /**
   * The erasing version of a brush, with the same tip and dynamics; `undefined` when its engine cannot erase with it.
   * Default {@link clearRoundBrush}, for the round and textured engines.
   */
  clear?: (brush: Brush) => Brush | undefined;
}) {
  const documentEdits = new Map<string, DocumentEdit>();
  /** Changes whenever `documentEdits` does, for readers of `documentText`. */
  const [editsChanged, setEditsChanged] = createSignal(0, { ownedWrite: true });
  const clear = options.clear ?? clearRoundBrush;
  // Commands build on the last written state, so several commands in one event compose.
  const [state, publish, currentState] = createImmediateSignal<ToolState>(documentSlots(initialState()));
  const brush = createMemo(() => toolBrush(state(), state().slot));
  const currentBrush = () => toolBrush(currentState(), currentState().slot);
  /** Changes are saved once the stored state has been read, so the initial state never overwrites it. */
  let persisting = false;
  /** Resolves once the stored state has been applied, or when there was none to apply. */
  const loaded = restore();
  createEffect(state, (value) => {
    if (persisting) {
      persist(value);
    }
  });

  return {
    /** Settings captured by the next stroke of the active brush tool, or of the last one under another tool. */
    brush,
    tool: () => state().tool,
    /** The brush tool whose settings the next stroke uses: the active tool, or the last brush tool under another. */
    slot: () => state().slot,
    /** The preset the active brush tool paints with; the brush's preset while the eraser erases with the brush. */
    preset: () => state().slots[presetSlot(state())].preset,
    /** Settings of `id` changed on the fly, relative to the saved preset; `undefined` when unchanged. */
    changes: (id: string) => state().changes[id] ?? (documentEdit(id) ? {} : undefined),
    /** Presets do not change the size; each tool keeps its own size instead. */
    sharedSize: () => state().sharedSize,
    /** Whether the eraser erases with the brush (`clear`) or uses its own preset (`preset`). */
    eraserMode: () => state().eraserMode,
    /** The current brush can erase; otherwise the eraser uses its own preset even in `clear` mode. */
    canClear: () => clear(toolBrush(state(), 'brush')) !== undefined,
    loaded,
    /** Presets chosen for the brush and the eraser, for uploading their images to a new engine. */
    presets(): BrushPreset[] {
      return brushSlots.flatMap((slot) => {
        const preset = options.library.find(currentState().slots[slot].preset);
        return preset ? [preset] : [];
      });
    },
    /** Switches tools, keeping colors and restoring the chosen brush tool's own settings. */
    chooseTool(next: PaintTool) {
      const current = currentState();
      setState({ ...current, tool: next, slot: next === 'brush' || next === 'eraser' ? next : current.slot });
    },
    /** The eraser's settings with the current colors, for the pen's eraser end. */
    eraser(): Brush {
      return toolBrush(currentState(), 'eraser');
    },
    updateBrush,
    /**
     * Holds the accepted edit of the preset `id`'s document until Save or Save As, including its newly generated masks:
     * any brush's, a round brush's with a Photoshop group on or dormant too. `engine` is what the document resolved to,
     * absent for Paint's round renderer.
     */
    setDocumentEdit(id: string, abrDocument: string, engine: Brush['engine'], resources: readonly BrushResource[]) {
      editDocument(id, { base: options.library.find(id)?.abrDocument, abrDocument, engine, resources });
    },
    /** The accepted document edit of the preset `id`, if any; see `setDocumentEdit`. */
    documentEdit,
    /** The text of the preset `id`'s accepted document edit, if any; reactive. */
    documentText(id: string) {
      editsChanged();
      return documentEdit(id)?.abrDocument;
    },
    /** Puts back `edit`, as `documentEdit` gave it, or no edit at all. */
    restoreDocumentEdit(id: string, edit: DocumentEdit | undefined) {
      editDocument(id, edit);
    },
    editedResources: (id: string) => documentEdit(id)?.resources,
    /**
     * Makes `slot` use the preset with `id`, restoring its remembered changes, and activates that tool. Choosing a
     * preset for the eraser switches it to its `preset` mode. The preset's images must already be resident in the
     * engine. Unknown ids are ignored.
     */
    selectPreset(id: string, slot: BrushSlot) {
      const preset = options.library.find(id);
      if (!preset) {
        return;
      }

      const current = currentState();
      const next = applyPreset(current.slots[slot].brush, preset, current.changes[id], sizeKeys(current));
      const edit = documentEdit(id);
      if (edit) {
        next.engine = edit.engine;
      }
      const colors = {
        color: next.color,
        backgroundColor: next.backgroundColor ?? current.colors.backgroundColor
      };
      setState({
        ...current,
        tool: slot,
        slot,
        eraserMode: slot === 'eraser' ? 'preset' : current.eraserMode,
        colors: preset.settings.color === undefined ? current.colors : colors,
        slots: { ...current.slots, [slot]: { preset: id, brush: next } }
      });
    },
    /** Erases with the brush, or with the eraser's own preset. */
    setEraserMode(mode: EraserMode) {
      setState({ ...currentState(), eraserMode: mode });
    },
    /** Discards the changes of `id`; tools using it return to its saved settings, keeping shared sizes. */
    resetPreset(id: string) {
      const preset = options.library.find(id);
      const current = currentState();
      if (!preset) {
        return;
      }

      editDocument(id, undefined);
      const changes = without(current.changes, id);
      const slots = { ...current.slots };
      for (const slot of brushSlots) {
        if (slots[slot].preset === id) {
          slots[slot] = { preset: id, brush: applyPreset(slots[slot].brush, preset, {}, sizeKeys(current)) };
        }
      }

      setState({ ...current, changes, slots });
    },
    /** Saves the active brush's changes into its preset. Built-in presets cannot be overwritten; use `savePresetAs`. */
    savePreset() {
      const current = currentState();
      const preset = options.library.find(current.slots[presetSlot(current)].preset);
      if (!preset || preset.builtIn) {
        return;
      }

      const edit = documentEdit(preset.id);
      options.library.update(
        preset.id,
        {
          settings: { ...preset.settings, ...current.changes[preset.id], ...(edit && { engine: edit.engine }) },
          ...(edit && { abrDocument: edit.abrDocument, resourceIds: edit.resources.map((r) => r.id) })
        },
        edit?.resources
      );
      editDocument(preset.id, undefined);
      setState({ ...current, changes: without(current.changes, preset.id) });
    },
    /**
     * Saves the active tool's brush as a new preset carrying `groups` (the `tip` group always) and selects it for that
     * tool; an eraser erasing with the brush is saved as an erasing preset and switches to its `preset` mode. The new
     * preset references the current preset's images. Returns the new preset. The library writes it in the background.
     */
    savePresetAs(name: string, groups: readonly PresetGroup[] = defaultPresetGroups): BrushPreset {
      const copy = copyOfActive(name, groups);
      return selectCopy(copy, options.library.add(copy.preset, copy.resources));
    },
    /**
     * Saves the active tool's brush as a new preset as `savePresetAs` does, but selects it only once storage has
     * written it (`BrushLibrary.addStored`): a refused write leaves the library and the tools as they were and fails
     * with the library's `storage` error. The source preset keeps its changes and document edit; see `restoreChanges`.
     */
    async savePresetAsStored(
      name: string,
      groups: readonly PresetGroup[] = defaultPresetGroups
    ): Promise<Result<BrushPreset, PaintError>> {
      const copy = copyOfActive(name, groups);
      const added = await options.library.addStored(copy.preset, copy.resources);
      return added.map((preset) => selectCopy(copy, preset));
    },
    /** The settings of `id` changed on the fly as remembered, apart from its document edit; see `restoreChanges`. */
    rememberedChanges: (id: string): Partial<Brush> | undefined => currentState().changes[id],
    /**
     * Puts back the remembered changes of `id`, as `rememberedChanges` gave them, or none: choosing the preset again
     * applies them. For a preset no tool uses, as the source of a copy just saved; a tool using it keeps its brush.
     */
    restoreChanges(id: string, changes: Partial<Brush> | undefined) {
      const current = currentState();
      setState({ ...current, changes: changes ? { ...current.changes, [id]: changes } : without(current.changes, id) });
    },
    /** Deletes a user preset and its changes; tools using it stop using it, see `abandonPreset`. */
    deletePreset(id: string) {
      editDocument(id, undefined);
      options.library.remove(id);
      abandonPreset(id);
      const current = currentState();
      setState({ ...current, changes: without(current.changes, id) });
    },
    abandonPreset,
    /** Shares one size per tool between its presets, or lets every preset keep its own size. */
    setSharedSize(shared: boolean) {
      setState({ ...currentState(), sharedSize: shared });
    },
    /** Exchanges the foreground and background colors. */
    swapColors() {
      const current = currentState();
      setState({
        ...current,
        colors: { color: current.colors.backgroundColor, backgroundColor: current.colors.color }
      });
    },
    resetColors() {
      setState({ ...currentState(), colors: { color: '#000000', backgroundColor: '#ffffff' } });
    },
    /** Scales the brush size, limited to 1–512 px, or 1–5000 px for ABR presets. */
    scaleSize(factor: number) {
      const current = currentBrush();
      updateBrush({ size: Math.max(1, Math.min(maxBrushSize(current), current.size * factor)) });
    },
    /** The whole tool state as it is now, for putting it back with `restoreSnapshot`. */
    snapshot: (): ToolSnapshot => currentState(),
    /**
     * Puts back the tool state of a `snapshot`: the tool, each brush tool's preset and settings, their changes and the
     * colors. The snapshot's presets must still be resident in the engine; see `createPresetUploads`.
     */
    restoreSnapshot(snapshot: ToolSnapshot) {
      setState(snapshot as ToolState);
    }
  };

  /**
   * The new preset `savePresetAs` saves for the active tool, its new images, and the slot and brush it is selected
   * for; see `selectCopy`.
   */
  function copyOfActive(name: string, groups: readonly PresetGroup[]) {
    const current = currentState();
    const saved = currentBrush();
    const source = options.library.find(current.slots[presetSlot(current)].preset);
    const edit = source && documentEdit(source.id);
    const settings = presetSettings(saved, groups);
    // A round brush's document edit carries its Photoshop groups, switched on or dormant, into the copy.
    let document = edit?.abrDocument ?? (saved.engine?.id === 'abr' ? source?.abrDocument : undefined);
    // Clear-mode erasing overrides the runtime blend without changing the source preset.
    // A standalone copy needs the same mode in its editable Photoshop tool options.
    if (document && settings.engine?.id === 'abr') {
      const abr = settings.engine.settings as AbrBrushSettings;
      if (abr.blendMode === 'Cler' && abr.values.tool.type !== 'ErTl' && abr.values.tool.mode !== 'Cler') {
        const values = { ...abr.values, tool: { ...abr.values.tool, mode: 'Cler' } };
        document = patchAbrValues(document, values);
        settings.engine = { ...settings.engine, settings: { ...abr, values } };
      }
    }

    const preset: Omit<BrushPreset, 'id' | 'builtIn'> = {
      name,
      settings,
      derivedFrom: source?.id,
      paintbrush: source?.paintbrush,
      ...(document && { abrDocument: document, assetIds: source?.assetIds, abrArchive: source?.abrArchive }),
      resourceIds: edit?.resources.map((r) => r.id) ?? source?.resourceIds ?? []
    };
    return { preset, resources: edit?.resources, slot: current.slot, brush: saved };
  }

  /** Makes the slot `copy` was saved from use `added`, the preset saved from it, with the brush it was saved with. */
  function selectCopy(copy: ReturnType<typeof copyOfActive>, added: BrushPreset) {
    const current = currentState();
    setState({
      ...current,
      eraserMode: copy.slot === 'eraser' ? 'preset' : current.eraserMode,
      slots: {
        ...current.slots,
        [copy.slot]: { preset: added.id, brush: { ...copy.brush, engine: added.settings.engine } }
      }
    });
    return added;
  }

  function setState(next: ToolState) {
    publish(documentSlots(next, currentState()));
  }

  /** Keep the resolved brush for stroke start and for older readers of the stored state. */
  function documentSlots(next: ToolState, previous?: ToolState): ToolState {
    const slots = { ...next.slots };
    for (const slot of brushSlots) {
      const entry = slots[slot];
      if (previous?.slots[slot] === entry) {
        continue;
      }
      if (entry.brush.engine?.id === 'abr') {
        const preset = options.library.find(entry.preset);
        const base = documentEdit(entry.preset)?.abrDocument ?? entry.sampledDocument ?? preset?.abrDocument;
        if (base && preset && entry.legacyBrush) {
          slots[slot] = {
            ...entry,
            sampledDocument: syncAbrPreset(
              {
                ...preset,
                abrDocument: base,
                settings: entry.brush
              },
              true
            ).abrDocument
          };
        }
        continue;
      }
      if (entry.brush.engine && entry.brush.engine.id !== 'round') {
        continue;
      }
      const preset = { id: entry.preset, name: slot, settings: entry.brush, resourceIds: [] };
      try {
        const resolved = readRoundPreset(preset);
        slots[slot] = {
          preset: entry.preset,
          brush: { ...entry.brush, ...resolved.settings },
          nativeDocument: resolved.nativeDocument
        };
      } catch (cause) {
        options.onError?.('Could not convert ' + slot + ' slot: ' + String(cause));
        slots[slot] = { preset: entry.preset, brush: entry.brush };
      }
    }

    return { ...next, slots };
  }

  /** Sets or removes the document edit of `id`, telling the readers of `documentText`. */
  function editDocument(id: string, edit: DocumentEdit | undefined) {
    if (edit) {
      documentEdits.set(id, edit);
    } else {
      documentEdits.delete(id);
    }

    setEditsChanged((count) => count + 1);
  }

  function documentEdit(id: string) {
    const edit = documentEdits.get(id);
    if (edit && edit.base !== options.library.find(id)?.abrDocument) {
      documentEdits.delete(id);
      return undefined;
    }
    return edit;
  }

  /**
   * Settings of a brush tool with the current colors. The eraser in `clear` mode erases with the brush at its own
   * size, unless the brush cannot erase; otherwise it erases with its own preset through `clear` too, so that any
   * preset chosen for it erases. A preset that cannot erase becomes a round eraser of its size.
   */
  function toolBrush(current: ToolState, slot: BrushSlot): Brush {
    const painting = { ...current.slots.brush.brush, ...current.colors };
    if (slot === 'brush') {
      return painting;
    }

    const cleared = erasesWithBrush(current)
      ? clear({ ...painting, size: current.slots.eraser.brush.size })
      : undefined;
    const own = { ...current.slots.eraser.brush, ...current.colors };
    return cleared ?? clear(own) ?? { ...own, engine: undefined, tool: 'eraser' };
  }

  function erasesWithBrush(current: ToolState) {
    return current.eraserMode === 'clear' && clear({ ...current.slots.brush.brush, ...current.colors }) !== undefined;
  }

  /** The slot whose preset the active tool paints with: the brush's while the eraser erases with the brush. */
  function presetSlot(current: ToolState): BrushSlot {
    return current.slot === 'eraser' && erasesWithBrush(current) ? 'brush' : current.slot;
  }

  /**
   * Tools using `id` return to their default preset, keeping the settings it does not include, since their engine
   * settings may refer to the abandoned preset's images. The library keeps the preset.
   */
  function abandonPreset(id: string) {
    const current = currentState();
    const slots = { ...current.slots };
    for (const slot of brushSlots) {
      if (slots[slot].preset === id) {
        slots[slot] = defaultSlot(slot, slots[slot].brush, options.library.find);
      }
    }

    setState({ ...current, slots });
  }

  /**
   * Merges changed settings into the active brush, remembering them as changes of its preset. While the eraser erases
   * with the brush, a size change resizes the eraser and other changes edit the brush.
   */
  function updateBrush(patch: Partial<Brush>) {
    const { color, backgroundColor, ...settings } = patch;
    const current = currentState();
    const colors = {
      color: color ?? current.colors.color,
      backgroundColor: backgroundColor ?? current.colors.backgroundColor
    };
    if (presetSlot(current) === current.slot) {
      setState(remember({ ...current, colors }, current.slot, { ...current.slots[current.slot].brush, ...settings }));
      return;
    }

    const { size, ...brushSettings } = settings;
    const eraser = {
      ...current.slots.eraser,
      brush: { ...current.slots.eraser.brush, size: size ?? current.slots.eraser.brush.size }
    };
    const resized = { ...current, colors, slots: { ...current.slots, eraser } };
    setState(remember(resized, 'brush', { ...resized.slots.brush.brush, ...brushSettings }));
  }

  /** Replaces the brush of `slot` and records how it differs from the slot's preset. */
  function remember(current: ToolState, slot: BrushSlot, next: Brush): ToolState {
    const id = current.slots[slot].preset;
    const preset = options.library.find(id);
    const slots = { ...current.slots, [slot]: { ...current.slots[slot], preset: id, brush: next } };
    if (!preset) {
      return { ...current, slots };
    }

    const others = without(current.changes, preset.id);
    const changed = presetChanges(preset, { ...next, ...current.colors }, sizeKeys(current));
    const changes = Object.keys(changed).length > 0 ? { ...others, [preset.id]: changed } : others;
    return { ...current, slots, changes };
  }

  /**
   * Applies the stored state after loading the presets it uses, unless a command already changed the state, and then
   * starts saving every change.
   */
  async function restore() {
    // Read once at setup, to tell whether a command changes the state before the restore.
    const initial = untrack(currentState);
    const stored = await options.storage?.readState();
    await Promise.all(storedPresetIds(stored).map((id) => options.library.load(id)));
    const drafts = isRecord(stored) && isRecord(stored.documentEdits) ? stored.documentEdits : {};
    for (const [id, draft] of Object.entries(drafts)) {
      if (!options.library.assets || !isRecord(draft) || typeof draft.abrDocument !== 'string') {
        continue;
      }
      try {
        const preset = await options.library.load(id);
        if (!preset || draft.base !== preset.abrDocument) {
          continue;
        }
        const images = await options.library.assets(preset);
        if (images.isErr()) {
          throw new Error(images.error.message);
        }
        const { resolveDraft } = await import('../brush-library/abrPresetDocument');
        const { engine, resources } = await resolveDraft(draft.abrDocument, images.value);
        if (currentState() === initial) {
          editDocument(id, { base: preset.abrDocument, abrDocument: draft.abrDocument, engine, resources });
        }
      } catch (error) {
        options.onError?.('Could not restore brush edits: ' + String(error));
      }
    }
    if (currentState() === initial) {
      const restored = restoredState(stored, options.library.find, options.onError);
      if (restored) {
        for (const slot of brushSlots) {
          const entry = restored.slots[slot];
          await restoreSampledSlot(entry, slot, stored);
          const draft = documentEdit(entry.preset);
          if (draft) {
            entry.brush.engine = draft.engine;
          }
        }
        persisting = true;
        if (currentState() === initial) {
          setState(restored);
        } else {
          persist(currentState());
        }
      }
    } else {
      persist(currentState());
    }
    persisting = true;
  }

  /** Builds a sampled slot from its own settings and the selected preset's durable coverage. */
  async function restoreSampledSlot(entry: ToolState['slots'][BrushSlot], slot: BrushSlot, stored: unknown) {
    const old = isRecord(stored) && isRecord(stored.slots) ? stored.slots[slot] : undefined;
    if (
      isRecord(old) &&
      isRecord(old.brush) &&
      isRecord(old.brush.engine) &&
      old.brush.engine.id === 'textured' &&
      entry.brush.engine?.id === 'abr' &&
      options.library.assets
    ) {
      entry.legacyBrush = old.brush;
      try {
        const preset = options.library.find(entry.preset)!;
        const base = parseDocument(preset.abrDocument!, brushSchema);
        const legacy = { ...restoredBrush(old.brush), engine: old.brush.engine as Brush['engine'] };
        const text =
          typeof old.sampledDocument === 'string'
            ? old.sampledDocument
            : nativePresetText({ ...preset, settings: legacy }, base.resources);
        const doc = parseDocument(text, brushSchema);
        if (doc.id !== entry.preset || doc.definition.tips[doc.definition.sequence.tips[0]!]!.kind !== 'sampled') {
          throw new Error('Expected a sampled slot document for ' + entry.preset);
        }
        const images = await options.library.assets(preset);
        if (images.isErr()) {
          throw new Error(images.error.message);
        }
        const { resolveAbrText } = await import('../brush-library/abrPresetDocument');
        const { engine } = await resolveAbrText(text, images.value);
        const ext = doc.definition.extensions?.[hostExtension];
        entry.brush = { ...entry.brush, ...(ext && hostSettings.parse(ext.value)), engine };
        entry.sampledDocument = text;
      } catch (cause) {
        options.onError?.('Could not convert ' + slot + ' slot: ' + String(cause));
      }
    }
  }

  /** Draft documents survive reopening the studio. Their GPU masks regenerate from shared assets. */
  function persist(value: ToolState) {
    const documents = Object.fromEntries(
      [...documentEdits].map(([id, { base, abrDocument }]) => [id, { base, abrDocument }])
    );
    const slots = Object.fromEntries(
      brushSlots.map((slot) => {
        const { legacyBrush, ...entry } = value.slots[slot];
        return [slot, { ...entry, brush: legacyBrush ?? entry.brush }];
      })
    );
    options.storage?.writeState({ ...value, slots, ...(documentEdits.size && { documentEdits: documents }) });
  }
}

/** An accepted edit of a preset's document; see `setDocumentEdit`. `base` is the saved document it edits. */
type DocumentEdit = {
  base: string | undefined;
  engine: Brush['engine'];
  abrDocument: string;
  resources: readonly BrushResource[];
};

/** The erasing version of a round or textured brush: the same tip, erasing with `tool: 'eraser'`. */
export function clearRoundBrush(brush: Brush): Brush {
  return { ...brush, tool: 'eraser' };
}

/** Largest brush size in pixels: 5000 for ABR presets, 512 for the round brush and eraser. */
export function maxBrushSize(brush: Brush) {
  return brush.engine?.id === 'abr' ? 5000 : 512;
}

/** Canvas tools. `brush` and `eraser` also name the round brush's own `tool`. */
export type PaintTool = Brush['tool'] | 'lasso' | 'fill' | 'gradient' | 'local-undo';

/** Tools that paint with a brush preset. */
export type BrushSlot = Brush['tool'];

/** How the eraser erases: with the brush, through its engine's Clear, or with its own preset. */
export type EraserMode = 'clear' | 'preset';

/** The tool state at one moment, opaque to callers but for the presets each brush tool uses. */
export type ToolSnapshot = { readonly slots: Readonly<Record<BrushSlot, { readonly preset: string }>> };

const brushSlots: readonly BrushSlot[] = ['brush', 'eraser'];

/** Presets of a fresh editor, and of a tool whose preset was deleted. */
const defaultPresets: Record<BrushSlot, string> = {
  brush: 'builtin:soft-round',
  eraser: 'builtin:eraser'
};

/** Brush tool state; stored as is, so changes to its shape need `restoredState` to accept older versions. */
type ToolState = {
  version: 2;
  tool: PaintTool;
  /** The brush tool whose brush the next stroke uses: the active tool, or the last brush tool while lassoing. */
  slot: BrushSlot;
  /** Each brush tool's preset and current brush; the brush's colors are unused, see `colors`. */
  slots: Record<
    BrushSlot,
    {
      preset: string;
      brush: Brush;
      nativeDocument?: string;
      sampledDocument?: string;
      legacyBrush?: Record<string, unknown>;
    }
  >;
  eraserMode: EraserMode;
  /** Settings changed on the fly, by preset id. */
  changes: Record<string, Partial<Brush>>;
  colors: { color: string; backgroundColor: string };
  sharedSize: boolean;
};

function initialState(): ToolState {
  const brush = { ...defaultBrush(), backgroundColor: '#ffffff' };
  return {
    version: 2,
    tool: 'brush',
    slot: 'brush',
    slots: {
      brush: { preset: defaultPresets.brush, brush },
      eraser: { preset: defaultPresets.eraser, brush: { ...brush, tool: 'eraser' } }
    },
    eraserMode: 'clear',
    changes: {},
    colors: { color: brush.color, backgroundColor: brush.backgroundColor },
    sharedSize: false
  };
}

/** Keys a preset does not change: the size, while sizes are shared. */
function sizeKeys(state: Pick<ToolState, 'sharedSize'>): (keyof Brush)[] {
  return state.sharedSize ? ['size'] : [];
}

/** `slot` back on its built-in default preset, keeping the settings the preset does not include. */
function defaultSlot(
  slot: BrushSlot,
  brush: Brush,
  find: (id: string) => BrushPreset | undefined
): ToolState['slots'][BrushSlot] {
  return { preset: defaultPresets[slot], brush: applyPreset(brush, find(defaultPresets[slot])!) };
}

/** Presets used by the tools of a stored state, to load before validating it. */
function storedPresetIds(stored: unknown): string[] {
  if (!isRecord(stored) || !isRecord(stored.slots)) {
    return [];
  }

  const slots = stored.slots;
  return brushSlots.flatMap((slot) => {
    const entry = slots[slot];
    return isRecord(entry) && typeof entry.preset === 'string' ? [entry.preset] : [];
  });
}

/**
 * Validates a stored tool state against the current brush shape and library. Brushes gain settings added since they
 * were stored; a tool whose preset no longer exists returns to its default preset, since its engine settings may
 * refer to resources that are gone. Changes of other presets are kept without checking them, since those presets are
 * not loaded yet.
 */
function restoredState(
  stored: unknown,
  find: (id: string) => BrushPreset | undefined,
  onError?: (message: string) => void
): ToolState | undefined {
  if (!isRecord(stored) || stored.version !== 2 || !isRecord(stored.slots) || !isRecord(stored.colors)) {
    return undefined;
  }

  const fallback = initialState();
  const slots = { ...fallback.slots };
  for (const slot of brushSlots) {
    const entry = stored.slots[slot];
    if (!isRecord(entry) || !isRecord(entry.brush)) {
      continue;
    }

    const preset = typeof entry.preset === 'string' ? find(entry.preset) : undefined;
    const brush = restoredBrush(entry.brush);
    slots[slot] = preset
      ? {
          preset: preset.id,
          brush: { ...brush, engine: preset.settings.engine, tool: preset.settings.tool ?? 'brush' }
        }
      : defaultSlot(slot, brush, find);
    if (
      preset &&
      (!preset.settings.engine || preset.settings.engine.id === 'round') &&
      typeof entry.nativeDocument === 'string'
    ) {
      try {
        const resolved = readRoundPreset(preset, entry.nativeDocument);
        slots[slot].brush = {
          ...slots[slot].brush,
          ...resolved.settings,
          engine: preset.settings.engine,
          tool: preset.settings.tool ?? 'brush'
        };
      } catch (cause) {
        onError?.('Could not restore ' + slot + ' slot: ' + String(cause));
      }
    }
  }

  const tool =
    brushSlots.includes(stored.tool as BrushSlot) ||
    ['lasso', 'fill', 'gradient', 'local-undo'].includes(stored.tool as string)
      ? (stored.tool as PaintTool)
      : 'brush';
  const slot = brushSlots.includes(stored.slot as BrushSlot) ? (stored.slot as BrushSlot) : 'brush';
  const changes: ToolState['changes'] = Object.create(null);
  for (const [id, patch] of Object.entries(isRecord(stored.changes) ? stored.changes : {})) {
    if (isRecord(patch)) {
      changes[id] = isRecord(patch.stroke)
        ? { ...patch, stroke: normalizeStrokeSettings({ ...fallback.slots.brush.brush.stroke, ...patch.stroke }) }
        : patch;
    }
  }

  return {
    version: 2,
    tool,
    slot,
    slots,
    eraserMode: stored.eraserMode === 'preset' ? 'preset' : 'clear',
    changes,
    colors: {
      color: typeof stored.colors.color === 'string' ? stored.colors.color : fallback.colors.color,
      backgroundColor:
        typeof stored.colors.backgroundColor === 'string'
          ? stored.colors.backgroundColor
          : fallback.colors.backgroundColor
    },
    sharedSize: stored.sharedSize === true
  };
}

/** A stored brush with current defaults for missing or mistyped settings. */
function restoredBrush(stored: Record<string, unknown>): Brush {
  const brush = defaultBrush();
  for (const key of Object.keys(brush) as (keyof Brush)[]) {
    const value = stored[key];
    if (
      key !== 'stroke' &&
      typeof value === typeof brush[key] &&
      (typeof value !== 'number' || Number.isFinite(value))
    ) {
      Object.assign(brush, { [key]: value });
    }
  }

  brush.stroke = normalizeStrokeSettings({ ...brush.stroke, ...(isRecord(stored.stroke) ? stored.stroke : {}) });
  brush.size = Math.max(1, Math.min(5000, brush.size));
  return brush;
}

/** `record` without the entry `key`. */
function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const rest = { ...record };
  delete rest[key];
  return rest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
