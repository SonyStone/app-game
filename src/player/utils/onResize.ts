import { createResizeObserver, ResizeHandler } from './resizeObserver';

declare module 'solid-js' {
  namespace JSX {
    interface Directives {
      onResize: ResizeHandler;
    }
  }
}

export function onResize(element: HTMLElement, accessor: () => ResizeHandler) {
  const refCallback = createResizeObserver({
    onResize: accessor(),
  });

  refCallback(element);
}
