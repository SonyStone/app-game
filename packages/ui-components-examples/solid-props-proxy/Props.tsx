import type { ComponentProps, JSX, ValidComponent } from '@solidjs/web';
import { createTrackedEffect, omit } from 'solid-js';

export function Props<T extends ValidComponent>(
  props: { ref: (props: ComponentProps<T> | null) => void } & ComponentProps<T> & {
      children?: (props: ComponentProps<T>) => JSX.Element;
    }
): JSX.Element {
  const rest = omit(props, 'ref');

  createTrackedEffect(() => {
    props.ref?.(rest);

    return () => {
      props.ref?.(null);
    };
  });

  return rest.children?.(rest) ?? null;
}
