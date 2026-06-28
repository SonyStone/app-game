# Example 06: Photoshop-Like App

This sketch shows what a Photoshop-like raster editor could look like on top of
SolidGPU.

The important split:

- Solid owns editor state, panels, tools, history, commands, selection state, and
  document data.
- SolidGPU owns canvas setup, GPU resources, render graph execution, compositing,
  invalidation, resize, and cleanup.
- App-specific GPU components own image-editor concepts such as layer textures,
  masks, blend modes, adjustment passes, brush accumulation, and overlays.

## App Shell

```tsx
import { WorkerCanvas } from '@app-game/solid-gpu';
import ImageRenderWorker from './image-render.worker?worker';
import {
  AdjustmentPanel,
  CanvasToolbar,
  HistoryPanel,
  LayerPanel,
  ToolOptions,
  ToolShelf,
} from './ui';
import {
  createImageDocument,
  createImageEditor,
  useCanvasPointerTools,
  useEditorShortcuts,
} from './editor';

export function PhotoshopLikeApp() {
  const document = createImageDocument({
    width: 4096,
    height: 4096,
    colorSpace: 'srgb',
    background: [1, 1, 1, 1],
  });

  const editor = createImageEditor(document);
  const pointerTools = useCanvasPointerTools(editor);

  useEditorShortcuts(editor);

  return (
    <main class="image-editor">
      <ToolShelf
        activeTool={editor.activeTool()}
        onSelectTool={editor.setActiveTool}
      />

      <section class="workspace">
        <CanvasToolbar
          zoom={editor.viewport.zoom()}
          documentName={document.name()}
          onUndo={editor.history.undo}
          onRedo={editor.history.redo}
        />

        <WorkerCanvas
          class="editor-canvas"
          worker={() => new ImageRenderWorker()}
          frameloop="demand"
          dpr={[1, 2]}
          state={{
            document: document.snapshot(),
            viewport: editor.viewport.snapshot(),
            activeTool: editor.activeTool(),
            brushStroke: editor.brush.pendingStroke(),
            selection: editor.selection.state(),
            transformPreview: editor.transform.preview(),
          }}
          onPointerDown={pointerTools.onPointerDown}
          onPointerMove={pointerTools.onPointerMove}
          onPointerUp={pointerTools.onPointerUp}
          onPointerCancel={pointerTools.onPointerCancel}
          onWheel={pointerTools.onWheel}
          fallbackRenderThread="main"
        />
      </section>

      <aside class="right-panels">
        <ToolOptions tool={editor.activeTool()} editor={editor} />
        <LayerPanel
          layers={document.layers()}
          activeLayerId={document.activeLayerId()}
          onSelectLayer={document.setActiveLayer}
          onReorderLayers={editor.commands.reorderLayers}
          onSetBlendMode={editor.commands.setLayerBlendMode}
          onSetOpacity={editor.commands.setLayerOpacity}
          onToggleVisibility={editor.commands.toggleLayerVisibility}
        />
        <AdjustmentPanel editor={editor} />
        <HistoryPanel history={editor.history.entries()} />
      </aside>
    </main>
  );
}
```

## Document Model

The document model stays outside SolidGPU. It should be serializable,
undo-friendly, and testable without a GPU.

```ts
type ImageDocument = {
  id: string;
  name: Accessor<string>;
  width: Accessor<number>;
  height: Accessor<number>;
  colorSpace: Accessor<'srgb' | 'display-p3' | 'linear-srgb'>;
  layers: Accessor<readonly ImageLayer[]>;
  activeLayerId: Accessor<LayerId | undefined>;
  setActiveLayer: (id: LayerId) => void;
};

type ImageLayer =
  | RasterLayer
  | GroupLayer
  | AdjustmentLayer
  | ShapeLayer
  | TextLayer;

type RasterLayer = {
  kind: 'raster';
  id: LayerId;
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: BlendMode;
  bitmap: ImageBitmapSource;
  mask?: LayerMask;
  transform: LayerTransform;
};
```

The GPU layer can mirror this model into textures and buffers, but the editor
should not store its primary document only inside GPU resources.

## Worker Render Entry

The app shell sends serializable state and pointer commands to a worker. The
SolidGPU render graph lives in the worker bundle.

