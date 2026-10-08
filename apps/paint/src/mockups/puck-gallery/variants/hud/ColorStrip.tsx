import { createSignal, flush, For } from 'solid-js';
import { hexToHsv, hsvToHex, type Hsv } from '../../../../features/color/hsv';
import type { Point } from '../../kit/createSketchCanvas';
import { galleryUi } from '../../kit/variant';
import { clamp, insideRect, openSide, shiftRect, unionRect, type Rect } from './geometry';
import styles from './Hud.module.css';
import { createTrembleGuard, placeStrip, stripPress, type StripContext } from './strip';
import { createWheelSteps, rectStyle } from './ValueStrip';

/**
 * Opens Photoshop's HUD color picker under the pen: a saturation/value square placed so that the current color lies
 * at `context.home`, the hue strip beside it on the open side, recent colors and the previous color above. Sliding
 * in the square picks saturation and value, in the strip the hue; sliding over a swatch takes it. The color changes
 * live; a commit records it (previous and recent colors), a cancel restores it.
 *
 * Crossing the square on the way to the hue strip does not count: when the pointer enters the strip, saturation and
 * value return to what they were when it entered the square.
 */
export function createColorStrip(context: StripContext) {
  const { studio, home } = context;
  const original = studio.color();
  const start = hexToHsv(original);
  const side = openSide(context.hand);
  const swatches = studio
    .recent()
    .filter((hex) => hex !== original)
    .slice(0, 5);
  const previous = studio.previous();

  const square0: Rect = {
    left: home.x - start.s * squareSize,
    top: home.y - (1 - start.v) * squareSize,
    width: squareSize,
    height: squareSize
  };
  const hue0: Rect = {
    left: side > 0 ? square0.left + squareSize + partGap : square0.left - partGap - hueWidth,
    top: square0.top,
    width: hueWidth,
    height: squareSize
  };
  const rowTop = square0.top - partGap - swatchSize;
  const swatches0 = swatches.map((_, index) => ({
    left: square0.left + index * (swatchSize + 4),
    top: rowTop,
    width: swatchSize,
    height: swatchSize
  }));
  const previous0: Rect = {
    left: hue0.left + hueWidth / 2 - swatchSize / 2,
    top: rowTop,
    width: swatchSize,
    height: swatchSize
  };
  const info0: Rect = { left: square0.left, top: square0.top + squareSize + 6, width: squareSize, height: 16 };
  const panel0 = unionRect(square0, hue0, previous0, info0, ...swatches0);
  const padded = { left: panel0.left - 8, top: panel0.top - 8, width: panel0.width + 16, height: panel0.height + 14 };
  const delta = placeStrip(context, padded);
  const square = shiftRect(square0, delta);
  const hue = shiftRect(hue0, delta);
  const swatchRects = swatches0.map((rect) => shiftRect(rect, delta));
  const previousRect = shiftRect(previous0, delta);
  const panel = shiftRect(padded, delta);

  const regionAt = (point: Point): Region | undefined => {
    const hueHit = {
      left: hue.left - (side > 0 ? 4 : 14),
      top: hue.top - 12,
      width: hueWidth + 18,
      height: squareSize + 24
    };
    if (insideRect(hueHit, point)) {
      return 'hue';
    }

    if (insideRect(previousRect, point, 2)) {
      return 'previous';
    }

    const swatch = swatchRects.findIndex((rect) => insideRect(rect, point, 2));
    if (swatch >= 0) {
      return swatch;
    }

    return insideRect(square, point, 10) ? 'square' : undefined;
  };

  const guard = createTrembleGuard(context);
  const [hsv, setHsv] = createSignal(start);
  const [region, setRegion] = createSignal<Region | undefined>(context.via === 'drag' ? 'square' : undefined);
  let current: Hsv = start;
  let visitStart: Hsv = start;
  let last: Region | undefined = context.via === 'drag' ? 'square' : undefined;
  let latest = original;
  let committed = original;

  const apply = (hex: string) => {
    studio.setColor(hex);
    latest = hex;
    setHsv(current);
  };
  const pick = (point: Point) => {
    const now = regionAt(point);
    if (now === 'hue') {
      if (last === 'square') {
        current = { ...current, s: visitStart.s, v: visitStart.v };
      }

      current = { ...current, h: clamp((point.y - hue.top) / squareSize, 0, 0.9999) * 360 };
      apply(hsvToHex(current));
    } else if (now === 'square') {
      if (last !== 'square') {
        visitStart = current;
      }

      current = {
        h: current.h,
        s: clamp((point.x - square.left) / squareSize, 0, 1),
        v: 1 - clamp((point.y - square.top) / squareSize, 0, 1)
      };
      apply(hsvToHex(current));
    } else if (now !== undefined) {
      const hex = now === 'previous' ? previous : swatches[now]!;
      current = hexToHsv(hex, current);
      apply(hex);
    }

    if (now !== undefined) {
      last = now;
    }

    setRegion(now);
  };

  return {
    kind: 'color' as const,
    fn: 'color' as const,
    panel,
    square,
    hue,
    swatches,
    swatchRects,
    previous,
    previousRect,
    original,
    start,
    hsv,
    region,
    /** A tap on the hue strip commits but keeps the picker open, so that a shade can follow. */
    get finishes() {
      return last !== 'hue';
    },
    move(point: Point) {
      if (guard(point)) {
        pick(point);
      }
    },
    tap(point: Point) {
      pick(point);
    },
    step(dx: number, dy: number, shift: boolean) {
      if (dx && shift) {
        current = { ...current, s: clamp(current.s + dx * 0.04, 0, 1) };
      } else if (dx) {
        current = { ...current, h: (current.h + dx * 5 + 360) % 360 };
      }

      if (dy) {
        current = { ...current, v: clamp(current.v + dy * 0.04, 0, 1) };
      }

      apply(hsvToHex(current));
    },
    commit() {
      const changed = latest !== committed;
      if (changed) {
        // The color was set in this same event; commitColor must read it.
        flush();
        studio.commitColor();
      }

      committed = latest;
      return changed;
    },
    cancel() {
      if (latest !== committed) {
        current = hexToHsv(committed, current);
        apply(committed);
      }
    }
  };
}

