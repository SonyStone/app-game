# GPU text rendering

The viewer uses TypeGPU/WebGPU exclusively. Unsupported browsers and GPU failures display an error. Startup loads the complete 1,273-page, 2,675,369-glyph demo. GDOC decoding and PDF import run in Rust/WASM Workers. PDF import returns validated render buffers directly; Download GDOC reopens the original local File and encodes it only when requested. Export can therefore take additional time for a large PDF. See [FORMAT.md](FORMAT.md) for the format, ownership and build contracts.

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
    document/            PDF/GDOC loading, validation and page layout
      assets/            Bundled demo.gdoc
      format/            GDOC Worker, WASM adapter and generated decoder
      pdf/               PDF conversion Worker and its separately loaded WASM
      rendering/         Document GPU resources, shaders, preparation and drawing
        curves/          Instanced cubic contour renderer for imported PDFs
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
rust/document-format/    Native container/profile library, WASM exports and migration CLI
tools/legacy-demo/       Offline source fixtures for reproducible migration
scripts/                 WASM build and byte-for-byte verification
tests/
  browser/               Real GPU composition, gesture and rendering checks
  fixtures/              GPU doubles shared by feature tests
  performance/           Local desktop/USB Android pan benchmark
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

The GDOC file stores absolute glyph quads in compressed sections. Rust validates and expands them into the same six vertices per glyph as before. The file is 12,304,500 bytes; the old BMP/JSON sources are retained only under `tools/legacy-demo` for reproducible conversion. The loading Worker losslessly packs those vertices into 28-byte glyph instances before transfer. The renderer uses roughly 77.0 MiB of explicit GPU buffers and textures for the complete bundled document, excluding driver overhead and the swapchain.

WebGPU render-target coordinates run top-to-bottom. The raster atlas uses unflipped sampling coordinates; the coverage integral negates `dpdy` to preserve the original algorithm's handedness. Derivatives run before pixel-dependent branches. Explicit texture LOD avoids derivative-uniformity violations. Curve metadata uses exact `textureLoad` reads, and ten-byte image records are padded to WebGPU's twelve-byte vertex stride.

GDOC profile 2 stores reusable cubic contours and ordered affine/color/clip instances. The PDF importer supports filled/stroked text and paths, solid alpha colors, analytic nested clipping, tiling patterns, axial/radial gradients, sampled function shadings and rotated/cropped pages. The converter preserves curves across zoom, shares glyph outlines and runs locally in a cancellable Worker. The viewer can reopen all three GDOC profiles and save a PDF conversion as `.gdoc`.

Profile 3 keeps shared raster images in paint order. RGB/gray/CMYK and ICC JPEGs without PDF pixel transformations retain their source compression and PDF color profile, including JPEGs wrapped in ASCII85 or ASCIIHex; other images use independently packed premultiplied RGBA. Retained CMYK/YCCK JPEGs decode in Rust/WASM with PDF component polarity and ICC conversion, avoiding the negative colors produced by standalone browser JPEG decoding. This also corrects existing GDOC files when reopened. All images use software virtual textures, including small images with a complete mip chain. A document-owned worker supplies 128×128 detail tiles with neighboring-texel gutters. The shared detail atlas stays below 64 MiB, and packed, permanently resident mip tails use at most 16 MiB. The viewer supplies its initial camera to preparation, which uploads tails and composed base tiles only for initially visible pages. Other pages load when visited; content can appear progressively on that first visit. A composed tile waits for all of its source-image tails, including images outside the current crop. Image readiness invalidates command bundles so first-visit images cannot remain absent. Renderers created without an initial frame retain full prewarming for offline capture. Missing detail samples a resident parent or the pinned tail. Detail tiles are evicted by LRU only under memory pressure. LOD selection ignores a source axis that is only one texel wide: stretching a color ramp along that constant axis no longer fills the detail atlas with unnecessary gradient tiles. Requests prioritize coarse coverage and visible regions near the camera center, including rotated views. Source resolution stays available; ordinary JPEGs are decoded one image at a time, while prepared GDOC tiles decode independently. Transparency groups retain isolation, knockout, opacity, soft-mask transfer functions and all 16 PDF blend modes in RGB. Zero-width paths remain one device pixel wide when zoomed.