```tsx
import {
  CanvasRoot,
  createSolidGPUWorker,
} from '@app-game/solid-gpu/worker';
import { createSignal } from 'solid-js';
import { ImageDocumentGraph } from './gpu/ImageDocumentGraph';

createSolidGPUWorker<ImageEditorWorkerMessage>((host) => {
  const [state, setState] = createSignal(host.initialState);

  host.onMessage((message) => {
    switch (message.type) {
      case 'state':
        setState(message.state);
        host.invalidate();
        break;
      case 'command':
        applyImageCommand(message.command);
        host.invalidate();
        break;
      case 'pointermove':
        updateBrushStroke(message.point);
        host.invalidate();
        break;
      case 'pointerup':
        commitBrushStroke();
        host.invalidate();
        break;
    }
  });

  return (
    <CanvasRoot canvas={host.canvas} frameloop="demand">
      <ImageDocumentGraph {...state()} />
    </CanvasRoot>
  );
});
```

## GPU Document Graph

`ImageDocumentGraph` is an app-level component built from SolidGPU primitives.
It composes all visible layers into a document texture, then displays that
texture through the viewport.

```tsx
import {
  RenderPass,
  RenderStep,
  Texture,
  TextureTarget,
  useSolidGPU,
} from '@app-game/solid-gpu';
import {
  CheckerboardBackground,
  CompositeLayerStack,
  DocumentViewport,
  SelectionOverlay,
  TransformOverlay,
} from './image-gpu';

export function ImageDocumentGraph(props: {
  document: ImageDocument;
  viewport: ViewportState;
  activeTool: ToolId;
  brushStroke?: BrushStroke;
  selection: SelectionState;
  transformPreview?: TransformPreview;
}) {
  const gpu = useSolidGPU();

  return (
    <TextureTarget
      label="document-composite"
      size={[props.document.width(), props.document.height()]}
      format="rgba16float"
      usage={['render', 'sampled', 'copy-src', 'copy-dst']}
    >
      {(documentTarget) => (
        <>
          <CompositeLayerStack
            target={documentTarget}
            layers={props.document.layers()}
            documentSize={[props.document.width(), props.document.height()]}
          />

          <BrushPreviewPass
            when={props.activeTool === 'brush'}
            target={documentTarget}
            stroke={props.brushStroke}
            selection={props.selection}
          />

          <RenderPass target="canvas" clear={[0.12, 0.12, 0.13, 1]}>
            <CheckerboardBackground viewport={props.viewport} />
            <DocumentViewport
              texture={documentTarget.view}
              documentSize={[props.document.width(), props.document.height()]}
              viewport={props.viewport}
            />
            <SelectionOverlay selection={props.selection} viewport={props.viewport} />
            <TransformOverlay preview={props.transformPreview} viewport={props.viewport} />
          </RenderPass>
        </>
      )}
    </TextureTarget>
  );
}
```

## Layer Compositing

Layer compositing is a great place for TypeGPU because layer formats, blend
inputs, masks, and adjustment uniforms can be strongly typed.

```tsx
function CompositeLayerStack(props: {
  target: TextureTargetResource;
  layers: readonly ImageLayer[];
  documentSize: readonly [number, number];
}) {
  return (
    <LayerStackTarget target={props.target} clear={[0, 0, 0, 0]}>
      <For each={props.layers.filter((layer) => layer.visible)}>
        {(layer) => (
          <LayerCompositePass
            layer={layer}
            opacity={layer.opacity}
            blendMode={layer.blendMode}
            documentSize={props.documentSize}
          />
        )}
      </For>
    </LayerStackTarget>
  );
}
```

Raster layer:

```tsx
<RasterLayerPass
  bitmap={layer.bitmap}
  transform={layer.transform}
  opacity={layer.opacity}
  blendMode={layer.blendMode}
  mask={layer.mask}
/>
```

Adjustment layer:

```tsx
<AdjustmentLayerPass
  kind="curves"
  parameters={layer.curves}
  opacity={layer.opacity}
  mask={layer.mask}
/>
```

Group layer:

```tsx
<GroupLayerPass
  layers={layer.children}
  opacity={layer.opacity}
  blendMode={layer.blendMode}
  mask={layer.mask}
/>
```

## Brush Tool

The brush tool should use an overlay/commit flow similar to the current drawing
example:

1. Pointer input samples stroke points in document coordinates.
2. A brush accumulation texture receives stamps while the stroke is active.
3. The active layer previews the brush overlay during the stroke.
4. On pointer up, the overlay composites into the active raster layer.
5. The command is pushed into history with enough data to undo or replay.

```tsx
function BrushToolGraph(props: {
  document: ImageDocument;
  activeLayer: RasterLayer;
  stroke?: BrushStroke;
  brush: BrushSettings;
  selection: SelectionState;
}) {
  return (
    <BrushAccumulator
      documentSize={[props.document.width(), props.document.height()]}
      brush={props.brush}
      stroke={props.stroke}
    >
      {(brushTexture) => (
        <>
          <BrushPreviewOverlay
            texture={brushTexture.view}
            selection={props.selection}
          />

          <CommitBrushStroke
            when={() => props.stroke?.phase === 'ended'}
            targetLayer={props.activeLayer}
            brushTexture={brushTexture}
            selection={props.selection}
          />
        </>
      )}
    </BrushAccumulator>
  );
}
```

## Selection And Masks

Selection should be represented as app state plus an optional GPU texture.

```tsx
type SelectionState =
  | { kind: 'none' }
  | { kind: 'rect'; bounds: Rect }
  | { kind: 'lasso'; points: readonly Vec2[] }
  | { kind: 'mask'; texture: SelectionMask };
```

Usage:

```tsx
<SelectionMaskTexture selection={selection()}>
  {(mask) => (
    <>
      <LayerCompositePass selectionMask={mask} />
      <SelectionOverlay selection={selection()} />
    </>
  )}
</SelectionMaskTexture>
```

## History And Commands

History should stay outside the render graph. SolidGPU should provide helper
methods for reading/writing GPU resources when a command needs pixels.

```ts
type EditorCommand =
  | {
      kind: 'paint-stroke';
      layerId: LayerId;
      bounds: Rect;
      beforePatch: PixelPatch;
      afterPatch: PixelPatch;
    }
  | {
      kind: 'set-layer-opacity';
      layerId: LayerId;
      before: number;
      after: number;
    }
  | {
      kind: 'reorder-layers';
      before: readonly LayerId[];
      after: readonly LayerId[];
    };
```

Paint command flow:

```ts
async function commitPaintStroke(stroke: BrushStroke) {
  const bounds = strokeBounds(stroke);
  const beforePatch = await gpu.readTexturePatch(activeLayer.texture, bounds);

  await gpu.run((encoder) => {
    compositeBrushStroke(encoder, activeLayer.texture, stroke.texture, bounds);
  });

  const afterPatch = await gpu.readTexturePatch(activeLayer.texture, bounds);

  history.push({
    kind: 'paint-stroke',
    layerId: activeLayer.id,
    bounds,
    beforePatch,
    afterPatch,
  });
}
```

## Full Render Order

A Photoshop-like render graph usually wants this order:

```tsx
<Canvas frameloop="demand">
  <DocumentTextures document={document} />

  <RenderStep order={0} label="sync changed layer textures" />
  <RenderStep order={10} label="rasterize shape and text layers" />
  <RenderStep order={20} label="composite visible layer stack" />
  <RenderStep order={30} label="apply brush preview" />
  <RenderStep order={40} label="draw document to viewport" />
  <RenderStep order={50} label="draw selection, guides, transform handles" />
</Canvas>
```

## What SolidGPU Owns

- WebGPU and TypeGPU initialization
- canvas sizing and DPR
- root/context cleanup
- texture, buffer, sampler, bind group, and pipeline lifetimes
- render graph order and invalidation
- low-level readback helpers for command/history workflows

## What The App Owns

- document schema and serialization
- history, undo, redo, and command merging
- layer tree operations
- tool behavior and cursor/input interpretation
- image editor semantics: blend modes, masks, selections, adjustment layer UX
- file import/export

## MVP Slice

A realistic first Photoshop-like milestone:

- one document
- raster layers only
- layer visibility, opacity, normal/multiply/screen blend modes
- brush tool with preview and commit
- rectangular selection mask
- pan and zoom viewport
- undo/redo for brush strokes and layer property changes

Later:

- adjustment layers
- layer groups
- masks
- shape and text layers
- tiled documents for very large canvases
- GPU filters
- file import/export
