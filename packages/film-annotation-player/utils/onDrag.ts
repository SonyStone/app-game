import { createSubscription } from '@utils/createSubscription';

import { pointerdrag } from '../events/pointer';

declare module '@solidjs/web' {
  namespace JSX {
    interface Directives {
      onDrag: (event: PointerEvent) => void;
    }
  }
}

export function onDrag(element: Element, accessor: () => (event: PointerEvent) => void) {
  const setDrag = accessor();
  createSubscription(pointerdrag(element).subscribe(setDrag));
}
