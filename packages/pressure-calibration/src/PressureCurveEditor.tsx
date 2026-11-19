import {
  maxPressurePoints,
  normalizePressureCurve,
  pointGap,
  pressureMapping,
  type PressureCurve,
  type PressurePoint
} from '@app-game/paint-core/pressureCurve';
import { createElementSize } from '@solid-primitives/resize-observer';
import { createMemo, createSignal, For, Show } from 'solid-js';
import styles from './PressureCalibration.module.css';

/**
 * The curve from raw pen pressure (across) to the pressure brushes receive (up), over a histogram of measured raw
 * pressure, edited like CLIP STUDIO PAINT's pressure curve:
 *
 * - a press near a point drags it freely, between its neighbours and with the output never falling; the end points
 *   move too: the first one right for a threshold or up for a least pressure, the last one left or down;
 * - a press on the curve away from points adds a point there, up to {@link maxPressurePoints}, and drags it;
 * - a double tap on an inner point, or dragging it off the graph and letting go, removes it;
 * - a focused point moves by 1% with the arrow keys (10% with Shift); Delete or Backspace removes an inner one.
 *
 * Every change reports a normalized curve through `onChange`, while dragging too. `marker`, the raw pressure of a pen
 * touching a canvas the host watches, shows as a dot running along the curve; while a pen presses the graph itself,
 * the dot follows that pen. The dashed diagonal is the uncalibrated pen. There are no Bézier handles: on a tablet they
 * would double the small targets.
 *
 * The graph draws at its element's own size, one unit to a CSS pixel, so points and their reach keep their size on a
 * small graph; unmeasured it is 480 × 260. By default it is as wide as its parent at that ratio; a host that sets its
 * height (with `aspect-ratio: auto`) gets a graph of any shape. Its margins shrink on a small graph.
 *
 * Colors and sizes come from custom properties, each with a fallback: `--ink` (the curve, points, text), `--muted`,
 * `--surface` (the graph and the points' fill), `--line` (the border), `--accent` (the pen dot and a focused point),
 * `--curve-point` (a point's radius, 6px), `--curve-point-fill` and `--curve-point-ink` (its fill and ring, the
 * surface and the ink), `--curve-reach` (how far from a point a press takes it, 22px; read at each press),
 * `--curve-marker` and `--curve-marker-fill` (the pen dot's radius, 7px, and color, the accent), `--curve-bar` (the
 * histogram's bars, a faint ink), `--curve-text` (the readout's size, 12px) and `--curve-readout` (`none` hides the
 * readout, as on a small graph).
 */
