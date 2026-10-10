import { createSignal, onCleanup, Show } from 'solid-js';
import { pressHandlers, type Press } from '../../shared/ui/pressHandlers';
import styles from './ZenStudio.module.css';
import { pebbleRadius, type Point, type ViewSize } from './placement';
import { scrubAxis, scrubValue } from './scrub';

/**
 * The pebble: the one thing on the page. It shows the brush as a dot of its color, sized by its size and faded by its
 * opacity (a ring for the eraser), or a short `counter` such as rewind steps. A tap runs `onTap`; a press that drags
 * changes the brush, up and down its size and sideways its opacity, with a live preview of the dab beside the press,
 * clear of the hand and the pebble; a press held still for a moment picks the pebble up, and it follows the pointer
 * until dropped.
 */
export function Pebble(props: {
  /** Center in client pixels. */
  center: Point;
  view: ViewSize;
  /** The hand holding the pen: a preview without room above the press goes to the other side. */
  hand: 'left' | 'right';
  /** A stroke is being drawn: the pebble fades out and lets every contact through. */
  hidden: boolean;
  /** Its fan is open. */
  open: boolean;
  /** It is being carried. */
  lifted: boolean;
  brush: { size: number; opacity: number; color: string };
  erasing: boolean;
  /** The view's zoom, for the preview's true on-screen size. */
  zoom: number;
  maxSize: number;
  /** Size and opacity can change now. */
  adjustable: boolean;
  /** Replaces the brush dot while set. */
  counter?: string;
  onTap: () => void;
  onCarry: (point: Point) => void;
  onDrop: (point: Point) => void;
  /** A drag changed the brush. */
  onAdjust: (patch: { size?: number; opacity?: number }) => void;
  /** A drag that changed the brush lifted; `patch` holds its final values. */
  onAdjusted: (patch: { size?: number; opacity?: number }) => void;
}) {
  /** What the press in progress does, once decided. */
  const [mode, setMode] = createSignal<'size' | 'opacity' | 'carry'>();
  /** Where the press is while it drags, which the preview follows. */
  const [pointer, setPointer] = createSignal<Point>();
  let hold: ReturnType<typeof setTimeout> | undefined;
  /** The brush when the press started, and the latest value the drag set. */
  let from = { size: 0, opacity: 1 };
  let last: { size?: number; opacity?: number } = {};
  const stopHold = () => {
    clearTimeout(hold);
    hold = undefined;
  };
  onCleanup(stopHold);

  const adjust = (press: Press, axis: 'size' | 'opacity') => {
    const offset = { x: press.point.x - press.start.x, y: press.point.y - press.start.y };
    if (axis === 'size') {
      const size = scrubValue({
        start: from.size,
        min: 1,
        max: props.maxSize,
        travel: -offset.y,
        room: { more: press.start.y, less: props.view.height - press.start.y },
        pixelsPerUnit: 90,
        scale: 'log'
      });
      last = { size: Math.round(size * 10) / 10 };
    } else {
      const opacity = scrubValue({
        start: from.opacity,
        min: 0.02,
        max: 1,
        travel: offset.x,
        room: { more: props.view.width - press.start.x, less: press.start.x },
        pixelsPerUnit: 260,
        scale: 'linear'
      });
      last = { opacity: Math.round(opacity * 100) / 100 };
    }

    setPointer(press.point);
    props.onAdjust(last);
  };
  // Created once: an inline spread would be re-run, and lose the press, whenever another attribute changes.
  const press = pressHandlers({
    start(started) {
      setMode(undefined);
      from = { size: props.brush.size, opacity: props.brush.opacity };
      last = {};
      hold = setTimeout(() => {
        hold = undefined;
        if (!started.moved) {
          setMode('carry');
          props.onCarry(started.point);
        }
      }, carryHoldMs);
    },
    move(current) {
      const now = mode();
      if (now === 'carry') {
        props.onCarry(current.point);
        return;
      }

      if (now) {
        adjust(current, now);
        return;
      }

      const axis = scrubAxis({ x: current.point.x - current.start.x, y: current.point.y - current.start.y }, 8);
      if (axis) {
        stopHold();
        if (!props.adjustable) {
          return;
        }

        setMode(axis);
        adjust(current, axis);
      }
    },
    end(ended) {
      stopHold();
      finish(ended);
    },
    tap(tapped) {
      stopHold();
      if (mode() === 'carry') {
        finish(tapped);
        return;
      }

      setMode(undefined);
      props.onTap();
    },
    cancel(cancelled) {
      stopHold();
      finish(cancelled);
    }
  });

  /** Drops a carried pebble or reports the drag's final values. */
  function finish(ended: Press) {
    const was = mode();
    setMode(undefined);
    setPointer(undefined);
    if (was === 'carry') {
      props.onDrop(ended.point);
    } else if (was && (last.size !== undefined || last.opacity !== undefined)) {
      props.onAdjusted(last);
    }
  }

  /** The dot's diameter: the brush size on a log scale, from a speck to most of the pebble. */
  const dot = () => {
    const share = Math.log2(Math.max(1, props.brush.size)) / Math.log2(Math.max(2, props.maxSize));
    return 6 + Math.min(1, Math.max(0, share)) * 22;
  };
  const scrubbing = () => {
    const now = mode();
    return now === 'size' || now === 'opacity' ? now : undefined;
  };
  /** The preview dab's diameter on screen, capped so that a huge brush still fits beside the pebble. */
  const dab = () => Math.min(previewCap, Math.max(2, props.brush.size * props.zoom));
  const preview = () => previewPoint(pointer() ?? props.center, props.center, dab(), props.hand, props.view);
  return (
    <>
      <div
        class={styles.pebble}
        role="button"
        aria-label="Tools · press and drag for size and opacity · hold to move"
        aria-expanded={props.open ? 'true' : 'false'}
        data-hidden={props.hidden ? '' : undefined}
        data-open={props.open ? '' : undefined}
        data-lifted={props.lifted || mode() === 'carry' ? '' : undefined}
        data-zen-ui=""
        style={{ left: `${props.center.x}px`, top: `${props.center.y}px` }}
        {...press}
      >
        <Show
          when={props.counter}
          fallback={
            <span
              class={styles.dot}
              data-erasing={props.erasing ? '' : undefined}
              style={{
                width: `${dot()}px`,
                height: `${dot()}px`,
                '--dot-color': props.brush.color,
                opacity: props.erasing ? 1 : 0.25 + props.brush.opacity * 0.75
              }}
            />
          }
        >
          {(counter) => <span class={styles.counter}>{counter()}</span>}
        </Show>
      </div>
      <Show when={scrubbing()}>
        {(axis) => (
          <div
            class={styles.preview}
            style={{ left: `${preview().x}px`, top: `${preview().y}px` }}
            aria-live="polite"
            data-axis={axis()}
          >
            <span
              class={styles.dab}
              data-erasing={props.erasing ? '' : undefined}
              style={{
                width: `${dab()}px`,
                height: `${dab()}px`,
                '--dot-color': props.brush.color,
                opacity: props.erasing ? 1 : props.brush.opacity
              }}
            />
            <span class={styles.readout}>
              <span data-on={axis() === 'size' ? '' : undefined}>{formatSize(props.brush.size)} px</span>
              <span data-on={axis() === 'opacity' ? '' : undefined}>{Math.round(props.brush.opacity * 100)} %</span>
            </span>
          </div>
        )}
      </Show>
    </>
  );
}

