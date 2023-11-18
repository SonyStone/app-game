import {
  exhaustMap,
  last,
  map,
  merge,
  Observable,
  shareReplay,
  startWith,
  Subject,
  switchMap,
  takeUntil,
  withLatestFrom,
} from 'rxjs';
import { createEffect, createSignal, onCleanup } from 'solid-js';
import { stroke } from './croquis/brush/simple';
import { getStylusState } from './croquis/stylus';
import { pointerdown, pointermove, pointerup } from './events/pointer';

export function currentImage(
  ctx$: Observable<CanvasRenderingContext2D>,
  color$: Observable<string>,
  size$: Observable<number>,
  compositeOperation$: Observable<string>
) {
  const destination = new Subject<ImageData | undefined>();

  const source = ctx$.pipe(
    switchMap((ctx) =>
      merge(
        pointerdown(ctx.canvas).pipe(
          withLatestFrom(color$, size$, compositeOperation$),
          exhaustMap(([event, color, size, globalCompositeOperation]) => {
            const context = stroke.down(
              {
                ctx,
                color,
                size,
                globalCompositeOperation,
              },
              getStylusState(event)
            );

            return pointermove(ctx.canvas).pipe(
              startWith(event),
              map((event) => context.move(getStylusState(event))),
              takeUntil(
                pointerup(ctx.canvas).pipe(
                  map((event) => context.up(getStylusState(event)))
                )
              ),
              last()
            );
          }),
          map(() => ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height))
        ),
        destination.pipe(
          map((img) => {
            if (img) {
              ctx.putImageData(img, 0, 0);
              return img;
            } else {
              ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
              return undefined;
            }
          })
        )
      )
    ),
    shareReplay()
  );

  const [image, setImage] = createSignal<ImageData | undefined>();

  createEffect(() => destination.next(image()));

  const subscription = source.subscribe((img) => setImage(img));

  onCleanup(() => subscription.unsubscribe());

  return [image, setImage];
}
