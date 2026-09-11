# Card Stack

Reusable card stacks for **Solid 2.0.0-rc.4**. A compact horizontal strip expands into draggable cards. Expanded horizontal dragging sorts the tabs; vertical dragging opens, gathers, or passes a card to reveal the one underneath. Gestures can interrupt an unfinished selection animation at its painted position.

The package has no folder SVGs, application data, routes, fonts, colors, or content templates. The folder application and the [notebook example](../../apps/folder-tabs/examples/plain.tsx) use the same implementation with different skins.

## Use

In this workspace, depend on `@app-game/card-stack: workspace:*`. For another project, build and pack the package, then install the resulting archive. The consumer must use the compatible Solid version and a Solid JSX build plugin.

```sh
pnpm --filter @app-game/card-stack build
pnpm --filter @app-game/card-stack pack --out /tmp/card-stack.tgz
# In the other project:
pnpm add /tmp/card-stack.tgz
```

Production imports use compiled ESM. The development export uses source for hot updates; source types and emitted declarations are included. Solid and Solid Primitives remain external dependencies. Component styles use CSS Modules and are loaded automatically in both development and production. No separate stylesheet import is required. Nothing is published by these commands.

```tsx
import { CardStack, CardStackViewport, CardStackScrollBody, CardStackFooter } from '@app-game/card-stack';
import './my-tabs.css';

const documents = [
  { id: 'drafts', title: 'Drafts', color: '#e5edf6' },
  { id: 'notes', title: 'Notes', color: '#e5f0e8' }
];

export function Documents() {
  return (
    <CardStack
      items={documents}
      label="Documents"
      class="documents"
      getLabel={item => item.title}
      renderTab={item => <span>{item.title}</span>}
      cardStyle={item => ({ '--tabs-surface': item.color })}
      geometryUnit={8}
      tabWidth={24}
      tabHeight={5}
      tabOverlap={0}
      initiallyCollapsed
    >
      {(item, active, next) => (
        <>
          <CardStackViewport label={`${item.title} content`}>
            <CardStackScrollBody><MyEditor document={item} /></CardStackScrollBody>
          </CardStackViewport>
          <CardStackFooter><button onClick={next}>Next document</button></CardStackFooter>
        </>
      )}
    </CardStack>
  );
}
```

```css
.documents {
  --screen-height: 800px;
  --stack-top: 24px;
  --ledge: 8px;
  --footer-height: 64px;
  overflow: hidden;
}
.documents [data-tabs-trigger] {
  border: 0;
  border-radius: 8px 8px 0 0;
  background: var(--tabs-surface);
  padding: 0 20px;
  font: inherit;
}
.documents [data-tabs-footer] {
  display: flex;
  align-items: center;
  padding: 0 20px;
}
```

## Interface

`CardStack` requires `items`, an accessible `label`, `getLabel`, `renderTab`, and a panel render function. Items only require a string `id`; the render functions retain the caller's item type.

| Input | Contract |
| --- | --- |
| `defaultOrder` | Initial back-to-front depth, defaulting to item order. The last ID is active. |
| `order`, `onOrderChange` | Optional controlled depth. Update `order` synchronously when notified. A selection commits when its exit motion completes. |
| `initialTabOrder` | Initial left-to-right order, independent of depth. Defaults to item order. Drag sorting then owns this order. |
| `initiallyCollapsed` | Initial pose only. Later reactive changes do not reset live gestures. |
| `geometryUnit` | Pixels per geometry unit. Omit for a unit equal to one percent of the container width. |
| `tabWidth`, `tabHeight`, `tabOverlap` | Geometry units. Defaults: 30, 6, 2. Width/height must be positive; overlap must be between zero and width. |
| `scrollableContent` | Defaults true. Only handles initiate deck dragging; panel content keeps native scrolling. False enables preview-style deck dragging over content. |
| `id` | Optional stable DOM prefix. Auto-generated to keep multiple decks independent. |
| `classes`, `cardClass`, `cardStyle` | Application styling of parts and per-item surface variables. Motion properties remain owned by the controller. |
| `controls` | Optional render function receiving the controller, including `scrollBy`, `canScrollBack`, `canScrollForward`, `select`, and `next`. |

IDs and membership are stable for the mounted deck's lifetime; update item content reactively, or remount the deck to replace its membership. Every supplied order must contain each item ID exactly once. Horizontal order and depth are deliberately separate.

All real panels remain mounted, retaining input state, scroll and effects. Inactive panels are inert and hidden from the accessibility tree. Selection animates the original wrappers throughout. Each return starts underneath the selected panel after every outgoing wrapper has cleared the viewport; no snapshot-to-live handoff is needed.

