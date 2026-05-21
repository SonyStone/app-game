import { cva, type VariantProps } from 'class-variance-authority';
import { splitProps, type JSX } from 'solid-js';
import { cn } from '../../lib/utils';

// ============================================================================
// MARK: Button
// ============================================================================

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-violet-600 text-white hover:bg-violet-700',
        secondary:
          'bg-stone-200 text-stone-800 hover:bg-stone-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600',
        outline:
          'border border-stone-300 bg-transparent text-stone-800 hover:bg-stone-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800',
        ghost:
          'text-stone-600 hover:bg-stone-100 hover:text-stone-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200',
        destructive: 'bg-red-600 text-white hover:bg-red-700'
      },
      size: {
        sm: 'h-7 px-2.5 text-xs',
        md: 'h-9 px-4',
        lg: 'h-10 px-6 text-base',
        icon: 'h-8 w-8'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'md'
    }
  }
);

export type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    class?: string;
  };

export function Button(props: ButtonProps): JSX.Element {
  const [local, rest] = splitProps(props, ['variant', 'size', 'class', 'children']);

  return (
    <button {...rest} class={cn(buttonVariants({ variant: local.variant, size: local.size }), local.class)}>
      {local.children}
    </button>
  );
}
