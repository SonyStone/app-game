import { exhaustMap, first, fromEvent, map, merge, Observable, pairwise, startWith, switchMapTo, takeUntil, tap } from 'rxjs';


export function pointerdown(element: Element): Observable<PointerEvent> {
  return fromEvent<PointerEvent>(element, 'pointerdown').pipe(
    tap((evt) => {
      element.setPointerCapture(evt.pointerId);
      evt.preventDefault();
      evt.stopPropagation();
    }),
  );
}

export function pointermove(element: Element): Observable<PointerEvent> {
  return fromEvent<PointerEvent>(element, 'pointermove');
}

export function pointerup(element: Element): Observable<PointerEvent> {
  return merge(
    fromEvent<PointerEvent>(element, 'pointerup'),
    fromEvent<PointerEvent>(element, 'pointerleave'),
    fromEvent<PointerEvent>(element, 'pointercancel'),
    // fromEvent<PointerEvent>(element, 'pointerout'),
  ).pipe(
    tap((evt) => {
      element.releasePointerCapture(evt.pointerId);
    }),
    first(),
  );
}

export function pointerdrag(element: Element): Observable<PointerEvent> {
  return pointerdown(element).pipe(
    exhaustMap((event) => pointermove(element).pipe(
      startWith(event),
      takeUntil(pointerup(element))
    ),
    ),
  );
}

export function createPointerEvent(element: Element): Observable<PointerEvent> {
  return fromEvent<PointerEvent>(element, 'pointerdown')
    .pipe(
      tap((evt) => {
        element.setPointerCapture(evt.pointerId);
        evt.preventDefault();
        evt.stopPropagation();
      }),
      exhaustMap((event) => fromEvent<PointerEvent>(element, 'pointermove')
        .pipe(
          startWith(event),
          takeUntil(
            merge(
              fromEvent<PointerEvent>(element, 'pointerup'),
              fromEvent<PointerEvent>(element, 'pointerleave'),
              fromEvent<PointerEvent>(element, 'pointercancel'),
            ).pipe(
              tap((evt) => {
                element.releasePointerCapture(evt.pointerId);
              }),
              first(),
            )
          )
        ),
      ),
    );
}

export function offseting(element: Element): Observable<[number, number]> {
  const { pointerstart$, pointermove$, pointerend$ } =
    createPointerEvents(element);

  return pointerstart$.pipe(
    switchMapTo(
      pointermove$.pipe(
        map((e2) => [e2.x, e2.y]),
        pairwise(),
        map(([e1, e2]) => [e1[0] - e2[0], e1[1] - e2[1]] as [number, number]),
        takeUntil(pointerend$)
      )
    )
  );
}

export function createPointerEvents(element: Element) {
  const pointerdown$ = fromEvent<PointerEvent>(element, 'pointerdown').pipe(
    tap((event) => {
      event.preventDefault();
      event.stopPropagation();
    })
  );

  const pointermove$ = fromEvent<PointerEvent>(document, 'pointermove');
  const pointerup$ = fromEvent<PointerEvent>(document, 'pointerup');
  const pointerlieav$ = fromEvent<PointerEvent>(document, 'pointerup');

  return {
    pointerstart$: pointerdown$,
    pointermove$,
    pointerend$: merge(pointerup$, pointerlieav$),
  };
}

