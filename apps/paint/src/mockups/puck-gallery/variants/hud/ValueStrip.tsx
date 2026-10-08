import { createSignal, flush, For, Show } from 'solid-js';
import { SketchIcon } from '../../../../shared/ui/SketchIcon';
import type { Point } from '../../kit/createSketchCanvas';
import type { Studio } from '../../kit/createStudio';
import { pressHandlers } from '../../kit/pressHandlers';
import type { NumberSetting } from '../../kit/values';
import { formatValue, roundValue, stepPreset } from '../../kit/values';
import { galleryUi } from '../../kit/variant';
import { clamp, openSide, shiftRect, windowEdges, type Rect } from './geometry';
import styles from './Hud.module.css';
import { placeStrip, stripPress, type StripContext } from './strip';

/** The strips that set one number by sliding along an axis. */
export type ValueFunction = 'size' | 'opacity' | 'zoom' | 'history';

/**
 * Opens a value strip with the current value at `context.home`. Size and History lie horizontally just above the
 * pen, Opacity and Zoom vertically on the open side, so the hand never covers the readout. Sliding along the axis
 * changes the value live (geometrically for Size and Zoom); within 5 px of home it is the starting value, so a lift
 * there changes nothing. When the window is too small for the whole range on one side of home, only that side is
 * compressed, so both ends stay reachable without a jump. Returns a note instead when the tool lacks the setting.
 */
export function createValueStrip(context: StripContext, fn: ValueFunction) {
  const scale = scaleOf(fn, context);
  if (typeof scale === 'string') {
    return createNoteStrip(context, fn, scale);
  }

  const { home } = context;
  const origin = scale.toUnits(scale.read());
  const horizontal = scale.axis === 'x';
  const side = openSide(context.hand);
  // Room on each side of home along the axis; positive is right or up.
  const room = horizontal
    ? { plus: innerWidth - windowEdges.margin - home.x, minus: home.x - windowEdges.margin }
    : { plus: home.y - windowEdges.top, minus: innerHeight - windowEdges.margin - home.y };
  const perUnit = (space: number, span: number) =>
    span <= 0 ? scale.pxPerUnit : clamp((space - bandEnd - deadZone) / span, 3, scale.pxPerUnit);
  const plus = perUnit(room.plus, scale.max - origin);
  const minus = perUnit(room.minus, origin - scale.min);
  /** Offset from home along the axis (right or up positive) where `units` lie. */
  const offsetOf = (units: number) =>
    units > origin ? deadZone + (units - origin) * plus : units < origin ? -deadZone - (origin - units) * minus : 0;
  const unitsAt = (offset: number) =>
    offset > deadZone
      ? origin + (offset - deadZone) / plus
      : offset < -deadZone
        ? origin + (offset + deadZone) / minus
        : origin;
  const offsetAt = (point: Point) => (horizontal ? point.x - home.x : home.y - point.y);
  /** Client coordinate along the axis of `units`. */
  const along = (units: number) => (horizontal ? home.x + offsetOf(units) : home.y - offsetOf(units));

  const from = offsetOf(scale.min) - bandEnd;
  const to = offsetOf(scale.max) + bandEnd;
  let rect: Rect = horizontal
    ? { left: home.x + from, top: home.y - bandGap - bandThickness, width: to - from, height: bandThickness }
    : {
        left: side > 0 ? home.x + bandGap : home.x - bandGap - bandThickness,
        top: home.y - to,
        width: bandThickness,
        height: to - from
      };
  // Only the perpendicular position may change: moving along the axis would move the values away from the pen.
  const away = horizontal ? { x: 0, y: home.y <= context.center.y + 12 ? -1 : 1 } : { x: side, y: 0 };
  const shift = placeStrip(context, rect, [away, { x: -away.x, y: -away.y }]);
  rect = shiftRect(rect, horizontal ? { x: 0, y: shift.y } : { x: shift.x, y: 0 });

  let latest = scale.read();
  let committed = latest;
  const [value, setValue] = createSignal(latest);
  const show = (next: number) => {
    if (scale.same(next, latest)) {
      return;
    }

    scale.write(next);
    latest = next;
    setValue(next);
  };

  return {
    kind: 'value' as const,
    fn,
    name: scale.name,
    horizontal,
    side,
    rect,
    home,
    /** The zoom pivot: the ring's center. */
    pivot: context.center,
    /** Client coordinate of home along the axis. */
    homeAt: horizontal ? home.x : home.y,
    ticks: scale.ticks.map((tick) => ({ ...tick, at: along(tick.units) })),
    value,
    /** Client coordinate along the axis of the current value. */
    thumbAt: () => along(scale.toUnits(value())),
    readout: () => scale.format(value()),
    /** The size dot's diameter at the current value, for the Size thumb. */
    dotAt: () => scale.dot?.(value()) ?? 0,
    finishes: scale.finishes,
    move(point: Point) {
      show(scale.fromUnits(unitsAt(offsetAt(point))));
    },
    tap(point: Point) {
      const offset = offsetAt(point);
      const near = scale.ticks.find((tick) => tick.snap && Math.abs(offsetOf(tick.units) - offset) <= 9);
      show(near ? near.value : scale.fromUnits(unitsAt(offset)));
    },
    step(dx: number, dy: number) {
      const by = horizontal ? dx || dy : dy || dx;
      show(scale.step(latest, by));
    },
    commit() {
      const changed = !scale.same(latest, committed);
      committed = latest;
      return changed;
    },
    cancel() {
      show(committed);
    },
    /** Takes over a value changed elsewhere, such as Fit; call after `flush()` so that the read is current. */
    resync() {
      latest = scale.read();
      committed = latest;
      setValue(latest);
    }
  };
}

