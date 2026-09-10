# Folder tabs

A standalone Solid 2 recreation of the stacked folder interface in the supplied Slava Kornilov images and video. Eight staggered tabs sit above responsive panels inside a foldable-device frame. Pulling upward gathers them into a single browser-style tab strip. Measured timing and frame references are documented in `motion-reference.md`.

From the repository root:

```sh
pnpm --filter @app-game/folder-tabs dev
pnpm --filter @app-game/folder-tabs build
pnpm --filter @app-game/folder-tabs test
```

Development preview: http://localhost:3170. Edge-to-edge route: http://localhost:3170/fullscreen.

Use **Open full screen** above the device to expand the same mounted screen into the viewport. The circular **Preview** link in the active card’s footer restores the frame. Fullscreen has no toolbar above the tabs; swipe or scroll the tab rail to navigate. Both links and browser history use an 800 ms shared-screen transition (native View Transitions when available, otherwise a Web Animations bounds transition). Animations remain enabled regardless of the system Reduce Motion preference. The selected folder, rail layout, and sample ideas survive route changes. Opening `/fullscreen` directly starts in the compact rail.

The fullscreen route removes the decorative device frame and fake status bar. Tabs have a fixed 5:1 aspect ratio: 270 × 54 on larger screens and 180 × 36 on phones. Badge, text, shoulder, and stack spacing use that same scale. The content grid has fifteen square columns on larger screens and six larger square columns on phones, where the composition continues over additional rows. Each card has its own scrollport above the footer. Touch and wheel scrolling stay native; mouse and pen can drag the content vertically. Horizontal swipes and vertical deck gestures start on tabs in fullscreen. Resizing keeps the selected tab visible.

- Drag up to lift the current card into a horizontal rail. Tabs retain their full width and stable left-to-right order; only their trailing shoulders overlap. Expanded positions are distributed across the available width. When gathered by dragging, the row keeps the held tab’s release position within its scroll bounds. Pulling beyond either end returns the row smoothly to the edge, keeping the small outer margin. Miniature folders, palette samples, and record details fill the additional board area. When the board contracts, these elements pass behind the footer at full opacity. The device frame keeps its original height, and each footer stays at its lower edge as the tab rows change.
- Swipe sideways to scroll the gathered row. In the expanded stack, horizontal dragging sorts the list: crossed neighbors move into the vacated slots. Handles dragged beyond the expanded field return smoothly inside its edges after release. Horizontal order survives selection and gathering; vertical offsets separate overlapping handles and do not define list order. Scroll the row with a trackpad or mouse wheel, or use the two arrow controls in the framed preview. The framed preview also accepts horizontal swipes over card content. Scrolling does not select a folder or move its panel. Tabs follow horizontal destinations at a common maximum speed with soft acceleration and braking, so longer journeys finish later; the held handle tracks both pointer coordinates directly. Keyboard focus brings offscreen tabs back into view.
- Pull a rear tab to reveal its folder. The grabbed tab follows the pointer directly; the other cards follow their vertical destinations at a shared maximum speed with acceleration and braking, so a fast pull does not snap them to the destination. Returning the pointer to its starting point restores the stack without changing selection; once the covering cards clear, the rear card becomes active while still held. Continuing that same pull to the bottom reveals the card behind it. Diagonal dragging combines horizontal movement with expansion; after unfolding, horizontal movement sorts the held tab while neighbors make room. The direction can change without releasing capture. A downward pull on the active tab first expands the stack, then continues moving the front card toward the bottom without requiring release. Reaching the lower edge sends it to the back and reveals the card underneath in depth order, even before release. Sorting does not change that depth order. Short or cancelled drags return to the current layout.
- Click a tab in the middle to move every card in front of it to the back simultaneously. The selected destination is revealed during their shared 600 ms exit. Clicking another tab can change the queued destination.
- Covered cards retain their rendered content. During downward exits, a rear copy begins appearing just before the outgoing card leaves the screen.
- Trackpad and mouse-wheel input follow the same rules. Momentum is limited to one action per gesture.
- Arrow keys, Home, and End select tabs. In compact mode, keyboard navigation follows their visible left-to-right order.
- Dials rotate continuously. Click or use arrow keys to change their angle.
- The plus button adds a sample idea. Search filters the current folder's sample ideas; Escape closes search.
- Folder state survives tab changes and resets on reload. System motion preferences do not change the demo animations.

The gesture controller, layout, motion and scroll geometry live in [`@app-game/solid-tabs`](../../packages/solid-tabs/README.md). `src/FolderStack.tsx` supplies only the folder skin and preview rail buttons. `src/folders.ts` supplies the demo data; `src/FolderContent.tsx` composes the content with the package's viewport, footer and square grid. Route continuity remains in the application.

A second consumer at `/examples/plain.html` uses rectangular notebook tabs and editable content without importing the folder CSS or SVGs. Both examples are included in the production build. Package-level tests now live in `packages/solid-tabs/test`; this app retains its end-to-end component gesture and route tests.

Icons are local SVG component imports, compiled by `vite-plugin-solid-svg`:

```tsx
import SearchIcon from './icons/search.svg';

<SearchIcon class="icon" aria-hidden="true" />;
```

Geometry scales with the screen width, keeping the reference composition on narrow displays. The three supplied panel states are recreated; other folders contain sample content. This demo does not read or save files on disk.

Each folder is one animated `.folder-card` containing its tab and content panel in two CSS Grid rows. The wrapper owns vertical movement, stacking order, and animation completion. Collapse moves tabs into a scrollable horizontal rail within that wrapper without changing their width, height, badge size, or text; no child has an independent vertical animation. The accessible tablist owns the buttons through `aria-owns`, while each panel remains linked to its tab.

Panel contents and footers also use CSS Grid. A shared major cell size drives the graph paper, element placement, and subtle background tiles. The overlapping card wrappers and search overlay use positioned layout. See `design-qa.md` for the reference comparison and verification details.
