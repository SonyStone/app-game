import { Show } from 'solid-js';

/** Optionally renders selection and focus styling independently from the base tree and drop indicator. */
export function TreeSelectionIndicator(props: { selected: boolean; focused: boolean }) {
  return (
    <Show when={props.selected || props.focused}>
      <span
        class={[
          'pointer-events-none absolute inset-0',
          {
            'bg-blue-500/15': props.selected,
            'ring-1 ring-blue-400 ring-inset': props.focused
          }
        ]}
        aria-hidden="true"
      />
    </Show>
  );
}