/** An open value strip. */
export type ValueStrip = Extract<ReturnType<typeof createValueStrip>, { kind: 'value' }>;

/**
 * A value strip: a translucent capsule with the scale's marks, the thumb at the current value and its readout. In
 * tap and key mode it takes taps (a mark snaps), drags and the wheel; History adds Undo and Redo, Zoom adds the view
 * commands.
 */
export function ValueStripView(props: {
  strip: ValueStrip;
  studio: Studio;
  /** Whether the strip takes presses itself (tap and key mode); a drag strip follows the press that opened it. */
  interactive: boolean;
  /** Hears whether a press on the strip changed anything. */
  committed: (changed: boolean) => void;
}) {
  const strip = props.strip;
  const press = stripPress(strip, (changed) => props.committed(changed));
  const wheel = createWheelSteps((by) => {
    strip.step(0, by);
    strip.commit();
  });
  const local = (at: number) => at - (strip.horizontal ? strip.rect.left : strip.rect.top);
  const cross = strip.horizontal ? strip.rect.height / 2 : strip.rect.width / 2;
  const point = (along: number, across: number) =>
    strip.horizontal ? { x: local(along), y: across } : { x: across, y: local(along) };
  const thumb = () => point(strip.thumbAt(), cross);

  return (
    <>
      <div
        {...galleryUi}
        {...(props.interactive ? press : {})}
        class={[styles.strip, { [styles.passive!]: !props.interactive }]}
        style={rectStyle(strip.rect)}
        onWheel={(event) => props.interactive && wheel(event)}
      >
        <Show when={strip.fn === 'opacity'}>
          <div
            class={styles.opacityTrack}
            style={{ '--hud-color': props.studio.color(), top: '14px', bottom: '14px' }}
          />
        </Show>
        <svg class={styles.marks} width={strip.rect.width} height={strip.rect.height}>
          <For each={strip.ticks}>
            {(tick) => {
              const at = point(tick.at, cross);
              return strip.fn === 'size' ? (
                <circle class={styles.dot} cx={at.x} cy={at.y} r={(tick.dot ?? 4) / 2} />
              ) : strip.horizontal ? (
                <line
                  class={[styles.tick, { [styles.future!]: tick.units > 0 }]}
                  x1={at.x}
                  x2={at.x}
                  y1={cross - (tick.major ? 8 : 5)}
                  y2={cross + (tick.major ? 8 : 5)}
                />
              ) : (
                <>
                  <line
                    class={[styles.tick, { [styles.major!]: tick.major }]}
                    x1={strip.side > 0 ? 3 : strip.rect.width - 3}
                    x2={strip.side > 0 ? (tick.major ? 11 : 8) : strip.rect.width - (tick.major ? 11 : 8)}
                    y1={at.y}
                    y2={at.y}
                  />
                  <Show when={tick.label}>
                    <text
                      class={styles.tickLabel}
                      x={strip.rect.width / 2 + strip.side * 4}
                      y={at.y}
                      text-anchor="middle"
                      dominant-baseline="central"
                    >
                      {tick.label}
                    </text>
                  </Show>
                </>
              );
            }}
          </For>
          <HomeMark strip={strip} at={point(strip.homeAt, cross)} />
          <Show
            when={strip.fn === 'size'}
            fallback={
              <>
                <line
                  class={styles.thumbLine}
                  x1={strip.horizontal ? thumb().x : 2}
                  x2={strip.horizontal ? thumb().x : strip.rect.width - 2}
                  y1={strip.horizontal ? 3 : thumb().y}
                  y2={strip.horizontal ? strip.rect.height - 3 : thumb().y}
                />
                <circle class={styles.thumbRing} cx={thumb().x} cy={thumb().y} r={4.5} />
              </>
            }
          >
            <circle class={styles.thumbRing} cx={thumb().x} cy={thumb().y} r={Math.max(5, strip.dotAt() / 2 + 3)} />
          </Show>
        </svg>
      </div>

      <Show
        when={props.interactive && strip.fn === 'history'}
        fallback={
          <div class={styles.readout} style={readoutStyle(strip, strip.thumbAt())}>
            <span>{strip.name}</span>
            <b>{strip.readout()}</b>
          </div>
        }
      >
        <HistoryButtons strip={strip} studio={props.studio} />
      </Show>

      <Show when={props.interactive && strip.fn === 'zoom'}>
        <ViewButtons strip={strip} studio={props.studio} />
      </Show>
    </>
  );
}

