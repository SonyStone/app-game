# Paint Studio design QA

Status: PASS — 2026-09-05.

## Reference and implementation

The user requested the minimal floating controls of `/grease-pencil-typegpu`, Sketchbook-style access to brush/color settings, and the supplied navigation Puck image. The original Puck image is used directly with semantic interactive zones over it.

| Reference | Implementation | Assessment |
| --- | --- | --- |
| [Grease Pencil, 1280×720](studio/qa/grease-reference.jpg) | [Paint, 1280×720](studio/qa/mixing-layers-desktop.jpg) | Same small line icons, neutral surfaces, narrow left rail, right brush/color controls, compact bottom actions. Canvas content and painting-specific controls intentionally differ. |
| [User Puck image](studio/assets/navigation-puck.png) | [Desktop Puck](studio/qa/puck-desktop.jpg), [mobile Puck](studio/qa/puck-mobile-final.jpg) | Exact supplied image, scaled proportionally. Blue pan ring, center zoom, lower rotation arc and close button aligned to image. |
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
