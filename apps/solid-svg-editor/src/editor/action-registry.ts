import type { EditorCommandId } from './commands';
import type { ActionContribution, EditorContributionContext } from './kernel';
import { canRunRegisteredCommand, dispatchRegisteredCommand } from './command-registry';

export function findRegisteredAction(
  kernel: EditorContributionContext,
  id: EditorCommandId
): ActionContribution | undefined {
  return kernel.registries.actions.find((action) => action.id === id);
}

export function isRegisteredActionEnabled(kernel: EditorContributionContext, action: ActionContribution): boolean {
  if (action.isEnabled?.(kernel) === false) {
    return false;
  }

  if (action.kind === 'modal') {
    return kernel.ui.modal !== undefined;
  }

  if (action.kind === 'command') {
    return canRunRegisteredCommand(kernel, action.commandId);
  }

  return true;
}

export function canRunRegisteredAction(kernel: EditorContributionContext, id: EditorCommandId): boolean {
  const action = findRegisteredAction(kernel, id);
  return action !== undefined && isRegisteredActionEnabled(kernel, action);
}

export function runRegisteredAction(kernel: EditorContributionContext, id: EditorCommandId): boolean {
  const contribution = findRegisteredAction(kernel, id);

  if (!contribution || !isRegisteredActionEnabled(kernel, contribution)) {
    return false;
  }

  if (contribution.kind === 'modal') {
    kernel.ui.modal?.open(contribution.modalId);
    return true;
  }

  if (contribution.kind === 'command') {
    return dispatchRegisteredCommand(kernel, contribution.commandId);
  }

  contribution.run(kernel);
  return true;
}

export function createRegisteredActionHandlers(
  kernel: EditorContributionContext
): Readonly<Record<string, (event: KeyboardEvent) => void>> {
  return Object.fromEntries(
    kernel.registries.actions.map((action) => [action.id, () => runRegisteredAction(kernel, action.id)])
  );
}
