# Navigation performance, 2026-09-22

## Previously unopened DropMeFiles PDFs, 2026-09-23

The nine failures from the 21-file `DropMeFiles_4nDdq` corpus now pass PDF import.
The final navigation-only replay of their GDOCs completed 81 scenarios and all
573 page visits, with no renderer errors or GPU-completion timeouts. It used Chrome
153.0.8010.53/Metal at 2500×1600 CSS pixels, DPR 2. The other twelve files belong to
an earlier run; this follow-up does not claim a fresh full-corpus pass for all 21.

The files are parts 2/3 of ПОБЕДА-80, chapters 02/03 of volume 2, the НЕНАШЕВОЙ
catalogue, and parts 1/2/4/5 of РП_2026-2027. Import through the actual viewer and
WASM is recorded separately from the final navigation replay. Original PDFs and
GDOCs stay outside the repository. Evidence is under
`Sync Folder/pdf-rendering-tests/dropmefiles-fixed`: `navigation-run.json`, each
file's `import-verification.json` and `navigation-final.json`, captures, and the
combined `index.html` report.

Retained fixes:

- PDF mesh shading types 4–7 use isolated, tiled images, at up to 288 dpi with a
  4096-pixel long-edge cap. Surrounding text, paths and clipping retain their curves.
  Generated browser fixtures cover triangle meshes, Coons/tensor patches, function
  colors and GDOC reopening. Mesh detail is finite at extreme magnification.
- Input and decoded-section budgets are 2 GiB minus one byte. Encoded image payloads
  allow 1536 MiB; one decoded image remains limited to 128 MiB. These are allocation
  safeguards for whole-document WASM conversion, not limits of the PDF specification.
  GPU image atlas budgets are unchanged.
- Conversion owns its input, drops parser state before encoding, and moves the PIXL
  arena into the encoded container. It avoids duplicate gigabyte-scale copies and
  reserves bounded output capacity before appending sections. Per-image growth uses
  bounded increments instead of repeatedly doubling a large arena.
- General curve coverage uses 16 two-point Gauss bands rather than the nested
  endpoint-splitting loop that stalled this Chrome/Metal workload. This is bounded
  numerical quadrature, not an exact-area promise for arbitrary thin complex paths.
  Recognized rectangular contours have separate analytic area clipping, including
  holes, overlap, rotation and shear. The existing strict curve/table comparison,
  independent ink tests, and added thin-frame/degenerate-path cases stay enabled.
- LOD ignores a source axis with one texel. Hundreds of stretched gradient ramps
  no longer consume the detail atlas with unnecessary requests, leaving room for
  photographs. Chapter 3 page 18 was checked against a Poppler reference and now
  shows its photos at full requested detail rather than permanent coarse tiles.

This is not a stable-60-fps result. In the final nine-file replay, part 2 of ПОБЕДА
had a letter-view median around 44 ms. РП part 1 had overview median/p95 14.2/16.7 ms,
but its far-view p95 reached 73.4 ms. Timings include CPU submission and GPU
completion, not hardware presentation. Large imports also remain whole-document
operations: the 1.13 GiB catalogue took about 211 seconds to open on this laptop.
The Android tablet was not retested in this follow-up.

Final code verification: 158 unit tests, 51 Rust tests, all 16 browser scripts,
WASM parity with the legacy demo, Clippy, TypeScript checking and production build.
The original РП part 1 PDF was imported again after the renderer changes and
completed the full UI/navigation/page-sweep check; opening took about 137 seconds.

## Full local corpus, 2026-09-23

The root of the local Sync Folder contains 16 PDFs. The final sequential run used
installed Chrome 153.0.8010.53 on Apple Metal, a 2500×1600 CSS viewport and DPR 2
(5000×3200 canvas pixels). Each successful run imported the original PDF through
the UI, exercised wheel/drag, then opened its downloaded GDOC in a fresh browser.
Nine 45-frame scenarios cover overview, far/medium zoom, page/detail/letter scales,
rotation, animated zoom and overview return. Every page is then visited at reading scale.

**13 of 16 completed the whole matrix, totaling 4,297 page visits. The corpus does
not yet meet the no-freezes/no-major-slowdown target.** Outstanding failures:

- GPU Pro 6: GPU completion stalled in the fresh-browser overview (90-second timeout).
- Head First HTML5 Programming: import and preparation completed, then GPU completion
  stalled for more than 110 seconds after the viewer reported ready.
- The AI Systems of Left 4 Dead: pointer navigation timed out after 90 seconds.
- Learning Web Design completed all 621 pages but overview CPU time was 127–131 ms.
  Overview/far CPU+GPU medians were 140–151 ms; p95 reached 165 ms. Reading-scale
  median was 7.5 ms. A CPU profile attributes most overview work to image tile candidate
  generation/sorting and associated allocations, not draw-command submission.

