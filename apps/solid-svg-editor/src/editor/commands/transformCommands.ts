import {
  formatMatrixTransform,
  identityMatrix,
  invertMatrix,
  multiplyMatrices,
  parseTransformList,
  type Matrix2D
} from '../geometry';
import type { EditorCommandId } from '../commands';
import {
  createOperationCommand,
  toSvgNodeId,
  type EditorOperation,
  type OperationBackedEditorCommand
} from '../operations';
import { findNode, getAttribute, type SvgElementNode } from '../../svg-model';

export function createTransformSelectedCommand(options: {
  readonly ids: readonly string[];
  readonly transform: Matrix2D;
  readonly label?: string;
  readonly id?: EditorCommandId;
}): OperationBackedEditorCommand {
  return createOperationCommand({
    id: options.id ?? 'svg.transform-selection',
    label: options.label ?? 'Transform selection',
    mergeKey: `svg.transform-selection:${options.ids.join(',')}`,
    operations: (root) => transformSelectedOperations(root, options.ids, options.transform)
  });
}

export function transformSelectedOperations(
  root: SvgElementNode,
  ids: readonly string[],
  transform: Matrix2D
): readonly EditorOperation[] {
  const parentTransforms = createParentTransformMap(root);
  const operations: EditorOperation[] = [];

  for (const id of ids) {
    const parentTransform = parentTransforms.get(id) ?? identityMatrix;
    const parentInverse = invertMatrix(parentTransform);

    if (!parentInverse) {
      continue;
    }

    const current = findNode(root, id);

    if (!current || current.kind !== 'element') {
      continue;
    }

    const currentLocal = parseTransformList(getAttribute(current, 'transform', true));
    const nextLocal = multiplyMatrices(
      multiplyMatrices(multiplyMatrices(parentInverse, transform), parentTransform),
      currentLocal
    );
    operations.push({
      kind: 'svg.set-attribute',
      nodeId: toSvgNodeId(id),
      name: 'transform',
      value: formatMatrixTransform(nextLocal)
    });
  }

  return operations;
}

function createParentTransformMap(root: SvgElementNode): ReadonlyMap<string, Matrix2D> {
  const transforms = new Map<string, Matrix2D>([[root.id, identityMatrix]]);

  function visit(node: SvgElementNode, inherited: Matrix2D): void {
    const nodeTransform = multiplyMatrices(inherited, parseTransformList(getAttribute(node, 'transform', true)));

    for (const child of node.children) {
      if (child.kind === 'element') {
        transforms.set(child.id, nodeTransform);
        visit(child, nodeTransform);
      }
    }
  }

  visit(root, identityMatrix);
  return transforms;
}
