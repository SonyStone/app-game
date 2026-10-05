import { Portal } from '@solidjs/web';
import { For, Show, createMemo, createSignal, merge, onSettled } from 'solid-js';

/** Props of {@link NumberScrubber}. */
export type NumberScrubberProps = {
  /** Controlled value. Defaults to `0`. */
  value?: number;
  /** Receives the final value once per gesture: after a drag, on an edit commit, and on each keyboard step. */
  onChange?: (value: number) => void;
  /**
   * Receives every intermediate value while dragging, for live previews. A cancelled drag (Escape or a cancelled
   * pointer) reports the start value again and never calls `onChange`.
   */
  onTemporaryChange?: (value: number) => void;
  /** Lower bound. Defaults to `0`. */
  min?: number;
  /** Upper bound. Defaults to `1_000_000`. */
  max?: number;
  /** Values snap to multiples of `step`; arrow keys add one step. Defaults to `1`. */
  step?: number;
  /** Value change per pixel of drag. Defaults to `step / 5`, so five pixels make one step. Ignored with `curve`. */
  dragStep?: number;
  /** Value change per pixel while Shift is held. Defaults to `step`. Ignored with `curve`. */
  altDragStep?: number;
  /**
   * Non-linear scale: positions from 0 to 1 along the whole ruler and their values, in order, like Paint's Size
   * slider curve. Each segment gets its own tick value, so ranges that own more of the ruler scrub more finely.
   * Shift makes the ruler {@link COARSE_FACTOR} times shorter.
   */
  curve?: readonly (readonly [position: number, value: number])[];
  /** Pixels of drag across the whole `curve`. Defaults to `1000`. */
  curveLength?: number;
  /**
   * Preset values in increasing order, drawn as dots inside the band of the wheels and the tape. The pen starts just
   * inside the band's inner edge and scrubs freely there; moved onto the band, it makes the value stick to the
   * nearest dot exactly, even off `step`, and click from dot to dot as the ruler keeps turning. Off the band again,
   * scrubbing continues from that dot. The straight ruler ignores them. Presets outside `min` and `max` are ignored.
   */
  snapPoints?: readonly number[];
  /**
   * How `snapPoints` are offered.
   * - `'dots'` (default): drawn on the band of the wheels and the tape, as described there.
   * - `'panel'`: a grid of them opens on the press beside the ruler (or the control), away from the hand, like CLIP
   *   STUDIO PAINT's Brush Size palette. Pointing at a cell shows its value, turns the ruler to it, and releasing the
   *   pen there picks it; back on the ruler, scrubbing continues from it.
   * - `'grid'`: the same panel, also giving the values between presets. The middle of a cell gives its preset
   *   exactly; toward a neighbouring cell the value moves on to halfway to that cell's preset, geometrically for
   *   positive values, so moving across a row sweeps every value. With `ruler: 'none'` the panel is the only way to
   *   change the value while it is open.
   */
  snapStyle?: 'dots' | 'panel' | 'grid';
  /** Formats the idle and dragged value and the ruler labels; editing always shows the raw number. */
  displayValue?: (value: number) => string;
  /** Blocks every interaction and removes the control from the tab order. */
  disabled?: boolean;
  /** Blocks dragging, editing, and keyboard steps but keeps the control focusable. */
  readOnly?: boolean;
  /** Shows the drag-direction chevrons. Defaults to `true`. */
  scrubberIcon?: boolean;
  /**
   * Gesture and ruler shown while dragging. Defaults to `'line'`.
   * - `'line'`: drag horizontally; a straight ruler appears above the control and its needle follows the pointer.
   * - `'arc'` and `'dial'`: move the pen tip up and down along a wheel centred up the pen's body, so the pen lies
   *   along a radius. The wheel turns with the pointer under a fixed window beside the tip, like a wheel of fortune;
   *   values grow up the wheel, so dragging it down raises the value. They differ only in `radius`: a wide arc for
   *   moving the hand, a tight dial for turning the fingers. Moving toward or away from the centre changes nothing,
   *   and a tilted stylus places the centre from its lean at the first touch.
   * - `'vertical'`: drag up and down; a vertical tape moves with the pointer under a fixed needle. Values grow up
   *   the tape, so dragging it down raises the value. Sideways movement changes nothing.
   * - `'none'`: drag horizontally without a ruler.
   */
  ruler?: 'line' | 'arc' | 'dial' | 'vertical' | 'none';
  /**
   * Distance from the wheel's centre to the pen tip in `'arc'` and `'dial'` modes, in CSS pixels. Defaults to
   * {@link ARC_RADIUS} for `'arc'` and {@link DIAL_RADIUS} for `'dial'`.
   */
  radius?: number;
  /**
   * Hand holding the pen. Ticks and labels of the `'arc'`, `'dial'`, and `'vertical'` rulers face away from it, and
   * without stylus tilt (a mouse, a finger, or an upright pen) the `'arc'` and `'dial'` wheels centre straight to
   * this side of the press. Defaults to `'right'`.
   */
  hand?: 'left' | 'right';
  class?: string;
  'aria-label'?: string;
};

/**
 * Compact inspector control for numbers: drag to scrub, hold Shift for coarse steps, click (or tap) to type a value,
 * and use arrow keys, Page Up/Down, Home, and End to step. Works with mouse, pen, and touch.
 *
 * While dragging, a ruler appears next to the pointer; the shaded ends of the ruler mark `min` and `max`.
 */
