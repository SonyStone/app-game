import { For } from 'solid-js';
import styles from './ColorPanel.module.css';
import { InfiniteIcon } from './icons';
import { infinitePalettes } from './palettes';

/**
 * The compact swatch palette under the wheel and the sliders: the palette's name between buttons that step through
 * the collection (wrapping round), over up to three rows of eight touching swatches, the rest scrolled. A tap on a
 * swatch calls `onPick`; the swatch of `color` is marked.
 */
export function CompactPalette(props: {
  /** The index in `infinitePalettes` shown. */
  palette: number;
  onPalette: (index: number) => void;
  color: string;
  onPick: (color: string) => void;
}) {
  const palette = () => infinitePalettes[props.palette] ?? infinitePalettes[0]!;
  const step = (by: number) =>
    props.onPalette((props.palette + by + infinitePalettes.length) % infinitePalettes.length);
  /** Empty cells that fill the last row, as the app shows them. */
  const filler = () =>
    Array.from({ length: (compactColumns - (palette().colors.length % compactColumns)) % compactColumns });

  return (
    <section class={styles.compactPalette} aria-label={`Palette: ${palette().name}`}>
      <div class={styles.paletteBar}>
        <button class={styles.paletteStep} aria-label="Previous palette" onClick={() => step(-1)}>
          <InfiniteIcon name="chevronLeft" size={16} />
        </button>
        <span class={styles.paletteName}>{palette().name}</span>
        <button class={styles.paletteStep} aria-label="Next palette" onClick={() => step(1)}>
          <InfiniteIcon name="chevronRight" size={16} />
        </button>
      </div>
      <div class={styles.compactGrid}>
        <For each={palette().colors}>
          {(hex) => <Swatch hex={hex} current={hex === props.color} onPick={props.onPick} />}
        </For>
        <For each={filler()}>{() => <span class={styles.emptyCell} />}</For>
      </div>
    </section>
  );
}

/**
 * The Swatch palette tab: the recent colors (the color history) at the top, then every palette of the collection
 * under its name, scrolled. A tap on a swatch calls `onPick`; the swatch of `color` is marked.
 */
export function SwatchTab(props: { recent: readonly string[]; color: string; onPick: (color: string) => void }) {
  return (
    <div class={styles.swatchTab}>
      <section aria-label="Recent">
        <h3 class={styles.swatchTitle}>Recent</h3>
        <div class={styles.swatchGrid}>
          <For each={props.recent.slice(0, recentShown)} fallback={<p class={styles.empty}>No colors yet</p>}>
            {(hex) => <Swatch hex={hex} current={hex === props.color} onPick={props.onPick} large />}
          </For>
        </div>
      </section>
      <For each={infinitePalettes}>
        {(palette) => (
          <section aria-label={palette.name}>
            <h3 class={styles.swatchTitle}>{palette.name}</h3>
            <div class={styles.swatchGrid}>
              <For each={palette.colors}>
                {(hex) => <Swatch hex={hex} current={hex === props.color} onPick={props.onPick} large />}
              </For>
            </div>
          </section>
        )}
      </For>
    </div>
  );
}

/** One swatch; `large` draws the Swatch tab's separate rounded squares instead of the compact palette's cells. */
function Swatch(props: { hex: string; current: boolean; large?: boolean; onPick: (color: string) => void }) {
  return (
    <button
      class={props.large ? styles.swatch : styles.cell}
      data-current={props.current ? '' : undefined}
      style={{ background: props.hex }}
      aria-label={props.hex}
      title={props.hex}
      onClick={() => props.onPick(props.hex)}
    />
  );
}

/** Columns of the compact palette. */
const compactColumns = 8;

/** Recent colors the Swatch tab shows: the history's size. */
const recentShown = 10;
