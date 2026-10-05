import type { Accessor } from 'solid-js';
import { createEffect, createSignal, flush, onCleanup, untrack } from 'solid-js';
import { ItemId } from './Item';
import { AnimationState, calculateTransitionStyles } from './calculateTransitionStyles';
import { measureBlocks, measureInnerBlocks } from './measure';
import { VirtualTree } from './virtual-tree';

/**
 * Renders the input tree and plays a FLIP transition whenever it changes. `tree` is the tree the DOM currently
 * shows; it follows `input` once the previous layout has been measured, and `styles` carries the inverse and
 * play transforms of the blocks that moved while a transition runs.
 *
 * The transition is sequenced outside the reactive graph: each step writes signals, flushes them so the DOM can be
 * measured, and continues either at once or after a timer. A tree that arrives mid-transition replaces the
 * transition from the layout shown at that moment.
 */
export function createAnimations<K, T>(
  input: Accessor<VirtualTree<K, T>>,
  itemElements: Map<ItemId, HTMLElement>,
  options: Accessor<{ transitionDuration: number }>
) {
  const [tree, setTree] = createSignal(untrack(input));
  const [styles, setStyles] = createSignal(new Map<ItemId, AnimationState>());

  function* animate(prev: VirtualTree<K, T>, next: VirtualTree<K, T>) {
    const initRects = measureInnerBlocks(itemElements);

    // F. Before state measurement
    setStyles(new Map());
    yield 0;
    const prevRects = measureBlocks(prev.root.id, itemElements);

    // L. After state measurement
    setTree(next);
    yield 0;
    const nextRects = measureBlocks(next.root.id, itemElements);

    // I. Apply inverse styles
    const { invert, play } = calculateTransitionStyles(prev, next, initRects, prevRects, nextRects);
    setStyles(invert);

    // P. Play animation
    yield 10;
    setStyles(play);

    // Cleanup
    yield options().transitionDuration + 100;
    setStyles(new Map());
  }

  let transition: Generator<number> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  /** Advances the transition; a zero delay continues after the writes reach the DOM, so the next step can measure. */
  function step(current: Generator<number>) {
    while (transition === current) {
      const result = current.next();
      if (result.done) {
        transition = undefined;
        return;
      }

      flush();
      if (result.value > 0) {
        timer = setTimeout(() => step(current), result.value);
        return;
      }
    }
  }

  createEffect(input, (nextTree) => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }

    // Before the root is rendered nothing can be measured, so the tree is shown as it is.
    if (!itemElements.has(nextTree.root.id)) {
      transition = undefined;
      setTree(nextTree);
      return;
    }

    transition = animate(untrack(tree), nextTree);
    // The effect phase cannot flush; the DOM it would measure is committed by the time the microtask runs.
    const current = transition;
    queueMicrotask(() => step(current));
  });

  onCleanup(() => {
    transition = undefined;
    if (timer !== undefined) clearTimeout(timer);
  });

  return { tree, styles };
}
