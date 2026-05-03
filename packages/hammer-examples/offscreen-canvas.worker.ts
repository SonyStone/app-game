import { createPointerEventsHandler, HammerInput, MinimumInputEvent } from '@app-game/hammer/pointerevent';
import createRAF from '@solid-primitives/raf';
import { createEffect, createRoot, createSignal } from 'solid-js';

export type WorkerMessage =
  | {
      type: 'canvas';
      canvas: OffscreenCanvas;
    }
  | {
      type: 'resize';
      width: number;
      height: number;
    }
  | {
      type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointerleave' | 'pointercancel';
      clientX: number;
      clientY: number;
      pointerId: number;
      pointerType: string;
      pressure: number;
      tiltX?: number;
      tiltY?: number;
      twist?: number;
      timeStamp: number;
    };

createRoot(() => {
  const [offscreenCanvas, setOffscreenCanvas] = createSignal<OffscreenCanvas | undefined>(undefined);
  let ctx: OffscreenCanvasRenderingContext2D | undefined = undefined;

  createEffect(() => {
    const canvas = offscreenCanvas();
    if (!canvas) {
      return;
    }

    ctx = canvas.getContext('2d') ?? undefined;
  });

  const pointerEventsHandler = createPointerEventsHandler();

  const events: MinimumInputEvent[] = [];
  let input: HammerInput | undefined = undefined;

  // ! important to use RequestAnimationFrame to prevent performance issues
  const [, start, stop] = createRAF(() => {
    if (!ctx) {
      return;
    }

    // ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // if (input) {
    //   ctx.strokeStyle = 'black';
    //   for (const point of input.pointers) {
    //     ctx.beginPath();
    //     ctx.ellipse(point[0], point[1], 30, 30, 0, 0, Math.PI * 2, false);
    //     ctx.stroke();

    //     ctx.beginPath();
    //     ctx.moveTo(point[0], point[1]);
    //     ctx.lineTo(input.center[0], input.center[1]);
    //     ctx.stroke();
    //   }

    //   ctx.beginPath();
    //   ctx.moveTo(input.start[0], input.start[1]);
    //   ctx.lineTo(input.center[0], input.center[1]);
    //   ctx.stroke();
    // }

    ctx.strokeStyle = 'blue';
    for (const e of events) {
      if (e.pressure === 0) {
        continue;
      }
      ctx.beginPath();
      const radians = (e.pressure ?? 1) * 6;
      ctx.ellipse(e.clientX, e.clientY, radians, radians, 0, 0, Math.PI * 2, false);
      ctx.stroke();
    }
    events.length = 0;

    // ctx.strokeStyle = 'red';
    // for (e of untrack(coalescedEvents)) {
    //   ctx.beginPath();
    //   ctx.ellipse(e.clientX, e.clientY, 2, 2, 0, 0, Math.PI * 2, false);
    //   ctx.stroke();
    // }

    // ctx.strokeStyle = 'green';
    // for (e of untrack(predictedEvents)) {
    //   ctx.beginPath();
    //   ctx.ellipse(e.clientX, e.clientY, 1, 1, 0, 0, Math.PI * 2, false);
    //   ctx.stroke();
    // }

    stop();
  });

  onmessage = function (evt: MessageEvent<WorkerMessage>) {
    switch (evt.data.type) {
      case 'canvas': {
        setOffscreenCanvas(evt.data.canvas);
        return;
      }
      case 'resize': {
        const canvas = offscreenCanvas();
        if (!canvas) {
          return;
        }
        canvas.width = evt.data.width;
        canvas.height = evt.data.height;
        start();
        return;
      }
      case 'pointerdown': {
        pointerEventsHandler(evt.data);
        events.push(evt.data as MinimumInputEvent);
        start();
        return;
      }
      case 'pointermove': {
        events.push(evt.data as MinimumInputEvent);
        input = pointerEventsHandler(evt.data);
        start();

        return;
      }
      case 'pointercancel':
      case 'pointerleave':
      case 'pointerup': {
        if (!ctx) {
          return;
        }
        pointerEventsHandler(evt.data);
        // ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        start();
        return;
      }
    }
  };
});
