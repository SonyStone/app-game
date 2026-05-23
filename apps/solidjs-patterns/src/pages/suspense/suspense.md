<header>

# Suspense & Lazy <Badge>Async</Badge>

<Description>
Suspense declaratively handles loading states for async resources. lazy() code-splits components.
</Description>

</header>

<section>

## Suspense

Suspense catches all pending resources in its subtree and shows the fallback until they resolve.

```tsx
import { Suspense } from 'solid-js';

// Shows fallback while any resource in the tree is loading
<Suspense fallback={<p>Loading...</p>}>
  <UserProfile /> {/* uses createResource internally */}
  <PostList /> {/* also uses createResource */}
</Suspense>;
// Both resolve before rendering children
```

</section>

<section>

## SuspenseList

SuspenseList coordinates multiple Suspense boundaries and controls their reveal order.

```tsx
import { SuspenseList, Suspense } from 'solid-js';

<SuspenseList revealOrder="forwards" tail="collapsed">
  <Suspense fallback={<Skeleton />}>
    <Header />
  </Suspense>
  <Suspense fallback={<Skeleton />}>
    <Body /> {/* waits for Header, then reveals */}
  </Suspense>
  <Suspense fallback={<Skeleton />}>
    <Footer />
  </Suspense>
</SuspenseList>;
// revealOrder: 'forwards' | 'backwards' | 'together'
// tail: 'hidden' | 'collapsed'
```

</section>

<section>

## lazy() - code splitting

lazy wraps a dynamic import and returns a component that integrates with Suspense.

```tsx
import { lazy, Suspense } from 'solid-js';

// Component is loaded on first render
const HeavyChart = lazy(() => import('./HeavyChart'));
const DataTable = lazy(() => import('./DataTable'));

function Dashboard() {
  return (
    <Suspense fallback={<div>Loading dashboard...</div>}>
      <HeavyChart />
      <DataTable />
    </Suspense>
  );
}

// With @solidjs/router (auto Suspense)
const routes = [{ path: '/dashboard', component: lazy(() => import('./Dashboard')) }];
```

</section>

<section>

## ErrorBoundary

Catches errors thrown in the render tree, including resource errors. It is required when using Suspense with fallible
resources.

```tsx
import { ErrorBoundary, Suspense } from 'solid-js';

function App() {
  return (
    <ErrorBoundary
      fallback={(err, reset) => (
        <div>
          <p>Error: {err.message}</p>
          <button onClick={reset}>Retry</button>
        </div>
      )}
    >
      <Suspense fallback={<Spinner />}>
        <DataView />
      </Suspense>
    </ErrorBoundary>
  );
}
```

</section>
