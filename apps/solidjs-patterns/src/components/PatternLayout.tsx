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
        <h2 class="text-sm font-semibold text-neutral-200">{props.title}</h2>
        {props.description && <p class="mt-0.5 text-xs text-neutral-500">{props.description}</p>}
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
  info: 'border-blue-800/50 bg-blue-950/30 text-blue-300',
  warning: 'border-yellow-800/50 bg-yellow-950/30 text-yellow-300',
  tip: 'border-green-800/50 bg-green-950/30 text-green-300',
  danger: 'border-red-800/50 bg-red-950/30 text-red-300'
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
    <header class="border-b border-neutral-800 pb-6">
      <div class="mb-2 flex items-center gap-2">
        <h1 class="text-2xl font-bold text-white">{props.title}</h1>
        {props.badge && <Badge variant="default">{props.badge}</Badge>}
      </div>
      <p class="text-sm text-neutral-400">{props.description}</p>
    </header>
  );
}
