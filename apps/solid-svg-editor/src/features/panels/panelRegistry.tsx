import { createEditorRegistries } from '../../editor/contributions';
import type { EditorContribution, EditorKernel, PanelContribution } from '../../editor/kernel';
import type { SvgIcon } from '../../editor/svg-icon';
import type { PanelId } from '../../editor/types';
import DebugIcon from '../chrome/icons/Debug.svg';
import InspectorIcon from '../chrome/icons/Inspector.svg';
import PreviewsIcon from '../chrome/icons/Previews.svg';
import TextFileIcon from '../chrome/icons/TextFile.svg';
import { InspectorPanel } from '../inspector/InspectorPanel';
import { CodePanel, DebugPanel, PreviewsPanel } from './SidePanels';

const defaultPanelOrder = 1000;

export interface EditorPanelContext {
  readonly kernel: EditorKernel<EditorPanelContext>;
}

export type EditorPanelDescriptor = PanelContribution<EditorPanelContext> & {
  readonly id: PanelId;
  readonly icon: SvgIcon;
};

export type EditorPanelContribution = EditorContribution<EditorPanelContext> & {
  readonly panels?: readonly EditorPanelDescriptor[];
};

export interface EditorPanelRegistry {
  readonly contributions: readonly EditorPanelContribution[];
  readonly panels: readonly EditorPanelDescriptor[];
  readonly getPanel: (id: PanelId) => EditorPanelDescriptor;
}

export const corePanelContribution = {
  id: 'core.panels',
  panels: [
    {
      id: 'inspector',
      label: 'Inspector',
      icon: InspectorIcon,
      order: 10,
      render: (context) => <InspectorPanel kernel={context.kernel} />
    },
    {
      id: 'code',
      label: 'Code editor',
      icon: TextFileIcon,
      order: 20,
      render: (context) => (
        <CodePanel
          code={context.kernel.documents.activeCode()}
          parseError={context.kernel.documents.activeTab()?.parseError}
          applyCode={context.kernel.documents.applyCode}
          reformatPretty={() => context.kernel.documents.reformatActiveCode(context.kernel.settings.settings().formatter)}
          reformatCompact={() => context.kernel.documents.reformatActiveCode(context.kernel.settings.settings().exportFormatter)}
          copySvgText={() => void context.kernel.ui.copySvgText?.()}
        />
      )
    },
    {
      id: 'previews',
      label: 'Previews',
      icon: PreviewsIcon,
      order: 30,
      render: (context) => (
        <PreviewsPanel
          root={context.kernel.documents.activeRoot()}
          selectedNodes={context.kernel.selection.selectedNodes()}
          exportText={context.kernel.documents.exportText()}
          {...(context.kernel.rendering.svgNodeRenderer
            ? { svgNodeRenderer: context.kernel.rendering.svgNodeRenderer }
            : {})}
        />
      )
    },
    {
      id: 'debug',
      label: 'Debug',
      icon: DebugIcon,
      order: 40,
      render: (context) => (
        <DebugPanel
          root={context.kernel.documents.activeRoot()}
          selectedNodes={context.kernel.selection.selectedNodes()}
          elementCount={context.kernel.documents.elementCount()}
          exportText={context.kernel.documents.exportText()}
          heldKeys={context.kernel.input.heldKeys()}
          viewportPointer={context.kernel.input.viewportPointer()}
          recentCommandEvent={context.kernel.commands.recentEvent()}
          packageStates={context.kernel.registries.packageStates}
          packageLoadOrder={context.kernel.registries.packageLoadOrder}
          packageDependencyGraph={context.kernel.registries.packageDependencyGraph}
          packageCompatibility={context.kernel.registries.packageCompatibility}
          packageUpdates={context.kernel.registries.packageUpdates}
          contributionSources={context.kernel.registries.contributionSources}
          contributionCount={context.kernel.registries.contributions.length}
          registryHealth={context.kernel.registries.health}
          registryIssues={context.kernel.registries.issues}
        />
      )
    }
  ] as const satisfies readonly EditorPanelDescriptor[]
} satisfies EditorPanelContribution;

export function createEditorPanelRegistry(
  contributions: readonly EditorPanelContribution[] = [corePanelContribution]
): EditorPanelRegistry {
  const registries = createEditorRegistries<EditorPanelContext>(contributions);
  const panels = editorPanelDescriptorsFromPanels(registries.panels);

  return {
    contributions,
    panels,
    getPanel: (id) => getEditorPanelFromList(panels, id)
  } satisfies EditorPanelRegistry;
}

export const editorPanelRegistry = createEditorPanelRegistry();
export const editorPanels = editorPanelRegistry.panels;

export function getEditorPanel(id: PanelId): EditorPanelDescriptor {
  return editorPanelRegistry.getPanel(id);
}

export function editorPanelDescriptorsFromPanels(
  panels: readonly PanelContribution<EditorPanelContext>[]
): readonly EditorPanelDescriptor[] {
  return panels
    .map((panel, index) => ({ panel, index }))
    .filter(isEditorPanelDescriptorEntry)
    .sort(compareEditorPanelDescriptorEntries)
    .map((entry) => entry.panel);
}

export function getEditorPanelFromList(
  panels: readonly EditorPanelDescriptor[],
  id: PanelId
): EditorPanelDescriptor {
  return panels.find((panel) => panel.id === id) ?? firstPanel(panels);
}

export function isEditorPanelDescriptor(panel: PanelContribution<EditorPanelContext>): panel is EditorPanelDescriptor {
  return typeof panel.icon === 'function';
}

function isEditorPanelDescriptorEntry(entry: {
  readonly panel: PanelContribution<EditorPanelContext>;
  readonly index: number;
}): entry is { readonly panel: EditorPanelDescriptor; readonly index: number } {
  return isEditorPanelDescriptor(entry.panel);
}

function compareEditorPanelDescriptorEntries(
  first: { readonly panel: EditorPanelDescriptor; readonly index: number },
  second: { readonly panel: EditorPanelDescriptor; readonly index: number }
): number {
  const orderDifference = (first.panel.order ?? defaultPanelOrder) - (second.panel.order ?? defaultPanelOrder);
  return orderDifference === 0 ? first.index - second.index : orderDifference;
}

function firstPanel(panels: readonly EditorPanelDescriptor[]): EditorPanelDescriptor {
  const panel = panels[0];

  if (!panel) {
    throw new Error('Expected at least one editor panel contribution');
  }

  return panel;
}
