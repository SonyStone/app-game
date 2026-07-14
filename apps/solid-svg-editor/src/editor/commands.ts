import type { SvgElementNode } from '../svg-model';

export type EditorCommandId = `${string}.${string}`;

export type EditorCommandDurability =
  | {
      readonly kind: 'operation';
    }
  | {
      readonly kind: 'legacy';
      readonly reason: string;
    };

export interface EditorCommand {
  readonly id: EditorCommandId;
  readonly label: string;
  readonly durability?: EditorCommandDurability;
  readonly mergeKey?: string;
  readonly apply: (root: SvgElementNode) => SvgElementNode;
  readonly invert?: (before: SvgElementNode, after: SvgElementNode) => EditorCommand | undefined;
  readonly merge?: (previous: EditorCommand) => EditorCommand | undefined;
}

export interface LegacyEditorCommand extends EditorCommand {
  readonly durability: { readonly kind: 'legacy'; readonly reason: string };
}

export interface CommandTransaction {
  readonly tabId: string;
  readonly changed: () => boolean;
  readonly update: (command: EditorCommand) => void;
  readonly commit: () => void;
  readonly cancel: () => void;
}

export type CommandHistoryPolicy =
  | { readonly type: 'push' }
  | { readonly type: 'replace'; readonly syncCode: boolean }
  | { readonly type: 'none'; readonly syncCode: boolean };

export const pushCommandHistory = { type: 'push' } as const satisfies CommandHistoryPolicy;

export type EditorCommandEvent =
  | {
      readonly type: 'command.dispatched';
      readonly tabId: string;
      readonly commandId: EditorCommandId;
      readonly label: string;
      readonly history: CommandHistoryPolicy['type'];
    }
  | {
      readonly type: 'command.transaction.started';
      readonly tabId: string;
    }
  | {
      readonly type: 'command.transaction.updated';
      readonly tabId: string;
      readonly commandId: EditorCommandId;
      readonly label: string;
      readonly historyPushed: boolean;
    }
  | {
      readonly type: 'command.transaction.committed';
      readonly tabId: string;
      readonly changed: boolean;
    }
  | {
      readonly type: 'command.transaction.canceled';
      readonly tabId: string;
      readonly changed: boolean;
    }
  | {
      readonly type: 'history.undone' | 'history.redone';
      readonly tabId: string;
      readonly label: string | undefined;
    };

export function replaceCommandHistory(syncCode: boolean): CommandHistoryPolicy {
  return { type: 'replace', syncCode };
}

export function createLegacyEditorCommand(command: EditorCommand, reason: string): LegacyEditorCommand {
  return {
    ...command,
    durability: { kind: 'legacy', reason }
  } satisfies LegacyEditorCommand;
}

/** @deprecated Prefer operation-backed commands or createLegacyEditorCommand with an explicit reason. */
export function createEditorCommand(command: EditorCommand): EditorCommand {
  return command;
}