Arrow keys, Home and End select and focus tabs in horizontal order. `next()` reveals the card underneath. While a pointer is held, downward movement distributes rear sheets evenly between the back of the deck and the held card, and lowers covering sheets to expose its content, keeping depth order unchanged. Releasing a rear handle after a deliberate downward pull selects it; releasing the active handle at the bottom reveals the card underneath. Returning near the starting position or cancelling never selects another card. The rear selection threshold is half the resting spread, clamped to 48–90 CSS pixels, and uses the final release coordinate. A compact horizontal drag moves the rail; an expanded horizontal drag reorders one tab and makes its neighbors move aside.

## Composition

- `CardStack` renders accessible tab, card and panel elements around caller content.
- `createCardStack` owns state, gestures and choreography separately from rendering. Advanced renderers use its `rootProps`, `listProps`, `cardProps`, `triggerProps`, `panelProps` bindings. These are reactive binding factories and must be read in JSX/reactive computations. Preserve the generated `class` from each binding when adding your own classes. Keep each tab and panel in the same card wrapper. Create the controller under a Solid owner.
- `CardStackViewport`, `CardStackScrollBody`, and `CardStackFooter` retain stable scroll-layer sizes while cards move. Their module classes carry the required geometry automatically. Touch/wheel scrolling is native; the viewport adds mouse/pen grab scrolling.
- `SquareGrid` composes arbitrary content into square cells. `columns` and `rows` default to 12. Skins may override `--grid-columns` and `--grid-rows` at breakpoints and place/reflow children with CSS grid areas. Put scrollable grids inside `CardStackScrollBody`.
- Internal primitives compose Solid Primitives' pointer, event listener, resize observer, scheduled and RAF utilities. They do not import the application or its skin.

Mark interactive groups with `data-tabs-no-drag` when using preview-style content dragging. Inputs, textareas, selects and contenteditable elements are excluded automatically. Scope skin selectors to the instance. The CSS Module owns transforms, scoped animation names and scroll geometry; changing these can break interruption and completion. Colors, borders, shapes, padding inside the handle, fonts, and panel content belong to the skin.

Motion remains enabled regardless of the system reduced-motion preference, matching the current demo contract. This release targets client rendering in modern browsers; it does not claim SSR/hydration or Solid 1 compatibility.

## Development

### Motion inspector

The host route `/card-stack/notebook` includes a docked motion inspector alongside
its live notebook. Folder routes and the standalone notebook have no inspector.
Pass `debug` to `CardStack` to opt in elsewhere; the panel renders outside the deck gesture targets. The notebook page reserves
half the viewport for it. Toolbar docking buttons switch between the right half
and bottom half; the selected sample survives docking. Switching while recording
captures the current take before the notebook resizes.

Press **Record**, interact with the tabs, then **Stop**. The panel previews
motion while recording. **Settings** controls **Max duration** (1–60 seconds),
**Auto-stop**, and **Start delay** (0–60 seconds). The inspector defaults to a
five-second take with auto-stop enabled and no delay. With auto-stop disabled,
the recorder keeps the latest configured duration until **Stop**. Data is bounded
to 240 samples and 480 events per second of configured duration.

The countdown has a **Cancel** button; cancelling preserves the previous capture.
Sampling and the duration clock begin after the delay. Settings are locked during
the countdown and recording. Stop ends observation while the application keeps
running. Hiding the browser tab or switching docks cancels a pending start or
captures an active take. Auto-stop retains actual samples up to the deadline;
its final sample may precede the limit by a frame interval. **JSON** includes the
take's settings and stop reason.

Open **Elements** to choose multiple cards or tabs. Each row has independent
**Visible**, **Onion** and **Trajectory** checkboxes; **All** and **None** update the whole list.
**Visible** draws that element's outline at the selected sample, independently of
its onion skin and trajectory. Cards and tabs use the same visibility controls;
there are no implicit background tabs. The **Hidden** toggle still determines
whether CSS-hidden measurements can appear. Existing saved overlay choices retain
their current-pose visibility when loaded.
The toolbar's Onion skin and Trajectory switches toggle those layers globally.
Click an element name to focus its position chart and measurements without
changing the selected overlays. Live elements and each echo instance have
separate tracks; paths never connect across elements. **Onion skin** shows distinct recorded outlines: blue before the
selected sample, orange after it, and green at the selected sample. **Trajectory**
connects element centers without smoothing. Paths break at missing or hidden
poses; **Hidden** reveals hidden samples. **Trail window** and **Ghosts**
control the displayed interval and outline density. The x/y position chart keeps
actual sample times, including gaps. The timeline, sample buttons and event picker
all select recorded samples, without changing the live notebook.

