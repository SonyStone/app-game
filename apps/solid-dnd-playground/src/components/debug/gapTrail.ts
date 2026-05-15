import { access, findGapElement, MaybeAccessor, type GapKey } from 'solid-dnd';
import { createEffect, createSignal, on, onCleanup } from 'solid-js';

// ============================================================================
// MARK: Types
// ============================================================================

export type Point = { x: number; y: number };

export type CycleMarker = {
  /** Cycle number (1-based). */
  number: number;
  /** Position of gap center when this FLIP cycle fired. */
  position: Point;
};

// ============================================================================
// MARK: Helpers
// ============================================================================

export function getCenter(el: HTMLElement): Point {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export function pointsToSvg(pts: Point[]): string {
  return pts.map((p) => `${p.x},${p.y}`).join(' ');
}

export function roundPt(p: Point): { x: number; y: number } {
  return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
}

// ============================================================================
// MARK: useGapTrail
// ============================================================================

/**
 * RAF-based gap element position sampling across an entire drag session.
 *
 * Starts sampling when `isDragging` becomes true, stops when it becomes false.
 * Returns a reactive signal of the sampled trail points and cycle markers.
 */
export function useGapTrail(opts: {
  getElement: (key: string | GapKey) => HTMLElement | undefined;
  isDragging: MaybeAccessor<boolean>;
  enabled: MaybeAccessor<boolean>;
}) {
  const [gapTrail, setGapTrail] = createSignal<Point[]>([]);
  const [cycleMarkers, setCycleMarkers] = createSignal<CycleMarker[]>([]);
  let cycleCounter = 0;

  let gapRafId: number | null = null;
  let gapSampling = false;

  function startGapSampling() {
    if (gapSampling) return;
    gapSampling = true;

    function sample() {
      if (!gapSampling) return;

      const gapEl = findGapElement(opts.getElement);
      if (gapEl) {
        const center = getCenter(gapEl);
        setGapTrail((prev) => {
          const last = prev[prev.length - 1];
          if (last && Math.abs(last.x - center.x) < 0.5 && Math.abs(last.y - center.y) < 0.5) {
            return prev;
          }
          return [...prev, center];
        });
      }

      gapRafId = requestAnimationFrame(sample);
    }

    gapRafId = requestAnimationFrame(sample);
  }

  function stopGapSampling() {
    gapSampling = false;
    if (gapRafId !== null) {
      cancelAnimationFrame(gapRafId);
      gapRafId = null;
    }
  }

  createEffect(
    on(
      () => access(opts.isDragging),
      (dragging) => {
        if (!access(opts.enabled)) return;

        if (dragging) {
          setGapTrail([]);
          setCycleMarkers([]);
          cycleCounter = 0;
          startGapSampling();
        } else {
          const gapEl = findGapElement(opts.getElement);
          if (gapEl) {
            const center = getCenter(gapEl);
            setGapTrail((prev) => [...prev, center]);
          }
          stopGapSampling();
        }
      }
    )
  );

  onCleanup(() => stopGapSampling());

  /** Add a cycle marker at the current gap position. Returns the cycle number. */
  function addCycleMarker(): number {
    cycleCounter++;
    const current = cycleCounter;
    const gapEl = findGapElement(opts.getElement);
    if (gapEl) {
      const center = getCenter(gapEl);
      setCycleMarkers((prev) => [...prev, { number: current, position: center }]);
    }
    return current;
  }

  return { gapTrail, cycleMarkers, addCycleMarker };
}
