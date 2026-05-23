import { createResource, createSignal, Suspense, type JSX } from 'solid-js';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { createPatternMarkdownComponents } from '../markdown-components';
import ResourcesContent from './resources.md?markdown';

// ============================================================================
// MARK: Resources Page
// ============================================================================

export default function ResourcesPage(): JSX.Element {
  return <ResourcesContent components={markdownComponents} />;
}

const markdownComponents = createPatternMarkdownComponents({
  ResourceDemo
});

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
