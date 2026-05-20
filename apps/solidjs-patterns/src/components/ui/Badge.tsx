import { cva, type VariantProps } from 'class-variance-authority';
import { splitProps, type JSX } from 'solid-js';
import { cn } from '../../lib/utils';

// ============================================================================
// MARK: Badge
// ============================================================================

const badgeVariants = cva('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide', {
  variants: {
    variant: {
      default: 'bg-violet-600/20 text-violet-300',
      secondary: 'bg-neutral-700 text-neutral-300',
      success: 'bg-green-600/20 text-green-400',
      warning: 'bg-yellow-600/20 text-yellow-400',
      destructive: 'bg-red-600/20 text-red-400',
      outline: 'border border-neutral-700 text-neutral-400'
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
