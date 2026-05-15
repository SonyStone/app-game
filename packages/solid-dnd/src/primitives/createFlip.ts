import { access, type MaybeAccessor } from '@solid-primitives/utils';
import { batch, createSignal } from 'solid-js';
import { type Rect } from '../core/rect';
import {
  buildFlipAnimateEntries,
  type FlipAnimationBatch,
  LayoutContainerElement,
  runLayoutTransitionAnimations,
  runStandardFlipAnimations
} from './createFlipAnimations';
import { createFlipAnimationSchedule } from './createFlipAnimationSchedule';
import { createFlipSnapshot, type FlipDeltasResult, type SimpleRect } from './createFlipSnapshot';
import { type FlipDelta } from './flipUtils';

export type FlipOptions = Parameters<typeof createFlip>[0];
export type Flip = ReturnType<typeof createFlip>;

/**
 * Describes a single element's FLIP animation for debug/visualization.
 */
export type FlipAnimateEntry<K> = {
  /** The item key. */
  key: K;
  /** Center position before the DOM change (viewport coords). */
  from: { x: number; y: number };
  /** Center position after the DOM change (viewport coords). */
  to: { x: number; y: number };
  /** The inverse delta applied at animation start. */
  delta: FlipDelta;
};

type FlipPlaybackContext<K> = Readonly<{
  duration: number;
  easing: string;
  first: Map<K, Rect>;
  firstContainerRect: SimpleRect | null;
  last: Map<K, Rect>;
  deltas: Map<K, FlipDelta>;
}>;

type FlipElement = Pick<HTMLElement, 'animate' | 'style' | 'getBoundingClientRect' | 'isConnected'>;
type FlipElementSource<K> =
  | {
      /**
       * Map of item keys → DOM elements. Mutated externally as items mount/unmount.
       * Supported for convenience when you already maintain a single keyed map.
       */
      elements: ReadonlyMap<K, FlipElement>;
      keys?: never;
      getElement?: never;
    }
  | {
      /** Ordered keys to measure and animate. Preferred when element lookup is separate from storage. */
      keys: MaybeAccessor<ReadonlyArray<K>>;
      /** Resolve the current DOM element for a given key. */
      getElement: (key: K) => FlipElement | undefined;
      elements?: never;
    };

/**
 * A primitive that animates layout transitions using the FLIP technique.
 *
 * ## How it works
 *
 * 1. **First** — Call `captureFirst()` before the DOM change to snapshot positions.
 * 2. *Make your DOM change* (e.g., reorder items via a SolidJS signal).
 * 3. **Last + Invert + Play** — Call `playFromFirst()` after the DOM change.
 *    It captures new positions, computes inverse transforms, and animates
 *    each element from its old position to its new position.
 *
 * Uses the Web Animations API for clean cancellation and no CSS side effects.
 *
 * ## Element lifecycle
 *
 * - **Moved elements**: animated from old position to new position.
 * - **New elements** (not in "First" snapshot): just appear, no animation.
 * - **Removed elements** (not in "Last" snapshot): already gone, no animation.
 * - **Stationary elements**: skipped (no unnecessary animations).
 *
 * @example
 * ```tsx
 * const itemRefs = new Map<string, HTMLElement>();
 * const flip = createFlip({
 *   keys: () => items().map((item) => item.id),
 *   getElement: (key) => itemRefs.get(key),
 *   duration: 250,
 * });
 *
 * function reorder(newItems: Item[]) {
 *   flip.captureFirst();
 *   setItems(newItems); // SolidJS updates DOM synchronously
 *   flip.playFromFirst();
 * }
 * ```
 *
 * If you already maintain a single `Map<K, HTMLElement>`, the `elements` form
 * remains supported.
 */
