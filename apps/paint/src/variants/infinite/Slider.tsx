import type { JSX } from '@solidjs/web';
import { Show } from 'solid-js';
import { pressHandlers, type Press } from '../../shared/ui/pressHandlers';
import styles from './Slider.module.css';

/**
 * Infinite Painter's linear slider: a small label at the left above a thin track with a white thumb, and the value at
 * the right end. A press on the track moves the thumb there and drags it; `onInput` follows the drag and `onChange`
 * receives the value where the press lifts, so a drag commits one change, and a cancelled press restores the value it
 * started from. A tap near either end of the track steps the value by `step` instead, as the manual's "minus and plus
 * ends" do. Arrow keys step too.
 *
 * With `onLabel`, the label is a button: Infinite Painter's brush pop-ups highlight the parameter that the toolbar's
 * Opacity button and three-finger drag control, in red (`highlighted`).
 */
export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  /** What a tap at an end and an arrow key add or take away; a hundredth of the range by default. */
  step?: number;
  /** The value as shown at the right end and read by assistive technology, such as "40 %". */
  format?: (value: number) => string;
  /** Maps the value to the thumb's place, 0–1; linear by default. Give `fromFraction` with it. */
  toFraction?: (value: number) => number;
  /** Maps a place on the track, 0–1, to a value; linear by default. */
  fromFraction?: (fraction: number) => number;
  /** Replaces the track's grey, such as a hue gradient for color sliders. */
  background?: string;
  highlighted?: boolean;
  onLabel?: () => void;
  disabled?: boolean;
  onInput?: (value: number) => void;
  onChange: (value: number) => void;
}) {
  /** The value when the press started, restored on cancel. */
  let before = 0;
  const step = () => props.step ?? (props.max - props.min) / 100;
  const clamp = (value: number) => Math.min(props.max, Math.max(props.min, value));
  const fraction = () => {
    const raw = props.toFraction
      ? props.toFraction(props.value)
      : (props.value - props.min) / (props.max - props.min || 1);
    return Math.min(1, Math.max(0, raw));
  };
  const valueAt = (press: Press) => {
    const rect = press.target.getBoundingClientRect();
    const place = Math.min(1, Math.max(0, (press.point.x - rect.left - thumbSize / 2) / (rect.width - thumbSize)));
    return clamp(props.fromFraction ? props.fromFraction(place) : props.min + place * (props.max - props.min));
  };
  const text = () => (props.format ? props.format(props.value) : String(Math.round(props.value)));
  // Created once: a spread of a call would be re-evaluated, and lose the press, when another attribute changes.
  const press = pressHandlers({
    start: (started) => {
      if (props.disabled) {
        return false;
      }

      before = props.value;
    },
    move: (moved) => props.onInput?.(valueAt(moved)),
    tap: (tapped) => {
      const rect = tapped.target.getBoundingClientRect();
      const x = tapped.point.x - rect.left;
      if (x < endZone) {
        props.onChange(clamp(props.value - step()));
        return;
      }

      if (x > rect.width - endZone) {
        props.onChange(clamp(props.value + step()));
        return;
      }

      props.onChange(valueAt(tapped));
    },
    end: (ended) => props.onChange(valueAt(ended)),
    cancel: () => props.onInput?.(before)
  });
  const onKeyDown: JSX.EventHandler<HTMLDivElement, KeyboardEvent> = (event) => {
    const delta = { ArrowRight: step(), ArrowUp: step(), ArrowLeft: -step(), ArrowDown: -step() }[event.key];
    if (delta !== undefined && !props.disabled) {
      event.preventDefault();
      props.onChange(clamp(props.value + delta));
    }
  };

  return (
    <div class={styles.slider} data-disabled={props.disabled ? '' : undefined}>
      <div class={styles.head}>
        <Show when={props.onLabel} fallback={<span class={styles.label}>{props.label}</span>}>
          <button
            class={styles.label}
            aria-pressed={props.highlighted ? 'true' : 'false'}
            title="Control this with the toolbar button and the three-finger drag"
            onClick={() => props.onLabel?.()}
          >
            {props.label}
          </button>
        </Show>
        <span class={styles.value}>{text()}</span>
      </div>
      <div
        class={styles.track}
        role="slider"
        tabindex={props.disabled ? -1 : 0}
        aria-label={props.label}
        aria-valuemin={props.min}
        aria-valuemax={props.max}
        aria-valuenow={props.value}
        aria-valuetext={text()}
        aria-disabled={props.disabled ? 'true' : undefined}
        style={{ '--fraction': fraction(), '--track': props.background }}
        data-custom-track={props.background ? '' : undefined}
        {...press}
        onKeyDown={onKeyDown}
      >
        <span class={styles.line} />
        <span class={styles.thumb} />
      </div>
    </div>
  );
}

/** The thumb's diameter in CSS pixels; it travels between the track's ends. */
const thumbSize = 14;

/** How far from either end of the track, in CSS pixels, a tap steps the value instead of moving the thumb there. */
const endZone = 14;