/** How long a still press waits before it picks the pebble up, in milliseconds. */
const carryHoldMs = 420;
/** The largest preview dab, in CSS pixels. */
const previewCap = 220;

/**
 * Where the preview of a dab of `diameter` goes for a press at `pointer`: centered above it, clear of the hand below
 * the pen; without room there, or over the pebble at `pebble`, beside the press away from the pen `hand`, then on the
 * other side, then below. Inside the view in any case.
 */
function previewPoint(pointer: Point, pebble: Point, diameter: number, hand: 'left' | 'right', view: ViewSize): Point {
  const width = Math.max(diameter, readoutWidth);
  const height = diameter + readoutHeight;
  const away = hand === 'left' ? 1 : -1;
  const sideways = previewGap + width / 2;
  const upright = previewGap + height / 2;
  const candidates = [
    { x: pointer.x, y: pointer.y - upright },
    { x: pointer.x + away * sideways, y: pointer.y },
    { x: pointer.x - away * sideways, y: pointer.y },
    { x: pointer.x, y: pointer.y + upright }
  ];
  const fits = (point: Point) =>
    point.x - width / 2 >= previewMargin &&
    point.x + width / 2 <= view.width - previewMargin &&
    point.y - height / 2 >= previewMargin &&
    point.y + height / 2 <= view.height - previewMargin &&
    // Clear of the pebble: its nearest point in the preview's box is beyond its radius.
    Math.hypot(
      pebble.x - Math.min(point.x + width / 2, Math.max(point.x - width / 2, pebble.x)),
      pebble.y - Math.min(point.y + height / 2, Math.max(point.y - height / 2, pebble.y))
    ) >
      pebbleRadius + 6;
  const point = candidates.find(fits) ?? candidates[0]!;
  return {
    x: Math.min(view.width - previewMargin - width / 2, Math.max(previewMargin + width / 2, point.x)),
    y: Math.min(view.height - previewMargin - height / 2, Math.max(previewMargin + height / 2, point.y))
  };
}

/** Distance from the press to the preview's near side, in CSS pixels: clear of a fingertip. */
const previewGap = 48;
const previewMargin = 8;
/** The size and opacity readout under the dab, with the gap above it. */
const readoutWidth = 110;
const readoutHeight = 28;

/** A brush size for display: tenths below 10 px, whole pixels above. */
function formatSize(size: number) {
  return size < 10 ? size.toFixed(1).replace(/\.0$/, '') : String(Math.round(size));
}