export function PressureCurveEditor(props: {
  curve: PressureCurve;
  /** Raw pressures measured during calibration, for the histogram; none draws no bars. */
  measured?: readonly number[];
  /** Raw pressure of the pen touching the host's canvas now; nothing shows without it, unless a pen presses the graph. */
  marker?: number | undefined;
  /** Receives the changed curve, already normalized. */
  onChange: (curve: PressureCurve) => void;
  /**
   * Makes the shown point's two values taps that offer number entry, for a host with a keypad: called with the value
   * and the element showing it, to anchor the entry to.
   */
  onEntry?: (entry: PointEntry, anchor: Element) => void;
  /** Added to the graph's own class, for a host's size. */
  class?: string;
}) {
  const [svg, setSvg] = createSignal<SVGSVGElement>();
  // Environments without ResizeObserver, as jsdom, draw at the fallback size.
  const measuredSize = typeof ResizeObserver === 'function' ? createElementSize(svg) : unmeasured;
  /** The graph's size and margins in its units, which are its CSS pixels once measured. */
  const frame = createMemo(() => {
    const width = measuredSize.width ?? 0;
    const height = measuredSize.height ?? 0;
    const size = width >= 1 && height >= 1 ? { width, height } : fallbackSize;
    const margin = Math.max(14, Math.min(28, Math.floor(Math.min(size.width, size.height) * 0.11)));
    return { ...size, margin, top: Math.max(margin, readoutRoom) };
  });
  const x = (raw: number) => frame().margin + raw * (frame().width - 2 * frame().margin);
  const y = (value: number) =>
    frame().height - frame().margin - value * (frame().height - frame().margin - frame().top);
  /** The point being dragged and the pointer dragging it; `removing` while it is off the graph. */
  const [drag, setDrag] = createSignal<{ index: number; pointerId: number; removing: boolean }>();
  /** The point last pressed or focused, whose values the readout shows. */
  const [active, setActive] = createSignal<number>();
  /** Raw pressure of a pen pressing the graph itself. */
  const [penOnGraph, setPenOnGraph] = createSignal<number>();
  const marker = () => props.marker ?? penOnGraph();
  /** The last press on a point, for telling a double tap. */
  let lastTap: { index: number; time: number } | undefined;
  const map = createMemo(() => pressureMapping(props.curve));
  const points = () => props.curve.points;
  const bars = () => {
    const counts = Array<number>(bins).fill(0);
    for (const pressure of props.measured ?? []) {
      counts[Math.min(bins - 1, Math.floor(pressure * bins))]!++;
    }

    const highest = Math.max(1, ...counts);
    return counts.map((count) => count / highest);
  };
  const path = () =>
    Array.from({ length: 161 }, (_, step) => {
      const raw = step / 160;
      return `${step ? 'L' : 'M'}${x(raw)},${y(map()(raw))}`;
    }).join('');
  const readout = (): Readout => {
    const pen = marker();
    if (pen !== undefined && drag() === undefined) {
      return { kind: 'pen', pen, brush: map()(pen) };
    }

    const index = active() ?? -1;
    const point = points()[index];
    if (!point || drag()?.removing) {
      return { kind: 'none' };
    }

    return { kind: 'point', index, pen: point.x, brush: point.y };
  };
  /** The point the readout shows, whose values may open number entry. */
  const shownPoint = () => {
    const shown = readout();
    return shown.kind === 'point' ? shown : undefined;
  };
  /** The readout as plain text, when it shows no point. */
  const readoutText = () => {
    const shown = readout();
    return shown.kind === 'pen' ? `Pen ${percent(shown.pen)}% → brush ${percent(shown.brush)}%` : '';
  };
  const change = (next: readonly PressurePoint[]) => props.onChange(normalizePressureCurve({ points: next }));
  /** Moves point `index` to raw `to`, kept between its neighbours and with the output never falling. */
  const move = (index: number, to: PressurePoint) => {
    const all = points();
    const { pen, brush } = pointBounds(all, index);
    const next = {
      x: round(Math.max(pen.min, Math.min(pen.max, to.x))),
      y: round(Math.max(brush.min, Math.min(brush.max, to.y)))
    };
    const current = all[index]!;
    if (next.x !== current.x || next.y !== current.y) {
      change(all.map((point, each) => (each === index ? next : point)));
    }
  };
  const remove = (index: number) => {
    if (index > 0 && index < points().length - 1) {
      change(points().filter((_, each) => each !== index));
      setActive(undefined);
    }
  };
  /** Offers number entry for one value of point `index`, anchored to `anchor`. */
  const enter = (index: number, axis: PointEntry['axis'], anchor: Element) => {
    const point = points()[index];
    if (!point || !props.onEntry) {
      return;
    }

    const bounds = pointBounds(points(), index)[axis];
    props.onEntry(
      {
        axis,
        label: axis === 'pen' ? 'Pen' : 'Brush',
        value: percent(axis === 'pen' ? point.x : point.y),
        min: Math.ceil(bounds.min * 100),
        max: Math.floor(bounds.max * 100),
        set: (value) => {
          const current = points()[index];
          if (current) {
            move(index, axis === 'pen' ? { x: value / 100, y: current.y } : { x: current.x, y: value / 100 });
          }
        }
      },
      anchor
    );
  };
  /** A pointer's position in graph units and in raw pressure and output. */
  const locate = (event: PointerEvent) => {
    const rect = svg()!.getBoundingClientRect();
    const scale = frame().width / rect.width;
    const left = (event.clientX - rect.left) * scale;
    const top = (event.clientY - rect.top) * scale;
    const { width, height, margin } = frame();
    return {
      left,
      top,
      raw: { x: (left - margin) / (width - 2 * margin), y: (height - margin - top) / (height - margin - frame().top) }
    };
  };
  const followPen = (event: PointerEvent) => {
    if (event.pointerType === 'pen') {
      setPenOnGraph(Math.max(0, Math.min(1, event.pressure)));
    }
  };

  return (
    <svg
      ref={setSvg}
      class={[styles.chart, props.class]}
      viewBox={`0 0 ${frame().width} ${frame().height}`}
      role="group"
      aria-label="Pressure curve"
      onPointerDown={(event) => {
        if (
          drag() ||
          (event.pointerType === 'mouse' && event.button !== 0) ||
          (event.target instanceof Element && event.target.closest('[data-entry]'))
        ) {
          return;
        }

        followPen(event);
        const { left, top, raw } = locate(event);
        const hit = nearestPoint(points(), left, top);
        let index: number | undefined;
        if (hit !== undefined) {
          const time = event.timeStamp;
          if (lastTap?.index === hit && time - lastTap.time < doubleTapMs) {
            lastTap = undefined;
            remove(hit);
            event.preventDefault();
            return;
          }

          lastTap = { index: hit, time };
          index = hit;
        } else {
          index = insertAt(raw.x, top);
        }

        if (index === undefined) {
          return;
        }

        event.preventDefault();
        svg()!.setPointerCapture(event.pointerId);
        setDrag({ index, pointerId: event.pointerId, removing: false });
        setActive(index);
      }}
      onPointerMove={(event) => {
        if (event.buttons & 1) {
          followPen(event);
        }

        const current = drag();
        if (current?.pointerId !== event.pointerId) {
          return;
        }

        const { left, top, raw } = locate(event);
        const { width, height, margin } = frame();
        const inner = current.index > 0 && current.index < points().length - 1;
        const removing =
          inner &&
          (left < margin - removeDistance ||
            left > width - margin + removeDistance ||
            top < frame().top - removeDistance ||
            top > height - margin + removeDistance);
        if (removing !== current.removing) {
          setDrag({ ...current, removing });
        }

        if (!removing) {
          move(current.index, raw);
        }
      }}
      onPointerUp={(event) => {
        setPenOnGraph(undefined);
        const current = drag();
        if (current?.pointerId === event.pointerId) {
          setDrag(undefined);
          if (current.removing) {
            remove(current.index);
          }
        }
      }}
      onPointerCancel={() => {
        setPenOnGraph(undefined);
        setDrag(undefined);
      }}
      onPointerLeave={() => {
        // A pen pressing on into the graph from outside and lifting outside it sends the graph no pointerup.
        if (!drag()) {
          setPenOnGraph(undefined);
        }
      }}
    >
      <For each={bars()} keyed={false}>
        {(share, index) => (
          <rect
            class={styles.bar}
            x={x(index / bins) + 0.5}
            y={y(share() * 0.9)}
            width={Math.max(0, (frame().width - 2 * frame().margin) / bins - 1)}
            height={y(0) - y(share() * 0.9)}
          />
        )}
      </For>
      <path class={styles.frame} d={`M${x(0)},${y(1)}V${y(0)}H${x(1)}`} />
      <path class={styles.identity} d={`M${x(0)},${y(0)}L${x(1)},${y(1)}`} />
      <path class={styles.curve} d={path()} />
      <Show when={marker() !== undefined}>
        <circle class={styles.marker} cx={x(marker()!)} cy={y(map()(marker()!))} r={7} />
      </Show>
      {/* Index-keyed, so a point's element survives the curve being replaced on every move of a drag. */}
      <For each={points()} keyed={false}>
        {(point, index) => (
          <g
            class={styles.point}
            data-point={index}
            data-removing={drag()?.index === index && drag()?.removing ? 'true' : undefined}
            data-active={active() === index ? 'true' : undefined}
            tabindex="0"
            role="button"
            aria-label={`Point ${index + 1} of ${points().length}: pen ${percent(point().x)}%, brush ${percent(point().y)}%`}
            aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Delete"
            transform={`translate(${x(point().x)},${y(point().y)})`}
            onFocus={() => setActive(index)}
            onKeyDown={(event) => {
              const step = event.shiftKey ? 0.1 : 0.01;
              const offset = {
                ArrowLeft: [-step, 0],
                ArrowRight: [step, 0],
                ArrowDown: [0, -step],
                ArrowUp: [0, step]
              }[event.key];
              if (offset) {
                event.preventDefault();
                move(index, { x: point().x + offset[0]!, y: point().y + offset[1]! });
              } else if (event.key === 'Delete' || event.key === 'Backspace') {
                event.preventDefault();
                remove(index);
              }
            }}
          >
            <circle class={styles.hit} r={hitRadius} />
            <circle class={styles.handle} r={6} />
          </g>
        )}
      </For>
      <text class={styles.readout} x={x(0) + 6} y={frame().top - 8}>
        <Show when={shownPoint()} fallback={readoutText()}>
          {(point) => (
            <>
              {'Pen '}
              <ReadoutValue
                text={`${percent(point().pen)}%`}
                label="Pen pressure"
                entry={!!props.onEntry}
                onEnter={(anchor) => enter(point().index, 'pen', anchor)}
              />
              {' → brush '}
              <ReadoutValue
                text={`${percent(point().brush)}%`}
                label="Brush pressure"
                entry={!!props.onEntry}
                onEnter={(anchor) => enter(point().index, 'brush', anchor)}
              />
            </>
          )}
        </Show>
      </text>
      <text class={styles.axis} x={x(1)} y={frame().height - 6} text-anchor="end">
        pen
      </text>
      <text class={styles.axis} x={x(0) - 6} y={y(1) + 4} text-anchor="end">
        1
      </text>
    </svg>
  );

  /**
   * Adds a point on the curve at raw pressure `raw` when a press at graph height `top` lands on the curve, room is
   * left between the neighbours and the curve has fewer than the most points; returns its index.
   */
  function insertAt(raw: number, top: number) {
    const all = points();
    const after = all.findIndex((point) => point.x > raw);
    if (
      all.length >= maxPressurePoints ||
      after <= 0 ||
      raw - all[after - 1]!.x < pointGap ||
      all[after]!.x - raw < pointGap ||
      Math.abs(top - y(map()(raw))) > Math.max(curveReach, reach())
    ) {
      return undefined;
    }

    change([...all.slice(0, after), { x: round(raw), y: round(map()(raw)) }, ...all.slice(after)]);
    return after;
  }

  /** The point within reach of a press at graph position (`left`, `top`), the nearest if several. */
  function nearestPoint(all: readonly PressurePoint[], left: number, top: number) {
    const within = reach();
    let best: { index: number; distance: number } | undefined;
    all.forEach((point, index) => {
      const distance = Math.hypot(x(point.x) - left, y(point.y) - top);
      if (distance <= within && (!best || distance < best.distance)) {
        best = { index, distance };
      }
    });
    return best?.index;
  }

  /** Graph units around a point that a press takes it from: the host's `--curve-reach`, or {@link hitRadius}. */
  function reach() {
    const element = svg();
    const given = element ? parseFloat(getComputedStyle(element).getPropertyValue('--curve-reach')) : NaN;
    return Number.isFinite(given) && given > 0 ? given : hitRadius;
  }
}

