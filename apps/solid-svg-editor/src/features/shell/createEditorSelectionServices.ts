import type { Accessor } from 'solid-js';

import type { EditorCommand } from '../../editor/commands';
import type { SelectionService } from '../../editor/kernel';
import type { SvgElementNode } from '../../svg-model';
import { createPathCommandKeyboardActions } from '../documents/createPathCommandKeyboardActions';
import { createEditorSelection } from '../selection/createEditorSelection';

export interface CreateEditorSelectionServicesOptions {
  readonly activeRoot: Accessor<SvgElementNode>;
  readonly dispatchCommand: (command: EditorCommand) => void;
}

export interface EditorSelectionServices {
  readonly selection: SelectionService;
  readonly resetDocumentSelection: () => void;
  readonly shortcutHandlers: Readonly<Record<'tool.insert-path-command', (event: KeyboardEvent) => void>>;
}

export function createEditorSelectionServices(
  options: CreateEditorSelectionServicesOptions
): EditorSelectionServices {
  const selection = createEditorSelection({ root: options.activeRoot });
  const pathCommandKeyboardActions = createPathCommandKeyboardActions({
    selectedTargets: selection.selectedTargets,
    selectTarget: selection.selectTarget,
    dispatchCommand: options.dispatchCommand
  });
  const selectionService = {
    selectedIds: selection.selectedIds,
    selectedTargets: selection.selectedTargets,
    selectedPathAnchor: selection.selectedPathAnchor,
    selectedNodes: selection.selectedNodes,
    selectNode: selection.selectNode,
    selectTarget: selection.selectTarget,
    setSelectedIds: selection.setSelectedIds,
    setSelectedTargets: selection.setSelectedTargets,
    clearSelection: selection.clearSelection,
    selectAll: selection.selectAll
  } satisfies SelectionService;

  return {
    selection: selectionService,
    resetDocumentSelection: selection.clearSelection,
    shortcutHandlers: {
      'tool.insert-path-command': (event) => {
        pathCommandKeyboardActions.insertPathCommandFromKey(event.key, event.shiftKey);
      }
    }
  } satisfies EditorSelectionServices;
}
