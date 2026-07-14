import { addPoint, deletePoint, formatPoints, parsePoints, updatePoint } from '../../path-data';
import { findNode, getAttribute } from '../../svg-model';
import {
  createOperationCommand,
  type EditorOperation,
  toSvgNodeId,
  type OperationBackedEditorCommand
} from '../operations';

type PointsUpdate = (points: readonly [number, number][]) => readonly [number, number][];

export function createUpdatePointCommand(options: {
  readonly nodeId: string;
  readonly index: number;
  readonly x: number;
  readonly y: number;
}): OperationBackedEditorCommand {
  return createPointCommand({
    id: 'svg.update-point',
    label: 'Update point',
    nodeId: options.nodeId,
    mergeKey: `svg.update-point:${options.nodeId}:${options.index}`,
    update: (points) => {
      if (options.index < 0 || options.index >= points.length) {
        return points;
      }

      return updatePoint(updatePoint(points, options.index, 0, options.x), options.index, 1, options.y);
    }
  });
}

export function createAddPointCommand(options: { readonly nodeId: string }): OperationBackedEditorCommand {
  return createPointCommand({
    id: 'svg.add-point',
    label: 'Add point',
    nodeId: options.nodeId,
    update: addPoint
  });
}

export function createDeletePointCommand(options: {
  readonly nodeId: string;
  readonly index: number;
}): OperationBackedEditorCommand {
  return createPointCommand({
    id: 'svg.delete-point',
    label: 'Delete point',
    nodeId: options.nodeId,
    update: (points) => deletePoint(points, options.index)
  });
}

function createPointCommand(options: {
  readonly id: 'svg.update-point' | 'svg.add-point' | 'svg.delete-point';
  readonly label: string;
  readonly nodeId: string;
  readonly mergeKey?: string;
  readonly update: PointsUpdate;
}): OperationBackedEditorCommand {
  return createOperationCommand({
    id: options.id,
    label: options.label,
    ...(options.mergeKey ? { mergeKey: options.mergeKey } : {}),
    operations: (root) => {
      const node = findNode(root, options.nodeId);

      if (!node || node.kind !== 'element') {
        return [];
      }

      const points = parsePoints(getAttribute(node, 'points', true));
      const updated = options.update(points);

      if (formatPoints(updated) === formatPoints(points)) {
        return [];
      }

      return [
        {
          kind: 'svg.set-attribute',
          nodeId: toSvgNodeId(options.nodeId),
          name: 'points',
          value: formatPoints(updated)
        }
      ] satisfies readonly EditorOperation[];
    }
  });
}
