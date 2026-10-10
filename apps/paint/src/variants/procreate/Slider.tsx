import type { JSX } from '@solidjs/web';
import { pressHandlers, type Press } from '../../shared/ui/pressHandlers';
import styles from './Slider.module.css';
import { linearFraction, linearValue, trackFraction } from './sliderScale';

/**
 * A horizontal Procreate slider: a thin track filled in blue up to a round white thumb. A press anywhere on it moves
 * the thumb there and drags it; `onInput` follows the drag and `onChange` receives the value where the press lifts,
 * so a drag commits one change. A cancelled press restores the value it started from. Arrow keys step by a hundredth
 * of the range. `background` replaces the track's look, for color sliders.
 */
export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  /** Replaces the track's gray and blue, such as a hue gradient; the fill is then hidden. */
  background?: string;
  /** The value text read by assistive technology, such as "40 %". */
  valueText?: string;
  onInput?: (value: number) => void;
  onChange: (value: number) => void;
}) {
  /** The value when the press started, restored on cancel. */
  let before = 0;
  const fraction = () => linearFraction(props.value, props.min, props.max);
  const valueAt = (press: Press) => {
    const rect = press.target.getBoundingClientRect();
    return linearValue(trackFraction(press.point.x - rect.left, rect.width, thumbSize), props.min, props.max);
  };
  // Created once: a spread of a call would be re-evaluated, and lose the press, when another attribute changes.
  const press = pressHandlers({
    start: (started) => {
      if (props.disabled) {
        return false;
      }

      before = props.value;
      props.onInput?.(valueAt(started));
    },
    move: (moved) => props.onInput?.(valueAt(moved)),
    end: (ended) => props.onChange(valueAt(ended)),
    cancel: () => props.onInput?.(before),
    tapDistance: 0
  });
  const onKeyDown: JSX.EventHandler<HTMLDivElement, KeyboardEvent> = (event) => {
    const step = (props.max - props.min) / 100;
    const delta = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step }[event.key];
    if (delta !== undefined && !props.disabled) {
      event.preventDefault();
      props.onChange(Math.min(props.max, Math.max(props.min, props.value + delta)));
    }
  };

  return (
    <div
      class={styles.slider}
      role="slider"
      tabindex={props.disabled ? -1 : 0}
      aria-label={props.label}
      aria-valuemin={props.min}
      aria-valuemax={props.max}
      aria-valuenow={props.value}
      aria-valuetext={props.valueText}
      aria-disabled={props.disabled ? 'true' : undefined}
      style={{ '--fraction': fraction(), '--track': props.background }}
      data-custom-track={props.background ? '' : undefined}
      {...press}
      onKeyDown={onKeyDown}
    >
      <span class={styles.track} />
      <span class={styles.thumb} />
    </div>
  );
}

/** The thumb's diameter in CSS pixels; it travels between the track's ends. */
const thumbSize = 24;
