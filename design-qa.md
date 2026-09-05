# WebGL state diagram design QA

- Source visual truth: `/var/folders/ll/km05580d2c52z15y49_zjjkm0000gn/T/codex-clipboard-477ad854-11da-41f9-89ce-e6aae4908277.png`
- Implementation screenshots: `/tmp/webgl-state-diagram-implementation.png`, `/tmp/webgl-state-diagram-arrows.png`, `/tmp/webgl-state-diagram-popover.png`
- Combined comparison: `/tmp/webgl-state-diagram-comparison.png`
- Browser and viewport: Codex in-app browser, 1280 × 720 CSS px, density 1
- Source pixels: 3814 × 4076; top reference region cropped to 16:9 and normalized to 1280 × 720 for the full-view comparison
- State: live Three.js WebGL 2 workload; default connected-object view; help closed for full-view and arrow captures, contextual help open for the popover capture

## Findings

No actionable P0, P1, or P2 mismatch remains for the requested surfaces.

- Fonts and typography: the diagram retains the source's dense monospace data presentation, compact bold panel headings, and sans-serif documentation text.
- Spacing and layout rhythm: square floating panels, compact tables, black panel shadows, the canvas block, and the right-side activity region follow the source composition while accommodating live inspector controls.
- Colors and visual tokens: the flat `#333` workspace and the original HSL object-family palette replace the previous dotted dashboard treatment.
- Image quality and asset fidelity: the only visual asset is the inspected Three.js canvas and it remains native and sharp; no source artwork was approximated.
- Copy and content: the implementation keeps richer live-inspector controls and state labels intentionally, while help text describes the same state relationships shown by the diagram.
- Interaction: every one of the 64 rendered paths has a visible explicit arrowhead; help uses an anchored, non-modal Solid UI Popover with outside-click and Escape dismissal; no backdrop is present.

Focused comparison was required for arrow endpoints and the help surface. `/tmp/webgl-state-diagram-arrows.png` confirms visible heads in the texture/framebuffer region, and `/tmp/webgl-state-diagram-popover.png` confirms the compact gray contextual help treatment.

## Comparison history

- Initial P1: connection paths rendered without dependable visible heads. Fixed by rendering explicit, direction-aware SVG polygon heads instead of relying on SVG marker support. Post-fix evidence shows 64 paths and 64 visible heads.
- Initial P1: documentation used a centered modal and blurred backdrop. Fixed with the shared Solid UI Popover API and Floating UI positioning for Solid 2. Post-fix evidence shows one anchored popover and zero backdrop elements.
- Initial P2: dashboard styling drifted from WebGL2 Fundamentals. Fixed with the source workspace, object palette, square panels, shadows, dense tables, red help outline, and blue controls.

## Verification

- Primary interactions tested: open help, outside/Escape dismissal, anchored placement, live capture, and viewport scrolling to framebuffer resources.
- Fresh-page browser console errors: none.
- Package typecheck, five inspector tests, web typecheck, and production build: passed.

final result: passed
