# SolidGPU Design

## Status

Proposal document. This file describes the desired public API and architecture
before implementation.

Concrete API sketches live in [`examples/`](./examples/).

## Goal

SolidGPU is a SolidJS library for describing WebGPU scenes, render graphs, and
GPU resources with JSX while keeping TypeGPU's typed resource model visible.

The library should make these jobs feel natural in Solid:

- initialize WebGPU and TypeGPU
- configure one or more canvases
- create and dispose GPU resources with component lifetimes
- describe render and compute passes declaratively
- redraw on Solid signal changes, resize, or explicit invalidation
- build higher-level 2D and 3D scene components over a typed GPU core

The library should not hide TypeGPU behind an untyped scene engine. JSX should
manage lifetime and composition. TypeGPU should still provide schemas, shader
functions, bind group layouts, buffers, textures, and pipeline typing.

## Inspirations

- `packages/typegpu-examples/utils`: current provider stack for GPU, TypeGPU
  root, canvas context, and resize state
- `packages/solid-ogl`: Solid custom renderer, canvas state, invalidation,
  attachment rules, and lifecycle
- `packages/solid-pixi`: simple JSX to imperative scene object mapping
- `react-three-fiber`: `Canvas`, render loop, resource attachment, root state,
  and hooks
- `packages/paint/offscreen-canvas-paint`: OffscreenCanvas transfer to a worker
  while the main thread keeps pointer events and DOM UI
- `packages/pixijs-examples/offscreen-canvas.worker.tsx`: a worker-local Solid
  root rendering JSX into an OffscreenCanvas
- TypeGPU: typed WebGPU resources, schemas, shader functions, render pipelines,
  compute pipelines, and interoperability with raw WebGPU

## Design Principles

1. TypeGPU remains first-class.
   Users should be able to pass TypeGPU schemas, shader functions, bind group
   layouts, buffers, textures, and raw WebGPU resources directly.

2. JSX owns lifetime.
   Mounting a component creates or attaches a GPU resource. Unmounting disposes
   or detaches it when the component owns it.

3. Root and canvas are separate concepts.
   One `TgpuRoot` can drive multiple canvases. A convenience `<Canvas>` should
   exist, but lower-level providers must remain public.

4. Render order is explicit where it matters.
   Render passes and compute passes are ordered commands, not ordinary nested
   scene objects. JSX can describe them, but the API should not pretend GPU
   command encoding is purely hierarchical.

5. Scene APIs are layered on top of the render graph.
   `Mesh`, `Sprite`, `Camera`, and `Scene3D` should be built over the same typed
   resource and pass primitives exposed to users.

6. Demand rendering is the default mental model.
   Solid signal changes, resize, resource updates, and `invalidate()` request
   frames. Continuous RAF rendering is opt-in.

7. App-scale rendering should prefer workers.
   Simple examples can render on the main thread. Drawing apps, image editors,
   large scenes, and long-running compute should use an OffscreenCanvas worker
   path by default, with feature detection and a main-thread fallback.

## Package Shape

Initial package:

```ts
import {
  Canvas,
  WorkerCanvas,
  GPUProvider,
  GPURootProvider,
  GPUCanvas,
  GPUCanvasContextProvider,
  GPUCanvasConfiguration,
  SolidGPUProvider,
  RenderPass,
  RenderStep,
  ComputePass,
  Pipeline,
  ComputePipeline,
  BindGroup,
  VertexBuffer,
  Draw,
  DrawIndexed,
  Dispatch,
  Buffer,
  Uniform,
  Texture,
  DepthTexture,
  Sampler,
  useGPU,
  useGPUCanvas,
  useSolidGPU,
  useFrame,
  invalidate,
} from '@app-game/solid-gpu';
```

Later optional entry points:

```ts
import { Scene2D, Sprite, Shape } from '@app-game/solid-gpu/2d';
import { Scene3D, Mesh, PerspectiveCamera } from '@app-game/solid-gpu/3d';
import { CanvasRoot, createSolidGPUWorker } from '@app-game/solid-gpu/worker';
```

