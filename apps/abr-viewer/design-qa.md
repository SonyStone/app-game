# ABR workspace design QA

Date: 2026-09-06

**Final result: passed**

No actionable P0/P1/P2 layout findings remain in the inspected states. This is a Photoshop-inspired workspace implementation, not a claim of full Photoshop feature or rendering parity.

## Evidence and comparison scope

- Source visual truth: `/var/folders/ll/km05580d2c52z15y49_zjjkm0000gn/T/codex-clipboard-c9c2d7d3-c47e-4747-8008-595b5bb9d580.png` (1918 × 2176 pixels; source CSS size and display density unknown).
- Implementation: `http://localhost:3120/abr-viewer`.
- Screenshot directory: `/Users/ilyaverpovsky/.codex/visualizations/2026/09/06/01a07750-b8e7-7c40-a0b0-ef20bd8e3411/abr-workspace`.
- Final desktop: `desktop.png`, 1280 × 800 pixels and CSS viewport.
- Compact desktop: `compact.png`, 900 × 720 pixels and CSS viewport.
- Narrow: `narrow.png`, 390 × 844 pixels and CSS viewport.
- Implementation capture density: 1 image pixel per CSS pixel. No density conversion was applied. The reference was displayed proportionally at reduced size by the image viewer. The source is a taller composition with different brush content, so comparisons judge workspace structure and styling rather than pixel equality.
- State: eight brushes from three imported ABR files; Soft Round selected, size edited to 80; docked Brush Tip Shape settings and stroke preview visible. Desktop capture follows export.
- The source and final desktop/narrow captures were opened together in the same comparison tool input. Labels, controls, selection outlines and brush cards were readable there, so additional focused crops were not needed.

## Findings and fixes

1. The previous page used a large import region and modal editing. Replaced with a viewport workspace, compact collection and persistent settings. The final desktop capture shows both panels and the preview together.
2. Early editor captures had an oversized tip swatch. Reduced it to 64 pixels and tightened settings spacing; the final desktop and compact captures show the resulting control density.
3. Dragging a brush toward the first position could move it outside its folder. Restricted the root to groups and added an insertion marker and empty-folder target. Repeated the drag and confirmed the brush stayed in its folder in the new order.
4. [P2, resolved] At 390 pixels, the angle/roundness dial forced horizontal scrolling. Allowed the control row to wrap and gave its slider column a minimum width. Recaptured at the same viewport and selection; the final narrow capture has no sideways control overflow. The narrow layout uses vertical scrolling for the full editor.

## Required fidelity surfaces

- Typography: compact sans-serif labels, stronger panel headings and small secondary metadata establish the same hierarchy as the reference. Long brush/folder names truncate within their cells. The reference font cannot be identified reliably from this raster; the app retains its existing sans-serif stack.
- Spacing/layout: adjoining flat panels, a resizable divider, two-column brush cards, category rail and bottom preview follow the reference. Landscape proportions and a toolbar accommodate import/export. A second tip library is intentionally omitted because the collection already selects the active brush.
- Colors: charcoal surfaces, restrained gray borders, white brush previews and a blue selection outline follow the source palette. No decorative elevation or large rounded cards remain in the workspace.
- Image quality: previews come from parsed brush data and the existing canvas renderer. Computed tips have generated brush swatches. These are functional previews of different brushes from those in the reference; Photoshop stroke equivalence is not asserted.
- Copy: concise panel names, settings labels and file commands. Existing ABR names are retained; there is no marketing copy or instruction text from the user prompt in the interface.

## Validation and limits

- Browser exercised import, single-click selection, immediate size edits, switching brushes, undo/redo, duplicate/undo, search, folder expansion, drag reorder and Export all.
- Five workspace tests pass, including edited descriptor export, hierarchy/order, sampled tip bytes, selection export, undo and cycle protection. The parser suite passed 153 tests. Viewer typecheck and production build pass.
- Browser error-log check returned no errors. Existing Solid strict reactive-read warnings remain; this is not a warning-free assertion.
- The updated Playwright suite was not run in this implementation pass; browser interaction checks were performed through the app browser.
- Detailed controls cover Brush Tip Shape, Shape Dynamics, Scattering and Transfer. Other exposed feature switches preserve their existing data; their detailed Photoshop controls remain outside this implementation.
- Workspaces live in memory. Export before closing or refreshing. Exported files were validated by parsing them back, not by opening them in Photoshop.

