import { curvePosition, curveValue, type SliderCurve } from '@app-game/abr-brush/sliderCurves';
import { pressHandlers } from '../../shared/ui/pressHandlers';
import styles from './BrushEditor.module.css';

/**
 * A horizontal slider for the pen, a finger and the mouse. A press anywhere on it moves the thumb to the press at
 * once, and the drag follows the pointer even off the slider, since the press captures it; the slider takes the
 * whole height of its row as its press target and never lets a drag scroll the page. The arrow keys step it, Page Up
 * and Page Down by ten steps, Home and End go to the ends.
 *
 * Controlled: `onInput` receives the unrounded value under the pointer, and the caller rounds, clamps and echoes it
 * back through `value`. With a `curve`, positions map to values through it, as the brush size slider does.
 */
export function Slider(props: {
  /** ID of the element naming the slider. */
  labelledBy: string;
  value: number;
  min: number;
  max: number;
  /** Keyboard step; 1 by default. */
  step?: number;
  /** Positions from 0 to 1 and their values; linear between `min` and `max` without it. */
  curve?: SliderCurve | undefined;
  /** The value as read aloud, such as `32 px`. */
  valueText: string;
  /** Shows the value but takes no presses or keys. */
  disabled?: boolean;
  /** The value at the pointer while the slider is pressed or dragged, or the value a key stepped to. */
  onInput: (value: number) => void;
}) {
  let rail!: HTMLSpanElement;
  const position = () => {
    const span = props.max - props.min;
    const raw = props.curve ? curvePosition(props.curve, props.value) : span ? (props.value - props.min) / span : 0;
    return Math.min(1, Math.max(0, raw));
  };
  const valueAt = (clientX: number) => {
    const rect = rail.getBoundingClientRect();
    const at = rect.width > 0 ? Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) : 0;
    return props.curve ? curveValue(props.curve, at) : props.min + at * (props.max - props.min);
  };
  const handlers = pressHandlers({
    start: (press) => {
      if (props.disabled) {
        return false;
      }

      props.onInput(valueAt(press.point.x));
    },
    move: (press) => props.onInput(valueAt(press.point.x))
  });

  return (
    <span
      class={styles.slider}
      role="slider"
      tabindex={props.disabled ? -1 : 0}
      aria-labelledby={props.labelledBy}
      aria-valuemin={props.min}
      aria-valuemax={props.max}
      aria-valuenow={props.value}
      aria-valuetext={props.valueText}
      aria-disabled={props.disabled ? 'true' : 'false'}
      {...handlers}
      onKeyDown={(event) => {
        const step = props.step ?? 1;
        const next =
          event.key === 'ArrowRight' || event.key === 'ArrowUp'
            ? props.value + step
            : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
              ? props.value - step
              : event.key === 'PageUp'
                ? props.value + step * 10
                : event.key === 'PageDown'
                  ? props.value - step * 10
                  : event.key === 'Home'
                    ? props.min
                    : event.key === 'End'
                      ? props.max
                      : undefined;
        if (next === undefined || props.disabled) {
          return;
        }

        event.preventDefault();
        props.onInput(Math.min(props.max, Math.max(props.min, next)));
      }}
    >
      <span ref={(element) => (rail = element)} class={styles.rail} style={{ '--position': `${position() * 100}%` }}>
        <span class={styles.thumb} />
      </span>
    </span>
  );
}