GPU Pro 7 completed all 322 pages. Overview CPU+GPU median/p95 was 11.5/13.9 ms;
returning to overview was 18.1/26.9 ms. The zoom-cycle p95 was 16.5 ms. These are
completion latencies with one outstanding measured frame, not hardware display FPS.
The full result includes slow frames and is not a stable-60-fps claim.

Retained changes from this corpus investigation:

- BINS allocation prioritizes outlines requiring acceleration. Smaller valid outlines
  can omit optional bins when the 32 MiB budget is full; validation stays strict.
- Encoded image resources allow 512 MiB and decoded GDOC sections allow 768 MiB.
  The file limit is still 512 MiB and each decoded image remains bounded at 128 MiB.
  Head First and Pen and Ink now pass conversion; rendering success is checked separately.
- Repeated images and analytic clipping can use overview-only composed prefixes.
  Cheap isolated groups stay direct: caching them exceeded the existing pixel-error budget. Dense inherited clipping retains a mandatory prefix. Ordinary
  foreground stays direct; composed foreground no longer replays retained bundles.
- Fully resident small images skip streaming projections. File changes retain the GPU
  device/canvas while aborting and disposing only the document session.

Experiments with coverage approximations, broader whole-page caching, shader changes
and buffer upload alternatives were discarded. They did not establish a reliable fix
for the remaining GPU stalls. Do not interpret successful unit tests or conversion as
proof that those documents render correctly at every scale.

Local evidence: `Sync Folder/pdf-rendering-tests/all-pdf-final-retina/index.html` and
`report.json`, plus per-document `navigation.json` and PNG captures. The reusable
runner is `tests/performance/corpus.mjs`; README describes options. Source PDFs and
result GDOCs remain outside the repository.

Final validation also covers 157 unit tests, 46 Rust tests, WASM byte parity with the
legacy demo and all 15 browser regression scripts in installed Chrome. The quality
regression caught the cheap-opacity cache change; that change was removed. Comparing
old/new paint plans across the corpus found only FORCE pages 29–31 affected, so FORCE
was rechecked after the correction. The other 15 document plans are identical.

The sections below record earlier measurements with different policies and workloads.

## GPU Pro 7: zoom-out GPU stall

Reproduced with installed Chrome 153 on Metal, separately from bundled Chromium
148. The PDF imports successfully: 322 pages, 478,841 instances, 343 image resources.
Its flattened paint tree has no transparency groups, so the previous policy cached
none of its pages. Dense illustrations exceed the 512-curve area-table limit and
repeatedly use analytic coverage when minified. Chrome GPU-completion waits stopped
resolving during overview navigation; isolated test processes needed termination.
Chromium 148 did not reproduce the sustained stall.

Dense fills now qualify for composed prefixes independently of transparency cost.
Six pages in this book retain such prefixes, all with ordinary foreground kept
direct. The other 316 pages stay direct. Existing tile density, refinement and
memory policy apply; overview base tiles add approximately 1.6 MiB.

Coalescing compatible draws after flattening opaque groups also reduces paint-tree
leaves from 18,267 to 5,295. It preserves painter order, image bindings, blend and
knockout boundaries. This reduced commands but did not fix the stall by itself.

Final Chrome 153 run, all 322 pages at 5000×3200 physical pixels: first frame
completed in 111 ms; five warmed CPU+GPU samples had median 37.8 ms and maximum
67.6 ms. Sixty pan submissions and their final fence completed without GPU errors.
RAF averaged 46.6 Hz; this is neither delivered FPS nor a stable-60-fps result.
A separate UI run opened the original PDF through WASM, zoomed out, dragged and
zoomed back in at DPR 2 without a stuck fence. Further throughput work remains.

Validation: 153 unit tests, 15 browser scripts, typecheck and production build.
Evidence: `Sync Folder/pdf-rendering-tests/gpu-pro-7-hang/final-retina/report.json`,
`final-retina/overview.png`, and `ui-dense-prefix/`. Other folders there contain
intermediate diagnostic experiments, not final measurements.

The performance runner now accepts installed browser and desktop viewport options
documented in README. It records cold CPU/GPU completion before warming caches and
writes its report before optional screenshot capture.

## Current: selective page composition

`planPageComposition` replaces the document-wide raster switch. A page with a
composite score of at least 8 caches its ordered prefix through the last group,
blend or image. Ordinary foreground objects are drawn at the current scale.
Masks, knockout and non-isolated groups remain intact with their backdrop;
this is not arbitrary independent-group extraction or reordering text above images.
Hairlines inside a prefix disable that cache; foreground hairlines stay direct.

In composite-heavy documents, image pages and large vector illustrations may
prepare an overview-only prefix. Large outlines have at least 16 curves and cover
at least 2% of the page by their affine bounds. These prefixes are displayed only
with more than four visible pages and a projected page height at most 512 physical
pixels. Reading/magnified views bypass them. Small text after a large outline is
split out even when it shared the original paint run. Pure text and ordinary image
PDFs without heavy composition retain their existing paths.

Only pages that still need compositing enter the offscreen compositor. A remaining
simple group no longer forces ordinary pages or live foreground through those
passes. Full-page and foreground command bundles have separate caches.

