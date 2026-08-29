import type { JSX } from '@solidjs/web';

import type { PointerStateWithActive } from '@solid-primitives/pointer';
import type { EditorCommandEvent } from '../../editor/commands';
import type { SvgIcon } from '../../editor/svg-icon';
import type { PanelId } from '../../editor/types';
import type { RecognizedElement } from '../../svg-db';
import type { DropPosition, SvgElementNode, SvgNode } from '../../svg-model';
import DebugIcon from '../chrome/icons/Debug.svg';
import InspectorIcon from '../chrome/icons/Inspector.svg';
import PreviewsIcon from '../chrome/icons/Previews.svg';
import TextFileIcon from '../chrome/icons/TextFile.svg';
import { InspectorPanel } from '../inspector/InspectorPanel';
import type { PathCommandSelection } from '../selection/createEditorSelection';
import { CodePanel, DebugPanel, PreviewsPanel } from './SidePanels';

export interface EditorPanelContext {
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
  readonly heldKeys: readonly string[];
  readonly viewportPointer: PointerStateWithActive;
  readonly recentCommandEvent: EditorCommandEvent | undefined;
}

export interface EditorPanelDescriptor {
  readonly id: PanelId;
  readonly label: string;
  readonly icon: SvgIcon;
  readonly render: (context: EditorPanelContext) => JSX.Element;
}

export const editorPanels = [
  {
    id: 'inspector',
    label: 'Inspector',
    icon: InspectorIcon,
    render: (context) => (
      <InspectorPanel
        root={context.root}
        selectedIds={context.selectedIds}
        selectedPathCommand={context.selectedPathCommand}
        setSelectedPathCommand={context.setSelectedPathCommand}
        selectNode={context.selectNode}
        clearSelection={context.clearSelection}
        addElement={context.addElement}
        addTextNode={context.addTextNode}
        updateElementAttribute={context.updateElementAttribute}
        removeElementAttribute={context.removeElementAttribute}
        updateBasicNodeText={context.updateBasicNodeText}
        openContextMenu={context.openContextMenu}
        reorderNodes={context.reorderNodes}
      />
    )
  },
  {
    id: 'code',
    label: 'Code editor',
    icon: TextFileIcon,
    render: (context) => (
      <CodePanel
        code={context.code}
        parseError={context.parseError}
        applyCode={context.applyCode}
        reformatPretty={context.reformatPretty}
        reformatCompact={context.reformatCompact}
        copySvgText={context.copySvgText}
      />
    )
  },
  {
    id: 'previews',
    label: 'Previews',
    icon: PreviewsIcon,
    render: (context) => (
      <PreviewsPanel root={context.root} selectedNodes={context.selectedNodes} exportText={context.exportText} />
    )
  },
  {
    id: 'debug',
    label: 'Debug',
    icon: DebugIcon,
    render: (context) => (
      <DebugPanel
        root={context.root}
        selectedNodes={context.selectedNodes}
        elementCount={context.elementCount}
        exportText={context.exportText}
        heldKeys={context.heldKeys}
        viewportPointer={context.viewportPointer}
        recentCommandEvent={context.recentCommandEvent}
      />
    )
  }
] as const satisfies readonly EditorPanelDescriptor[];

export function getEditorPanel(id: PanelId): EditorPanelDescriptor {
  return editorPanels.find((panel) => panel.id === id) ?? editorPanels[0];
}
