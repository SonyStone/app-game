<Header>

# Directives <Badge>Advanced</Badge>

<Description>
SolidJS directives are functions that run on DOM element creation, providing a clean way to attach imperative
behavior.
</Description>

</Header>

<Section>

## Creating a directive

A directive is a function `(el, accessor)` where `el` is the DOM element and `accessor` returns the value passed to
`use:directiveName`.

```tsx
import { Accessor } from 'solid-js';

// Must declare the type for TypeScript
declare module 'solid-js' {
  namespace JSX {
    interface Directives {
      clickOutside: () => void;
    }
  }
}

// Directive function
function clickOutside(el: Element, accessor: Accessor<() => void>) {
  const handler = (e: MouseEvent) => {
    if (!el.contains(e.target as Node)) accessor()?.();
  };
  document.addEventListener('click', handler);
  onCleanup(() => document.removeEventListener('click', handler));
}

// Usage
function Dropdown() {
  const [open, setOpen] = createSignal(false);
  return <div use:clickOutside={() => setOpen(false)}>...</div>;
}
```

</Section>

<Section>

## Directives with options

Pass an options object or reactive value through the `use:` prop.

```tsx
declare module 'solid-js' {
  namespace JSX {
    interface Directives {
      tooltip: { text: string; position?: 'top' | 'bottom' };
    }
  }
}

function tooltip(el: HTMLElement, accessor: Accessor<{ text: string; position?: string }>) {
  createEffect(() => {
    const opts = accessor();
    el.title = opts.text;
    // reactive - updates when opts changes
  });
}

// Usage
<button use:tooltip={{ text: 'Save document', position: 'top' }}>Save</button>;
```

</Section>

<Section>

## autoFocus directive

A simple directive to focus an element on mount.

```tsx
declare module 'solid-js' {
  namespace JSX {
    interface Directives {
      autoFocus: boolean;
    }
  }
}

function autoFocus(el: HTMLElement, accessor: Accessor<boolean>) {
  createEffect(() => {
    if (accessor()) el.focus();
  });
}

// Usage
<input use:autoFocus={true} placeholder="Auto-focused" />;
```

</Section>

<Callout type="info" title="Import directives to prevent tree-shaking">
  If a directive is imported but only used in JSX (via `use:`), some bundlers may tree-shake it. Import
  it explicitly: `import './directives/clickOutside'` or reference it in a variable to keep it alive.
</Callout>