This remains a PDF subset: tiling patterns with blend modes produce a page-specific typed error. Mesh shadings (types 4–7) use isolated tiled textures at up to 288 dpi, capped at 4096 pixels on the longer side. Text, paths and clipping remain vector; mesh gradients have finite detail at extreme zoom. Function shadings use 512×512 color tables, so fine discontinuities can soften at magnification. Hayro's own parser/interpreter limitations still apply. Required CLIP/BINS/BLND/GRUP/HAIR/IPCK/MASK/VTEX/BLNX/GFLG/MTRF/RGRD sections extend profiles 2/3 with clipping, curve lookup tables and compositing; old files remain readable. Large paths keep their curves and use row/column bins in the shader. The importer accepts up to 1.5 million drawing instances within a 2 GiB minus one byte decoded-section/file budget. Profiles 2/3 use area coverage, with bounded integral tables for frequently reused small outlines and original curves at magnification. Its performance still depends on document complexity and GPU hardware. See [FORMAT.md](FORMAT.md#pdf-conversion) for the exact contract and limits.

## Imported-document rendering quality

Imported fills use pixel-area coverage instead of distance to the nearest edge. Both sides
of a subpixel stroke contribute, so reducing text no longer makes every thin stroke
roughly half a pixel opaque. Curve integration preserves nonzero/even-odd filling.
One or two rectangular contours use analytic pixel-area clipping, including holes,
overlaps and rotated/sheared pixel footprints. Other outlines use 16 two-point Gauss
bands in Y instead of repeatedly splitting at every contour endpoint. This bounds
integration cost on complex imported documents; it remains an approximation, and
arbitrarily narrow features inside complex contours are not guaranteed exact coverage.
Source cubics remain available at every zoom. Hairlines keep their separate
one-device-pixel treatment.

Outlines use summed-area tables prepared from 128×128 coverage grids for the
most frequent outlines, 64×64 for other repeated outlines, and 32×32 for rare ones. Byte-identical outlines from different
PDF font subsets share one table. The tables have a 64 MiB GPU budget, prioritize reuse,
and fall back to curve integration when absent. Their storage is included in resource
accounting. They answer area queries over a pixel's footprint rather than magnifying a
low-resolution page or glyph bitmap. Rotated pixels use short horizontal integration
strips. This is still an approximation to continuous curve coverage.

Tables are used only while the smallest footprint spans at least four source-grid cells;
between four and six cells the result blends continuously with original-curve integration.
Magnification uses source cubics. `vectorOnly` bypasses the tables for comparison. Image LOD
and virtual textures remain active for source raster images, including resident fallback levels.

Magnified outlines also have conservative 32×32 cell classifications. Only a pixel wholly
inside a proven empty/full cell skips curve integration. Boundary cells always use source
curves; subdivision tightens the lookup bounds without replacing rendered geometry.
Additional horizontal curve bins accelerate small outlines omitted by the file's large-path
index, within a separate 32 MiB budget. Minified outlines avoid scanning duplicate bin rows.

Ordinary fills have separate cached, mixed and magnified shaders selected with conservative
transform bounds. Adjacent compatible instances share indexed quads. Heterogeneous runs
limit pipeline switches; images, colors and transparency groups retain source paint order.
Pixel footprints come directly from affine transforms, and bounds expand by half a pixel.
Ordinary pages reuse GPU command bundles during pan and replace them when shader-selection
bands change. Each full-page or foreground cache keeps up to 2,048 bundles, with at least
512 cache slots for small documents. Driver command storage is excluded from the byte counter.

