import type { EditorKernel } from '../../editor/kernel';
import type { PanelId } from '../../editor/types';
import { PanelTabs } from '../chrome/TopBar';
import { editorPanelDescriptorsFromPanels, getEditorPanelFromList, type EditorPanelContext } from './panelRegistry';

export function EditorSidebar(props: EditorPanelContext) {
  const panels = () => editorPanelDescriptorsFromPanels(props.kernel.registries.panels);
  const workbench = () => props.kernel.ui.workbench;
  const activePanel = () => workbench()?.activePanel() ?? panels()[0]?.id ?? 'inspector';
  const setActivePanel = (panelId: PanelId) => {
    workbench()?.setActivePanel(panelId);
  };

  return (
    <aside
      class="left-workbench grid min-h-0 max-w-180 min-w-80 grid-rows-[31px_minmax(0,1fr)] py-1.5 pr-0 pl-1.5 [@media(max-width:820px)]:!w-full"
      style={{ width: `${workbench()?.sidebar.width() ?? 408}px` }}
      data-testid="left-workbench"
    >
      <PanelTabs panels={panels()} activePanel={activePanel()} setActivePanel={setActivePanel} />
      {getEditorPanelFromList(panels(), activePanel()).render({ kernel: props.kernel } satisfies EditorPanelContext)}
    </aside>
  );
}

export function WorkspaceSplitter<TPanelContext>(props: { readonly kernel: EditorKernel<TPanelContext> }) {
  const sidebar = () => props.kernel.ui.workbench?.sidebar;

  return (
    <button
      class="splitter w-2 cursor-col-resize border-0 bg-transparent hover:bg-[color-mix(in_srgb,var(--accent)_24%,transparent)] [@media(max-width:820px)]:h-2 [@media(max-width:820px)]:cursor-row-resize"
      type="button"
      aria-label="Resize sidebar"
      data-testid="workspace-splitter"
      disabled={!sidebar()}
      onPointerDown={(event) => sidebar()?.onPointerDown(event)}
      onPointerMove={(event) => sidebar()?.onPointerMove(event)}
      onPointerUp={(event) => sidebar()?.onPointerUp(event)}
    />
  );
}
