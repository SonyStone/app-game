# Folder tabs design QA

Result: reference layouts implemented and browser-checked, with minor optical differences remaining.

Latest gesture behavior supersedes the historical upward-entry checks below: drag up gathers the current deck into one overlapping row with unchanged tab dimensions; drag down expands it. Selecting a middle tab moves every card in front of it simultaneously. The 331-frame batch trace shows Site selected at 603 ms and the full transition idle at 1036 ms, with no intermediate selection. All 24 current tests pass.

## Reference and scope

The app recreates the folder interface inside the foldable device in the supplied Slava Kornilov images. The surrounding promotional poster is outside the app's scope.

- `HRkP0XoaYAAWc1m.jpeg`: white Music panel, 284 files.
- `HRkPy8kWkAARgWf.jpeg`: black Menu panel, 194 files.
- `HRkPxKwW0AMRJK1.jpeg`: sage Play panel, 201 files.
- `ssstwitter.com_1788888347080.mp4`: all 382 frames extracted; consecutive transition frames inspected and tab displacement measured. See `motion-reference.md`.

The original files are in `/Users/ilyaverpovsky/Downloads`. The latest annotated screenshot also guided the individual shaded cells, labels, miniature records, and footer details.

## Grid and visual verification

The panel board and footer now use CSS Grid. One `6.75cqw` major cell controls both element placement and the graph-paper background. Fourteen full columns and a partial fifteenth column reproduce the clipped right edge; the board has eight rows. Pixel sampling of the reference confirmed four fine subdivisions per major cell (`1.6875cqw` each). The sheet and tab layers remain positioned for their vertical transitions.

Titles, captions, dial groups, record controls, number tokens, and action buttons occupy explicit grid areas. Separate decorative grid cells reproduce the white panel's sparse background patches. The dark panel uses brighter shaded tiles, a continuous footer grid, and muted date text. The miniature records and curved Goals folder are imported local SVG components. File counts and footer controls were adjusted against the source crops.

At a measured 886-pixel desktop screen width, the major cell was 59.805 pixels. The tested tile positions and spans matched integral cell coordinates within 0.002 cells (normal fractional CSS-pixel rounding). Panel elements use static positioning within Grid; optical insets and circular controls are centered or padded inside their cells.

Source screen crops use `(349, 512, 900, 974)`. Desktop screenshots use approximately `(111, 447, 887, 962)`. Comparisons normalize both to 600 × 650. Current evidence is in the ignored `.tmp/qa/` directory:

- `music-grid-final.png`, `menu-grid-final.png`, `play-grid-final.png`
- `music-grid-comparison.jpg`, `menu-grid-comparison.jpg`, `play-grid-comparison.jpg`
- `menu-grid-mobile.png`

The 390-pixel phone viewport retained the full composition, with no horizontal document overflow. Text scales with the reference composition and is consequently small on phones. The normal browser viewport was restored after checking.

Minor differences remain in font rendering, the physical device frame, and exact source colors. Dial angles vary continuously. The other five folders use sample content because their complete panels are absent from the supplied references.

## Motion and interaction verification

- Expanded horizontal tab coordinates stay fixed through reordering. Compact tabs retain their original left-to-right order and move at most four percentage points sideways without resizing.
- Downward dragging exposes the next panel's complete content and shifts the remaining tabs toward their future rows.
- A decorative rear snapshot begins appearing just before the departing sheet exits. Handoff to the original resumes the same motion without a second entrance.
- Upward gestures retain the selected card and align all wrappers in one row. Oversized repeated input stays bounded.
- Pointer capture, cancellation, click suppression, and wheel momentum are covered by regression tests.
- Browser checks exercised consecutive next controls and a downward gesture after the grid change.
- The device now uses `overflow: clip`: a focused control on a departing card cannot scroll its interior. Workspace scroll position remained zero after navigation.
- Tab keyboard navigation and local add/search controls are preserved.
- Reduced-motion CSS shortens animation durations while retaining completion events. An operating-system preference change was not exercised.

## Engineering checks

- Production build and strict TypeScript: passed.
- Tests: all 24 passed across gesture and stack regression suites.
- ESLint: passed for source, tests, and Vite/Vitest configurations.
- Browser console: no errors during the final checks.
- Whitespace checks: passed.

Solid Primitives pointer, event-listener, and scheduled utilities provide input listeners and wheel debouncing. The custom gesture controller retains the continuous displacement and pointer-capture contract needed for reversible card motion.

## Rapid upward swipe regression

