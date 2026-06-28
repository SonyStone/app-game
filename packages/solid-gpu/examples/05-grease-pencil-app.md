# Example 05: Grease Pencil App

This sketch maps `apps/grease-pencil-typegpu` onto SolidGPU.

The current app has a mature editor model:

- document state, layers, materials, frames, onion skin, and workplane
- interaction modes for draw, erase, stroke selection, and point selection
- stroke tessellation and mesh building
- camera navigation and workplane projection
- a `GreaseRenderer` class that owns WebGPU setup and rendering

SolidGPU should not replace the document/editor model. It should take over the
renderer setup, canvas lifecycle, resize, depth texture lifecycle, frame loop,
and resource disposal.

For the standalone app, the preferred production shape is an OffscreenCanvas
worker so camera updates, tessellation, buffer writes, and rendering do not
compete with panels and pointer handling on the main thread. The single-file
snippets below are the readable form; see
[`07-offscreen-worker.md`](./07-offscreen-worker.md) for the thread split.

## App Shell

```tsx
import { Canvas } from '@app-game/solid-gpu';
import { AppSidebar } from './app/AppSidebar';
import { AppToolbar } from './app/AppToolbar';
import { useDocumentSession } from './app/useDocumentSession';
import { useSelectionShortcuts } from './app/useSelectionShortcuts';
import { useCanvasInteraction } from './features/interaction/useCanvasInteraction';
import { GreaseScene } from './render/GreaseScene';

export function GreasePencilApp() {
  const [mode, setMode] = createSignal<ToolMode>('draw');
  const session = useDocumentSession(mode);
  const camera = createDefaultCamera();

  let rendererApi!: GreaseRendererApi;
  const interaction = useCanvasInteraction({
    canvas: () => rendererApi.canvas,
    renderer: () => rendererApi,
    mode,
    activeLayer: session.activeLayer,
    activeDrawing: session.activeDrawing,
    activeMaterial: session.activeMaterial,
    currentFrame: () => session.documentState().currentFrame,
    draftStroke: session.draftStroke,
    setDraftStroke: session.setDraftStroke,
    selectedStrokeIds: session.selectedStrokeIds,
    setSelectedStrokeIds: session.setSelectedStrokeIds,
    selectedPointKeys: session.selectedPointKeys,
    setSelectedPointKeys: session.setSelectedPointKeys,
    setDocumentState: session.setDocumentState,
  });

  useSelectionShortcuts({
    deleteSelectedPoints: interaction.deleteSelectedPoints,
    deleteSelectedStrokes: interaction.deleteSelectedStrokes,
    selectedPointKeys: session.selectedPointKeys,
    selectedStrokeIds: session.selectedStrokeIds,
  });

  return (
    <main class="grease-pencil-root">
      <AppToolbar mode={mode()} onSetMode={setMode} updateDocument={session.updateDocument} />

      <section class="workspace">
        <Canvas
          class="h-full w-full touch-none"
          frameloop="demand"
          dpr={[1, 2]}
          onPointerDown={interaction.onPointerDown}
          onPointerMove={interaction.onPointerMove}
          onPointerUp={interaction.onPointerUp}
          onPointerCancel={interaction.onPointerUp}
          onWheel={(event) => {
            event.preventDefault();
            rendererApi.zoom(event.deltaY);
          }}
          onCreated={(state) => {
            rendererApi = createGreaseRendererApi(
              state,
              camera,
              () => session.workplane(),
            );
          }}
        >
          <GreaseScene
            camera={camera}
            draftStroke={session.draftStroke()}
            pointOverlays={session.pointOverlays()}
            renderLayers={session.renderLayers()}
            selectedStrokeIds={session.selectedStrokeIds()}
            workplane={session.workplane()}
          />
        </Canvas>

        <AppSidebar
          activeLayerId={session.documentState().activeLayerId}
          activeMaterial={session.activeMaterial()}
          activeMaterialId={session.documentState().activeMaterialId}
          layersTopFirst={session.layersTopFirst()}
          materials={session.materials()}
          onionSkin={session.onionSkin()}
          updateDocument={session.updateDocument}
          workplane={session.workplane()}
        />
      </section>
    </main>
  );
}
```

## Grease Scene

