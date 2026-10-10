import type { JSX } from '@solidjs/web';
import { createSignal, Show } from 'solid-js';
import { pressHandlers, type Press } from '../../shared/ui/pressHandlers';
import styles from './Sidebar.module.css';
import { trackFraction } from './sliderScale';

/**
 * One of the sidebar's vertical sliders, as in Procreate: a groove with a light rectangular thumb. A press anywhere
 * on the slider moves the thumb there and drags it; values follow the drag at once. While a press is held, `preview`
 * shows beside the sidebar at the thumb's height (on the canvas side), like Procreate's size and opacity bubbles.
 * `toFraction` and `fromFraction` map values to the thumb's place, 0 at the bottom.
 */
export function SidebarSlider(props: {
  label: string;
  value: number;
  toFraction: (value: number) => number;
  fromFraction: (fraction: number) => number;
  /** Whether the preview opens to the right of the sidebar (a left sidebar) or to its left. */
  side: 'left' | 'right';
  disabled?: boolean;
  /** The value text read by assistive technology. */
  valueText: string;
  onChange: (value: number) => void;
  /** Steps for the arrow keys, as fractions of the track. */
  keyStep?: number;
  preview: JSX.Element;
}) {
  const [dragging, setDragging] = createSignal(false);
  const fraction = () => props.toFraction(props.value);
  /** The value when the press started, restored if the browser cancels the press. */
  let before = 0;
  const valueAt = (press: Press) => {
    const rect = press.target.getBoundingClientRect();
    return props.fromFraction(trackFraction(rect.bottom - press.point.y, rect.height, thumbHeight));
  };
  // Created once: a spread of a call would be re-evaluated, and lose the press, when another attribute changes.
  const press = pressHandlers({
    start: (started) => {
      if (props.disabled) {
        return false;
      }

      before = props.value;
      setDragging(true);
      props.onChange(valueAt(started));
    },
    move: (moved) => props.onChange(valueAt(moved)),
    end: (ended) => {
      setDragging(false);
      props.onChange(valueAt(ended));
    },
    cancel: () => {
      setDragging(false);
      props.onChange(before);
    },
    tapDistance: 0
  });
  const onKeyDown: JSX.EventHandler<HTMLDivElement, KeyboardEvent> = (event) => {
    const step = props.keyStep ?? 0.02;
    const delta = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step }[event.key];
    if (delta !== undefined && !props.disabled) {
      event.preventDefault();
      props.onChange(props.fromFraction(Math.min(1, Math.max(0, fraction() + delta))));
    }
  };

  return (
    <div
      class={styles.slider}
      role="slider"
      aria-orientation="vertical"
      aria-label={props.label}
      aria-valuetext={props.valueText}
      aria-valuenow={props.value}
      aria-disabled={props.disabled ? 'true' : undefined}
      tabindex={props.disabled ? -1 : 0}
      style={{ '--fraction': `${fraction()}` }}
      data-dragging={dragging() ? '' : undefined}
      {...press}
      onKeyDown={onKeyDown}
    >
      <span class={styles.groove} />
      <span class={styles.thumb} />
      <Show when={dragging()}>
        <div class={styles.preview} data-side={props.side} aria-hidden="true">
          {props.preview}
        </div>
      </Show>
    </div>
  );
}

/** The thumb's height in CSS pixels; it travels between the groove's ends. */
const thumbHeight = 18;

/**
 * The bubble shown while a sidebar slider is dragged: the brush's dab at its on-screen size, or a fixed dab at the
 * brush opacity over a checkerboard, with the value underneath.
 */
export function BrushPreview(props: {
  /** The dab's diameter in CSS pixels; drawn at most as wide as the bubble. */
  diameter: number;
  color: string;
  opacity: number;
  /** Draws a checkerboard behind the dab, so that its transparency shows. */
  checkered?: boolean;
  label: string;
}) {
  return (
    <div class={styles.bubble} data-checkered={props.checkered ? '' : undefined}>
      <span class={styles.dabArea}>
        <span
          class={styles.dab}
          style={{
            width: `${Math.min(maxDab, Math.max(2, props.diameter))}px`,
            height: `${Math.min(maxDab, Math.max(2, props.diameter))}px`,
            background: props.color,
            opacity: props.opacity
          }}
        />
      </span>
      <span class={styles.value}>{props.label}</span>
    </div>
  );
}

/** The largest dab the bubble draws, in CSS pixels. */
const maxDab = 92;
