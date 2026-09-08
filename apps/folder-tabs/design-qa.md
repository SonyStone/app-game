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