Milk brandbook: 13 pages need composition at every scale, 77 have overview-only
prefixes, and 10 stay fully direct. 65 cached candidates retain live foreground.
A seven-second desktop auto-zoom run submitted 684 frames versus 788 with the
previous whole-document cache. At the one-second magnified view, mean difference
from the settled frame fell from 0.311/255 to 0.00014/255. At 2.5/4.5/6.5 seconds it
was 0.596/0.269/0.094, versus 0.772/0.196/0.092 previously. This is a sharpness versus
throughput tradeoff, not a uniform speedup or a stable-120-fps result. Screenshot
capture and refinement are included; RAF timing alone does not measure delivered
frames. Disabling most caches was substantially slower and is not the final policy.

`createCompositionBudget` samples queue completion after direct submissions.
Two consecutive observations over 8 ms retain the affected optional prefixes for
the rest of the document session; their foreground stays direct. Fast observations
reset the count. Only one fence is pending, disposal makes callbacks inert, and
errors do not change policy. This measures queue pressure including queued work,
not hardware timestamp queries. It can conservatively retain a prefix because of
other GPU work, and it does not currently demote it again during the session.

Final desktop run with this feedback: 686 submitted frames in seven seconds and no
budget promotions. Mean differences at 1/2.5/4.5/6.5 seconds were
0.00018/0.134/0.197/0.091 out of 255. Seven short desktop navigation scenarios cover
all-book, near-overview, medium, page, detail, letter and a zoom cycle. Completed
CPU+GPU p95 across those cases was 1.5–5.2 ms; this does not guarantee 120 Hz delivery.

Android's initial direct letter view took about 37 ms to complete. Retaining slow
prefixes reduced the short completion samples to a median 21.2 ms, with substantial
variation. The seven-second cold auto-zoom improved from 132 to 186 submitted frames
with feedback; it is still only about 27 frames/s, far below 120. RAF continued at
about 60 Hz. The retained live foreground and remaining direct pages are still an
important performance limitation on this device. These results do not establish a
mobile speedup over the older whole-page caching implementation.

The generated browser regression freezes tile refinement, verifies exact live
foreground against direct curves, and checks settled backdrop-dependent blending,
translucent overlays, hairlines and rotation. The full browser suite retains the
strict curve-area and virtual-texture pixel comparisons. Validation: 149 unit tests,
15 browser scripts, typecheck and production build.

External artifacts: `Sync Folder/pdf-rendering-tests/selective-cache/before`,
`large-outlines`, `desktop-budget`, `desktop-navigation`, and `tablet-budget`. Intermediate experiment folders are not
measurements of the final policy. The renderer's `overviewPages` counter is the
number of eligible candidates, not the number currently drawn from cache.

## Previous: continuous auto-zoom refinement

The previous moving-camera gate could block a page indefinitely if its initial
preview took more than 8 ms. Auto zoom never became idle. Waiting for every source
image on a page was a second way to postpone its vector detail while LOD requests
kept changing. The previous regression started on a wide view without an earlier
camera transform, so its first idle batch could hide this bug.

Requested regions now become eligible after at most 100 ms of intentional deferral,
even during continuous motion or image streaming. This is an admission deadline,
not a promise that all pixels finish loading within 100 ms. Missing regions take
priority over refreshing already present tiles. Motion batches allow up to four
tiles and 2 ms of CPU encoding; a completion-based backoff reserves time for input.
The budget cannot preempt an indivisible expensive draw.

Zoom-out first prepares a missing parent tile covering four fine regions, before
those fine tiles. That parent often becomes the requested LOD as the tour pulls
back further. Zoom-in keeps its existing full-detail requests. Intermediate tiles
inherit the original request's age and share the existing retention budget.

The browser regression now starts at a letter, injects a slow preparation fence,
holds image-detail messages, and moves continuously after zooming out. Previously
all 8 requested regions remained missing and blocked; they now finish while motion
continues and delayed images retain their fallback. The worker messages are then
released and the usual settled quality comparisons still run.

`GPU_TEXT_AUTOZOOM=1` in the performance runner runs the actual `createCameraTour`
for seven seconds from letter scale, with a deterministic target. It uses the scene
GPU admission gate and captures before `settle()`, then compares each image with
its fully refined counterpart at the exact same transform. Read-only renderer
refinement counters distinguish queued page detail from finished work; these
counters do not claim source images have finished loading. Screenshots are part of
these diagnostic runs, so interval statistics include their capture overhead.

Brandbook, page 77 target, desktop 1920×1200. A separate baseline server retained
the previous moving-camera gate and single-tile throttle, without modifying the
user's development server. Mean channel difference from the settled view:

| Time into zoom-out | Previous policy | Updated policy |
| --- | ---: | ---: |
| 1.0 s | 3.207 / 255 | 0.463 / 255 |
| 2.5 s | 3.029 / 255 | 0.563 / 255 |
| 4.5 s | 1.297 / 255 | 0.240 / 255 |
| 6.5 s | 0.250 / 255 | 0.094 / 255 |