## Implementation checklist

- [x] Replace page/modal flow with one docked workspace.
- [x] Compact brush previews, grouping, search and drag ordering.
- [x] Immediate edits, preview and undo/redo.
- [x] Selection and full-workspace ABR export.
- [x] Compare source and rendered implementation; fix narrow overflow.
- [x] Typecheck, tests, build and browser error check.

## Follow-up polish

- [P3] Refine stroke rendering against Photoshop reference output as more brush dynamics are supported.

## TypeGPU preview follow-up

The preview implementation now uses one shared worker and GPU device for cards and the settings preview. The existing workspace layout is retained. Computed and sampled strokes, including a pressure-tapered preset, were inspected in the production build at 1280 × 720.

Evidence directory: `/Users/ilyaverpovsky/.codex/visualizations/2026/09/06/01a07750-b8e7-7c40-a0b0-ef20bd8e3411/abr-gpu-preview`.

- `workspace.png`: 38 imported brushes, Hard Round Pressure Size selected, production worker rendering the previews.
- `gpu-checks.png`: real GPU-versus-CPU comparisons and device-loss result.
- Production browser check: visible previews reported `gpu`; 14 offscreen cards initially remained idle, then rendered after filtering brought them into view. Changing spacing from 25 to 200 updated both the card and settings preview, and Undo restored 25. Browser error-log check returned no errors.
- Five GPU comparisons passed. Mean channel errors ranged from 0.006 to 0.035 out of 255. Up to ten pixels per 320 × 96 image exceeded an error of eight, within the documented raster-edge tolerance. These are renderer/reference checks, not comparisons with Photoshop output.
- Final local cached-tip rendering timings ranged from 0.5 to 1.3 ms. This small synthetic check excludes worker messaging, image-cache handling and UI presentation.
- Sixteen unit tests pass, including five workspace/export tests and eleven preview/lifecycle tests. Typecheck, scoped ESLint and production build pass. The TypeGPU-specific ESLint plugin requires ESLint 9; this repository uses ESLint 10, so existing ESLint rules and real shader validation were used.
- Unsupported brush features remain documented in the README. No full Photoshop rendering parity is claimed.

final result: passed


## Examples gallery update, 2026-09-06

Source visual truth: `/var/folders/ll/km05580d2c52z15y49_zjjkm0000gn/T/codex-clipboard-c4e7b98d-6fed-4a54-a1ed-258e68ed1941.png`, 2896 × 3028 pixels, source CSS size and density unknown. The supplied reference is the eight-card Adobe collection section. Original artwork was retrieved from the linked Adobe page and bundled locally, with provenance in `src/assets/examples/covers/sources.md`.

Implementation: `http://localhost:3120/abr-viewer`, Examples modal open, 1280 × 720 CSS pixels, capture 1280 × 720 at 1× density. Evidence directory: `/Users/ilyaverpovsky/.codex/visualizations/2026/09/06/01a07750-b8e7-7c40-a0b0-ef20bd8e3411/abr-examples/`. `desktop.png` captures the first row; `last-row.png` captures the final row. Reference and both implementation captures were opened together in the same comparison input. The reference is a tall page section; the requested modal intentionally scrolls the same three-column card layout beneath a fixed header. This is a component-level comparison, not a claim of matching the page viewport. Card text and images are readable in these captures, so separate detail crops were unnecessary.

Comparison history: the first live capture exposed clipped card bodies because grid rows shrank to the available modal height. This was a P1 issue. Explicit max-content row sizing and non-shrinking images fixed it. Both saved post-fix captures show complete titles, descriptions, and buttons in the inspected rows.

Fidelity checks:

- Typography: existing editor sans-serif retained; 16px semibold titles, 13px descriptions, clear line spacing. Adobe's exact font metrics are not reproduced.
- Layout: three equal columns, 24px gutters, 16:9 artwork, white card bodies, bottom-aligned outlined action buttons. Modal header/footer and brush counts are intentional additions for this editor.
- Colors: white cards, dark text, muted descriptions, dark gallery backdrop. Focus outlines remain visible.
- Images: all eight original cover images loaded successfully; subjects and order match the reference, with consistent cover cropping and no placeholders.
- Content: short paraphrased descriptions replace Adobe's longer copy. Add brushes replaces Download because the action imports directly into the editor.

