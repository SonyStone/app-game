import type { SvgElementNode } from '../../svg-model';
import { optimizeNode } from '../tree-utils';
import type { OptimizerSettings } from '../types';
import {
  createOperationCommand,
  type OperationBackedEditorCommand
} from '../operations';

export function createOptimizeSvgCommand(settings: OptimizerSettings): OperationBackedEditorCommand {
  return createOperationCommand({
    id: 'svg.optimize',
    label: 'Optimize SVG',
    operations: (root) => [{ kind: 'svg.replace-root', root: optimizeRoot(root, settings) }]
  });
}

export function optimizeRoot(root: SvgElementNode, settings: OptimizerSettings): SvgElementNode {
  const optimized = optimizeNode(root, settings);
  return optimized?.kind === 'element' ? optimized : root;
}
