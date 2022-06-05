import { fromEvent, merge, Observable, switchMap, switchMapTo, takeUntil } from "rxjs";

export const touchdown = (element: Element) => fromEvent<TouchEvent>(element, 'touchstart');
export const touchmove = (element: Element) => fromEvent<TouchEvent>(element, 'touchmove');
export const touchup = (element: Element) => merge(
  fromEvent<TouchEvent>(element, 'touchend'),
  fromEvent<TouchEvent>(element, 'touchleave'),
  fromEvent<TouchEvent>(element, 'touchcancel'),
)

export const touchdrag = (
  element$: Observable<Element>
) => element$.pipe(
  switchMap((element) => touchdown(element)
    .pipe(
      switchMapTo(touchmove(element)
        .pipe(
          takeUntil(touchup(element)),
        )),
    ),
));
