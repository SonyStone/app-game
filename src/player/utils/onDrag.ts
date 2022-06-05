import { onCleanup } from 'solid-js';

import { pointerdrag } from '../events/pointer';

declare module 'solid-js' {
  namespace JSX {
    interface Directives {
      onDrag: (event: PointerEvent) => void;
    }
  }
}

export function onDrag(
  element: HTMLElement,
  accessor: () => (event: PointerEvent) => void
) {
  const setDrag = accessor();
  const subscription = pointerdrag(element).subscribe((event) =>
    setDrag(event)
  );
  onCleanup(() => subscription.unsubscribe());
}
