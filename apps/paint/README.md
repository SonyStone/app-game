# Paint

Paint Studio is an infinite-canvas drawing app built with Solid 2 and TypeGPU/WebGPU. The drawing engine runs in a Web Worker with an OffscreenCanvas by default, or on the main thread with the page's canvas. Drawings are sparse 256×256 raster tiles with layers, undo/redo and lasso selections, saved automatically to IndexedDB. Brushes include the soft round brush, eraser, textured tips and Photoshop ABR presets; the view supports pan, zoom, rotation, mirroring and paint symmetry. Unsupported browsers (no WebGPU) display an error.

## Running and integration

This workspace app runs on its own and is also mounted by the web playground at `/paint/studio`. The playground route (`packages/paint/routes.tsx`) imports `PaintStudio` from `@app-game/paint/editor`, the package's only export. Browser storage belongs to an origin, so a drawing saved on the playground port stays there; use **Drawing menu → Save drawing** and **Open drawing** to move it as a `.paint` file.

From the repository root:

```sh
pnpm --filter @app-game/paint dev        # http://localhost:3030
pnpm --filter @app-game/paint typecheck
pnpm --filter @app-game/paint test          # feature tests: engine connection, panels, dialogs, input, PWA
pnpm --filter @app-game/paint test:browser  # every real-GPU verification in headless Chromium with WebGPU
pnpm --filter @app-game/paint test:ui       # editor UI smoke test: panels, shortcuts, undo/redo, engine switch
pnpm --filter @app-game/paint build      # apps/paint/dist
pnpm --filter @app-game/paint preview    # http://localhost:4030
```

