# Paint Studio design QA

Status: PASS — 2026-09-05.

## Reference and implementation

The user requested the minimal floating controls of `/grease-pencil-typegpu`, Sketchbook-style access to brush/color settings, and the supplied navigation Puck image. The original Puck image is used directly with semantic interactive zones over it.

| Reference | Implementation | Assessment |
| --- | --- | --- |
| [Grease Pencil, 1280×720](studio/qa/grease-reference.jpg) | [Paint, 1280×720](studio/qa/mixing-layers-desktop.jpg) | Same small line icons, neutral surfaces, narrow left rail, right brush/color controls, compact bottom actions. Canvas content and painting-specific controls intentionally differ. |
| [User Puck image](../navigation-puck/src/assets/navigation-puck.png) | [Desktop Puck](studio/qa/puck-desktop.jpg), [mobile Puck](studio/qa/puck-mobile-final.jpg) | Exact supplied image, scaled proportionally. Blue pan ring, center zoom, lower rotation arc and close button aligned to image. |
| [Initial mobile panel](studio/qa/brush-mobile.jpg) | [Final mobile panel](studio/qa/brush-mobile-final.jpg) | Removed duplicate heading and heavy native slider tracks; retained readable values and generous input hit areas. |

## Responsive checks

Screenshots and DOM measurements were taken in the in-app browser against the standalone production build. Viewport emulation verifies layout; physical touch/stylus hardware was not tested in this pass.

| Viewport | Evidence | Result |
| --- | --- | --- |
| 320×568 | [Panel](studio/qa/brush-small-final.jpg), [lower controls after scrolling](studio/qa/brush-small-scrolled.jpg), [Puck](studio/qa/puck-mobile-final.jpg) | No document overflow. Panel scroll exposes color mixing, heading/close remain available. Open Puck stays inside viewport after resizing. |
| 390×844 | [Brush panel](studio/qa/brush-mobile-final.jpg) | Bottom panel fits with readable controls and persistent bottom actions. |
| 844×390 | [Landscape panel](studio/qa/brush-landscape.jpg) | Panel uses window height and scrolls; close stays visible. |
| 1280×720 | [Layers](studio/qa/mixing-layers-desktop.jpg), [Drawing menu](studio/qa/drawing-menu-desktop.jpg) | Floating panels fit; opening panels does not resize canvas. |
| 1920×1080 | [Brush panel](studio/qa/brush-large-final.jpg) | Controls retain useful size; additional space goes to canvas. |

The large-screen screenshot precedes the final mirror-icon replacement; the desktop Layers screenshot shows the corrected mirror icon.

## Interaction and rendering checks

- Puck: outer ring pans, center changes zoom (100% → 149%), lower arc rotates (−44° observed), close works. Resizing an open Puck clamps it inside the smaller viewport.
- Brush/color/layers/file panels open from their launchers and close with their close controls. Color swatches update new strokes; the lower brush mixing selector remains reachable at 320×568.
- Drew intersecting red and green strokes on the isolated production-preview document. Added a layer, painted, erased and used undo/redo. Existing Normal layer mode was preserved; explicitly switching it to Smooth color worked. New layer defaulted to Smooth color.
- Fresh production-tab error/warning console: empty after these interactions.
- Real GPU checks: all passed, including stroke mixing in both red/green orders and layer mixing, with expected RGB (188, 188, 0) at equal contribution. Existing tile seams, erasing, cache eviction, incremental/full rendering comparisons and device recovery checks passed.
- Real worker checks: batched input, exact undo/redo, IndexedDB restart, recovery, portable import and PNG export all passed.
- Final TypeScript check, 26 unit tests and standalone production build passed.

## Findings resolved

1. Oversized permanent header/sidebar replaced with compact floating controls and on-demand panels.
2. Duplicate Brush heading and heavy native slider tracks removed after screenshot comparison.
3. Short viewports use a scrollable panel with sticky heading rather than clipping controls.
4. Puck sizing now observes reactive viewport dimensions, so an already open Puck adapts to resizing.
5. Incorrect lifecycle cleanup registration fixed; verified production UI remains interactive without console errors.

No unresolved layout blockers in the tested viewports. Smooth color is linear-light RGB compositing, not a pigment simulation. Existing Multiply modes and already rasterized dark intersections are preserved; users can change layer mode for future compositing.


## Puck behavior port, 2026-09-05

Adapted the controller and invocation lifecycle from Grease Pencil's `createNavigationPuck.ts` and `CanvasViewport.tsx`. The supplied image and its ring/center/arc zones remain; 3D orbit and the four-quadrant layout do not apply to Paint.

- Matched vertical incremental zoom, viewport-center pivot, hidden captured drag, one-shot close, held-Space reopening, cancellation and second-pointer ownership. Right-drag uses the existing pictured zones with the source's 30px selection threshold.
- Browser comparison confirmed that both applications close after one-shot pan. Paint also passed zoom, right-click invocation and off-center Puck rotation, with no console warnings/errors in the production preview.
- Automated controller/input tests cover Space release before movement, repeated held operations, ignored secondary pointers, angle wrapping/snapping, right-drag selection, blur cancellation, no accidental brush commands and viewport resizing. All 37 tests passed; TypeScript and production build passed. Physical pen/multitouch hardware and a continuously held Space gesture were not exercised through browser automation.

## Shared library extraction, 2026-09-05

Puck UI, image, styles, 2D/3D controller and canvas hotkey/right-drag bindings now belong to `@app-game/navigation-puck`. Both editors use its 2D component; Grease 3D uses its Orbit layout. Paint retains only `paintNavigation.ts` for camera conversion. See [shared verification](../navigation-puck/QA.md). Previous local controller/component paths in the historical entries above describe earlier iterations and have been removed.


## Sparse document storage and canvas wireframe — 2026-09-05

Replaced the 1024 raw-tile ceiling with a 256 MiB stored-pixel budget and a separate 65,536-tile metadata bound. Empty RGBA runs compress losslessly in committed tiles, history and evicted active-stroke masks/output. Dense tiles stay raw. Version-2 files store packed tiles; version-1 files still import.

Validation: 44 unit tests, strict TypeScript and the standalone production build passed. Real GPU pixel/compositing/cache/device-recovery checks and worker file/IndexedDB/undo/redo/PNG checks passed. A continuous 1101-tile GPU stroke used 34.40 MiB stored instead of 275.25 MiB raw, retained both endpoints after eviction, and survived undo/redo and rendering at 5% zoom.

Browser check: Drawing menu → Canvas wireframe shows occupied tile boundaries, the tile renderer's diagonal triangle edge and document/GPU-cache memory. The overlay follows camera rotation and is a separate SVG, excluded from saved drawing pixels and PNG export. Tested in an isolated origin, preserving the user's open document.
