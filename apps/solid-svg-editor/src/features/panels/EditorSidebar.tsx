import type { PanelId } from '../../editor/types';
import { PanelTabs } from '../chrome/TopBar';
import { getEditorPanel, type EditorPanelContext } from './panelRegistry';

export function EditorSidebar(props: {
  readonly width: number;
  readonly activePanel: PanelId;
  readonly setActivePanel: (panel: PanelId) => void;
} & EditorPanelContext) {
  return (
    <aside
      class="left-workbench grid min-h-0 max-w-180 min-w-80 grid-rows-[31px_minmax(0,1fr)] py-1.5 pr-0 pl-1.5 [@media(max-width:820px)]:!w-full"
      style={{ width: `${props.width}px` }}
      data-testid="left-workbench"
    >
      <PanelTabs activePanel={props.activePanel} setActivePanel={props.setActivePanel} />
      {getEditorPanel(props.activePanel).render(props)}
    </aside>
  );
}
