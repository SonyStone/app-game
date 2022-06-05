import { combineLatest, fromEvent, merge, Observable, switchMap, switchMapTo, takeUntil } from "rxjs";

export const mousedown = (element: Element) => fromEvent<MouseEvent>(element, 'mousedown');
export const mousemove = (element: Element) => fromEvent<MouseEvent>(element, 'mousemove');
export const mouseup = (element: Element) => merge(
  fromEvent<MouseEvent>(element, 'mouseleave'),
  fromEvent<MouseEvent>(element, 'mouseup'),
)

export const mousedrag = (
  element$: Observable<Element>,
  dragZoneElement$: Observable<Element>
) => combineLatest([element$, dragZoneElement$])
  .pipe(
    switchMap(([element, dragZoneElement]) => mousedown(element)
      .pipe(
        switchMapTo(mousemove(dragZoneElement)
          .pipe(
            takeUntil(mouseup(dragZoneElement))
          )),
      )
  ));