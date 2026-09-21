# GPU text rendering

The viewer uses TypeGPU/WebGPU exclusively. Unsupported browsers and GPU failures display an error. It renders the bundled 1,273-page document with 2,675,369 glyph instances. The source data is preprocessed; this demo does not parse arbitrary PDF files.

## Running and integration

This workspace app runs on its own and is also lazy-loaded by `apps/web` at `/gpu-text-rendering`. The web host imports `@app-game/gpu-text-rendering` through the package export; it does not import private files. Both builds compile the same Solid and TypeGPU source.

From the repository root:

```sh
pnpm --filter @app-game/gpu-text-rendering dev
```

Open `http://localhost:3180/`. For the web host, use `pnpm dev` and open `http://localhost:3120/gpu-text-rendering`.

`src/main.tsx`, `index.html` and `standalone.css` belong only to the standalone entry. Importing the package in another application does not mount it or apply the standalone document styles. Document assets are imported with `?url`, so Vite owns their URLs in both builds. The app has its own dependencies, TypeScript configuration, unit tests and browser checks.

## Feature structure

```text
src/
  features/
    viewer/              UI, toolbar state and the complete viewer composition
    document/            Bundled document loading, decoding and page layout
      assets/            Source BMP containers and page metadata
      rendering/         Document GPU resources, shaders, preparation and drawing
    camera/              Camera math, pointer controls, tour and coordinate spaces
    scene/               Frame scheduling, JSX layers and shared pass submission
    viewport/            Canvas measurements, DPR and pixel conversions
    graphics/            Independent graphics, currently Rectangle
  shared/
    gpu/                 Device/root and canvas lifetimes, owned resource cleanup
    jsx/                 Token-preserving Solid context support
    errors.ts            Shared typed error contract
  main.tsx               Standalone entry
  standalone.css         Standalone document styles
tests/
  browser/               Real GPU composition, gesture and rendering checks
  fixtures/              GPU doubles shared by feature tests
```

Unit tests live beside the feature they exercise. Browser fixtures remain outside `src` and are not exported by the package. No general `components`, `utils` or document-specific top-level `gpu` directory is needed.

- Start with `features/viewer/GpuTextRendering.tsx` for the UI, or `features/viewer/DocumentViewer.tsx` for the full JSX composition. The viewer owns loading and connects ready GPU resources to the document, camera and scene.
- `features/document/document.ts` exposes decoded data independent of the GPU. `rendering/DocumentRendererProvider.tsx` owns a prepared document's lifetime. `rendering/createTypeGpuRenderer.ts` remains usable outside Solid; buffers, shaders and batched draw commands are private to document rendering.
- `features/camera` owns navigation and projection. Controls request frames after interaction; the tour owns its animation subscription. Camera motion does not require UI state updates.
- `features/scene` owns one frame loop and one shared color pass for all graphics. It does not load documents or allocate their buffers. `resolveSceneChildren.ts` resolves render callbacks while preserving reactive lists and context ownership.
- `features/viewport` measures the canvas and bounds its framebuffer. `features/graphics/Rectangle.tsx` demonstrates adding a drawable without modifying the document renderer.
- `shared/gpu` owns the device and configured canvas; feature renderers borrow them. `shared/jsx/TokenContext.tsx` preserves draw tokens through native Solid context ownership. Shared implementation imports no feature modules.

Keep feature-specific shaders, styles and tests with their feature. Move code into `shared` only when it represents infrastructure used by multiple features. The public package export is the viewer component; internal feature files do not need barrel re-exports.

## Composing JSX graphics

A document is one drawable in the scene. Add siblings without changing the document renderer:

```tsx
<Viewport maxDpr={2}>
  <FrameLoop onError={handleError}>
    {(loop) => (
      <DocumentCamera>
        <CameraControls pageAspect={pageAspect} />
        <CameraTour document={document} enabled={autoZoom()} />

        <DocumentSpace pageAspect={pageAspect}>
          <DocumentRendererProvider
            document={document}
            error={(error) => {
              loop.fail(error);
              return null;
            }}
          >
            {() => {
              const draw = createDocumentDraw();

              return <RenderLayer draw={draw} visible={documentVisible()} />;
            }}
          </DocumentRendererProvider>

          <For each={annotations()} keyed={(annotation) => annotation.id}>
            {(annotation) => (
              <Rectangle
                x={annotation().x}
                y={annotation().y}
                width={annotation().width}
                height={annotation().height}
                color={[1, 0.8, 0, 0.3]}
                visible={annotationsVisible()}
                order={10}
              />
            )}
          </For>
        </DocumentSpace>

        <ScreenSpace>
          <Rectangle x={20} y={20} width={40} height={40} color={[0, 0, 1, 1]} />
        </ScreenSpace>
      </DocumentCamera>
    )}
  </FrameLoop>
</Viewport>
```