Composed caching is selected per page. Expensive transparency stacks retain a cached
prefix with their backdrop, while ordinary foreground stays direct. In a document
with heavy composition, image pages and large vector illustrations may use an
additional overview-only prefix; these switch back to direct drawing when enlarged.
Fills with more than 512 curves also qualify for a cached prefix, even without
transparency groups: analytic evaluation of these contours can stall the GPU when
an entire book is minified. Their ordinary foreground remains direct. Flattened
opaque groups coalesce compatible adjacent draws without changing paint order.
Nested masks and blend groups are never separated or reordered. See [PERFORMANCE.md](PERFORMANCE.md)
for the selection thresholds, quality checks and measured throughput tradeoff.

The independent area regression checks thin strokes, holes, overlapping fills, curved lenses,
rotation and crossing-cache overflow. A separate comparison against a high-resolution PDF
reference checks the density of actual text. Rendering hundreds of pages remains expensive;
measured results and limitations are recorded in [PERFORMANCE.md](PERFORMANCE.md).

### Reproducing pan measurements

With the standalone dev server running, use a converted GDOC saved by the viewer:

```sh
pnpm --filter @app-game/gpu-text-rendering test:performance /absolute/document.gdoc
```

The suite tests overview, near-overview, medium, page and detail pans, plus a full zoom-in/out
cycle, with 600 frames per scenario. It reports 30 synchronized
submission/completion samples separately from animation RAF intervals and final queue
backlog. The target defaults to 120 Hz (8.33 ms); `GPU_TEXT_TARGET_HZ=60` selects another
budget. `missedTargetIntervalsPercent` counts RAF intervals longer than 1.5 target periods,
allowing for timestamp rounding. A lightweight DOM animation measures idle RAF cadence
before loading the document. The runner rejects runs whose tab loses visibility or screen
wake lock. RAF frequency measures browser callbacks, not independently verified display
presentation; inspect completion latency and queue backlog as well.
Completion latency includes CPU, browser scheduling and GPU work; it is not a GPU
timestamp measurement. It excludes PDF conversion and GDOC decoding. Results and
screenshots go to `/tmp/gpu-navigation-performance`; override with `GPU_TEXT_OUTPUT`.
`GPU_TEXT_FRAMES` changes the animation length per scenario. `GPU_TEXT_VECTOR_ONLY=1` forces the direct
unspecialized curve shader for comparison, bypassing render bundles. For one scenario, run `tests/performance/pan.browser.mjs`
directly: `GPU_TEXT_ZOOM_SCALE=0.25` selects medium zoom, and `GPU_TEXT_MOTION=zoom`
selects a continuous zoom cycle. The default single-run output is `/tmp/gpu-pan-performance`.
Use `GPU_TEXT_BROWSER_CHANNEL=chrome` to test the installed Chrome rather than the
bundled Chromium. `GPU_TEXT_WIDTH`, `GPU_TEXT_HEIGHT` and `GPU_TEXT_DPR` select the
desktop viewport. Cold first-frame completion is reported separately from warmed
samples. `GPU_TEXT_SKIP_SCREENSHOT=1` omits the final screenshot.

For an authorized USB Android device with Chrome open and USB debugging enabled:

```sh
adb reverse tcp:3180 tcp:3180
adb reverse tcp:3381 tcp:3381
adb forward tcp:9224 localabstract:chrome_devtools_remote
GPU_TEXT_CDP=http://127.0.0.1:9224 GPU_TEXT_OUTPUT=/tmp/gpu-pan-android \
  pnpm --filter @app-game/gpu-text-rendering test:performance /absolute/document.gdoc
```

Keep the tablet unlocked. The runner opens and closes its own Chrome tab, borrows a screen
wake lock for the measurement, and leaves other tabs alone. Desktop Chromium receives local-network permission only in its
temporary test context so the GDOC can stream without a large debugging-protocol transfer. A loopback-only server (port 3381 for Android, an ephemeral port on desktop) serves only the selected file for the run; no PDFs are uploaded to an external service.
`node apps/gpu-text-rendering/tests/performance/refresh.browser.mjs` runs the lightweight
Android test separately, in windowed and fullscreen modes. It writes
`/tmp/gpu-browser-refresh/refresh.json` without changing Chrome flags or Android settings.
A 120 Hz panel alone does not prove that Chrome schedules animation at 120 Hz.

