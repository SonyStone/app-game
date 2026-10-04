# Composing the drawing engine

Shared modules live in `packages/paint-core`; the app keeps its own composition recipe in `src/features/engine/StudioApplication.tsx`. Studio uses this recipe in both worker mode (`src/features/engine/paint.worker.ts`) and main-thread mode (`src/features/engine/openLocalEngine.ts`). `paintRuntime.ts` (`packages/paint-core/src/paintRuntime.ts`) receives its dependencies from JSX Providers. The command queue does not choose a specific storage, renderer, or smoothing algorithm.

Public import: `@app-game/paint-core`. The recipe consists of plain Solid 2 components without DOM elements. `createPaintApplication` (`packages/paint-core/src/composition/PaintApplication.tsx`) creates a Solid root and materializes the JSX via `flatten`; this is why the same recipe runs in the worker. GPU settings are not forwarded via `postMessage`: Vite builds the recipe separately for each mode.

## Example of a different composition

This example creates a scratchpad with in-memory storage and an additional replaceable canvas. `openMemory` lives outside the component so that restarting with the same `storageName` restores the checkpoint. The data disappears when the page is closed.

```tsx
import { createSignal } from 'solid-js';
import {
  createPaintApplication,
  Document,
  Storage,
  Renderer,
  StrokeProcessor,
  BrushEngines,
  BrushResources,
  createBrushResources,
  PaintRuntime,
  CanvasTarget,
  createDocument,
  createMemoryStorage,
  createPaintRenderer,
  studioProcessors,
  roundBrushEngine,
  defaultCamera
} from '@app-game/paint-core';

const openMemory = createMemoryStorage();
const [preview, setPreview] = createSignal<HTMLCanvasElement | undefined>(undefined);
const runtime = createPaintApplication(
  (binding) => (
    <Document document={() => createDocument({ paged: true })}>
      <Storage storage={openMemory}>
        <Renderer renderer={createPaintRenderer}>
          <StrokeProcessor processors={studioProcessors} selectProcessor={(brush) => brush.stroke.mode}>
            <BrushEngines
              engines={{ round: roundBrushEngine, eraser: roundBrushEngine }}
              selectEngine={(brush) => (brush.tool === 'eraser' ? 'eraser' : 'round')}
            >
              <BrushResources resources={createBrushResources}>
                <PaintRuntime {...binding}>
                  <CanvasTarget
                    id="overview"
                    canvas={preview()}
                    camera={{ ...defaultCamera(), zoom: 0.1 }}
                    size={{ width: 240, height: 180 }}
                    dpr={1}
                  />
                </PaintRuntime>
              </BrushResources>
            </BrushEngines>
          </StrokeProcessor>
        </Renderer>
      </Storage>
    </Document>
  ),
  (event) => console.log(event),
  () => {}
);

runtime.send({
  type: 'init',
  canvas: document.createElement('canvas'),
  size: { width: 800, height: 600 },
  dpr: 1,
  storageName: 'scratchpad'
});
setPreview(document.createElement('canvas'));
// setPreview(otherCanvas) replaces the target, setPreview(undefined) detaches it.
// For a consistent shutdown: runtime.send({ type: 'dispose' }).
// runtime.terminate() only releases resources after the queue; it does not save the active stroke.
```

For durable browser storage, pass `createTileStore`. A Provider must sit above `PaintRuntime`; the order of sibling components does not determine dependencies. One `createPaintApplication` contains exactly one `PaintRuntime`.

## Algorithms and brushes

Tool actions outside a stroke are registered together with the engine via `defineBrushEngine({ ..., commands: { parse, run } })`. `parse` validates an unknown payload; `run` receives the typed command, validated settings, the renderer, and temporarily pinned resources. Sending `{ type: 'brush-command', requestId, brush, command }` uses the same queue in both modes; the response carries the same `requestId` and a `Result<void, string>`. Commands during a stroke are rejected without ending it. Such actions change tool state, but not document pixels, history, or save status. For example, ABR Mixer registers `load`, `clean`, and `{ type: 'load-canvas', point: { x, y } }` in document coordinates. Adding commands for a new engine requires no branches in the worker.

