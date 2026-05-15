import { isGapKey, type FlipAnimateEntry, type GapKey } from 'solid-dnd';
import { createEffect, createSignal, For, on, Show, type JSX } from 'solid-js';
import {
  pointsToSvg,
  roundPt,
  useElementTrails,
  useGapTrail,
  type CycleTrails,
  type ElementTrail,
  type Point
} from './debug';

export type FlipDebugOverlayProps = Parameters<typeof FlipDebugOverlay>[0];

/**
 * Full-screen SVG overlay that visualizes the gap element's trajectory
 * across an entire drag session, plus per-element FLIP animation trails
 * accumulated across all FLIP cycles.
 *
 * **Gap trail** (primary — cyan):
 * - Thick polyline tracking the gap from drag start → drop/cancel
 * - Green **START** marker and red **END** marker
 * - Numbered yellow cycle markers where each FLIP cycle fired
 *
 * **Element trails** (secondary — all cycles accumulated):
 * - Thin colored polylines for each animated element, per cycle
 * - Dashed line showing expected straight path
 *
 * **Copy Debug** button serializes all trajectory data as JSON for pasting.
 */
export function FlipDebugOverlay(props: {
  /** Animation entries from `createFlip`'s `onAnimate` callback. */
  entries: ReadonlyArray<FlipAnimateEntry<string | GapKey>>;
  /** Resolve a live element for a given key — used to sample positions via RAF. */
  getElement: (key: string | GapKey) => HTMLElement | undefined;
  /** Whether a FLIP animation is currently running. */
  isAnimating: boolean;
  /** Whether to show the overlay. */
  enabled: boolean;
  /** Whether a drag session is active (start → drop/cancel). */
  isDragging: boolean;
  /** Optional extra context to include in Copy Debug output (e.g. drag state). */
  debugContext?: Record<string, unknown> | undefined;
}): JSX.Element {
  // ── Extracted hooks ─────────────────────────────────────────────────────
  const { gapTrail, cycleMarkers, addCycleMarker } = useGapTrail({
    getElement: props.getElement,
    isDragging: () => props.isDragging,
    enabled: () => props.enabled
  });

  const { allCycleTrails, clear: clearTrails } = useElementTrails({
    entries: () => [...props.entries],
    getElement: props.getElement,
    isAnimating: () => props.isAnimating,
    enabled: () => props.enabled,
    addCycleMarker
  });

  // Clear element trails on new drag session
  createEffect(
    on(
      () => props.isDragging,
      (dragging) => {
        if (dragging && props.enabled) {
          clearTrails();
        }
      }
    )
  );

  // ── Copy feedback (with proper cleanup) ─────────────────────────────────
  const [copied, setCopied] = createSignal(false);
  let copyTimeoutId: ReturnType<typeof setTimeout> | null = null;

  /** Compact coordinate: [x, y] */
  const pt = (p: { x: number; y: number }): [number, number] => {
    const r = roundPt(p);
    return [r.x, r.y];
  };

  function copyDebugData() {
    const ctx = props.debugContext;
    const data = {
      ...(ctx ? { ctx } : {}),
      gap: gapTrail().map(pt),
      markers: cycleMarkers().map((m) => [m.number, ...pt(m.position)]),
      cycles: allCycleTrails().map((ct) => ({
        c: ct.cycle,
        el: ct.trails.map((t) => ({
          k: t.key,
          f: pt(t.from),
          t: pt(t.to),
          n: t.trail.length,
          ...(t.trail.length > 2 ? { path: t.trail.map(pt) } : {})
        }))
      }))
    };

    const text = JSON.stringify(data);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      if (copyTimeoutId !== null) clearTimeout(copyTimeoutId);
      copyTimeoutId = setTimeout(() => {
        setCopied(false);
        copyTimeoutId = null;
      }, 2000);
    });
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const hasData = () => gapTrail().length > 0 || allCycleTrails().length > 0;

  return (
    <Show when={props.enabled && hasData()}>
      <OverlaySvg
        gapTrail={gapTrail()}
        cycleMarkers={cycleMarkers()}
        allCycleTrails={allCycleTrails()}
        isDragging={props.isDragging}
      />

      {/* ── Copy button (outside SVG so it's clickable) ─────────────── */}
      <button
        onClick={copyDebugData}
        class={`fixed top-2 right-2 z-10000 flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-xs transition-colors ${
          copied()
            ? 'border-green-500/50 bg-green-950/90 text-green-300'
            : 'border-neutral-600 bg-neutral-900/90 text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100'
        }`}
      >
        <span>{copied() ? '✓' : '📋'}</span>
        <span>{copied() ? 'Copied!' : 'Copy Debug'}</span>
      </button>
    </Show>
  );
}

// ============================================================================
// MARK: OverlaySvg
// ============================================================================

