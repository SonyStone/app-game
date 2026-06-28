# Example 04: Drawing App

This sketch maps the current
`packages/typegpu-examples/typegpu-draw-app-example` architecture onto SolidGPU.

The existing app has these domain pieces:

- `BrushStroke`: accumulates brush stamps into a brush texture
- `SwapBuffer`: stores the permanent drawing canvas
- `BlendPass`: composites the brush texture into the drawing canvas
- `DisplayPass`: renders the drawing canvas and optional brush overlay to screen
- brush, blend, layer, pointer, and transform state

SolidGPU should not replace the domain pieces. It should replace the repeated
GPU setup, canvas configuration, resize, render loop, and resource cleanup.

For a production drawing app, this should usually run through
[`07-offscreen-worker.md`](./07-offscreen-worker.md)'s worker shape. The snippets
below keep everything in one file so the render graph is easier to read.

## App Shell

```tsx
import { Canvas } from '@app-game/solid-gpu';
import { createDrawingState } from './state/DrawingState';
import { BrushSettings } from './ui/BrushSettings';
import { CanvasInput } from './ui/CanvasInput';
import { LayerPanel } from './ui/LayerPanel';
import { Toolbar } from './ui/Toolbar';

export function DrawingApp() {
  const state = createDrawingState({
    canvas: {
      width: 4000,
      height: 4000,
      displayWidth: 1,
      displayHeight: 1,
      backgroundColor: '#ffffff',
    },
  });

  return (
    <div class="drawing-app">
      <Toolbar state={state} />
      <BrushSettings state={state} />

      <Canvas
        class="h-full w-full touch-none"
        frameloop="demand"
        clear={[1, 1, 1, 1]}
      >
        <CanvasInput
          transform={state.canvas.transform}
          brush={state.tool.brush}
          onStrokeStart={() => state.stroke.startStroke()}
          onStrokePoints={(points) => state.stroke.addPoints(points)}
          onStrokeEnd={() => state.stroke.endStroke()}
        />

        <DrawingGpuGraph state={state} />
      </Canvas>

      <LayerPanel state={state} />
    </div>
  );
}
```

## GPU Graph

```tsx
import {
  RenderStep,
  useFrame,
  useSolidGPU,
} from '@app-game/solid-gpu';
import { createMemo, onCleanup } from 'solid-js';
import { BlendPass } from './blend/BlendPass';
import { SwapBuffer } from './blend/SwapBuffer';
import { BrushStroke } from './brush/BrushStroke';
import { DisplayPass } from './display/DisplayPass';

function DrawingGpuGraph(props: { state: DrawingState }) {
  const gpu = useSolidGPU();

  const brushStroke = createMemo(
    () => new BrushStroke(gpu.root, props.state.canvas.width, props.state.canvas.height),
  );
  const swapBuffer = createMemo(
    () => new SwapBuffer(gpu.root, props.state.canvas.width, props.state.canvas.height),
  );
  const blendPass = createMemo(() => new BlendPass(gpu.root));
  const displayPass = createMemo(() => new DisplayPass(gpu.root, gpu.presentationFormat));

  onCleanup(() => {
    brushStroke().destroy();
    swapBuffer().destroy();
    displayPass().destroy();
  });

  useFrame(() => {
    const brush = props.state.tool.state.brush;
    brushStroke().setBrushSettings({
      color: brush.color,
      size: brush.size,
      opacity: brush.opacity,
      hardness: brush.hardness,
    });

    blendPass().setBlendMode(props.state.tool.state.blendMode);
    blendPass().setColorBlendMode(props.state.tool.state.colorBlendMode);

    const points = props.state.stroke.consumePoints();
    if (points.length > 0) {
      brushStroke().addStrokePoints(points);
    }
  }, { mode: 'demand' });

  return (
    <>
      <RenderStep order={0} when={() => brushStroke().pendingCount > 0}>
        {(encoder) => {
          brushStroke().render(true);
          brushStroke().clearPending();
        }}
      </RenderStep>

      <RenderStep order={1} when={() => props.state.stroke.justEnded()}>
        {(encoder) => {
          blendPass().render(encoder, brushStroke().textureView, swapBuffer());
          brushStroke().clearTexture();
        }}
      </RenderStep>

      <RenderStep order={2}>
        {(encoder) => {
          const canvas = props.state.canvas.state;
          displayPass().updateTransform(
            canvas.transform,
            canvas.displayWidth,
            canvas.displayHeight,
            canvas.width,
            canvas.height,
          );

          displayPass().setBrushOverlay(
            props.state.stroke.inProgress() ? brushStroke().textureView : null,
          );

          displayPass().render(
            encoder,
            swapBuffer().read.view,
            gpu.context.getCurrentTexture().createView(),
          );
        }}
      </RenderStep>
    </>
  );
}
```

`RenderStep` is a proposed escape hatch for app-specific imperative render code.
It gives the app command-encoder access without forcing every domain pass into a
generic JSX component immediately.

## More Declarative Later

Once the domain passes settle, the same graph could become more declarative:

```tsx
<DrawingSurface size={[4000, 4000]} background="#ffffff">
  <BrushAccumulator
    brush={state.tool.brush}
    points={state.stroke.pendingPoints}
    inProgress={state.stroke.inProgress()}
  />

  <CompositeOnStrokeEnd
    blendMode={state.tool.blendMode}
    colorBlendMode={state.tool.colorBlendMode}
  />

  <DisplayDrawing
    transform={state.canvas.transform}
    overlay={state.stroke.inProgress() ? 'brush' : undefined}
  />
</DrawingSurface>
```

## What SolidGPU Owns

- WebGPU and TypeGPU initialization
- canvas configuration
- resize and drawing-buffer size
- demand render loop
- root/context cleanup
- app-level invalidation

## What The Drawing App Still Owns

- brush behavior
- stroke sampling and spacing
- layer state
- blend mode semantics
- fixed document canvas size
- pointer gesture interpretation
