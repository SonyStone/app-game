import { describe, expect, it } from 'vitest';

import { pathCommandSelectionTarget, type SelectionTarget } from '../src/editor/selection-targets';
import { createPathCommandKeyboardActions } from '../src/features/documents/createPathCommandKeyboardActions';
import { createElementNode, findNode, getAttribute, type SvgElementNode } from '../src/svg-model';

describe('createPathCommandKeyboardActions', () => {
  it('inserts path commands from typed path-command selection targets', () => {
    const path = createElementNode('path', [{ name: 'd', value: 'M 0 0' }]);
    let root: SvgElementNode = createElementNode('svg', [], [path]);
    let selectedTargets: readonly SelectionTarget[] = [pathCommandSelectionTarget(path.id, 0)];
    const actions = createPathCommandKeyboardActions({
      selectedTargets: () => selectedTargets,
      selectTarget: (target) => {
        selectedTargets = [target];
      },
      dispatchCommand: (command) => {
        root = command.apply(root);
      }
    });

    actions.insertPathCommandFromKey('l', false);

    const updatedPath = findNode(root, path.id);

    if (!updatedPath || updatedPath.kind !== 'element') {
      throw new Error('Expected path element');
    }

    expect(getAttribute(updatedPath, 'd', true)).toBe('M 0 0 l 0 0');
    expect(selectedTargets).toEqual([pathCommandSelectionTarget(path.id, 1)]);
  });
});
