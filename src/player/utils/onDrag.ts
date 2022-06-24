import { createSubscription } from '@utils/create-subscription';

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
  createSubscription(pointerdrag(element).subscribe(setDrag));
}