Covered panel content previously became hidden as soon as the next card was selected or its own entry ended, even when another incoming card had not covered it. Panels now keep their contents rendered and rely on the sheets themselves for occlusion. Inactive panels remain inert and hidden from the accessibility tree.

Preview layers now sit above every concurrent entry, with each tab above its own sheet. Upward displacement is bounded at the final open position, including unusually large wheel deltas. A full cycle cannot put a still-entering card into preview again. Rejected downward gestures during upward entries no longer shift the remaining tabs.

The browser stress run sent 12 upward wheel gestures 220 ms apart, reaching four simultaneous entries. Across 241 sampled frames, the former hidden-content condition dropped from 170 frames before the fix to zero afterward. Tab and sheet edges retained their intended 0.2cqw overlap, and all entries finished in the idle state. Evidence: `.tmp/qa/rapid-up-before.json` and `rapid-up-after.json`.

A real 830-pixel upward pointer drag was held before release. Its preview remained visible at the open position, with the tab connected to the sheet. Screenshot: `.tmp/qa/rapid-up-held.png`. A regression test cycles all eight cards before any completion, rejects a duplicate preview, finishes entries out of order, and then verifies navigation can resume.

## Unified card containers

The tab and content are now direct children of one `.folder-card` wrapper, arranged in two grid rows. All movement, stacking, motion state, and completion handling moved to that wrapper. The tab and panel no longer duplicate transforms or animation state. The decorative rear copy uses the same container structure. An accessible tablist retains ownership of all eight buttons through `aria-owns`; the browser accessibility tree still exposes one tab group and the active panel.

A fresh 12-gesture browser stress run recorded 241 frames and up to four simultaneous entries. Both children had `transform: none` and `animation-name: none` throughout. The tab-to-sheet edge overlap stayed exactly 1.765625 pixels in every sample, and the sequence returned to idle. Evidence: `.tmp/qa/unified-card-stress.json`. A held downward drag was inspected with the complete Menu content exposed behind Music.

The new component regression verifies common parentage and that animation events from either child cannot advance the wrapper's transition. Existing entry, exit, return, cancellation, repeated gesture, and direct selection checks continue to pass.

## Extended card coverage and composition

The compact sheet previously ended 1.1% of the screen width before the viewport bottom because its fixed 94cqw height did not account for the highest card position. Sheet height now derives from the screen, tab, and stack-top dimensions, with a 0.1cqw overlap beyond the bottom edge. In the desktop Child check, the active sheet extended approximately 0.88 pixels beyond the viewport instead of exposing another card.

The extra board area now contains two miniature reference/idea folders, numbered 01 and 02, palette swatches, a small record, and an arrow. These are decorative composition elements in three additional rows of the same CSS Grid. They inherit each folder's paper, ink, and palette; the original eight-row composition remains unchanged when the deck is expanded. No tab masking or clipping was added. Evidence: `.tmp/qa/compact-extension-dark.png` and `.tmp/qa/compact-extension-dark.json`.

The 19 behavioral tests, production build, and ESLint pass after this change.

## Horizontal scrolling rail

The compact navigation now uses full-size tabs in a scrollable horizontal rail. This supersedes the minimal side-shift arrangement above. Dragging sideways, wheel scrolling, arrow controls, and offscreen keyboard focus are covered. Downward dragging from a tab still expands the current deck. Horizontal movement leaves the selected folder unchanged and the panel stationary. Each tab and its sheet retain one vertical motion owner.

Twenty-four tests cover the existing card transitions plus horizontal bounds, click suppression, vertical capture ownership, wheel routing, focus reveal, interruption at the painted position, and listener/timer cleanup. Browser checks exercised scrolling from the first tab, collapsing with Perceive active, dragging to the right edge, and dragging downward from the rail.

## Whole-card swipes and tab catch-up

Compact horizontal gestures now start over the card content as well as its tabs and surrounding space. Inputs, search, and rail controls are excluded. Compact touch handling reserves horizontal and vertical panning for the app; wheel routing remains specific to the tabs so vertical wheel input over the content still changes the deck layout.

A RAF follower replaces the shared horizontal CSS duration. All tabs use the same maximum travel speed, with acceleration and braking; farther tabs arrive later. A direct swipe translates their currently painted positions, including when it interrupts an unfinished animation. Reduced-motion preferences settle immediately.

