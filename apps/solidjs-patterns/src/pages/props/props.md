<Header>

# Props & Spreading <Badge>Components</Badge>

<Description>
  How SolidJS handles props spreading, forwarding, and native element attribute passing.
</Description>

</Header>

<Section>

## Spreading props onto native elements

Spread remaining props onto the native element. SolidJS handles the DOM attributes correctly.

```tsx
import { omit } from 'solid-js';

type InputProps = JSX.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

function Input(props: InputProps): JSX.Element {
  const rest = omit(props, 'label');
  return (
    <div>
      {props.label && <label>{props.label}</label>}
      <input {...rest} /> {/* all native attrs forwarded */}
    </div>
  );
}

// Usage - class, onInput, etc. forwarded automatically
<Input label="Email" type="email" placeholder="you@example.com" required />;
```

</Section>

<Section>

## class prop merging

Solid 2's `class` accepts strings, records, and nested arrays, so values compose without a classList prop.

```tsx
import { omit } from 'solid-js';

type CardProps = JSX.HTMLAttributes<HTMLDivElement> & { class?: string };

function Card(props: CardProps): JSX.Element {
  const rest = omit(props, 'class', 'children');
  return (
    <div {...rest} class={['rounded-xl bg-neutral-900 p-4', props.class]}>
      {props.children}
    </div>
  );
}

// Consumer can extend styles
<Card class="border border-violet-500" />;
```

</Section>

<Section>

## ref forwarding

Forward refs to DOM elements with an explicit callback so assignment is visible at the JSX boundary.

```tsx
import { onSettled } from 'solid-js';

type InputProps = JSX.InputHTMLAttributes<HTMLInputElement> & {
  ref?: HTMLInputElement | ((el: HTMLInputElement) => void);
};

function FancyInput(props: InputProps): JSX.Element {
  return <input {...props} class={['fancy-input', props.class]} />;
}

// Usage - ref is assigned when mounted
function Form(): JSX.Element {
  let inputRef!: HTMLInputElement;
  onSettled(() => inputRef.focus());
  return <FancyInput ref={(element) => (inputRef = element)} />;
}
```

</Section>

<Callout type="info" title="Attach behavior with refs">
  Solid 2 favors explicit ref callbacks for attaching behavior to DOM elements. A callback makes ownership and cleanup
  visible without relying on the removed `use:` directive transform.
</Callout>
