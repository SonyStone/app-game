import type { JSX } from '@solidjs/web';

import type { PointerStateWithActive } from '@solid-primitives/pointer';
import type { EditorCommandEvent } from '../../editor/commands';
import type { SvgIcon } from '../../editor/svg-icon';
import type { PanelId } from '../../editor/types';
import type { HoverTarget } from '../../editor/contours';
import type { SvgNodeActions } from '../documents/createSvgNodeActions';
import type { RecognizedElement } from '../../svg-db';
import type { DropPosition, SvgElementNode, SvgNode } from '../../svg-model';
import DebugIcon from '../chrome/icons/Debug.svg';
import InspectorIcon from '../chrome/icons/Inspector.svg';
import PreviewsIcon from '../chrome/icons/Previews.svg';
import TextFileIcon from '../chrome/icons/TextFile.svg';
import { InspectorPanel } from '../inspector/InspectorPanel';
import type { CommandSelection } from '../../editor/path-selection';
import { CodePanel, DebugPanel, PreviewsPanel } from './SidePanels';

export interface EditorPanelContext {
  readonly root: SvgElementNode;
  readonly selectedIds: readonly string[];
  readonly commandSelection: CommandSelection | undefined;
  readonly hovered: HoverTarget | undefined;
  readonly setHovered: (target: HoverTarget | undefined) => void;
  readonly setCommandSelection: (selection: CommandSelection | undefined) => void;
  readonly selectNode: (id: string, event?: MouseEvent | PointerEvent) => void;
  readonly clearSelection: () => void;
  readonly addElement: (name: RecognizedElement | string) => void;
  readonly addTextNode: (kind: 'text' | 'comment' | 'cdata') => void;
  readonly updateElementAttribute: SvgNodeActions['updateElementAttribute'];
  readonly removeElementAttribute: (nodeId: string, name: string) => void;
  readonly updateBasicNodeText: SvgNodeActions['updateBasicNodeText'];
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
  readonly previewSizes: readonly number[];
  readonly setPreviewSizes: (sizes: readonly number[]) => void;
  readonly heldKeys: readonly string[];
  readonly viewportPointer: PointerStateWithActive;
  readonly recentCommandEvent: EditorCommandEvent | undefined;
  /** "View in Inspector": scroll the inspector to this node (a new `version` repeats the request). */
  readonly reveal: { readonly nodeId: string; readonly version: number } | undefined;
  /** Whether the Debug panel shows GodSVG's advanced debug information. */
  readonly advancedDebug: boolean;
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
        commandSelection={context.commandSelection}
        hovered={context.hovered}
        setHovered={context.setHovered}
        setCommandSelection={context.setCommandSelection}
        selectNode={context.selectNode}
        clearSelection={context.clearSelection}
        addElement={context.addElement}
        addTextNode={context.addTextNode}
        updateElementAttribute={context.updateElementAttribute}
        removeElementAttribute={context.removeElementAttribute}
        updateBasicNodeText={context.updateBasicNodeText}
        openContextMenu={context.openContextMenu}
        reorderNodes={context.reorderNodes}
        reveal={context.reveal}
      />
    )
  },
  {
    id: 'code',
    label: 'Code Editor',
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
      <PreviewsPanel
        root={context.root}
        selectedNodes={context.selectedNodes}
        exportText={context.exportText}
        previewSizes={context.previewSizes}
        setPreviewSizes={context.setPreviewSizes}
      />
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
        advanced={context.advancedDebug}
      />
    )
  }
] as const satisfies readonly EditorPanelDescriptor[];

export function getEditorPanel(id: PanelId): EditorPanelDescriptor {
  return editorPanels.find((panel) => panel.id === id) ?? editorPanels[0];
}
