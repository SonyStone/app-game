import type { EditorCommandId } from '../commands';
import type { CommandContribution, EditorContribution, EditorContributionContext, OperationCommandContribution } from '../kernel';
import type { EditorOperation } from '../operations';
import { toSvgNodeId } from '../operations';
import { pathCommandFromSelectionTargets } from '../selection-targets';
import { optimizeRoot } from './documentCommands';
import { duplicateNodeOperations, moveNodesInParentOperations } from './nodeCommands';
import { createDeletePathCommandCommand } from './pathCommands';

export type CommandRegistryContribution = EditorContribution<unknown> & {
  readonly commands: readonly CommandContribution[];
};

export const coreCommandContribution = {
  id: 'core.commands',
  commands: [
    operationCommandContribution('svg.optimize', 'Optimize SVG', (kernel) => [
      {
        kind: 'svg.replace-root',
        root: optimizeRoot(kernel.documents.activeRoot(), kernel.settings.settings().optimizer)
      }
    ]),
    operationCommandContribution(
      'svg.delete-selection',
      'Delete selection',
      deleteSelectionOperations,
      { isEnabled: hasDeletableSelection }
    ),
    operationCommandContribution(
      'svg.duplicate-selection',
      'Duplicate selection',
      (kernel) => duplicateNodeOperations(kernel.documents.activeRoot(), selectedEditableIds(kernel)),
      { isEnabled: hasEditableSelection }
    ),
    operationCommandContribution(
      'svg.move-selection-up',
      'Move selection up',
      (kernel) => moveNodesInParentOperations(selectedEditableIds(kernel), -1),
      { isEnabled: hasEditableSelection }
    ),
    operationCommandContribution(
      'svg.move-selection-down',
      'Move selection down',
      (kernel) => moveNodesInParentOperations(selectedEditableIds(kernel), 1),
      { isEnabled: hasEditableSelection }
    )
  ]
} as const satisfies CommandRegistryContribution;

function operationCommandContribution(
  id: EditorCommandId,
  label: string,
  createOperations: (kernel: EditorContributionContext) => readonly EditorOperation[],
  options: Pick<CommandContribution, 'isEnabled'> & Pick<OperationCommandContribution, 'mergeKey'> = {}
): CommandContribution {
  return { id, label, createOperations, ...options, durability: { kind: 'operation' } };
}

function selectedEditableIds(kernel: EditorContributionContext): readonly string[] {
  const rootId = kernel.documents.activeRoot().id;
  return kernel.selection.selectedIds().filter((id) => id !== rootId);
}

function hasEditableSelection(kernel: EditorContributionContext): boolean {
  return selectedEditableIds(kernel).length > 0;
}

function deleteSelectionOperations(kernel: EditorContributionContext): readonly EditorOperation[] {
  const pathCommand = pathCommandFromSelectionTargets(kernel.selection.selectedTargets());

  if (pathCommand) {
    return createDeletePathCommandCommand({
      nodeId: pathCommand.nodeId,
      commandIndex: pathCommand.index
    }).resolveOperations(kernel.documents.activeRoot());
  }

  return selectedEditableIds(kernel).map((id) => ({ kind: 'svg.remove-node', nodeId: toSvgNodeId(id) }));
}

function hasDeletableSelection(kernel: EditorContributionContext): boolean {
  return pathCommandFromSelectionTargets(kernel.selection.selectedTargets()) !== undefined || hasEditableSelection(kernel);
}
