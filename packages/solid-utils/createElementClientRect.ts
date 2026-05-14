import { Accessor, createEffect, createSignal, onCleanup } from 'solid-js';

/**
 * Creates a reactive signal that tracks an element's bounding client rectangle.
 * Updates automatically when the element resizes or the window scrolls/resizes.
 *
 * @param element - Accessor returning the element to track
 * @returns Accessor for the current DOMRect, or null if element doesn't exist
 *
 * @example
 * ```tsx
 * const [ref, setRef] = createSignal<HTMLDivElement>();
 * const rect = createElementClientRect(ref);
 *
 * createEffect(() => {
 *   const r = rect();
 *   if (r) {
 *     console.log('Position:', r.left, r.top);
 *     console.log('Size:', r.width, r.height);
 *   }
 * });
 * ```
 */
export function createElementClientRect<T extends Element>(element: Accessor<T | undefined>): Accessor<DOMRect | null> {
  const [rect, setRect] = createSignal<DOMRect | null>(null);

  createEffect(() => {
    const el = element();
    if (!el) {
      setRect(null);
      return;
    }

    // Initial measurement
    const updateRect = () => {
      setRect(el.getBoundingClientRect());
    };

    updateRect();

    // Update on resize
    const resizeObserver = new ResizeObserver(updateRect);
    resizeObserver.observe(el);

    // Update on scroll (viewport position changes)
    const handleScroll = () => {
      console.log('scroll/resize detected, updating rect');
      updateRect();
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });

    onCleanup(() => {
      resizeObserver.disconnect();
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    });
  });

  return rect;
}
