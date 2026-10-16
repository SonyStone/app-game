import type { JSX } from '@solidjs/web';
import { createMemo, For, Show } from 'solid-js';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import { colorRing, fanLayout, historyRing, toolRing } from './fanLayout';
import type { Point, ViewSize } from './placement';
import { tapOrHold } from './tapOrHold';
import { shapeNames, type ToolSlot } from './tools';
import { ToolShape } from './ToolShape';
import styles from './ZenStudio.module.css';

/**
 * What a tap on the pebble fans out, in three arcs around it, opening toward the open space (see `inwardAngle`):
 * undo, "more" and redo nearest (undo on the counterclockwise side, as on the rewind dial), then the five brushes and
 * the eraser as tool shapes pointing at the pebble, then a row of colors, the current one first. A long press on a
 * brush chooses its preset, one on a color opens the color disc. `quiet` leaves only the nearest arc, while a sheet is
 * open beside it.
 */
export function Fan(props: {
  center: Point;
  inward: number;
  view: ViewSize;
  quiet: boolean;
  slots: readonly ToolSlot[];
  /** The slot painting now, if the brush tool uses one. */
  active?: number;
  erasing: boolean;
  /** The colors to offer, the current one first. */
  colors: readonly string[];
  canUndo: boolean;
  canRedo: boolean;
  moreOpen: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onMore: () => void;
  onSlot: (index: number) => void;
  onSlotHold: (index: number) => void;
  onEraser: () => void;
  onColor: (color: string) => void;
  onColorHold: (color: string) => void;
}) {
  const layout = createMemo(() =>
    fanLayout(props.center, props.inward, props.view, [
      historyRing,
      { ...toolRing, count: props.slots.length + 1 },
      { ...colorRing, count: props.colors.length }
    ])
  );
  /** Places an item at its point, flying out of the pebble with a delay by `order`. */
  const placed = (point: Point | undefined, order: number): JSX.CSSProperties => ({
    left: `${point?.x ?? props.center.x}px`,
    top: `${point?.y ?? props.center.y}px`,
    '--from-x': `${props.center.x - (point?.x ?? props.center.x)}px`,
    '--from-y': `${props.center.y - (point?.y ?? props.center.y)}px`,
    'animation-delay': `${order * 14}ms`
  });
  /** The rotation that points a tool's tip, drawn downward, away from the pebble, as tools fanned out in a hand. */
  const outward = (point: Point | undefined) =>
    point ? Math.atan2(point.y - props.center.y, point.x - props.center.x) - Math.PI / 2 : 0;
  const history = () => layout()[0]?.points ?? [];
  const tools = () => layout()[1]?.points ?? [];
  const swatches = () => layout()[2]?.points ?? [];

  return (
    <div class={styles.fan} data-zen-ui="">
      <button
        class={[styles.item, styles.round]}
        style={placed(history()[0], 0)}
        aria-label="Undo"
        aria-keyshortcuts="Control+Z Meta+Z"
        title="Undo · two-finger tap"
        disabled={!props.canUndo}
        onClick={() => props.onUndo()}
      >
        <SketchIcon name="undo" size={20} />
      </button>
      <button
        class={[styles.item, styles.round]}
        style={placed(history()[1], 1)}
        aria-label="Layers and export"
        aria-expanded={props.moreOpen ? 'true' : 'false'}
        title="Layers and export"
        onClick={() => props.onMore()}
      >
        <SketchIcon name="more" size={20} />
      </button>
      <button
        class={[styles.item, styles.round]}
        style={placed(history()[2], 2)}
        aria-label="Redo"
        aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
        title="Redo · three-finger tap"
        disabled={!props.canRedo}
        onClick={() => props.onRedo()}
      >
        <SketchIcon name="redo" size={20} />
      </button>
      <Show when={!props.quiet}>
        <For each={props.slots} keyed={false}>
          {(slot, index) => {
            const press = tapOrHold({ tap: () => props.onSlot(index), hold: () => props.onSlotHold(index) });
            return (
              <div
                class={[styles.item, styles.tool]}
                role="button"
                aria-label={`${shapeNames[slot().shape]} · hold to choose its brush`}
                aria-pressed={props.active === index ? 'true' : 'false'}
                style={placed(tools()[index], 3 + index)}
                {...press}
              >
                <span style={{ rotate: `${outward(tools()[index])}rad` }}>
                  <ToolShape shape={slot().shape} ink={props.colors[0] ?? '#000'} size={46} />
                </span>
              </div>
            );
          }}
        </For>
        <button
          class={[styles.item, styles.tool]}
          aria-label="Eraser"
          aria-pressed={props.erasing ? 'true' : 'false'}
          style={placed(tools()[props.slots.length], 3 + props.slots.length)}
          onClick={() => props.onEraser()}
        >
          <span style={{ rotate: `${outward(tools()[props.slots.length])}rad` }}>
            <ToolShape shape="eraser" ink="none" size={46} />
          </span>
        </button>
        <For each={props.colors} keyed={false}>
          {(color, index) => {
            const press = tapOrHold({
              tap: () => (index === 0 ? props.onColorHold(color()) : props.onColor(color())),
              hold: () => props.onColorHold(color())
            });
            return (
              <div
                class={[styles.item, styles.swatch]}
                role="button"
                aria-label={index === 0 ? `Current color ${color()} · tap for the color disc` : `Color ${color()}`}
                data-current={index === 0 ? '' : undefined}
                style={{ ...placed(swatches()[index], 10 + index), '--swatch': color() }}
                {...press}
              />
            );
          }}
        </For>
      </Show>
    </div>
  );
}