Desktop updated run: 776 submitted frames in seven seconds, RAF p95 8.8 ms,
maximum interval 74.1 ms. More detail work reduces submitted-frame throughput
compared with the coarse baseline (824 frames). This is not a stable-120-fps claim.

The Android run also makes progress without an idle period, but remains behind
on the larger 2881×1589 viewport: 310 submitted frames in seven seconds, RAF p95
16.8 ms, maximum 116.7 ms. At 2.5 s the mean difference from a settled view was
1.559 / 255. Later wide views still show loading detail. This fixes indefinite
starvation, not the remaining mobile throughput limit.

Validation: 142 unit tests, 14 browser scripts, typecheck and production build.
Artifacts: `~/Sync Folder/pdf-rendering-tests/autozoom-refinement/`:
`before`, `progressive`, and `tablet-progressive` contain the comparative runs;
`tour-N-moving.png` and `tour-N-settled.png` preserve each quality sample.

## Previous: faster refinement, 2026-09-22

Navigation now reuses ready descendant tiles when zooming out, until the requested
physical-pixel LOD is resident. Refinement prioritizes the viewport center. Cheap
pages can refine during motion; pages whose measured preview work exceeds 8 ms
wait for 80 ms of camera inactivity, because an expensive submitted GPU pass cannot
be interrupted. A wakeup also handles the end of a gesture without another frame.

Idle refinement submits up to eight tiles with a 4 ms CPU encoding budget and one
GPU completion fence per batch. MessageChannel yields between batches without
nested timer delays. Moving refinement submits one tile and backs off according
to completion time. Detail tiles use twice the preview's side, capped indirectly
by the 256-pixel preview maximum; this reduces draw/pass count while preserving
the same physical-pixel sampling target. Preview memory remains separately bounded.
The current viewport still takes precedence over the detail-cache retention target.

Image decoding finishes the visible requests for its current source before switching
to another image. Previously, interleaved mip priorities repeatedly decoded the same
large JPEG. Requests include the finest visible mip, so later batches reuse that
resolution. RGB JPEGs resize with the browser's high-quality filter before RGBA
readback, instead of reading and reducing the entire source pyramid on the CPU.
Level zero still reads original-resolution pixels. CMYK retains its existing PDF
color-conversion path. Packed tiles transfer full buffers directly; edge padding and
unpacked tile extraction copy rows instead of allocating a view for every pixel.
The image worker remains warm for five seconds, then releases its source and runtime.
Disposal and failure release it immediately.

Composed pages wait for their currently requested source image texels before
rebuilding. This avoids repeatedly rebuilding a page after each image upload batch.
Old pixels remain visible during that wait. No PDF reconversion is required.

Measured on the existing 100-page brandbook GDOC, excluding file decoding and GPU
preparation. The focused view uses page 82 and overview zoom × 0.12. Timing runs
start with cold image/detail caches; repeated-view timing includes the completion
fence. Desktop and tablet have different physical viewport sizes.

| Device / view | First complete detail | Repeat ready view | Pan RAF/s |
| --- | ---: | ---: | ---: |
| Desktop, before | 2,840 ms | not captured | 120.0 |
| Desktop, focused view | 327 ms | 1.2 ms | 120.0 |
| Android, focused view | 1,391 ms | 30.8 ms | 59.8 |

On the tablet's focused view, larger detail tiles reduce draw calls from about 718
to 190; explicit GPU resources increase from 307 to 322 MiB. These are selected-view
measurements, not a bound on arbitrary PDFs. Cold whole-document zoom still has
occasional long intervals; this change does not establish stable 60 or 120 fps.

Quality checks cover source-image texels, borders, clipping, transparency, rotation,
zoom-out reuse and refinement during continuous movement. A coarse → intermediate
→ full-resolution JPEG worker test recovers the original decoded pixels exactly.
Composed page rendering remains filtered: the actual focused brandbook view differs
from direct rendering by a mean 0.590/255, within the existing 2/255 composed-image
budget. This is not a claim of pixel identity for full PDF pages. Existing strict
curve and hairline budgets are unchanged.

Validation: 140 unit tests, 14 browser scripts, typecheck and production build.
Artifacts: `~/Sync Folder/pdf-rendering-tests/milk-refinement/`; the `*-512`
folders contain the larger-detail-tile measurements and images. `desktop-before`
contains the baseline. `tablet-zoom-budget` checks costly-page deferral.

### Paint app worker reference

Inspected `apps/paint/src/createPaintSession.ts`, `paint.worker.ts`,
`composition/StudioApplication.tsx`, `apps/paint/vite.config.ts`, and
`packages/paint-core/src/pageWork.ts`. Paint transfers the canvas once per session,
keeps DOM input/resize on the main thread, and runs the shared engine behind an
explicit module-worker protocol. Its worker build installs fresh Solid/TypeGPU
plugins. That is the appropriate model for moving this renderer, rather than
serializing shader functions into an RPC worker.

