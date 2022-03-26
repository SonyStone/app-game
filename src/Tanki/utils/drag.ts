import { DisplayObject, Point } from 'pixi.js';
import { fromEvent, merge } from 'rxjs';
import { concatMap, map, pairwise, takeUntil, tap } from 'rxjs/operators';

export function addDrag(obj: DisplayObject) {
  obj.interactive = true;
  obj.buttonMode = true;

  const down$ = fromEvent(obj, 'pointerdown').pipe(
    tap(() => obj.alpha = 0.5),
  );

  const move$ = fromEvent(obj, 'pointermove').pipe(
    map((event: any) => {
      // store a reference to the data
      // the reason for this is because of multitouch
      // we want to track the movement of this particular touch
      (obj as any).data = event.data;

      return (obj as any).data.getLocalPosition(obj.parent);
    }),
    pairwise(),
    map(([oldPosition, newPosition]: Point[]) => {
      return {
        x: oldPosition.x - newPosition.x,
        y: oldPosition.y - newPosition.y,
      } as Point;
    }),
  );

  const stop$ = merge(
    fromEvent(obj, 'pointerupoutside'),
    fromEvent(obj, 'pointerup'),
    fromEvent(document, 'mouseup'),
  ).pipe(
    tap(() => obj.alpha = 1),
  );

  const removed$ = fromEvent(obj, 'removed');

  down$.pipe(
    takeUntil(removed$),
    concatMap(() => move$.pipe(
      takeUntil(stop$),
    )),
  ).subscribe((position: Point) => {
    obj.x -= position.x;
    obj.y -= position.y;
  });
};
