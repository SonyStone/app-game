import { wrapSignal } from '@utils/wrap-signal';
import {
  delay,
  distinctUntilChanged,
  filter,
  fromEvent,
  map,
  mapTo,
  merge,
  mergeMap,
  Observable,
  of,
  switchMapTo,
  takeUntil,
  tap
} from 'rxjs';
import { createSignal } from 'solid-js';

export function createFileDrop() {
  const [element, setElement] = createSignal<HTMLElement | undefined>(undefined);

  const over = wrapSignal(
    element,
    (element) => {
      const dragover$ = fromEvent<DragEvent>(element, 'dragover');
      const dragleave$ = fromEvent<DragEvent>(element, 'dragleave').pipe(
        mergeMap((event) => of(event).pipe(delay(300), takeUntil(dragover$)))
      );
      const drop$ = fromEvent<DragEvent>(element, 'drop');

      const over$: Observable<boolean> = merge(
        dragover$.pipe(mapTo(true)),
        merge(dragleave$, drop$).pipe(mapTo(false))
      ).pipe(distinctUntilChanged());

      return over$;
    },
    false
  );

  const files = wrapSignal(
    element,
    (element) => {
      const dragover$ = fromEvent<DragEvent>(element, 'dragover');
      const drop$ = fromEvent<DragEvent>(element, 'drop');

      const dragAndDrop$: Observable<DragEvent> = dragover$.pipe(
        tap((evt: DragEvent) => {
          evt.preventDefault();
          evt.stopPropagation();
        }),
        switchMapTo(drop$),
        tap((evt: DragEvent) => {
          evt.preventDefault();
          evt.stopPropagation();
        })
      );

      return dragAndDrop$.pipe(
        map((drop) => [...drop?.dataTransfer?.files!]),
        filter((files) => !!files)
      );
    },
    []
  );

  return { setElement, over, files } as const;
}
