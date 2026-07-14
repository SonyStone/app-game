import { canRunRegisteredAction, isRegisteredActionEnabled, findRegisteredAction, runRegisteredAction } from './action-registry';
import { canRunRegisteredCommand, dispatchRegisteredCommand } from './command-registry';
import type {
  ContextMenuContributionContext,
  ContextMenuItemContribution,
  EditorContributionContext
} from './kernel';
import { createOperationCommand } from './operations';
import { nodeSelectionTarget, type SelectionTarget } from './selection-targets';
import type { SvgIcon } from './svg-icon';

export interface ContextMenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: SvgIcon;
  readonly enabled: boolean;
  readonly run: () => boolean;
}

export function createContextMenuItems(
  kernel: EditorContributionContext,
  target: string | SelectionTarget
): readonly ContextMenuItem[] {
  const selectionTarget = contextMenuSelectionTarget(target);
  const context = {
    ...kernel,
    nodeId: selectionTarget.nodeId,
    target: selectionTarget
  } satisfies ContextMenuContributionContext;

  return [...kernel.registries.contextMenus]
    .sort(compareContextMenuItems)
    .filter((item) => item.isVisible?.(context) ?? true)
    .map((item) => createContextMenuItem(context, item));
}

function contextMenuSelectionTarget(target: string | SelectionTarget): SelectionTarget {
  return typeof target === 'string' ? nodeSelectionTarget(target) : target;
}

function createContextMenuItem(
  context: ContextMenuContributionContext,
  contribution: ContextMenuItemContribution
): ContextMenuItem {
  if (contribution.kind === 'action') {
    return createActionContextMenuItem(context, contribution);
  }

  if (contribution.kind === 'registered-command') {
    return createRegisteredCommandContextMenuItem(context, contribution);
  }

  if (contribution.kind === 'command') {
    return createCommandContextMenuItem(context, contribution);
  }

  return createCustomContextMenuItem(context, contribution);
}

function createActionContextMenuItem(
  context: ContextMenuContributionContext,
  contribution: Extract<ContextMenuItemContribution, { readonly kind: 'action' }>
): ContextMenuItem {
  const action = findRegisteredAction(context, contribution.actionId);
  const item = {
    id: contribution.id,
    label: contribution.label,
    enabled: action !== undefined && isRegisteredActionEnabled(context, action) && (contribution.isEnabled?.(context) ?? true),
    run: () => {
      if (!canRunRegisteredAction(context, contribution.actionId) || contribution.isEnabled?.(context) === false) {
        return false;
      }

      return runRegisteredAction(context, contribution.actionId);
    }
  } satisfies ContextMenuItem;

  return contribution.icon === undefined ? item : { ...item, icon: contribution.icon };
}

function createRegisteredCommandContextMenuItem(
  context: ContextMenuContributionContext,
  contribution: Extract<ContextMenuItemContribution, { readonly kind: 'registered-command' }>
): ContextMenuItem {
  const item = {
    id: contribution.id,
    label: contribution.label,
    enabled: canRunRegisteredCommand(context, contribution.commandId) && (contribution.isEnabled?.(context) ?? true),
    run: () => {
      if (!canRunRegisteredCommand(context, contribution.commandId) || contribution.isEnabled?.(context) === false) {
        return false;
      }

      return dispatchRegisteredCommand(context, contribution.commandId);
    }
  } satisfies ContextMenuItem;

  return contribution.icon === undefined ? item : { ...item, icon: contribution.icon };
}

function createCommandContextMenuItem(
  context: ContextMenuContributionContext,
  contribution: Extract<ContextMenuItemContribution, { readonly kind: 'command' }>
): ContextMenuItem {
  const item = {
    id: contribution.id,
    label: contribution.label,
    enabled: contribution.isEnabled?.(context) ?? true,
    run: () => {
      if (contribution.isEnabled?.(context) === false) {
        return false;
      }

      const mergeKey = resolveContextCommandMergeKey(context, contribution.mergeKey);
      context.commands.dispatch(
        createOperationCommand({
          id: contribution.commandId,
          label: contribution.label,
          operations: contribution.createOperations(context),
          ...(mergeKey ? { mergeKey } : {})
        })
      );
      return true;
    }
  } satisfies ContextMenuItem;

  return contribution.icon === undefined ? item : { ...item, icon: contribution.icon };
}

function createCustomContextMenuItem(
  context: ContextMenuContributionContext,
  contribution: Extract<ContextMenuItemContribution, { readonly kind?: 'custom' }>
): ContextMenuItem {
  const item = {
    id: contribution.id,
    label: contribution.label,
    enabled: contribution.isEnabled?.(context) ?? true,
    run: () => {
      if (contribution.isEnabled?.(context) === false) {
        return false;
      }

      contribution.run(context);
      return true;
    }
  } satisfies ContextMenuItem;

  return contribution.icon === undefined ? item : { ...item, icon: contribution.icon };
}

function compareContextMenuItems(first: ContextMenuItemContribution, second: ContextMenuItemContribution): number {
  return (first.order ?? 0) - (second.order ?? 0);
}

function resolveContextCommandMergeKey(
  context: ContextMenuContributionContext,
  mergeKey: Extract<ContextMenuItemContribution, { readonly kind: 'command' }>['mergeKey']
): string | undefined {
  return typeof mergeKey === 'function' ? mergeKey(context) : mergeKey;
}