Run one benchmark at a time. Remove the ADB mappings afterwards if no longer needed:

```sh
adb forward --remove tcp:9224
adb reverse --remove tcp:3381
adb reverse --remove tcp:3180
```

The curve-quality regression compares normal drawing with the unspecialized exact-curve
path on dense text, images and transparency groups. It checks multiple scales,
rotation, close views and zoom return, with a mean channel-error budget of 0.05/255 for the
integral-table approximation; magnified views retain exact path parity. The test covers both ordinary page bundles
and transparency compositing. `GPU_TEXT_COMPARE_EXACT=1` adds the same pixel comparison
and `normal.png`/`exact.png` captures to a single-file performance run after image uploads
settle. No source PDF is required by the synthetic browser test.

For an independent PDF comparison, capture a converted external document page with:

```sh
GPU_TEXT_PAGE=12 GPU_TEXT_OUTPUT=/tmp/gpu-pdf-coverage \
  node tests/compatibility/coverage.browser.mjs /absolute/document.gdoc
```

The script saves 64-, 128- and 256-pixel-wide views. Render the corresponding source PDF
page at high resolution with a separate renderer (for example Poppler), then reduce it
with an area/BOX filter to those exact dimensions. Compare both spatial error and total
ink; agreement with our own unspecialized shader alone does not establish PDF correctness.

## Typed errors

GPU initialization publishes a discriminated `GpuRootState`: `loading`, `ready` or `error`. Providers select JSX branches and pass only ready resources through context. Browser/TypeGPU initialization exceptions are normalized at one Promise rejection boundary; expected capability failures update typed state directly. Device loss and uncaptured GPU errors update the same state even while rendering is idle.

Document loading and renderer preparation retain `neverthrow` results; frame submission returns a synchronous `Result`. These imperative APIs remain usable outside JSX. There is no custom Result implementation. A missing context provider is a programming error handled by Solid's context API, separate from expected GPU failures.

`errors.ts` defines discriminated errors for document transport/decoding, GPU capability/validation/device loss and cancellation. Stable `kind` and `code` fields support programmatic handling; `message` is for display and `cause` preserves external diagnostics. Fullscreen failures have their own type and do not invalidate the renderer.

`Result.fromThrowable` and `ResultAsync.fromThrowable` capture exceptions at the remaining browser/TypeGPU boundaries. Expected validation failures return `err(...)` directly. Cancellation returns `AbortedError`, never an error message from a rejected fetch. Partial initialization still releases devices and bitmaps. Document decoding terminates its Worker on completion or cancellation, releasing the WASM heap. The Solid viewer retains the typed error in its error state.

## Verification

From the repository root:

```sh
pnpm --filter @app-game/gpu-text-rendering test
pnpm --filter @app-game/gpu-text-rendering test:rust
pnpm --filter @app-game/gpu-text-rendering test:wasm
pnpm --filter @app-game/gpu-text-rendering typecheck
pnpm --filter @app-game/gpu-text-rendering build
pnpm --filter @app-game/web typecheck
pnpm build
```

With the standalone dev server running and Playwright Chromium installed:

```sh
pnpm --filter @app-game/gpu-text-rendering test:browser
```

For PDF UI checks against a production preview or the integrated web route:

```sh
GPU_TEXT_UI_ONLY=1 GPU_TEXT_URL=http://localhost:4180 node apps/gpu-text-rendering/tests/browser/pdf.browser.mjs
GPU_TEXT_UI_ONLY=1 GPU_TEXT_URL=http://localhost:3120 GPU_TEXT_PATH=/gpu-text-rendering node apps/gpu-text-rendering/tests/browser/pdf.browser.mjs
GPU_TEXT_UI_ONLY=1 GPU_TEXT_URL=http://localhost:3120 GPU_TEXT_PATH=/gpu-text-rendering node apps/gpu-text-rendering/tests/browser/images.browser.mjs
```

