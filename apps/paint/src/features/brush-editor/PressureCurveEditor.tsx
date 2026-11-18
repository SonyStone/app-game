import { calibratePressure } from '@app-game/paint-core/strokeSettings';
import { createMemo, createSignal, For } from 'solid-js';
import { pressHandlers } from '../../shared/ui/pressHandlers';
import styles from './PressureCurveEditor.module.css';

/**
 * A pen's pressure curve as one control: a graph with the pen's pressure across and the pressure the brush gets up,
 * the curve drawn by `calibratePressure` itself, and three handles on it. The minimum's handle lies on the bottom
 * edge and the maximum's on the top edge, each moving across; the firmness handle lies on the curve halfway between
 * them and bends it, up for a softer response and down for a firmer one. Each handle shows its value on a chip next
 * to it, in percent; a drag of the handle or its chip moves it from where it was, without a jump, and a tap on either
 * calls `onEntry` for the host to offer number entry. Handles keep the values valid: the minimum stays below the
 * maximum, by at least {@link pressureCurveBounds}' `gap`, and firmness within its range. Arrow keys move a
 * focused handle.
 *
 * While a pen presses on the graph away from the handles, a dot and thin guides mark where its raw pressure falls on
 * the curve, so the user sees their own press; the mouse and fingers have no pressure, and show nothing.
 *
 * Controlled: `onInput` receives a handle's new value as the drag goes, and the host echoes it back, rounded, through
 * the props. Knows nothing about brushes or where it lies. The host colors it through custom properties, each with a
 * fallback: `--curve-ground` (the graph), `--curve-line` (its frame and the straight diagonal), `--curve-ink` (the
 * curve), `--curve-handle` and `--curve-handle-ink` (the handles and their chips), `--curve-pen` (the pen's mark),
 * `--curve-radius` and `--curve-text` (the chips' type size).
 */
export function PressureCurveEditor(props: {
  /** Raw pressure, 0 to 1, that maps to none. */
  minimum: number;
  /** Raw pressure, 0 to 1, that maps to full. */
  maximum: number;
  /** The curve's exponent: 1 is straight, above 1 needs a firmer press. */
  firmness: number;
  /** The graph's accessible name, such as "Pressure curve". */
  label: string;
  /** Shows the curve greyed and takes no presses or keys. */
  disabled?: boolean;
  /** A handle's press or key starts an edit. */
  onStart?: () => void;
  /** A handle moved to `value`, already within its bounds. */
  onInput: (handle: CurveHandle, value: number) => void;
  /** The edit a handle's press or key made is done. */
  onCommit?: () => void;
  /** The browser cancelled a handle's press: the host restores what it had at `onStart`. */
  onCancel?: () => void;
  /** A tap on a handle or its chip, with the chip to anchor number entry to; chips are plain values without it. */
  onEntry?: (handle: CurveHandle, chip: Element) => void;
  /** Added to the editor's own class, for a host's size and colors. */
  class?: string;
}) {
  const [pen, setPen] = createSignal<number>();
  let plot!: HTMLDivElement;
  const curve = createMemo(() => pressureCurvePath(props));
  const firmnessHeight = () => 0.5 ** props.firmness;
  const penOutput = () => {
    const raw = pen();
    return raw === undefined ? undefined : calibratePressure(props, raw);
  };
  const penHandlers = pressHandlers({
    start: (_press, event) => {
      const onHandle = event.target instanceof Element && event.target.closest('[data-curve-handle]');
      if (props.disabled || event.pointerType !== 'pen' || onHandle) {
        return false;
      }

      setPen(clampUnit(event.pressure));
    },
    move: (_press, event) => setPen(clampUnit(event.pressure)),
    end: () => setPen(undefined),
    cancel: () => setPen(undefined)
  });

  return (
    <div
      class={[styles.editor, props.class]}
      role="group"
      aria-label={props.label}
      aria-disabled={props.disabled ? 'true' : undefined}
      data-disabled={props.disabled ? '' : undefined}
    >
      <div ref={(element) => (plot = element)} class={styles.plot} {...penHandlers}>
        <svg class={styles.graph} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path class={styles.diagonal} d="M0 100 L100 0" />
          <path class={styles.curve} d={curve()} />
          <path
            class={styles.guides}
            d={pen() === undefined ? '' : `M${pen()! * 100} 100 V${100 - penOutput()! * 100} H0`}
          />
        </svg>
        <span
          class={styles.penDot}
          hidden={pen() === undefined}
          style={{ left: `${(pen() ?? 0) * 100}%`, top: `${100 - (penOutput() ?? 0) * 100}%` }}
        />
        <For each={handles}>
          {(handle) => (
            <Handle
              handle={handle}
              x={
                handle === 'minimum'
                  ? props.minimum
                  : handle === 'maximum'
                    ? props.maximum
                    : (props.minimum + props.maximum) / 2
              }
              y={handle === 'minimum' ? 0 : handle === 'maximum' ? 1 : firmnessHeight()}
              text={`${Math.round((props[handle] as number) * 100)}%`}
              chip={
                handle === 'firmness'
                  ? props.firmness >= 1
                    ? 'above'
                    : 'below'
                  : handle === 'minimum'
                    ? 'below'
                    : 'above'
              }
              editor={props}
              plot={() => plot}
            />
          )}
        </For>
      </div>
    </div>
  );
}