/**
 * Turns wheel events into whole steps, `by` +1 for a turn away from the user (up), so that a trackpad's many small
 * deltas do not race through the values. Prevents the page from zooming or scrolling.
 */
export function createWheelSteps(step: (by: number) => void) {
  let pending = 0;
  return (event: WheelEvent) => {
    event.preventDefault();
    event.stopPropagation();
    pending += event.deltaY || event.deltaX;
    while (Math.abs(pending) >= wheelNotch) {
      step(pending < 0 ? 1 : -1);
      pending -= Math.sign(pending) * wheelNotch;
    }
  };
}

/** A note where a strip would open, for a function the current tool lacks, such as a lasso's size. */
export function createNoteStrip(context: StripContext, fn: ValueFunction, text: string) {
  return {
    kind: 'note' as const,
    fn,
    text,
    at: context.home,
    finishes: false,
    move() {},
    tap() {},
    step() {},
    commit: () => false,
    cancel() {}
  };
}

/** An open note strip. */
export type NoteStrip = ReturnType<typeof createNoteStrip>;

/** Shows a note strip's text in a small tag above home. */
export function NoteStripView(props: { strip: NoteStrip }) {
  return (
    <div
      class={styles.readout}
      style={{ left: `${props.strip.at.x}px`, top: `${props.strip.at.y - 14}px`, translate: '-50% -100%' }}
    >
      <b>{props.strip.text}</b>
    </div>
  );
}