/** An open color picker. */
export type ColorStrip = ReturnType<typeof createColorStrip>;

/**
 * The HUD color picker: the square in the current hue with its marker, the hue strip, the swatches and a before and
 * after chip with the hex code. In tap and key mode it takes taps, drags and the wheel (hue).
 */
export function ColorStripView(props: {
  strip: ColorStrip;
  interactive: boolean;
  /** Hears whether a press on the picker changed the color. */
  committed: (changed: boolean) => void;
}) {
  const strip = props.strip;
  const press = stripPress(strip, (changed) => props.committed(changed));
  const wheel = createWheelSteps((by) => {
    strip.step(by, 0, false);
    strip.commit();
  });
  const local = (rect: Rect) =>
    rectStyle({ ...rect, left: rect.left - strip.panel.left, top: rect.top - strip.panel.top });

  return (
    <div
      {...galleryUi}
      {...(props.interactive ? press : {})}
      class={[styles.panel, { [styles.passive!]: !props.interactive }]}
      style={rectStyle(strip.panel)}
      onWheel={(event) => props.interactive && wheel(event)}
    >
      <div
        class={[styles.square, { [styles.hot!]: strip.region() === 'square' }]}
        style={{ ...local(strip.square), '--hud-hue': `${strip.hsv().h}` }}
      >
        <span
          class={styles.homeDot}
          style={{ left: `${strip.start.s * 100}%`, top: `${(1 - strip.start.v) * 100}%` }}
        />
        <span
          class={styles.svMarker}
          style={{
            left: `${strip.hsv().s * 100}%`,
            top: `${(1 - strip.hsv().v) * 100}%`,
            background: hsvToHex(strip.hsv())
          }}
        />
      </div>
      <div class={[styles.hueStrip, { [styles.hot!]: strip.region() === 'hue' }]} style={local(strip.hue)}>
        <span class={styles.hueMarker} style={{ top: `${(strip.hsv().h / 360) * 100}%` }} />
      </div>
      <For each={strip.swatches}>
        {(hex, index) => (
          <span
            class={[styles.swatch, { [styles.hot!]: strip.region() === index() }]}
            style={{ ...local(strip.swatchRects[index()]!), background: hex }}
          />
        )}
      </For>
      <span
        class={[styles.swatch, styles.previous, { [styles.hot!]: strip.region() === 'previous' }]}
        style={{ ...local(strip.previousRect), background: strip.previous }}
        title="Previous color"
      />
      <div
        class={styles.colorInfo}
        style={{
          left: `${strip.square.left - strip.panel.left}px`,
          top: `${strip.square.top - strip.panel.top + squareSize + 6}px`
        }}
      >
        <span class={styles.beforeAfter}>
          <span style={{ background: strip.original }} />
          <span style={{ background: hsvToHex(strip.hsv()) }} />
        </span>
        <span>{hsvToHex(strip.hsv())}</span>
      </div>
    </div>
  );
}

/** A part of the picker: the square, the hue strip, the previous color or a recent swatch by index. */
type Region = 'square' | 'hue' | 'previous' | number;

const squareSize = 156;
const hueWidth = 20;
const swatchSize = 28;
/** Gap between the square, the strip and the swatch row. */
const partGap = 8;
