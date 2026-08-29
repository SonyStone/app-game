<Header>

# Ref Behaviors <Badge>Advanced</Badge>

<Description>
  Solid 2 uses explicit ref callbacks for attaching imperative DOM behavior. Setup functions can return cleanup work
  and keep their reactive inputs explicit.
</Description>

</Header>

<Section>

## Extract a DOM behavior

Write a normal setup function that receives the element and the values it needs. Register teardown with the current
owner.

```tsx
import { onCleanup } from 'solid-js';

function attachClickOutside(element: Element, close: () => void): void {
  const handler = (event: MouseEvent) => {
    if (event.target instanceof Node && !element.contains(event.target)) close();
  };

  document.addEventListener('click', handler);
  onCleanup(() => document.removeEventListener('click', handler));
}

function Dropdown() {
  const [open, setOpen] = createSignal(false);

  return <div ref={(element) => attachClickOutside(element, () => setOpen(false))}>...</div>;
}
```

</Section>

<Section>

## Reactive options

Pass accessors when the attached behavior should respond to changing inputs.

```tsx
function attachTooltip(element: HTMLElement, text: () => string): void {
  createEffect(text, (value) => {
    element.title = value;
  });
}

<button ref={(element) => attachTooltip(element, tooltipText)}>Save</button>;
```

</Section>

<Section>

## One-time setup

Use the ref callback itself for work that only needs the connected element.

```tsx
<input
  ref={(element) => {
    element.focus();
  }}
  placeholder="Auto-focused"
/>
```

</Section>

<Callout type="info" title="Keep ownership local">
  Call setup helpers from JSX so their effects and cleanup callbacks are owned by the component that rendered the
  element.
</Callout>
