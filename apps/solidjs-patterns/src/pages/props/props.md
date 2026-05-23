<article>
  <header>

# Props & Spreading

    <Badge>Components</Badge>
    <Description>
      How SolidJS handles props spreading, forwarding, and native element attribute passing.
    </Description>

  </header>

  <section>

## Spreading props onto native elements

Spread remaining props onto the native element. SolidJS handles the DOM attributes correctly.

```tsx
type InputProps = JSX.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

function Input(props: InputProps): JSX.Element {
  const [local, rest] = splitProps(props, ['label']);
  return (
    <div>
      {local.label && <label>{local.label}</label>}
      <input {...rest} /> {/* all native attrs forwarded */}
    </div>
  );
}

// Usage - className, onInput, etc. forwarded automatically
<Input label="Email" type="email" placeholder="you@example.com" required />;
```

  </section>

  <section>

## class prop merging

SolidJS uses `class`, not `className`. Merge it with a utility when you need conditional classes.

```tsx
import { cn } from '../lib/utils'; // clsx + tailwind-merge
import { splitProps } from 'solid-js';

type CardProps = JSX.HTMLAttributes<HTMLDivElement> & { class?: string };

function Card(props: CardProps): JSX.Element {
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <div {...rest} class={cn('rounded-xl bg-neutral-900 p-4', local.class)}>
      {local.children}
    </div>
  );
}

// Consumer can extend styles
<Card class="border border-violet-500" />;
```

  </section>

  <section>

## ref forwarding

Forward refs to DOM elements using the `ref` prop. SolidJS refs are assigned on mount, not wrapped in a callback.

```tsx
type InputProps = JSX.InputHTMLAttributes<HTMLInputElement> & {
  ref?: HTMLInputElement | ((el: HTMLInputElement) => void);
};

function FancyInput(props: InputProps): JSX.Element {
  const [local, rest] = splitProps(props, []);
  return <input {...rest} class="fancy-input" />;
}

// Usage - ref is assigned when mounted
function Form(): JSX.Element {
  let inputRef!: HTMLInputElement;
  onMount(() => inputRef.focus());
  return <FancyInput ref={inputRef} />;
}
```

  </section>

  <Callout type="info" title="use:directive syntax">
    SolidJS supports custom directives via the <code>use:</code> prefix. Declare them with <code>
      declare module 'solid-js'
    </code> for TypeScript support. See the Directives page for details.
  </Callout>
</article>