The browser collapse trace recorded Style arriving at approximately 330 ms, Site at 630 ms, Perceive at 1047 ms, and Child at 1480 ms. Tab widths and horizontal panel positions were constant across all sampled frames. Evidence: `.tmp/qa/tab-catchup-motion.json`. Mouse drags over both the tab row and card content moved the rail without changing the selected folder; a downward drag restored the stack. Touch pointer routing is covered by an automated regression rather than a physical-device check. The 28 tests and production build pass.


## Collections behind the footer

The user clarified that hiding behind the footer is intended; only fading was unwanted. The frame is back to its fixed 108.5cqw height, and the board can contract to eight grid rows. Collections retain full opacity and their own three-row layout, while the board's overflow clips them at the footer edge. There is no opacity animation. The shared panel expansion that prevents footer movement during tab selection is retained.

## Footer position during rail selection

Panel expansion is now shared by the entire deck and derived from collapse progress, rather than each card's changing stack rank. Incoming cards and decorative rear copies therefore already have the complete rail layout before selection reveals them. Changing the selected card does not restart a board-height animation or change the screen height.

The same Music-to-Style browser transition was sampled before and after the fix. Previously Style's footer descended 13.74 pixels as its board height caught up after reordering. In all 121 frames after the fix, its board height and footer position were constant, with the footer ending 0.91 pixels inside the screen. Evidence: `.tmp/qa/footer-selection-before.json` and `.tmp/qa/footer-selection-after.json`. The component regression checks that the shared expansion survives batch selection without per-card overrides. All 28 tests, the build, and ESLint pass.

## Slow horizontal drag capture

The vertical recognizer used to release any pointer captured by the shared stack element when rejecting a horizontal gesture. With gradual input, the rail first captured at 7px, then the vertical recognizer released that capture after 10px. Native browser traces reproduced `lostpointercapture` while the mouse button was still held, leaving later moves ineffective. Larger first movements bypassed this sequence, explaining why earlier checks passed.

The vertical recognizer now records whether it acquired capture and only releases capture it owns. Its axis lock also uses that synchronous record instead of the rendered dragging signal. Mouse and touch regression sequences cross both thresholds in separate moves, continue, reverse, and release. Both failed before the fix and pass afterward.

Native 80px mouse drags in both directions retained capture until pointerup after the fix. A subsequent downward drag still expanded the deck without selecting another folder. Evidence: `.tmp/qa/rail-capture-before.json` and `.tmp/qa/rail-capture-after.json`. All 30 tests, the production build, and ESLint pass.

## Pulling a rear tab to open it

Committed vertical pointer gestures now resolve the tab at pointerdown, even after capture retargets subsequent events to the stack. Pulling a rear tab downward opens its folder and expands the deck using the existing concurrent departure/return transition. Pulling content or the current tab retains the existing deck gestures. Horizontal rail movement and cancelled pulls do not select a folder.

Component regressions cover the rear tab in both compact and stacked layouts, nested label origins, capture retargeting, concurrent departures, cancellation, and horizontal scrolling without selection. All 33 tests, the production build, and ESLint pass. A native browser drag from the Style tab in the Music rail triggered the Style selection and expanded the deck.


## Fullscreen route and responsive composition

The preview and `/fullscreen` share the same mounted workspace, card deck, and folder state. Route links and browser history animate that workspace between its old and new bounds. Native View Transitions have an 800 ms shared-element duration, confirmed in the in-app browser by recording the folder-screen pseudo-element animations throughout the transition. The workspace DOM identity stays unchanged. A Web Animations fallback uses the same duration and easing; its geometry is covered by a unit test. Reduced-motion navigation is immediate. Internal card geometry settles before the route snapshot so panel height does not run a second transition inside the shared-screen animation.

Fullscreen removes the device outline, hinge, fake status bar, and corner ornament. The fifteen grid columns fill the viewport, while row sizes, typography, dials, and controls have bounds. Phone tabs use a wider responsive size, unchanged during gestures. Vertical content scrolling is native; vertical deck gestures remain on the tabs. Collections remain opaque and may pass behind the footer.

Browser viewport checks cover 320 × 740, 390 × 844, 768 × 1024, 844 × 390, and 1280 × 800 through a same-origin iframe harness. Portrait and desktop views have no horizontal document overflow and their settled footer ends at the viewport bottom. Short landscape content exceeds viewport height intentionally and remains vertically scrollable. Route regressions cover local-state and DOM preservation, history, direct links, modifier keys, stale callbacks after disposal, and fallback geometry. Horizontal-rail tests cover responsive width and bounds changes.

All 38 tests, the production build, ESLint, and diff whitespace checks pass. Landscape scrolling was checked by moving to the document bottom and verifying the dark footer remained reachable. Browser QA also covered the light Music and amber Style layouts on phone widths.


