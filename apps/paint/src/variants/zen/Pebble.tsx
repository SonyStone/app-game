import { createSignal, onCleanup, Show } from 'solid-js';
import { pressHandlers, type Press } from '../../shared/ui/pressHandlers';
import styles from './ZenStudio.module.css';
import { pebbleRadius, type Point, type ViewSize } from './placement';
import { scrubAxis, scrubValue } from './scrub';

/**
 * The pebble: the one thing on the page. It shows the brush as a dot of its color, sized by its size and faded by its
 * opacity (a ring for the eraser), or a short `counter` such as rewind steps. A tap runs `onTap`. A press that moves
 * past a fingertip's tremble carries the pebble: it follows the pointer, held where it was grabbed, and rests where it
 * is let go. A press held still for a moment instead wakes the brush controls, with a live preview of the dab beside
 * the press, clear of the hand and the pebble: dragging on then changes the brush, up and down its size and sideways
 * its opacity. The same for the pen, a finger and the mouse.
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
  /** Size and opacity can change now; otherwise a held press does nothing until it moves, and then carries. */
  adjustable: boolean;
  /** Replaces the brush dot while set. */
  counter?: string;
  onTap: () => void;
  /** The pebble is carried with its center at `center`, unclamped; called for every move. */
  onCarry: (center: Point) => void;
  /** The carried pebble is let go with its center at `center`, unclamped. */
  onDrop: (center: Point) => void;
  /** A drag changed the brush. */
  onAdjust: (patch: { size?: number; opacity?: number }) => void;
  /** A drag that changed the brush lifted; `patch` holds its final values. */
  onAdjusted: (patch: { size?: number; opacity?: number }) => void;
}) {
  /**
   * What the press in progress does, once decided: `carry` moves the pebble, `adjust` waits for the drag's axis after
   * a held press, `size` and `opacity` change the brush. Kept in a plain variable for the handlers, which must see a
   * change at once, and mirrored in a signal for the view.
   */
  let gesture: Gesture | undefined;
  const [shown, setShown] = createSignal<Gesture>();
  const enter = (next: Gesture | undefined) => {
    gesture = next;
    setShown(next);
  };
  /** Where the press is while it adjusts the brush, which the preview follows. */
  const [pointer, setPointer] = createSignal<Point>();
  let hold: ReturnType<typeof setTimeout> | undefined;
  /** The press's offset from the pebble's center, kept while carrying so the pebble does not jump under the pointer. */
  let grab: Point = { x: 0, y: 0 };
  /** The brush when the press started, and the latest value the drag set. */
  let from = { size: 0, opacity: 1 };
  let last: { size?: number; opacity?: number } = {};
  const stopHold = () => {
    clearTimeout(hold);
    hold = undefined;
  };
  onCleanup(stopHold);

  const carried = (press: Press) => ({ x: press.point.x - grab.x, y: press.point.y - grab.y });
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
    tapDistance: dragSlop,
    start(started) {
      enter(undefined);
      grab = { x: started.start.x - props.center.x, y: started.start.y - props.center.y };
      from = { size: props.brush.size, opacity: props.brush.opacity };
      last = {};
      hold = setTimeout(() => {
        hold = undefined;
        if (!started.moved && gesture === undefined && props.adjustable) {
          enter('adjust');
          setPointer(started.point);
        }
      }, adjustHoldMs);
    },
    move(current) {
      if (gesture === 'carry') {
        props.onCarry(carried(current));
        return;
      }

      if (gesture === 'size' || gesture === 'opacity') {
        adjust(current, gesture);
        return;
      }

      if (gesture === 'adjust') {
        const axis = scrubAxis({ x: current.point.x - current.start.x, y: current.point.y - current.start.y }, 8);
        if (axis) {
          enter(axis);
          adjust(current, axis);
        }

        return;
      }

      if (current.moved) {
        stopHold();
        enter('carry');
        props.onCarry(carried(current));
      }
    },
    end(ended) {
      stopHold();
      finish(ended);
    },
    tap(tapped) {
      stopHold();
      // A held press, or one whose small drag changed the brush, is no tap.
      if (gesture !== undefined) {
        finish(tapped);
        return;
      }

      props.onTap();
    },
    cancel(cancelled) {
      stopHold();
      finish(cancelled);
    }
  });

  /** Rests a carried pebble or reports the drag's final values. */
  function finish(ended: Press) {
    const was = gesture;
    enter(undefined);
    setPointer(undefined);
    if (was === 'carry') {
      props.onDrop(carried(ended));
    } else if ((was === 'size' || was === 'opacity') && (last.size !== undefined || last.opacity !== undefined)) {
      props.onAdjusted(last);
    }
  }

  /** The dot's diameter: the brush size on a log scale, from a speck to most of the pebble. */
  const dot = () => {
    const share = Math.log2(Math.max(1, props.brush.size)) / Math.log2(Math.max(2, props.maxSize));
    return 8 + Math.min(1, Math.max(0, share)) * (2 * pebbleRadius - 32);
  };
  /** The brush controls are awake: the axis a drag adjusts, or `adjust` before it has chosen one. */
  const adjusting = () => {
    const now = shown();
    return now === 'carry' ? undefined : now;
  };
  /** The preview dab's diameter on screen, capped so that a huge brush still fits beside the pebble. */
  const dab = () => Math.min(previewCap, Math.max(2, props.brush.size * props.zoom));
  const preview = () => previewPoint(pointer() ?? props.center, props.center, dab(), props.hand, props.view);
  return (
    <>
      <div
        class={styles.pebble}
        role="button"
        aria-label="Tools · drag to move · hold, then drag for size and opacity"
        aria-expanded={props.open ? 'true' : 'false'}
        data-hidden={props.hidden ? '' : undefined}
        data-open={props.open ? '' : undefined}
        data-lifted={props.lifted || shown() === 'carry' ? '' : undefined}
        data-adjusting={adjusting() ? '' : undefined}
        data-zen-ui=""
        style={{
          left: `${props.center.x}px`,
          top: `${props.center.y}px`,
          width: `${2 * pebbleRadius}px`,
          height: `${2 * pebbleRadius}px`
        }}
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
      <Show when={adjusting()}>
        {(axis) => (
          <div
            class={styles.preview}
            style={{ left: `${preview().x}px`, top: `${preview().y}px` }}
            aria-live="polite"
            data-axis={axis() === 'adjust' ? undefined : axis()}
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

/** What a press on the pebble does once decided; see `Pebble`. */
type Gesture = 'carry' | 'adjust' | 'size' | 'opacity';

/** CSS pixels a press may move and still be a tap or a hold; beyond them it carries the pebble. */
const dragSlop = 10;
/** How long a still press waits before it wakes the brush controls, in milliseconds. */
const adjustHoldMs = 380;
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