`StrokeProcessor` accepts a registry of factories and an ID selector function. An algorithm emits `Sample[]`: position, pressure, and time. None keeps the real points; Studio builds a midpoint curve; Leonardo uses a filter and a cubic curve. Dab placement belongs to the brush, so even None connects sparse events with continuous dabs without altering the trajectory through smoothing.

`BrushEngines` accepts a registry and `selectEngine(brush)`. The engine and processor are selected once at `begin`; they stay with the current stroke until `finish` or `cancel`. Registries are attached when the application starts. Selector functions may read settings, including signals in their own execution environment. In worker mode, UI settings must be sent as a command, because a main-thread signal is not available in the worker.

A custom engine implements `BrushEngine` from `contracts.ts` (`packages/paint-core/src/composition/contracts.ts`). It receives the layer, settings, processor, and renderer. `add` accepts points, `preview` updates the temporary image, `finish` returns `TileChange[]` for an atomic commit, `cancel` releases temporary state. The output type is not limited to `Dab[]`. Finished tiles are immutable; preview does not enter history or storage. Multiple engines share one cache of decoded textures through `resources`; the runtime holds the resources in use until the stroke ends.

To catch up with a stationary pen, a processor may implement `idle(elapsedMs)`, returning processed points. The engine passes them to the renderer without reprocessing and returns `true` from its own `idle` to show the result and keep the clock running, or `false` to stop it until the next input. The runtime calls this optional method in the shared queue, with at most one pending operation. Finish, cancel, device loss, and disposal stop the clock. The None processor does not provide idle and keeps raw input. The Airbrush engine may still use its own clock to accumulate paint, independently of path smoothing.

For a decoded ABR tip there is `texturedBrush`, which rasterizes coverage into Studio tiles. **Brush settings → ABR brushes…** opens the shared ABR viewer for importing and selecting a preset; it becomes a preset of the brush library, and the full preset is passed to the `abrBrush` engine, including supported dynamics and Tool Options. Currently `PaintRenderer` describes Studio's existing raster backend; there is no contract for arbitrary vector documents here.

## Typed engine settings

`defineBrushEngine` binds an ID, settings validation, and a stroke factory. The `settings` type is inferred from the result of `parse`, so no casts from `unknown` are needed inside the engine. `select` validates and copies settings on the caller side; the receiver validates them again before creating GPU state. This applies to both the local runtime and the worker. A settings error is sent as a regular `error` event, without starting a new stroke and without marking an unchanged document as dirty.

A working example of a custom profile on top of the round engine:

```tsx
import { z } from 'zod';
import { defineBrushEngine, roundBrush, BrushEngines, defaultBrush } from '@app-game/paint-core';

const inkSettings = z
  .object({
    flow: z.number().min(0).max(1),
    hardness: z.number().min(0).max(1)
  })
  .strict();

const ink = defineBrushEngine({
  id: 'ink',
  parse: (input) => inkSettings.parse(input),
  create: ({ settings, ...context }) =>
    roundBrush.engine({
      ...context,
      brush: { ...context.brush, flow: settings.flow },
      settings: { hardness: settings.hardness }
    })
});

// In the JSX recipe, around PaintRuntime:
<BrushEngines engines={{ round: roundBrush.engine, ink: ink.engine }} selectEngine={() => 'round'}>
  {/* PaintRuntime and CanvasTarget */}
</BrushEngines>;

const brush = {
  ...defaultBrush(),
  engine: ink.select({ flow: 0.5, hardness: 1 })
};
// Pass brush in a regular begin command. All subsequent samples belong to the same engine.
```