## Core API

### Convenience Canvas

The shortest path creates a canvas, initializes TypeGPU, configures WebGPU, and
provides root state.

```tsx
import { Canvas, useSolidGPU } from '@app-game/solid-gpu';
import tgpu from 'typegpu';
import { builtin, vec2f, vec4f } from 'typegpu/data';

const vertex = tgpu['~unstable'].vertexFn({
  in: { vertexIndex: builtin.vertexIndex },
  out: { pos: builtin.position },
})(({ vertexIndex }) => {
  'use gpu';
  const pos = [vec2f(0, 0.5), vec2f(-0.5, -0.5), vec2f(0.5, -0.5)];
  return { pos: vec4f(pos[vertexIndex], 0, 1) };
});

const fragment = tgpu['~unstable'].fragmentFn({
  out: vec4f,
})(() => {
  'use gpu';
  return vec4f(0, 1, 0, 1);
});

function App() {
  return (
    <Canvas class="aspect-square w-full" clear={[0, 0, 0, 1]}>
      <Triangle />
    </Canvas>
  );
}

function Triangle() {
  const gpu = useSolidGPU();

  const pipeline = gpu.root['~unstable']
    .withVertex(vertex, {})
    .withFragment(fragment, { format: gpu.presentationFormat })
    .createPipeline();

  return (
    <RenderPass>
      <Pipeline value={pipeline}>
        <Draw vertexCount={3} />
      </Pipeline>
    </RenderPass>
  );
}
```

### Split Root And Canvas

For multi-canvas examples, share one TypeGPU root and configure each canvas
independently.

```tsx
function MultiCanvas() {
  return (
    <GPURootProvider>
      <GPUCanvas class="aspect-square w-full">
        <RenderPass clear={[1, 0, 0, 1]}>
          <DrawTriangle />
        </RenderPass>
      </GPUCanvas>

      <GPUCanvas class="aspect-square w-full">
        <RenderPass clear={[0, 0, 1, 1]}>
          <DrawTriangle />
        </RenderPass>
      </GPUCanvas>
    </GPURootProvider>
  );
}
```

Equivalent lower-level form:

```tsx
<GPUProvider>
  <GPURootProvider>
    <canvas ref={setCanvas} />
    <GPUCanvasContextProvider canvas={canvas()}>
      <GPUCanvasConfiguration alphaMode="premultiplied">
        <SolidGPUProvider>
          <App />
        </SolidGPUProvider>
      </GPUCanvasConfiguration>
    </GPUCanvasContextProvider>
  </GPURootProvider>
</GPUProvider>
```

The lower-level providers correspond to the current foundations in
`packages/typegpu-examples/utils`.

## Root State

`useSolidGPU()` returns:

```ts
type SolidGPUState = {
  gpu: GPU;
  root: TgpuRoot;
  device: GPUDevice;
  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;
  presentationFormat: GPUTextureFormat;
  cssSize: Accessor<{ width: number; height: number }>;
  drawingBufferSize: Accessor<{ width: number; height: number }>;
  pixelRatio: Accessor<number>;
  time: Accessor<number>;
  delta: Accessor<number>;
  frame: Accessor<number>;
  frameloop: Accessor<'always' | 'demand' | 'never'>;
  invalidate: () => void;
  render: () => void;
};
```

`cssSize` is the element display size. `drawingBufferSize` is the actual canvas
buffer size after device pixel ratio or pixel scaling.

## Canvas Props

```ts
type CanvasProps = JSX.CanvasHTMLAttributes<HTMLCanvasElement> & {
  children?: JSX.Element;
  fallback?: JSX.Element;
  loading?: JSX.Element;
  error?: JSX.Element | ((error: unknown) => JSX.Element);
  dpr?: number | readonly [min: number, max: number];
  pixelScale?: number;
  alphaMode?: GPUCanvasAlphaMode;
  colorSpace?: PredefinedColorSpace;
  usage?: GPUTextureUsageFlags;
  format?: GPUTextureFormat;
  powerPreference?: GPUPowerPreference;
  frameloop?: 'always' | 'demand' | 'never';
  renderThread?: 'main' | 'worker' | 'auto';
  worker?: Worker | (() => Worker);
  clear?: readonly [number, number, number, number];
  onCreated?: (state: SolidGPUState) => void;
};
```

