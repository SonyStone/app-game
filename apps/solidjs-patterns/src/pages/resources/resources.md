<Header>

# Resources <Badge>Async</Badge>

<Description>
  createResource integrates async data fetching into SolidJS reactivity. It works with Suspense and ErrorBoundary
  automatically.
</Description>

</Header>

<Section>

## createResource basics

createResource takes an optional source signal and a fetcher function. It returns a reactive resource with loading and
error states.

```tsx
import { createResource, createSignal } from 'solid-js';

// Simple fetch - runs once
const [user] = createResource(() => fetchUser(1));

// Reactive source - refetches when id() changes
const [id, setId] = createSignal(1);
const [user, { refetch, mutate }] = createResource(id, fetchUser);
// fetcher signature: (id: number) => Promise<User>

// Access state
user(); // current data (undefined while loading)
user.loading; // boolean - true while fetching
user.error; // error if last fetch threw
user.state; // 'unresolved' | 'pending' | 'ready' | 'refreshing' | 'errored'
```

</Section>

<Section>

## With Suspense

Wrap resource consumers in Suspense to declaratively show loading states.

```tsx
import { createResource, Suspense } from 'solid-js';
import { ErrorBoundary } from 'solid-js';

function UserProfile(props: { id: number }) {
  const [user] = createResource(() => props.id, fetchUser);
  return <div>{user()?.name}</div>;
  // No explicit loading check - Suspense handles it
}

function App() {
  return (
    <ErrorBoundary fallback={<p>Failed to load</p>}>
      <Suspense fallback={<Spinner />}>
        <UserProfile id={1} />
      </Suspense>
    </ErrorBoundary>
  );
}
```

</Section>

<Section>

## Live Demo

<ResourceDemo />

</Section>

<Section>

## refetch and mutate

refetch re-runs the fetcher. mutate lets you update the resource value optimistically without a network call.

```tsx
const [todos, { refetch, mutate }] = createResource(fetchTodos);

// Optimistic delete
function deleteTodo(id: number) {
  mutate((todos) => todos?.filter((t) => t.id !== id));
  apiDeleteTodo(id).catch(() => refetch()); // rollback on error
}

// Manual refresh
<button onClick={refetch}>↺ Refresh</button>;
```

</Section>

<Callout type="tip" title="initialValue">
  Pass `initialValue` in options to start with known data (e.g. SSR). The resource will be in 'ready'
  state immediately and Suspense won't trigger on first render.
</Callout>
