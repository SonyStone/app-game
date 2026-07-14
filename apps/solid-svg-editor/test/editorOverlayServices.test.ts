import { createRoot } from 'solid-js';
import { describe, expect, it } from 'vitest';

import { nodeSelectionTarget, pathCommandSelectionTarget, type SelectionTarget } from '../src/editor/selection-targets';
import { createEditorOverlayServices } from '../src/features/shell/createEditorOverlayServices';

describe('createEditorOverlayServices', () => {
  it('projects modal and context-menu UI state', () => {
    createRoot((dispose) => {
      const selected: SelectionTarget[] = [];
      const services = createEditorOverlayServices({
        selectTarget: (target) => {
          selected.push(target);
        }
      });
      const event = new MouseEvent('contextmenu', { clientX: 12, clientY: 34, cancelable: true });
      const nodeTarget = nodeSelectionTarget('node-1');

      expect(services.modal.active()).toBeUndefined();
      services.modal.open('settings');
      expect(services.modal.active()).toBe('settings');
      services.modal.close();
      expect(services.modal.active()).toBeUndefined();

      expect(services.contextMenu.active()).toBeUndefined();
      services.contextMenu.open(event, 'node-1');
      expect(event.defaultPrevented).toBe(true);
      expect(selected).toEqual([nodeTarget]);
      expect(services.contextMenu.active()).toEqual({ x: 12, y: 34, nodeId: 'node-1', target: nodeTarget });

      services.contextMenu.close();
      expect(services.contextMenu.active()).toBeUndefined();

      const pathTarget = pathCommandSelectionTarget('node-2', 3);

      services.setContextMenu({ x: 1, y: 2, nodeId: 'node-2', target: pathTarget });
      expect(services.contextMenu.active()).toEqual({ x: 1, y: 2, nodeId: 'node-2', target: pathTarget });
      services.clearContextMenu();
      expect(services.contextMenu.active()).toBeUndefined();

      dispose();
    });
  });
});
