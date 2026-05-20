import { createResource, createSignal, Suspense, type JSX } from 'solid-js';
import { template } from 'solid-js/web';
import { CodeBlock } from '../components/CodeBlock';
import { Callout, PatternLayout, PatternSection } from '../components/PatternLayout';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import example1Html, {
  code as example1Code,
  language as example1Language
} from './resources-example-1.txt?shiki&lang=tsx';
import example2Html, {
  code as example2Code,
  language as example2Language
} from './resources-example-2.txt?shiki&lang=tsx';
import example3Html, {
  code as example3Code,
  language as example3Language
} from './resources-example-3.txt?shiki&lang=tsx';

// ============================================================================
// MARK: Resources Page
// ============================================================================

export default function ResourcesPage(): JSX.Element {
  return (
    <PatternLayout
      title="Resources"
      badge="Async"
      description="createResource integrates async data fetching into SolidJS reactivity. It works with Suspense and ErrorBoundary automatically."
    >
      <PatternSection
        title="createResource basics"
        description="createResource takes an optional source signal and a fetcher function. It returns a reactive resource with loading/error states."
      >
        <CodeBlock language={example1Language} code={example1Code}>
          {template(example1Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection
        title="With Suspense"
        description="Wrap resource consumers in Suspense to declaratively show loading states."
      >
        <CodeBlock language={example2Language} code={example2Code}>
          {template(example2Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection title="Live Demo">
        <ResourceDemo />
      </PatternSection>

      <PatternSection
        title="refetch and mutate"
        description="refetch re-runs the fetcher. mutate lets you update the resource value optimistically without a network call."
      >
        <CodeBlock language={example3Language} code={example3Code}>
          {template(example3Html)()}
        </CodeBlock>
      </PatternSection>

      <Callout type="tip" title="initialValue">
        Pass <code class="rounded bg-white/10 px-1">initialValue</code> in options to start with known data (e.g. SSR).
        The resource will be in 'ready' state immediately and Suspense won't trigger on first render.
      </Callout>
    </PatternLayout>
  );
}

// ============================================================================
// MARK: Live Demo
// ============================================================================

type Post = { id: number; title: string; body: string };

async function fetchPost(id: number): Promise<Post> {
  const res = await fetch(`https://jsonplaceholder.typicode.com/posts/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<Post>;
}

function ResourceDemo(): JSX.Element {
  const [postId, setPostId] = createSignal(1);
  const [post, { refetch }] = createResource(postId, fetchPost);

  return (
    <Card class="flex flex-col gap-4">
      <div class="flex items-center gap-3">
        <span class="text-xs text-neutral-500">Post ID:</span>
        <Button size="sm" variant="outline" onClick={() => setPostId((v) => Math.max(1, v - 1))}>
          −
        </Button>
        <span class="w-6 text-center font-mono text-sm text-violet-300">{postId()}</span>
        <Button size="sm" variant="outline" onClick={() => setPostId((v) => Math.min(10, v + 1))}>
          +
        </Button>
        <Button size="sm" variant="ghost" onClick={() => refetch()}>
          ↺ refetch
        </Button>
      </div>

      <div class="text-xs text-neutral-500">
        State: <span class="font-mono text-violet-300">{post.state}</span>
      </div>

      <Suspense fallback={<div class="animate-pulse text-xs text-neutral-500">Fetching post…</div>}>
        <div class="rounded-lg bg-neutral-950 p-4">
          <p class="mb-1 text-sm font-semibold text-neutral-100">{post()?.title}</p>
          <p class="text-xs text-neutral-500">{post()?.body}</p>
        </div>
      </Suspense>
    </Card>
  );
}