function OverlaySvg(props: {
  gapTrail: Point[];
  cycleMarkers: { number: number; position: Point }[];
  allCycleTrails: CycleTrails[];
  isDragging: boolean;
}): JSX.Element {
  return (
    <svg class="pointer-events-none fixed inset-0 z-[9999]" style={{ width: '100vw', height: '100vh' }}>
      {/* ── Per-element FLIP trails (all cycles, secondary) ─────── */}
      <For each={props.allCycleTrails}>
        {(ct) => <For each={ct.trails}>{(t) => <ElementTrailPath trail={t} showLabel={ct.cycle === 1} />}</For>}
      </For>

      {/* ── Gap trail (primary — cyan) ──────────────────────────── */}
      <GapTrailPath gapTrail={props.gapTrail} isDragging={props.isDragging} />

      {/* FLIP cycle markers */}
      <For each={props.cycleMarkers}>
        {(marker) => (
          <>
            <circle
              cx={marker.position.x}
              cy={marker.position.y}
              r="10"
              fill="none"
              stroke="#facc15"
              stroke-width="2"
            />
            <text
              x={marker.position.x}
              y={marker.position.y + 4}
              fill="#facc15"
              font-size="9"
              font-weight="bold"
              font-family="monospace"
              text-anchor="middle"
            >
              {marker.number}
            </text>
          </>
        )}
      </For>

      {/* ── Legend ───────────────────────────────────────────────── */}
      <OverlayLegend />
    </svg>
  );
}

// ============================================================================
// MARK: ElementTrailPath
// ============================================================================

function ElementTrailPath(props: { trail: ElementTrail; showLabel: boolean }): JSX.Element {
  return (
    <>
      {/* Actual trajectory */}
      <Show when={props.trail.trail.length >= 2}>
        <polyline
          points={pointsToSvg(props.trail.trail)}
          fill="none"
          stroke={props.trail.color}
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          opacity="0.4"
        />
      </Show>

      {/* Start/end dots */}
      <circle cx={props.trail.from.x} cy={props.trail.from.y} r="2.5" fill={props.trail.color} opacity="0.4" />
      <circle cx={props.trail.to.x} cy={props.trail.to.y} r="2.5" fill={props.trail.color} opacity="0.4" />

      {/* Label (only on first cycle to avoid clutter) */}
      <Show when={props.showLabel}>
        <text
          x={props.trail.from.x + 6}
          y={props.trail.from.y - 6}
          fill={props.trail.color}
          font-size="8"
          font-family="monospace"
          opacity="0.5"
        >
          {isGapKey(props.trail.key) ? 'GAP' : props.trail.key}
        </text>
      </Show>
    </>
  );
}

// ============================================================================
// MARK: GapTrailPath
// ============================================================================

function GapTrailPath(props: { gapTrail: Point[]; isDragging: boolean }): JSX.Element {
  return (
    <>
      <Show when={props.gapTrail.length >= 2}>
        <polyline
          points={pointsToSvg(props.gapTrail)}
          fill="none"
          stroke="#22d3ee"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
          opacity="0.9"
        />
      </Show>

      {/* Gap trail sample dots */}
      <For each={props.gapTrail}>
        {(p, i) => (
          <circle
            cx={p.x}
            cy={p.y}
            r="2"
            fill={
              i() === 0 ? '#4ade80' : i() === props.gapTrail.length - 1 && !props.isDragging ? '#f87171' : '#22d3ee'
            }
            opacity="0.7"
          />
        )}
      </For>

      {/* Start marker */}
      <Show when={props.gapTrail.length > 0}>
        {(() => {
          const start = props.gapTrail[0];
          return (
            <>
              <circle cx={start.x} cy={start.y} r="6" fill="#4ade80" stroke="#000" stroke-width="0.5" />
              <text
                x={start.x + 10}
                y={start.y + 3}
                fill="#4ade80"
                font-size="10"
                font-weight="bold"
                font-family="monospace"
              >
                START
              </text>
            </>
          );
        })()}
      </Show>

      {/* End marker (only shown after drag ends) */}
      <Show when={!props.isDragging && props.gapTrail.length > 1}>
        {(() => {
          const end = props.gapTrail[props.gapTrail.length - 1];
          return (
            <>
              <circle cx={end.x} cy={end.y} r="6" fill="#f87171" stroke="#000" stroke-width="0.5" />
              <text
                x={end.x + 10}
                y={end.y + 3}
                fill="#f87171"
                font-size="10"
                font-weight="bold"
                font-family="monospace"
              >
                END
              </text>
            </>
          );
        })()}
      </Show>
    </>
  );
}

// ============================================================================
// MARK: OverlayLegend
// ============================================================================

function OverlayLegend(): JSX.Element {
  return (
    <g transform="translate(10, 20)">
      <line x1="-6" y1="0" x2="12" y2="0" stroke="#22d3ee" stroke-width="3" opacity="0.9" />
      <text x="18" y="3" fill="#22d3ee" font-size="9" font-family="monospace" opacity="0.9">
        gap trail
      </text>

      <circle cx="3" cy="14" r="4" fill="#4ade80" />
      <text x="18" y="17" fill="#4ade80" font-size="9" font-family="monospace" opacity="0.8">
        drag start
      </text>

      <circle cx="3" cy="28" r="4" fill="#f87171" />
      <text x="18" y="31" fill="#f87171" font-size="9" font-family="monospace" opacity="0.8">
        drop / cancel
      </text>

      <circle cx="3" cy="42" r="8" fill="none" stroke="#facc15" stroke-width="1.5" />
      <text x="18" y="45" fill="#facc15" font-size="9" font-family="monospace" opacity="0.8">
        FLIP cycle
      </text>

      <line x1="-6" y1="56" x2="12" y2="56" stroke="#60a5fa" stroke-width="1.5" opacity="0.4" />
      <text x="18" y="59" fill="#888" font-size="9" font-family="monospace" opacity="0.6">
        element trails
      </text>
    </g>
  );
}
