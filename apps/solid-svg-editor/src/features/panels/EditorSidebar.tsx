import { Show } from 'solid-js';

import type { PanelId } from '../../editor/types';
import type { RecognizedElement } from '../../svg-db';
import type { DropPosition, SvgElementNode, SvgNode } from '../../svg-model';
import { PanelTabs } from '../chrome/TopBar';
import { InspectorPanel } from '../inspector/InspectorPanel';
import type { PathCommandSelection } from '../selection/createEditorSelection';
import { CodePanel, DebugPanel, PreviewsPanel } from './SidePanels';

export function EditorSidebar(props: {
  readonly width: number;
  readonly activePanel: PanelId;
  readonly setActivePanel: (panel: PanelId) => void;
  readonly root: SvgElementNode;
  readonly selectedIds: readonly string[];
  readonly selectedPathCommand: PathCommandSelection | undefined;
  readonly setSelectedPathCommand: (selection: PathCommandSelection | undefined) => void;
  readonly selectNode: (id: string, event?: MouseEvent | PointerEvent) => void;
  readonly clearSelection: () => void;
  readonly addElement: (name: RecognizedElement | string) => void;
  readonly addTextNode: (kind: 'text' | 'comment' | 'cdata') => void;
  readonly updateElementAttribute: (nodeId: string, name: string, value: string) => void;
  readonly removeElementAttribute: (nodeId: string, name: string) => void;
  readonly updateBasicNodeText: (nodeId: string, text: string) => void;
  readonly openContextMenu: (event: MouseEvent, nodeId: string) => void;
  readonly reorderNodes: (nodeIds: readonly string[], targetId: string, position: DropPosition) => void;
  readonly code: string;
  readonly parseError: string | undefined;
  readonly applyCode: (text: string) => void;
  readonly reformatPretty: () => void;
  readonly reformatCompact: () => void;
  readonly copySvgText: () => void;
  readonly selectedNodes: readonly SvgNode[];
  readonly elementCount: number;
  readonly exportText: string;
}) {
  return (
    <aside
      class="left-workbench grid min-h-0 max-w-180 min-w-80 grid-rows-[31px_minmax(0,1fr)] py-1.5 pr-0 pl-1.5 [@media(max-width:820px)]:!w-full"
      style={{ width: `${props.width}px` }}
      data-testid="left-workbench"
    >
      <PanelTabs activePanel={props.activePanel} setActivePanel={props.setActivePanel} />
      <Show when={props.activePanel === 'inspector'}>
        <InspectorPanel
          root={props.root}
          selectedIds={props.selectedIds}
          selectedPathCommand={props.selectedPathCommand}
          setSelectedPathCommand={props.setSelectedPathCommand}
          selectNode={props.selectNode}
          clearSelection={props.clearSelection}
          addElement={props.addElement}
          addTextNode={props.addTextNode}
          updateElementAttribute={props.updateElementAttribute}
          removeElementAttribute={props.removeElementAttribute}
          updateBasicNodeText={props.updateBasicNodeText}
          openContextMenu={props.openContextMenu}
          reorderNodes={props.reorderNodes}
        />
      </Show>
      <Show when={props.activePanel === 'code'}>
        <CodePanel
          code={props.code}
          parseError={props.parseError}
          applyCode={props.applyCode}
          reformatPretty={props.reformatPretty}
          reformatCompact={props.reformatCompact}
          copySvgText={props.copySvgText}
        />
      </Show>
      <Show when={props.activePanel === 'previews'}>
        <PreviewsPanel root={props.root} selectedNodes={props.selectedNodes} exportText={props.exportText} />
      </Show>
      <Show when={props.activePanel === 'debug'}>
        <DebugPanel
          root={props.root}
          selectedNodes={props.selectedNodes}
          elementCount={props.elementCount}
          exportText={props.exportText}
        />
      </Show>
    </aside>
  );
}
