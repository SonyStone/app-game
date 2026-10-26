# ABR Viewer

Photoshop brush viewer and editor imported from `SonyStone/ABR-Viewer` into the app-game workspace.

- Shared application: run `pnpm dev` at the repository root, then open `/abr-viewer`. The home page includes an ABR Viewer link.
- Standalone development: `pnpm --filter @app-game/abr-viewer dev` uses port 3020.
- Validation: `pnpm --filter @app-game/abr-viewer typecheck`, `build`, `test`, and `test:e2e`.
- Parser and original brush samples: `packages/abr-parser`.
- Example collections link to Adobe downloads. ABR files are not bundled, and Git LFS is not required.

## Vercel deployment

Connect the existing `abr-viewer` Vercel project to `SonyStone/app-game` and set its **Root Directory** to `apps/abr-viewer`. Enable **Include source files outside of the Root Directory in the Build Step** so Vite can read workspace packages, the shared TypeScript and UnoCSS configuration, and styles.

The local `vercel.json` selects Vite, installs workspace dependencies with `pnpm install --frozen-lockfile`, builds with `pnpm build`, and serves `dist`. The standalone editor opens at `/`. The repository's root Vercel configuration belongs to the shared application and is not used for this project.

Use Node.js **22.x** and set `ENABLE_EXPERIMENTAL_COREPACK=1` for Production and Preview to use the pnpm version pinned in the repository's root `package.json`. Set the production branch to `master`. Workspace packages expose their source files, and the parser's WebAssembly binary is committed, so no separate package or Rust build is needed. See [Vercel monorepos](https://vercel.com/docs/monorepos) and [build configuration](https://vercel.com/docs/builds/configure-a-build).

After these changes are pushed, deploy the latest `master` commit from the connected repository. Redeploying an old deployment from the previous repository does not migrate its source code.

## Editor

The viewer uses the workspace versions of Solid 2, UnoCSS, and solid-nest. It processes files locally in the browser. The parser exposes separate Node and browser entry points. Zod's v3 compatibility export preserves the imported schemas while using the workspace's Zod 4 dependency.

The editor uses a persistent Brushes panel beside docked Brush Settings. Import files using the toolbar or drop them anywhere in the workspace. Click a preset to edit it immediately; drag presets and groups to reorder them. Group menus provide rename, sub-group creation, export, and delete. The divider and thumbnail size control adjust the workspace density.

The toolbar's Examples button opens a modal gallery with Watercolor, Spatter Brushes, Manga, Halftones and Screentones, Gouache, Dry Media, Megapack, and Spring Brushes 2024. The cards use artwork from [Adobe's brush collections page](https://www.adobe.com/uk/products/photoshop/photoshop-brushes.html), with a scrollable three-column layout, collection descriptions, and Adobe download links. The transparent, borderless dialog sits over a dimmed backdrop and reveals its cards with a short staggered animation, disabled for reduced-motion preferences. The round corner close button, Escape, and clicks outside the cards dismiss the modal. The eight collections contain 939 presets in total. Each card opens the original Adobe download in a new tab. Import the downloaded ABR file using the toolbar or drag and drop. Only the cover images are bundled with the application.

Texture has a swatch picker for embedded patterns. Dual Brush shows a scrollable tip grid with sizes and a selected-tip preview. Both load visible thumbnails through the shared worker. The stroke canvas starts at 260 pixels tall; drag its horizontal divider to resize it, use Up/Down while the divider is focused, or double-click to reset.

Valid edits update the collection, stroke preview, and exported descriptors together. Undo/redo retains the last 50 document operations without copying sample buffers. Workspace, group, and selection exports preserve folder structure. Sessions remain in memory, so export before refreshing or closing the page.

Brush Tip Shape, Shape Dynamics, Scattering, Texture, Dual Brush, Color Dynamics, Transfer, Brush Pose, and Smoothing have editable panels. Noise, Wet Edges, Build-up, and Protect Texture have preset switches. Imported bristle and erodible tips expose their specialized controls. Bindings use Photoshop descriptor keys and preserve untouched fields. See [Brush Settings compatibility](../../../photoshop-analysis/integration/apps/abr-viewer/brush-settings-compatibility.md) for coverage and remaining limitations. This is not yet a complete Photoshop brush engine.

Brush cards, the settings preview, and Paint's brush libraries use the shared `paint-core/preview` service. One worker owns one WebGPU device, the Paint tile renderer, registered ABR/round/textured engines, and bounded brush-resource caches. Each sample is a tiny document. Mixer, Smudge, Blur, Sharpen, Eraser, and History Eraser operate on real sample layers, so pickup, all-layer sampling, filtering, and history restoration use Paint's code.

Interactive strokes capture settings once at contact. Pointer packets contain only new samples, including coalesced events, pressure, tilt, twist, and available tangential pressure. The engine's `add`, disposable `preview`, `idle`, and `finish` methods handle the gesture. Work is dispatched at most once per animation frame with one packet in flight. Held contact uses engine idle ticks. Double-click restores the shared synthetic recording, whose pressure, tilt, and rotation also drive thumbnails. No growing path is copied, serialized, or replayed on pointer movement.

Visible samples are queued on demand. Active previews take priority, queued settings use latest-wins replacement, and stale results are closed. Interactive contact suspends thumbnail work. Only completed thumbnail PNGs enter the persistent cache; intermediate gesture frames never evict thumbnails. Original ABR resource buffers are cloned for transport, never detached or modified. Tip, pattern, and dual-grid swatches are ordinary coverage/luminance images, independent of the stroke renderer.

WebGPU initialization, device, or worker failure produces a clear error reason. There is no CPU stroke renderer. Preview canvases retain `data-preview-backend`, `data-preview-state`, and `data-preview-reason`, plus worker-render and dispatch-to-presentation timing attributes. The worker is released one second after the last preview unmounts. Viewer output is bounded to 2048 × 512 pixels at up to 2× display density. Paint's existing live-canvas worker remains independent because its renderer owns a single active stroke; the two applications share the preview worker when embedded in the same page.

`test` checks document editing/export, descriptor round trips, pressure/spacing, deterministic jitter, build-up, and smoothing. Paint-core tests cover queue priority, incremental packet merging, stale disposal, shared worker lifetime, source-buffer preservation, persistent thumbnail identity, and failure reporting. `test:e2e` exercises the real Paint renderer for opacity ceilings, pressure/pose, packet determinism, smoothing, texture/dual/color/noise/wet-edge effects, native brush color, and retouch/history behavior. The former CPU/GPU preview comparison page is removed.

Playwright starts its own server on port 3120 and uses system Chrome. Set `ABR_VIEWER_E2E_PORT` to choose another port, or `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to select another executable.