/** The CSS box of a client rectangle. */
export function rectStyle(rect: Rect) {
  return { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` };
}

/** A small mark at home on the band's edge nearest the pen: where a lift changes nothing. */
function HomeMark(props: { strip: ValueStrip; at: Point }) {
  const strip = props.strip;
  const { x, y } = props.at;
  const h = strip.rect.height;
  const w = strip.rect.width;
  const points = strip.horizontal
    ? `${x - 4},${h} ${x + 4},${h} ${x},${h - 5}`
    : strip.side > 0
      ? `0,${y - 4} 0,${y + 4} 5,${y}`
      : `${w},${y - 4} ${w},${y + 4} ${w - 5},${y}`;
  return <polygon class={styles.homeMark} points={points} />;
}

/** Where the readout of a strip sits: above a horizontal thumb, beside a vertical one on the open side. */
function readoutStyle(strip: ValueStrip, at: number) {
  if (strip.horizontal) {
    return {
      left: `${clamp(at, windowEdges.margin + 44, innerWidth - windowEdges.margin - 44)}px`,
      top: `${strip.rect.top - 5}px`,
      translate: '-50% -100%'
    };
  }

  return {
    left: `${strip.side > 0 ? strip.rect.left + strip.rect.width + 7 : strip.rect.left - 7}px`,
    top: `${at}px`,
    translate: strip.side > 0 ? '0 -50%' : '-100% -50%'
  };
}

/** Undo and Redo around the History readout, fixed above home so that repeated taps stay on target. */
function HistoryButtons(props: { strip: ValueStrip; studio: Studio }) {
  const strip = props.strip;
  const stepBy = (by: number) => {
    strip.step(by, 0);
    strip.commit();
  };
  const undo = pressHandlers({ tap: () => stepBy(-1) });
  const redo = pressHandlers({ tap: () => stepBy(1) });
  return (
    <div
      class={styles.buttonRow}
      style={{
        left: `${clamp(strip.homeAt, 120, innerWidth - 120)}px`,
        top: `${strip.rect.top - 6}px`,
        translate: '-50% -100%'
      }}
    >
      <button {...galleryUi} {...undo} class={styles.button} title="Undo">
        <SketchIcon name="undo" size={16} />
      </button>
      <span class={styles.buttonReadout}>
        <b>{strip.readout()}</b>
      </span>
      <button {...galleryUi} {...redo} class={styles.button} title="Redo">
        <SketchIcon name="redo" size={16} />
      </button>
    </div>
  );
}

/** Fit, 100 %, Flip and Symmetry beside the Zoom strip, on the hand's side. */
function ViewButtons(props: { strip: ValueStrip; studio: Studio }) {
  const strip = props.strip;
  const studio = props.studio;
  const commands = [
    { label: 'Fit', run: () => studio.fit(), on: () => false },
    { label: '100%', run: () => studio.zoomTo(1, strip.pivot), on: () => Math.abs(studio.view().scale - 1) < 0.005 },
    { label: 'Flip', run: () => studio.flip(), on: () => studio.view().flipped },
    { label: 'Sym', run: () => studio.toggleSymmetry(), on: () => studio.symmetry() }
  ];
  return (
    <div
      class={styles.buttonColumn}
      style={{
        left: `${strip.side > 0 ? strip.rect.left - 6 : strip.rect.left + strip.rect.width + 6}px`,
        top: `${clamp(strip.homeAt - 20, windowEdges.top, innerHeight - windowEdges.margin - 130)}px`,
        translate: strip.side > 0 ? '-100% 0' : '0 0'
      }}
    >
      <For each={commands}>
        {(command) => {
          const press = pressHandlers({
            tap: () => {
              command.run();
              flush();
              strip.resync();
            }
          });
          return (
            <button {...galleryUi} {...press} class={[styles.button, styles.wide, { [styles.on!]: command.on() }]}>
              {command.label}
            </button>
          );
        }}
      </For>
    </div>
  );
}

/** A mark on a value strip: a size dot, a percent tick, a zoom level or a history step. */
type Tick = {
  units: number;
  value: number;
  /** A size dot's diameter. */
  dot?: number;
  label?: string;
  major?: boolean;
  /** Whether a tap within a few pixels picks exactly this value. */
  snap?: boolean;
};

/** How a value strip maps a function's value to positions, reads and writes it, and prints it. */
type Scale = {
  axis: 'x' | 'y';
  name: string;
  /** Units along the strip: log2 for sizes and zoom, so each doubling takes the same distance. */
  toUnits: (value: number) => number;
  /** The value at `units`, rounded and clamped as the function stores it. */
  fromUnits: (units: number) => number;
  min: number;
  max: number;
  pxPerUnit: number;
  read: () => number;
  write: (value: number) => void;
  same: (a: number, b: number) => boolean;
  ticks: readonly Tick[];
  format: (value: number) => string;
  step: (value: number, by: number) => number;
  dot?: (value: number) => number;
  finishes: boolean;
};

/** The scale for a value function, or why the current tool cannot have one. */
function scaleOf(fn: ValueFunction, context: StripContext): Scale | string {
  const { studio } = context;
  const exact = (a: number, b: number) => a === b;

  if (fn === 'size' || fn === 'opacity') {
    const setting = studio
      .settings()
      .find((entry): entry is NumberSetting => entry.kind === 'number' && entry.key === fn);
    if (!setting) {
      return `${studio.toolInfo().label} has no ${fn}`;
    }

    if (fn === 'size') {
      const min = Math.log2(setting.min);
      const max = Math.log2(setting.max);
      const dot = (value: number) => 2.5 + (18 * (Math.log2(value) - min)) / (max - min);
      return {
        axis: 'x',
        name: 'Size',
        toUnits: Math.log2,
        fromUnits: (units) => roundValue(clamp(2 ** units, setting.min, setting.max)),
        min,
        max,
        pxPerUnit: 30,
        read: () => studio.number('size'),
        write: (value) => studio.setValue('size', value),
        same: exact,
        ticks: sizeDots
          .filter((value) => value >= setting.min && value <= setting.max)
          .map((value) => ({ units: Math.log2(value), value, dot: dot(value), snap: true })),
        format: (value) => `${formatValue(value)} px`,
        step: (value, by) => stepPreset(setting, value, by),
        dot,
        finishes: true
      };
    }

    return {
      axis: 'y',
      name: 'Opacity',
      toUnits: (value) => value,
      fromUnits: (units) => Math.round(clamp(units, 0, 100)),
      min: 0,
      max: 100,
      pxPerUnit: 2.1,
      read: () => studio.number('opacity'),
      write: (value) => studio.setValue('opacity', value),
      same: exact,
      ticks: Array.from({ length: 11 }, (_, index) => ({
        units: index * 10,
        value: index * 10,
        major: index % 5 === 0,
        snap: true
      })),
      format: (value) => `${Math.round(value)}%`,
      step: (value, by) => stepPreset(setting, value, by),
      finishes: true
    };
  }

  if (fn === 'zoom') {
    const min = Math.log2(0.05);
    const max = Math.log2(16);
    return {
      axis: 'y',
      name: 'Zoom',
      toUnits: Math.log2,
      fromUnits: (units) => 2 ** clamp(units, min, max),
      min,
      max,
      pxPerUnit: 40,
      read: () => studio.view().scale,
      write: (value) => studio.zoomTo(value, context.center),
      same: (a, b) => Math.abs(a / b - 1) < 1e-4,
      ticks: zoomLevels.map((value) => ({
        units: Math.log2(value),
        value,
        major: value === 1,
        label: value >= 0.25 && Math.log2(value) % 2 === 0 ? `${Math.round(value * 100)}` : undefined,
        snap: true
      })),
      format: (value) => `${Math.round(value * 100)}%`,
      step: (value, by) => clamp(value * 2 ** (by / 2), 0.05, 16),
      finishes: false
    };
  }

  const { done, undone } = studio.history();
  let applied = 0;
  const every = Math.max(1, Math.ceil((done + undone) / 120));
  return {
    axis: 'x',
    name: 'History',
    toUnits: (value) => value,
    fromUnits: (units) => Math.round(clamp(units, -done, undone)),
    min: -done,
    max: undone,
    pxPerUnit: 18,
    read: () => applied,
    write(offset) {
      while (applied > offset) {
        studio.undo();
        applied -= 1;
      }

      while (applied < offset) {
        studio.redo();
        applied += 1;
      }
    },
    same: exact,
    ticks: Array.from({ length: done + undone + 1 }, (_, index) => index - done)
      .filter((offset) => offset % every === 0)
      .map((offset) => ({ units: offset, value: offset, major: offset === 0 })),
    format: (offset) =>
      offset < 0 ? `Undo ${-offset}` : offset > 0 ? `Redo ${offset}` : done + undone === 0 ? 'Nothing yet' : 'Now',
    step: (offset, by) => clamp(offset + by, -done, undone),
    finishes: false
  };
}

/** Pixels from home within which a value strip keeps its starting value. */
const deadZone = 5;
/** Padding beyond a value strip's first and last marks. */
const bandEnd = 14;
const bandThickness = 34;
/** Gap between the pen and a value strip's band. */
const bandGap = 10;
/** Wheel delta per step; a mouse notch is about 100. */
const wheelNotch = 60;
/** Brush sizes drawn as dots on the Size strip, about two-thirds of a doubling apart. */
const sizeDots = [1, 2, 3, 5, 8, 12, 20, 30, 50, 80, 120, 200, 300, 500, 800];
const zoomLevels = [1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8, 16];