## Square-grid reflow and touch capture correction

The first fullscreen adaptation independently bounded row height and column width, distorted tab proportions, and clipped extra content without providing a card scrollport. Those rules are replaced. Fullscreen tabs are 270 × 54 pixels, uniformly reduced to 180 × 36 on phones. The same scale determines their vertical stack offsets. The graph paper and CSS Grid use one cell length on both axes: fifteen columns on larger screens and six on phones. Phone layouts have 13–17 rows, with the controls and collection tiles placed further down rather than squeezed into the desktop layout.

Every card now owns a native vertical scrollport. Its footer remains below the scrollport, and content is occluded normally at that edge. Mouse/pen dragging changes scrollTop through a small owned pointer helper; touch and wheel use native scrolling. Fullscreen horizontal rail gestures start on tabs, so they cannot intercept a content scroll. The animated screen-y property drives both the wrapper position and available scrollport height, keeping the footer anchored during stack movement.

Touch pointers implicitly capture the hit-tested child before our explicit stack capture. The resulting descendant lostpointercapture event previously cancelled both gesture recognizers. They now react only when capture is lost by their actual capture owner. Regression sequences include this transfer for horizontal and vertical touch gestures. Scroll regressions cover bounds, tap/click behavior, native touch/wheel pass-through, cancellation, disabling, replacement, and disposal. These are event-sequence tests, not a claim of physical touchscreen verification.

Browser measurements at 1280 × 800 show 270 × 54 tabs and matching 85.33-pixel columns/rows. At 390 × 844, tabs measure 180 × 36 and cells measure 65 × 65. Native mouse drags scrolled the Music content from 0 to its 231-pixel lower bound while its footer stayed at the viewport bottom. Expanded desktop stack gestures retained the same tab dimensions and footer position. All 43 tests pass.


## System motion preference override

The demo now intentionally keeps animations enabled regardless of the OS Reduce Motion setting. App callers no longer subscribe to that preference, and the CSS overrides that disabled transitions or shortened animations have been removed. This supersedes the reduced-motion behavior described in earlier QA entries.

All 44 tests, the production build, and lint for the changed TypeScript files pass. With a browser QA page reporting reduced motion through matchMedia, the native shared-screen animation still ran for 800 ms and card transitions retained their 600 ms duration. Selecting Style completed in the idle state with all eight panels mounted. The physical OS setting was not changed; CSS has no remaining reduced-motion media rules.


## Continuous pulls and reversible rear selection

A compact downward drag now consumes the expansion distance, then applies the remaining displacement to the current card. Passing the release threshold after expansion advances the deck in the same gesture. Dragging a rear tab previews selection without changing order: every covering card moves together, the target stays attached to the pointer, and returning to the origin restores the original layout. Release uses the existing simultaneous exit/return sequence and captures the painted departure positions.

All 48 tests, build, and lint for the modified motion files passed. Browser frame recordings confirmed one uninterrupted 845 px pull from the compact rail through the expanded pose, followed by a completed selection of Menu. A held Style pull moved every covering card by the same additional displacement and completed with all panels mounted. Regression tests cover returning to the origin in both layouts and cancelling an oversized pull.


## Vertical speed correction

The first continuous-pull implementation mapped gesture distance directly to covering-card displacement, which made those cards leave too quickly. Vertical targets now use the same RAF follower as the horizontal rail, at 150 deck units per second after the requested 50% speed increase. Only the grabbed item follows its target immediately. Every other item accelerates, cruises and brakes independently; returning the pointer or cancelling retargets the existing motion without teleporting. CSS no longer adds a second transition to the RAF-driven vertical positions. Extra downward displacement remains outside the panel's layout height to preserve its content and footer.

All 49 tests, build and lint passed. Deterministic frame tests cover the speed limit, direct grabbed item, retargeting and cancellation in both deck layouts. Browser frame capture confirmed a rear pull kept Style under the pointer while Music and Menu followed more slowly, then completed selection in the idle state with valid panel heights.


## Match drag catch-up to click timing

Vertical catch-up now derives its cruising speed from the current deck height and the click exit's 600 ms duration, accounting for the follower's acceleration/braking time. This replaces the fixed 150-unit limit, which was slower than clicks on tall screens. The horizontal rail speed is unchanged. A frame-driven regression checks that a screen-length move covers at least 98% of its path in 600 ms at two viewport scales, while a farther card is still moving. All 50 tests and the production build pass.
