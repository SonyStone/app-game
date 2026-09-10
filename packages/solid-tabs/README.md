# Solid Tabs

Reusable stacked tabs for **Solid 2.0.0-rc.4**. A compact horizontal strip expands into draggable cards. Expanded horizontal dragging sorts the tabs; vertical dragging opens, gathers, or passes a card to reveal the one underneath. Gestures can interrupt an unfinished selection animation at its painted position.

The package has no folder SVGs, application data, routes, fonts, colors, or content templates. The folder application and the [notebook example](../../apps/folder-tabs/examples/plain.tsx) use the same implementation with different skins.

## Use

In this workspace, depend on `@app-game/solid-tabs: workspace:*`. For another project, build and pack the package, then install the resulting archive. The consumer must use the compatible Solid version and a Solid JSX build plugin.

```sh
pnpm --filter @app-game/solid-tabs build
pnpm --filter @app-game/solid-tabs pack --out /tmp/solid-tabs.tgz
# In the other project:
pnpm add /tmp/solid-tabs.tgz
```

Production imports use compiled ESM. The development export uses source for hot updates; source types and emitted declarations are included. Solid and Solid Primitives remain external dependencies. Component styles use CSS Modules and are loaded automatically in both development and production. No separate stylesheet import is required. Nothing is published by these commands.

```tsx
import { Tabs, TabsViewport, TabsScrollBody, TabsFooter } from '@app-game/solid-tabs';
import './my-tabs.css';

const documents = [
  { id: 'drafts', title: 'Drafts', color: '#e5edf6' },
  { id: 'notes', title: 'Notes', color: '#e5f0e8' }
];

export function Documents() {
  return (
    <Tabs
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
          <TabsViewport label={`${item.title} content`}>
            <TabsScrollBody><MyEditor document={item} /></TabsScrollBody>
          </TabsViewport>
          <TabsFooter><button onClick={next}>Next document</button></TabsFooter>
        </>
      )}
    </Tabs>
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

`Tabs` requires `items`, an accessible `label`, `getLabel`, `renderTab`, and a panel render function. Items only require a string `id`; the render functions retain the caller's item type.

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

All real panels remain mounted, retaining input state, scroll and effects. Inactive panels are inert and hidden from the accessibility tree. Exit echoes clone DOM content without mounting another copy of the application. Do not place live controls outside the real panel or rely on canvas/video playback in an echo snapshot.

Arrow keys, Home and End select and focus tabs in horizontal order. `next()` reveals the card underneath. A downward pull can promote a rear card before release; reversing or cancelling restores the earlier selection. A compact horizontal drag moves the rail; an expanded horizontal drag reorders one tab and makes its neighbors move aside.

## Composition

- `Tabs` renders accessible tab, card and panel elements around caller content.
- `createTabs` owns state, gestures and choreography separately from rendering. Advanced renderers use its `rootProps`, `listProps`, `cardProps`, `triggerProps`, `panelProps`, and echo bindings. These are reactive binding factories and must be read in JSX/reactive computations. Preserve the generated `class` from each binding when adding your own classes. Keep each tab and panel in the same card wrapper. Create the controller under a Solid owner.
- `TabsViewport`, `TabsScrollBody`, and `TabsFooter` retain stable scroll-layer sizes while cards move. Their module classes carry the required geometry automatically. Touch/wheel scrolling is native; the viewport adds mouse/pen grab scrolling.
- `SquareGrid` composes arbitrary content into square cells. `columns` and `rows` default to 12. Skins may override `--grid-columns` and `--grid-rows` at breakpoints and place/reflow children with CSS grid areas. Put scrollable grids inside `TabsScrollBody`.
- Internal primitives compose Solid Primitives' pointer, event listener, resize observer, scheduled and RAF utilities. They do not import the application or its skin.

Mark interactive groups with `data-tabs-no-drag` when using preview-style content dragging. Inputs, textareas, selects and contenteditable elements are excluded automatically. Scope skin selectors to the instance. The CSS Module owns transforms, scoped animation names and scroll geometry; changing these can break interruption and completion. Colors, borders, shapes, padding inside the handle, fonts, and panel content belong to the skin.

Motion remains enabled regardless of the system reduced-motion preference, matching the current demo contract. This release targets client rendering in modern browsers; it does not claim SSR/hydration or Solid 1 compatibility.

## Development

```sh
pnpm --filter @app-game/solid-tabs test
pnpm --filter @app-game/solid-tabs typecheck
pnpm --filter @app-game/solid-tabs build
pnpm --filter @app-game/folder-tabs test
pnpm --filter @app-game/folder-tabs build
```

With the folder dev server running, `/` and `/fullscreen` show the folder skin; `/examples/plain.html` shows the notebook skin and imports no folder CSS. The package tests cover public composition and its primitives. The application tests cover the existing gesture sequences, animation interruption, footer-related motion state and route continuity through the package.
