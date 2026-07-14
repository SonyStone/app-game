import { createRoot, createSignal } from 'solid-js';
import { describe, expect, it } from 'vitest';

import { nodeSelectionTarget, pathAnchorSelectionTarget, pathCommandSelectionTarget } from '../src/editor/selection-targets';
import { createEditorSelection } from '../src/features/selection/createEditorSelection';
import { createElementNode } from '../src/svg-model';

describe('createEditorSelection', () => {
  it('projects node and path-command selection into typed targets', () => {
    createRoot((dispose) => {
      const path = createPathNode();
      const root = createElementNode('svg', [], [path]);
      const selection = createEditorSelection({ root: () => root });

      selection.selectNode(path.id);

      expect(selection.selectedTargets()).toEqual([nodeSelectionTarget(path.id)]);

      selection.selectTarget(pathCommandSelectionTarget(path.id, 2));

      expect(selection.selectedTargets()).toEqual([
        nodeSelectionTarget(path.id),
        pathCommandSelectionTarget(path.id, 2)
      ]);

      dispose();
    });
  });

  it('updates selected ids and pivots from typed targets', () => {
    createRoot((dispose) => {
      const path = createPathNode();
      const root = createElementNode('svg', [], [path]);
      const selection = createEditorSelection({ root: () => root });

      selection.setSelectedTargets([nodeSelectionTarget(path.id), pathCommandSelectionTarget(path.id, 1)]);

      expect(selection.selectedIds()).toEqual([path.id]);
      expect(selection.selectionPivot()).toBe(path.id);
      expect(selection.selectedTargets()).toEqual([
        nodeSelectionTarget(path.id),
        pathCommandSelectionTarget(path.id, 1)
      ]);

      selection.setSelectedTargets([pathCommandSelectionTarget(path.id, 3)]);

      expect(selection.selectedIds()).toEqual([]);
      expect(selection.selectionPivot()).toBeUndefined();
      expect(selection.selectedTargets()).toEqual([pathCommandSelectionTarget(path.id, 3)]);

      dispose();
    });
  });

  it('normalizes typed targets before projecting compatibility views', () => {
    createRoot((dispose) => {
      const path = createPathNode();
      const root = createElementNode('svg', [], [path]);
      const selection = createEditorSelection({ root: () => root });

      selection.setSelectedTargets([
        nodeSelectionTarget(path.id),
        nodeSelectionTarget(path.id),
        pathCommandSelectionTarget(path.id, 1),
        pathCommandSelectionTarget(path.id, 3)
      ]);

      expect(selection.selectedTargets()).toEqual([
        nodeSelectionTarget(path.id),
        pathCommandSelectionTarget(path.id, 3)
      ]);
      expect(selection.selectedIds()).toEqual([path.id]);

      dispose();
    });
  });

  it('preserves path-anchor targets', () => {
    createRoot((dispose) => {
      const path = createPathNode();
      const root = createElementNode('svg', [], [path]);
      const selection = createEditorSelection({ root: () => root });

      selection.setSelectedTargets([
        nodeSelectionTarget(path.id),
        pathCommandSelectionTarget(path.id, 1),
        pathAnchorSelectionTarget(path.id, 2, 'x')
      ]);

      expect(selection.selectedTargets()).toEqual([
        nodeSelectionTarget(path.id),
        pathAnchorSelectionTarget(path.id, 2, 'x')
      ]);
      expect(selection.selectedPathAnchor()).toEqual({ nodeId: path.id, commandIndex: 2, parameter: 'x' });

      selection.setSelectedIds([path.id]);

      expect(selection.selectedTargets()).toEqual([
        nodeSelectionTarget(path.id),
        pathAnchorSelectionTarget(path.id, 2, 'x')
      ]);

      dispose();
    });
  });

  it('selects individual typed targets through the selection service', () => {
    createRoot((dispose) => {
      const path = createPathNode();
      const root = createElementNode('svg', [], [path]);
      const selection = createEditorSelection({ root: () => root });

      selection.selectTarget(pathCommandSelectionTarget(path.id, 0));

      expect(selection.selectedTargets()).toEqual([pathCommandSelectionTarget(path.id, 0)]);

      selection.selectTarget(pathAnchorSelectionTarget(path.id, 0, 'y'));

      expect(selection.selectedTargets()).toEqual([pathAnchorSelectionTarget(path.id, 0, 'y')]);
      expect(selection.selectedPathAnchor()).toEqual({ nodeId: path.id, commandIndex: 0, parameter: 'y' });

      selection.selectTarget(nodeSelectionTarget(path.id));

      expect(selection.selectedIds()).toEqual([path.id]);
      expect(selection.selectedTargets()).toEqual([nodeSelectionTarget(path.id)]);
      expect(selection.selectedPathAnchor()).toBeUndefined();

      dispose();
    });
  });

  it('reconciles stale targets when the document root changes', () => {
    createRoot((dispose) => {
      const path = createPathNode();
      const rect = createElementNode('rect');
      const [root, setRoot] = createSignal(createElementNode('svg', [], [path, rect]));
      const selection = createEditorSelection({ root });

      selection.setSelectedTargets([
        nodeSelectionTarget(rect.id),
        pathAnchorSelectionTarget(path.id, 0, 'x')
      ]);

      setRoot(createElementNode('svg', [], [rect]));

      expect(selection.selectedTargets()).toEqual([nodeSelectionTarget(rect.id)]);

      setRoot(createElementNode('svg'));

      expect(selection.selectedTargets()).toEqual([]);
      expect(selection.selectionPivot()).toBeUndefined();

      dispose();
    });
  });

  it('reconciles stale path targets when path data changes', () => {
    createRoot((dispose) => {
      const path = createPathNode();
      const [root, setRoot] = createSignal(createElementNode('svg', [], [path]));
      const selection = createEditorSelection({ root });

      selection.setSelectedTargets([
        nodeSelectionTarget(path.id),
        pathAnchorSelectionTarget(path.id, 2, 'x')
      ]);

      expect(selection.selectedTargets()).toEqual([
        nodeSelectionTarget(path.id),
        pathAnchorSelectionTarget(path.id, 2, 'x')
      ]);

      setRoot(createElementNode('svg', [], [{ ...path, attrs: [{ name: 'd', value: 'M 0 0 L 10 20' }] }]));

      expect(selection.selectedTargets()).toEqual([nodeSelectionTarget(path.id)]);

      dispose();
    });
  });

  it('drops path anchors with parameters missing from the selected command', () => {
    createRoot((dispose) => {
      const path = createPathNode();
      const root = createElementNode('svg', [], [path]);
      const selection = createEditorSelection({ root: () => root });

      selection.setSelectedTargets([
        nodeSelectionTarget(path.id),
        pathAnchorSelectionTarget(path.id, 3, 'y')
      ]);

      expect(selection.selectedTargets()).toEqual([nodeSelectionTarget(path.id)]);

      dispose();
    });
  });
});

function createPathNode() {
  return createElementNode('path', [{ name: 'd', value: 'M 0 0 L 10 20 C 1 2 3 4 5 6 H 8' }]);
}
