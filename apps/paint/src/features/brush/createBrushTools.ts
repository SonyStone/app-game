import { defaultBrush, type Brush } from '@app-game/paint-core/brush';
import { normalizeStrokeSettings } from '@app-game/paint-core/strokeSettings';
import { createEffect, createMemo, untrack } from 'solid-js';
import { createImmediateSignal } from '../../shared/createImmediateSignal';
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
  library: Pick<BrushLibrary, 'find' | 'load' | 'add' | 'update' | 'remove'>;
  storage?: Pick<BrushStorage, 'readState' | 'writeState'>;
  /**
   * The erasing version of a brush, with the same tip and dynamics; `undefined` when its engine cannot erase with it.
   * Default {@link clearRoundBrush}, for the round and textured engines.
   */
  clear?: (brush: Brush) => Brush | undefined;
}) {
  const clear = options.clear ?? clearRoundBrush;
  // Commands build on the last written state, so several commands in one event compose.
  const [state, setState, currentState] = createImmediateSignal<ToolState>(initialState());
  const brush = createMemo(() => toolBrush(state(), state().slot));
  const currentBrush = () => toolBrush(currentState(), currentState().slot);
  /** Changes are saved once the stored state has been read, so the initial state never overwrites it. */
  let persisting = false;
  /** Resolves once the stored state has been applied, or when there was none to apply. */
  const loaded = restore();
  createEffect(state, (value) => {
    if (persisting) {
      options.storage?.writeState(value);
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
    changes: (id: string) => state().changes[id],
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

      options.library.update(preset.id, { settings: { ...preset.settings, ...current.changes[preset.id] } });
      setState({ ...current, changes: without(current.changes, preset.id) });
    },
    /**
     * Saves the active tool's brush as a new preset carrying `groups` (the `tip` group always) and selects it for that
     * tool; an eraser erasing with the brush is saved as an erasing preset and switches to its `preset` mode. The new
     * preset references the current preset's images. Returns the new preset.
     */
    savePresetAs(name: string, groups: readonly PresetGroup[] = defaultPresetGroups): BrushPreset {
      const current = currentState();
      const saved = currentBrush();
      const source = options.library.find(current.slots[presetSlot(current)].preset);
      const added = options.library.add({
        name,
        settings: presetSettings(saved, groups),
        resourceIds: source?.resourceIds ?? []
      });
      setState({
        ...current,
        eraserMode: current.slot === 'eraser' ? 'preset' : current.eraserMode,
        slots: { ...current.slots, [current.slot]: { preset: added.id, brush: saved } }
      });
      return added;
    },
    /** Deletes a user preset and its changes; tools using it stop using it, see `abandonPreset`. */
    deletePreset(id: string) {
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
    }
  };

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
    const slots = { ...current.slots, [slot]: { preset: id, brush: next } };
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
    persisting = true;
    if (currentState() === initial) {
      const restored = restoredState(stored, options.library.find);
      if (restored) {
        setState(restored);
      }
    } else {
      options.storage?.writeState(currentState());
    }
  }
}

/** The erasing version of a round or textured brush: the same tip, erasing with `tool: 'eraser'`. */
export function clearRoundBrush(brush: Brush): Brush {
  return { ...brush, tool: 'eraser' };
}

/** Largest brush size in pixels: 5000 for ABR presets, 512 for the round brush and eraser. */
export function maxBrushSize(brush: Brush) {
  return brush.engine?.id === 'abr' ? 5000 : 512;
}

/** Canvas tools. `brush` and `eraser` also name the round brush's own `tool`. */
export type PaintTool = Brush['tool'] | 'lasso';

/** Tools that paint with a brush preset. */
export type BrushSlot = Brush['tool'];

/** How the eraser erases: with the brush, through its engine's Clear, or with its own preset. */
export type EraserMode = 'clear' | 'preset';

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
  slots: Record<BrushSlot, { preset: string; brush: Brush }>;
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
function restoredState(stored: unknown, find: (id: string) => BrushPreset | undefined): ToolState | undefined {
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
  }

  const tool =
    brushSlots.includes(stored.tool as BrushSlot) || stored.tool === 'lasso' ? (stored.tool as PaintTool) : 'brush';
  const slot = brushSlots.includes(stored.slot as BrushSlot) ? (stored.slot as BrushSlot) : 'brush';
  const changes = isRecord(stored.changes)
    ? Object.fromEntries(Object.entries(stored.changes).filter(([, value]) => isRecord(value)))
    : {};
  return {
    version: 2,
    tool,
    slot,
    slots,
    eraserMode: stored.eraserMode === 'preset' ? 'preset' : 'clear',
    changes: changes as ToolState['changes'],
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
