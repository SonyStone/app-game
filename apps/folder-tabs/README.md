# Folder tabs

A standalone Solid 2 recreation of the stacked folder interface in the supplied Slava Kornilov images and video. Eight staggered tabs sit above responsive panels inside a foldable-device frame. Pulling upward gathers them into a single browser-style tab strip. Measured timing and frame references are documented in `motion-reference.md`.

From the repository root:

```sh
pnpm --filter @app-game/folder-tabs dev
pnpm --filter @app-game/folder-tabs build
pnpm --filter @app-game/folder-tabs test
```

Development preview: http://localhost:3170.

- Drag up to lift the current card into a horizontal rail. Tabs retain their full width and stable left-to-right order; only their trailing shoulders overlap. The current tab is brought into view. Miniature folders, palette samples, and record details fill the additional board area. When the board contracts, these elements pass behind the footer at full opacity. The device frame keeps its original height.
- Swipe sideways over the tabs or card content, scroll over the tabs with a trackpad or mouse wheel, or use the two arrow controls above the rail. Scrolling does not select a folder or move its panel. Tabs follow horizontal destinations at a common maximum speed with soft acceleration and braking, so longer journeys finish later; pointer releases have a short bounded drift. Keyboard focus brings offscreen tabs back into view.
- Pull a rear tab down to open that folder through the same concurrent card transition as a click. Sideways dragging only scrolls the rail; a cancelled pull keeps the current selection. Drag down from the active tab or content to restore the expanded stack. Another downward drag sends the front folder to the back, revealing the next one. Short or cancelled drags return to the current layout.
- Click a tab in the middle to move every card in front of it to the back simultaneously. The selected destination is revealed during their shared 600 ms exit. Clicking another tab can change the queued destination.
- Covered cards retain their rendered content. During downward exits, a rear copy begins appearing just before the outgoing card leaves the screen.
- Trackpad and mouse-wheel input follow the same rules. Momentum is limited to one action per gesture.
- Arrow keys, Home, and End select tabs. In compact mode, keyboard navigation follows their visible left-to-right order.
- Dials rotate continuously. Click or use arrow keys to change their angle.
- The plus button adds a sample idea. Search filters the current folder's sample ideas; Escape closes search.
- Folder state survives tab changes and resets on reload. Reduced-motion preferences make transitions immediate.

`src/FolderStack.tsx` controls the deck and keyboard behavior. `src/createHorizontalRail.ts` handles horizontal capture, wheel input, bounds, focus reveal, and interrupted motion. `src/createVerticalGesture.ts` composes Solid Primitives pointer, event-listener, and scheduled utilities for capture, cancellation, live displacement, and wheel momentum. The reference labels and content are in `src/folders.ts`; the three panel layouts are in `src/FolderContent.tsx`.

Icons are local SVG component imports, compiled by `vite-plugin-solid-svg`:

```tsx
import SearchIcon from './icons/search.svg';

<SearchIcon class="icon" aria-hidden="true" />;
```

Geometry scales with the screen width, keeping the reference composition on narrow displays. The three supplied panel states are recreated; other folders contain sample content. This demo does not read or save files on disk.

Each folder is one animated `.folder-card` containing its tab and content panel in two CSS Grid rows. The wrapper owns vertical movement, stacking order, and animation completion. Collapse moves tabs into a scrollable horizontal rail within that wrapper without changing their width, height, badge size, or text; no child has an independent vertical animation. The accessible tablist owns the buttons through `aria-owns`, while each panel remains linked to its tab.

Panel contents and footers also use CSS Grid. A shared major cell size drives the graph paper, element placement, and subtle background tiles. The overlapping card wrappers and search overlay use positioned layout. See `design-qa.md` for the reference comparison and verification details.
