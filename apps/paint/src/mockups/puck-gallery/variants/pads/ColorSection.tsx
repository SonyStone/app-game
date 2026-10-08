import { For } from 'solid-js';
import { luminance } from '../../../../features/color/hsv';
import { palette } from '../../kit/catalog';
import type { Studio } from '../../kit/createStudio';
import { galleryUi } from '../../kit/variant';
import styles from './ColorSection.module.css';
import { dialControl, type Dial } from './dials';
import { LcdValue } from './Encoders';
import { Knob } from './Knob';
import { tapHandlers } from './tapHandlers';

/**
 * The color section, the only colorful part of the gear: a swap pad with the current and previous colors, the
 * palette as Launchpad-style colored pads (one ramp per column), two rows of recent colors, and hue / saturation / value encoders for fine
 * adjustment. Tapping a colored pad chooses that color and reports `onPick`; the swap pad and the encoders keep the
 * gear open.
 */
export function ColorSection(props: {
  studio: Studio;
  /** Hue, saturation and value, in that order. */
  dials: readonly Dial[];
  cursor: string | undefined;
  onSelect: (dial: Dial) => void;
  onPick: () => void;
}) {
  const controls = [0, 1, 2].map((slot) =>
    dialControl(
      () => props.dials[slot],
      (dial) => props.onSelect(dial)
    )
  );
  const choose = (hex: string) => {
    props.studio.chooseColor(hex);
    props.onPick();
  };
  const ink = (hex: string) => (luminance(hex) > 0.35 ? '#111' : '#f2f2f2');

  return (
    <section class={styles.color}>
      <header class={styles.silk}>Color</header>
      <button
        class={styles.swap}
        {...galleryUi}
        {...tapHandlers(() => props.studio.swapColors())}
        aria-label="Swap the current and previous colors"
      >
        <span class={styles.current} style={{ background: props.studio.color(), color: ink(props.studio.color()) }}>
          Cur
        </span>
        <span
          class={styles.previous}
          style={{ background: props.studio.previous(), color: ink(props.studio.previous()) }}
        >
          Prev
        </span>
        <span class={styles.swapMark}>
          ⇄<kbd>T</kbd>
        </span>
      </button>

      <div class={styles.palette}>
        <For each={palette}>
          {(hex) => (
            <button
              class={[styles.swatch, { [styles.chosen!]: props.studio.color() === hex }]}
              style={{ background: hex }}
              {...galleryUi}
              {...tapHandlers(() => choose(hex))}
              aria-label={hex}
            />
          )}
        </For>
      </div>

      <header class={styles.silk}>Recent</header>
      <div class={styles.recent}>
        <For each={props.studio.recent().slice(0, 8)}>
          {(hex) => (
            <button
              class={[styles.swatch, styles.small, { [styles.chosen!]: props.studio.color() === hex }]}
              style={{ background: hex }}
              {...galleryUi}
              {...tapHandlers(() => choose(hex))}
              aria-label={hex}
            />
          )}
        </For>
      </div>

      <div class={styles.hsv}>
        <div class={styles.screen}>
          {[0, 1, 2].map((slot) => (
            <div
              class={[styles.cell, { [styles.cursor!]: props.dials[slot]?.id === props.cursor }]}
              {...galleryUi}
              {...controls[slot]}
            >
              <span class={styles.label}>{props.dials[slot]?.label}</span>
              <LcdValue text={props.dials[slot]?.text() ?? ''} />
            </div>
          ))}
        </div>
        <div class={styles.knobs}>
          {[0, 1, 2].map((slot) => (
            <div class={styles.knobCell} {...galleryUi} {...controls[slot]}>
              <Knob fraction={props.dials[slot]?.fraction()} selected={props.dials[slot]?.id === props.cursor} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
