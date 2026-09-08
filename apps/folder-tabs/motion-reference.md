# Motion reference measurements

The latest interaction requirement replaces the upward return described below: upward dragging now collapses the current deck into one tab strip without selecting another folder. Downward exit/return timing remains based on the source measurements. Middle-tab selection applies the exit/return sequence to every intervening card simultaneously. The upward measurements below are retained as historical source observations, not the current gesture behavior.

Source: `ssstwitter.com_1788888347080.mp4`, 1600 × 2000, 60 fps, 382 frames. Frame numbers below are zero-based. The screen was cropped to 900 × 974 at (349, 512).

All frames were extracted. Consecutive-frame contact sheets cover both downward transitions and the final upward sequence. Label templates were tracked across the frames to estimate vertical displacement. Occluded labels were excluded from positional interpretation.

| Event                               | Source frames         | Observation                                                                                                                                            |
| ----------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Music starts moving down            | approximately 60–64   | Slow initial movement, then strong acceleration.                                                                                                       |
| Music exposes Menu                  | 72–90                 | Menu's complete content stays visible and moves slightly downward with its tab.                                                                        |
| Music appears at the back           | approximately 92–94   | The rear tab is already visible while the original is still at the bottom. This is an overlap, not a fully sequential teleport.                        |
| Music settles behind the stack      | approximately 118–122 | The rear tab eases upward; other tabs settle later than the main card's exit.                                                                          |
| Menu leaves and returns behind Play | approximately 180–240 | The same sequence repeats about two seconds later.                                                                                                     |
| Reverse sequence                    | approximately 306–374 | Rear tabs sink out of sight; Menu and Music rise from below with roughly six frames between them. Both panels are visible during the overlapping rise. |

## Implementation

- Downward exit: 600 ms, using a sampled easing curve from the source's visible displacement.
- Rear copy: starts at 533 ms, rises seven percent of the screen width over 500 ms. A decorative, inert snapshot preserves the outgoing content during the overlap.
- At 600 ms the original leaves the screen and changes stack order. Its return animation resumes 67 ms into the same curve, replacing the rear copy at the same point in the motion.
- Stack movement: 600 ms with roughly 33 ms of delay between rows, starting from the front. Dragging remains attached to the pointer and bypasses the time delay until release.
- Upward drag now interpolates all card rows toward zero and moves unchanged-size tabs into an overlapping horizontal strip. It keeps the active card selected.
- Expanded horizontal tab coordinates remain fixed; compact coordinates follow the original horizontal positions and remain stable through selection. The first two cyclic layouts use measured resting rows from the video.
- Dials keep rotating in the active and revealed panels.

Direct manipulation follows the user's finger, so a drag's duration depends on the gesture. The video contains no visible gesture input. Its exact trigger mechanism and original animation curves cannot be recovered; timings and curves here are measured approximations rather than recovered source values.

## Evidence and verification

Ignored local evidence is in `.tmp/video-frames/` and `.tmp/qa/`:

- `first-a.jpg`, `first-b.jpg`, `second-a.jpg`, `second-b.jpg`: consecutive downward frames.
- `reverse-a.jpg`, `reverse-b.jpg`, `reverse-c.jpg`: consecutive upward frames.
- `positions.json`: tracked label positions and match errors for all 382 frames.
- `video-overlap-fixed.png`: browser paused during the overlap.
- `video-matched-frames.json`: browser animation-frame trace normalized to the source screen width.

The component tests check exit/return order, simultaneous batch completion, decorative overlap lifetime, content visibility, cancellation, compact/expanded gestures, rapid upward input, and queued selection. Pointer and wheel tests cover input behavior and cleanup.

For frames 60–92, the final browser trace has a mean absolute vertical error of 3.6 pixels and a maximum error of 11.6 pixels at the source's 900-pixel screen width. This compares the visible outgoing tab path, aligned at the first sampled animation frame; it is not a whole-image similarity score. The rear-copy handoff measured 72.32 to 72.31 pixels, avoiding a position jump. The original measurement run passed all 13 tests, the strict TypeScript production build, ESLint, and `git diff --check` passed.

## Concurrent selection verification

The latest browser trace contains 331 animation frames. Selecting Site starts Evolution, Play, Menu, and Music together in the first sampled frame. Site becomes selected at 603 ms, and all four return animations finish at 1036 ms. No intermediate folder becomes selected. Tab-to-panel overlap remains 1.776 pixels throughout the trace at the tested desktop width. Evidence: `.tmp/qa/middle-selection-batch.json`.

Before and after compacting, every tab measured 265.966 pixels wide and 54.957 pixels high, with 19.061-pixel label text and a 39.886-pixel badge. All eight badge centers hit their own tab buttons after overlapping. Evidence: `.tmp/qa/compact-fixed-tabs.json` and `.tmp/qa/compact-fixed-tabs.png`.

## Horizontal movement refinement

Compact positions now depend on the original horizontal coordinates, independently of selection or deck order. Music stays at 3% from the left, Play at 19%, and Perceive moves from 52% to 54%. The largest adjustment in this eight-folder composition is four percentage points, for Evolution. Six percentage points separate neighboring starts. Tabs retain their full dimensions and naturally overlap according to card depth, without masks or clipping. Keyboard navigation follows the same spatial order.

## Scrollable rail, current behavior

The user selected a horizontal scrolling rail, replacing the fixed compact positions above. Whole tabs are spaced 28cqw apart at their existing 30cqw width, with only the trailing shoulders overlapping. The rail's order follows the original horizontal anchors and does not change when the deck rotates. The visible window can move by drag, wheel, scroll arrows, or keyboard focus. Upward collapse brings the active tab into view; downward gestures restore the stack. There are no tab masks or width changes.

Horizontal destinations are followed by an owned RAF controller capped at 100cqw per second, with 600cqw per second squared acceleration and braking. Travel distance determines arrival time rather than a shared duration. Direct swipes over either the tabs or card content translate the painted positions together; reduced motion settles immediately. Release drift is limited to 90 pixels and clamped at the rail edges. An interrupted scroll samples the painted tab position before capture. Panel positions remain independent of horizontal scrolling while each tab still shares its card's vertical motion wrapper.
