import { createSignal } from 'solid-js';
import styles from './ScrubNumber.module.css';

/**
 * A number field made for a pen: press it and drag sideways to change the value, as Krita's slider fields and
 * Procreate's sliders do. Moving the pointer away from the field, up or down, makes each sideways movement count for
 * less, for fine steps. A press that does not move edits the number with the keyboard instead; the Up and Down keys
 * step it, ten steps with Shift. A bounded field fills in proportion to its value.
 *
 * `onInput` follows the drag; `onChange` receives the value when the drag ends or a typed entry is committed with
 * Enter or by leaving the field, so that a drag commits one change. Escape cancels typing. An entry that is not a
 * number keeps the value; others are clamped to `min` and `max` and rounded to `step`.
 */
export function ScrubNumber(props: {
  /** Accessible name and tooltip. */
  label: string;
  value: number;
  min?: number | undefined;
  max?: number | undefined;
  /** Rounding of values; 1 by default. */
  step?: number;
  /** Shown after the number, such as `px` or `%`. */
  unit?: string;
  /**
   * How a drag maps to the value: `linear` crosses a bounded range in about {@link dragSpan} CSS pixels, an unbounded
   * one by a step per pixel; `log` doubles the value every {@link doublingSpan} pixels, for ranges such as 0.5–250.
   */
  scale?: 'linear' | 'log' | undefined;
  /** Change per CSS pixel of a linear drag without bounds; `step` by default. */
  rate?: number | undefined;
  /** Values past `max` continue from `min` and the reverse, as angles do; otherwise they stop at the bounds. */
  wrap?: boolean | undefined;
  disabled?: boolean;
  /** The value while it is dragged. */
  onInput?: (value: number) => void;
  /** The committed value. */
  onChange: (value: number) => void;
}) {
  let input!: HTMLInputElement;
  /** The value shown while dragging; the committed `value` otherwise. */
  const [draft, setDraft] = createSignal<number>();
  const [editing, setEditing] = createSignal(false);
  /** The press in progress: where it started and the unrounded value it has reached. */
  let press: { id: number; x: number; y: number; lastX: number; raw: number; scrubbing: boolean } | undefined;
  const step = () => props.step ?? 1;
  const shown = () => draft() ?? props.value;
  const bounded = () => props.min !== undefined && props.max !== undefined;
  const fill = () =>
    bounded() ? Math.min(1, Math.max(0, (shown() - props.min!) / (props.max! - props.min! || 1))) : 0;
  const settle = (value: number) => {
    const rounded = Math.round(value / step()) * step();
    const clamped =
      props.wrap && bounded()
        ? props.min! +
          ((((rounded - props.min!) % (props.max! - props.min!)) + (props.max! - props.min!)) %
            (props.max! - props.min!))
        : Math.min(props.max ?? Infinity, Math.max(props.min ?? -Infinity, rounded));
    // Steps such as 0.1 leave binary noise behind.
    return Number(clamped.toFixed(decimals(step())));
  };
  const text = () => `${settle(shown())}`;

  return (
    <span
      class={styles.scrub}
      data-editing={editing() ? 'true' : 'false'}
      data-disabled={props.disabled ? 'true' : 'false'}
      style={{ '--fill': `${fill() * 100}%` }}
      title={`${props.label}: drag sideways; farther from the field for finer steps, or tap to type`}
    >
      <input
        ref={input}
        aria-label={props.label}
        role="spinbutton"
        aria-valuenow={settle(shown())}
        aria-valuemin={props.min}
        aria-valuemax={props.max}
        inputmode="decimal"
        disabled={props.disabled}
        value={text()}
        onPointerDown={(event) => {
          if (editing() || props.disabled || (event.pointerType === 'mouse' && event.button !== 0)) {
            return;
          }

          // Neither a caret nor the on-screen keyboard until the press turns out to be a tap.
          event.preventDefault();
          input.setPointerCapture(event.pointerId);
          press = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            lastX: event.clientX,
            raw: props.value,
            scrubbing: false
          };
        }}
        onPointerMove={(event) => {
          if (press?.id !== event.pointerId) {
            return;
          }

          if (!press.scrubbing && Math.abs(event.clientX - press.x) < deadZone) {
            return;
          }

          press.scrubbing = true;
          const rect = input.getBoundingClientRect();
          const away = Math.max(0, Math.abs(event.clientY - (rect.top + rect.height / 2)) - rect.height);
          const moved = (event.clientX - press.lastX) / (1 + away / fineningSpan);
          press.lastX = event.clientX;
          press.raw = advance(press.raw, moved);
          const next = settle(press.raw);
          if (next !== draft()) {
            setDraft(next);
            props.onInput?.(next);
          }
        }}
        onPointerUp={(event) => {
          if (press?.id !== event.pointerId) {
            return;
          }

          const ended = press;
          press = undefined;
          if (ended.scrubbing) {
            const value = draft();
            setDraft(undefined);
            if (value !== undefined && value !== props.value) {
              props.onChange(value);
            }

            return;
          }

          setEditing(true);
          input.focus();
          input.select();
        }}
        onPointerCancel={() => {
          press = undefined;
          setDraft(undefined);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            input.blur();
            return;
          }

          if (event.key === 'Escape') {
            input.value = text();
            input.blur();
            return;
          }

          const direction = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
          if (direction) {
            event.preventDefault();
            const next = settle(props.value + direction * step() * (event.shiftKey ? 10 : 1));
            if (next !== props.value) {
              props.onChange(next);
            }
          }
        }}
        onFocus={() => setEditing(true)}
        onBlur={() => setEditing(false)}
        onChange={(event) => {
          const typed = Number(event.currentTarget.value.replace(',', '.'));
          const next = Number.isFinite(typed) && event.currentTarget.value.trim() !== '' ? settle(typed) : props.value;
          // Show the settled value even when it equals the current one, which leaves the bound `value` unchanged.
          event.currentTarget.value = `${next}`;
          if (next !== props.value) {
            props.onChange(next);
          }
        }}
      />
      {props.unit && <span class={styles.unit}>{props.unit}</span>}
    </span>
  );

  /** The unrounded value after a sideways movement of `moved` CSS pixels from `raw`. */
  function advance(raw: number, moved: number) {
    if (props.scale === 'log') {
      const floor = props.min !== undefined && props.min > 0 ? props.min : step();
      return Math.max(floor, raw) * 2 ** (moved / doublingSpan);
    }

    const perPixel = bounded() ? (props.max! - props.min!) / dragSpan : (props.rate ?? step());
    return raw + moved * perPixel;
  }
}

/** CSS pixels of a drag across a bounded linear range. */
export const dragSpan = 240;

/** CSS pixels of a drag that doubles a logarithmic value. */
export const doublingSpan = 50;

/** CSS pixels a press may move before it drags, so that a pen's tap does not. */
const deadZone = 3;

/** Every this many CSS pixels away from the field halve, then third, … what a movement counts for. */
const fineningSpan = 60;

function decimals(step: number) {
  const text = `${step}`;
  return text.includes('.') ? text.length - text.indexOf('.') - 1 : 0;
}
