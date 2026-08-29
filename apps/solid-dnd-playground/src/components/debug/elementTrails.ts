import { access, GapKey, type FlipAnimateEntry, type MaybeAccessor } from 'solid-dnd';
import { createEffect, createSignal, onCleanup, untrack } from 'solid-js';
import { getCenter, type Point } from './gapTrail';

// ============================================================================
// MARK: Types
// ============================================================================

export type ElementTrail = {
  key: string | GapKey;
  from: Point;
  to: Point;
  /** Sampled positions via RAF during the FLIP animation. */
  trail: Point[];
  color: string;
};

export type CycleTrails = {
  /** Which FLIP cycle these trails belong to (1-based). */
  cycle: number;
  trails: ElementTrail[];
};

// ============================================================================
// MARK: Constants
// ============================================================================

export const TRAIL_COLORS = [
  '#f87171', // red-400
  '#fb923c', // orange-400
  '#facc15', // yellow-400
  '#4ade80', // green-400
  '#22d3ee', // cyan-400
  '#60a5fa', // blue-400
  '#a78bfa', // violet-400
  '#f472b6', // pink-400
  '#34d399', // emerald-400
  '#fbbf24' // amber-400
];

// ============================================================================
// MARK: useElementTrails
// ============================================================================

/**
 * Tracks per-element FLIP animation trails across all FLIP cycles in a drag session.
 *
 * Each time `entries` updates (a new FLIP cycle fires), this starts a RAF loop
 * that samples each animated element's center position until `isAnimating` is false.
 */
export function useElementTrails(opts: {
  entries: MaybeAccessor<FlipAnimateEntry<string | GapKey>[]>;
  getElement: (key: string | GapKey) => HTMLElement | undefined;
  isAnimating: MaybeAccessor<boolean>;
  enabled: MaybeAccessor<boolean>;
  /** Called to get the current cycle number. */
  addCycleMarker: () => number;
}) {
  const [allCycleTrails, setAllCycleTrails] = createSignal<CycleTrails[]>([]);
  let elemRafId: number | null = null;
  let elemRunning = false;

  createEffect(
    () => [access(opts.entries), access(opts.enabled)] as const,
    ([entries, enabled]) => {
      stopSampling();
      if (!enabled || entries.length === 0) return;

      const currentCycle = untrack(opts.addCycleMarker);

      // Build per-element trails for this cycle
      const newTrails: ElementTrail[] = entries.map((e, i) => ({
        key: e.key,
        from: { ...e.from },
        to: { ...e.to },
        trail: [],
        color: TRAIL_COLORS[i % TRAIL_COLORS.length]
      }));

      setAllCycleTrails((prev) => [...prev, { cycle: currentCycle, trails: newTrails }]);

      // Start RAF sampling for element positions during this FLIP animation
      elemRunning = true;

      function sampleElements() {
        if (!elemRunning) return;

        setAllCycleTrails((prev) => {
          const last = prev[prev.length - 1];
          if (!last || last.cycle !== currentCycle) return prev;

          const updatedTrails = last.trails.map((t) => {
            const el = untrack(() => opts.getElement(t.key));
            if (!el?.isConnected) return t;
            const center = getCenter(el);
            const lastPt = t.trail[t.trail.length - 1];
            if (lastPt && Math.abs(lastPt.x - center.x) < 0.5 && Math.abs(lastPt.y - center.y) < 0.5) return t;
            return { ...t, trail: [...t.trail, center] };
          });
          return [...prev.slice(0, -1), { ...last, trails: updatedTrails }];
        });

        if (untrack(() => access(opts.isAnimating))) {
          elemRafId = requestAnimationFrame(sampleElements);
        } else {
          // Final sample
          setAllCycleTrails((prev) => {
            const last = prev[prev.length - 1];
            if (!last || last.cycle !== currentCycle) return prev;
            const updatedTrails = last.trails.map((t) => {
              const el = untrack(() => opts.getElement(t.key));
              if (!el?.isConnected) return t;
              const center = getCenter(el);
              return { ...t, trail: [...t.trail, center] };
            });
            return [...prev.slice(0, -1), { ...last, trails: updatedTrails }];
          });
          elemRunning = false;
        }
      }

      elemRafId = requestAnimationFrame(sampleElements);
    },
    { defer: true }
  );

  onCleanup(stopSampling);

  function stopSampling(): void {
    elemRunning = false;
    if (elemRafId !== null) {
      cancelAnimationFrame(elemRafId);
      elemRafId = null;
    }
  }

  /** Clear all accumulated trails (call on drag session start). */
  function clear() {
    setAllCycleTrails([]);
  }

  return { allCycleTrails, clear };
}
