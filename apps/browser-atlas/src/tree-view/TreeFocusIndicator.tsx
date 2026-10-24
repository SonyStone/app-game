import { Show } from 'solid-js';

/**
 * Marks the keyboard-focused row with a dashed frame while it is outside the selection, such as a
 * row just deselected with Ctrl/Cmd+click. Inside the selection focus stays unmarked, as in Finder,
 * so every selected row looks the same; {@link TreeSelectionHighlight} draws the selection itself.
 */
export function TreeFocusIndicator(props: { focused: boolean; selected: boolean }) {
  return (
    <Show when={props.focused && !props.selected}>
      <span
        class="pointer-events-none absolute inset-0 -z-10 rounded-[5px] border border-dashed border-blue-400/80"
        aria-hidden="true"
      />
    </Show>
  );
}
