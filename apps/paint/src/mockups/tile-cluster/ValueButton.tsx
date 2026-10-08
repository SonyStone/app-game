import { For, Show } from 'solid-js';
import { BRUSH_SIZE_PRESETS } from '../../features/brush-size';
import { createPickPopup, placeAt, type PopupRect } from './createPickPopup';
import styles from './ValueButton.module.css';

/**
 * A number as a compact button, its label above its value, that opens a grid of preset values right under the
 * pointer, the current value's dot where the press is: Paint's brush size grid (`BrushSizeGrid`) generalized to every
 * number. Press it, slide onto a value and lift, or tap it and then tap or slide. Each row of the grid works as a slider: the middle of a cell gives its preset, and toward a
 * neighbour the value moves on to halfway to that neighbour's preset, geometrically for `scale="log"` and linearly
 * otherwise. Closing without a pick restores the value from before; `onPreview` follows the value pointed at.
 */
export function ValueButton(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  /** Rounding of values between presets; 1 by default. */
  step?: number;
  unit?: string;
  scale?: 'log' | undefined;
  /** Preset values; round values over the range by default, or brush sizes for `scale="log"`. */
  presets?: readonly number[] | undefined;
  /** Cells show dots as large as their sizes, as the brush size grid does. */
  dots?: boolean | undefined;
  /** Shows a value; one decimal below 10 and whole numbers above by default. */
  format?: (value: number) => string;
  /** `inline` puts the label and the value on one line, for narrow columns. */
  layout?: 'stacked' | 'inline';
  onPreview: (value: number) => void;
  onPick: (value: number) => void;
}) {
  const text = (value: number) => (props.format ?? format)(value);
  let original = 0;
  let presets: readonly number[] = [];
  /** Where the value from before lies in the grid, for the thumb until the pointer moves. */
  let current = { index: 0, row: 0, x: 0 };
  const pick = createPickPopup<ValuePick>({
    place(point) {
      original = props.value;
      presets = props.presets ?? defaultPresets(props.min, props.max, props.scale);
      current = positionOf(presets, props.value, props);
      const width = columns * cellWidth + 2 * padding;
      const height = header + Math.ceil(presets.length / columns) * cellHeight + 2 * padding;
      // The current value's place in its row lies under the pointer.
      return placeAt(point, width, height, {
        x: padding + current.x,
        y: padding + header + current.row * cellHeight + dotArea / 2
      });
    },
    hit: (popup, x, y) => valueAt(popup, presets, x, y, props),
    onPreview: (choice) => props.onPreview(choice?.value ?? original),
    onPick: (choice) => props.onPick(choice.value)
  });

  return (
    <>
      <button
        ref={pick.bindButton}
        class={[styles.button, styles[props.layout ?? 'stacked'], { [styles.active!]: !!pick.popup() }]}
        aria-label={props.label}
        aria-haspopup="dialog"
        aria-expanded={pick.popup() ? 'true' : 'false'}
        title={`${props.label}: press and slide to a value, or tap`}
        {...pick.buttonEvents}
      >
        <span class={styles.label}>{props.label}</span>
        <span class={styles.value}>
          {text(props.value)}
          <small>{props.unit}</small>
        </span>
      </button>
      <Show when={pick.popup()}>
        {(open) => (
          <div
            ref={pick.bindPopup}
            class={styles.popup}
            role="dialog"
            aria-label={props.label}
            style={{
              left: `${open().left}px`,
              top: `${open().top}px`,
              width: `${open().width}px`,
              height: `${open().height}px`
            }}
            {...pick.popupEvents}
          >
            <div class={styles.header}>
              {props.label} <b>{text(pick.hover()?.value ?? props.value)}</b>
              <small>{props.unit}</small>
            </div>
            <div class={styles.cells}>
              <svg
                class={styles.strings}
                width={columns * cellWidth}
                height={Math.ceil(presets.length / columns) * cellHeight}
                aria-hidden="true"
              >
                <For each={Array.from({ length: Math.ceil(presets.length / columns) }, (_, row) => row)}>
                  {(row) => (
                    <line
                      x1={cellWidth / 2}
                      x2={(Math.min(columns, presets.length - row * columns) - 0.5) * cellWidth}
                      y1={row * cellHeight + dotArea / 2}
                      y2={row * cellHeight + dotArea / 2}
                    />
                  )}
                </For>
              </svg>
              <For each={presets}>
                {(preset, index) => (
                  <div
                    class={styles.cell}
                    data-current={index() === current.index || undefined}
                    data-exact={(pick.hover()?.exact && pick.hover()?.preset === preset) || undefined}
                  >
                    <span class={styles.mark} style={{ height: `${dotArea}px` }}>
                      <span
                        class={styles.dot}
                        style={{
                          width: `${dotSize(preset, props.dots)}px`,
                          height: `${dotSize(preset, props.dots)}px`
                        }}
                      />
                    </span>
                    <span class={styles.cellLabel}>{text(preset)}</span>
                  </div>
                )}
              </For>
              <Show when={!(pick.hover() ?? { exact: original === presets[current.index] }).exact}>
                <span
                  class={styles.thumb}
                  style={{
                    left: `${(pick.hover() ?? current).x}px`,
                    top: `${(pick.hover() ?? current).row * cellHeight}px`
                  }}
                />
              </Show>
            </div>
          </div>
        )}
      </Show>
    </>
  );
}

