# Example 07: OffscreenCanvas Worker

This sketch is inspired by
`packages/paint/offscreen-canvas-paint/offscreen-canvas-paint.tsx` and
`packages/pixijs-examples/offscreen-canvas.worker.tsx`.

The pattern:

- main thread renders a DOM `<canvas>`
- main thread transfers it with `transferControlToOffscreen()`
- main thread keeps pointer events, keyboard shortcuts, UI, and layout
- worker owns TypeGPU, GPU resources, render graph, and RAF
- worker can run a Solid root and render JSX locally
- messages across the boundary are serializable commands and data snapshots

## Main Thread

```tsx
import { WorkerCanvas } from '@app-game/solid-gpu';
import PaintWorker from './paint.worker?worker';

export function OffscreenPaintViewport() {
  const [brush, setBrush] = createSignal({
    color: [0, 0, 0, 1] as const,
    size: 24,
    hardness: 0.8,
  });

  return (
    <WorkerCanvas
      class="h-full w-full touch-none"
      worker={() => new PaintWorker()}
      frameloop="always"
      dpr={[1, 2]}
      state={{ brush: brush() }}
      onPointerMove={(event, post) => {
        const events = event.getCoalescedEvents();
        const samples = events.length > 0 ? events : [event];

        for (const sample of samples) {
          post({
            type: 'pointermove',
            point: {
              x: sample.clientX,
              y: sample.clientY,
              pressure: sample.pressure,
              buttons: sample.buttons,
            },
          });
        }
      }}
      onPointerUp={(_event, post) => {
        post({ type: 'pointerup' });
      }}
      onStateChange={(post) => {
        post({ type: 'state', state: { brush: brush() } });
      }}
      fallbackRenderThread="main"
    />
  );
}
```

`WorkerCanvas` owns the browser-specific ceremony:

```ts
const offscreen = canvas.transferControlToOffscreen();
worker.postMessage(
  {
    type: 'init',
    canvas: offscreen,
    size,
    dpr,
    state,
  },
  [offscreen],
);
```

It also sends resize messages when the DOM canvas display size changes.

## Worker Entry

The worker entry is a `.tsx` module. It can use Solid signals, effects,
conditionals, lazy components, and JSX because it is bundled as worker code.

```tsx
import {
  CanvasRoot,
  RenderStep,
  createSolidGPUWorker,
  useSolidGPU,
} from '@app-game/solid-gpu/worker';
import { createSignal } from 'solid-js';
import { BrushAccumulator } from './gpu/BrushAccumulator';
import { PaintDisplayPass } from './gpu/PaintDisplayPass';

type PaintWorkerMessage =
  | {
      type: 'state';
      state: { brush: BrushSettings };
    }
  | {
      type: 'pointermove';
      point: PointerSample;
    }
  | { type: 'pointerup' };

createSolidGPUWorker<PaintWorkerMessage>((host) => {
  const [brush, setBrush] = createSignal(host.initialState.brush);
  const [stroke, setStroke] = createSignal<BrushStroke>();

  host.onMessage((message) => {
    switch (message.type) {
      case 'state':
        setBrush(message.state.brush);
        host.invalidate();
        break;
      case 'pointermove':
        if (message.point.buttons === 1 && message.point.pressure > 0) {
          setStroke((current) => appendPoint(current, message.point));
          host.invalidate();
        }
        break;
      case 'pointerup':
        setStroke((current) => endStroke(current));
        host.invalidate();
        break;
    }
  });

  return (
    <CanvasRoot canvas={host.canvas} frameloop="always">
      <PaintGraph brush={brush()} stroke={stroke()} />
    </CanvasRoot>
  );
});

function PaintGraph(props: {
  brush: BrushSettings;
  stroke?: BrushStroke;
}) {
  const gpu = useSolidGPU();

  return (
    <>
      <BrushAccumulator
        brush={props.brush}
        stroke={props.stroke}
        documentSize={gpu.drawingBufferSize()}
      />

      <RenderStep order={10}>
        {(encoder) => {
          PaintDisplayPass.render({
            encoder,
            target: gpu.context.getCurrentTexture().createView(),
          });
        }}
      </RenderStep>
    </>
  );
}
```

This mirrors the Pixi worker shape:

```tsx
createRoot(() => {
  const [offscreenCanvas, setOffscreenCanvas] =
    createSignal<OffscreenCanvas>();

  onmessage = (event) => {
    if (event.data.type === 'canvas') {
      setOffscreenCanvas(event.data.canvas);
    }
  };

  <Show when={offscreenCanvas()}>
    <CanvasRoot canvas={offscreenCanvas()} frameloop="demand">
      <PaintGraph />
    </CanvasRoot>
  </Show>;
});
```

## Message Types

```ts
type PointerSample = {
  x: number;
  y: number;
  pressure: number;
  buttons: number;
};

type WorkerCanvasMessage<TState, TCommand> =
  | {
      type: 'init';
      canvas: OffscreenCanvas;
      size: { width: number; height: number };
      dpr: number;
      state: TState;
    }
  | {
      type: 'resize';
      size: { width: number; height: number };
      dpr: number;
    }
  | { type: 'state'; state: TState }
  | { type: 'command'; command: TCommand }
  | { type: 'pointermove'; point: PointerSample }
  | { type: 'pointerup' }
  | { type: 'render' }
  | { type: 'dispose' };
```

## What Stays On The Main Thread

- DOM and panels
- keyboard shortcuts
- pointer event capture
- `getCoalescedEvents()`
- layout and resize observation
- app document state, unless the app deliberately moves it to the worker
- undo/redo command log

## What Moves To The Worker

- TypeGPU root and device use
- canvas context configuration
- render graph
- textures, buffers, pipelines, bind groups
- RAF or demand render scheduling
- expensive brush stamping, compositing, filters, and compute

## When Not To Use A Worker

Use main-thread rendering for:

- tiny teaching examples
- server-side tests and non-browser unit tests
- debugging a new render graph
- apps where GPU work is trivial and thread messaging would add complexity

Use worker rendering for:

- paint apps
- Photoshop-like image editors
- large 2D/3D scenes
- compute-heavy effects
- anything where the UI must stay responsive during rendering
