import { ComponentProps, createEffect, JSX, onCleanup, splitProps, ValidComponent } from 'solid-js';

export function Props<T extends ValidComponent>(
  props: { ref: (props: ComponentProps<T> | null) => void } & ComponentProps<T> & {
      children?: (props: ComponentProps<T>) => JSX.Element;
    }
): JSX.Element {
  const [local, rest] = splitProps(props, ['ref']);

  createEffect(() => {
    local.ref?.(rest);

    onCleanup(() => {
      local.ref?.(null);
    });
  });

  return rest.children?.(rest) ?? null;
}