This subtree needs `TypeGPURootProvider` and `GpuCanvasProvider` above it. DOM UI belongs outside `FrameLoop`. CSS must give the canvas a display size independent of its width/height attributes.

`FrameLoop` accepts JSX or `(loop) => JSX`. `DocumentRendererProvider` accepts JSX or a function receiving `{ document, renderer }` beneath its ready context. `resolveSceneChildren` keeps zero-argument reactive JSX accessors reactive and evaluates them with their provider owner; it also preserves single draw tokens. This matters for a single `<For>` child whose items reorder. Composition functions do not run per frame.

Call `createDocumentDraw()` once per prepared document. It reads the document camera and the shared viewport and creates a stable draw function. Pass option accessors, for example `createDocumentDraw({ vectorOnly: viewer.vectorOnly, grids: viewer.grids })`. The viewer explicitly declares its `RenderLayer`. GPU buffers and pipelines belong to `DocumentRendererProvider`.

`RenderLayer.visible`, default true, skips drawing without unmounting its owner or releasing buffers. Use `<Show>` around the owning component/provider when removal should release its resources. Hiding the last visible layer clears the canvas once. A hidden layer keeps its position in JSX and returns to that position when shown.

Layers draw in ascending `order`, default 0. Equal values follow JSX order, including asynchronous children. For object lists, Solid 2's `<For keyed={(item) => item.id}>` preserves each owner's GPU resources while replacing object values or reordering ids. Its child receives an item accessor. This is built into the installed Solid version, so no additional `keyed` package is needed.

### Coordinates and viewport

`useViewport().size()` exposes `{ css, pixels, dpr }`. The DPR cap defaults to 2 and is reactive; the GPU texture dimension limit can lower it further. CSS size is measured on resize rather than on every frame. Resolution media queries track DPR changes, including moving the window between displays. `clientToScreen`, `screenToPixel`, `pixelToScreen` and `screenToClip` centralize conversions. Pointer positioning reads the current canvas bounding rect so scrolling does not leave a stale origin.

`DocumentSpace` uses `DocumentCamera` and the first page's width/height ratio. Coordinates match document rendering, with y increasing upwards. `ScreenSpace` uses CSS pixels with y increasing downwards; its graphics keep their displayed size when the camera or DPR changes. Nested spaces replace the coordinate system rather than multiplying transforms. These components preserve JSX draw order and do not create GPU passes.

`useSceneSpace()` provides `toScreen`, `fromScreen` and `toClip` for new graphics and future hit testing. Read them during drawing because camera values mutate between frames. `Rectangle` projects its corners with this contract, allowing the same shader to draw in either space. The document renderer remains specialized to the document camera; pass the same page aspect to its controls and `DocumentSpace`. Fractional framebuffer rounding does not change the CSS projection.

### Animation and lifetime

```tsx
useFrame(
  ({ delta }) => {
    camera.rotation += speed() * delta;
  },
  { phase: 'update', enabled: spinning, continuous: true }
);
```

`enabled` is an accessor and defaults to true. `continuous` defaults to false and is fixed for the subscription. Enabled continuous subscriptions keep one shared RAF loop alive independently; disabling or disposing one does not stop another. Updates precede render callbacks, then the shared GPU pass runs. Both callback phases are synchronous and precede GPU draws. `FrameLoop.continuous` remains an optional scene-wide override.

Callbacks receive `{ timestamp, delta, time }`. `timestamp` is the raw RAF clock in milliseconds. `delta` and `time` use seconds; `time` advances only during active frame sequences. The first frame after idle or tab resume has zero delta. Long stalls cap delta at 100 ms. Hidden pages pause presentation and animation time, retain pending invalidations, and redraw when visible. `CameraTour` uses active time so it does not jump after switching tabs.

To add a graphic, own its TypeGPU resources in a Solid component and return `<RenderLayer draw={...} />`. Draw callbacks receive `{ pass, timestamp, width, height }`, where dimensions are framebuffer pixels. Record draws with `pipeline.with(pass).draw(...)`; the loop owns clearing, ending the pass and submitting. Draw callbacks can return typed errors. Exceptions from frame callbacks are also normalized into a typed render error and stop the loop.

Create resources once and release them on owner cleanup and GPU cancellation, as `Rectangle` does. Invalidate when graphic props change. `FrameLoop` observes token insertion, removal, visibility, order and draw-prop replacement. Mutations read only inside a draw callback need explicit invalidation.

