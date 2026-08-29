import { animationFrameScheduler, fromEvent, merge, switchMapTo, takeUntil, timer } from 'rxjs';

declare module '@solidjs/web' {
  namespace JSX {
    interface Directives {
      onHold: (event: number) => void;
    }
  }
}

/** Binds repeated hold events and returns a disposer for the subscription. */
export function onHold(element: HTMLElement, accessor: () => (event: number) => void): () => void {
  const setDrag = accessor();

  const start$ = fromEvent(element, 'pointerdown');
  const end$ = merge(fromEvent(element, 'pointerup'), fromEvent(element, 'pointerleave'));

  const frameByFrame = start$.pipe(switchMapTo(timer(250, 50, animationFrameScheduler).pipe(takeUntil(end$))));

  const subscription = frameByFrame.subscribe((event) => setDrag(event));
  return () => subscription.unsubscribe();
}
