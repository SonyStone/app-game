<Header>

# Loading, Reveal & Lazy <Badge>Async</Badge>

<Description>
  Solid 2 coordinates pending async computations with Loading and Reveal. lazy() still code-splits components, while
  Errored handles failures.
</Description>

</Header>

<Section>

## Loading

`Loading` catches pending async computations in its subtree and shows its fallback until they resolve.

```tsx
import { Loading } from 'solid-js';

<Loading fallback={<p>Loading...</p>}>
  <UserProfile />
  <PostList />
</Loading>;
```

</Section>

<Section>

## Reveal

`Reveal` coordinates multiple loading boundaries and controls their reveal order.

```tsx
import { Loading, Reveal } from 'solid-js';

<Reveal order="forwards">
  <Loading fallback={<Skeleton />}>
    <Header />
  </Loading>
  <Loading fallback={<Skeleton />}>
    <Main />
  </Loading>
</Reveal>;
```

</Section>

<Section>

## lazy

`lazy` wraps a dynamic import and returns a component that participates in a `Loading` boundary.

```tsx
import { lazy, Loading } from 'solid-js';

const Dashboard = lazy(() => import('./Dashboard'));

function App() {
  return (
    <Loading fallback={<div>Loading dashboard...</div>}>
      <Dashboard />
    </Loading>
  );
}
```

</Section>

<Section>

## Errored

`Errored` catches errors in the render tree, including rejected async computations.

```tsx
import { Errored, Loading } from 'solid-js';

<Errored fallback={(error, reset) => <button onClick={reset}>Retry: {error().message}</button>}>
  <Loading fallback={<Spinner />}>
    <Dashboard />
  </Loading>
</Errored>;
```

</Section>
