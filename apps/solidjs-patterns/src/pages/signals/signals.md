<header>

# Signals

<Badge>Core</Badge>
<Description>
Signals are the fundamental reactive primitive in SolidJS. They hold a value and notify subscribers when they
change.
</Description>

</header>

<section>

## Basic Signal 2

createSignal returns a getter and setter tuple. The getter is a function - calling it inside a reactive context
subscribes to changes.

```tsx title="basic-signal.tsx"
import { createSignal } from 'solid-js';

const [count, setCount] = createSignal(0);

// Read: call the getter
console.log(count()); // 0

// Write: call the setter
setCount(1);
setCount((prev) => prev + 1); // functional update
```

</section>

<section>

## Live Demo

<SignalDemo />

</section>

<section>

## Equality Check

Signals skip notifications when the new value equals the old one. Customize with the `equals` option.

```tsx
// Custom equality - always notify (useful for arrays/objects)
const [items, setItems] = createSignal([], { equals: false });

// Never re-run subscribers (suppress updates)
const [data, setData] = createSignal(initialData, { equals: () => true });

// Custom comparator
const [pos, setPos] = createSignal({ x: 0, y: 0 }, { equals: (a, b) => a.x === b.x && a.y === b.y });
```

</section>

<section>

## Signals vs State

Unlike React useState, signals are not tied to components. They can live outside components and be shared freely.

```tsx
// Global signal - lives outside any component
export const [theme, setTheme] = createSignal<'light' | 'dark'>('dark');

// Use in any component without prop drilling
function ThemeToggle() {
  return <button onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}>Current: {theme()}</button>;
}
```

</section>

<Callout type="tip" title="Getter is a function">
  Always call the getter as a function: <code>count()</code>, not <code>count</code>. Passing the getter (not
  calling it) lets you pass reactivity around without subscribing.
</Callout>

<section>

## Passing Reactivity

Pass the getter function without calling it to defer reading and preserve the reactive subscription at the call site.

```tsx
// Pass getter - child subscribes at its own level
function Parent() {
  const [count, setCount] = createSignal(0);
  return <Display value={count} />;
  //                      ^^^^^ pass getter, not count()
}

function Display(props: { value: Accessor<number> }) {
  return <span>{props.value()}</span>;
  //            ^^^^^^^^^^^^^ subscribe here
}

// Pass value - breaks reactivity, static snapshot
function Parent() {
  const [count] = createSignal(0);
  return <Display value={count()} />; // count() is 0 forever
}
```

</section>
