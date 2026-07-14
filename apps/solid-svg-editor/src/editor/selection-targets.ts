export type PathAnchorSelection = { readonly nodeId: string; readonly commandIndex: number; readonly parameter: string };

export interface NodeSelectionTarget {
  readonly kind: 'node';
  readonly nodeId: string;
}

export interface PathCommandSelectionTarget {
  readonly kind: 'path-command';
  readonly nodeId: string;
  readonly index: number;
}

export interface PathAnchorSelectionTarget {
  readonly kind: 'path-anchor';
  readonly nodeId: string;
  readonly commandIndex: number;
  readonly parameter: string;
}

export type PathSelectionTarget = PathCommandSelectionTarget | PathAnchorSelectionTarget;
export type SelectionTarget = NodeSelectionTarget | PathSelectionTarget;

export function nodeSelectionTarget(nodeId: string): NodeSelectionTarget {
  return { kind: 'node', nodeId };
}

export function pathCommandSelectionTarget(nodeId: string, index: number): PathCommandSelectionTarget {
  return { kind: 'path-command', nodeId, index };
}

export function pathAnchorSelectionTarget(
  nodeId: string,
  commandIndex: number,
  parameter: string
): PathAnchorSelectionTarget {
  return { kind: 'path-anchor', nodeId, commandIndex, parameter };
}

export function normalizeSelectionTargets(targets: readonly SelectionTarget[]): readonly SelectionTarget[] {
  const nodeIds = nodeIdsFromSelectionTargets(targets);
  const pathTarget = pathTargetFromSelectionTargets(targets);
  return [
    ...nodeIds.map(nodeSelectionTarget),
    ...(pathTarget ? [pathTarget] : [])
  ];
}

export function mergeSelectionTargets(
  initial: readonly SelectionTarget[],
  added: readonly SelectionTarget[]
): readonly SelectionTarget[] {
  return normalizeSelectionTargets([...initial, ...added]);
}

export function nodeIdsFromSelectionTargets(targets: readonly SelectionTarget[]): readonly string[] {
  const ids: string[] = [];

  for (const target of targets) {
    switch (target.kind) {
      case 'node':
        if (!ids.includes(target.nodeId)) {
          ids.push(target.nodeId);
        }
        break;
      case 'path-command':
      case 'path-anchor':
        break;
      default: {
        const exhaustive: never = target;
        throw new Error(`Unhandled selection target: ${JSON.stringify(exhaustive)}`);
      }
    }
  }

  return ids;
}

export function pathCommandFromSelectionTargets(
  targets: readonly SelectionTarget[]
): { readonly nodeId: string; readonly index: number } | undefined {
  for (let index = targets.length - 1; index >= 0; index -= 1) {
    const target = targets[index];

    if (target?.kind === 'path-command') {
      return { nodeId: target.nodeId, index: target.index };
    }

    if (target?.kind === 'path-anchor') {
      return { nodeId: target.nodeId, index: target.commandIndex };
    }
  }

  return undefined;
}

export function pathAnchorFromSelectionTargets(targets: readonly SelectionTarget[]): PathAnchorSelection | undefined {
  for (let index = targets.length - 1; index >= 0; index -= 1) {
    const target = targets[index];

    if (target?.kind === 'path-anchor') {
      return { nodeId: target.nodeId, commandIndex: target.commandIndex, parameter: target.parameter };
    }
  }

  return undefined;
}

export function pathTargetFromSelectionTargets(targets: readonly SelectionTarget[]): PathSelectionTarget | undefined {
  for (let index = targets.length - 1; index >= 0; index -= 1) {
    const target = targets[index];

    if (target?.kind === 'path-command' || target?.kind === 'path-anchor') {
      return target;
    }
  }

  return undefined;
}
