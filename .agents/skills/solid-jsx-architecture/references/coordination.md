# Context and coordination

Examples illustrate the stated requirements, not universal syntax rules. Imports and unrelated implementation are omitted. Helper names do not require matching abstractions in another application.

### Remove forwarding layers before introducing context

Context: an image editor draws annotations. `AnnotationLayout` positions children in image coordinates. `AnnotationLabel` compensates for zoom to keep text readable. `DragHandle` converts pointer movement to image coordinates and reports the new position. These components have reusable behavior; an intermediate annotation wrapper only assembles them.

**BAD**

Introducing a zoom provider just to hide forwarding through composition-only wrappers:

```tsx
<ZoomProvider>
  <Annotations items={annotations} />
</ZoomProvider>
```

Here `Annotations` adds a loop, another wrapper adds layout, and the label and handle read zoom from context. No additional behavior justifies those intermediate boundaries.

**GOOD**

Keep the loop and assembly visible. Pass only the zoom value to its actual consumers:

```tsx
const { zoom } = createZoom();

return (
  <For each={annotations}>
    {(annotation) => (
      <AnnotationLayout position={annotation.position}>
        <AnnotationLabel text={annotation.text} zoom={zoom()} />
        <DragHandle
          position={annotation.position}
          zoom={zoom()}
          onMove={(position) => annotation.onMove(annotation.id, position)}
        />
      </AnnotationLayout>
    )}
  </For>
);
```

An item has `id`, `text`, `position`, and `onMove(id, position)`. The children receive a reactive scalar prop and read `props.zoom`; they do not receive zoom commands or call `props.zoom()`.

### Use context inside a compound widget

Context: a reusable menu has a trigger, popup content, and items. They coordinate open state, keyboard navigation, item registration, and focus return. Each menu on the page needs an independent scope. The snippets show dependency wiring; the rest of the widget behavior is omitted.

**BAD**

Every caller manually reconnects parts of the same widget, including the standard close-after-selection behavior:

```tsx
const { open, toggle, close } = createMenu();

return (
  <>
    <MenuTrigger open={open()} onToggle={toggle}>Actions</MenuTrigger>
    <MenuContent open={open()} onClose={close}>
      <MenuItem
        onSelect={() => {
          save();
          close();
        }}
      >
        Save
      </MenuItem>
    </MenuContent>
  </>
);
```

**GOOD**

```tsx
<Menu>
  <MenuTrigger>Actions</MenuTrigger>
  <MenuContent>
    <MenuItem onSelect={save}>Save</MenuItem>
    <MenuItem onSelect={exportFile}>Export</MenuItem>
  </MenuContent>
</Menu>
```

`Menu` owns and provides the widget's context. `MenuTrigger`, `MenuContent`, and `MenuItem` read their dependencies through `useMenu`. For example, the item owns its close-after-selection behavior:

```tsx
function MenuItem(props: { onSelect: () => void; children: JSX.Element }) {
  const { close } = useMenu();

  function select() {
    props.onSelect();
    close();
  }

  return <button role="menuitem" onClick={select}>{props.children}</button>;
}
```

Context belongs here because the components implement one coordinated widget. The caller still assembles the actions. This differs from grouping unrelated screen consumers under a state provider.

### Distinguish external commands from state ownership

Context: an external button should open a menu. This alone does not require the parent to own the menu's open state.

**BAD**

Lifting state only to issue an open command adds a value/change pair that the parent otherwise does not use:

```tsx
const [open, setOpen] = createSignal(false);

return (
  <>
    <button onClick={() => setOpen(true)}>Open actions</button>
    <Menu open={open()} onOpenChange={setOpen}>{items}</Menu>
  </>
);
```

**GOOD**

The menu owns its state and exposes commands through a ref. Here `items` is the caller's JSX containing the menu trigger, content, and actions. The handler reads `menuRef()` at click time; Solid evaluates `onClick={...}` once, so `onClick={menuRef()?.open}` would bind `undefined` before `Menu` sets the ref.

```tsx
type MenuRef = { open: () => void; close: () => void };
const [menuRef, setMenuRef] = createSignal<MenuRef>();

return (
  <>
    <button onClick={() => menuRef()?.open()}>Open actions</button>
    <Menu ref={setMenuRef}>{items}</Menu>
  </>
);
```

If the parent actually needs to determine the current open state, the controlled value/change API is appropriate. Inside `Menu`, use the controlled-signal primitive instead of manually synchronizing internal and external signals:

```tsx
import { createControllableBooleanSignal } from '@solid-primitives/controlled-signal';

// Inside Menu; open/defaultOpen/onOpenChange are optional props.
const [open, setOpen] = createControllableBooleanSignal({
  value: () => props.open,
  defaultValue: () => props.defaultOpen,
  onChange: (value) => props.onOpenChange?.(value)
});
```

A defined `open` prop is authoritative; `setOpen` requests a change through the callback. Without it, the primitive owns the value, initially using `defaultOpen`. Menu descendants use the same context in either mode. If the component also exposes ref commands, route them through this same update API.
