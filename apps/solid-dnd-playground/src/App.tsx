import { ComponentProps, createEffect, ErrorBoundary, onCleanup, type JSX } from 'solid-js';
import Sidebar from './components/Sidebar';

// ============================================================================
// MARK: App (root layout)
// ============================================================================

export default function App(props: { children?: JSX.Element }): JSX.Element {
  return (
    <div class="flex h-screen flex-col">
      <Body class="m-0 bg-[#1a1a2e] text-[#e0e0e0]" />
      {/* Header */}
      <header class="flex items-center gap-4 border-b border-white/10 bg-white/5 px-6 py-3">
        {/* Spacer for mobile hamburger */}
        <div class="w-8 md:hidden" />
        <h1 class="text-lg font-bold text-white">solid-dnd</h1>
        <span class="text-xs text-neutral-500">Playground</span>
      </header>

      {/* Body: sidebar + content */}
      <div class="flex min-h-0 flex-1">
        <Sidebar />

        <main class="flex-1 overflow-y-auto p-6">
          <div class="mx-auto max-w-2xl">
            <ErrorBoundary fallback={(err, reset) => <DemoError error={err} reset={reset} />}>
              {props.children}
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}

// MARK: Error Fallback

function DemoError(props: { error: Error; reset: () => void }): JSX.Element {
  console.error('Demo error:', props.error);
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

function Body(props: Pick<ComponentProps<'body'>, 'class'>) {
  createEffect(() => {
    document.body.className = props.class || '';
  });

  onCleanup(() => {
    document.body.className = '';
  });

  return null;
}
