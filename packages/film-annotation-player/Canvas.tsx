import { exhaustMap, last, map, startWith, takeUntil } from 'rxjs';
import { JSX, createEffect, createMemo } from 'solid-js';

import s from './Canvas.module.scss';
import { stroke } from './croquis/brush/simple';
import { getStylusState } from './croquis/stylus';
import { pointerdown, pointermove, pointerup } from './events/pointer';
import { Dimensions } from './interfaces/Dimensions.interface';

export default function Canvas(
  props: {
    size: Dimensions;
    dimentions: Dimensions;
    brushSize: number;
    brushColor: string;
    brushComposite: string;
  } & JSX.VideoHTMLAttributes<HTMLVideoElement>
) {
  const canvas: HTMLCanvasElement = (<canvas class={s.canvas}></canvas>) as HTMLCanvasElement;

  const ctx: CanvasRenderingContext2D = canvas.getContext('2d')!;

  const resizeTo = createMemo(() => {
    const { height, width } = props.size;

    const scaleX = width / canvas.width;
    const skewY = 0;
    const skewX = 0;
    const scaleY = height / canvas.height;
    const translateX = (width - canvas.width) / 2;
    const translateY = (height - canvas.height) / 2;

    return `matrix(${scaleX}, ${skewY}, ${skewX}, ${scaleY}, ${translateX}, ${translateY})`;
  });

  createEffect(() => {
    canvas.style.transform = resizeTo();
  });

  createEffect(() => {
    const { height, width } = props.dimentions;
    canvas.height = height;
    canvas.width = width;
  });

  pointerdown(ctx.canvas)
    .pipe(
      exhaustMap((event) => {
        const context = stroke.down(
          {
            ctx,
            color: props.brushColor,
            size: props.brushSize,
            globalCompositeOperation: props.brushComposite
          },
          getStylusState(event)
        );

        return pointermove(ctx.canvas).pipe(
          startWith(event),
          map((event) => context.move(getStylusState(event))),
          takeUntil(pointerup(ctx.canvas).pipe(map((event) => context.up(getStylusState(event))))),
          last()
        );
      }),
      map(() => ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height))
    )
    .subscribe();

  return canvas;
}
