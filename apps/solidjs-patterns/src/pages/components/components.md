<header>

# Component Patterns <Badge>Components</Badge>

<Description>
  Best practices for defining props, passing children, forwarding props, and building reusable components in
  SolidJS.
</Description>

</header>

<Section>

## Props & type definitions

Use type aliases, not interfaces. For exported components, define the props type separately.

```tsx
// Internal component - inline props
function Avatar(props: { name: string; size?: number }): JSX.Element {
  return <img src={avatar(props.name)} width={props.size ?? 32} />;
}

// Exported component - separate type
export type ButtonProps = {
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  children: JSX.Element;
  onClick?: () => void;
};

export function Button(props: ButtonProps): JSX.Element {
  return (
    <button disabled={props.disabled} onClick={props.onClick}>
      {props.children}
    </button>
  );
}
```

</Section>

<Section>

## omit

`omit` creates a reactive view without component-only keys. Read local values from the original props object and
spread the remaining view onto the native element.

```tsx
import { omit } from 'solid-js';

type InputProps = JSX.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

export function Input(props: InputProps): JSX.Element {
  const rest = omit(props, 'label');

  return (
    <div>
      {props.label && <label>{props.label}</label>}
      <input {...rest} />
    </div>
  );
}
```

</Section>

<Section>

## merge - default values

`merge` combines defaults and props while preserving reactive property access.

```tsx
import { merge } from 'solid-js';

type CardProps = {
  title?: string;
  variant?: 'default' | 'outlined';
  children: JSX.Element;
};

export function Card(props: CardProps): JSX.Element {
  // Props with defaults - reactive to changes
  const merged = merge({ variant: 'default' as const, title: 'Card' }, props);

  return (
    <div class={merged.variant === 'outlined' ? 'border' : 'bg-neutral-800'}>
      <h3>{merged.title}</h3>
      {merged.children}
    </div>
  );
}
// Don't use JS destructuring defaults - breaks reactivity:
// function Card({ title = 'Card', ...props }) { ... }
```

</Section>

<Callout type="danger" title="Never destructure props">
Destructuring SolidJS props breaks reactivity because JSX accesses property getters lazily. Always use `props.value`, `omit`, or `merge`.
</Callout>

<Section>

## children helper

Use the `children()` helper when you need to evaluate or inspect children. It memoizes them properly.

```tsx
import { children } from 'solid-js';
import type { JSX } from '@solidjs/web';

type RowProps = { children: JSX.Element };

function Row(props: RowProps): JSX.Element {
  // Memoize children - resolves lazy children/fragments
  const resolved = children(() => props.children);

  // Can now inspect/map resolved children
  const count = () => {
    const c = resolved();
    return Array.isArray(c) ? c.length : c ? 1 : 0;
  };

  return (
    <div>
      <span class="badge">{count()} items</span>
      {resolved()}
    </div>
  );
}
```

</Section>

<Section>

## Component as prop

Pass components as props using `Component<Props>` for dynamic component values or `JSX.Element` for static content.

```tsx
import type { Component } from 'solid-js';
import type { JSX } from '@solidjs/web';

type ListProps<T> = {
  items: T[];
  renderItem: (item: T, index: () => number) => JSX.Element;
  fallback?: JSX.Element;
};

function List<T>(props: ListProps<T>): JSX.Element {
  return (
    <For each={props.items} fallback={props.fallback ?? <p>No items</p>}>
      {props.renderItem}
    </For>
  );
}

// Usage
<List items={users} renderItem={(user) => <UserCard name={user.name} />} />;
```

</Section>
