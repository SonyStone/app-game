import { createRoot } from 'solid-js';
import { describe, expect, it } from 'vitest';

import { svgCapabilities } from '../src/editor/capabilities';
import { defaultSettings } from '../src/editor/defaults';
import { createEditorDocumentServices } from '../src/features/shell/createEditorDocumentServices';
import { getAttribute, setAttribute } from '../src/svg-model';

describe('createEditorDocumentServices', () => {
  it('projects document, command, and resource kernel services', () => {
    createRoot((dispose) => {
      const services = createEditorDocumentServices({
        capabilities: svgCapabilities,
        formatter: () => defaultSettings().formatter,
        onSelectionReset: () => undefined,
        onDocumentOpened: () => undefined,
        onParseError: () => undefined
      });
      const documentService = services.createDocumentService({
        exportText: () => '<svg data-export="yes" />',
        elementCount: () => 7
      });

      expect(documentService.activeRoot()).toBe(services.documents.activeRoot());
      expect(documentService.exportText()).toBe('<svg data-export="yes" />');
      expect(documentService.elementCount()).toBe(7);
      expect(services.resources.activeResources()).toBe(services.documents.activeDocument().resources);
      expect(services.resources.resolveNode(documentService.activeRoot().id)).toBe(documentService.activeRoot());
      expect(services.commands.recentEvent()).toBeUndefined();

      services.commands.dispatch({
        id: 'test.mark-root',
        label: 'Mark root',
        apply: (root) => setAttribute(root, 'data-test', 'yes')
      });

      expect(getAttribute(documentService.activeRoot(), 'data-test', true)).toBe('yes');
      expect(services.commands.recentEvent()).toMatchObject({
        type: 'command.dispatched',
        commandId: 'test.mark-root'
      });

      dispose();
    });
  });
});
