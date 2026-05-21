import { splitProps, type JSX } from 'solid-js';
import { cn } from '../../lib/utils';

// ============================================================================
// MARK: Card
// ============================================================================

export function Card(props: JSX.HTMLAttributes<HTMLDivElement> & { class?: string }): JSX.Element {
  const [local, rest] = splitProps(props, ['class', 'children']);

  return (
    <div
      {...rest}
      class={cn(
        'rounded-xl border border-stone-300 bg-white p-5 dark:border-slate-800 dark:bg-slate-900',
        local.class
      )}
    >
      {local.children}
    </div>
  );
}

export function CardHeader(props: JSX.HTMLAttributes<HTMLDivElement> & { class?: string }): JSX.Element {
  const [local, rest] = splitProps(props, ['class', 'children']);

  return (
    <div {...rest} class={cn('mb-3 flex flex-col gap-1', local.class)}>
      {local.children}
    </div>
  );
}

export function CardTitle(props: JSX.HTMLAttributes<HTMLHeadingElement> & { class?: string }): JSX.Element {
  const [local, rest] = splitProps(props, ['class', 'children']);

  return (
    <h3 {...rest} class={cn('text-sm font-semibold text-stone-950 dark:text-slate-100', local.class)}>
      {local.children}
    </h3>
  );
}

export function CardDescription(props: JSX.HTMLAttributes<HTMLParagraphElement> & { class?: string }): JSX.Element {
  const [local, rest] = splitProps(props, ['class', 'children']);

  return (
    <p {...rest} class={cn('text-xs text-stone-500 dark:text-slate-500', local.class)}>
      {local.children}
    </p>
  );
}
