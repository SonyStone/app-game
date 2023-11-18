import {
  exhaustMap,
  first,
  fromEvent,
  merge,
  Observable,
  startWith,
  takeUntil,
  tap,
} from 'rxjs';

export function pointerdown(element: Element): Observable<PointerEvent> {
  return fromEvent<PointerEvent>(element, 'pointerdown').pipe(
    tap((evt) => {
      element.setPointerCapture(evt.pointerId);
      // evt.preventDefault();
      // evt.stopPropagation();
    })
  );
}

export function pointermove(element: Element): Observable<PointerEvent> {
  return fromEvent<PointerEvent>(element, 'pointermove');
}

export function pointerup(element: Element): Observable<PointerEvent> {
  return merge(
    fromEvent<PointerEvent>(element, 'pointerup'),
    fromEvent<PointerEvent>(element, 'pointerleave'),
    fromEvent<PointerEvent>(element, 'pointercancel')
    // fromEvent<PointerEvent>(element, 'pointerout'),
  ).pipe(
    tap((evt) => {
      element.releasePointerCapture(evt.pointerId);
    }),
    first()
  );
}

export function pointerdrag(element: Element): Observable<PointerEvent> {
  return pointerdown(element).pipe(
    exhaustMap((event) =>
      pointermove(element).pipe(startWith(event), takeUntil(pointerup(element)))
    )
  );
}

export function createPointerEvent(element: Element): Observable<PointerEvent> {
  return fromEvent<PointerEvent>(element, 'pointerdown').pipe(
    tap((evt) => {
      element.setPointerCapture(evt.pointerId);
      evt.preventDefault();
      evt.stopPropagation();
    }),
    exhaustMap((event) =>
      fromEvent<PointerEvent>(element, 'pointermove').pipe(
        startWith(event),
        takeUntil(
          merge(
            fromEvent<PointerEvent>(element, 'pointerup'),
            fromEvent<PointerEvent>(element, 'pointerleave'),
            fromEvent<PointerEvent>(element, 'pointercancel')
          ).pipe(
            tap((evt) => {
              element.releasePointerCapture(evt.pointerId);
            }),
            first()
          )
        )
      )
    )
  );
}
