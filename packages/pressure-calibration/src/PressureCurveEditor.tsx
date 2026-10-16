import {
  maxPressurePoints,
  normalizePressureCurve,
  pointGap,
  pressureMapping,
  type PressureCurve,
  type PressurePoint
} from '@app-game/paint-core/pressureCurve';
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
 * touching the test canvas, shows as a dot running along the curve. The dashed diagonal is the uncalibrated pen.
 * There are no Bézier handles: on a tablet they would double the small targets.
 */
export function PressureCurveEditor(props: {
  curve: PressureCurve;
  /** Raw pressures measured during calibration, for the histogram; none draws no bars. */
  measured?: readonly number[];
  /** Raw pressure of the pen touching the test canvas now; nothing shows without it. */
  marker?: number | undefined;
  /** Receives the changed curve, already normalized. */
  onChange: (curve: PressureCurve) => void;
}) {
  let svg!: SVGSVGElement;
  /** The point being dragged and the pointer dragging it; `removing` while it is off the graph. */
  const [drag, setDrag] = createSignal<{ index: number; pointerId: number; removing: boolean }>();
  /** The point last pressed or focused, whose values the readout shows. */
  const [active, setActive] = createSignal<number>();
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
  const readout = () => {
    const marker = props.marker;
    if (marker !== undefined && drag() === undefined) {
      return `Pen ${percent(marker)}% → brush ${percent(map()(marker))}%`;
    }

    const point = points()[active() ?? -1];
    if (!point) {
      return 'Drag a point; tap the curve to add one';
    }

    return drag()?.removing ? 'Let go to remove the point' : `Pen ${percent(point.x)}% → brush ${percent(point.y)}%`;
  };
  const change = (next: readonly PressurePoint[]) => props.onChange(normalizePressureCurve({ points: next }));
  /** Moves point `index` to raw `to`, kept between its neighbours and with the output never falling. */
  const move = (index: number, to: PressurePoint) => {
    const all = points();
    const before = all[index - 1];
    const after = all[index + 1];
    const next = {
      x: round(Math.max(before ? before.x + pointGap : 0, Math.min(after ? after.x - pointGap : 1, to.x))),
      y: round(Math.max(before?.y ?? 0, Math.min(after?.y ?? 1, to.y)))
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
  /** A pointer's position in graph units and in raw pressure and output. */
  const locate = (event: PointerEvent) => {
    const rect = svg.getBoundingClientRect();
    const scale = width / rect.width;
    const left = (event.clientX - rect.left) * scale;
    const top = (event.clientY - rect.top) * scale;
    return { left, top, raw: { x: (left - margin) / plot, y: (height - margin - top) / span } };
  };

  return (
    <svg
      ref={svg}
      class={styles.chart}
      viewBox={`0 0 ${width} ${height}`}
      role="group"
      aria-label="Pressure curve"
      onPointerDown={(event) => {
        if (drag() || (event.pointerType === 'mouse' && event.button !== 0)) {
          return;
        }

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
        svg.setPointerCapture(event.pointerId);
        setDrag({ index, pointerId: event.pointerId, removing: false });
        setActive(index);
      }}
      onPointerMove={(event) => {
        const current = drag();
        if (current?.pointerId !== event.pointerId) {
          return;
        }

        const { left, top, raw } = locate(event);
        const inner = current.index > 0 && current.index < points().length - 1;
        const removing =
          inner &&
          (left < margin - removeDistance ||
            left > width - margin + removeDistance ||
            top < margin - removeDistance ||
            top > height - margin + removeDistance);
        if (removing !== current.removing) {
          setDrag({ ...current, removing });
        }

        if (!removing) {
          move(current.index, raw);
        }
      }}
      onPointerUp={(event) => {
        const current = drag();
        if (current?.pointerId === event.pointerId) {
          setDrag(undefined);
          if (current.removing) {
            remove(current.index);
          }
        }
      }}
      onPointerCancel={() => setDrag(undefined)}
    >
      <For each={bars()} keyed={false}>
        {(share, index) => (
          <rect
            class={styles.bar}
            x={x(index / bins) + 0.5}
            y={y(share() * 0.9)}
            width={plot / bins - 1}
            height={y(0) - y(share() * 0.9)}
          />
        )}
      </For>
      <path class={styles.frame} d={`M${x(0)},${y(1)}V${y(0)}H${x(1)}`} />
      <path class={styles.identity} d={`M${x(0)},${y(0)}L${x(1)},${y(1)}`} />
      <path class={styles.curve} d={path()} />
      <Show when={props.marker}>
        {(marker) => <circle class={styles.marker} cx={x(marker())} cy={y(map()(marker()))} r={7} />}
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
      <text class={styles.readout} x={x(0) + 6} y={margin - 8}>
        {readout()}
      </text>
      <text class={styles.axis} x={x(1)} y={height - 6} text-anchor="end">
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
      Math.abs(top - y(map()(raw))) > curveReach
    ) {
      return undefined;
    }

    change([...all.slice(0, after), { x: round(raw), y: round(map()(raw)) }, ...all.slice(after)]);
    return after;
  }
}

/** The point within reach of a press at graph position (`left`, `top`), the nearest if several. */
function nearestPoint(points: readonly PressurePoint[], left: number, top: number) {
  let best: { index: number; distance: number } | undefined;
  points.forEach((point, index) => {
    const distance = Math.hypot(x(point.x) - left, y(point.y) - top);
    if (distance <= hitRadius && (!best || distance < best.distance)) {
      best = { index, distance };
    }
  });
  return best?.index;
}

function percent(value: number) {
  return Math.round(value * 100);
}

/** Thousandths are finer than a pen can be placed; rounding keeps stored curves short. */
function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

const width = 480;
const height = 260;
const margin = 28;
const plot = width - 2 * margin;
const span = height - 2 * margin;
const bins = 40;
/** Graph units around a point that a press takes it from, about a fingertip on a tablet. */
const hitRadius = 22;
/** Graph units above or below the curve that a press adds a point from. */
const curveReach = 26;
/** Graph units past the plot that an inner point is dragged to be removed. */
const removeDistance = 24;
/** Milliseconds between two presses on a point that remove it. */
const doubleTapMs = 350;

function x(raw: number) {
  return margin + raw * plot;
}

function y(value: number) {
  return height - margin - value * span;
}