This change does **not** transfer the main GPU canvas: JSX scene composition, GPU
ownership and frame submission remain together on the main thread. Image decoding
already uses OffscreenCanvas in its worker. A full renderer migration must move the
device, resources, scene and submission together, coalesce camera messages, and
replace the DOM canvas on session replacement; it cannot share GPU resources across
the two runtimes. It also cannot eliminate GPU-side stalls on its own.

## Previous: composed tiles for the milk brandbook

Test document: `Логика молока_Брендбук.pdf`, 100 pages, 59,967 instances,
218,298 cubic segments and 806 images. Measurements use its converted GDOC;
PDF import time is excluded. On desktop, the initial whole-document pan completed
in a median 158 ms, with only 7.3 RAF callbacks/s and a 709 ms final GPU queue wait.
Clipping intermediate surfaces alone did not fix the expensive repeated page work.

The renderer now selects composed page tiles for documents with substantial
transparency-pass pressure. Ordinary documents keep their direct curve path.
Pages containing PDF hairlines always remain direct: scaling a cached one-pixel
stroke would change its required device-pixel width. Within direct rendering,
page/group bounds and an ordered instance hierarchy cull invisible work. Scratch
transparency textures are cropped without changing the physical pixel grid.

Composed tiles are generated from the same curve/image/group renderer, with
physical-pixel LOD selection, two-pixel gutters, mipmaps and a 100 ms detail fade.
A page fallback is prepared before showing the document. Its resolution adapts
toward a 32 MiB fallback budget for large documents. Detail has a 64 MiB LRU retention
target; the active viewport and its transition ancestors are protected and can
exceed that target. This avoids eviction/rebuild loops and permanently blurry
regions on large displays. Camera movement never discards resident detail.
Image uploads invalidate only the pages using that image.

Interactive quality policy: ready ancestors remain visible during motion. New
refinement waits for 120 ms without camera changes, then submits one GPU-fenced
tile job at a time. Continuously animated views can therefore remain coarser until
the animation pauses. Source curves are retained, and settled views choose at least
1.25 texels per physical pixel along both page axes, within the supported tile levels.
Refinement is not preemptible once submitted; one expensive job can still overlap
a newly started gesture. The Solid frame loop also admits at most one unfinished
scene frame and coalesces blocked requests into the latest camera state.

Each run below uses 120 animation frames and 10 synchronized completion samples.
Desktop: Chromium 148, Apple Metal, 1920×1200. Android: Wacom MovinkPad 14,
Chrome 153, Adreno 7xx, 2881×1589, DPR 1.75. The test starts settled, then pans or
zooms into uncached regions. During cold motion it intentionally shows ready lower
detail rather than completing new tiles inside the gesture.

| Device | Scenario | RAF callbacks/s | RAF p95, ms | Completion median, ms | Final queue wait, ms |
| --- | --- | ---: | ---: | ---: | ---: |
| Desktop | overview | 120.0 | 8.8 | 2.6 | 0.8 |
| Desktop | near-overview | 120.0 | 9.0 | 1.9 | 0.9 |
| Desktop | medium | 120.0 | 9.0 | 1.6 | 1.3 |
| Desktop | page | 120.0 | 8.6 | 1.1 | 0.9 |
| Desktop | detail | 120.0 | 8.7 | 1.1 | 1.3 |
| Desktop | letter | 120.0 | 8.8 | 1.4 | 1.0 |
| Desktop | zoom-cycle | 117.0 | 8.6 | 1.1 | 1.0 |
| Android | overview | 60.0 | 16.7 | 15.3 | 6.0 |
| Android | near-overview | 60.0 | 16.8 | 11.6 | 9.4 |
| Android | medium | 60.0 | 16.8 | 14.4 | 9.0 |
| Android | page | 60.0 | 16.7 | 11.6 | 6.8 |
| Android | detail | 60.0 | 16.7 | 8.7 | 8.4 |
| Android | letter | 60.0 | 16.7 | 9.6 | 8.8 |
| Android | zoom-cycle | 58.8 | 16.8 | 11.1 | 7.0 |

RAF is not a physical presentation measurement. Completion includes CPU, browser
scheduling and the GPU fence, rather than being a hardware timestamp. On this
120 Hz tablet Chrome's renderer-free RAF baseline remains 60 Hz; no display or
browser settings were changed. Android cold zoom still had two intervals over
25 ms, reaching 41.6 ms, so this is not a guarantee of uninterrupted 60 fps.
The benchmark uses standalone rendering; the JSX admission gate is separately
covered by unit tests and the real viewer interaction check.

Quality validation compares cached tiles with direct original-curve rendering,
including dense text, a smooth image, repeated transparency groups, rotation and
six zooms. Mean channel error ranges from 0.087 to 0.775 out of 255. The actual
brandbook's medium view measures 0.899/255; the selected close page measures
0.432/255. Raster caching is filtered and is not pixel-identical to the vector path.
Screen-space hairline regression remains covered by the original strict test.
The original 0.05/255 area-table test is unchanged. Performance comparison can
explicitly opt into the separate 2/255 composed-tile budget with
`GPU_TEXT_COMPARE_EXACT=1 GPU_TEXT_QUALITY_MODE=composed`.