To check a local PDF collection without copying its contents into the repository:

```sh
node apps/gpu-text-rendering/tests/browser/pdf-corpus.browser.mjs '/absolute/path/to/pdf-folder'
```

The corpus runner opens every PDF through the real viewer, records Worker error codes and timings, captures the viewer state, saves successful GDOC conversions and checks recovery to the demo. It defaults to the main web route on port 3120; `GPU_TEXT_URL` overrides the complete viewer URL. `GPU_TEXT_OUTPUT` overrides the report directory, which defaults to `/tmp/gpu-text-pdf-corpus`. Any failed import or uncaught browser error yields a nonzero exit status. These private corpus files are not project fixtures and are never uploaded by the runner.

For import **and navigation** verification against the standalone server on port 3180:

```sh
GPU_TEXT_WIDTH=2500 GPU_TEXT_HEIGHT=1600 GPU_TEXT_DPR=2 \
GPU_TEXT_OUTPUT=/tmp/gpu-text-corpus \
node apps/gpu-text-rendering/tests/performance/corpus.mjs '/absolute/path/to/pdf-folder'
```

This runner processes root-level PDFs sequentially, using installed Chrome by default
(`GPU_TEXT_BROWSER_CHANNEL=chromium` selects bundled Chromium). It imports each PDF
through the viewer, exercises wheel/drag controls, saves the resulting GDOC, then starts
a fresh browser for nine navigation scenarios and visits every page at reading scale.
The scenarios include overview, far/medium zoom, page/detail/letter zoom, rotation,
animated zoom and returning to overview. CPU time, CPU+GPU completion time and RAF
intervals are recorded separately. Screenshots and an offline `index.html` accompany
`report.json`. A phase timeout terminates only that test browser and continues to the
next file. A failed import, GPU error or incomplete run gives a nonzero exit status;
slow completed frames remain visible in the report rather than counting as correctness failures.

`GPU_TEXT_FILES=7,9` selects one-based indices in the sorted PDF list. For diagnosis,
`GPU_TEXT_SKIP_IMPORT=1` reuses `NN/document.gdoc` from the selected output directory;
this does **not** verify PDF import. `GPU_TEXT_HEADED=1` shows the test browser. `GPU_TEXT_PROFILE=1` saves an
`overview.cpuprofile`; profiling changes timing, so use a separate run for measurements.
Do not run multiple GPU benchmark processes together: contention invalidates comparisons.
This matrix checks specific trajectories, not every possible scale or complete PDF fidelity.

Scene and rendering checks import test fixtures from the standalone dev server. To check the integrated web route against the running main web server:

```sh
GPU_TEXT_URL=http://localhost:3120 GPU_TEXT_PATH=/gpu-text-rendering node apps/gpu-text-rendering/tests/browser/controls.browser.mjs
```

Unit tests cover camera anchors, pointer continuity/cancellation, binary decoding, page culling, reactive options, JSX ordering after late mounts and keyed list reordering, draw-prop replacement, hidden-layer resource retention, stable object ids, independent animation subscriptions, hidden-tab pause/resume, viewport/DPR changes, invalidation coalescing, callback unsubscription, JSX provider replacement and asynchronous resource ownership. Ownership checks include late devices, stale failures, independent canvas disposal, partially prepared documents, document-only cancellation and balanced validation scopes. Browser checks cover gestures, options, resizing, idle device loss, loading errors and unavailable WebGPU. The scene check also mounts a document after sibling graphics with equal layer order, checks JSX order, changes layer order and rectangle props, verifies pixels, removes graphics/documents independently, checks buffer disposal and keeps camera controls working without a document. It also verifies document-space rectangles under camera rotation, CSS-sized screen graphics at DPR 3 with a cap of 2, reactive DPR limits, and stable-id resource reuse.

