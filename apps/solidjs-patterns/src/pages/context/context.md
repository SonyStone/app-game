<Header>

# Context <Badge>State</Badge>

<Description>
createContext and useContext provide a scoped dependency injection mechanism. Context values are available to
all descendants without prop drilling.
</Description>

</Header>

<Section>

## createContext

createContext creates a context object with an optional default value. The actual value is provided by a
`Context.Provider`.

```tsx
import { createContext, useContext } from 'solid-js';

// Create the context with a default value
const ThemeContext = createContext<'light' | 'dark'>('dark');

// Provide a value to descendants
function App() {
  return (
    <ThemeContext.Provider value="light">
      <Page />
    </ThemeContext.Provider>
  );
}

// Consume anywhere in the subtree
function Button() {
  const theme = useContext(ThemeContext);
  return <button class={theme === 'dark' ? 'btn-dark' : 'btn-light'}>Click</button>;
}
```

</Section>

<Section>

## Context with signals

Wrap a signal or store in context to share reactive state without prop drilling.

```tsx
import { createContext, createSignal, useContext, type Accessor, type Setter } from 'solid-js';

type CounterContextValue = {
  count: Accessor<number>;
  increment: () => void;
  decrement: () => void;
};

const CounterContext = createContext<CounterContextValue>();

export function CounterProvider(props: { children: JSX.Element }) {
  const [count, setCount] = createSignal(0);

  return (
    <CounterContext.Provider
      value={{
        count,
        increment: () => setCount((c) => c + 1),
        decrement: () => setCount((c) => c - 1)
      }}
    >
      {props.children}
    </CounterContext.Provider>
  );
}

export function useCounter(): CounterContextValue {
  const ctx = useContext(CounterContext);
  if (!ctx) throw new Error('useCounter must be used inside CounterProvider');
  return ctx;
}
```

</Section>

<Section>

## Live Demo

<ContextDemo />

</Section>

<Callout type="tip" title="Guard with a custom hook">
Always create a named hook (e.g. `useCounter()`) that calls `useContext` and throws if the
provider is missing. This gives better error messages than silently returning undefined.
</Callout>

<Section>

## Context vs signals

Use context for values that need to be scoped to a subtree. For truly global state, a module-level signal or store
works fine.

```ts
// Module-level signal - truly global, no provider needed
export const [globalTheme, setGlobalTheme] = createSignal<'light' | 'dark'>('dark');

// Context - scoped, supports multiple instances, testable
export const ThemeContext = createContext<Theme>('dark');

// Use context when:
// - You want to scope state to a subtree
// - You have multiple instances (e.g., nested providers)
// - You want to swap implementations in tests
```

</Section>
