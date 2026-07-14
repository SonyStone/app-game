import { Show } from 'solid-js';

import type { EditorPanelContext } from '../panels/panelRegistry';

export function EditorModalStack(props: EditorPanelContext) {
  const activeModal = () => {
    const modalId = props.kernel.ui.modal?.active();
    return modalId === undefined ? undefined : props.kernel.registries.modals.find((modal) => modal.id === modalId);
  };

  return (
    <Show when={activeModal()}>
      {(modal) => modal().render({ kernel: props.kernel, close: () => props.kernel.ui.modal?.close() })}
    </Show>
  );
}
