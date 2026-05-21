import { type JSX } from 'solid-js';
import { Badge } from './ui/Badge';

// ============================================================================
// MARK: PatternLayout — page-level layout wrapper
// ============================================================================

export type PatternLayoutProps = {
  title: string;
  description: string;
  badge?: string;
  children: JSX.Element;
};

export function PatternLayout(props: PatternLayoutProps): JSX.Element {
  return (
    <article class="flex flex-col gap-8">
      <PageHeader title={props.title} description={props.description} badge={props.badge} />
      {props.children}
    </article>
  );
}

// ============================================================================
// MARK: PatternSection — a named section within a page
// ============================================================================

export type PatternSectionProps = {
  title: string;
  description?: string;
  children: JSX.Element;
};

export function PatternSection(props: PatternSectionProps): JSX.Element {
  return (
    <section class="flex flex-col gap-3">
      <div>
        <h2 class="text-sm font-semibold text-stone-900 dark:text-slate-200">{props.title}</h2>
        {props.description && <p class="mt-0.5 text-xs text-stone-500 dark:text-slate-500">{props.description}</p>}
      </div>
      {props.children}
    </section>
  );
}

// ============================================================================
// MARK: Callout — highlighted note or warning box
// ============================================================================

export type CalloutProps = {
  type?: 'info' | 'warning' | 'tip' | 'danger';
  title?: string;
  children: JSX.Element;
};

const calloutStyles = {
  info: 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800/50 dark:bg-blue-950/30 dark:text-blue-300',
  warning:
    'border-yellow-400 bg-yellow-50 text-yellow-800 dark:border-yellow-800/50 dark:bg-yellow-950/30 dark:text-yellow-300',
  tip: 'border-green-300 bg-green-50 text-green-700 dark:border-green-800/50 dark:bg-green-950/30 dark:text-green-300',
  danger: 'border-red-300 bg-red-50 text-red-700 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-300'
};

const calloutIcons = {
  info: 'ℹ',
  warning: '⚠',
  tip: '💡',
  danger: '🚫'
};

export function Callout(props: CalloutProps): JSX.Element {
  const type = () => props.type ?? 'info';

  return (
    <div class={`rounded-lg border p-4 text-xs ${calloutStyles[type()]}`}>
      <div class="flex items-start gap-2">
        <span class="mt-0.5 shrink-0 text-sm">{calloutIcons[type()]}</span>
        <div class="flex flex-col gap-1">
          {props.title && <span class="font-semibold">{props.title}</span>}
          <span class="text-inherit/80">{props.children}</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MARK: PageHeader (internal)
// ============================================================================

function PageHeader(props: { title: string; description: string; badge?: string }): JSX.Element {
  return (
    <header class="border-b border-stone-300 pb-6 dark:border-slate-800">
      <div class="mb-2 flex items-center gap-2">
        <h1 class="text-2xl font-bold text-stone-950 dark:text-white">{props.title}</h1>
        {props.badge && <Badge variant="default">{props.badge}</Badge>}
      </div>
      <p class="text-sm text-stone-600 dark:text-slate-400">{props.description}</p>
    </header>
  );
}
