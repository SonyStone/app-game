import { createRoot } from 'solid-js';
import { describe, expect, it } from 'vitest';

import { createSvgCapabilityRegistry } from '../src/editor/capabilities';
import { defaultSettings } from '../src/editor/defaults';
import type { SvgCapabilityContribution } from '../src/editor/kernel';
import { isOperationBackedEditorCommand } from '../src/editor/operations';
import { pathAnchorSelectionTarget } from '../src/editor/selection-targets';
import { coreSvgCapabilityContribution } from '../src/editor/svg-capabilities/coreSvgContribution';
import { createEditorDerivedState } from '../src/features/shell/createEditorDerivedState';
import { createElementNode } from '../src/svg-model';

describe('createEditorDerivedState', () => {
  it('marks the selected path-anchor handle active', () => {
    createRoot((dispose) => {
      const path = createElementNode('path', [{ name: 'd', value: 'M 0 0 L 10 20' }]);
      const root = createElementNode('svg', [], [path]);
      const selectedPathAnchor = pathAnchorSelectionTarget(path.id, 1, 'y');
      const derived = createEditorDerivedState({
        settings: () => defaultSettings(),
        activeRoot: () => root,
        selectedIds: () => [],
        selectedPathAnchor: () => selectedPathAnchor,
        activeDrag: () => undefined,
        activeTouchGesture: () => undefined,
        transientViewportPreview: () => false,
        rootSize: () => ({ width: 100, height: 100, viewBox: [0, 0, 100, 100] })
      });

      const activeHandles = derived.handles().filter((handle) => handle.active);

      expect(activeHandles.map((handle) => handle.id)).toEqual(['cmd-1-x']);
      expect(activeHandles[0]?.selectionTargets).toContainEqual(pathAnchorSelectionTarget(path.id, 1, 'y'));

      const command = activeHandles[0]?.createCommand?.(12, 24);

      expect(command && isOperationBackedEditorCommand(command)).toBe(true);
      expect(command && isOperationBackedEditorCommand(command) ? command.resolveOperations(root) : []).toEqual([
        { kind: 'svg.set-attribute', nodeId: path.id, name: 'd', value: 'M 0 0 L 12 24' }
      ]);

      dispose();
    });
  });

  it('derives handles from injected SVG capabilities', () => {
    createRoot((dispose) => {
      const custom = createElementNode('testShape');
      const root = createElementNode('svg', [], [custom]);
      const customContribution = {
        id: 'test.svg',
        elements: [
          {
            name: 'testShape',
            defaults: {},
            attributes: [],
            createHandles: ({ node }) => [
              {
                id: 'custom-origin',
                nodeId: node.id,
                x: 10,
                y: 20,
                label: 'custom origin',
                small: false,
                update: (currentRoot) => currentRoot
              }
            ]
          }
        ]
      } satisfies SvgCapabilityContribution;
      const capabilities = createSvgCapabilityRegistry([coreSvgCapabilityContribution, customContribution]);
      const derived = createEditorDerivedState({
        settings: () => defaultSettings(),
        activeRoot: () => root,
        selectedIds: () => [custom.id],
        selectedPathAnchor: () => undefined,
        activeDrag: () => undefined,
        activeTouchGesture: () => undefined,
        transientViewportPreview: () => false,
        rootSize: () => ({ width: 100, height: 100, viewBox: [0, 0, 100, 100] }),
        capabilities
      });

      expect(derived.handles().map((handle) => handle.id)).toEqual(['custom-origin']);

      dispose();
    });
  });
});
