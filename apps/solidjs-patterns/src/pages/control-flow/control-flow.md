<Header>

# Control Flow <Badge>Components</Badge>

<Description>
SolidJS provides built-in control flow components that work with its fine-grained reactivity system more
efficiently than JavaScript conditional expressions.
</Description>

</Header>

<Section>

## Show

Conditionally render content. The `fallback` prop renders when the condition is false.

```tsx
import { Show } from 'solid-js';

// Basic condition
<Show when={isLoggedIn()}>
  <UserPanel />
</Show>

// With fallback
<Show when={user()} fallback={<LoginButton />}>
  {(u) => <UserPanel name={u().name} />}
  {/* Callback form - u() is narrowed (non-null) */}
</Show>

// Avoid ternary for components - Show re-mounts on changes
// Bad: {condition() ? <HeavyComponent /> : null}
// Good: <Show when={condition()}><HeavyComponent /></Show>
```

</Section>

<Section>

## Keyed and positional For

`For` is keyed by item identity by default. Pass `keyed={false}` to keep rows stable by position, which is useful for
fixed-length primitive arrays.

```tsx
import { For } from 'solid-js';

// For - keyed by item identity (reference)
// Good for: lists that add/remove/reorder items
<For each={items()}>
  {(item, index) => (
    <li>{index() + 1}. {item.name}</li>
    // item is the value, index is an Accessor<number>
  )}
</For>

// Positional For - keyed by array position
// Good for: fixed-length lists, primitive arrays
<For each={scores()} keyed={false}>
  {(score, index) => (
    // score is an Accessor (reactive), index is a number
    <span>#{index}: {score()}</span>
  )}
</For>
```

</Section>

<Section>

## Switch / Match

```tsx
import { Switch, Match } from 'solid-js';

// Switch renders the first matching Match
<Switch fallback={<p>Unknown status</p>}>
  <Match when={status() === 'loading'}>
    <Spinner />
  </Match>
  <Match when={status() === 'error'}>
    <ErrorMsg message={error()} />
  </Match>
  <Match when={status() === 'success'}>
    <DataView data={data()} />
  </Match>
</Switch>;
```

</Section>

<Section>

## Dynamic

Render a component or HTML element determined at runtime.

```tsx
import { Dynamic } from '@solidjs/web';

const [tag, setTag] = createSignal<'h1' | 'h2' | 'p'>('h1');

// Renders different elements based on tag()
<Dynamic component={tag()} class="heading">
  Hello World
</Dynamic>;

// Works with components too
const widgets = { button: ButtonWidget, input: InputWidget };
<Dynamic component={widgets[type()]} {...widgetProps} />;
```

</Section>

<Section>

## Live Demo: Show & Switch

<ControlFlowDemo />

</Section>
