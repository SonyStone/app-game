<Page
title="Control Flow"
badge="Components"
description="SolidJS provides built-in control flow components that work with its fine-grained reactivity system more efficiently than JS conditional expressions."

>

  <Section
    title="Show"
    description="Conditionally render content. The fallback prop renders when the condition is false."
  >

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

  <Section
    title="For vs Index"
    description="For re-creates items when the array changes (key by reference). Index is stable by position - good for static-length arrays."
  >

```tsx
import { For, Index } from 'solid-js';

// For - keyed by item identity (reference)
// Good for: lists that add/remove/reorder items
<For each={items()}>
  {(item, index) => (
    <li>{index() + 1}. {item.name}</li>
    // item is the value, index is an Accessor<number>
  )}
</For>

// Index - keyed by array position
// Good for: fixed-length lists, primitive arrays
<Index each={scores()}>
  {(score, index) => (
    // score is an Accessor (reactive), index is a number
    <span>#{index}: {score()}</span>
  )}
</Index>
```

  </Section>

  <Section title="Switch / Match">

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

  <Section title="Dynamic" description="Render a component or HTML element determined at runtime.">

```tsx
import { Dynamic } from 'solid-js/web';

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

  <Section title="Live Demo: Show & Switch">
    <ControlFlowDemo />
  </Section>
</Page>