An explicit `brush.engine.id` takes precedence over `selectEngine`. Without `brush.engine`, the previous tool-based selection applies. Settings are fixed at stroke start; changes to the source object do not affect the current stroke. Unknown IDs are rejected, with no silent fallback to another engine.

The built-in `roundBrush.select({ hardness, spacing })` sets optional overrides of the current round-brush settings. Omitted or `undefined` values keep the values from `Brush`. A preset explicitly overrides these fields; a UI editing such a preset must update its `engine.settings`.

Settings must be transferable via `structuredClone`. ABR-tip and dual-tip pixels are loaded with a separate command; `begin` receives their IDs. Decoded tips are rasterized via `texturedBrush`; in the app, `src/features/abr/createAbrPresets.ts` imports a preset chosen in the ABR viewer into the brush library, and `src/features/brush-library/createPresetUploads.ts` uploads its resources.

## Brush resources

`BrushResources` sets the cache factory in JSX. Each runtime needs its own instance. In Studio the default is `createBrushResources` with limits of 64 MiB of decoded pixels and 4096 entries. Other compositions can set a budget:

```tsx
<BrushResources resources={() => createBrushResources({ maxBytes: 32 * 1024 * 1024 })}>
  <PaintRuntime {...binding} />
</BrushResources>
```

The protocol is the same on the main thread and in the worker. Load a tip in advance, for example when a preset is selected:

```ts
runtime.send({
  type: 'brush-resources',
  requestId: 'load-tip-1',
  action: 'put',
  resource: {
    id: 'tip:my-brush:v1',
    width: 2,
    height: 2,
    format: 'r8unorm',
    pixels: new Uint8Array([0, 128, 128, 255])
  }
});
```

The event handler receives `brush-resources` with the same `requestId` and a typed `result`. When `result.ok`, `value.stats` and `value.evicted` are available. On failure, `error: string` is available. Wait for a successful load before starting a stroke. The sender must account for `evicted` and keep the source for reloading. `action: 'stats'` returns bytes, entry count, and pinned bytes. `action: 'delete', id` removes an unused resource. These commands do not change the document and do not trigger autosave.

The engine obtains pixels via `resources.get(settings.tipId)`. Resolve all required IDs at the start of the factory, before creating GPU state. A missing resource raises an explicit error. `get` pins the entry until the stroke ends; repeated accesses and subsequent strokes use the same pixels without copying. Do not mutate or transfer the borrowed buffer. A copy is made once when a load is accepted. The transport additionally copies data according to the rules of `postMessage` / the local endpoint.

The LRU evicts only unused entries. A duplicate ID is rejected: a new texture version must have a new ID. An invalid format, size, buffer length, or budget overrun leaves the existing cache unchanged. `r8unorm` stores coverage: 0 means transparent, 255 fully opaque. Sizes from 1 to 16384 per side are supported within the budget. Color RGBA patterns are not yet part of this format.

The runtime releases resource pins after `finish`, `cancel`, a factory/input/finish error, and device loss. A cancel failure keeps both errors in an `AggregateError`. Runtime shutdown cancels the active stroke and releases the cache. Document import and renderer recovery keep the resources of the selected brushes. Switching main/worker creates a different runtime. `createPaintEngine` (`src/features/engine/createPaintEngine.ts`) waits for the selected preset to be re-uploaded through its `prepare` hook (`createAbrPresets.restore()`) before enabling input.

This is a cache of decoded CPU pixels. A separate GPU cache in `gpu/texturedStamps.ts` (`packages/paint-core/src/gpu/texturedStamps.ts`) serves `texturedBrush` rasterization. Brush resources are not written to `.paint` or the document's IndexedDB; the saved drawing already contains raster tiles. The UI keeps the source pixels of the applied preset until page reload and re-uploads them when the runtime changes. There is no persistent library storage yet.

## Textured BrushEngine

`texturedBrush` is registered in Studio's production recipe and is available to other JSX compositions:

```tsx
<BrushEngines engines={{ round: roundBrush.engine, textured: texturedBrush.engine }} selectEngine={() => 'round'}>
  {/* BrushResources and PaintRuntime */}
</BrushEngines>
```

After the resource loads successfully, select it for a stroke:

```ts
const brush = {
  ...defaultBrush(),
  size: 128,
  engine: texturedBrush.select({ tipId: 'tip:my-brush:v1', angle: Math.PI / 4, spacing: 0.08 })
};
runtime.send({ type: 'begin', brush, samples: [{ x: 0, y: 0, pressure: 0.5, time: performance.now() }] });
// Then regular samples and end. tool: 'eraser' uses the same tip for erasing.
```

`size` sets the length of the longer side; proportions come from the texture. `angle` is a clockwise rotation in radians, 0 by default; `spacing` optionally overrides the Brush setting. Tip coverage replaces `hardness`. Input smoothing, pressure, flow, opacity, and color blending remain shared with Studio. Dabs use the circumscribed circle for tile lookup, so rotated rectangular corners are not clipped.

The read-only entry point `@app-game/abr-parser/reader` of the shared ABR-viewer parser returns a `brushTip` with `width`, `height`, `data`. For the load command, pass `pixels: brushTip.data`, `format: 'r8unorm'`, and your own versioned ID. `data` is already normalized to 8-bit coverage, even if the source ABR `depth` is 16. Studio does not import ABR-viewer application code: the QA test host passes the shared parser's result through this same contract.

The GPU cache is created on the first textured stroke. The texture, mip levels, and bind group are reused across strokes and canvases of one renderer. The limit is 64 MiB including mip levels and 256 entries; eviction happens between strokes. Resource identity, not the string ID, determines reloading: a new resource after deleting the old ID will not receive a stale GPU texture. The GPU cache does not pin CPU buffers. Renderer loss releases GPU copies; the next stroke uploads them from the surviving CPU cache.

Current support covers grayscale tips, constant rotation, proportions, and basic stroke settings. Scattering, angle/roundness dynamics, dual brush, patterns, wet edges, and full Photoshop reproduction are not yet wired up. In Studio's regular UI the round brush is selected by default. After import you can pick a tip with a thumbnail, change size, flow, opacity, and spacing, or return to Soft round.

## ABR import in Studio

**Brush settings → ABR brushes…** opens `src/features/abr/AbrViewerDialog.tsx`. The dialog lazily loads the real `App` from `@app-game/abr-viewer/editor`. The `onUseBrush` export allows embedding the editor in another host without the viewer depending on Paint. The **Use in Paint** button passes the current edited preset; a host error is shown in the viewer status. Closing the dialog keeps its workspace and edits until Studio unmounts. The native dialog isolates focus and keyboard shortcuts from drawing. Hidden preview canvases are paused by the viewer's existing IntersectionObserver.

`@app-game/abr-paint/preset` creates a snapshot of the full preset and its resources for `abrBrush`. The shared library `packages/abr-brush` is also used by the viewer: settings, dynamics, smoothing, procedural tips, and coverage effects. Paint applies size up to 5000 px, spacing up to 1000%, roundness/flips, scatter, transfer, color dynamics, texture, and dual tip. Flow/Opacity, blend mode, and pressure overrides come from the saved tool options. None bypasses the preset's smoothing. Detailed limitations and Photoshop comparison status: [ABR painting engine](../../../packages/abr-paint/README.md). A single tip is limited to 8192 px / 32 MiB; the whole preset to 48 MiB CPU / 64 MiB GPU with mipmaps.

A preset is applied only after `brush-resources` confirmation (`createPresetUploads`). Imported presets are stored in the brush library with their resources, so the chosen preset survives a reload; the brush and the eraser keep separate presets (`src/features/brush/createBrushTools.ts`). When switching main/worker, all resources of the selected preset are loaded before input is enabled. A waiting upload times out after 30 seconds; the request stays outstanding until a response or disconnect, because the timeout does not cancel the sent command, and a retry of the same resource joins it instead of posting a duplicate (`src/features/engine/createEngineRequests.ts`). Successful responses update residency, accounting for evictions.