export function createFlip<K>(
  options: {
    /**
     * Duration of the FLIP animation in milliseconds.
     * Read each time `playFromFirst` is called, so it can be dynamic.
     * @default 200
     */
    duration?: MaybeAccessor<number>;
    /**
     * CSS easing string for the animation.
     * Read each time `playFromFirst` is called, so it can be dynamic.
     * @default 'linear'
     */
    easing?: MaybeAccessor<string>;
    /**
     * Called when a FLIP animation cycle starts. Receives an array of entries
     * describing each element's motion. Useful for debug visualization.
     */
    onAnimate?: (entries: ReadonlyArray<FlipAnimateEntry<K>>) => void;
  } & FlipElementSource<K>
) {
  const [isAnimating, setIsAnimating] = createSignal(false);
  const snapshot = createFlipSnapshot<K>();
  const animationSchedule = createFlipAnimationSchedule<K>();

  let activeAnimations: Animation[] = [];
  // Per-call duration override set by animate(), consumed by playFromFirst().
  let animateDurationOverride: number | undefined;
  // Per-call container for layout transition mode (absolute positioning).
  let layoutContainer: LayoutContainerElement | null = null;
  // Cleanup function to restore inline styles after layout transition.
  let pendingCleanup: (() => void) | null = null;

  function resolveElements(): ReadonlyMap<K, FlipElement> {
    if ('elements' in options && options.elements) {
      return options.elements;
    }

    const elements = new Map<K, FlipElement>();
    for (const key of access(options.keys)) {
      const element = options.getElement(key);
      if (element) {
        elements.set(key, element);
      }
    }
    return elements;
  }

  // First: capture current positions
  function captureFirst(): void {
    snapshot.captureFirst(resolveElements(), layoutContainer);
  }

  // Last + Invert + Play
  function playFromFirst(): void {
    const playback = collectPlaybackContext();
    if (!playback) {
      return;
    }

    if (options.onAnimate) {
      options.onAnimate(buildFlipAnimateEntries(playback.deltas, playback.last));
    }

    const elements = resolveElements();

    const animationBatch =
      layoutContainer && playback.firstContainerRect
        ? runLayoutTransitionAnimations({
            duration: playback.duration,
            easing: playback.easing,
            deltas: playback.deltas,
            elements,
            first: playback.first,
            firstContainerRect: playback.firstContainerRect,
            last: playback.last,
            layoutContainer
          })
        : runStandardFlipAnimations({
            deltas: playback.deltas,
            duration: playback.duration,
            easing: playback.easing,
            elements
          });

    playAnimationBatch(animationBatch);
  }

  function collectPlaybackContext(): FlipPlaybackContext<K> | null {
    if (!snapshot.hasFirst()) {
      return null;
    }

    cancelActive();
    snapshot.captureLast(resolveElements());

    const result: FlipDeltasResult<K> | null = snapshot.computeDeltas();
    if (!result) {
      return null;
    }

    if (result.deltas.size === 0 && !layoutContainer) {
      animationSchedule.clearTargets();
      return null;
    }

    return {
      duration: animationSchedule.effectiveDuration(
        result.last,
        animateDurationOverride ?? access(options.duration) ?? 200
      ),
      easing: access(options.easing) ?? 'linear',
      first: result.first,
      firstContainerRect: result.containerRect,
      last: result.last,
      deltas: result.deltas
    };
  }

  function playAnimationBatch(batch: FlipAnimationBatch): void {
    pendingCleanup = batch.cleanup ?? null;

    if (batch.animations.length === 0) {
      runPendingCleanup();
      setIsAnimating(false);
      return;
    }

    setIsAnimating(true);
    activeAnimations = batch.animations;

    const currentBatch = batch.animations;
    Promise.all(batch.animations.map((animation) => animation.finished))
      .then(() => {
        if (activeAnimations === currentBatch) {
          finishActiveBatch();
        }
      })
      .catch(() => {
        // Animation was cancelled — cleanup handled by cancelActive
      });
  }

  function finishActiveBatch(): void {
    activeAnimations = [];
    runPendingCleanup();
    setIsAnimating(false);
  }

  function runPendingCleanup(): void {
    if (!pendingCleanup) {
      return;
    }

    pendingCleanup();
    pendingCleanup = null;
  }

  // Cancel running animations and restore any layout-transition styles
  function cancelActive(): void {
    for (const anim of activeAnimations) {
      anim.cancel();
    }
    activeAnimations = [];
    runPendingCleanup();
    if (isAnimating()) {
      setIsAnimating(false);
    }
  }

  return {
    /**
     * Capture the current position of all elements ("First" snapshot).
     * Call this **before** the DOM change (e.g., before reordering items).
     */
    captureFirst,
    /**
     * Capture new positions ("Last"), compute inverse transforms ("Invert"),
     * and play the animation ("Play").
     *
     * Call this **after** the DOM has been updated. In SolidJS, signal writes
     * cause synchronous DOM updates, so you can call this immediately after
     * `setItems(newOrder)`.
     *
     * If `captureFirst` was not called beforehand, this is a no-op.
     */
    playFromFirst,
    /**
     * Convenience wrapper: captures first, runs `fn` (which should mutate the DOM),
     * then plays the animation.
     *
     * Equivalent to:
     * ```ts
     * flip.captureFirst();
     * fn();
     * flip.playFromFirst();
     * ```
     *
     * Accepts an optional per-call duration override.
     */
    animate(fn: () => void, overrides?: { duration?: number; container?: LayoutContainerElement }): void {
      // animate() is a discrete operation (e.g., on dragEnd).
      // Reset animation tracking so playFromFirst() uses full duration.
      animationSchedule.reset();
      animateDurationOverride = overrides?.duration;
      layoutContainer = overrides?.container ?? null;
      captureFirst();
      batch(() => fn());
      playFromFirst();
      animateDurationOverride = undefined;
      layoutContainer = null;
    },
    /**
     * Whether a FLIP animation is currently in progress.
     * Useful for disabling pointer events or other interactions during animation.
     */
    isAnimating
  };
}
