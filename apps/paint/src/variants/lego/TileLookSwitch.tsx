import { createSignal, For, Show } from 'solid-js';
import styles from './LegoStudio.module.css';
import { plateRadii, radiusRange, type TileLook } from './tileLook';

/**
 * TEMPORARY developer control for the tile look trial (see `tileLook.ts`): a round button beside Edit, showing the
 * plate radius, that opens a small card to set that radius, directly or by its sharp, today and soft shortcuts, and to
 * switch squircle corners. Changes apply at once and are kept on the device. Remove it with the trial.
 */
export function TileLookSwitch(props: {
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
                  aria-pressed={props.look.radius === entry[1] ? 'true' : 'false'}
                  onClick={() => props.onChange({ radius: entry[1] })}
                >
                  <small>{entry[0]}</small>
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