Inspector controls use the shared Solid 2 adapters in `@app-game/components/ui`,
following [Solid UI](https://www.solid-ui.com/docs/components/checkbox). Checkbox
cells have 36px minimum hit areas; dropdowns use portal popovers with keyboard
navigation, Escape dismissal and focus restoration. The control styles are CSS
modules so the standalone demo does not need a utility CSS build.

Inspector preferences persist in localStorage, scoped to the page and deck label:
recording settings, docking, layer choices, focused element, trail window, ghosts,
hidden samples, pointer visibility and fitting mode. Element keys use card identity
and part, rather than transient DOM IDs, so choices carry into new recordings.
Captures, cursor time and temporary canvas pan/zoom are not stored. Invalid or
unavailable storage falls back to defaults or in-memory preferences.

**Occlusion** uses opaque, item-colored surfaces to show which visible elements
cover others. It is enabled by default and saved with the other preferences.
Surfaces paint back to front using each frame's parent-card z-index, sibling DOM
order and local z-index. Labels show element identity and parent z-index. Card
surfaces use recorded panel bounds so the empty area beside a tab does not hide
other tabs. Onion skin, trajectories and pointer paths remain overlays above the
surfaces. Turn Occlusion off to restore translucent bounding boxes. This is a
geometric diagnostic: opacity is forced to one and arbitrary clipping, rounded
corners and content are not reproduced.

**Pointer** overlays unsmoothed input paths in purple. Filled markers indicate
pointerdown; outlined markers indicate release, cancellation or capture changes.
The pointer lane and **Event** picker select the exact input timestamp alongside
the nearest DOM sample. **Target** is the event receiver; **Hit** is the element
under the pointer, which can differ during pointer capture. The readout includes
pointer type, ID, buttons and deck-relative coordinates. Paths stay separate
between gestures, including when the browser reuses a pointer ID. Recording starts
at pointerdown inside this deck and follows movement outside it until release,
cancellation or loss of capture. Hover-only movement is not recorded.

Drag the motion canvas to pan. Scroll to zoom around the pointer; touch supports
one-finger pan and two-finger pinch. The zoom buttons use the canvas center.
Click the percentage or double-click the canvas to reset; **Fit deck** / **Fit
motion** also resets navigation. With the canvas focused, arrow keys pan, +/−
zoom, and 0 resets. Navigation preserves the selected sample and does not send
input to the live deck. Zoom ranges from 25% to 1600%.

**SVG** saves the current panned/zoomed outline/trajectory/pointer view as a standalone image.
**JSON** saves the versioned capture with timestamps, root/viewport bounds,
card and tab geometry, deck state, pointer coordinates and gesture/CSS animation
events. Element coordinates are CSS pixels relative to the root's viewport
bounds. Pointer `x`/`y` are viewport CSS pixels; `rootX`/`rootY` are relative to the deck at event time. Pointer events also include pressure and capture changes. Event state is captured
before application handlers. Panel contents and input text are not recorded.

These are measured DOM outlines, not screenshots or a pixel-accurate replay.
DOM reads can affect timing, and outlines do not reproduce clipping or occlusion.
With `debug` absent, no recorder or inspector listeners mount.

```sh
pnpm --filter @app-game/card-stack test
pnpm --filter @app-game/card-stack typecheck
pnpm --filter @app-game/card-stack build
pnpm --filter @app-game/folder-tabs test
pnpm --filter @app-game/folder-tabs build
```

With the folder dev server running, `/` and `/fullscreen` show the folder skin; `/examples/plain.html` shows the notebook skin and imports no folder CSS. The package tests cover public composition and its primitives. The application tests cover the existing gesture sequences, animation interruption, footer-related motion state and route continuity through the package.

### Expanded stack limit

`maxExpandedCards` defaults to `8`, including the active card. The expanded view exposes the nearest front cards and keeps a rear handle pulled from the compact row within that limit. Hidden panels remain mounted with their state preserved; gather the compact row to access every tab. Set `maxExpandedCards={12}` to expose more or `maxExpandedCards={Infinity}` to show all. Finite values are rounded down and clamped to at least 2.

The Notebook example exposes both **Cards** and **Expanded cards** selectors. Changing either recreates the example and clears its recording. Small stacks use a narrower horizontal field. While inspecting the stack, its rear edge stays anchored. Rear sheets distribute evenly from the anchored back to the held handle. Their depth ranks stay fixed during horizontal sorting so they cannot jump between rows. Covering sheets move farther below the held card as the pull grows, opening a content preview capped at half the deck height. The held card follows the pointer directly; the other sheets use their existing motion followers.

`expandedSpacing` scales the resting vertical layout: `1` preserves the default, `0.5` halves its distances, and `2` doubles them. It accepts positive finite numbers and falls back to `1` otherwise. Smaller values can partially overlap handles; handle sizes and the compact rail are unchanged. Updates animate without remounting content. During a held gesture, captured spacing stays stable until release.

The Notebook **Expanded spacing** slider adjusts this value live from 50% to 200%, keeping drafts, selection and the current recording.