/** What the pointer points at: the value, the preset of its cell, and where the thumb goes in the cells. */
type ValuePick = { value: number; preset: number; exact: boolean; row: number; x: number };

const columns = 7;
const cellWidth = 40;
const cellHeight = 44;
const dotArea = 28;
const padding = 4;
const header = 24;
/** Share of a cell's width, around its middle, that gives the cell's preset exactly. */
const exactShare = 0.4;

/** The value under `(x, y)`: a cell's preset in its middle, moving on toward a neighbour's toward the cell's edges. */
function valueAt(
  popup: PopupRect,
  presets: readonly number[],
  x: number,
  y: number,
  range: { min: number; max: number; step?: number; scale?: 'log' | undefined }
): ValuePick | undefined {
  const localX = x - popup.left - padding;
  const column = Math.floor(localX / cellWidth);
  const row = Math.floor((y - popup.top - padding - header) / cellHeight);
  const index = row * columns + column;
  const preset = column >= 0 && column < columns && row >= 0 ? presets[index] : undefined;
  if (preset === undefined) {
    return undefined;
  }

  const offset = (localX - (column + 0.5) * cellWidth) / (cellWidth / 2);
  const toward = Math.abs(offset) <= exactShare ? 0 : (Math.abs(offset) - exactShare) / (1 - exactShare);
  const neighbour = offset > 0 ? (presets[index + 1] ?? range.max) : (presets[index - 1] ?? range.min);
  if (toward === 0 || neighbour === preset) {
    return { value: preset, preset, exact: true, row, x: (column + 0.5) * cellWidth };
  }

  const between =
    range.scale === 'log' && preset > 0 && neighbour > 0
      ? preset * (neighbour / preset) ** (toward / 2)
      : preset + ((neighbour - preset) * toward) / 2;
  const step = range.step ?? 1;
  const value = Math.min(range.max, Math.max(range.min, Math.round(between / step) * step));
  return { value, preset, exact: value === preset, row, x: localX };
}

/**
 * Where `value` lies in the grid: the cell of the nearest preset and the x along the row where `valueAt` gives
 * `value`, inverting its slide toward the neighbouring preset.
 */
function positionOf(
  presets: readonly number[],
  value: number,
  range: { min: number; max: number; scale?: 'log' | undefined }
) {
  const index = presets.reduce(
    (best, preset, at) => (Math.abs(preset - value) < Math.abs(presets[best]! - value) ? at : best),
    0
  );
  const preset = presets[index]!;
  const row = Math.floor(index / columns);
  const center = ((index % columns) + 0.5) * cellWidth;
  const direction = value > preset ? 1 : -1;
  const neighbour = direction > 0 ? (presets[index + 1] ?? range.max) : (presets[index - 1] ?? range.min);
  if (value === preset || neighbour === preset) {
    return { index, row, x: center };
  }

  const toward =
    range.scale === 'log' && value > 0 && preset > 0 && neighbour > 0
      ? (2 * Math.log(value / preset)) / Math.log(neighbour / preset)
      : (2 * (value - preset)) / (neighbour - preset);
  const offset = exactShare + Math.min(1, Math.max(0, toward)) * (1 - exactShare);
  return { index, row, x: center + (direction * offset * cellWidth) / 2 };
}

/**
 * Presets for a range without its own: CLIP STUDIO PAINT's brush sizes for logarithmic ranges, otherwise round
 * values at the smallest of a few round steps that keeps the grid within four rows, with both ends included.
 */
function defaultPresets(min: number, max: number, scale: 'log' | undefined) {
  if (scale === 'log') {
    return BRUSH_SIZE_PRESETS.filter((size) => size >= min && size <= max);
  }

  const span = max - min;
  const step = roundSteps.find((candidate) => span / candidate <= 27) ?? span / 20;
  const values = [min];
  for (let value = Math.ceil(min / step) * step; value < max; value += step) {
    if (value > min) {
      values.push(value);
    }
  }

  values.push(max);
  return values;
}

const roundSteps = [1, 2, 5, 10, 15, 20, 25, 50, 100, 200, 250, 500, 1000];

/** Diameter of a preset's dot: its size for size grids, a small fixed dot otherwise. */
function dotSize(value: number, sizes: boolean | undefined) {
  return sizes ? Math.max(1.5, Math.min(24, value)) : 5;
}

/** A value as the grid shows it: one decimal below 10, whole numbers above. */
function format(value: number) {
  return Math.abs(value) < 10 ? `${Math.round(value * 10) / 10}` : `${Math.round(value)}`;
}
