import {
  applyEditorOperation,
  applyEditorOperations,
  invertEditorOperation,
  isOperationBackedEditorCommand,
  type EditorOperation,
  type OperationCapabilityIndex
} from './operations';
import type { EditorCommand } from './commands';
import type { HistoryEntry, HistoryState } from './types';
import { cloneRoot, type SvgElementNode } from '../svg-model';

export function createHistoryEntry(
  root: SvgElementNode,
  command: EditorCommand | undefined,
  capabilities?: OperationCapabilityIndex
): HistoryEntry {
  const operations = command ? operationsForCommand(root, command) : undefined;
  const inverseOperations = operations ? invertOperations(root, operations, capabilities) : undefined;
  const afterRoot = command ? applyCommandForHistory(root, command, operations, capabilities) : root;

  return {
    beforeRoot: cloneRoot(root),
    afterRoot: cloneRoot(afterRoot),
    root: cloneRoot(root),
    commandId: command?.id,
    label: command?.label,
    ...(command?.durability ? { durability: command.durability } : {}),
    ...(command?.mergeKey ? { mergeKey: command.mergeKey } : {}),
    ...(operations ? { operations } : {}),
    ...(inverseOperations ? { inverseOperations } : {})
  } satisfies HistoryEntry;
}

export function cloneHistoryState(history: HistoryState): HistoryState {
  return {
    past: [...history.past],
    future: [...history.future]
  };
}

export function restoreUndoRoot(
  currentRoot: SvgElementNode,
  entry: HistoryEntry,
  capabilities?: OperationCapabilityIndex
): SvgElementNode {
  return entry.inverseOperations
    ? applyEditorOperations(currentRoot, entry.inverseOperations, capabilities)
    : cloneRoot(entry.beforeRoot);
}

export function restoreRedoRoot(
  currentRoot: SvgElementNode,
  entry: HistoryEntry,
  capabilities?: OperationCapabilityIndex
): SvgElementNode {
  return entry.operations ? applyEditorOperations(currentRoot, entry.operations, capabilities) : cloneRoot(entry.afterRoot);
}

function operationsForCommand(root: SvgElementNode, command: EditorCommand): readonly EditorOperation[] | undefined {
  if (!isOperationBackedEditorCommand(command)) {
    return undefined;
  }

  const operations = command.resolveOperations(root);
  return operations.length > 0 ? operations : undefined;
}

function applyCommandForHistory(
  root: SvgElementNode,
  command: EditorCommand,
  operations: readonly EditorOperation[] | undefined,
  capabilities?: OperationCapabilityIndex
): SvgElementNode {
  return operations ? applyEditorOperations(root, operations, capabilities) : command.apply(root);
}

function invertOperations(
  root: SvgElementNode,
  operations: readonly EditorOperation[],
  capabilities?: OperationCapabilityIndex
): readonly EditorOperation[] | undefined {
  const inverseOperations: EditorOperation[] = [];
  let currentRoot = root;

  for (const operation of operations) {
    const inverse = invertEditorOperation(currentRoot, operation);

    if (!inverse) {
      return undefined;
    }

    inverseOperations.unshift(...inverse);
    currentRoot = applyEditorOperation(currentRoot, operation, capabilities);
  }

  return inverseOperations;
}
