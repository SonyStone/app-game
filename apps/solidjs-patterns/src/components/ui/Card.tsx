import { splitProps, type JSX } from 'solid-js';
import { cn } from '../../lib/utils';

// ============================================================================
// MARK: Card
// ============================================================================

export function Card(props: JSX.HTMLAttributes<HTMLDivElement> & { class?: string }): JSX.Element {
  const [local, rest] = splitProps(props, ['class', 'children']);

  return (
    <div {...rest} class={cn('rounded-xl border border-neutral-800 bg-neutral-900 p-5', local.class)}>
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
    <h3 {...rest} class={cn('text-sm font-semibold text-neutral-100', local.class)}>
      {local.children}
    </h3>
  );
}

export function CardDescription(props: JSX.HTMLAttributes<HTMLParagraphElement> & { class?: string }): JSX.Element {
  const [local, rest] = splitProps(props, ['class', 'children']);

  return (
    <p {...rest} class={cn('text-xs text-neutral-500', local.class)}>
      {local.children}
    </p>
  );
}