/**
 * One value of a curve point offered for number entry (`PressureCurveEditor`'s `onEntry`): the point's raw pen
 * pressure or the brush pressure it gives, in whole percent, with the bounds its neighbours leave it. `set` moves the
 * point to a new value, kept within those bounds.
 */
export type PointEntry = {
  axis: 'pen' | 'brush';
  /** "Pen" or "Brush". */
  label: string;
  value: number;
  min: number;
  max: number;
  set: (value: number) => void;
};

/** What the readout above the graph shows. */
type Readout =
  | { kind: 'none' }
  | { kind: 'pen'; pen: number; brush: number }
  | { kind: 'point'; index: number; pen: number; brush: number };

/** A value in the readout; with `entry`, a tap or Enter on it calls `onEnter` with it. */
function ReadoutValue(props: { text: string; label: string; entry: boolean; onEnter: (anchor: Element) => void }) {
  return (
    <Show when={props.entry} fallback={props.text}>
      <tspan
        class={styles.entry}
        data-entry
        role="button"
        tabindex="0"
        aria-label={`${props.label} ${props.text}`}
        onClick={(event) => props.onEnter(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            props.onEnter(event.currentTarget);
          }
        }}
      >
        {props.text}
      </tspan>
    </Show>
  );
}

/** Where point `index` of `points` may go: between its neighbours, with the output never falling. */
function pointBounds(points: readonly PressurePoint[], index: number) {
  const before = points[index - 1];
  const after = points[index + 1];
  return {
    pen: { min: before ? before.x + pointGap : 0, max: after ? after.x - pointGap : 1 },
    brush: { min: before?.y ?? 0, max: after?.y ?? 1 }
  };
}

function percent(value: number) {
  return Math.round(value * 100);
}

/** Thousandths are finer than a pen can be placed; rounding keeps stored curves short. */
function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

/** The graph's size before it is measured, as in a test environment. */
const fallbackSize = { width: 480, height: 260 };
const unmeasured = { width: null, height: null };
/** Graph units above the plot for the readout's line. */
const readoutRoom = 24;
const bins = 40;
/** Graph units around a point that a press takes it from, about a fingertip on a tablet. */
const hitRadius = 22;
/** Graph units above or below the curve that a press adds a point from. */
const curveReach = 26;
/** Graph units past the plot that an inner point is dragged to be removed. */
const removeDistance = 24;
/** Milliseconds between two presses on a point that remove it. */
const doubleTapMs = 350;
