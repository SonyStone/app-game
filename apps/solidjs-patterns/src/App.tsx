import { ComponentProps, createEffect, ErrorBoundary, onCleanup, type JSX } from 'solid-js';
import { Sidebar } from './components/Sidebar';

// ============================================================================
// MARK: App (root layout)
// ============================================================================

export function App(props: { children?: JSX.Element }): JSX.Element {
  return (
    <div class="flex h-screen flex-col">
      <Body class="m-0 bg-neutral-950 text-neutral-200" />

      {/* Header */}
      <header class="flex shrink-0 items-center gap-3 border-b border-neutral-800 bg-neutral-900 px-6 py-3">
        <div class="w-8 md:hidden" />
        <div class="flex items-baseline gap-2">
          <h1 class="text-base font-bold text-white">SolidJS</h1>
          <span class="text-xs font-medium text-violet-400">Patterns</span>
        </div>
        <span class="ml-auto text-xs text-neutral-600">Research &amp; Notes</span>
      </header>

      {/* Body: sidebar + content */}
      <div class="flex min-h-0 flex-1">
        <Sidebar />

        <main class="flex-1 overflow-y-auto">
          <div class="mx-auto max-w-3xl px-6 py-8">
            <ErrorBoundary fallback={(err, reset) => <PageError error={err} reset={reset} />}>
              {props.children}
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}

// ============================================================================
// MARK: Sub-Components
// ============================================================================

function PageError(props: { error: Error; reset: () => void }): JSX.Element {
  return (
    <div class="flex flex-col items-center gap-4 rounded-xl border border-red-500/30 bg-red-500/5 p-8">
      <div class="text-lg font-bold text-red-400">Something went wrong</div>
      <pre class="max-w-full overflow-x-auto rounded-lg bg-black/30 p-4 text-xs text-red-300">
        {props.error.message}
        {props.error.stack && (
          <>
            {'\n\n'}
            {props.error.stack}
          </>
        )}
      </pre>
      <button class="rounded-lg bg-red-500/20 px-4 py-2 text-sm text-red-300 hover:bg-red-500/30" onClick={props.reset}>
        Try again
      </button>
    </div>
  );
}

function Body(props: Pick<ComponentProps<'body'>, 'class'>): null {
  createEffect(() => {
    document.body.className = props.class ?? '';
  });

  onCleanup(() => {
    document.body.className = '';
  });

  return null;
}
