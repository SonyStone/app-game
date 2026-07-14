import { createRoot } from 'solid-js';
import { describe, expect, it } from 'vitest';

import { createEditorWorkbenchServices } from '../src/features/shell/createEditorWorkbenchServices';

describe('createEditorWorkbenchServices', () => {
  it('projects workbench panel and sidebar state', () => {
    createRoot((dispose) => {
      const services = createEditorWorkbenchServices();

      expect(services.workbench.activePanel()).toBe('inspector');
      expect(services.workbench.sidebar.width()).toBe(408);

      services.workbench.setActivePanel('debug');
      expect(services.workbench.activePanel()).toBe('debug');

      services.showCodePanel();
      expect(services.workbench.activePanel()).toBe('code');

      dispose();
    });
  });
});
