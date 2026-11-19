import { createSignal, For, Show } from 'solid-js';
import { defaultCell, referenceCell } from './grid';
import styles from './LegoStudio.module.css';
import { plateRadii, radiusRange, type TileLook } from './tileLook';

/**
 * TEMPORARY developer control for the tile look trial (see `tileLook.ts`): a round button beside Edit, showing the
 * plate radius, that opens a small card to set that radius, directly or by its sharp, today and soft shortcuts, the
 * cell size, directly or by its shortcuts around the 28 px default, and to switch squircle corners. Changes apply at once and are kept on the device. Remove it with the trial.
 */
export function TileLookSwitch(props: {
  cellSize: number;
  look: TileLook;
  /** Changes some of the look; the caller keeps it. */
  onChange: (patch: Partial<TileLook>) => void;
}) {
  const [open, setOpen] = createSignal(false);

  return (
    <div class={styles.tileLookSwitch}>
      <button
        type="button"
        class={styles.editButton}
        aria-expanded={open() ? 'true' : 'false'}
        aria-label="Tile look (trial)"
        title="Tile look (trial)"
        onClick={() => setOpen(!open())}
      >
        {props.look.radius}
      </button>
      <Show when={open()}>
        <div class={styles.tileLookCard} role="group" aria-label="Tile look (trial)">
          <span class={styles.tileLookHeading}>Tile look · trial</span>
          <label class={styles.tileLookRadius}>
            <span>
              Plate radius <output>{props.look.radius} px</output>
            </span>
            <input
              type="range"
              min={radiusRange.min}
              max={radiusRange.max}
              step={1}
              value={props.look.radius}
              onInput={(event) => props.onChange({ radius: event.currentTarget.valueAsNumber })}
            />
          </label>
          <div class={styles.tileLookChoices}>
            <For each={Object.entries(plateRadii)}>
              {(entry) => (
                <button
                  type="button"
                  aria-pressed={
                    props.look.radius === entry[1] && !(entry[0] === 'full' && props.look.squircle) ? 'true' : 'false'
                  }
                  // Full rounding is a look of plain arcs, so its shortcut also turns squircle corners off.
                  onClick={() =>
                    props.onChange(entry[0] === 'full' ? { radius: entry[1], squircle: false } : { radius: entry[1] })
                  }
                >
                  <small>{entry[0]}</small>
                </button>
              )}
            </For>
          </div>
          <label class={styles.tileLookRadius}>
            <span>
              Cell size <output>{props.cellSize} px</output>
            </span>
            <input
              type="range"
              aria-label="Cell size"
              min={defaultCell}
              max={referenceCell}
              step={2}
              value={props.cellSize}
              onInput={(event) => props.onChange({ cellSize: event.currentTarget.valueAsNumber })}
            />
          </label>
          <div class={styles.tileLookChoices}>
            <For each={cellShortcuts}>
              {(size) => (
                <button
                  type="button"
                  aria-pressed={size === props.cellSize ? 'true' : 'false'}
                  onClick={() => props.onChange({ cellSize: size })}
                >
                  {size}
                </button>
              )}
            </For>
          </div>
          <label class={styles.tileLookCheck}>
            <input
              type="checkbox"
              checked={props.look.squircle}
              onChange={(event) => props.onChange({ squircle: event.currentTarget.checked })}
            />
            Squircle corners
          </label>
        </div>
      </Show>
    </div>
  );
}

/** The cell sizes the switch offers at a tap: the default, the two the user found good for a pen, and the first one. */
const cellShortcuts = [defaultCell, 32, 36, referenceCell];
