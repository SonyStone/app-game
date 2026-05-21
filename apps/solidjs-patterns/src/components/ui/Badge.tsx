import { cva, type VariantProps } from 'class-variance-authority';
import { splitProps, type JSX } from 'solid-js';
import { cn } from '../../lib/utils';

// ============================================================================
// MARK: Badge
// ============================================================================

const badgeVariants = cva('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide', {
  variants: {
    variant: {
      default: 'bg-violet-100 text-violet-700 dark:bg-violet-600/20 dark:text-violet-300',
      secondary: 'bg-stone-200 text-stone-700 dark:bg-slate-700 dark:dark:text-slate-300',
      success: 'bg-green-600/20 text-green-400',
      warning: 'bg-yellow-600/20 text-yellow-400',
      destructive: 'bg-red-600/20 text-red-400',
      outline: 'border border-stone-300 text-stone-600 dark:border-slate-700 dark:text-slate-400'
    }
  },
  defaultVariants: {
    variant: 'default'
  }
});

export type BadgeProps = JSX.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants> & {
    class?: string;
  };

export function Badge(props: BadgeProps): JSX.Element {
  const [local, rest] = splitProps(props, ['variant', 'class', 'children']);

  return (
    <span {...rest} class={cn(badgeVariants({ variant: local.variant }), local.class)}>
      {local.children}
    </span>
  );
}
