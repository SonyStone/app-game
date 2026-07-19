import type { SvgElementNode } from '../svg-model';

export type EditorCommandId = `${string}.${string}`;

export interface EditorCommand {
  readonly id: EditorCommandId;
  readonly label: string;
  readonly apply: (root: SvgElementNode) => SvgElementNode;
  readonly invert?: (before: SvgElementNode, after: SvgElementNode) => EditorCommand | undefined;
  readonly merge?: (previous: EditorCommand) => EditorCommand | undefined;
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
      readonly type: 'history.undone' | 'history.redone';
      readonly tabId: string;
      readonly label: string | undefined;
    };

export function replaceCommandHistory(syncCode: boolean): CommandHistoryPolicy {
  return { type: 'replace', syncCode };
}

export function createEditorCommand(command: EditorCommand): EditorCommand {
  return command;
}
