import type { Accessor } from 'solid-js';

import type { EditorCommand } from '../../editor/commands';
import { createInsertPathCommandFromKeyIntent } from '../../editor/commands/pathCommands';
import type { SelectionTarget } from '../../editor/selection-targets';

export function createPathCommandKeyboardActions(options: {
  readonly selectedTargets: Accessor<readonly SelectionTarget[]>;
  readonly selectTarget: (target: SelectionTarget) => void;
  readonly dispatchCommand: (command: EditorCommand) => void;
}) {
  function insertPathCommandFromKey(key: string, absolute: boolean): void {
    const insert = createInsertPathCommandFromKeyIntent({
      selectionTargets: options.selectedTargets(),
      key,
      absolute
    });

    if (!insert) {
      return;
    }

    options.dispatchCommand(insert.command);
    options.selectTarget(insert.nextTarget);
  }

  return { insertPathCommandFromKey };
}