`dpr` controls high-DPI rendering. `pixelScale` intentionally lowers the drawing
buffer resolution for pixel-art examples.

`renderThread="worker"` transfers the DOM canvas to an `OffscreenCanvas` and
runs the GPU root in a worker. `renderThread="auto"` should prefer the worker
path when `transferControlToOffscreen` and worker canvas contexts are available,
then fall back to main-thread rendering.

## OffscreenCanvas Worker API

For app-scale projects, the recommended shape is a main-thread canvas shell plus
a worker entry module. The main thread owns DOM, UI, keyboard shortcuts, pointer
events, accessibility, and serializable editor state. The worker owns TypeGPU,
canvas configuration, render graph execution, GPU resources, and frame timing.

The worker entry can be a `.tsx` module. It should create its own Solid root and
render JSX locally in the worker, just like the existing Pixi OffscreenCanvas
example does with `<Application>` and `<Stage>`. The main thread does not send
JSX across `postMessage`; it sends canvas ownership, size, state snapshots, and
commands.

Main thread:

```tsx
import { WorkerCanvas } from '@app-game/solid-gpu';
import RenderWorker from './image-editor.worker?worker';

export function EditorViewport(props: { document: ImageDocument }) {
  const worker = () => new RenderWorker();

  return (
    <WorkerCanvas
      class="h-full w-full touch-none"
      worker={worker}
      dpr={[1, 2]}
      frameloop="demand"
      state={{
        document: props.document.snapshot(),
        viewport: props.document.viewport(),
      }}
      onPointerMove={(event, post) => {
        const points = event.getCoalescedEvents();
        const samples = points.length > 0 ? points : [event];

        for (const point of samples) {
          post({
            type: 'pointermove',
            point: {
              x: point.clientX,
              y: point.clientY,
              pressure: point.pressure,
              buttons: point.buttons,
            },
          });
        }
      }}
      onPointerUp={(_event, post) => post({ type: 'pointerup' })}
    />
  );
}
```

Worker entry:

```tsx
import {
  CanvasRoot,
  createSolidGPUWorker,
} from '@app-game/solid-gpu/worker';
import { createSignal, Show } from 'solid-js';
import { ImageDocumentGraph } from './gpu/ImageDocumentGraph';

createSolidGPUWorker<EditorWorkerMessage>((host) => {
  const [document, setDocument] = createSignal(host.initialState.document);
  const [viewport, setViewport] = createSignal(host.initialState.viewport);
  const [pendingStroke, setPendingStroke] = createSignal<BrushStroke>();

  host.onMessage((message) => {
    switch (message.type) {
      case 'state':
        setDocument(message.state.document);
        setViewport(message.state.viewport);
        host.invalidate();
        break;
      case 'pointermove':
        setPendingStroke((stroke) => appendStrokePoint(stroke, message.point));
        host.invalidate();
        break;
      case 'pointerup':
        commitStroke();
        host.invalidate();
        break;
    }
  });

  return (
    <Show when={host.canvas}>
      <CanvasRoot canvas={host.canvas} frameloop="demand">
        <ImageDocumentGraph
          document={document()}
          viewport={viewport()}
          brushStroke={pendingStroke()}
        />
      </CanvasRoot>
    </Show>
  );
});
```

This split avoids pretending JSX can be sent to a worker. JSX for the render
graph lives in the worker bundle and is compiled there. Serializable state,
commands, and pointer samples cross the thread boundary.

### Worker Message Model

Prefer command-style messages over sending large object graphs every frame.

```ts
type SolidGPUWorkerMessage =
  | { type: 'init'; canvas: OffscreenCanvas; size: Size; dpr: number }
  | { type: 'resize'; size: Size; dpr: number }
  | { type: 'state'; state: unknown }
  | { type: 'pointermove'; point: PointerSample }
  | { type: 'pointerup' }
  | { type: 'command'; command: EditorCommand }
  | { type: 'render' }
  | { type: 'dispose' };
```

