# Paint core

Shared drawing runtime extracted from Paint Studio. Both Studio and `@app-game/brush-preview`
use this implementation. The package imports no application code.

- `document`: layers, immutable tile versions and undo/redo.
- `gpu/renderer`: tiled WebGPU drawing, LOD, device resources and multiple presentation targets.
- `paintRuntime`: ordered input, frame backpressure, resource ownership and save coordination.
- `composition`: Solid 2 providers, reactive canvas targets, engine registration and storage adapters.
- `input`: Studio's raw/coalesced stylus input and release behavior. Navigation puck is optional.
- `selection`, `camera`, `tileStore`, `paintFile`: reusable editing, view, persistence and file operations.

Configure applications through `composition/PaintApplication`, providing document/storage/renderer
factories and engine/processor registries. `composition/CanvasTarget` can replace a canvas reactively
without creating a second document or renderer. Main-thread and worker hosts instantiate the same recipe
in their own execution realm. UI, keyboard shortcuts and the PWA stay in `apps/paint`.

`createPaintRenderer` accepts optional immutable integer `bounds`. GPU writes and transient previews
are clipped, including retouch tools; tiles wholly outside the extent are not painted. Omitting bounds
preserves the infinite-canvas path. Bounds do not change the document file format or sanitize documents
imported through another API. A product offering bounded document import/selection must enforce those
policies too. The preview widget has no document import or selection API and shows only its fixed view.

## Current engine seam

This extraction proves application reuse, not complete independence from every brush engine.
The provided renderer still orchestrates the round, textured and ABR raster paths, and this package
currently depends on `abr-paint`/`abr-brush`. Registries allow custom engines and a paired renderer;
a future Krita/Clip Studio implementation must not be forced into ABR stamp/settings structures.
Smudge carry, Blur/Sharpen ordering, Mixer reservoirs and their lifecycle now live in
`abr-paint/gpu/retouch`. The renderer supplies three operations: capture current source pixels,
deposit sampled dabs, and enumerate writable destination tiles. The ABR module has no import back
into paint-core. ABR mask snapshot layout, compact LOD restoration, preview copies, resets and scratch
accounting now live in `abr-paint/gpu/coverage`, exposed through the rasterizer's tile handle. The core
keeps output tiles, batched readback, lossless tile decoding and cancellation guards. It treats ABR
coverage snapshots as opaque stroke data. Engine selection and fused destination writes still need
an engine adapter; these extractions alone do not make the renderer engine-neutral. Do not rename
an ABR-specific contract to “universal” without a second engine exercising it.

GPU integration checks live in `apps/paint/tests/gpu`. Existing app tests still exercise the extracted
modules, and the tablet performance baseline stays in `apps/paint/performance`.
