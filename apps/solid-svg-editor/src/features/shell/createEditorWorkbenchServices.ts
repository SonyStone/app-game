import { createSignal } from 'solid-js';

import type { WorkbenchService } from '../../editor/kernel';
import type { PanelId } from '../../editor/types';
import { createResizableSidebar } from './createResizableSidebar';

export interface EditorWorkbenchServices {
  readonly workbench: WorkbenchService;
  readonly showCodePanel: () => void;
}

export function createEditorWorkbenchServices(): EditorWorkbenchServices {
  const [activePanel, setActivePanel] = createSignal<PanelId>('inspector');
  const sidebar = createResizableSidebar({ initialWidth: 408, minWidth: 320, maxWidth: 720 });

  return {
    workbench: {
      activePanel,
      setActivePanel,
      sidebar
    },
    showCodePanel: () => setActivePanel('code')
  } satisfies EditorWorkbenchServices;
}
