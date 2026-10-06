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

Brush cards and the settings preview share one worker, GPU device, and TypeGPU root. The worker renders instanced brush stamps into a reusable OffscreenCanvas, then transfers ImageBitmaps to presentation canvases. Visible cards are queued on demand; the settings preview takes priority. New edits replace queued work, and stale results are closed. Tip textures and completed images have bounded caches. Original ABR sample buffers are never transferred or modified.

The preview supports sampled-tip aspect ratio, rotation/flips, roundness, hardness, spacing, dynamics, scattering, embedded textures, dual-tip masks, color dynamics, pose overrides, noise, and approximate wet edges. Flow accumulates coverage; a separate local opacity ceiling limits the stroke. Alpha is never gamma-corrected. Synthetic strokes have repeatable pressure, tilt, and rotation inputs. Drag in the settings preview to test mouse or tablet input, hold to test Build-up, and double-click to restore the sample stroke. Smoothing acts on drawn paths. Wheel and dial controls use synthetic values because browser pointer events do not expose those devices.

Embedded patterns stay compressed until the worker needs them. The worker decodes grayscale/RGB patterns and secondary samples into bounded caches. Resource messages copy only the required byte ranges, never reactive objects or entire backing ABR files. Missing or unsupported resources produce a visible preview notice while their original bytes remain available for export.

GPU initialization or device failure falls back to the CPU renderer in the worker. A failed worker uses the same CPU reference on the main thread. Preview canvases expose `data-preview-backend`, `data-preview-state` and `data-preview-reason` for diagnostics. The worker is released one second after the last preview unmounts. Preview textures are limited to 1024 pixels per side and output to 2048 × 512 pixels at up to 2× display density.

`test` checks document editing/export with real ABR files, descriptor mappings and scalar-setting round trips, resource transfer, pressure and spacing, coverage/opacity behavior, deterministic jitter, texture/dual/color effects, build-up, smoothing, queue priority, stale-result disposal, shared-worker lifetime, source-buffer preservation, and worker-failure fallback.

For real GPU validation, start the standalone development server and open `/preview-verification.html`. The button compares GPU pixels with the CPU reference for eleven cases, including texture, dual brush, color, pose, and wet edges, then tests device-loss reporting. Raster edge differences are permitted in fewer than 0.2% of pixels, with mean channel error below 0.3/255. These checks measure agreement between our renderers, not Photoshop. This page is a development check and is not included in the production entry points.

Playwright reuses a healthy server on port 3120. To use an existing Chromium installation, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.