Interactions checked in the browser: opening, keyboard navigation through the scrollable gallery, Escape dismissal with focus returning to Examples, and importing Spring 2024 from its card. Import completed with 30 presets and the modal closed. All eight images reported successful decoding. Narrow-screen CSS is provided but was not visually captured in this pass. No actionable P0/P1/P2 findings remain in the inspected desktop states.

final result: passed

## Minimal gallery refinement, 2026-09-06

Source: `/var/folders/ll/km05580d2c52z15y49_zjjkm0000gn/T/codex-clipboard-6b160e5f-608c-49d8-b911-2b13fbaab473.png`, 2952 × 3576 pixels, supplied CSS size/density unknown. The preceding annotated reference also requests the separate round close control. Implementation: `abr-examples/minimal-desktop.png` in the evidence directory above, 1280 × 720 pixels/CSS viewport at 1×. Source and implementation were opened together in one comparison input. The taller reference displays every row; the compact desktop capture scrolls the gallery. This viewport difference is intentional, not a card-layout mismatch.

The requested chrome removal is complete: no visible title bar, description bar, footer, border, or panel shadow. The black panel is centered over a dimmed workspace. A 44px round close button stays at the viewport corner. Existing card typography, white bodies, imagery, order, descriptions, and Add brushes actions are retained. Padding is 48px with 24px column gaps. Images and labels remain clear at the capture size; no separate detail crop was necessary.

Browser checks confirmed staggered card animations from 0 to 315ms, closing by the round button and Escape, focus return to Examples, and reopening. Reduced-motion CSS disables reveal animations and close-button motion. Typecheck and production build pass. No additional P0/P1/P2 findings were found in the post-refinement desktop comparison.

final result: passed


## Tool options bar, 2026-09-08

Final result: passed for the edited toolbar and its responsive integration.

Reference: the user's Photoshop toolbar screenshot at `/Users/ilyaverpovsky/.codex/attachments/466f0bd6-4d26-4a05-b450-7600be9db708/image-2.png`, 2190 × 418 pixels. Source display density is unknown. Scope is the compact dark tool-options controls and their order, adapted to the existing docked inspector rather than Photoshop's full-width document toolbar. Ordinary Brush selected, Normal, Opacity 100%, Flow 75%, Smoothing 0%, Angle 0°. Brush content differs from the reference; rendering parity is outside this UI check.

Implementation: `http://localhost:3121/abr-viewer`. Final captures:
- Desktop, 1250 × 900: `/Users/ilyaverpovsky/.codex/visualizations/2026/09/08/abr-tool-options/desktop.png`.
- Mobile, 390 × 844: `/Users/ilyaverpovsky/.codex/visualizations/2026/09/08/abr-tool-options/mobile.png`.

The reference and desktop capture were opened together. Compact sans-serif labels, flat charcoal controls, subtle rectangular borders and tool ordering match the reference's visual structure. Existing typography and color tokens are retained. Icons use Tabler outline SVG assets with their MIT license, not Adobe artwork. Labels and accessible pressed states distinguish pressure overrides. The bar wraps into rows in a narrower inspector; Transfer and the other existing settings remain separately editable. Symmetry is a document feature and is not added as a brush preset option.

P2 resolved: the wrapped bar initially left zero height for the settings panel on mobile. Increased the mobile inspector's minimum height, reserved settings space and wrapped labels/selects. Final 390 × 844 readback shows 294 px for the scrollable settings body and no document horizontal overflow. Final mobile capture confirms controls are readable and the preview remains reachable.

Browser checks: edit Opacity/Flow, toggle pressure override, Undo, retain values across Brush/Eraser/Mixer changes, hide unavailable Block Eraser controls, expose Wet/Load/Mix, reject empty numeric edits, navigate smoothing options, enable/edit Transfer. Embedded Paint editor applied Flow 62% and retained it after Use in Paint and reopening. No browser error logs in the checked Viewer tab. Viewer: 200 tests pass, typecheck and production build pass. Paint integration typecheck passes. No new brush-rendering parity claim.