`.abr` files are imported in the embedded ABR viewer workspace (`src/features/abr/AbrViewerDialog.tsx`); the former compact tip-only importer was removed because no screen rendered it.

The viewer keeps its own library and edits in its own IndexedDB workspace; presets used in Paint are copied into Paint's brush library. The `.paint` document and autosave contain raster strokes, not brushes. To share preset changes, use Export in the ABR viewer. The standalone Paint production build includes UnoCSS and the viewer's preview worker; built-in example files are fetched only when an example is selected.

## Canvas and resources

`CanvasTarget` (`packages/paint-core/src/composition/CanvasTarget.tsx`) reads `canvas`, `camera`, `size`, `dpr` reactively. The ID is fixed when the component is created; to change the ID, remount the component. Removing the component detaches the target. The ID `main` replaces the primary canvas, the editing camera, and the PNG export target. Other IDs create additional views of the same document.

Replacement goes through the runtime queue after the current GPU call. It is not a page reload and not a renderer restart. One physical canvas can belong to only one target. The viewport description is copied; the canvas itself keeps its identity. Additional targets are rendered before the primary one, so that export and diagnostics refer to the editing view.

Targets share the device, tile cache, raster pipelines, and readback. Each keeps its own viewport textures and fallback. Each target tracks changed tiles independently. Switching between views preserves their finished image: recomposition runs only in the changed area and is skipped for off-frame changes. A frame version prevents losing an update that arrives while waiting on the GPU or tile loading. After 4096 distinct accumulated tiles, the list is replaced by a full-redraw flag so as not to hold unbounded history for a hidden view. Camera changes, layer parameter changes, document reset, and VT coverage updates may still require a full refresh. Additional full-size views increase GPU memory and frame time. Use small sizes for an overview. `releaseTarget` frees the resources of a detached target.

HTMLCanvasElement works on the main thread. An OffscreenCanvas must belong to the environment where the renderer runs: it can be transferred to a worker once. Signals manage objects that are already available; they do not override browser rules for canvas ownership and transfer. The main/worker switch takes a checkpoint with `includeTools: true`, replaces the DOM canvas, and runs the recipe in the other environment without reloading the page. `checkpointed.tools` contains the versioned tool state of the raster renderer; it is passed in `init.tools` before input is enabled. Mixer keeps the reservoir, picked-up paint, the Auto Load sample, and the remaining load. Three textures are copied losslessly as rgba16float, 1.5 MiB in total. A read error does not permit destroying the old renderer. Regular autosave and `.paint` do not contain this transient state; recovery after a sudden GPU loss does not guarantee it.

## Storage and multiplayer

`PaintStorage` stores immutable versions of high-res tiles, derived low-res tiles, and a consistent document checkpoint. `collect` must keep the versions from the checkpoint and the passed undo/redo references. The contract and error results are described in `contracts.ts` (`packages/paint-core/src/composition/contracts.ts`) and [maintenance](./maintenance.md). There are two adapters: IndexedDB and memory. NativeStorage can be plugged in through the same Provider, provided it keeps these guarantees.

Multiplayer requires a separate document operations protocol: ordering of strokes and layer edits, conflicts, undo authorship, and network synchronization. It cannot be implemented correctly by merely replacing storage. The raster document and the ordered runtime remain the place where agreed operations are applied.

## Checks

Unit tests referenced below by bare file name are in `apps/paint/src/composition/`.

