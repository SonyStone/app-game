import type { JSX } from '@solidjs/web';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';
import { omit } from 'solid-js';

export const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-shadow focus-visible:(outline-none ring-1.5 ring-ring) disabled:(pointer-events-none opacity-50) bg-inherit',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline: 'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
        ghost: 'hover:(bg-accent text-accent-foreground)',
        link: 'text-primary underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-10 px-8',
        icon: 'h-9 w-9'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

export type ButtonProps = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'class'> &
  VariantProps<typeof buttonVariants> & {
    /** Additional Solid 2 class values composed after the variant classes. */
    class?: JSX.ClassValue;
  };

/** Renders the shared button styles on a native, accessible button element. */
export function Button(props: ButtonProps): JSX.Element {
  const rest = omit(props, 'class', 'variant', 'size');

  return (
    <button
      {...rest}
      type={props.type ?? 'button'}
      class={[
        buttonVariants({
          size: props.size,
          variant: props.variant
        }),
        props.class
      ]}
    />
  );
}
