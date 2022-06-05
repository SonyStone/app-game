import { exhaustMap, last, map, startWith, takeUntil } from 'rxjs';
import { createEffect, createMemo, JSX, onCleanup } from 'solid-js';

import { stroke } from './croquis/brush/simple';
import { getStylusState } from './croquis/stylus';
import { pointerdown, pointermove, pointerup } from './events/pointer';
import { Dimensions } from './interfaces/Dimensions.interface';
import s from './Player.module.scss';
import { useVideoContext } from './VideoContext.provider';

interface Props extends JSX.VideoHTMLAttributes<HTMLVideoElement> {
  size: Dimensions;
}

export default function Canvas(props: Props) {
  const canvas: HTMLCanvasElement = (
    <canvas class={s.canvas}></canvas>
  ) as HTMLCanvasElement;

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

  const [{ brushSize, brushColor, brushComposite }] = useVideoContext();

  createEffect(() => {
    const { height, width } = props.size;
    canvas.height = height;
    canvas.width = width;
  });

  createEffect(() => {
    console.log(`Canvas`, brushSize(), brushColor(), brushComposite(), ctx);

    pointerdown(ctx.canvas).pipe(
      exhaustMap((event) => {
        const context = stroke.down(
          {
            ctx,
            color: brushColor(),
            size: brushSize(),
            globalCompositeOperation: brushComposite(),
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
    );

    onCleanup(() => {
      console.log(`cleanup!`);
    });
  });

  return canvas;
}