`src/main.tsx` mounts `PaintApp`, the standalone shell that adds PWA installation and build identity to the drawing menu. Importing the editor elsewhere never registers a service worker. Test harnesses are not exported. `tests/browser/harness.html` runs them for `test:browser` (see [Maintenance](docs/maintenance.md#verifying-a-change)); the manual GPU QA page `apps/web/paint-studio-qa.html` (served by `pnpm dev` at the repository root, http://localhost:3120/paint-studio-qa.html) imports the same functions and adds the benchmarks.

## Feature structure

```text
src/
  features/
    studio/        Editor layout (PaintStudio), side panels, drawing menu, keyboard shortcuts, fullscreen toggle
    engine/        Engine connections: worker and main-thread transports, mode switch, reply correlation, Studio recipe
    canvas/        Drawing canvas keyed on the execution mode, with its connection and input; brush cursor, wireframe
    camera/        Camera state and view commands, stage size, navigation puck adapter
    selection/     Lasso outline and pixel edits, on-canvas outline, edit gate, selection toolbar
    symmetry/      Document paint symmetry: settings, guide and panel
    layers/        Layer list, blending and ordering, image placement, Erase to History source
    fill/          Bucket fill: engine edit, settings and canvas contact, fill panel
    brush/         Tool choice and brush settings, Mixer Brush commands, brush and color panels
    brush-library/ Brush presets: built-in and user presets, IndexedDB storage, resource uploads to the engine
    abr/           Embedded ABR viewer and import of its presets into the brush library
    developer/     Developer switches and dialog
    performance/   Live frame-cost panel, `window.paintPerformance` reports and the dev-server responder
    color-wheel/   Perceptual OKLCH color wheel with harmonies and gamut masks, offered by the Color panel
    radial-menu/   Quick actions around the navigation puck, chosen by press or barrel-button marking drag
    recording/     Input recording for bug reports: recorder, floating controls, recording format
    pwa/           Standalone shell: install prompt, offline status, build identity
  shared/
    errors.ts      PaintError contract (engine, brush, fullscreen and install kinds)
    downloadBlob.ts
    ui/            Sketch line icons
  main.tsx         Standalone entry
tests/
  browser/         Worker and main-thread harnesses, harness page, the test:browser runner and the test:ui smoke test
  gpu/             Real-GPU renderer checks
  waits.ts         The only waiting primitives harnesses use (events first, bounded polls last)
  performance/     Device brush benchmark (scripts/brush-performance.mjs)
docs/              Editor behavior, maintenance, engine composition, design QA
performance/       Accepted tablet brush baselines
```

Unit tests live beside the feature they exercise and cover only app code. Runtime, document, storage and renderer tests live in `@app-game/paint-core` (with shared renderer/storage doubles in `packages/paint-core/tests/fixtures`), ABR preset and GPU planning tests in `@app-game/abr-paint`, and preset sampling tests in `@app-game/abr-brush`. Real Adobe brush packs are downloaded once into `.tmp/adobe-brushes`, pinned by SHA-256 in `scripts/adobe-brush-fixtures.json`.

- Start with `features/studio/PaintStudio.tsx`. It is the editor's layout: it creates the engine, camera, tools, selection, symmetry and preset uploads once, then composes the canvas and the UI from feature modules, passing each the values and callbacks it works on.
- `features/engine` owns the drawing engine. `createPaintEngine` opens one connection per mounted canvas and reports document state, save state, metrics and the view stored with a document. The canvas is keyed on `engine.session()`, so switching between worker and main thread checkpoints the document and renderer tools, disposes the engine and replaces only the canvas; brush, symmetry, panels and developer switches stay mounted. `openPaintTransport` starts the worker with `openWorker` from `@app-game/solid-gpu/worker` and transfers an OffscreenCanvas; `openLocalEngine` loads the same recipe on the main thread. Disconnecting sends `dispose`, which saves the document and closes storage before the transport is closed. `createEngineRequests` correlates brush-resource uploads and brush commands with their replies and times out waiting callers without posting duplicate resources.
- UI state lives outside the engine. Developer switches, the camera and the lasso outline reach the engine through effects gated on readiness, so a replacement engine receives them when it becomes ready. The camera and symmetry reset from `engine.restored()` when a document is loaded, imported or replaced. A write becomes visible to every reader, `latest()` included, only at the next flush; guards that must see a write made earlier in the same event (busy flags, the stroke in progress, the selected preset) use `createImmediateSignal` (`src/shared`).
- `features/canvas`, `camera`, `selection`, `symmetry`, `layers`, `fill`, `brush`, `abr` and `developer` each provide a factory for their state and components for their UI. `features/studio/createPaintShortcuts.ts` is the single keyboard handler.
- Expected failures are `PaintError` values (`src/shared/errors.ts`) returned as `neverthrow` results. Renderer failures reuse `GpuError`, and cancelled work `AbortedError`, from `@app-game/solid-gpu/errors`. A paused renderer offers **Restore renderer**; a busy editor asks the user to retry.

Each feature folder's `index.ts` lists its public API; the layout imports from the folder, while files inside a feature import each other directly. The drawing runtime (document, tiles, storage, GPU renderer, input and stroke processing) is `@app-game/paint-core`; ABR brush engines are `@app-game/abr-paint`; the navigation puck is `@app-game/navigation-puck`. Older playground drawing experiments remain in `packages/paint` (`@app-game/paint-examples`).

## Composing the editor

```tsx
const engine = createPaintEngine({ settings: developer, onError: setError, onSelection, prepare: () => uploads.restore() });
const camera = createPaintCamera({ restored: () => engine.restored()?.camera, size, ready: engine.canEdit, send: engine.send, bounds });

<main ref={setStage}>
  <Show when={engine.session()} keyed>
    {(session) => <PaintCanvas connect={(canvas) => engine.connect(canvas, session.mode)} input={input} crosshair={tool() === 'lasso'} />}
  </Show>
  <SymmetryGuide symmetry={symmetry.symmetry()} camera={camera.camera()} size={size()} active={supportsSymmetry()} />
</main>
```

The canvas connects the engine and attaches input from an owned effect once its element exists, and disconnects on cleanup. Side panels are a table of titles rendered through `<Switch>`; each panel receives plain values, for example `<LayersPanel state={engine.state()} ready={ready()} onAction={(action) => edit({ type: 'layer', action })} />`.

## Performance monitor

Open it with `?performance` or **Developer → Performance monitor**. The panel over the stage shows the engine's per-frame CPU submission time and wait for submitted GPU work (paint-core `frame` events), the frame rate and the 60 Hz budget. Scripts can call `window.paintPerformance.report({ samples: true })` or `reset()`. During `pnpm --filter @app-game/paint dev`, `GET /__performance[?samples]` collects reports from every open tab and `POST /__performance/reset` clears them. Device timing baselines are separate: see [Brush performance regression checks](performance/README.md).

## Input recordings

To report a bug that depends on real pen, touch or palm input, open **Developer → Record input…** on the dev server, reproduce the bug, press **Stop** and describe what went wrong. The recorder saves `recordings/<id>/` in this app (ignored by Git):

- `recording.json`: pointer, pen and touch events with their coalesced samples, keys, wheel, viewport and focus changes, the document commands the editor sent and changes of editor state such as the tool, camera and selection (format in `src/features/recording/inputRecording.ts`);
- `start.paint`: the drawing when the recording started, which **Drawing menu → Open drawing** loads;
- `start.png` and `end.png`: the presented view at the start and at the end.

`node scripts/recording-timeline.mjs recordings/<id>` prints the recording as a timeline: one line per contact, capture, key, command and state change, with the moves of each pointer merged into one line. `--from` and `--to` limit it to seconds since the start; `--events` prints the raw events in that range as JSON lines. Both dev servers, this app's and the playground's that `pnpm dev:tablet` runs, receive the files at `PUT /__recordings/<id>/<file>` (`recordingBridge.ts`); production builds have no recorder.

## Install and offline use

PWA support is enabled in production builds. Run `pnpm --filter @app-game/paint build`, then `pnpm --filter @app-game/paint preview` and open http://localhost:4030. Use **Drawing menu → Install Paint** when offered, or the browser's installation menu. On iPad/iPhone, use Safari's **Share → Add to Home Screen**.

For deployment, serve `dist` at the root of an HTTPS origin. Plain HTTP on a LAN IP does not enable the service worker; use HTTPS when testing from a tablet. Serve `sw.js`, `index.html` and `manifest.webmanifest` with revalidation rather than a long immutable cache lifetime. Hashed `assets/` files can use immutable caching.

The drawing menu shows **Ready to work offline** after the editor has been cached. The precache includes the lazy editor modules, the drawing worker, icons and color-management WASM; ABR parser runtimes are cached after their first use. Drawings persist in IndexedDB.

New versions use the [Vite PWA waiting-worker strategy](https://vite-pwa-org.netlify.app/guide/prompt-for-update). Paint never calls `skipWaiting` or reloads the page for an update. After the menu reports an update, or after redeploying, finish saving and close every Paint window before reopening. Installation and offline caching apply only to the standalone app, not the playground route. Vite development mode does not install a service worker.

## Documentation

- [Editor](docs/editor.md): features, controls, rendering, storage, virtual pages and their browser checks.
- [Maintenance](docs/maintenance.md): where to change behavior, error contracts, queue limits and required checks.
- [Composing the drawing engine](docs/composition.md): `@app-game/paint-core` providers and custom recipes.
- [Design QA](docs/design-qa.md): layout review screenshots.
- [Brush performance regression checks](performance/README.md): adaptive LOD contracts, CI checks and the Wacom baseline.
