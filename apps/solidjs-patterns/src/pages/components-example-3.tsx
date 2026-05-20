import { mergeProps } from 'solid-js';

type CardProps = {
  title?: string;
  variant?: 'default' | 'outlined';
  children: JSX.Element;
};

export function Card(props: CardProps): JSX.Element {
  // Props with defaults — reactive to changes
  const merged = mergeProps({ variant: 'default' as const, title: 'Card' }, props);

  return (
    <div class={merged.variant === 'outlined' ? 'border' : 'bg-neutral-800'}>
      <h3>{merged.title}</h3>
      {merged.children}
    </div>
  );
}
// ❌ Don't use JS destructuring defaults — breaks reactivity:
// function Card({ title = 'Card', ...props }) { ... }