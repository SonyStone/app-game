# Puck gallery

A dev-only page with several radically different designs of Paint's Puck (pan, zoom, rotate, undo, redo) and tile
cluster (tools, color, brush, layers), each after other programs, to try by hand with a pen, fingers, and mouse and
keyboard. Open `/puck-gallery.html` on the Paint dev server (`pnpm --filter @app-game/paint dev`, port 3030), or
`/puck-gallery.html#<variant>` for one variant.

- `PuckGallery.tsx` — the page: the drawing, stage input (painting, finger pan/pinch, wheel, keys), the variant bar,
  help cards and the shared ways to summon a variant.
- `kit/` — what every variant shares: the mock editor (`createStudio`: tools, settings, presets, color, layers,
  history, view), the layered drawing (`createSketchCanvas`, `stillLife`), the catalog of tools/settings/presets,
  `pressHandlers` (press-drag-lift with pointer capture), `navigationDrag`, value helpers, `StrokePreview`,
  `LayerThumb`, and the variant contract (`variant.ts`).
- `variants/<id>/` — one folder per variant, registered in `variants.ts` and loaded on first use. A variant only
  presents the studio; it must not change the kit.

Summoning is the same in every variant (see `VariantProps`): hold Space, the pen's side button or the right mouse
button (toggles), or a finger's long press on the drawing (450 ms). The bar's Pin keeps a variant open in the middle.
