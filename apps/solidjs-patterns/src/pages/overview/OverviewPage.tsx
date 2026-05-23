import { A } from '@solidjs/router';
import { For, type JSX } from 'solid-js';
import { Badge } from '../../components/ui/Badge';
import { Card, CardDescription, CardTitle } from '../../components/ui/Card';
import { createPatternMarkdownComponents } from '../markdown-components';
import OverviewContent from './overview.md?markdown';

// ============================================================================
// MARK: Overview Page
// ============================================================================

export default function OverviewPage(): JSX.Element {
  return <OverviewContent components={markdownComponents} />;
}

const markdownComponents = createPatternMarkdownComponents({
  OverviewHero(): JSX.Element {
    return (
      <header class="border-b border-stone-300 pb-8 dark:border-neutral-800">
        <div class="mb-3 flex items-center gap-2">
          <h1 class="text-3xl font-bold text-stone-950 dark:text-white">SolidJS Patterns</h1>
          <Badge variant="secondary">Research Notes</Badge>
        </div>
        <p class="max-w-xl text-sm text-stone-600 dark:text-neutral-400">
          A personal reference site for SolidJS patterns, primitives, and reactive concepts. Collected from
          documentation, experiments, and real-world usage.
        </p>
      </header>
    );
  },
  TopicsGrid(): JSX.Element {
    return (
      <section>
        <h2 class="mb-4 text-xs font-semibold tracking-widest text-stone-500 uppercase dark:text-neutral-500">
          Topics
        </h2>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <For each={quickLinks}>
            {(link) => (
              <A href={link.href} class="group">
                <Card class="transition-colors hover:border-stone-400 hover:bg-stone-100 dark:hover:border-neutral-700 dark:hover:bg-neutral-800/50">
                  <div class="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle class="mb-1 text-stone-950 transition-colors group-hover:text-violet-700 dark:text-neutral-100 dark:group-hover:text-violet-300">
                        {link.title}
                      </CardTitle>
                      <CardDescription>{link.description}</CardDescription>
                    </div>
                    <span class="mt-0.5 text-xl">{link.icon}</span>
                  </div>
                  {link.tags && (
                    <div class="mt-3 flex flex-wrap gap-1">
                      <For each={link.tags}>{(tag) => <Badge variant="outline">{tag}</Badge>}</For>
                    </div>
                  )}
                </Card>
              </A>
            )}
          </For>
        </div>
      </section>
    );
  },
  KeyConcepts(): JSX.Element {
    return (
      <section>
        <h2 class="mb-3 text-xs font-semibold tracking-widest text-stone-500 uppercase dark:text-neutral-500">
          Key Concepts
        </h2>
        <div class="space-y-2 rounded-xl border border-stone-300 bg-stone-100/80 p-5 text-xs text-stone-600 dark:border-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-400">
          <p>
            <span class="font-semibold text-stone-800 dark:text-neutral-300">Fine-grained reactivity: </span>
            SolidJS tracks reactive dependencies at the signal level - components don't re-render; only the parts of the
            DOM that depend on a changed signal update.
          </p>
          <p>
            <span class="font-semibold text-stone-800 dark:text-neutral-300">No virtual DOM: </span>
            Compiled to real DOM operations. JSX runs once at creation time; reactivity is achieved through signals and
            effects, not diffing.
          </p>
          <p>
            <span class="font-semibold text-stone-800 dark:text-neutral-300">Ownership & cleanup: </span>
            Computations are owned by a root or component. When the owner disposes, all nested effects, memos, and
            children are cleaned up automatically.
          </p>
        </div>
      </section>
    );
  }
});

// ============================================================================
// MARK: Data
// ============================================================================

const quickLinks = [
  {
    href: './signals',
    title: 'Signals',
    description: 'createSignal, primitive reactive values, getters & setters.',
    icon: '⚡',
    tags: ['createSignal']
  },
  {
    href: './derived',
    title: 'Derived & Memo',
    description: 'createMemo for derived state and expensive computations.',
    icon: '🧮',
    tags: ['createMemo']
  },
  {
    href: './effects',
    title: 'Effects',
    description: 'createEffect, on(), onMount, and onCleanup patterns.',
    icon: '🔄',
    tags: ['createEffect', 'on']
  },
  {
    href: './batching',
    title: 'Batching & Untrack',
    description: 'batch() for grouping updates, untrack() to read without subscribing.',
    icon: '📦',
    tags: ['batch', 'untrack']
  },
  {
    href: './stores',
    title: 'Stores',
    description: 'createStore for nested/mutable reactive objects.',
    icon: '🗄️',
    tags: ['createStore', 'produce', 'reconcile']
  },
  {
    href: './context',
    title: 'Context',
    description: 'createContext and useContext for dependency injection.',
    icon: '🌐',
    tags: ['createContext', 'useContext']
  },
  {
    href: './components',
    title: 'Component Patterns',
    description: 'Props, children, splitProps, mergeProps best practices.',
    icon: '🧩',
    tags: ['splitProps', 'mergeProps']
  },
  {
    href: './control-flow',
    title: 'Control Flow',
    description: 'Show, For, Switch, Index, Dynamic, Portal.',
    icon: '🔀',
    tags: ['Show', 'For', 'Switch']
  },
  {
    href: './resources',
    title: 'Resources',
    description: 'createResource for async data fetching with Suspense.',
    icon: '🌊',
    tags: ['createResource', 'Suspense']
  },
  {
    href: './primitives',
    title: 'Primitives',
    description: '@solid-primitives patterns and utilities.',
    icon: '🛠️',
    tags: ['solid-primitives']
  }
];
