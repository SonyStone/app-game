import { pointerdrag } from '../events/pointer';

declare module '@solidjs/web' {
  namespace JSX {
    interface Directives {
      onDrag: (event: PointerEvent) => void;
    }
  }
}

/** Binds pointer-drag events and returns a disposer for the subscription. */
export function onDrag(element: Element, accessor: () => (event: PointerEvent) => void): () => void {
  const setDrag = accessor();
  const subscription = pointerdrag(element).subscribe(setDrag);
  return () => subscription.unsubscribe();
}