- `src/features/abr/createAbrPresets.test.tsx` and `src/features/engine/createEngineRequests.test.ts`: upload confirmation before selection, restore on a replacement engine, errors, late response, timeout without duplicate uploads, and disposal.
- `PaintApplication.test.tsx`: engine/processor selection at the stroke boundary, signals for replacing and removing targets, unknown ID.
- `packages/abr-paint/src/resources.test.ts`: budget, LRU, and atomicity of cache errors; `brushResources.test.ts`: resource release on engine failure.
- `memoryStorage.test.ts`: isolation, immutable snapshots, restore, atomic failure, undo preservation during collect.
- QA **Check textured brushes**: a real ABR tip, transparency, proportions, rotation, preview/commit, tile corners, cancel, undo/redo, erasing, GPU LRU, and renderer recovery.
- QA **Check canvas targets**: real GPU pixels for two sizes and cameras, HTML/offscreen replacement, detach/reattach, undo/redo; independent partial updates, preview removal, and cancel/commit are compared with a full redraw with VT enabled and disabled.
- QA **Check execution modes**, **Run worker checks**, **Check readback queue**, **Check stroke filtering**: the existing Studio checks are kept.

## Document features

A feature module that owns document data is defined with `defineDocumentFeature` (`packages/paint-core/src/composition/documentFeature.ts`) and installed in the recipe with `<DocumentFeatures features={[...]}>`; the provider is optional. A feature declares its data (`parse`, `initial`), optional commands that change it (`commands.parse`, `commands.apply`) and an optional `decorateStroke` that wraps the renderer of one stroke. The runtime has no feature-specific code:

- data is stored with the document under `features[id]`, in IndexedDB checkpoints and `.paint` files, so it must survive JSON;
- `{ type: 'feature', feature, command }` changes the data: it ends the stroke in progress and marks the document unsaved, without an undo step; a command for a feature the runtime does not have fails with an error event;
- `state` and `restored` events report the data of the runtime's features as `features`; the UI reads one with the feature's `read`, and builds commands with its `command`;
- data of features the runtime does not have is saved back unchanged, so a build without a feature does not lose it; stored data a feature cannot parse is replaced by its initial data.

Paint Studio installs `symmetryFeature`. `paintRuntime.test.ts` checks commands, reporting and the preservation of data across runtimes with and without the feature.

A feature module that edits pixels is defined with `defineDocumentEdit` (`packages/paint-core/src/composition/documentEdit.ts`) and installed with `<DocumentFeatures edits={[...]}>`. Its `run` reads the layers and their tiles (`readTile` loads paged tiles) and returns tile changes, optionally with a new layer; the runtime ends the stroke in progress, commits the changes as one undo step, updates the renderer, marks the document unsaved and prepares overviews. Commands are `{ type: 'edit', edit, command }`, built with the edit's `command`; a thrown error leaves the document unchanged and is reported as an error event. Edits run in the engine's realm and must not use the DOM. Paint Studio installs `placeImageEdit` (`packages/paint-core/src/composition/placeImageEdit.ts`, formerly the built-in `place-image` command).

## Document symmetry

`packages/paint-core/src/symmetry.ts` stores and validates symmetry axes; `symmetryFeature` (`packages/paint-core/src/composition/symmetryFeature.ts`) makes them a document feature. `symmetryRenderer.ts` (`packages/paint-core/src/composition/symmetryRenderer.ts`) wraps the borrowed renderer for one stroke and transforms dabs after the BrushEngine. Copies share one transaction, opacity, and Undo; for ABR, the coordinates and mask orientation change. Background textures stay in document coordinates. No additional GPU resources are used.

Axis settings are sent as the `symmetry` feature's command and stored as its data in the checkpoint/document file; files saved before document features keep them in a top-level `symmetry` field, which is read as the feature's data. `createSymmetry` (`src/features/symmetry/createSymmetry.ts`), the feature's UI half, provides reactive `symmetry`, `canUpdate`, and an `update` command that returns false while commands are suspended. Old files open with Off. Currently the runtime allows symmetry for the regular round brush and ABR Brush/Pencil/Eraser; third-party engines and retouch are not wired up. An extensible declaration of this capability on BrushEngine remains a separate task.