Validation: 122 unit tests, 14 browser scripts, typecheck and production build.
Artifacts: `~/Sync Folder/pdf-rendering-tests/milk-brandbook-desktop-final/`,
`milk-brandbook-tablet-final/`, and the initial `milk-brandbook-performance/`.

### OffscreenCanvas and Worker

A probe in the tablet's actual Chrome confirmed `OffscreenCanvas.getContext('webgpu')`,
a WebGPU adapter and worker RAF. Production canvas ownership has not moved to a
worker in this change. PDF conversion, document decoding and image decoding already
use workers. The renderer accepts borrowed GPU resources and can be hosted there,
but the device/root, canvas context, resource lifetime and frame submission must
move together. Solid's DOM, pointer events and viewport observation should remain
on the main thread, forwarding only the latest camera/size/scene updates.

That move would isolate command encoding from UI input; it would not reduce GPU
compositing cost or automatically raise Chrome's 60 Hz scheduling ceiling. The
measured GPU bottleneck was addressed first, while preserving the JSX scene API.

## Previous: Android curve-rendering optimization

The bundled demo and imported PDFs take different rendering paths. The 1,273-page demo
uses prepared quadratic geometry with at most eight curves per spatial cell and filtered
raster coverage at small sizes. Game Engine Architecture has fewer pages and instances,
but uses the general cubic path with area integration, clipping and image composition.
The imported book has 628 pages, 1,090,073 fill instances and 286 image instances.
Its slowdown is primarily GPU-side: before this change overview CPU submission took
about 11 ms, while synchronized submission/completion took about 932 ms on the tablet.

The new path expands shared area-table coverage to rare outlines, using 128/64/32 grids
within the existing 64 MiB area-table budget. Conservative 32×32 occupancy grids skip
curve integration only for pixels proven entirely full or empty. A bounded 32 MiB row
index helps magnified curves. Cached, mixed and analytic fill shaders are selected using
conservative scale bounds; command bundles rebuild when that selection changes.
Indexed quads evaluate four vertices, and affine pixel derivatives come directly from
the transform. Crossing-cache overflow still uses the unrestricted scanline algorithm.
Source cubic curves, paint order, clipping and transparency remain available at all scales.

Tablet: Wacom MovinkPad 14, Android 15, Chrome 153, Adreno 7xx, 2881×1589 physical pixels.
Desktop: Chromium 148, Apple Metal, 1920×1200. Each scenario below uses 120 animation frames
and 15 synchronized completion samples, excluding import. Preparation on the tablet takes
about 2.8 seconds. Explicit document GPU resources increased from about 183 to 235 MiB.

| Device  | Scenario      | RAF callbacks/s | RAF p95, ms | Completion median, ms | Final queue wait, ms |
| ------- | ------------- | --------------: | ----------: | --------------------: | -------------------: |
| Android | overview      |             6.7 |       433.3 |                 166.4 |                428.4 |
| Android | near-overview |            19.5 |       124.9 |                  58.8 |                 88.7 |
| Android | medium        |            36.5 |        41.7 |                  33.3 |                 55.4 |
| Android | page          |            50.3 |        33.3 |                  24.5 |                 28.0 |
| Android | detail        |            37.8 |        41.7 |                  31.7 |                 61.4 |
| Android | letter        |            40.6 |        41.6 |                  29.2 |                 36.8 |
| Android | zoom-cycle    |            16.0 |       324.9 |                  38.7 |                282.7 |
| Desktop | overview      |           102.0 |         9.2 |                  11.7 |                 94.5 |
| Desktop | near-overview |           119.9 |         9.1 |                   4.9 |                  4.6 |
| Desktop | medium        |           120.0 |         8.7 |                   3.1 |                  4.2 |
| Desktop | page          |           120.0 |         8.7 |                   1.8 |                  1.8 |
| Desktop | detail        |           120.0 |         8.7 |                   3.4 |                  4.9 |
| Desktop | letter        |           120.0 |         8.7 |                   1.4 |                  4.7 |
| Desktop | zoom-cycle    |           120.0 |         8.7 |                   2.4 |                 40.3 |

Tablet overview completion improved from about 932 to 166 ms, approximately 5.6×.
The page scenario improved from about 38 to 25 ms. These before/after comparisons are
approximate: the initial baseline used only three completion samples and 12 animation
frames. The revised close-up pan stays within the viewport instead of crossing page gaps.
There is no clean task-start baseline for the new magnified-letter scenario.

**The tablet still misses 60 and 120 fps, especially in overview and during zoom.**
RAF callbacks are not physical presentation measurements, and their rate can exceed GPU
throughput when commands queue up. Completion includes CPU, browser scheduling and GPU
work, not a hardware timestamp alone. Even a renderer-free animation currently measures
60 RAF callbacks/s in this Chrome session despite the tablet's 120 Hz panel. No display
settings or Chrome flags were changed. This scheduling ceiling and renderer cost are
separate remaining problems.

