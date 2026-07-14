import { createRoot } from 'solid-js';
import { describe, expect, it } from 'vitest';

import { pathCommandSelectionTarget } from '../src/editor/selection-targets';
import { createEditorSelectionServices } from '../src/features/shell/createEditorSelectionServices';
import { createElementNode, findNode, getAttribute, type SvgElementNode } from '../src/svg-model';

describe('createEditorSelectionServices', () => {
  it('exposes selection service state and path command shortcut handlers', () => {
    createRoot((dispose) => {
      const path = createElementNode('path', [{ name: 'd', value: 'M 0 0' }]);
      let root: SvgElementNode = createElementNode('svg', [], [path]);
      const services = createEditorSelectionServices({
        activeRoot: () => root,
        dispatchCommand: (command) => {
          root = command.apply(root);
        }
      });

      services.selection.setSelectedTargets([pathCommandSelectionTarget(path.id, 0)]);
      services.shortcutHandlers['tool.insert-path-command'](new KeyboardEvent('keydown', { key: 'l' }));

      const updatedPath = findNode(root, path.id);

      if (!updatedPath || updatedPath.kind !== 'element') {
        throw new Error('Expected path element');
      }

      expect(getAttribute(updatedPath, 'd', true)).toBe('M 0 0 l 0 0');
      expect(services.selection.selectedTargets()).toEqual([pathCommandSelectionTarget(path.id, 1)]);

      services.resetDocumentSelection();
      expect(services.selection.selectedTargets()).toEqual([]);

      dispose();
    });
  });
});
