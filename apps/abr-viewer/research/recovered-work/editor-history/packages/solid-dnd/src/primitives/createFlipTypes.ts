import { MaybeAccessor } from '@solid-primitives/utils';
import { type Rect } from 'src/core/rect';
import { type FlipDelta } from './flipUtils';

export type CreateFlipOptions<K> = Readonly<{
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
   * Map of item keys → DOM elements. Mutated externally as items mount/unmount.
   * The flip primitive reads from this map when measuring positions.
   */
  elements: Map<K, HTMLElement>;
  /**
   * Called when a FLIP animation cycle starts. Receives an array of entries
   * describing each element's motion. Useful for debug visualization.
   */
  onAnimate?: (entries: ReadonlyArray<FlipAnimateEntry<K>>) => void;
}>;

export type FlipOptions<K = unknown> = CreateFlipOptions<K>;

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

export type SimpleRect = Readonly<{ x: number; y: number; width: number; height: number }>;

export type FlipDeltasResult<K> = Readonly<{
  first: Map<K, Rect>;
  last: Map<K, Rect>;
  deltas: Map<K, FlipDelta>;
  containerRect: SimpleRect | null;
}>;

export type FlipPlaybackContext<K> = Readonly<{
  duration: number;
  easing: string;
  first: Map<K, Rect>;
  firstContainerRect: SimpleRect | null;
  last: Map<K, Rect>;
  deltas: Map<K, FlipDelta>;
}>;

export type FlipAnimationBatch = Readonly<{
  animations: Animation[];
  cleanup?: () => void;
}>;