The letter scenario centers on an actual glyph boundary on page 12; the zoom cycle moves
from overview toward page 316. Tablet magnified output matched the direct original-curve
path pixel-for-pixel. The independent Poppler page-12 comparison remains close to the prior
result: relative ink error −3.92%, −2.09%, −0.20% at widths 64, 128, 256; mean RGB error
0.713, 0.613, 0.905 out of 255. These checks cover selected views, not all PDF content.

Validation: 104 unit tests, all 13 browser regression scripts, app typecheck and production
build passed. Browser checks cover dense text, scale transitions, rotated coverage,
subpixel strokes, crossing-cache overflow, images, clipping and transparency groups.
Artifacts are in `~/Sync Folder/pdf-rendering-tests/tablet-comparison-2026-09-22/`:
`before/`, `after/`, `desktop/`, `quality-letter/`, and `quality-reference/`.

The next performance work should reduce per-instance work in whole-book views and the
fragment cost of magnified edges. It must preserve pixel-area coverage and verify quality
during transitions; the discarded blurry page previews are not a suitable shortcut.

## Previous: area coverage and shared integral tables

Nearest-edge AA overestimated subpixel strokes. Fills now integrate covered area. Repeated
outlines use bounded summed-area tables, deduplicated across byte-identical PDF font subsets;
zoom blends continuously into original curves while at least four grid cells remain per pixel.
Uncached shapes and magnified text retain curve integration. This avoids the seconds-per-frame
cost of evaluating every small glyph's curves directly. GPU table storage is included below.

Independent comparison: page 12 of Game Engine Architecture, rendered by Poppler at width
4096 and reduced with a BOX area filter. The GPU page was rendered at matching dimensions.
These are checks of one page, not a complete PDF conformance or color-management certification.

| Page width | Relative ink error | Mean RGB error /255 |
| ---------- | -----------------: | ------------------: |
| 64 px      |             −3.87% |               0.710 |
| 128 px     |             −2.10% |               0.613 |
| 256 px     |             −0.18% |               0.907 |

Artifacts: `~/Sync Folder/pdf-rendering-tests/coverage-results/`.
The synthetic area check also verifies known geometry at three rotations, including a
0.1-pixel stroke, holes, both winding rules, curved lenses and crossing-cache overflow.
The dense-text table/curve comparison checks twelve views with mean channel error below 0.05/255.

Desktop rerun: the same 628-page / 1,090,359-instance book, Chromium Metal, 1920×1200,
120 animation frames per scenario plus 30 synchronized completion samples. Explicit GPU
resources are about 183 MiB. PDF import is excluded. RAF callbacks can run ahead of GPU
completion; queue backlog is shown rather than treating callback rate as delivered frames.

| Scenario      | RAF callbacks/s | RAF p95, ms | Completion median, ms | Final queue wait, ms |
| ------------- | --------------: | ----------: | --------------------: | -------------------: |
| overview      |            46.5 |        33.4 |                  29.2 |                543.8 |
| near-overview |           120.1 |        10.2 |                   8.1 |                  7.8 |
| medium        |           120.2 |        10.1 |                   4.0 |                  5.6 |
| page          |           120.0 |         9.9 |                   0.9 |                  2.0 |
| detail        |           120.1 |         9.9 |                   2.2 |                  7.1 |
| zoom-cycle    |            97.1 |        17.1 |                   2.1 |                283.7 |

**Whole-book overview and zoom transitions still miss the 120 Hz target.** This run does not
verify physical presentation rate or Android performance. The tablet was not retested for
this coverage change. Reports and captures are under `coverage-results/performance/`.

## Earlier correction: removing approximate page/glyph previews

Page previews and rasterized outline coverage were removed after the visible blur and
stroke-density jumps were reproduced. Text and paths now evaluate their original curves
at every zoom. Image LOD, exact shader specialization and GPU command bundles remain.
The benchmark below is historical and must not be quoted as current performance.

The first desktop rerun of the exact path on the same 628-page book measured about 23 RAF
callbacks/s in overview, with about 58 ms median submission/completion latency. Explicit
GPU resources decreased from about 239 MiB to 157 MiB. This restores quality but gives up
the previous overview speedup; 120 fps is still an open task.

A dense-text regression failed before this correction (mean channel error 1.72/255) and now
matches the unspecialized curve path pixel-for-pixel in the tested views, including former
LOD boundaries, rotation, images and transparency. This compares to our original-curve
renderer, not a certification of pixel equality with every external PDF viewer.
The real 628-page book also matched the exact path with mean and maximum channel error
both zero in the checked overview. Captures and the report are in
`/tmp/gpu-quality-book-exact`. The post-correction suite passed 99 unit tests, all browser
regressions, app/web typechecks and both builds.

## Historical measurements with approximate caches