/** The curve's three handles. */
export type CurveHandle = 'minimum' | 'maximum' | 'firmness';

/**
 * The values the handles keep to, as `normalizeStrokeSettings` bounds them: the minimum from 0, the maximum up to 1,
 * at least `gap` between them, and firmness from `firmness.min` to `firmness.max`.
 */
export const pressureCurveBounds = { gap: 0.01, firmness: { min: 0.1, max: 5 } };

const handles: readonly CurveHandle[] = ['minimum', 'maximum', 'firmness'];

/** `handle`'s `value` within the bounds the other two leave it. */
export function boundCurveValue(
  values: { minimum: number; maximum: number },
  handle: CurveHandle,
  value: number
): number {
  const { gap, firmness } = pressureCurveBounds;

  return handle === 'minimum'
    ? clamp(value, 0, values.maximum - gap)
    : handle === 'maximum'
      ? clamp(value, values.minimum + gap, 1)
      : clamp(value, firmness.min, firmness.max);
}

/**
 * A handle at `x` across and `y` up the graph, both 0 to 1, with its value's chip `above` or `below` it. A press on it
 * or its chip drags it from its value at the press; the firmness handle moves up and down, the others across. A tap
 * offers number entry; arrow keys step it by {@link keyStep}.
 */
function Handle(props: {
  handle: CurveHandle;
  x: number;
  y: number;
  text: string;
  chip: 'above' | 'below';
  editor: Parameters<typeof PressureCurveEditor>[0];
  plot: () => HTMLElement;
}) {
  let chip!: HTMLSpanElement;
  let start: { minimum: number; maximum: number; firmness: number } | undefined;
  const editor = () => props.editor;
  const move = (value: number) => {
    const next = boundCurveValue(editor(), props.handle, value);
    if (next !== editor()[props.handle]) {
      editor().onInput(props.handle, next);
    }
  };
  const drag = pressHandlers({
    start: () => {
      if (editor().disabled) {
        return false;
      }

      start = { minimum: editor().minimum, maximum: editor().maximum, firmness: editor().firmness };
      editor().onStart?.();
    },
    move: (press) => {
      if (!start || !press.moved) {
        return;
      }

      const rect = props.plot().getBoundingClientRect();
      if (props.handle === 'firmness') {
        const height = 0.5 ** start.firmness - (press.point.y - press.start.y) / Math.max(1, rect.height);
        move(Math.log(clamp(height, 1e-6, 1)) / Math.log(0.5));
      } else {
        move(start[props.handle] + (press.point.x - press.start.x) / Math.max(1, rect.width));
      }
    },
    end: () => {
      start = undefined;
      editor().onCommit?.();
    },
    tap: () => {
      start = undefined;
      editor().onCommit?.();
      editor().onEntry?.(props.handle, chip);
    },
    cancel: () => {
      start = undefined;
      editor().onCancel?.();
    }
  });

  return (
    <span
      class={styles.handle}
      data-curve-handle={props.handle}
      data-chip={props.chip}
      role="slider"
      tabindex={editor().disabled ? -1 : 0}
      aria-label={handleNames[props.handle]}
      aria-orientation={props.handle === 'firmness' ? 'vertical' : 'horizontal'}
      aria-valuenow={Math.round(editor()[props.handle] * 100)}
      aria-valuetext={props.text}
      aria-disabled={editor().disabled ? 'true' : undefined}
      style={{ left: `${props.x * 100}%`, top: `${(1 - props.y) * 100}%`, '--across': `${props.x}` }}
      {...drag}
      onKeyDown={(event) => {
        const by = keyDirection[event.key];
        if (by === undefined || editor().disabled) {
          return;
        }

        event.preventDefault();
        editor().onStart?.();
        // Firmness goes down as its handle goes up: up and right soften the curve.
        const value = editor()[props.handle];
        move(props.handle === 'firmness' ? value - by * keyStep.firmness : value + by * keyStep.range);
        editor().onCommit?.();
      }}
    >
      <span class={styles.dot} />
      <span ref={(element) => (chip = element)} class={styles.chip} data-entry={editor().onEntry ? '' : undefined}>
        {props.text}
      </span>
    </span>
  );
}

const handleNames: Record<CurveHandle, string> = {
  minimum: 'Minimum pressure',
  maximum: 'Maximum pressure',
  firmness: 'Firmness'
};

/** How far an arrow key moves a handle: the range's ends by a percent, firmness by five. */
const keyStep = { range: 0.01, firmness: 0.05 };

const keyDirection: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };

/**
 * The curve as an SVG path in a 100 × 100 box, up being 0: flat at none up to the minimum, `calibratePressure` between
 * the minimum and the maximum, and flat at full after it. Drawn with `preserveAspectRatio="none"`, it fills any box.
 */
export function pressureCurvePath(values: { minimum: number; maximum: number; firmness: number }) {
  const points = Array.from({ length: curveSamples + 1 }, (_, index) => {
    const raw = values.minimum + ((values.maximum - values.minimum) * index) / curveSamples;
    return `${(raw * 100).toFixed(2)} ${(100 - calibratePressure(values, raw) * 100).toFixed(2)}`;
  });

  return `M0 100 L${points.join(' L')} L100 0`;
}

/** Points the curve is drawn through between its ends. */
const curveSamples = 64;

function clampUnit(value: number) {
  return clamp(Number.isFinite(value) ? value : 0, 0, 1);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