The virtual-texture check blocks detail decoding to verify complete LOD coverage in the very first frame, then verifies exact source pixels across tile boundaries and odd image edges, rotation, returning to a loaded view before decoding, parity between whole-image and independently packed tile sources, and bounded GPU resources.

The image PDF check verifies paint order, transforms/reflection, rectangular clipping, translucent masks and stencils, shared resources, GDOC save/reopen, zoom/rotation and cleanup against actual GPU pixels.

The rendering check captures overview, page, close text, rotation, debug grids, 1,185 visible pages and a synthetic translucent image. It rejects empty renders and records resource usage, submission time and synchronized completion latency. Set `GPU_TEXT_URL` to use another server and `GPU_TEXT_OUTPUT` to choose an artifact directory. The default directory is `gpu-text-rendering` inside the OS temporary directory. Set `GPU_TEXT_BASELINE` to an earlier artifact directory to compare pixels as well.

Chromium test processes enable WebGPU and select Metal on macOS. The app itself uses normal browser capability checks. All seven images matched the pre-refactor TypeGPU captures exactly on the local Apple Metal adapter. Imported-document overview panning has also been measured on a USB-connected Wacom MovinkPad 14 in Android Chrome on Adreno; this is a rendering benchmark, not a full native gesture compatibility test.

Native corpus diagnosis (source PDFs remain external):

```sh
cargo +1.92.0 run --release --manifest-path apps/gpu-text-rendering/rust/document-format/Cargo.toml --features pdf --bin convert-pdf -- /path/to/input.pdf /path/to/output.gdoc
```

The CLI writes only after complete conversion/validation. Resource errors discovered during interpretation include the originating PDF page.

The four external PDFs used for corpus verification now convert, open, load their visible images and reopen as GDOC: CV (2 pages), FORCE (245), Game Engine Architecture (628), and The Art of How to Train Your Dragon (157). Source PDFs remain outside this repository. Group/hairline GPU regressions run in `groups.browser.mjs`; the corpus runner also waits for image workers and checks saved-file reopening.

The expanded ten-file corpus additionally covers Art of Brother Bear (124 pages), Directing for Animation (251), GPU Pro 6 (574), GPU Pro 7 (322), Illustrative Rendering in Team Fortress 2 (6), and The AI Systems of Left 4 Dead (95). These exercise ICC/CMYK JPEG retention, Alpha/Luminosity soft masks, Type 3 glyph programs and axial gradients. PDF/GDOC input is bounded below 2 GiB. Aggregate encoded image payloads are bounded at 1536 MiB; each decoded image remains limited to 256 MiB. GPU residency remains independently bounded.

The Art of Star Wars: Episode III (222 pages, 295 MiB PDF) also opens and reopens as GDOC.
Its ASCII85-wrapped JPEGs must retain their original compressed samples: decoding them
into losslessly compressed RGBA previously exhausted the image budget on page 50.
With wrapper-only decoding, the GDOC is 226 MiB and opens in about 12 seconds on the
local laptop, including conversion and initial GPU preparation. This does not change
input, image or GPU memory limits. External verification screenshots and metadata are
in `Sync Folder/pdf-rendering-tests/star-wars-results`; the Rust image tests generate
small ASCII85/ASCIIHex filter-chain regressions without including the book.


Independent visual compatibility tests now cover a pinned 44-document PDF.js selection.
They compare individual pages with Poppler and PDF.js 6.3. All 44 documents now open, and
all 70 selected pages reproduce their pixels exactly after reopening GDOC. Visual differences
remain in 29 documents; see the
[reviewed findings](tests/compatibility/findings.md) and [reproduction instructions](tests/compatibility/README.md).
Known visual differences remain explicit in the baseline. This is separate
from the ten-book smoke test and is not a claim of full PDF support.

