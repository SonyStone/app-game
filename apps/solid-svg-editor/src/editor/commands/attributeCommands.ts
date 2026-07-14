import {
  createOperationCommand,
  toSvgNodeId,
  type OperationBackedEditorCommand
} from '../operations';

export interface AttributeCommandUpdate {
  readonly name: string;
  readonly value: string;
}

export function createSetAttributeCommand(
  nodeId: string,
  name: string,
  value: string
): OperationBackedEditorCommand {
  return createOperationCommand({
    id: 'svg.set-attribute',
    label: `Set ${name}`,
    mergeKey: `svg.set-attribute:${nodeId}:${name}`,
    operations: [{ kind: 'svg.set-attribute', nodeId: toSvgNodeId(nodeId), name, value }]
  });
}

export function createSetAttributesCommand(
  nodeId: string,
  updates: readonly AttributeCommandUpdate[],
  label = 'Set attributes'
): OperationBackedEditorCommand {
  return createOperationCommand({
    id: 'svg.set-attributes',
    label,
    mergeKey: `svg.set-attributes:${nodeId}:${updates.map((update) => update.name).join(',')}`,
    operations: updates.map((update) => ({
      kind: 'svg.set-attribute',
      nodeId: toSvgNodeId(nodeId),
      name: update.name,
      value: update.value
    }))
  });
}

export function createRemoveAttributeCommand(nodeId: string, name: string): OperationBackedEditorCommand {
  return createOperationCommand({
    id: 'svg.remove-attribute',
    label: `Remove ${name}`,
    operations: [{ kind: 'svg.remove-attribute', nodeId: toSvgNodeId(nodeId), name }]
  });
}