export function NumberScrubber(props: NumberScrubberProps) {
  const p = merge(
    { value: 0, min: 0, max: 1_000_000, step: 1, scrubberIcon: true, ruler: 'line', hand: 'right' } as const,
    props
  );
  const [liveValue, setLiveValue] = createSignal<number>();
  const [editing, setEditing] = createSignal(false);
  const [lineRuler, setLineRuler] = createSignal<LineRulerSetup>();
  const [movingRuler, setMovingRuler] = createSignal<MovingRulerSetup>();
  // The unsnapped value under a moving ruler's fixed needle, so the ruler moves smoothly between steps.
  const [needleValue, setNeedleValue] = createSignal(0);
  const [panel, setPanel] = createSignal<SnapPanelSetup>();
  const [panelHover, setPanelHover] = createSignal<PanelPick>();
  const panelStyle = () => p.snapStyle === 'panel' || p.snapStyle === 'grid';
  const dotsOnBand = () => (panelStyle() ? undefined : p.snapPoints);
  const value = () => liveValue() ?? p.value;
  const format = (v: number) => p.displayValue?.(v) ?? String(v);
  const clamp = (v: number) => Math.min(p.max, Math.max(p.min, v));
  const clampSnap = (v: number) => clamp(snap(v, p.step));
  const verticalDrag = () => p.ruler === 'arc' || p.ruler === 'dial' || p.ruler === 'vertical';

  let root!: HTMLDivElement;

  // Gesture state lives in plain variables: Solid 2 defers signal writes, and every handler must see the latest
  // values within the same event.
  let pointerId: number | undefined;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let pressPointerType = 'mouse';
  let startValue = 0;
  let current = 0;
  let coarse = false;
  let scale: ValueScale = linearScale(1);
  // Travel: signed pixels moved along the gesture's track since the press. Values are unsnapped.
  let track: Track = lineTrack(0);
  let travel = 0;
  let rawValue = 0;
  let anchorTravel = 0;
  let anchorValue = 0;
  // Whether a point lies on the shown moving ruler's band; unset for the straight ruler and without a ruler.
  let onBand: ((x: number, y: number) => boolean) | undefined;
  // The snap point holding the value while the pen is on the band.
  let snapped: number | undefined;
  // The open preset panel's placement, read by the pointer handlers; unset while it is closed.
  let panelSetup: SnapPanelSetup | undefined;

  // The gesture is tracked on `window`, so it keeps following the pointer and still sees the release when pointer
  // capture is unavailable or lost, for example after the pointer leaves the page. A right click or a pen's barrel
  // button mid-gesture must not open the browser's context menu over the ruler.
  const trackGesture = () => {
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('contextmenu', preventDefault);
  };
  const stopTrackingGesture = () => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    window.removeEventListener('contextmenu', preventDefault);
  };

  onSettled(() => stopTrackingGesture);

  /** Switches between fine and coarse scales, keeping the current value where it is on screen. */
  const setScale = (nextCoarse: boolean) => {
    coarse = nextCoarse;
    scale = p.curve
      ? curveScale(p.curve, (p.curveLength ?? 1000) / (coarse ? COARSE_FACTOR : 1))
      : linearScale(coarse ? (p.altDragStep ?? p.step) : (p.dragStep ?? p.step / 5));
    anchorTravel = travel;
    anchorValue = rawValue;

    if (p.ruler === 'line') {
      const rect = root.getBoundingClientRect();
      const above = rect.top - RULER_HEIGHT - RULER_GAP;
      setLineRuler({
        anchorX: startX + anchorTravel,
        anchorValue,
        scale,
        top: above >= 0 ? above : rect.bottom + RULER_GAP
      });
    } else if (track.kind !== 'line') {
      setMovingRuler({ geometry: track.geometry, scale });
      onBand = movingRulerLayout(track.geometry, window.innerHeight).onBand;
    }
  };

  /**
   * Opens the preset panel on the side away from the hand: right past a moving ruler's band, or beside the control
   * for the straight ruler and none. Near the viewport's edge it opens on the hand's side instead. The row holding
   * the preset nearest the current value lines up with the press.
   */
  const openPanel = () => {
    const points = (p.snapPoints ?? []).filter((point) => point >= p.min && point <= p.max);

    if (points.length === 0) {
      return;
    }

    const width = PANEL_COLUMNS * PANEL_CELL_WIDTH + 2 * PANEL_PADDING;
    const height = PANEL_HEADER + Math.ceil(points.length / PANEL_COLUMNS) * PANEL_CELL_HEIGHT + 2 * PANEL_PADDING;
    const rect = root.getBoundingClientRect();
    // A moving ruler's band lies outward from the pen, away from the hand.
    const side =
      track.kind === 'line'
        ? p.hand === 'left'
          ? 1
          : -1
        : movingRulerLayout(track.geometry, window.innerHeight).point(0, 0).x >= startX
          ? 1
          : -1;
    const leftOn = (sign: number) =>
      track.kind === 'line'
        ? sign > 0
          ? rect.right + PANEL_MARGIN
          : rect.left - PANEL_MARGIN - width
        : sign > 0
          ? startX + PANEL_GAP
          : startX - PANEL_GAP - width;
    const fits = (left: number) => left >= PANEL_MARGIN && left + width <= window.innerWidth - PANEL_MARGIN;
    // Near the viewport's edge the panel moves to the hand's side rather than over the pen and the ruler.
    const left = fits(leftOn(side)) || !fits(leftOn(-side)) ? leftOn(side) : leftOn(-side);
    const nearestRow = Math.floor(points.indexOf(nearestByValue(points, startValue)) / PANEL_COLUMNS);
    const top = startY - PANEL_PADDING - PANEL_HEADER - (nearestRow + 0.5) * PANEL_CELL_HEIGHT;
    panelSetup = {
      points,
      between: p.snapStyle === 'grid',
      min: p.min,
      max: p.max,
      left: Math.max(PANEL_MARGIN, Math.min(window.innerWidth - width - PANEL_MARGIN, left)),
      top: Math.max(PANEL_MARGIN, Math.min(window.innerHeight - height - PANEL_MARGIN, top)),
      width,
      height
    };
    setPanel(panelSetup);
  };

  const scrubTo = (x: number, y: number) => {
    const nextTravel = track.travel(x, y);

    if (panelSetup && insidePanel(panelSetup, x, y)) {
      // Over the panel the pen's travel is ignored; a pointed cell turns the ruler to its value, and scrubbing
      // back on the ruler continues from there.
      travel = nextTravel;
      const pick = panelPickAt(panelSetup, x, y);

      if (pick) {
        rawValue = pick.value;
        snapped = undefined;
        setNeedleValue(pick.value);
      }

      setPanelHover(pick);
      // Presets stay exact even off `step`; values between them snap to it.
      emit(pick?.exact ? pick.value : clampSnap(rawValue));
      return;
    }

    setPanelHover(undefined);
    const magnetic = dotsOnBand() !== undefined && onBand !== undefined && onBand(x, y);

    // Off the band again, scrubbing continues from the dot that held the value.
    if (!magnetic && snapped !== undefined) {
      rawValue = snapped;
    }

    if (track.kind === 'line') {
      // The needle follows the pointer over a still ruler. Without a ruler, an open panel is the only way to change
      // the value, so the way to it does not scrub.
      if (!(panelSetup && p.ruler === 'none')) {
        rawValue = clamp(scale.fromPx(scale.toPx(anchorValue) + nextTravel - anchorTravel));
      }
    } else {
      // The pen drags the ruler: the value under the fixed needle moves against the pen. Clamping every step lets
      // the ruler stop at a bound and move back as soon as the pen does.
      rawValue = clamp(scale.fromPx(scale.toPx(rawValue) - (nextTravel - travel)));
    }

    travel = nextTravel;
    // On the band, the ruler keeps turning underneath while the nearest dot holds the window.
    snapped = magnetic ? nearestSnapPoint(p.snapPoints, scale, rawValue, p.min, p.max) : undefined;
    setNeedleValue(snapped ?? rawValue);
    emit(snapped ?? clampSnap(rawValue));
  };

  /** Shows `next` as the dragged value and reports it once it changes. */
  const emit = (next: number) => {
    if (next !== current) {
      current = next;
      setLiveValue(next);
      p.onTemporaryChange?.(next);
    }
  };

  const finishDrag = (commit: boolean) => {
    const wasDragging = dragging;
    stopTrackingGesture();
    pointerId = undefined;
    dragging = false;
    setLineRuler(undefined);
    setMovingRuler(undefined);
    setPanel(undefined);
    setPanelHover(undefined);
    panelSetup = undefined;
    setLiveValue(undefined);

    if (!wasDragging) {
      return;
    }

    if (!commit) {
      p.onTemporaryChange?.(startValue);
    } else if (current !== startValue) {
      p.onChange?.(current);
    }
  };

  const commitValue = (v: number) => {
    const next = clampSnap(v);

    if (next !== p.value) {
      p.onChange?.(next);
    }
  };

  const onPointerDown = (e: PointerEvent) => {
    if (editing() || p.disabled || p.readOnly || e.button !== 0 || pointerId !== undefined) {
      return;
    }

    // Prevents text selection and the compatibility mousedown, which would otherwise move focus.
    e.preventDefault();
    root.focus();
    pointerId = e.pointerId;
    trackGesture();
    startX = e.clientX;
    startY = e.clientY;
    pressPointerType = e.pointerType;
    startValue = current = rawValue = p.value;
    snapped = undefined;
    onBand = undefined;
    travel = 0;
    const capAngle = penCapAngle(e) ?? defaultCapAngle(p.hand);
    track =
      p.ruler === 'arc' || p.ruler === 'dial'
        ? wheelTrack(startX, startY, capAngle, p.radius ?? (p.ruler === 'arc' ? ARC_RADIUS : DIAL_RADIUS))
        : p.ruler === 'vertical'
          ? verticalTrack(startX, startY, p.hand)
          : lineTrack(startX);

    // The panel opens on the press together with its ruler, ready to pick from; a plain click closes both again
    // and starts editing.
    if (panelStyle()) {
      if (track.kind !== 'line') {
        setNeedleValue(rawValue);
        setScale(false);
      }

      openPanel();
    }
    // Capture keeps the cursor and hover effects on the control; the `window` listeners work without it.
    root.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) {
      return;
    }

    // A mouse released where no pointerup reached the page, such as outside the window.
    if (e.pointerType === 'mouse' && (e.buttons & 1) === 0) {
      onPointerUp(e);
      return;
    }

    if (!dragging) {
      const threshold = pressPointerType === 'mouse' ? DRAG_THRESHOLD : TOUCH_DRAG_THRESHOLD;

      if (Math.hypot(e.clientX - startX, e.clientY - startY) < threshold) {
        return;
      }

      // Starting from the press point (zero travel) keeps the pixels spent crossing the threshold.
      dragging = true;
      setNeedleValue(rawValue);
      setScale(e.shiftKey);
    } else if (e.shiftKey !== coarse) {
      setScale(e.shiftKey);
    }

    scrubTo(e.clientX, e.clientY);
  };

  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) {
      return;
    }

    const wasClick = !dragging;
    finishDrag(true);

    if (wasClick) {
      setEditing(true);
    }
  };

  const onPointerCancel = (e: PointerEvent) => {
    if (e.pointerId === pointerId) {
      finishDrag(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (editing() || p.disabled) {
      return;
    }

    if (pointerId !== undefined) {
      if (e.key === 'Escape') {
        if (root.hasPointerCapture(pointerId)) {
          root.releasePointerCapture(pointerId);
        }

        finishDrag(false);
      } else if (e.key === 'Shift' && dragging && !coarse) {
        setScale(true);
      }

      return;
    }

    if (p.readOnly) {
      return;
    }

    const steps = KEY_STEPS[e.key];

    if (steps !== undefined) {
      e.preventDefault();
      commitValue(p.value + steps * p.step * (e.shiftKey ? 10 : 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      commitValue(p.min);
    } else if (e.key === 'End') {
      e.preventDefault();
      commitValue(p.max);
    } else if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault();
      setEditing(true);
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Shift' && dragging && coarse) {
      setScale(false);
    }
  };

  const closeEditor = (text: string | undefined) => {
    setEditing(false);
    root.focus();

    const parsed = text === undefined ? NaN : parseFloat(text);

    if (Number.isFinite(parsed)) {
      commitValue(parsed);
    }
  };

  return (
    <>
      <div
        ref={(element) => (root = element)}
        role="spinbutton"
        tabindex={p.disabled ? -1 : 0}
        aria-label={p['aria-label']}
        aria-valuenow={value()}
        aria-valuemin={p.min}
        aria-valuemax={p.max}
        aria-valuetext={format(value())}
        aria-disabled={p.disabled ? 'true' : undefined}
        aria-readonly={p.readOnly ? 'true' : undefined}
        class={[
          'inline-flex h-8 min-w-24 items-center gap-1 rounded-md border border-slate-300 px-1.5 text-sm tabular-nums outline-none select-none focus-visible:ring-2 focus-visible:ring-blue-500/60',
          editing()
            ? 'cursor-text bg-white'
            : 'touch-none bg-gradient-to-b from-white to-slate-100 hover:border-slate-400',
          !editing() && !p.disabled && !p.readOnly && (verticalDrag() ? 'cursor-ns-resize' : 'cursor-ew-resize'),
          p.disabled && 'cursor-not-allowed opacity-50',
          p.class
        ]}
        onPointerDown={onPointerDown}
        onContextMenu={preventDefault}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
      >
        <Show when={p.scrubberIcon}>
          <ScrubIcon vertical={verticalDrag()} />
        </Show>
        <Show when={editing()} fallback={<span class="min-w-0 flex-1 truncate">{format(value())}</span>}>
          <ScrubberEditor value={p.value} onClose={closeEditor} />
        </Show>
      </div>
      <Show when={lineRuler()}>
        {(setup) => (
          <Portal>
            <LineRuler setup={setup()} value={value()} min={p.min} max={p.max} step={p.step} format={format} />
          </Portal>
        )}
      </Show>
      <Show when={movingRuler()}>
        {(setup) => (
          <Portal>
            <MovingRuler
              setup={setup()}
              needleValue={needleValue()}
              value={value()}
              min={p.min}
              max={p.max}
              step={p.step}
              snapPoints={dotsOnBand()}
              format={format}
            />
          </Portal>
        )}
      </Show>
      <Show when={panel()}>
        {(setup) => (
          <Portal>
            <SnapPanel setup={setup()} hovered={panelHover()} value={value()} label={format(value())} />
          </Portal>
        )}
      </Show>
    </>
  );
}

/** Cancels an event's default action, such as opening the context menu. */
function preventDefault(e: Event) {
  e.preventDefault();
}

/** Pixels a mouse must travel before a press becomes a drag instead of a click. */
const DRAG_THRESHOLD = 3;

/**
 * The same for pens and fingers, whose taps wander further; a smaller threshold turned taps meant to start typing
 * into tiny drags that committed a changed value.
 */
const TOUCH_DRAG_THRESHOLD = 8;

/** How many times shorter a `curve` ruler gets while Shift is held. */
const COARSE_FACTOR = 5;

/** Steps added by each navigation key; Shift multiplies them by ten. */
const KEY_STEPS: Partial<Record<string, number>> = {
  ArrowUp: 1,
  ArrowRight: 1,
  ArrowDown: -1,
  ArrowLeft: -1,
  PageUp: 10,
  PageDown: -10
};

/** Maps pointer positions to travel: signed pixels moved along the gesture's path since the press. */
type Track = ReturnType<typeof lineTrack> | ReturnType<typeof wheelTrack> | ReturnType<typeof verticalTrack>;

/** Horizontal track: travel is the x distance from the press, rightwards positive. */
function lineTrack(startX: number) {
  return { kind: 'line' as const, travel: (x: number, _y: number) => x - startX };
}

/** Vertical track: travel is the y distance from the press, upwards positive. */
function verticalTrack(startX: number, startY: number, hand: 'left' | 'right') {
  return {
    kind: 'vertical' as const,
    // Ticks face away from the hand: rightwards for a left hand.
    geometry: { kind: 'vertical' as const, x: startX, y: startY, outward: hand === 'left' ? 1 : -1 },
    travel: (_x: number, y: number) => startY - y
  };
}

/**
 * Screen angle from the pen tip toward its cap, read from the stylus tilt at `e`, or `undefined` for a mouse, a
 * finger, or a pen standing too upright for its lean to be trusted. Screen angles grow clockwise from 3 o'clock.
 */
function penCapAngle(e: PointerEvent): number | undefined {
  if (e.pointerType !== 'pen' || Math.max(Math.abs(e.tiltX), Math.abs(e.tiltY)) < MIN_PEN_TILT) {
    return undefined;
  }

  // Positive tiltX leans the cap toward +x (right), positive tiltY toward +y (down the screen).
  const tan = (degrees: number) => Math.tan((Math.max(-89, Math.min(89, degrees)) * Math.PI) / 180);
  return Math.atan2(tan(e.tiltY), tan(e.tiltX));
}

/** Least stylus tilt, in degrees, whose direction is used. */
const MIN_PEN_TILT = 10;

/** Cap direction assumed without stylus tilt: straight toward the hand, so the wheel centres level with the press. */
function defaultCapAngle(hand: 'left' | 'right'): number {
  return hand === 'left' ? Math.PI : 0;
}

/** Default wheel radius of the `'arc'` ruler: wide, for moving the hand. */
const ARC_RADIUS = 240;

/** Default wheel radius of the `'dial'` ruler: tight, for turning the fingers. */
const DIAL_RADIUS = 80;

/**
 * Wheel around a pivot `radius` pixels up the pen's body from the press, so the pen lies along a radius. Travel is
 * the arc length swept since the press, positive toward the top of the screen; angles are unwrapped, so turning
 * past the far side keeps counting.
 */
function wheelTrack(startX: number, startY: number, capAngle: number, radius: number) {
  const pivotX = startX + radius * Math.cos(capAngle);
  const pivotY = startY + radius * Math.sin(capAngle);
  const startAngle = capAngle + Math.PI;
  // Screen angles grow clockwise, which moves a tip right of the pivot down; positive travel goes up.
  const forward = Math.cos(startAngle) > 0 ? -1 : 1;
  // About the same length of ruler stays visible at any radius; small wheels show at most WHEEL_MAX_SPAN each way.
  const span = Math.min(WHEEL_MAX_SPAN, WHEEL_VISIBLE_LENGTH / radius);
  let lastAngle = startAngle;
  let swept = 0;

  return {
    kind: 'circle' as const,
    geometry: { kind: 'circle' as const, pivotX, pivotY, radius, startAngle, forward, span },
    travel: (x: number, y: number) => {
      const angle = Math.atan2(y - pivotY, x - pivotX);
      let delta = angle - lastAngle;
      delta -= 2 * Math.PI * Math.round(delta / (2 * Math.PI));
      lastAngle = angle;
      swept += delta;

      return forward * swept * radius;
    }
  };
}

/** Ruler length visible on each side of a wheel's needle, in CSS pixels. */
const WHEEL_VISIBLE_LENGTH = 300;

/** Widest visible wheel on each side of the needle, in radians, for small radii. */
const WHEEL_MAX_SPAN = (80 * Math.PI) / 180;

/**
 * Maps values to pixel distances along a ruler and back. `segments` lists value ranges of constant density, each of
 * which gets its own tick value.
 */
type ValueScale = {
  toPx: (value: number) => number;
  fromPx: (px: number) => number;
  segments: readonly { from: number; to: number; pxPerValue: number }[];
};

/** Uniform scale changing the value by `rate` per pixel. */
function linearScale(rate: number): ValueScale {
  return {
    toPx: (value) => value / rate,
    fromPx: (px) => px * rate,
    segments: [{ from: -Infinity, to: Infinity, pxPerValue: 1 / rate }]
  };
}

/** Piecewise-linear scale through `curve`'s points, stretched to `length` pixels and clamped to its ends. */
function curveScale(curve: NonNullable<NumberScrubberProps['curve']>, length: number): ValueScale {
  const points = curve.map(([position, value]) => [position * length, value] as const);

  return {
    toPx: (value) => interpolate(points, 1, 0, value),
    fromPx: (px) => interpolate(points, 0, 1, px),
    segments: points.slice(1).map(([px, value], i) => {
      const [previousPx, previousValue] = points[i]!;
      return { from: previousValue, to: value, pxPerValue: (px - previousPx) / (value - previousValue) };
    })
  };
}

/** Reads coordinate `to` at coordinate `from` = `x` along ordered `points`, clamped to the ends. */
function interpolate(points: readonly (readonly [number, number])[], from: 0 | 1, to: 0 | 1, x: number): number {
  const end = points.findIndex((point) => point[from] >= x);

  if (end === 0) {
    return points[0]![to];
  }

  if (end < 0) {
    return points.at(-1)![to];
  }

  const a = points[end - 1]!;
  const b = points[end]!;
  return a[to] + ((x - a[from]) * (b[to] - a[to])) / (b[from] - a[from]);
}

/** Chevrons that mark the control as draggable, pointing along the drag. */
function ScrubIcon(props: { vertical: boolean }) {
  return (
    <svg
      class={['size-3.5 shrink-0 text-slate-400', props.vertical && 'rotate-90']}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 4 2 8l4 4M10 4l4 4-4 4"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

/**
 * Inline text field for typing a value. Enter or blur submits the text, Escape closes without a value.
 * `onClose` runs exactly once, even though closing also blurs the field.
 */
function ScrubberEditor(props: { value: number; onClose: (text: string | undefined) => void }) {
  let input!: HTMLInputElement;
  let closed = false;

  const close = (text: string | undefined) => {
    if (!closed) {
      closed = true;
      props.onClose(text);
    }
  };

  onSettled(() => {
    input.focus();
    input.select();
  });

  return (
    <input
      ref={(element) => (input = element)}
      class="h-full w-0 min-w-0 flex-1 bg-transparent tabular-nums outline-none"
      inputmode="decimal"
      value={String(props.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          close(input.value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          close(undefined);
        }
      }}
      onBlur={() => close(input.value)}
    />
  );
}

/** Placement of the straight ruler for one drag segment; a new one starts whenever Shift toggles. */
type LineRulerSetup = {
  /** Viewport x where `anchorValue` sits. */
  anchorX: number;
  anchorValue: number;
  scale: ValueScale;
  /** Viewport y of the ruler's top edge. */
  top: number;
};

/** Height of the straight ruler, including the value badge above the tick band. */
const RULER_HEIGHT = 58;

/** Gap between the control and the straight ruler. */
const RULER_GAP = 8;

/**
 * Viewport-wide straight ruler. Ticks stay fixed while the needle follows the value, so the scale under the
 * pointer reads the value directly; the ruler ends at `min` and `max`.
 */
function LineRuler(props: {
  setup: LineRulerSetup;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
}) {
  // The ruler lives for a single drag, so the viewport width at mount is enough.
  const width = window.innerWidth;
  const xOf = (v: number) =>
    props.setup.anchorX + props.setup.scale.toPx(v) - props.setup.scale.toPx(props.setup.anchorValue);
  const ticks = createMemo(() => {
    const { scale, anchorX, anchorValue } = props.setup;
    const valueAt = (x: number) => scale.fromPx(scale.toPx(anchorValue) + x - anchorX);
    return scaleTicks(scale, Math.max(props.min, valueAt(0)), Math.min(props.max, valueAt(width)), props.step);
  });
  const needleX = () => xOf(props.value);
  // The ruler ends at `min` and `max`; past the viewport the fade hides its ends.
  const bandStart = () => Math.max(-1, xOf(props.min));
  const bandEnd = () => Math.min(width + 1, xOf(props.max));

  return (
    <div
      class="pointer-events-none fixed left-0 z-50 select-none"
      style={{
        top: `${props.setup.top}px`,
        width: `${width}px`,
        height: `${RULER_HEIGHT}px`,
        'mask-image': 'linear-gradient(to right, transparent, black 12%, black 88%, transparent)'
      }}
    >
      <svg class="absolute bottom-0 left-0" width={width} height={BAND_HEIGHT}>
        <rect
          x={bandStart()}
          y="0.5"
          width={Math.max(0, bandEnd() - bandStart())}
          height={BAND_HEIGHT - 1}
          class="fill-white/95 stroke-slate-300"
        />
        <For each={ticks()}>
          {(tick) => (
            <>
              <line
                x1={xOf(tick.value)}
                x2={xOf(tick.value)}
                y1={BAND_HEIGHT}
                y2={BAND_HEIGHT - TICK_LENGTHS[tick.rank]}
                class={tick.rank === 0 ? 'stroke-slate-300' : 'stroke-slate-500'}
              />
              <Show when={tick.rank === 2}>
                <text x={xOf(tick.value)} y="11" text-anchor="middle" class="fill-slate-500 text-[10px]">
                  {props.format(tick.value)}
                </text>
              </Show>
            </>
          )}
        </For>
        <line x1={needleX()} x2={needleX()} y1="0" y2={BAND_HEIGHT} class="stroke-blue-500" stroke-width="2" />
      </svg>
      <div
        class="absolute top-0 left-0 rounded bg-blue-500 px-1.5 py-0.5 text-xs whitespace-nowrap text-white tabular-nums"
        style={{ transform: `translateX(calc(${needleX()}px - 50%))` }}
      >
        {props.format(props.value)}
      </div>
    </div>
  );
}

/** Height of the straight ruler's tick band. */
const BAND_HEIGHT = 32;

/** Placement of a moving ruler for one drag segment; a new one starts whenever Shift toggles. */
type MovingRulerSetup = {
  geometry: ReturnType<typeof wheelTrack>['geometry'] | ReturnType<typeof verticalTrack>['geometry'];
  scale: ValueScale;
};

/**
 * Wheel or vertical tape moving under a needle fixed at the press. Values grow up the ruler, which ends at `min`
 * and `max`; ticks and labels face outward, away from the hand, and the value badge sits on a wheel's band beside the
 * pen tip or beyond a tape's labels.
 */
function MovingRuler(props: {
  setup: MovingRulerSetup;
  /** Unsnapped value under the needle, which sets the ruler's position. */
  needleValue: number;
  /** Snapped value shown in the badge. */
  value: number;
  min: number;
  max: number;
  step: number;
  snapPoints: readonly number[] | undefined;
  format: (value: number) => string;
}) {
  // The ruler lives for a single drag, and its needle stays put for the whole gesture.
  const width = window.innerWidth;
  const height = window.innerHeight;
  const layout = movingRulerLayout(props.setup.geometry, height);
  // Distance along the ruler from the needle to value `v`, upwards positive.
  const along = (v: number) => props.setup.scale.toPx(v) - props.setup.scale.toPx(props.needleValue);
  const ticks = createMemo(() => {
    const { scale } = props.setup;
    const center = scale.toPx(props.needleValue);
    const lo = Math.max(props.min, scale.fromPx(center - layout.reach));
    const hi = Math.min(props.max, scale.fromPx(center + layout.reach));
    return scaleTicks(scale, lo, hi, props.step);
  });
  const dots = createMemo(() => {
    const { scale } = props.setup;
    const center = scale.toPx(props.needleValue);
    const lo = Math.max(props.min, scale.fromPx(center - layout.reach));
    const hi = Math.min(props.max, scale.fromPx(center + layout.reach));
    return drawnSnapPoints(props.snapPoints, scale, lo, hi);
  });
  const bandStart = () => Math.max(-layout.reach, along(props.min));
  const bandEnd = () => Math.min(layout.reach, along(props.max));
  const needleInner = layout.point(0, -RULER_BAND / 2);
  const needleOuter = layout.point(0, RULER_BAND / 2 + 18);
  const badge = layout.point(0, RULER_BAND / 2 + layout.badgeOffset);

  return (
    <div class="pointer-events-none fixed inset-0 z-50 select-none">
      <svg class="absolute inset-0" width={width} height={height} style={{ 'mask-image': layout.mask }}>
        <Show when={bandEnd() > bandStart()}>
          <path
            d={layout.path(bandStart(), bandEnd(), 0)}
            class="fill-none stroke-white/95"
            stroke-width={RULER_BAND}
          />
          <path d={layout.path(bandStart(), bandEnd(), -RULER_BAND / 2)} class="fill-none stroke-slate-300" />
          <path d={layout.path(bandStart(), bandEnd(), RULER_BAND / 2)} class="fill-none stroke-slate-300" />
        </Show>
        <For each={ticks()} keyed={(tick) => tick.value}>
          {(tick) => {
            const at = () => along(tick().value);
            const outer = () => layout.point(at(), RULER_BAND / 2);
            const inner = () => layout.point(at(), RULER_BAND / 2 - TICK_LENGTHS[tick().rank]);
            const label = () => layout.point(at(), RULER_BAND / 2 + layout.labelOffset);

            return (
              <>
                <line
                  x1={outer().x}
                  y1={outer().y}
                  x2={inner().x}
                  y2={inner().y}
                  class={tick().rank === 0 ? 'stroke-slate-300' : 'stroke-slate-500'}
                />
                <Show when={tick().rank === 2}>
                  <text
                    x={label().x}
                    y={label().y}
                    text-anchor={layout.labelAnchor}
                    dominant-baseline="middle"
                    class="fill-slate-500 text-[10px]"
                  >
                    {props.format(tick().value)}
                  </text>
                </Show>
              </>
            );
          }}
        </For>
        <For each={dots()}>
          {(dot) => {
            const at = () => layout.point(along(dot), RULER_BAND / 2 + layout.dotOffset);
            return <SnapDot x={at().x} y={at().y} active={dot === props.value} />;
          }}
        </For>
        <line
          x1={needleInner.x}
          y1={needleInner.y}
          x2={needleOuter.x}
          y2={needleOuter.y}
          class="stroke-blue-500"
          stroke-width="2"
        />
      </svg>
      <div
        class="absolute top-0 left-0 rounded bg-blue-500 px-1.5 py-0.5 text-xs whitespace-nowrap text-white tabular-nums"
        style={{ transform: `translate(calc(${badge.x}px - ${layout.badgeShift}), calc(${badge.y}px - 50%))` }}
      >
        {props.format(props.value)}
      </div>
    </div>
  );
}

/** Width of a moving ruler's tick band. */
const RULER_BAND = 32;

/** Snap dots sit in the band's inner half, 8 px in from its inner edge, clear of the ticks along the outer edge. */
const DOT_OFFSET = -RULER_BAND + 8;

/**
 * Lays a moving ruler along its track. `point(s, offset)` is the screen position `s` pixels up the ruler from the
 * needle and `offset` pixels outward from the band's centreline, away from the hand; `onBand` tells whether a screen
 * point is on the band, where snap points hold the value; `path` draws such a line between two `s`; `reach` is the
 * visible length on each side of the needle. Label, snap-dot, and badge offsets count from the band's outer edge. `mask` fades the ruler's ends and applies to the ruler only, not to the badge.
 */
function movingRulerLayout(geometry: MovingRulerSetup['geometry'], viewportHeight: number) {
  if (geometry.kind === 'circle') {
    const { pivotX, pivotY, radius, startAngle, forward, span } = geometry;
    const angle = (s: number) => startAngle + (forward * s) / radius;
    // The pen rests on the band's inner edge, leaving the band and the window beside the tip visible.
    const band = radius + RULER_BAND / 2 + 2;
    // CSS conic angles start at 12 o'clock; screen angles start at 3 o'clock.
    const fromDegrees = ((startAngle - span) * 180) / Math.PI + 90;
    const spanDegrees = (2 * span * 180) / Math.PI;

    return {
      reach: radius * span,
      point: (s: number, offset: number) => ({
        x: pivotX + (band + offset) * Math.cos(angle(s)),
        y: pivotY + (band + offset) * Math.sin(angle(s))
      }),
      path: (from: number, to: number, offset: number) =>
        arcPath(pivotX, pivotY, band + offset, angle(from), angle(to)),
      mask: `conic-gradient(from ${fromDegrees}deg at ${pivotX}px ${pivotY}px, transparent, black 18deg, black ${spanDegrees - 18}deg, transparent ${spanDegrees}deg)`,
      onBand: (px: number, py: number) => Math.abs(Math.hypot(px - pivotX, py - pivotY) - band) <= RULER_BAND / 2,
      dotOffset: DOT_OFFSET,
      labelOffset: 12,
      labelAnchor: 'middle' as const,
      // Back from the band's outer edge onto the band, at the needle.
      badgeOffset: -RULER_BAND / 2,
      badgeShift: '50%'
    };
  }

  const { x, y, outward } = geometry;
  // Like on the wheels, the pen rests just inside the band's inner edge.
  const band = RULER_BAND / 2 + 2;
  const at = (s: number, offset: number) => ({ x: x + outward * (band + offset), y: y - s });

  return {
    reach: Math.max(y, viewportHeight - y),
    point: at,
    path: (from: number, to: number, offset: number) => {
      const a = at(from, offset);
      const b = at(to, offset);
      return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
    },
    mask: 'linear-gradient(to bottom, transparent, black 12%, black 88%, transparent)',
    onBand: (px: number, _py: number) => Math.abs(outward * (px - x) - band) <= RULER_BAND / 2,
    dotOffset: DOT_OFFSET,
    labelOffset: 6,
    labelAnchor: outward > 0 ? ('start' as const) : ('end' as const),
    badgeOffset: 48,
    badgeShift: outward > 0 ? '0%' : '100%'
  };
}

/** SVG path of a circular arc around `(cx, cy)` from angle `start` to `end`. */
function arcPath(cx: number, cy: number, radius: number, start: number, end: number): string {
  const x1 = cx + radius * Math.cos(start);
  const y1 = cy + radius * Math.sin(start);
  const x2 = cx + radius * Math.cos(end);
  const y2 = cy + radius * Math.sin(end);
  const large = Math.abs(end - start) > Math.PI ? 1 : 0;
  const sweep = end > start ? 1 : 0;

  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} ${sweep} ${x2} ${y2}`;
}

/** The preset panel of one drag: its presets, whether it gives values between them, and its placement in pixels. */
type SnapPanelSetup = {
  points: readonly number[];
  between: boolean;
  /** Bounds that the first and last cells move toward, in place of a missing neighbour. */
  min: number;
  max: number;
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Columns of the preset panel, as in CLIP STUDIO PAINT's Brush Size palette. */
const PANEL_COLUMNS = 7;

/** Size of a preset panel cell, in pixels. */
const PANEL_CELL_WIDTH = 40;
const PANEL_CELL_HEIGHT = 46;

/** Distance from the pen to the preset panel: just past the band's outer edge, over the labels there. */
const PANEL_GAP = RULER_BAND + 2 + 6;

/** Padding inside the preset panel, and its least distance from the viewport's and the control's edges, in pixels. */
const PANEL_PADDING = 4;
const PANEL_MARGIN = 8;

/** Height of the panel's header showing the value, which the hand may hide on the control. */
const PANEL_HEADER = 22;

/** Share of a cell's width, around its middle, that gives the cell's preset exactly in a `'grid'` panel. */
const PANEL_EXACT_SHARE = 0.4;

/** The preset nearest to `value`. */
function nearestByValue(points: readonly number[], value: number): number {
  return points.reduce((best, point) => (Math.abs(point - value) < Math.abs(best - value) ? point : best));
}

/** Whether `(x, y)` lies over the preset panel. */
function insidePanel(panel: SnapPanelSetup, x: number, y: number): boolean {
  return x >= panel.left && x <= panel.left + panel.width && y >= panel.top && y <= panel.top + panel.height;
}

/**
 * The value under `(x, y)` in the panel, with the preset of its cell; `exact` when it is that preset. Between
 * presets, the value moves from the cell's preset to halfway to its neighbour's at the cell's edge, so adjacent
 * cells meet at the same value. `row` and `x` place the grid's thumb: `x` runs along the row from the grid's left
 * edge and jumps to the cell's centre while the preset holds.
 */
function panelPickAt(
  panel: SnapPanelSetup,
  x: number,
  y: number
): { value: number; point: number; exact: boolean; row: number; x: number } | undefined {
  const column = Math.floor((x - panel.left - PANEL_PADDING) / PANEL_CELL_WIDTH);
  const row = Math.floor((y - panel.top - PANEL_PADDING - PANEL_HEADER) / PANEL_CELL_HEIGHT);
  const index = row * PANEL_COLUMNS + column;
  const point = column >= 0 && column < PANEL_COLUMNS && row >= 0 ? panel.points[index] : undefined;

  if (point === undefined) {
    return undefined;
  }

  // -1 at the cell's left edge, 1 at its right edge.
  const offset = (x - panel.left - PANEL_PADDING - (column + 0.5) * PANEL_CELL_WIDTH) / (PANEL_CELL_WIDTH / 2);
  const toward =
    Math.abs(offset) <= PANEL_EXACT_SHARE ? 0 : (Math.abs(offset) - PANEL_EXACT_SHARE) / (1 - PANEL_EXACT_SHARE);
  const neighbour = offset > 0 ? (panel.points[index + 1] ?? panel.max) : (panel.points[index - 1] ?? panel.min);

  if (!panel.between || toward === 0 || neighbour === point) {
    return { value: point, point, exact: true, row, x: (column + 0.5) * PANEL_CELL_WIDTH };
  }

  const value =
    point > 0 && neighbour > 0
      ? point * (neighbour / point) ** (toward / 2)
      : point + ((neighbour - point) * toward) / 2;
  return { value, point, exact: false, row, x: x - panel.left - PANEL_PADDING };
}

/** What the pen points at in the panel. */
type PanelPick = NonNullable<ReturnType<typeof panelPickAt>>;

/**
 * Grid of presets like CLIP STUDIO PAINT's Brush Size palette under a header showing the value: each cell shows a
 * dot sized after its value and the value below. The pointed cell is blue and the current value's cell is shaded.
 * A `'grid'` panel strings each row's dots on a line with small ticks between them, so rows read as sliders, and
 * shows a thumb with the value above the pen: it glides between dots and jumps onto a dot while its preset holds.
 * Hit testing happens in the gesture handlers, so the panel ignores the pointer; its outline is a ring rather than a
 * border so cells sit where the hit test expects them.
 */
function SnapPanel(props: { setup: SnapPanelSetup; hovered: PanelPick | undefined; value: number; label: string }) {
  const rows = () => Math.ceil(props.setup.points.length / PANEL_COLUMNS);
  const rowLength = (row: number) => Math.min(PANEL_COLUMNS, props.setup.points.length - row * PANEL_COLUMNS);

  return (
    <div
      class="pointer-events-none fixed z-50 rounded-lg bg-white shadow-lg ring-1 ring-slate-300 select-none"
      style={{ left: `${props.setup.left}px`, top: `${props.setup.top}px`, padding: `${PANEL_PADDING}px` }}
    >
      <div
        class="flex items-center justify-center text-sm font-medium text-blue-600 tabular-nums"
        style={{ height: `${PANEL_HEADER}px` }}
      >
        {props.label}
      </div>
      <div
        class="relative grid"
        style={{
          'grid-template-columns': `repeat(${PANEL_COLUMNS}, ${PANEL_CELL_WIDTH}px)`,
          'grid-auto-rows': `${PANEL_CELL_HEIGHT}px`
        }}
      >
        <Show when={props.setup.between}>
          <svg
            class="absolute inset-0"
            width={PANEL_COLUMNS * PANEL_CELL_WIDTH}
            height={rows() * PANEL_CELL_HEIGHT}
            aria-hidden="true"
          >
            <For each={Array.from({ length: rows() }, (_, row) => row)}>
              {(row) => {
                const y = row * PANEL_CELL_HEIGHT + PANEL_DOT_AREA / 2;
                const from = PANEL_CELL_WIDTH / 2;
                const to = (rowLength(row) - 0.5) * PANEL_CELL_WIDTH;

                return (
                  <>
                    <line x1={from} x2={to} y1={y} y2={y} class="stroke-slate-300" />
                    <For each={Array.from({ length: rowLength(row) - 1 }, (_, gap) => gap)}>
                      {(gap) => (
                        <For each={GAP_TICKS}>
                          {(tick) => {
                            const x = from + gap * PANEL_CELL_WIDTH + tick * PANEL_CELL_WIDTH;
                            const half = tick === 0.5 ? 4 : 2.5;
                            return <line x1={x} x2={x} y1={y - half} y2={y + half} class="stroke-slate-400" />;
                          }}
                        </For>
                      )}
                    </For>
                  </>
                );
              }}
            </For>
          </svg>
        </Show>
        <For each={props.setup.points}>
          {(point) => (
            <div
              class={[
                'relative flex flex-col items-center rounded',
                point === props.hovered?.point && props.hovered.exact
                  ? 'bg-blue-500 text-white'
                  : point === props.value
                    ? 'bg-slate-200 text-slate-700'
                    : 'text-slate-700'
              ]}
            >
              <div class="flex items-center" style={{ height: `${PANEL_DOT_AREA}px` }}>
                <div
                  class="rounded-full bg-current"
                  style={{
                    width: `${previewDiameter(point, props.setup.between)}px`,
                    height: `${previewDiameter(point, props.setup.between)}px`
                  }}
                />
              </div>
              <span class="text-[10px] leading-none tabular-nums">{point}</span>
            </div>
          )}
        </For>
        <Show when={props.setup.between && props.hovered}>
          {(hovered) => (
            <div class="absolute" style={{ left: `${hovered().x}px`, top: `${hovered().row * PANEL_CELL_HEIGHT}px` }}>
              <Show when={!hovered().exact}>
                <div class="absolute h-8 w-0.5 -translate-x-1/2 rounded bg-blue-500" />
              </Show>
              <div class="absolute -top-1.5 -translate-x-1/2 -translate-y-full rounded bg-blue-500 px-1.5 py-0.5 text-xs whitespace-nowrap text-white tabular-nums">
                {props.label}
              </div>
            </div>
          )}
        </Show>
      </div>
    </div>
  );
}

/** Height of a panel cell's dot area, above its label; a `'grid'` panel strings the dots through its middle. */
const PANEL_DOT_AREA = 32;

/**
 * Ticks between two dots of a `'grid'` row, as shares of a cell width from the left dot: evenly over the stretches
 * that give values between presets, beyond each cell's exact middle, with the taller halfway tick on the boundary.
 */
const GAP_TICKS = [0.3, 0.4, 0.5, 0.6, 0.7];

/**
 * Diameter of a preset's preview dot: its size in pixels, kept visible when tiny and within the cell when large;
 * smaller in a `'grid'` panel, where the gaps between dots must stay visible.
 */
function previewDiameter(size: number, between: boolean): number {
  return Math.max(1.5, Math.min(between ? 20 : 28, size));
}

/** Dot marking a snap point; the one holding the value turns blue and grows. */
function SnapDot(props: { x: number; y: number; active: boolean }) {
  return (
    <circle
      cx={props.x}
      cy={props.y}
      r={props.active ? 5 : 3}
      class={props.active ? 'fill-blue-500' : 'fill-slate-400'}
    />
  );
}

/** The snap point within `[min, max]` nearest to `value` along the ruler, if any. */
function nearestSnapPoint(
  points: readonly number[] | undefined,
  scale: ValueScale,
  value: number,
  min: number,
  max: number
): number | undefined {
  const px = scale.toPx(value);
  let best: number | undefined;
  let bestDistance = Infinity;

  for (const point of points ?? []) {
    const distance = Math.abs(scale.toPx(point) - px);

    if (point >= min && point <= max && distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }

  return best;
}

/** Snap points in `[lo, hi]` to draw, skipping any closer than {@link MIN_DOT_GAP} pixels to the previous dot. */
function drawnSnapPoints(points: readonly number[] | undefined, scale: ValueScale, lo: number, hi: number) {
  const drawn: number[] = [];
  let lastPx = -Infinity;

  for (const point of points ?? []) {
    const px = scale.toPx(point);

    if (point >= lo && point <= hi && px - lastPx >= MIN_DOT_GAP) {
      drawn.push(point);
      lastPx = px;
    }
  }

  return drawn;
}

/** Narrowest gap between drawn snap dots, in pixels. */
const MIN_DOT_GAP = 5;

/** Tick lengths for minor, every-fifth, and labelled every-tenth ticks. */
const TICK_LENGTHS = [6, 10, 16] as const;

/** Narrowest gap between neighbouring ticks; denser ranges switch to larger tick values. */
const MIN_TICK_GAP = 7;

/**
 * Lists ticks for values in `[lo, hi]`. Each scale segment picks its own tick value from its pixel density, so a
 * curve's fine ranges tick in small values and its coarse ranges in large ones.
 */
function scaleTicks(scale: ValueScale, lo: number, hi: number, step: number) {
  const ticks = new Map<number, { value: number; rank: 0 | 1 | 2 }>();

  for (const segment of scale.segments) {
    const unit = tickUnit(step, 1 / segment.pxPerValue);
    const first = Math.ceil(Math.max(lo, segment.from) / unit);
    const last = Math.floor(Math.min(hi, segment.to) / unit);

    for (let i = first; i <= last; i++) {
      const value = snap(i * unit, unit);

      if (!ticks.has(value)) {
        ticks.set(value, { value, rank: i % 10 === 0 ? 2 : i % 5 === 0 ? 1 : 0 });
      }
    }
  }

  return [...ticks.values()];
}

/** Picks the smallest 1-2-5 multiple of `step` whose ticks sit at least {@link MIN_TICK_GAP} pixels apart. */
function tickUnit(step: number, rate: number): number {
  for (let magnitude = step; ; magnitude *= 10) {
    for (const factor of [1, 2, 5]) {
      const unit = snap(magnitude * factor, step);

      if (unit / rate >= MIN_TICK_GAP) {
        return unit;
      }
    }
  }
}

/** Rounds `value` to a multiple of `step`, trimming floating-point noise to the step's decimals. */
function snap(value: number, step: number): number {
  return +(Math.round(value / step) * step).toFixed(decimalsOf(step));
}

/** Counts the decimal places of `n`, including exponent notation such as `1e-7`. */
function decimalsOf(n: number): number {
  const [mantissa, exponent = '0'] = String(n).split('e-');
  const dot = mantissa.indexOf('.');

  return (dot < 0 ? 0 : mantissa.length - dot - 1) + Number(exponent);
}