The locally supplied Ghent 5.0 suite adds 51 individual patches and a combined document.
Its [reviewed findings](tests/compatibility/ghent-findings.md) distinguish import success
from the patches' visual criteria. Use the [separate Ghent manifest and baseline](tests/compatibility/README.md#local-ghent-50-suite)
to reproduce the run without mixing its print-specific checks with the PDF.js corpus.

### Performance comparisons

Coverage tables and boundary grids are computed in the loading Worker. GPU preparation consumes those staging tables; programmatic scenes without them use a cancellable coverage Worker. Source curves, area-table resolution and image quality settings are unchanged. Module Workers retain the existing ownership/transfer protocol: Solid Primitives' function-serialized workers do not support these imported WASM modules and their transferable-buffer contract.

Image projection uses scalar affine bounds and a per-frame page index. A bounded placement cache reuses tile membership between LOD/tile-boundary changes, with priorities updated every frame. Best-K selection sorts only the retained candidates; resident preference and stable ties remain covered by tests.

The default demo retains all 1,273 pages and its golden byte-parity check.

`tests/performance/compare.browser.mjs /absolute/document.gdoc` compares overview, reading scale and overview return in two dev servers. Set `GPU_TEXT_BASELINE_URL` and `GPU_TEXT_URL`; optionally set `GPU_TEXT_OUTPUT` and `GPU_TEXT_BROWSER_CHANNEL`.

`tests/performance/startup.browser.mjs [/absolute/document.pdf]` compares cold-browser startup and optional PDF import in two production preview servers with the same URL variables. `GPU_TEXT_SAMPLES` defaults to 3. It records readiness, a first-frame GPU fence and main-thread long tasks. This does not measure completion of all offscreen resources or physical presentation FPS.

### Lossless instance packing and worker preparation

The full 1,273-page demo stays intact. The vertex shader reads compact records from storage buffers while retaining the original six-vertex triangle order. Buffers are split at the device storage-binding limit. Its glyph buffer stores four original signed-normalized corner positions, one atlas header, one RGBA color and one page index per glyph. This takes 28 bytes instead of 72, preserving skew, i16 wrapping, triangle order and the existing fragment coverage calculation. Decoded glyph documents set `glyphEncoding: 'instances'`; their `glyphVertices` buffer has a 28-byte stride. Page ranges still use legacy six-vertex units. Programmatic callers may omit the tag and supply the original 72-byte records.

PDF/GDOC loading Workers also prepare paint runs, trees, composition plans, spatial bounds and curve lookup rows. GPU preparation consumes that staging data. Programmatic scenes without staging data still build the plans locally; custom page placement rebuilds spatial bounds. Large glyph, curve, instance, clip, bin and coverage buffers upload in writes of at most 4 MiB, yielding between chunks and checking cancellation before each write. This reduces uninterrupted main-thread work, but does not make PDF interpretation or geometry residency page-streamed.

No persistent document cache, predictive prefetch, reduced motion resolution or new approximate text rendering is enabled.

### Interface languages

The viewer uses English by default. The More menu offers English, Russian, Spanish, German, Japanese,
Simplified Chinese and Hebrew. The router stores the selection in `?lang=ru`,
`?lang=es`, `?lang=de`, `?lang=ja`, `?lang=zh` or `?lang=he`; selecting English removes the parameter.
Unsupported values fall back to English. Other query parameters and fragments are
preserved, and browser back/forward updates the interface without reloading the document.
Hebrew uses RTL controls while document pages retain their original orientation.
Translations use `@solid-primitives/i18n`; native PDF/GPU error details remain in their
original language below a localized error heading.

### Drag and drop

Drop one local PDF or GDOC anywhere inside the viewer, including over its toolbar,
to open it. The highlighted drop target and validation messages follow the selected
interface language. Unsupported or multiple-file drops leave the current document
open. Text and URL drags do not open documents.

The viewer uses `createNativeDroppable` from `@solid-primitives/drag-drop`.
The pnpm patch for version `0.1.0-next.0` fixes its compiled `createComponent`
import to use `solid-js`, matching Solid 2.