```tsx
import {
  Buffer,
  BindGroup,
  DepthTexture,
  Draw,
  Pipeline,
  RenderPass,
  Uniform,
  VertexBuffer,
  useSolidGPU,
} from '@app-game/solid-gpu';
import { createMemo } from 'solid-js';
import tgpu, { d } from 'typegpu';
import { cameraViewProjection } from './viewportCamera';
import {
  buildRendererSceneVertices,
  createRendererScene,
  updateRendererScene,
} from './rendererScene';

const cameraSchema = d.struct({
  viewProjection: d.mat4x4f,
});

const cameraLayout = tgpu.bindGroupLayout({
  camera: { uniform: cameraSchema },
});

export function GreaseScene(props: GreaseSceneProps) {
  const gpu = useSolidGPU();
  const scene = createMemo(() =>
    updateRendererScene(
      createRendererScene(),
      props.renderLayers,
      props.workplane,
      props.draftStroke,
      props.selectedStrokeIds,
      props.pointOverlays,
    ),
  );

  const vertices = createMemo(() => buildRendererSceneVertices(scene()));
  const vertexCount = createMemo(() => vertices().length / FLOATS_PER_VERTEX);

  return (
    <DepthTexture format="depth24plus">
      {(depth) => (
        <Uniform
          schema={cameraSchema}
          value={{
            viewProjection: cameraViewProjection(
              props.camera,
              gpu.drawingBufferSize().width / gpu.drawingBufferSize().height,
            ),
          }}
        >
          {(cameraUniform) => (
            <Buffer
              layout={drawingVertexLayout}
              value={vertices()}
              usage={['vertex']}
            >
              {(vertexBuffer) => (
                <RenderPass
                  clear={[0.93, 0.9, 0.84, 1]}
                  depth={{ texture: depth, clearValue: 1 }}
                >
                  <Pipeline
                    vertex={drawingVertex}
                    fragment={drawingFragment}
                    primitive={{ topology: 'triangle-list', cullMode: 'none' }}
                  >
                    <BindGroup
                      layout={cameraLayout}
                      values={{ camera: cameraUniform.buffer }}
                    />
                    <VertexBuffer slot={0} value={vertexBuffer} />
                    <Draw vertexCount={vertexCount()} />
                  </Pipeline>
                </RenderPass>
              )}
            </Buffer>
          )}
        </Uniform>
      )}
    </DepthTexture>
  );
}
```

## Renderer API Bridge

The interaction code currently expects methods like `zoom`, `screenToWorld`,
`offsetFromWorkplane`, and selection helpers. SolidGPU can expose the canvas and
root state, while the app keeps the domain camera math.

```ts
type GreaseRendererApi = {
  canvas: HTMLCanvasElement;
  camera: CameraState;
  zoom: (delta: number) => void;
  orbit: (deltaX: number, deltaY: number) => void;
  pan: (deltaX: number, deltaY: number) => void;
  screenToWorld: (clientX: number, clientY: number) => Vec3 | undefined;
  offsetFromWorkplane: (position: Vec3, distance: number) => Vec3;
};

function createGreaseRendererApi(
  state: SolidGPUState,
  camera: CameraState,
  currentWorkplane: Accessor<DrawingWorkplane>,
): GreaseRendererApi {
  return {
    canvas: state.canvas,
    camera,
    zoom(delta) {
      zoomCamera(camera, delta);
      state.invalidate();
    },
    orbit(deltaX, deltaY) {
      orbitCamera(camera, deltaX, deltaY);
      state.invalidate();
    },
    pan(deltaX, deltaY) {
      panCamera(camera, deltaX, deltaY);
      state.invalidate();
    },
    screenToWorld(clientX, clientY) {
      return screenToWorkplane(
        state.canvas,
        camera,
        currentWorkplane(),
        state.drawingBufferSize().width,
        state.drawingBufferSize().height,
        clientX,
        clientY,
      );
    },
    offsetFromWorkplane(position, distance) {
      return offsetFromWorkplane(currentWorkplane(), position, distance);
    },
  };
}
```

## What SolidGPU Owns

- TypeGPU root/device and canvas context
- preferred format and context configuration
- DPR and resize behavior
- depth texture lifetime
- render pass encoding
- buffer resizing and cleanup
- invalidation

## What Grease Pencil Still Owns

- document model
- timeline, layers, materials, onion skin
- stroke tessellation
- camera math and workplane projection
- selection and hit testing
- editor UI

## Open Questions

- Should SolidGPU expose a generic `CameraController`, or should grease-pencil
  keep its camera fully app-local?
- Should `VertexBuffer` diff and partially update large buffers, or simply
  rewrite for MVP?
- Should depth textures be automatic for `Scene3D`, but explicit for custom
  render graphs like grease-pencil?
