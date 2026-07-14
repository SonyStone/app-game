import { createSignal, type Setter } from 'solid-js';

import type { ContextMenuService, ModalService } from '../../editor/kernel';
import { nodeSelectionTarget, type SelectionTarget } from '../../editor/selection-targets';
import type { ContextMenuState, ModalId } from '../../editor/types';

export interface CreateEditorOverlayServicesOptions {
  readonly selectTarget: (target: SelectionTarget, event?: MouseEvent | PointerEvent) => void;
}

export interface EditorOverlayServices {
  readonly modal: ModalService;
  readonly contextMenu: ContextMenuService;
  readonly setContextMenu: Setter<ContextMenuState | undefined>;
  readonly clearContextMenu: () => void;
}

export function createEditorOverlayServices(options: CreateEditorOverlayServicesOptions): EditorOverlayServices {
  const [modal, setModal] = createSignal<ModalId>();
  const [contextMenu, setContextMenu] = createSignal<ContextMenuState | undefined>();

  function openContextMenu(event: MouseEvent, target: string | SelectionTarget): void {
    const selectionTarget = typeof target === 'string' ? nodeSelectionTarget(target) : target;

    event.preventDefault();
    options.selectTarget(selectionTarget, event);
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      nodeId: selectionTarget.nodeId,
      target: selectionTarget
    });
  }

  function closeModal(): void {
    setModal(undefined);
  }

  function closeContextMenu(): void {
    setContextMenu(undefined);
  }

  return {
    modal: {
      active: modal,
      open: setModal,
      close: closeModal
    },
    contextMenu: {
      active: contextMenu,
      open: openContextMenu,
      close: closeContextMenu
    },
    setContextMenu,
    clearContextMenu: closeContextMenu
  } satisfies EditorOverlayServices;
}
