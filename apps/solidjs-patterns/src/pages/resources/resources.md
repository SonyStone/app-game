<Header>

# Async memos <Badge>Async</Badge>

<Description>
  Solid 2 uses promise-returning createMemo computations for reactive data fetching. Loading, Errored, isPending,
  latest, and refresh provide boundary and status control.
</Description>

</Header>

<Section>

## Async createMemo basics

Return a promise from `createMemo`. Reactive values read before the promise is created become dependencies, so a
changed source starts a new request.

```tsx
import { createMemo, createSignal, isPending, refresh } from 'solid-js';

const [id, setId] = createSignal(1);
const user = createMemo(() => fetchUser(id()));

user(); // resolved data; suspends while the current request is pending
isPending(user); // pending state for this computation
refresh(user); // rerun the computation without changing id
```

</Section>

<Section>

## Loading and Errored boundaries

`Loading` renders a fallback while a descendant async computation is pending. `Errored` handles failures and exposes
a reset callback.

```tsx
import { createMemo, Errored, Loading } from 'solid-js';

function UserProfile(props: { id: number }) {
  const user = createMemo(() => fetchUser(props.id));

  return (
    <Errored fallback={(error, reset) => <button onClick={reset}>Retry: {error().message}</button>}>
      <Loading fallback={<Spinner />}>
        <div>{user().name}</div>
      </Loading>
    </Errored>
  );
}
```

</Section>

<Section>

## Live Demo

<ResourceDemo />

</Section>

<Section>

## Keep stale data visible with latest

`latest` returns the last resolved value while a refresh is pending. This is useful when replacing the whole view with
a loading fallback would be distracting.

```tsx
import { createMemo, isPending, latest, refresh } from 'solid-js';

const todos = createMemo(fetchTodos);
const visibleTodos = () => latest(todos) ?? [];

<button disabled={isPending(todos)} onClick={() => refresh(todos)}>
  Refresh
</button>;
```

</Section>

<Callout type="tip" title="Seed the first render">
  Pass `{ loadingValue: initialData }` to createMemo when SSR or cached data should remain available during the first
  request.
</Callout>
