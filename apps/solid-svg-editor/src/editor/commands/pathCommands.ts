import {
  commandParameters,
  commandStartPoints,
  convertCommand,
  deleteCommand,
  formatPathData,
  parsePathData,
  toggleRelative,
  updateCommandValue
} from '../../path-data';
import { findNode, getAttribute } from '../../svg-model';
import {
  pathCommandFromSelectionTargets,
  pathCommandSelectionTarget,
  type PathCommandSelectionTarget,
  type SelectionTarget
} from '../selection-targets';
import { insertPathCommand } from '../tree-utils';
import {
  createOperationCommand,
  toSvgNodeId,
  type OperationBackedEditorCommand
} from '../operations';

export interface PathAnchorCommandUpdate {
  readonly parameter: string;
  readonly value: number;
}

export interface PathCommandEditIntent {
  readonly command: OperationBackedEditorCommand;
  readonly nextTarget: PathCommandSelectionTarget | undefined;
}

export interface InsertPathCommandIntent extends PathCommandEditIntent {
  readonly nextTarget: PathCommandSelectionTarget;
}

export function createInsertPathCommandFromKeyIntent(options: {
  readonly selectionTargets: readonly SelectionTarget[];
  readonly key: string;
  readonly absolute: boolean;
}): InsertPathCommandIntent | undefined {
  const selected = pathCommandFromSelectionTargets(options.selectionTargets);

  if (!selected) {
    return undefined;
  }

  const command = options.absolute ? options.key.toUpperCase() : options.key.toLowerCase();

  return createInsertPathCommandIntent({ nodeId: selected.nodeId, index: selected.index, command });
}

export function createInsertPathCommandIntent(options: {
  readonly nodeId: string;
  readonly index: number;
  readonly command: string;
}): InsertPathCommandIntent {
  return {
    command: createInsertPathCommandCommand(options),
    nextTarget: pathCommandSelectionTarget(options.nodeId, Math.max(0, options.index + 1))
  };
}

export function createInsertPathCommandCommand(options: {
  readonly nodeId: string;
  readonly index: number;
  readonly command: string;
}): OperationBackedEditorCommand {
  return createOperationCommand({
    id: 'svg.insert-path-command',
    label: `Insert ${options.command} path command`,
    operations: (root) => {
      const node = findNode(root, options.nodeId);

      if (!node || node.kind !== 'element') {
        return [];
      }

      const commands = parsePathData(getAttribute(node, 'd', true));
      const nextCommands = insertPathCommand(commands, options.index, options.command);
      return [
        {
          kind: 'svg.set-attribute',
          nodeId: toSvgNodeId(options.nodeId),
          name: 'd',
          value: formatPathData(nextCommands)
        }
      ];
    }
  });
}

export function createDeletePathCommandIntent(options: {
  readonly nodeId: string;
  readonly commandIndex: number;
  readonly commandCount: number;
}): PathCommandEditIntent {
  const nextIndex =
    options.commandIndex >= 0 && options.commandIndex < options.commandCount && options.commandCount > 1
      ? Math.min(options.commandIndex, options.commandCount - 2)
      : undefined;

  return {
    command: createDeletePathCommandCommand({ nodeId: options.nodeId, commandIndex: options.commandIndex }),
    nextTarget: nextIndex === undefined ? undefined : pathCommandSelectionTarget(options.nodeId, nextIndex)
  };
}

export function createDeletePathCommandCommand(options: {
  readonly nodeId: string;
  readonly commandIndex: number;
}): OperationBackedEditorCommand {
  return createPathDataCommand({
    id: 'svg.delete-path-command',
    label: 'Delete path command',
    nodeId: options.nodeId,
    update: (commands) => deleteCommand(commands, options.commandIndex)
  });
}

export function createConvertPathCommandCommand(options: {
  readonly nodeId: string;
  readonly commandIndex: number;
  readonly command: string;
}): OperationBackedEditorCommand {
  return createPathDataCommand({
    id: 'svg.convert-path-command',
    label: `Convert to ${options.command} path command`,
    nodeId: options.nodeId,
    update: (commands) => convertCommand(commands, options.commandIndex, options.command)
  });
}

export function createTogglePathCommandRelativeCommand(options: {
  readonly nodeId: string;
  readonly commandIndex: number;
}): OperationBackedEditorCommand {
  return createPathDataCommand({
    id: 'svg.toggle-path-command-relative',
    label: 'Toggle path command relative',
    nodeId: options.nodeId,
    update: (commands) => toggleRelative(commands, options.commandIndex)
  });
}

export function createUpdatePathAnchorCommand(options: {
  readonly nodeId: string;
  readonly commandIndex: number;
  readonly updates: readonly PathAnchorCommandUpdate[];
}): OperationBackedEditorCommand {
  return createOperationCommand({
    id: 'svg.update-path-anchor',
    label: 'Update path anchor',
    mergeKey: `svg.update-path-anchor:${options.nodeId}:${options.commandIndex}:${options.updates.map((update) => update.parameter).join(',')}`,
    operations: (root) => {
      const node = findNode(root, options.nodeId);

      if (!node || node.kind !== 'element') {
        return [];
      }

      const commands = parsePathData(getAttribute(node, 'd', true));
      const command = commands[options.commandIndex];
      const start = commandStartPoints(commands)[options.commandIndex];

      if (!command || !start) {
        return [];
      }

      const params = commandParameters(command.command);
      const relative = command.command === command.command.toLowerCase();
      let nextCommands = commands;
      let changed = false;

      for (const update of options.updates) {
        const param = params.find((item) => item.name === update.parameter);

        if (!param) {
          continue;
        }

        nextCommands = updateCommandValue(
          nextCommands,
          options.commandIndex,
          param.index,
          relative ? toRelativePathValue(update.parameter, update.value, start) : update.value
        );
        changed = true;
      }

      return changed
        ? [
            {
              kind: 'svg.set-attribute',
              nodeId: toSvgNodeId(options.nodeId),
              name: 'd',
              value: formatPathData(nextCommands)
            }
          ]
        : [];
    }
  });
}

function toRelativePathValue(
  parameter: string,
  value: number,
  start: { readonly x: number; readonly y: number }
): number {
  if (parameter === 'x' || parameter === 'x1' || parameter === 'x2') {
    return value - start.x;
  }

  if (parameter === 'y' || parameter === 'y1' || parameter === 'y2') {
    return value - start.y;
  }

  return value;
}

function createPathDataCommand(options: {
  readonly id: 'svg.delete-path-command' | 'svg.convert-path-command' | 'svg.toggle-path-command-relative';
  readonly label: string;
  readonly nodeId: string;
  readonly update: (commands: ReturnType<typeof parsePathData>) => ReturnType<typeof parsePathData>;
}): OperationBackedEditorCommand {
  return createOperationCommand({
    id: options.id,
    label: options.label,
    operations: (root) => {
      const node = findNode(root, options.nodeId);

      if (!node || node.kind !== 'element') {
        return [];
      }

      const nextCommands = options.update(parsePathData(getAttribute(node, 'd', true)));
      return [
        {
          kind: 'svg.set-attribute',
          nodeId: toSvgNodeId(options.nodeId),
          name: 'd',
          value: formatPathData(nextCommands)
        }
      ];
    }
  });
}
