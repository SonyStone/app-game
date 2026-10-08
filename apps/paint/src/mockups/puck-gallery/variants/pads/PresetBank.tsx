import { For } from 'solid-js';
import { presets } from '../../kit/catalog';
import type { Studio } from '../../kit/createStudio';
import { StrokePreview } from '../../kit/StrokePreview';
import { galleryUi } from '../../kit/variant';
import styles from './PresetBank.module.css';
import { tapHandlers } from './tapHandlers';

/**
 * The preset bank: six preset pads per page, each a stroke sample over a small screen with the preset's name, and
 * bank arrows to page through all presets, as an MPC pages through pad banks. Keys 5–0 pick the six slots, − and =
 * page. Choosing a preset reports `onPick`.
 */
export function PresetBank(props: {
  studio: Studio;
  page: number;
  onPage: (page: number) => void;
  onPick: () => void;
}) {
  const shown = () => presets.slice(props.page * presetsPerPage, (props.page + 1) * presetsPerPage);

  return (
    <section class={styles.bank}>
      <header class={styles.silk}>
        <span>Presets</span>
        <span class={styles.page}>
          Bank {props.page + 1}/{presetPages}
        </span>
      </header>
      <div class={styles.row}>
        <button
          class={styles.arrow}
          {...galleryUi}
          {...tapHandlers(() => props.onPage(turnPage(props.page, -1)))}
          aria-label="Previous bank"
        >
          ‹<kbd>−</kbd>
        </button>
        <div class={styles.cards}>
          <For each={shown()}>
            {(preset, index) => (
              <button
                class={[styles.card, { [styles.chosen!]: props.studio.preset() === preset.id }]}
                {...galleryUi}
                {...tapHandlers(() => {
                  props.studio.choosePreset(preset.id);
                  props.onPick();
                })}
              >
                <kbd>{presetKeyHints[index()]}</kbd>
                <StrokePreview preset={preset} color={props.studio.color()} height={30} class={styles.stroke} />
                <span class={styles.name}>
                  <b>{preset.name}</b>
                  <small>{preset.set}</small>
                </span>
              </button>
            )}
          </For>
        </div>
        <button
          class={styles.arrow}
          {...galleryUi}
          {...tapHandlers(() => props.onPage(turnPage(props.page, 1)))}
          aria-label="Next bank"
        >
          ›<kbd>=</kbd>
        </button>
      </div>
    </section>
  );
}

/** Presets per bank page, one per key 5–0. */
export const presetsPerPage = 6;
export const presetPages = Math.ceil(presets.length / presetsPerPage);

/** The page that holds a preset; the first page when there is none. */
export function pageOf(id: string | undefined) {
  return Math.max(0, Math.floor(presets.findIndex((entry) => entry.id === id) / presetsPerPage));
}

/** The page `by` pages away, wrapping around. */
export function turnPage(page: number, by: number) {
  return (page + by + presetPages) % presetPages;
}

/** `KeyboardEvent.code` of the preset slots, in order. */
export const presetKeyCodes = ['Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'] as const;
const presetKeyHints = presetKeyCodes.map((code) => code.slice(5));
