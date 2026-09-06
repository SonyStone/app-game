# ABR Viewer

Photoshop brush viewer and editor imported from `SonyStone/ABR-Viewer` into the app-game workspace.

- Shared application: run `pnpm dev` at the repository root, then open `/abr-viewer`. The home page includes an ABR Viewer link.
- Standalone development: `pnpm --filter @app-game/abr-viewer dev` uses port 3020.
- Validation: `pnpm --filter @app-game/abr-viewer typecheck`, `build`, and `test:e2e`.
- Parser and original brush samples: `packages/abr-parser`.
- Recovered experiments and historical source/document versions: `research/recovered-work`. These are reference material and are excluded from compilation.

The viewer uses the workspace versions of Solid 2, UnoCSS, and solid-nest. It processes files locally in the browser. The parser exposes separate Node and browser entry points. Zod's v3 compatibility export preserves the imported schemas while using the workspace's Zod 4 dependency.

The imported editor still has its original unfinished Save/Delete/Duplicate wiring between the detail dialog and the brush tree. Import, inspection, local form changes, folder operations, and ABR export are retained; completing those dialog actions is separate work.

Playwright reuses a healthy server on port 3120. To use an existing Chromium installation, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.