## Grouped Mode menu, tool icons and neutral thumbnails, 2026-09-08

Final result: passed for the requested menu, badge and thumbnail changes.

Reference: user screenshots `codex-clipboard-c5d6444c-f495-4153-a11c-abd476af9922.png` for the Mode list and `codex-clipboard-6b0bfb3c-6d43-4f68-b4d9-e15cbe24ad9b.png` for corner tool badges, attached in this task. The final desktop Mode capture and source were opened together. The source is a crop with unknown display density, so this compares ordering, group breaks, selected styling and compact dark controls rather than pixel equality across full app viewports.

Evidence: `/Users/ilyaverpovsky/.codex/visualizations/2026/09/08/abr-tool-options/modes-final.png` and `menus-mobile.png`. Desktop capture is 1250 × 900. Narrow-menu DOM measurement was 355 × 767 CSS pixels during the browser viewport transition: the menu measured 180 × 731 pixels at x=48, y=28, inside the viewport. All 29 native paint modes and five separators are present. Shorter mode lists remain tool-specific. Native integer Eraser Mode still selects Block correctly.

Visual changes: a selected check mark, grouped choices, compact charcoal popup and blue focus state; matching filled tool icons in the picker and top-right preset corners. Licensed Pictogrammers icons approximate tool silhouettes, without copying Adobe assets. Thumbnail text no longer repeats the tool type beneath every brush. The library shows neutral white marks with Normal compositing for Brush/Pencil, so Multiply does not hide the thumbnail. Interactive previews retain actual saved colors and blend mode. Eraser and retouch retain their specialized preview behavior.

Interaction checks: ArrowDown/Enter selects Pencil and changes the matching card badge; Undo restores Brush. End/Enter reaches Luminosity in the long Mode list. Escape closes the menu and returns focus. Inside Paint, Escape leaves the containing brush editor open. Eraser/Block hides irrelevant opacity controls and displays an Eraser badge. Outside-click dismissal, viewport bounds, selected state and updated icon sources were inspected. Final loaded page has no console errors. A Solid 2 cleanup-scope error encountered during development was fixed by creating managed listeners in component scope rather than onSettled.

Validation: 202 Viewer tests, Viewer and Paint typechecks, and Viewer production build pass. Two added appearance tests guard preserved preset colors/mode and retouch settings. No rendering-parity claim for Photoshop brushes is made.

### ABR color mixing, 2026-09-08

Added the existing Smooth color / Classic choice to the ABR toolbar and checked its compact dropdown in the standalone editor. The choice survives switching Spatter presets. A Solid UI regression checks embedded updates in both directions and closing/reopening without remounting. Viewer unit checks assert the independent red/green expectations of 188 versus 128, preserve preset data and keep non-Normal modes and erasing unchanged.

Real GPU verification passed in both hosts: Viewer CPU/GPU comparisons including linear, classic, Pencil and Multiply; Paint Brush/Pencil tile pixels, tile boundaries, cancellation and undo/redo. Viewer build and both Viewer/Paint typechecks passed. Run `Check ABR color mixing` in `/paint-studio-qa.html` to repeat the Paint checks without touching studio autosave.

### Smooth retouch follow-up, 2026-09-08

Smudge now decodes colors before capture/transfer interpolation and uses linear-light replacement at the selected Strength. Blur/Sharpen decode neighbours before the Gaussian kernel and encode the result back to existing sRGB storage. Alpha is interpolated independently, including transparent pickup. Finger Painting uses the same linear source-over as ordinary paint. Mixer Brush remains on its separate model.

Validation: Viewer CPU/GPU comparisons passed for Smooth Smudge, Finger Painting, Blur, Sharpen and all-layer sampling. Paint's isolated color-mixing verifier passed red/green Smudge and Blur across tiles with matching alpha and undo/redo. The full ABR GPU suite passed, including Classic retouch, tile eviction, cancellation, erasing, Mixer and Pencil. The legacy filter pixel expectations explicitly select Classic. Viewer build and both typechecks passed.
