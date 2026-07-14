import DuplicateIcon from '../../App.icons/Duplicate.svg';
import MoveDownIcon from '../../App.icons/MoveDown.svg';
import MoveUpIcon from '../../App.icons/MoveUp.svg';
import { insertNodeAfterOperations } from '../../editor/commands/nodeCommands';
import { createDeletePathCommandIntent } from '../../editor/commands/pathCommands';
import type { ContextMenuContributionContext, ContextMenuItemContribution, EditorContribution } from '../../editor/kernel';
import { pathCommandFromSelectionTargets } from '../../editor/selection-targets';
import type { SvgIcon } from '../../editor/svg-icon';
import { parsePathData } from '../../path-data';
import { findNode, getAttribute } from '../../svg-model';
import DeleteIcon from '../ui/icons/Delete.svg';
import InsertAfterIcon from '../ui/icons/InsertAfter.svg';

export type ContextMenuRegistryContribution = EditorContribution & {
  readonly contextMenus: readonly ContextMenuItemContribution[];
};

export const coreContextMenuContribution = {
  id: 'core.context-menus',
  contextMenus: [
    registeredCommandContextMenuItem('context.duplicate', 'Duplicate', 'svg.duplicate-selection', DuplicateIcon, 10, {
      isVisible: isNodeContextTarget
    }),
    registeredCommandContextMenuItem('context.move-up', 'Move up', 'svg.move-selection-up', MoveUpIcon, 20, {
      isVisible: isNodeContextTarget
    }),
    registeredCommandContextMenuItem('context.move-down', 'Move down', 'svg.move-selection-down', MoveDownIcon, 30, {
      isVisible: isNodeContextTarget
    }),
    {
      kind: 'command',
      id: 'context.insert-group-after',
      label: 'Insert group after',
      icon: InsertAfterIcon,
      order: 40,
      commandId: 'svg.insert-group-after',
      isVisible: isNodeContextTarget,
      createOperations: (context) =>
        insertNodeAfterOperations(
          context.documents.activeRoot(),
          context.nodeId,
          context.capabilities.svg.createElement('g')
        )
    },
    {
      id: 'context.delete-path-command',
      label: 'Delete path command',
      icon: DeleteIcon,
      order: 50,
      isVisible: isPathCommandContextTarget,
      isEnabled: (context) => resolvePathCommandContextTarget(context) !== undefined,
      run: (context) => {
        const target = resolvePathCommandContextTarget(context);

        if (!target) {
          return;
        }

        const intent = createDeletePathCommandIntent(target);
        context.commands.dispatch(intent.command);

        if (intent.nextTarget) {
          context.selection.selectTarget(intent.nextTarget);
        } else {
          context.selection.clearSelection();
        }
      }
    },
    registeredCommandContextMenuItem('context.delete', 'Delete', 'svg.delete-selection', DeleteIcon, 60, {
      isVisible: isNodeContextTarget
    })
  ]
} as const satisfies ContextMenuRegistryContribution;

interface PathCommandContextTarget {
  readonly nodeId: string;
  readonly commandIndex: number;
  readonly commandCount: number;
}

function registeredCommandContextMenuItem(
  id: string,
  label: string,
  commandId: Extract<ContextMenuItemContribution, { readonly kind: 'registered-command' }>['commandId'],
  icon: SvgIcon,
  order: number,
  options: Pick<ContextMenuItemContribution, 'isVisible' | 'isEnabled'> = {}
): ContextMenuItemContribution {
  return {
    kind: 'registered-command',
    id,
    label,
    icon,
    order,
    commandId,
    ...options
  };
}

function isNodeContextTarget(context: ContextMenuContributionContext): boolean {
  return context.target.kind === 'node';
}

function isPathCommandContextTarget(context: ContextMenuContributionContext): boolean {
  return pathCommandFromSelectionTargets([context.target]) !== undefined;
}

function resolvePathCommandContextTarget(context: ContextMenuContributionContext): PathCommandContextTarget | undefined {
  const target = pathCommandFromSelectionTargets([context.target]);

  if (!target) {
    return undefined;
  }

  const node = findNode(context.documents.activeRoot(), target.nodeId);

  if (!node || node.kind !== 'element' || node.name !== 'path') {
    return undefined;
  }

  const commandCount = parsePathData(getAttribute(node, 'd', true)).length;

  if (target.index < 0 || target.index >= commandCount) {
    return undefined;
  }

  return { nodeId: target.nodeId, commandIndex: target.index, commandCount };
}