Main-thread pointer events should use `getCoalescedEvents()` when available, as
in `packages/paint/offscreen-canvas-paint`, so brush strokes preserve high-rate
input samples without blocking the UI thread.

## Render Loop

```tsx
<Canvas frameloop="demand">
  <Scene />
</Canvas>
```

Frame behavior:

- `always`: RAF renders every available frame
- `demand`: render only after `invalidate()`, resize, or reactive resource update
- `never`: no automatic render; users call `render()`

Hook API:

```tsx
function Spinner() {
  const [rotation, setRotation] = createSignal(0);

  useFrame((state, delta) => {
    setRotation((value) => value + delta);
  });

  return <Mesh rotation={[0, rotation(), 0]} />;
}
```

`useFrame` should imply continuous rendering while mounted unless the callback is
registered with `{ mode: 'demand' }`.

## Low-Level Render Graph API

The low-level API directly expresses TypeGPU/WebGPU concepts.

```tsx
<Canvas>
  <RenderPass
    color={{
      clearValue: [0, 0, 0, 1],
      loadOp: 'clear',
      storeOp: 'store',
    }}
    depth={{ format: 'depth24plus', clearValue: 1 }}
  >
    <Pipeline vertex={vertex} fragment={fragment} primitive={{ topology: 'triangle-list' }}>
      <BindGroup layout={layout} values={bindings()} />
      <Draw vertexCount={3} />
    </Pipeline>
  </RenderPass>
</Canvas>
```

Alternative explicit pipeline object:

```tsx
const pipeline = root['~unstable']
  .withVertex(vertex, {})
  .withFragment(fragment, { format })
  .createPipeline();

<Pipeline value={pipeline}>
  <Draw vertexCount={3} />
</Pipeline>;
```

### RenderPass Props

```ts
type RenderPassProps = {
  children?: JSX.Element;
  target?: TextureTarget | GPUTextureView;
  color?: ColorAttachmentProps | ColorAttachmentProps[];
  depth?: DepthAttachmentProps | false;
  sampleCount?: 1 | 4;
  order?: number;
};
```

If `target` is omitted, the current canvas texture is used.

### Draw Commands

```tsx
<Draw vertexCount={3} />
<Draw vertexCount={circle.numVertices} instanceCount={amount()} />
<DrawIndexed indexCount={indexCount()} instanceCount={amount()} />
```

Draw components do not create persistent GPU resources. They append commands to
the active pass during render.

### Compute

```tsx
<ComputePass>
  <ComputePipeline fn={computeSomething}>
    <BindGroup layout={layout} values={bindings()} />
    <Dispatch workgroups={[count(), 1, 1]} />
  </ComputePipeline>
</ComputePass>
```

Compute can run before render passes:

```tsx
<Canvas>
  <ComputePass order={0}>
    <ParticlesStep dt={delta()} />
  </ComputePass>

  <RenderPass order={1}>
    <ParticlesDraw />
  </RenderPass>
</Canvas>
```

## Resource Components

Resource components create typed TypeGPU resources and clean them up when owned.

### Uniform

```tsx
const uniforms = d.struct({
  color: d.vec4f,
  scale: d.vec2f,
  offset: d.vec2f,
});

const layout = tgpu.bindGroupLayout({
  uniforms: { uniform: uniforms },
});

<Uniform
  schema={uniforms}
  value={{
    color: d.vec4f(1, 0, 0, 1),
    scale: d.vec2f(1, 1),
    offset: d.vec2f(0, 0),
  }}
>
  {(uniform) => (
    <BindGroup
      layout={layout}
      values={{ uniforms: uniform.buffer }}
    />
  )}
</Uniform>;
```

Child-as-function keeps TypeGPU's inferred resource type available.

### Buffer

```tsx
<Buffer
  schema={d.arrayOf(d.vec2f, points().length)}
  usage={['vertex', 'storage']}
  value={points()}
>
  {(buffer) => <VertexBuffer slot={0} value={buffer} />}
</Buffer>
```