Keep DOM UI outside the scene-only subtree. Use `TokenContext` for additional fixed scene contexts: ordinary providers flatten children and execute token fallbacks. `TokenContext` retains provider ownership while preserving tokens. Remount it to replace its value.

Picking, arbitrary nested transforms, depth attachments, postprocessing and retained-image partial redraw are future work. Pages and glyphs remain batched GPU draws rather than individual JSX components.

## Data conventions

The original packed data and six vertices per glyph are retained. BMP files are binary containers for the demo, not all ordinary pixel images. The renderer uses roughly 189.2 MiB of explicit GPU buffers and textures for the bundled document, excluding driver overhead and the swapchain.

WebGPU render-target coordinates run top-to-bottom. The raster atlas uses unflipped sampling coordinates; the coverage integral negates `dpdy` to preserve the original algorithm's handedness. Derivatives run before pixel-dependent branches. Explicit texture LOD avoids derivative-uniformity violations. Curve metadata uses exact `textureLoad` reads, and ten-byte image records are padded to WebGPU's twelve-byte vertex stride.

Instanced glyph geometry, streaming, a new document format and Rust/WASM conversion are future work.

## Typed errors

GPU initialization publishes a discriminated `GpuRootState`: `loading`, `ready` or `error`. Providers select JSX branches and pass only ready resources through context. Browser/TypeGPU initialization exceptions are normalized at one Promise rejection boundary; expected capability failures update typed state directly. Device loss and uncaptured GPU errors update the same state even while rendering is idle.

Document loading and renderer preparation retain `neverthrow` results; frame submission returns a synchronous `Result`. These imperative APIs remain usable outside JSX. There is no custom Result implementation. A missing context provider is a programming error handled by Solid's context API, separate from expected GPU failures.

`errors.ts` defines discriminated errors for document transport/decoding, GPU capability/validation/device loss and cancellation. Stable `kind` and `code` fields support programmatic handling; `message` is for display and `cause` preserves external diagnostics. Fullscreen failures have their own type and do not invalidate the renderer.

`Result.fromThrowable` and `ResultAsync.fromThrowable` capture exceptions at the remaining browser/TypeGPU boundaries. Expected validation failures return `err(...)` directly. Cancellation returns `AbortedError`, never an error message from a rejected fetch. Partial initialization still releases devices and bitmaps. The Solid viewer retains the typed error in its error state.

## Verification

From the repository root:

```sh
pnpm --filter @app-game/gpu-text-rendering test
pnpm --filter @app-game/gpu-text-rendering typecheck
pnpm --filter @app-game/gpu-text-rendering build
pnpm --filter @app-game/web typecheck
pnpm build
```

With the standalone dev server running and Playwright Chromium installed:

```sh
pnpm --filter @app-game/gpu-text-rendering test:browser
```

Scene and rendering checks import test fixtures from the standalone dev server. To check the integrated web route against the running main web server:

```sh
GPU_TEXT_URL=http://localhost:3120 GPU_TEXT_PATH=/gpu-text-rendering node apps/gpu-text-rendering/tests/browser/controls.browser.mjs
```

Unit tests cover camera anchors, pointer continuity/cancellation, binary decoding, page culling, reactive options, JSX ordering after late mounts and keyed list reordering, draw-prop replacement, hidden-layer resource retention, stable object ids, independent animation subscriptions, hidden-tab pause/resume, viewport/DPR changes, invalidation coalescing, callback unsubscription, JSX provider replacement and asynchronous resource ownership. Ownership checks include late devices, stale failures, independent canvas disposal, partially prepared documents, document-only cancellation and balanced validation scopes. Browser checks cover gestures, options, resizing, idle device loss, loading errors and unavailable WebGPU. The scene check also mounts a document after sibling graphics with equal layer order, checks JSX order, changes layer order and rectangle props, verifies pixels, removes graphics/documents independently, checks buffer disposal and keeps camera controls working without a document. It also verifies document-space rectangles under camera rotation, CSS-sized screen graphics at DPR 3 with a cap of 2, reactive DPR limits, and stable-id resource reuse.

The rendering check captures overview, page, close text, rotation, debug grids, 1,185 visible pages and a synthetic translucent image. It rejects empty renders and records resource usage, submission time and synchronized completion latency. Set `GPU_TEXT_URL` to use another server and `GPU_TEXT_OUTPUT` to choose an artifact directory. The default directory is `gpu-text-rendering` inside the OS temporary directory. Set `GPU_TEXT_BASELINE` to an earlier artifact directory to compare pixels as well.

Chromium test processes enable WebGPU and select Metal on macOS. The app itself uses normal browser capability checks. All seven images matched the pre-refactor TypeGPU captures exactly on the local Apple Metal adapter. Native touch hardware and other GPU vendors have not been verified.
