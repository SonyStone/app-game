import { type JSX } from 'solid-js';
import { CodeBlock } from '../components/CodeBlock';
import { PatternLayout, PatternSection } from '../components/PatternLayout';

// ============================================================================
// MARK: Suspense Page
// ============================================================================

export default function SuspensePage(): JSX.Element {
  return (
    <PatternLayout
      title="Suspense & Lazy"
      badge="Async"
      description="Suspense declaratively handles loading states for async resources. lazy() code-splits components."
    >
      <PatternSection
        title="Suspense"
        description="Suspense catches all pending resources in its subtree and shows the fallback until they resolve."
      >
        <CodeBlock
          language="tsx"
          code={`import { Suspense } from 'solid-js';

// Shows fallback while any resource in the tree is loading
<Suspense fallback={<p>Loading…</p>}>
  <UserProfile />    {/* uses createResource internally */}
  <PostList />       {/* also uses createResource */}
</Suspense>
// Both resolve before rendering children`}
        />
      </PatternSection>

      <PatternSection
        title="SuspenseList"
        description="Coordinates multiple Suspense boundaries, controlling order and revealing strategy."
      >
        <CodeBlock
          language="tsx"
          code={`import { SuspenseList, Suspense } from 'solid-js';

<SuspenseList revealOrder="forwards" tail="collapsed">
  <Suspense fallback={<Skeleton />}>
    <Header />
  </Suspense>
  <Suspense fallback={<Skeleton />}>
    <Body />      {/* waits for Header, then reveals */}
  </Suspense>
  <Suspense fallback={<Skeleton />}>
    <Footer />
  </Suspense>
</SuspenseList>
// revealOrder: 'forwards' | 'backwards' | 'together'
// tail: 'hidden' | 'collapsed'`}
        />
      </PatternSection>

      <PatternSection
        title="lazy() — code splitting"
        description="lazy wraps a dynamic import and returns a component that integrates with Suspense."
      >
        <CodeBlock
          language="tsx"
          code={`import { lazy, Suspense } from 'solid-js';

// Component is loaded on first render
const HeavyChart = lazy(() => import('./HeavyChart'));
const DataTable = lazy(() => import('./DataTable'));

function Dashboard() {
  return (
    <Suspense fallback={<div>Loading dashboard…</div>}>
      <HeavyChart />
      <DataTable />
    </Suspense>
  );
}

// With @solidjs/router (auto Suspense)
const routes = [
  { path: '/dashboard', component: lazy(() => import('./Dashboard')) }
];`}
        />
      </PatternSection>

      <PatternSection
        title="ErrorBoundary"
        description="Catches errors thrown in the render tree (including resource errors). Required when using Suspense with fallible resources."
      >
        <CodeBlock
          language="tsx"
          code={`import { ErrorBoundary, Suspense } from 'solid-js';

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
}`}
        />
      </PatternSection>
    </PatternLayout>
  );
}
