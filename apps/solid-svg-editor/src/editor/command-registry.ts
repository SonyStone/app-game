import { createLegacyEditorCommand, type CommandHistoryPolicy, type EditorCommand, type EditorCommandId } from './commands';
import type {
  CommandContribution,
  EditorContributionContext,
  LegacyCommandContribution,
  OperationCommandContribution
} from './kernel';
import { createOperationCommand } from './operations';

export function findRegisteredCommand(
  kernel: EditorContributionContext,
  id: EditorCommandId
): CommandContribution | undefined {
  return kernel.registries.commands.find((command) => command.id === id);
}

export function isRegisteredCommandEnabled(kernel: EditorContributionContext, command: CommandContribution): boolean {
  return command.isEnabled?.(kernel) ?? true;
}

export function canRunRegisteredCommand(kernel: EditorContributionContext, id: EditorCommandId): boolean {
  const command = findRegisteredCommand(kernel, id);
  return command !== undefined && isRegisteredCommandEnabled(kernel, command);
}

export function dispatchRegisteredCommand(
  kernel: EditorContributionContext,
  id: EditorCommandId,
  history?: CommandHistoryPolicy
): boolean {
  const contribution = findRegisteredCommand(kernel, id);

  if (!contribution || !isRegisteredCommandEnabled(kernel, contribution)) {
    return false;
  }

  kernel.commands.dispatch(createRegisteredCommand(kernel, contribution), history);
  return true;
}

export function createRegisteredCommand(
  kernel: EditorContributionContext,
  contribution: CommandContribution
): EditorCommand {
  if (isOperationCommandContribution(contribution)) {
    const mergeKey = resolveCommandMergeKey(kernel, contribution.mergeKey);

    return createOperationCommand({
      id: contribution.id,
      label: contribution.label,
      operations: contribution.createOperations(kernel),
      ...(mergeKey ? { mergeKey } : {})
    });
  }

  if (isLegacyCommandContribution(contribution)) {
    return createLegacyEditorCommand(contribution.createCommand(kernel), contribution.durability.reason);
  }

  const exhaustive: never = contribution;
  return exhaustive;
}

function isOperationCommandContribution(
  contribution: CommandContribution
): contribution is OperationCommandContribution {
  return contribution.durability.kind === 'operation';
}

function isLegacyCommandContribution(
  contribution: CommandContribution
): contribution is LegacyCommandContribution {
  return contribution.durability.kind === 'legacy';
}

function resolveCommandMergeKey(
  kernel: EditorContributionContext,
  mergeKey: OperationCommandContribution['mergeKey']
): string | undefined {
  return typeof mergeKey === 'function' ? mergeKey(kernel) : mergeKey;
}

export function createRegisteredCommandHandlers(
  kernel: EditorContributionContext
): Readonly<Record<string, (event: KeyboardEvent) => void>> {
  return Object.fromEntries(
    kernel.registries.commands.map((command) => [command.id, () => dispatchRegisteredCommand(kernel, command.id)])
  );
}
