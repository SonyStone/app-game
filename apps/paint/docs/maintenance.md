# Paint Studio maintenance

## Where to change behavior

| Task | Main module | Check |
| --- | --- | --- |
| JSX assembly, dependencies and swappable engines | `src/features/engine/StudioApplication.tsx`, [composition](./composition.md) | `PaintApplication.test.tsx`, Check execution modes |
| Canvas targets and their lifecycle | `packages/paint-core/src/composition/CanvasTarget.tsx`, `packages/paint-core/src/gpu/targetView.ts` | Check canvas targets |
| ABR preset import and selection | `src/features/abr/` (the embedded ABR viewer imports `.abr` files; `createAbrPresets.ts` uploads the chosen preset's resources before activating it) | `createAbrPresets.test.tsx`; import → draw → worker/main switch |
| Panels, keyboard, UI state | `src/features/studio/PaintStudio.tsx` (layout), `src/features/studio/createPaintShortcuts.ts`, feature factories; engine connection and mode switch in `src/features/engine/createPaintEngine.ts` | `test:ui`, `createPaintEngine.test.tsx` |
| Fullscreen | `src/features/studio/createFullscreenToggle.ts` (built on `@solid-primitives/fullscreen`) | enter/exit, external Escape, refusal, double click, unmount |
| Puck gestures in 2D and 3D | `packages/navigation-puck/src/controller.ts` | package tests and puck DOM test |
| Pen samples and stroke shape | `packages/paint-core/src/input.ts`, `packages/paint-core/src/strokeProcessors.ts`, `packages/paint-core/src/brush.ts` | node geometry tests, GPU brush check |
| Command order, commit and autosave | `packages/paint-core/src/paintRuntime.ts` | `workerRecovery.test.ts`, Run worker checks |
| Tiles, undo/redo, document version | `packages/paint-core/src/document.ts` | `core.test.ts`, export/restore |
| IndexedDB transactions and garbage collection | `packages/paint-core/src/tileStore.ts` | Run streaming checks, Run worker checks |
| Rasterization and GPU tile eviction | `packages/paint-core/src/gpu/strokeRaster.ts`, `packages/paint-core/src/gpu/tileResidency.ts` | Check readback queue, Check brush batching |
| Overviews, LOD, cancelling stale loads | `packages/paint-core/src/virtualPages.ts`, `packages/paint-core/src/pageWork.ts`, `packages/paint-core/src/gpu/virtualTexture.ts` | node page tests, Check saved low-res, Check cold zoom |

Changed regions of each canvas are tracked in `packages/paint-core/src/gpu/viewDamage.ts`. A frame acknowledges only its own version of changes, after it has been presented successfully. **Check canvas targets** compares partial updates against a full redraw, including preview, cancel and commit with and without VT.

## ABR package

The reusable stroke engine, preset conversion, resource cache, and brush GPU operations live in [abr-paint](../../../packages/abr-paint/README.md). `packages/paint-core/src/composition/abrBrushEngine.ts` registers the package with Paint. The app retains document/worker scheduling, tile residency, history, and UI; the package never imports app files. Run package tests together with Paint integration and device performance checks.

## Smudge performance

`packages/abr-paint/src/gpu/canvasPickup.ts` captures current pixels on the GPU for Smudge, Mixer and filters. A single layer without Sample All Layers is drawn directly into the result texture; the first pass also clears it. An empty capture must clear the result, otherwise pixels from the previous dab appear. For multiple layers, separate blending, opacity and visibility are preserved.

`packages/abr-paint/src/gpu/smudgePickup.ts` keeps paint in two GPU banks between dabs: the fresh canvas at the current position is blended with the previous pickup according to Strength. The first contact only loads paint; Finger Painting initializes it with the foreground. The pixel active area and the allocation have different sizes: the allocation grows and is reused, while viewport and UV are limited to the active area. When the diameter changes, the physical coordinates of the paint are preserved; a new edge is first captured and deposited starting with the next dab. Begin/finish/cancel/reset reset the pickup history. Do not carry it between strokes. `apps/paint/tests/gpu/smudgePickupVerification.ts` checks recurrence, alpha and resizing on the GPU.

Each Smudge dab reads the result of the previous one. Source tiles of one capture may be drawn in batches, but their commands must be submitted before the textures are evicted or overwritten. In `strokeRaster.paintStamps`, re-copying base is limited to the composite scissor region. Persistent scratch gets full initialization when a tile is first touched, shared sampling scratch only the scissor; sampling tools do not use the disposable tail preview. Do not merge dependent dabs without preserving this order.

On `/paint-studio-qa.html`, the **Measure dense smudge** button alternates a reference with full mip chains and the current path: one cold and six warm isolated passes each, size 50, spacing 3%, pressure/scattering/count as in Wet Blender, a synthetic sampled tip, fixed coordinates and seed. It reports time to GPU completion (without finish), stamp count, submissions (including finish), pixel hash, separate finish time, and medians of the six warm passes of both variants. Hashes of all passes, including the reference, must match. The reference is not part of the current path's median. This is an engine load check, not a measurement of stylus latency or large-document FPS.

Measurement on 2026-09-08 in the local in-app browser: 235 stamps, submissions reduced from 1239 to 537; hash before/after — 1536182265. After optimization the warm median is 43.9 ms; durations fluctuate noticeably, so no universal speedup factor is established. **Check ABR presets** and **Check ABR color mixing** verify real GPU pixels, transparency, tile seams, eviction, Sample All Layers, Smooth/Classic and undo/redo.

### Long strokes and eviction

**Measure long smudge** adds drawing between batches of 16 points, a 4096 px path and a deliberately small cache of 16 tiles. For a 512 px brush the before/after eviction optimization measurement was 3400.4/1966.5 ms; 573 stamps and hash 2602076709 matched. For 50 px — 820.6/802.6 ms, 5832 stamps, hash 2578267771. This is a cache load test, not a tablet FPS measurement.

`tile.strokeDirty` distinguishes a modified GPU tile from a tile loaded only for sampling. Re-evicting an unmodified tile uses the existing snapshot without readback. Smudge/Mixer/filters without Dual Brush keep only the output: their coverage is replaced by each dab. Normal brushes and Dual Brush keep the full accumulated state. **Check ABR presets** includes a repeated pickup of an unmodified active tile without new readbacks, eviction, and exact history restoration.

`paintRuntime.addSamples` processes the backlog in batches of 16 points and shows an intermediate frame if the work took at least 8 ms. This is a soft budget: a single expensive dab can take longer. Points are not dropped; end/cancel commands and subsequent strokes stay in their original order. `workerLatency.test.ts` checks fast and slow backlogs, intermediate presentation, pressure, and that the finished stroke matches.

### Large footprint and Smooth color

`captureRegion` takes modified resident pixels directly from the brush cache. Non-resident sources are read through the existing display cache, always with scale=1: downscaled display textures must not be used for sampling. Before reading an evicted active tile, its pending snapshot is awaited. Source identity and removal of the display entry while drawing protect against stale pixels. Sampling does not restore unneeded mask/base and does not evict writable tiles. **Check ABR presets** confirms there is no readback when capturing a committed neighbor with a one-tile cache.

In `canvasPickup`, Smooth color reads level 0, so it does not request mipmap generation. Classic still uses mipmaps under minification. Presentation separately builds the mipmaps it needs when displaying modified pixels.

**Measure huge smudge** checks an 8192 px path with the production texture budget (initially 128 full tiles) and intermediate frames. Local measurement 2026-09-08 before/after: 512 px — 2231.7/1926.3 ms, hash 3903305714; 2048 px — 9180.1/5006.5 ms, hash 879438226. For 2048 px, submissions dropped from 210682 to 63284 with the same 287 stamps. The test is synthetic, uses Smooth color and fixed pressure; it is not an estimate of physical tablet FPS.

### Batched capture and binding reuse

`createCanvasPickup` encodes up to 32 source tiles into one render pass. Each draw gets its own placement uniform from a bounded pool. The `getTile` callback must call `flush(texture)` before a source is destroyed or reused; `flush()` submits the whole current batch unconditionally. `displayCache.find/get` pass the specific texture to `beforeInvalidate` before replacement or eviction. Pickup submits the batch only if that texture is still used by pending draws; a cache hit, a fresh upload, and eviction of an unrelated entry do not break the batch. On a lookup error the unfinished pass is discarded, and the next capture clears scratch.

Bindings and mask views of the ABR cache are reused. `prepare` resets bindings when the preset changes, and a coordinate change of a reused scratch tile updates Params. Pickup texture keys are weak: the cache does not retain old resized textures. **Check ABR presets** verifies capturing 64 tiles through several uniform-pool cycles, recycling of a single source texture, and recovery after a lookup error.

The same **Measure huge smudge** after batching and resource reuse: 512 px — 1624.7 ms instead of 1926.3; 2048 px — 4254.1 ms instead of 5006.5. Submissions for 2048 px — 44043 instead of 63284. Pixel hashes match the previous measurements. Results are local and depend on system load.

### Single pass for Smudge without accumulated coverage

`abrStamps.canDrawDirect` allows direct blending for Smudge without Wet Edges and without an active Dual Brush. `strokeRaster.paintStamps` uses it only for a single primary dab: instead of clearing mask/paint, writing MRT and a separate composite, one pass over the dab geometry is performed. Copying the modified region into base remains mandatory. Dependent dabs are still executed sequentially. Other brushes use the existing coverage accumulation.

`shadeStamp` and `compositePixel` are shared by both paths. Between them the direct shader calls `unpack4x8unorm(pack4x8unorm(...))` for paint and mask: this preserves the intermediate rgba8unorm rounding. A plain `round(x * 255) / 255` produced one-level color differences and is not suitable for exact comparison. Scratch textures remain in the existing bounded cache, but the direct path neither reads nor writes them.

The renderer option `directSmudge: false` keeps the multipass reference for GPU checks. All three Smudge benchmarks compare reference and direct hashes, showing cold/warm results separately. **Check ABR presets** additionally compares every pixel for Classic/Smooth, partial Strength, Sample All Layers, Finger Painting and Dual Brush fallback with tile eviction. Undo/redo is checked for both paths.

Local warm **Measure huge smudge**, 2026-09-08: 512 px — 1624.0 → 1465.6 ms; 2048 px — 4348.4 → 4055.6 ms. Hashes remained 3903305714 and 879438226. The submission count did not change: the optimization reduces render passes inside commands. 2048 px still has 1022 readback batches, so the gain is limited. This is a synthetic load up to GPU completion, without finish; it does not measure stylus latency on a tablet.

### Deferred display-cache mipmaps and readback packing

`displayCache.get` loads a level-zero entry with `mipLevelReady: 0`. Smooth pickup does not use mipmaps, so it does not build them. Classic pickup under minification and `renderer.render` at zoom × DPR < 1 check the ready prefix of the mip chain and build the needed levels before reading. Coarse entries are still created from a ready chain: copying a downscaled level needs mipmaps immediately. **Check ABR presets** checks a checkerboard after Smooth pickup, a subsequent Classic pickup, downscaled display of an existing full-resolution entry, and a cold coarse entry.

`packTile` first collects up to 1024 RGBA run lengths. For typical sparse tiles it then allocates exactly the packet size; a fully empty tile needs an 8-byte packet, and a fully dense one is returned without a temporary pixel buffer. If there are more runs, the rest is encoded directly into the bounded TILE_BYTES buffer. This bounds metadata cost for heavily fragmented brushes. The packet format, empty-RGBA detection, source data, and the policy for returning dense bytes are unchanged. The readback queue still separates the returned raw view from the mapped buffer.

After both optimizations, **Measure huge smudge**, local warm measurements 2026-09-08: 512 px — 1399.7 ms versus 1465.6 in the previous iteration; 2048 px — 3683.9 ms versus 4055.6. For 2048 px, submissions dropped from 44043 to 25411, hash remains 879438226. Readback batches stayed at 1022: accompanying GPU commands and CPU allocations were reduced, not the number of evictions. Measurements vary between runs with system load.

### Transparent pickup sources

`isEmptyPackedTile` recognizes only a valid 8-byte packet of fully zero RGBA, checking the magic and the empty-run length. Raw bytes, unloaded references and unknown packets are not considered empty. `captureRegion` skips upload/draw for such immutable non-resident sources, including after loading from storage. A resident GPU texture always takes precedence: it may contain a new stroke on top of an empty CPU snapshot. An empty capture still clears the result.

This exception applies only to pickup. A transparent active tile must not be skipped in the same way during presentation: it may erase earlier overview pixels. **Check ABR presets** checks empty packed/storage sources without display allocation, clearing of the previous pickup, and new resident ink on top of an empty snapshot.

In the 2048 px benchmark, skipping empty sources reduced submissions from 25411 to 25171 with the same hash 879438226; the time gain is small relative to run-to-run variation. **Measure huge smudge** now takes the median of three warm passes. Raising the output-only eviction batch from 16 to 32 was tested and not enabled: median 3673.6 versus 3760.2 ms with staging growing from 8 to 16 MiB. Fewer capacity waits alone do not prove a substantial speedup.

### Pixel cache and temporary scratch

A pixel tile owns output/mipmaps/camera, while coverage and instance buffers live in a separate `createStrokeScratch`. Normal brushes and Dual Brush pin scratch to the tile because their mask/dual coverage accumulates. Smudge, Blur/Sharpen and Mixer without Dual Brush use up to 32 independent scratch slots per batch. Commands must be submitted before slots are reused; base is updated only within the current composite scissor. Scratch contains no document history.

With the standard budget, sampling can hold 416 pixel tiles instead of 128 full ABR tiles. The texture-byte calculation: `128 × (4/3 + 4) = 416 × 4/3 + 32 × 4`; instance buffers shrink further. `cacheTiles` remains a hard explicit limit, including for tests with 1/16 slots. On switching to sampling, the old persistent scratch is released. The reverse switch releases the sampling pool and shrinks the cache to 128 **before** the new rasterization; at this boundary all pixels are already committed. Cancel removes modified pixel tiles; reset/destroy release the pool.

Finish reads resident output in chunks of up to 128 tiles (32 MiB staging), packs CPU snapshots immediately, and only then publishes changes. Growing the pixel cache must not grow the single commit buffer. `stats.gpuBytes` includes scratch textures and instance buffers; it is an estimate of allocated resources, without exact accounting of small uniforms, bindings and the transient commit buffer.

`sharedScratch: false` keeps per-tile ownership for comparison. The scratch comparison used the same fused shader: one cold and three warm passes, finish time separately, identical hash of all pixels. Scratch and pickup batching are now enabled in both benchmark variants; mip chain building is what is compared. **Check ABR presets** additionally checks expanded-cache → Paint → Dual Brush → cancel → resume → reset on one renderer against a per-tile reference.

Local median of three warm passes 2026-09-08, one fused shader in both variants: 2048 px — 3722.2 → 2348.8 ms before finish (−36.9%), hash 879438226; 512 px — 1448.0 → 1423.8 ms, hash 3903305714. For 2048 px readback batches 1022 → 542, submissions including finish 25171 → 15262, allocated GPU resource estimate 293.7 → 272.2 MiB. For 512 px memory 190.0 → 134.4 MiB. Finish separately: medians of about 112 → 136 ms and 22 → 54 ms respectively: more output stays resident until the end of the stroke. This is a synthetic GPU load, not a stylus latency measurement.

### Submitting a pickup batch only before its sources are invalidated

`createCanvasPickup` keeps a Set of sources only for the current batch (up to 32 draws). `flush(source)` checks this Set, and after submission clears it together with the uniform slot index. When a texture in use is actually recycled, the flush remains mandatory. Version/coarse entry replacement and LRU eviction in `displayCache` report the identity of the texture being destroyed before its GPU resources are released. Awaiting a snapshot load does not require a submission, since it does not change already encoded sources.

`batchPickupUploads: false` enables the previous eager policy for comparison. **Check ABR presets** checks 64 differently colored tiles over two uniform-pool cycles: notifications about an unrelated texture yield exactly 2 submissions, overwriting the single source in use yields 64, and pixels are exact in both cases. A lookup error does not interfere with the next capture.

Local medians of three warm **Measure huge smudge** runs, 2026-09-08: 2048 px — 2499.5 → 2295.7 ms (−8.2% time before finish), submissions 15262 → 14398, hash 879438226. The GPU memory estimate stays at 272.2 MiB, readbacks at 542. For 512 px 1512.9 → 1492.0 ms and only 3 submissions eliminated: no noticeable speedup in this load. These are synthetic desktop measurements with unchanged quality/spacing, not real stylus latency.

### Mip chain levels by presentation scale

`mipLevelReady` marks the last up-to-date level, starting from level zero. Every output write, pixel slot reuse and disposable tail update resets it to 0. `ensureMipmaps` builds only the missing suffix via `generateMipmaps(base, count)`, where count includes the source level. Display-cache coarse entries already have a complete correct prefix relative to their downscaled size.

Presentation computes the LOD from the actual texture width and zoom × DPR, with one extra level for trilinear filtering and viewport rounding. Classic minified pickup still requires the full prefix; Smooth reads only level zero. Cold coarse entries keep the previous preparation path, and the persisted overview pyramid is unchanged.

`adaptiveMipmaps: false` enables the full chain for GPU comparison. Performance QA alternates reference/current on each repetition, so as not to compare two long separate time windows. **Check ABR presets** compares full RGBA frames of both variants at zoom 4–130%, rotation/mirror, fractional DPR, drawing over high-frequency/translucent sources, live tails, commit/reset, and switching a coarse cache entry to a more detailed one. All bytes must match. In TypeGPU 0.11.4 each generated level triggers a separate blit/submission; limiting the chain reduces both passes and submissions.

Interleaved local measurement 2026-09-08, median of three warm passes at 25% zoom: 512 px — 1455.5 → 826.2 ms (−43.2% drawing time), submissions 34167 → 14732; 2048 px — 2340.5 → 2236.1 ms (−4.5%), submissions 14398 → 7718. Hashes 3903305714/879438226 and GPU memory estimates did not change. 2048 px still has 542 readback batches, which limits the gain. The first separate run had large timing outliers; the estimate uses the interleaved results, not the inflated comparison from that run. Finish time is measured separately; this is a synthetic desktop workload, not stylus latency.

## Error contract

`packages/paint-core/src/asyncResult.ts` defines `Result<T, E>` and `attempt(action)`. On success `ok: true` and `value` are available, on failure `ok: false` and `error`. `attempt` invokes the operation immediately, before the first await. This preserves user activation for fullscreen and the submission order of GPU commands. Errors from external APIs are typed `unknown`; an existing `Error` is kept, other values become an `Error` with the original `cause`.

In the app, expected failures are `PaintError` values from `src/shared/errors.ts` returned as `neverthrow` results (engine, brush, fullscreen and install kinds, plus `GpuError`/`AbortedError` from `@app-game/solid-gpu/errors`). A paused renderer (`GpuError`) or a failed preset restore offers "Restore renderer".

`createTaskQueue().run(action)` returns the result of each operation and starts the next one after any outcome of the previous one. The caller is responsible for handling `error`. `drain()` captures the tail at call time and returns its result rather than discarding the error. This module is used by the worker command queue and the storage transaction queue.

GPU readback returns `ready: Promise<Result<Uint8Array[]>>`. The result for an active tile is kept until it is checked on redraw, presentation, or stroke finish. The result of a cancelled generation is not published. The staging buffer is released in `finally`, which checks the owner's generation.

Some existing interfaces, including rasterization and checkpoint writes, still return ordinary rejecting Promises. `unwrapResult` marks the transition to that contract and may throw the original error. Do not use it where the caller must choose how to recover. TypeScript does not check a function's list of exceptions: `Result` makes exactly those outcomes that are part of the return type checkable.

Cancelling the preparation of an overview page is signalled by `ObsoletePageError`. Check it with `instanceof`, not by message text. A disk error with similar text is not a cancellation. Fullscreen uses a separate `FullscreenError`: unsupported API, request already in progress, destroyed component, or browser refusal.

Empty `catch` blocks are forbidden by convention. A handler must do one of: return a typed result, report the error to the operation's owner, release resources and rethrow, or explicitly handle an expected cancellation. `finally` is responsible for releasing resources and must not replace the operation's result.

## What must be preserved when changing code

- GPU copy commands are submitted before source textures are reused. Mapped pixels are copied or packed before `unmap`.
- The readback queue is limited to two buffers. A full queue causes waiting, not new unbounded memory allocations.
- The active preview is not the committed document. A finish error resets the preview and sampler; previously finished strokes remain available.
- Dirty storage tiles are pinned in RAM until the transaction succeeds. Do not clear the dirty flag in an error handler.
- High-res and ready low-res data are saved as a consistent checkpoint. Background saving must not replace newer live pixels.
- The keyed `PaintCanvas` connects from an owned effect whose cleanup is its teardown. Primitives that create `onCleanup` or reactive nodes are declared at component level.
- Decisions within one event must not be based on reading a signal right after writing it. Synchronous state is used to block a duplicate request; a signal is used to display state.

## Verifying a change

From the repository root:

```sh
pnpm --filter @app-game/paint typecheck
pnpm --filter @app-game/paint test
pnpm --filter @app-game/paint test:ui
pnpm --filter @app-game/paint build
```

For GPU and IndexedDB, use `/paint-studio-qa.html` on the web playground dev server (`pnpm dev` at the repository root, port 3120 by default). QA creates isolated documents; do not draw test strokes in the user document on `localhost`. After changes to queues, Check readback queue and Run worker checks are mandatory. After changes to transactions, also Run streaming checks. GPU verification harnesses (`smudgePickupVerification.ts` and others) are in `apps/paint/tests/gpu/`, browser/worker harnesses in `apps/paint/tests/browser/`, and the brush benchmark is `apps/paint/tests/performance/brushPerformance.ts`.

Fullscreen DOM tests mock the browser API. A real request depends on browser support, document policy and user activation. `createFullscreenToggle.ts` reflects the actual `fullscreenElement` via `fullscreenchange`; the regular browser F11 fullscreen mode is not controlled by this API.

### Brush resource ownership

`packages/abr-paint/src/resources.ts` owns decoded r8 coverage per runtime. Uploads copy input bytes; engine scopes borrow immutable-by-contract pixels and pin entries. `packages/paint-core/src/composition/resourceSession.ts` releases pins on finish/cancel and factory/input/finish failures. On input failure the command runtime drops the closed session immediately, so the next pen-down can start normally. Resource command failures use correlated `brush-resources` results and leave document/save state untouched.

Imports and renderer recovery retain the brush cache. Runtime teardown clears it. `src/features/engine/createPaintEngine.ts` re-uploads the selected preset (through `createAbrPresets.ts`) before enabling input on a replacement runtime; the cache is neither document persistence nor a GPU texture cache. Keep ABR decoding outside the cache, and resolve every required texture ID before creating transient GPU stroke state. Run resource model tests, composition UI tests, worker recovery tests, execution-mode QA and worker QA after changing this lifetime.

`packages/paint-core/src/composition/texturedBrushEngine.ts` maps brush size to the circumscribed radius used by raster tile binning. The GPU shader restores native tip half-extents and inverse rotation. Keep that conversion paired; using the unscaled round radius clips rectangular corners. Committed and display-only dabs use the same textured pipeline and stroke mask compositing. `packages/paint-core/src/gpu/texturedStamps.ts` owns lazy device-local mip textures, a 64 MiB/256-entry LRU and weak CPU-resource lookup. Call prepare only between strokes. Run Check textured brushes and both execution-mode/worker checks after changing this path.

### Embedded ABR Viewer

The experimental ABR Brush opens `AbrViewerDialog` (`src/features/abr/AbrViewerDialog.tsx`), which lazily mounts `@app-game/abr-viewer/editor`. The optional `App.onUseBrush` callback is the embedding contract; it owns no Paint imports. The dialog remains mounted while closed to retain the Viewer workspace. `prepareAbrBrush` snapshots the full preset, primary/dual tips and embedded texture. `src/features/abr/createAbrPresets.ts` keeps round/ABR profiles separately and waits for the resource upload before changing the selected brush. The shared `@app-game/abr-brush` sampler drives `abrBrushEngine` and the tiled GPU rasterizer. Preset smoothing replaces the round processor; None bypasses it. See `packages/abr-brush/README.md` for implemented controls and unresolved Photoshop differences. ABR eviction and preview copies must preserve primary color and secondary coverage alongside the normal mask; run `verifyAbrBrush` after changing that lifecycle.

Studio's standalone build needs UnoCSS for the embedded editor. Full Viewer import/export and GPU previews remain in their original modules.

### ABR import ownership

The compact tip-only importer was removed; `.abr` files are imported in the embedded ABR viewer, and `src/features/abr/createAbrPresets.ts` uploads the selected preset through the engine's request correlation (`src/features/engine/createEngineRequests.ts`, which times out a waiting caller but keeps the request outstanding so a retry never uploads the same immutable resource id twice).

### Batched mipmap generation

`packages/paint-core/src/gpu/tileMipmaps.ts` replaces hot `texture.generateMipmaps()` calls for raster tiles and the coarse display cache. In TypeGPU 0.11.4 the stock helper creates a pipeline, views, bindings and a separate submit for each level. Our helper reuses the pipeline and the views/bindings of each texture/mip, then submits the whole chain in one command buffer. Format and filtering are preserved: RGBA8, premultiplied sRGB values, linear sampler. Source writes must be submitted before the call. The helper does not own the texture; level references are held in a WeakMap.

`canvasPickup` passes sources the maximum required mip, based on the ratio of the world footprint to the pickup texture size. Classic uses `ceil(log2(maxRatio)) + 1`, at most 8; Smooth stays at level zero. Any level-zero change resets `mipLevelReady`. Do not mark the whole chain ready after a partial update.

`Measure batched mipmaps` and `Measure Classic smudge` on `/paint-studio-qa.html` alternate the old and new paths with identical source pixels, dab seed, cache and camera. Both keep every dab. The hash of all saved pixels is checked. `Check ABR presets` additionally compares frames under zoom/rotation/edit and fractional/non-square pickup after live edits against full source mip chains.

Measurement on 2026-09-08 in the local in-app browser, 8192 px path, median of three warm runs, without finish:

| Mixing | Brush | Before | After | Submissions before → after |
| --- | ---: | ---: | ---: | ---: |
| Classic | 512 px | 1049.9 ms | 879.1 ms | 16048 → 9551 |
| Classic | 2048 px | 9466.7 ms | 2682.7 ms | 248165 → 34833 |
| Smooth | 512 px | 943.7 ms | 819.1 ms | 16048 → 9551 |
| Smooth | 2048 px | 1661.5 ms | 1452.2 ms | 17726 → 8514 |

Smooth was measured after batching; the later limit on Classic pickup levels does not affect its path. The hash of every comparison matched. Submissions include finish; the times in the table do not. This is a local synthetic stress test, not a measurement of Photoshop speed or stylus latency on a tablet.

### Intermediate frames within a pointer segment

The renderer calls `onPaintProgress` only after a complete Smudge/Mixer/Filter dab and after all of its GPU writes are submitted. The runtime checks the shared 8 ms budget since the previous presentation and, if needed, calls `draw()` directly. Such a draw must not be enqueued behind the current paint: it would wait for the entire backlog. The callback may render/present, but not paint/finish/cancel/reset. Dabs and input/end/cancel keep their order. 8 ms is a soft budget; a single expensive dab and the presentation itself may take longer.

The check after every 16 samples is kept for other engines. It did not cover sparse input: one segment can produce hundreds of dabs. Presentation no longer needs to wait for the whole segment to finish. `workerLatency.test.ts` checks frames within a segment and queued release; the GPU **Check ABR presets** compares full pixels/history with and without intermediate frames, Classic/Smooth, and a one-tile cache.

**Measure Smudge responsiveness** uses a single 8192 px segment and checks that saved pixels match. Local warm measurement 2026-09-08: 512 px — first completed GPU frame 523.3 → 23.5 ms, maximum interval after enabling progress 25.1 ms; 2048 px — 2341.1 → 63.5 ms, maximum interval 63.5 ms. The extra frames increased total time from 523.3 to 605.5 ms and from 2341.1 to 2681.7 ms. This removes long gaps without intermediate frames; it is not a throughput speedup and not a measurement of physical stylus latency. In production, progress requests are limited by the shared runtime clock; QA reproduces this budget without the worker transport.

### Smudge submissions per dab

Smudge now lends one `commandBatch` to single-layer canvas pickup, persistent carry, and tile deposit. The normal resident case submits once per dab instead of three times. It still flushes before placement/scratch slot reuse, resident eviction/readback, or removal of a borrowed display-cache texture. Sample All Layers retains its layer-by-layer pickup submissions. The first pickup-only dab also flushes, and progress callbacks run only after the batch is submitted. A single-dab reference submits here. The bounded multi-dab path below reserves separate parameter/scratch slots.

`batchSmudgePasses: false` is the verification reference. **Measure Smudge submission batching** compares both paths with identical sampling, mipmaps, presentation, and full saved-pixel hashes. In local Chrome on port 3125, a 4096 px Smooth-color stroke with Wet Blender's spacing/scattering produced these warm medians (three runs; isolated synthetic tip, excludes finish):

| Brush size | Separate submissions | Batched submissions | Submissions including finish |
| --- | ---: | ---: | ---: |
| 50 px | 3391.6 ms | 1478.4 ms | 29014 → 9987 |
| 512 px | 799.2 ms | 695.7 ms | 4754 → 2892 |
| 2048 px | 1293.1 ms | 1250.6 ms | 4359 → 3904 |

All hashes matched. The largest footprint remains mostly pixel/cache work; this change chiefly improves long paths with many small dabs. These timings do not measure physical input latency or Photoshop speed. **Check ABR presets** compares separate/multipass against batched/fused Smudge with full pixel equality, Classic/Smooth, Sample All Layers, Finger Painting, Dual Brush, one-tile eviction, and undo/redo.

### Bounded batches of Smudge dabs

`batchSmudgeDabs` defaults to true. Smudge retains commands for at most eight deposited dabs, checks an 8 ms encoding budget, and submits before returning from `paint`. Progress callbacks run only after submission. Dabs remain ordered and are never dropped. Footprints with a circumscribed radius above 64 document pixels flush before and after the dab: cross-dab batching did not consistently improve larger footprints.

`commandSlots` reserves uniforms and scratch against a batch's submission version. Canvas pickup has 32 placement slots, carry has eight parameter slots, and destination scratch retains its existing maximum of 32 tiles. Flushes from any pool, cache eviction, mip generation, or presentation invalidate every pool's prior cursor. End open render passes before flushing. Scratch resize, mixing-mode changes, and independent all-layer compositing also submit pending readers/writers first. GPU textures may be reused by subsequent encoded passes, but their uniforms must not be overwritten until submission.

**Measure Smudge multi-dab batching** compares this against one submission per dab, with equal saved-pixel hashes. In local Chrome, 4096 px Smooth-color path with the synthetic Wet Blender workload, three warm runs: 50 px median 1504.9 → 849.5 ms, 10001 → 2141 submissions including finish. The output contained the same 9514 dabs. Scratch grew from 2 to 16 tiles in this case (reported GPU memory 10.3 → 25.4 MiB); allocation stays within the existing fixed budget. Large 512/2048 px cases use the same submission counts on both paths; timing differences there are not evidence of this optimization helping.

**Check ABR presets** includes dense output from sparse input with changing pressure, bank resize, Classic/Smooth, current/all layers, Finger Painting, Dual Brush, progress frames, 1/8-tile caches, and exact undo/redo. It compares full tile bytes against the single-dab reference. This is a throughput optimization; the benchmark does not measure physical stylus latency.

### Real-preset performance baseline

**Measure original Wet Blender** loads `megapack.abr` through the existing parser and snapshots the actual Wet Blender settings, primary tip and auxiliary resources through `prepareAbrBrush`. It runs isolated 4096 px paths at 50/512/2048 px, mouse pressure 1 and Smooth mixing. Preset loading is outside the timer. Repeated runs must produce the same full saved-pixel hash. This complements the synthetic dense-tip benchmark; its absolute times are not directly comparable because stamp coverage and pressure differ.

Two further experiments were discarded after alternating reference/candidate GPU runs with this preset (three warm runs each). Zero-coverage early return showed inconsistent gains and was slower at 50/512 px in that run. Cached render bundles changed median 50 px time from 877.7 to 892.8 ms, 512 px from 781.9 to 764.8 ms, and 2048 px from 1673.1 to 1665.4 ms. Both preserved pixel hashes, but neither established a worthwhile speedup on this Chrome device. No shader shortcut, bundle cache or experiment flag remains in the production renderer. Future optimizations need a fresh measured bottleneck; fewer API calls alone are not proof of faster strokes.