The target is 120 Hz, or 8.33 ms per frame. **The Android target is not met.**
The desktop hardware benchmark sustains roughly 120 RAF callbacks/s; Android still drops
frames at intermediate scales and during zoom. These are measurements of the current
working tree, not a claim about every PDF or verified physical display presentation.

## Setup

- Game Engine Architecture, 628 pages and 1,090,359 drawing instances, loaded from GDOC.
- Desktop: Chromium 148, headless, Apple Metal GPU, 1920×1200 physical pixels.
- Tablet: Wacom MovinkPad 14, Android 15, Chrome 153, Adreno 7xx, 2881×1589 physical pixels, DPR 1.75.
- Six scenarios, 360 animation frames each, with 30 synchronized submission/completion samples.
- All runs retained page visibility and screen wake lock. No browser/GPU errors were reported.
- Each scenario prepares its own document. PDF import/decoding is excluded from frame timings.

## Results

RAF rate is 1000 divided by the mean callback interval. It can overstate delivered GPU frames
when work queues up. Completion latency includes CPU, browser scheduling and GPU execution;
it is not a hardware timestamp query. The zoom scenario traverses changing scales, so its
average must be read together with its p95 and worst interval.

| Device  | Scenario      | RAF callbacks/s | RAF p95, ms | Completion median, ms | Final queue wait, ms |
| ------- | ------------- | --------------: | ----------: | --------------------: | -------------------: |
| desktop | overview      |           120.0 |         9.9 |                   0.5 |                  0.8 |
| desktop | near-overview |           120.0 |        10.1 |                   4.2 |                  6.9 |
| desktop | medium        |           120.1 |         9.7 |                   2.9 |                  4.2 |
| desktop | page          |           120.1 |        10.2 |                   0.5 |                  1.0 |
| desktop | detail        |           120.0 |         9.8 |                   0.5 |                  2.0 |
| desktop | zoom-cycle    |           119.7 |         9.8 |                   0.7 |                  1.5 |
| android | overview      |            60.0 |        16.8 |                   8.7 |                  9.4 |
| android | near-overview |            25.8 |        75.0 |                  59.4 |                 67.8 |
| android | medium        |            45.0 |        33.4 |                  38.2 |                 36.0 |
| android | page          |            60.0 |        16.7 |                   9.0 |                 10.0 |
| android | detail        |            51.2 |        33.4 |                  16.6 |                 46.2 |
| android | zoom-cycle    |            37.5 |        83.4 |                  14.0 |                  6.8 |

The tablet's zoom cycle reaches a worst callback gap of 325 ms. A smooth overview alone
therefore does not establish smooth navigation. Current document-owned resources total
about 239 MiB, excluding the browser, driver command storage and swapchain.

## Quality and changes

Page previews now wait for image detail at their capture resolution instead of permanently
capturing tiny fallback mip tails. The Art of Brother Bear overview was checked visually.
Previews only draw below 75% of their resolution in physical pixels, including DPR and
rotation. Larger pages return to curves and streamed images.

Repeated small outlines share mipmapped coverage textures. Ordinary fills use a lighter
shader; axis-aligned segments avoid iterative intersection solving. Equal-color paint spans
batch compatible instances, cached glyphs use four vertices, and ordinary pages reuse render
bundles. Clipping, images and compositing boundaries retain their paint order.

Two further experiments were discarded: duplicating occurrence data as sequential vertex
attributes increased book memory by about 67 MiB without enough benefit; raising page-cache
memory to 256 MiB still did not cover the measured medium scale at the required sharpness.
The page texture budget remains 64 MiB.

## Remaining work

The lightweight browser scheduling test must be separated from renderer cost. Android's
reported 120 Hz display mode does not establish a 120 Hz RAF cadence. A standalone page with only a moving 20×20 CSS element measured
60.0 RAF callbacks/s in both windowed and fullscreen Chrome (240 intervals per mode, p95
16.8 ms). It loaded no PDF or renderer. The test is reproducible with
`tests/performance/refresh.browser.mjs`; its report is `/tmp/gpu-browser-refresh/refresh.json`.
No artificial 60 fps
limit was found in the application's frame scheduler.

Intermediate scales still require too much curve work on the tablet. A bounded cache of
higher-resolution visible page regions would address this without allocating detailed
textures for the entire book. It needs time-budgeted preparation and zoom-transition tests;
it is not implemented in this change. Frame timing also needs GPU timestamp measurements
where available before attributing all completion latency to shader execution.

## Validation and reproduction

103 unit tests, the full browser regression suite, application/web typechecks and both
production builds passed. Browser regressions compare cached and direct rendering, exercise
image detail before page capture, clipping, overlap, rotation and zoom back to exact curves.

See [README](README.md#reproducing-pan-measurements) for commands. Raw measurements and
screenshots from this run are in `/tmp/gpu-navigation-desktop-final` and
`/tmp/gpu-navigation-android-final`. These temporary files are machine-local; no source PDFs
are checked into the repository or uploaded.
