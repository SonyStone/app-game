import { makeEventListener } from '@solid-primitives/event-listener';
import {
  ComponentProps,
  createEffect,
  createMemo,
  createSignal,
  ErrorBoundary,
  For,
  onCleanup,
  onMount,
  type JSX
} from 'solid-js';
import { Sidebar } from './components/Sidebar';
import {
  applyTheme,
  getStoredThemeMode,
  getSystemTheme,
  persistThemeMode,
  resolveTheme,
  THEME_MEDIA_QUERY,
  type ResolvedTheme,
  type ThemeMode
} from './lib/theme';

// ============================================================================
// MARK: App (root layout)
// ============================================================================

export function App(props: { children?: JSX.Element }): JSX.Element {
  const [themeMode, setThemeMode] = createSignal<ThemeMode>(getStoredThemeMode());
  const [systemTheme, setSystemTheme] = createSignal<ResolvedTheme>(getSystemTheme());
  const resolvedTheme = createMemo(() => resolveTheme(themeMode(), systemTheme()));

  createEffect(() => {
    persistThemeMode(themeMode());
    applyTheme(themeMode(), systemTheme());
  });

  onMount(() => {
    const mediaQuery = window.matchMedia(THEME_MEDIA_QUERY);

    setSystemTheme(mediaQuery.matches ? 'dark' : 'light');

    makeEventListener(mediaQuery, 'change', (event) => {
      setSystemTheme(event.matches ? 'dark' : 'light');
    });
  });

  return (
    <div class={`flex h-screen flex-col`}>
      <Body class="m-0 bg-stone-50 text-stone-900 dark:bg-neutral-950 dark:text-slate-200" />

      {/* Header */}
      <header class="flex shrink-0 items-center gap-3 border-b border-stone-300 bg-stone-100/90 px-6 py-3 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/90">
        <div class="w-8 md:hidden" />
        <div class="flex items-baseline gap-2">
          <h1 class="text-base font-bold text-stone-950 dark:text-white">SolidJS</h1>
          <span class="text-xs font-medium text-violet-700 dark:text-violet-400">Patterns</span>
        </div>
        <div class="ml-auto flex items-center gap-3">
          <ThemeToggle themeMode={themeMode()} resolvedTheme={resolvedTheme()} onChange={setThemeMode} />
          <span class="hidden text-xs text-stone-500 lg:block dark:text-slate-600">Research &amp; Notes</span>
        </div>
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

function ThemeToggle(props: {
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  onChange: (themeMode: ThemeMode) => void;
}): JSX.Element {
  return (
    <div class="theme-toggle" role="group" aria-label="Theme preference">
      <For each={themeOptions}>
        {(option) => (
          <button
            type="button"
            class="theme-toggle-button"
            data-active={props.themeMode === option.value}
            title={
              option.value === 'system' ? `Follow system appearance (${props.resolvedTheme})` : `${option.label} theme`
            }
            aria-pressed={props.themeMode === option.value}
            onClick={() => props.onChange(option.value)}
          >
            {option.label}
          </button>
        )}
      </For>
    </div>
  );
}

function PageError(props: { error: Error; reset: () => void }): JSX.Element {
  return (
    <div class="flex flex-col items-center gap-4 rounded-xl border border-red-500/30 bg-red-500/5 p-8">
      <div class="text-lg font-bold text-red-400">Something went wrong</div>
      <pre class="max-w-full overflow-x-auto rounded-lg bg-red-950/10 p-4 text-xs text-red-700 dark:bg-black/30 dark:text-red-300">
        {props.error.message}
        {props.error.stack && (
          <>
            {'\n\n'}
            {props.error.stack}
          </>
        )}
      </pre>
      <button
        class="rounded-lg bg-red-500/15 px-4 py-2 text-sm text-red-700 hover:bg-red-500/20 dark:bg-red-500/20 dark:text-red-300 dark:hover:bg-red-500/30"
        onClick={props.reset}
      >
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

const themeOptions = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Auto' }
] satisfies ReadonlyArray<{ value: ThemeMode; label: string }>;