### Texture

```tsx
<Texture
  size={[image.width, image.height]}
  format="rgba8unorm"
  usage={['sampled', 'render']}
  data={image.data}
>
  {(texture) => (
    <BindGroup
      layout={layout}
      values={{
        texture: texture.createView(),
        sampler,
      }}
    />
  )}
</Texture>
```

### Owned Versus External Resources

```tsx
<Texture value={externalTexture} dispose={false} />
<Pipeline value={externalPipeline} />
```

By default, components dispose resources they create. They do not dispose
resources passed through `value` unless `dispose` is explicitly true.

## 2D Scene API

The 2D layer should be convenient for sprites, shapes, text, and render targets,
but still backed by the same resource and pass system.

```tsx
<Canvas>
  <Scene2D camera={{ kind: 'orthographic' }}>
    <Sprite texture={bunnyTexture()} position={[100, 120]} anchor={[0.5, 0.5]} />
    <Rect position={[20, 20]} size={[200, 80]} fill={[0.2, 0.8, 1, 1]} />
    <Circle position={[300, 120]} radius={48} fill={[1, 0.4, 0.1, 1]} />
  </Scene2D>
</Canvas>
```

Possible 2D primitives:

- `Scene2D`
- `Sprite`
- `Rect`
- `Circle`
- `Line`
- `Path`
- `Text`
- `InstancedSprites`

The MVP should start with `Sprite`, `Rect`, and instanced geometry. Text can
wait because it needs atlas management.

## 3D Scene API

The 3D layer should feel familiar to Solid OGL and r3f users, but it should not
try to duplicate all of Three.

```tsx
<Canvas frameloop="always">
  <Scene3D>
    <PerspectiveCamera makeDefault position={[0, 0, 5]} />
    <Mesh position={[0, 0, 0]} rotation={[0, time(), 0]}>
      <BoxGeometry size={[1, 1, 1]} />
      <ShaderMaterial vertex={litVertex} fragment={litFragment}>
        <Uniform schema={materialSchema} value={material()} attach="material" />
      </ShaderMaterial>
    </Mesh>
  </Scene3D>
</Canvas>
```

Early 3D primitives:

- `Scene3D`
- `PerspectiveCamera`
- `OrthographicCamera`
- `Mesh`
- `Geometry`
- `ShaderMaterial`
- `BoxGeometry`
- `PlaneGeometry`
- `InstancedMesh`

Later primitives:

- lights
- picking
- GLTF loading
- skeletal animation
- postprocessing

## Attachment Model

Some children attach to parent properties, similar to `solid-ogl`:

```tsx
<Mesh>
  <BoxGeometry attach="geometry" />
  <ShaderMaterial attach="material" vertex={vertex} fragment={fragment} />
</Mesh>
```

For low-level render graph commands, attachment should be explicit through
context instead of property inference:

```tsx
<RenderPass>
  <Pipeline>
    <BindGroup />
    <Draw />
  </Pipeline>
</RenderPass>
```

## Events And Picking

Pointer events should not be part of the MVP. They require a picking strategy,
camera math, and hit testing.

Possible later API:

```tsx
<Mesh
  onPointerDown={(event) => setSelected(event.object)}
  onPointerMove={(event) => setHover(event.object)}
/>
```

2D picking can be CPU bounds-based at first. 3D picking can later use ray tests
or a GPU picking pass.

## Error And Fallback API

```tsx
<Canvas
  loading={<div>Initializing GPU...</div>}
  fallback={<div>WebGPU is not available.</div>}
  error={(error) => <div>{String(error)}</div>}
>
  <App />
</Canvas>
```

Errors to handle:

- missing `navigator.gpu`
- adapter/device request failure
- missing `webgpu` canvas context
- TypeGPU initialization failure
- device lost

Device-lost handling can be added after MVP. Initial behavior can surface an
error state and stop rendering.

## Internal Architecture

Proposed modules:

```txt
src/
  index.ts
  canvas.tsx
  context.ts
  frame-loop.ts
  renderer/
    graph.ts
    render-pass.ts
    compute-pass.ts
    commands.ts
  resources/
    buffer.tsx
    uniform.tsx
    texture.tsx
    sampler.tsx
    bind-group.tsx
    pipeline.tsx
  scene-2d/
    index.ts
    scene.tsx
    sprite.tsx
    shapes.tsx
  scene-3d/
    index.ts
    scene.tsx
    camera.tsx
    mesh.tsx
    geometry.tsx
    material.tsx
```

The first implementation can avoid a full Solid custom renderer. Components can
register resources and commands through contexts. A custom renderer becomes
useful if we want intrinsic JSX tags such as `<mesh>` or automatic constructor
registration.

## MVP

MVP 1 should prove that the current examples can be rewritten with less
boilerplate:

- `Canvas`
- `WorkerCanvas`
- split root/canvas providers
- OffscreenCanvas transfer and worker fallback detection
- `useSolidGPU`
- `useFrame`
- `frameloop`
- resize state with `cssSize` and `drawingBufferSize`
- `RenderPass`
- `Pipeline`
- `BindGroup`
- `Draw`
- `Uniform`
- `Buffer`
- `Texture`
- `Sampler`

Success criteria:

- rewrite `1.1-webgpu-fundamentals`
- rewrite `3-webgpu-uniforms`
- rewrite `6.1-webgpu-textures`
- support the multi-canvas shape from `typegpu-hello-triangle`
- support the OffscreenCanvas shape from `packages/paint/offscreen-canvas-paint`
- all created roots and configured canvas contexts clean up on unmount

MVP 2 should add:

- `ComputePass`
- `ComputePipeline`
- `Dispatch`
- transient render targets
- depth texture helper
- MSAA helper

MVP 3 should add:

- `Scene2D`
- `Sprite`
- `Rect`
- `InstancedSprites`

MVP 4 should add:

- `Scene3D`
- cameras
- mesh
- basic geometries
- shader material

## Open Questions

1. Should the first implementation use ordinary Solid components and contexts,
   or a `solid-js/universal` custom renderer from the start?

2. Should render graph JSX execute every frame by walking registered command
   objects, or should components compile into an ordered command list when
   mounted?

3. Should `Pipeline` accept TypeGPU shader functions directly, or require users
   to create pipelines manually and pass `value` in MVP 1?

4. How much resource disposal can be automatic without surprising users who
   share TypeGPU resources outside JSX?

5. Should `pixelScale` divide drawing buffer size as in current examples, or
   should the name be `resolutionScale` to make the behavior clearer?

6. Should high-level `Scene2D` and `Scene3D` live in the same package or separate
   entry points from the beginning?

## Recommended First Cut

Start with ordinary Solid components and contexts, not a custom renderer.

Reasoning:

- TypeGPU resources and passes do not map to constructor-based scene objects as
  cleanly as OGL, Pixi, or Three.
- Context registration is enough for render passes, resources, frame callbacks,
  and cleanup.
- A custom renderer can be introduced later for high-level scene objects if the
  2D or 3D layer benefits from intrinsic tags and attach inference.

First API target:

```tsx
<Canvas class="aspect-square w-full" frameloop="demand">
  <RenderPass clear={[0, 0, 0, 1]}>
    <Pipeline vertex={vertex} fragment={fragment}>
      <Draw vertexCount={3} />
    </Pipeline>
  </RenderPass>
</Canvas>
```

Then:

```tsx
<Canvas>
  <RenderPass>
    <Pipeline vertex={vertex} fragment={fragment}>
      <Uniform schema={schema} value={uniforms()}>
        {(uniform) => (
          <>
            <BindGroup layout={layout} values={{ uniforms: uniform.buffer }} />
            <Draw vertexCount={3} />
          </>
        )}
      </Uniform>
    </Pipeline>
  </RenderPass>
</Canvas>
```

This keeps the first library small, lets us port existing examples quickly, and
preserves TypeGPU's type advantages.
