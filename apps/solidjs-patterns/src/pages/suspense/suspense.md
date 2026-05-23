<Page
title="Suspense & Lazy"
badge="Async"
description="Suspense declaratively handles loading states for async resources. lazy() code-splits components."

>

  <Section
    title="Suspense"
    description="Suspense catches all pending resources in its subtree and shows the fallback until they resolve."
  >

```tsx
import { Suspense } from 'solid-js';

// Shows fallback while any resource in the tree is loading
<Suspense fallback={<p>Loading...</p>}>
  <UserProfile /> {/* uses createResource internally */}
  <PostList /> {/* also uses createResource */}
</Suspense>;
// Both resolve before rendering children
```

  </Section>

  <Section
    title="SuspenseList"
    description="Coordinates multiple Suspense boundaries, controlling order and revealing strategy."
  >

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

  </Section>

  <Section
    title="lazy() - code splitting"
    description="lazy wraps a dynamic import and returns a component that integrates with Suspense."
  >

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

  </Section>

  <Section
    title="ErrorBoundary"
    description="Catches errors thrown in the render tree (including resource errors). Required when using Suspense with fallible resources."
  >

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

  </Section>
</Page>
