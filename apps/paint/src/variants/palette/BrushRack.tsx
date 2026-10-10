import { createEffect, createSignal, For, type Accessor } from 'solid-js';
import type { BrushLibrary, BrushPreset } from '../../features/brush-library';
import styles from './BrushRack.module.css';
import { PresetStroke } from './PresetStroke';

/**
 * The brushes in the rack beside the palette: up to {@link rackSize} presets, kept in `localStorage`. A preset
 * coming into use from elsewhere (the full library, an ABR import) takes the top place and pushes the last one out;
 * using a brush already in the rack leaves the order alone, so the rack stays put under the hand. Places left free
 * are filled from the library. Must be created within a Solid owner.
 */
export function createBrushRack(options: {
  /** The preset in use. */
  current: Accessor<string>;
  /** Every preset, in library order. */
  presets: Accessor<readonly BrushPreset[]>;
  /** The preset with `id`, if it exists. */
  find: (id: string) => BrushPreset | undefined;
}) {
  const [ids, setIds] = createSignal<string[]>(read());

  createEffect(options.current, (id) => {
    const stored = ids();
    if (!id || stored.includes(id)) {
      return;
    }

    const next = [id, ...stored.filter((candidate) => options.find(candidate))].slice(0, rackSize);
    setIds(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Keep the rack for this session.
    }
  });

  return {
    /** The rack's presets, top first. */
    presets(): BrushPreset[] {
      const kept = ids().flatMap((id) => options.find(id) ?? []);
      const others = options.presets().filter((preset) => !kept.some((candidate) => candidate.id === preset.id));
      return [...kept, ...others].slice(0, rackSize);
    }
  };
}

/**
 * A short column of brushes, each its name over a sample stroke, the one in use lighter. A tap paints with it.
 */
export function BrushList(props: {
  presets: readonly BrushPreset[];
  /** The preset in use. */
  current: string;
  resources: BrushLibrary['resources'];
  disabled: boolean;
  onChoose: (id: string) => void;
}) {
  return (
    <div class={styles.list} role="listbox" aria-label="Brushes">
      <For each={props.presets} keyed={(preset) => preset.id}>
        {(preset) => (
          <button
            class={styles.preset}
            role="option"
            aria-selected={preset().id === props.current ? 'true' : 'false'}
            disabled={props.disabled}
            title={preset().name}
            onClick={() => props.onChoose(preset().id)}
          >
            <span class={styles.name}>{preset().name}</span>
            <PresetStroke
              preset={preset()}
              resources={props.resources}
              color={preset().id === props.current ? '#ffffff' : '#bdbdbd'}
              height={18}
            />
          </button>
        )}
      </For>
    </div>
  );
}

/** Presets in the rack. */
export const rackSize = 6;

const key = 'paint.palette.rack';

function read(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string').slice(0, rackSize) : [];
  } catch {
    return [];
  }
}
