import { createEffect, createSignal, onCleanup } from 'solid-js';
import createContextProvider from '@utils/createContextProvider';

export type ResizeHandler = (
  size: { width: number; height: number },
  ref: Element
) => void;

type ObservedSize = {
  width: number | undefined;
  height: number | undefined;
};

/**
 * Create resize observer is a helper primitive for binding resize events.
 *
 * @param opts.refs - Either an `Element`, an array of `Element`s, or a signal returning one of these.
 * @param opts.onResize - Function handler to trigger on resize
 * @return A callback that can be used to add refs to observe resizing
 *
 */
export function createResizeObserver<T extends Element>(props: {
  onResize: ResizeHandler;
  refs?: T | T[] | (() => T | T[]);
}): (arg: T) => void {
  const [otherRefs, setOtherRefs] = createSignal<T[]>([]);

  const refCallback = (e: T) => setOtherRefs((l: T[]) => l.concat(e));

  const previousMap = new Map<Element, ObservedSize>();

  const resizeObserver = new ResizeObserver((entries) => {
    if (!Array.isArray(entries)) {
      return;
    }
    for (const entry of entries) {
      const newWidth = entry.contentRect.width;
      const newHeight = entry.contentRect.height;
      const previous = previousMap.get(entry.target);

      if (
        !previous ||
        previous.width !== newWidth ||
        previous.height !== newHeight
      ) {
        const newSize = { width: newWidth, height: newHeight };
        props.onResize(newSize, entry.target);
        previousMap.set(entry.target, { width: newWidth, height: newHeight });
      }
    }
  });

  createEffect((oldRefs?: T[]) => {
    let refs: T[] = [];
    if (props.refs) {
      const optsRefs =
        typeof props.refs === 'function' ? props.refs() : props.refs;
      if (Array.isArray(optsRefs)) refs = refs.concat(optsRefs);
      else refs.push(optsRefs);
    }
    refs = refs.concat(otherRefs());
    oldRefs = oldRefs || [];
    oldRefs.forEach((oldRef) => {
      if (!(oldRef in refs)) {
        resizeObserver.unobserve(oldRef);
        previousMap.delete(oldRef);
      }
    });
    refs.forEach((ref) => {
      if (!(ref in oldRefs!)) {
        resizeObserver.observe(ref);
      }
    });
    return refs;
  });

  onCleanup(() => resizeObserver.disconnect());

  return refCallback;
}

export const [ResizeObserverProvider, useResizeObserverContext] =
  createContextProvider(createResizeObserver);
