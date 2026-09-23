# Compact viewer toolbar QA

final result: passed

## Scope and visual target

Selected desktop source: `/Users/ilyaverpovsky/.codex/generated_images/01a0ce4d-d259-7e80-aa18-7a1981837acf/exec-e8817cab-74d8-4d56-8ef5-cee6d978e35c.png` (1487 × 1058).

The user's subsequent written revision supersedes the mock's controls: one row, four icon-only actions (open, overview, fullscreen, more), no document dropdown, page indicator, zoom label or hand tool. The existing canvas renderer and document content are outside the visual redesign. Accordingly, the 1273-page demo and its existing canvas color are retained; the generated car-book pages and amber page selection are not product assets to reproduce.

## Evidence

Implementation URL: http://127.0.0.1:3181/

Screenshots: `/Users/ilyaverpovsky/.codex/visualizations/2026/09/23/01a0ce4d-d259-7e80-aa18-7a1981837acf/viewer-ui/`

- `1440x1024.png`, `1440x1024-menu.png`
- `390x844.png`, `390x844-menu.png`
- `320x568.png`, `320x568-menu.png`
- `844x390.png`, `844x390-menu.png`

All screenshots use the named CSS viewport dimensions and deviceScaleFactor 1. Chrome with Metal/WebGPU rendered the real full demo, after overview, with grid and vector debug options disabled. Source and desktop screenshot were opened in the same comparison input. Comparison is semantic and focused on the user-revised toolbar, not a pixel-difference test of different PDF content. The source's pixel density is unspecified; its approximately 1.033 scale relative to the 1440 × 1024 brief is accounted for when assessing icon size. Mobile full-screen evidence makes the 202 × 58 toolbar and expanded menu directly readable, so no additional toolbar crop was necessary.

## Findings and fidelity surfaces

No remaining P0/P1/P2 findings within the revised UI scope.

- Typography: system sans-serif, 14px menu actions and file title, 12px secondary text, readable wrapping of long filenames. Main toolbar is icon-only as requested.
- Spacing/layout: 44px targets, 4px gaps, 6px padding, 19px toolbar radius. One row at all four tested sizes. Menu fits the viewport and scrolls in short landscape view. Bottom safe-area padding and viewport-fit are included.
- Colors: charcoal toolbar/menu, light icons and text, amber keyboard focus/check state, restrained shadow. Existing renderer background is intentionally unchanged.
- Assets: five imported Tabler SVG assets, no rasterized UI, no document downsampling or substitute document artwork.
- Copy/content: four actions, document name only inside the menu, GDOC export when available, demo return, existing options, help and licenses.

## Verification and fixes

- Menu arrows/Home/End, Escape with focus return, outside click, and toggle items remaining open pass in Chrome. Arrow navigation and Escape also verified manually in the Codex browser.
- Corrected checkmark accessibility so selected items retain their accessible names.
- Corrected Solid 2 untracked-read diagnostics in fullscreen setup and the one-shot overview viewport snapshot. Final browser run reports no console errors/warnings.
- Overview returns to the exact fitted camera after gestures; mixed-size pages fit above the toolbar. Large overview zoom no longer snaps while panning.
- Fullscreen entry/exit, responsive bounds, gestures, idle RAF, resize, GPU loss, and missing GPU pass.
- PDF import, GDOC download/reopen, image rendering and resource lifetime pass through the updated controls.
- 170 unit tests, TypeScript checking, production build pass. Build retains the existing large-chunk advisory.

## Limits

Codex's embedded browser reports no WebGPU adapter. It was used to inspect the menu and error state, while Chrome browser tests supplied GPU rendering screenshots. Physical iOS/Android devices and nonzero safe-area insets were not tested. Browsers without fullscreen support show a disabled fullscreen action.

## Implementation checklist

- [x] Four icon-only buttons in one floating row
- [x] Local Solid-UI buttons and dropdown
- [x] Accessible keyboard and pointer behavior
- [x] Secondary actions retained
- [x] Overview geometry and gesture regression coverage
- [x] Desktop/mobile screenshots and browser verification

## Language update

English is now the default. All five dictionaries cover toolbar controls, menus,
help, loading/export progress, accessible labels and error headings. Original
library error details are retained. The Hebrew screenshot `viewer-ui/he.png` at
390 × 844, DPR 1, was inspected: RTL text, radio indicators and toolbar alignment
are correct; page content is not mirrored. The scrollable menu contains language
names in their native scripts. No new actionable visual findings.

177 unit tests pass, including router integration on the host route. The browser
language test verifies five locales, English despite a Russian browser locale,
unknown-locale fallback, query/hash preservation, reload, back/forward and no
extra document fetches. The controls browser test and production build pass.
