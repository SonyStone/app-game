import type { ActionContribution, EditorContribution, EditorContributionContext } from '../kernel';
import type { ModalId } from '../types';

export type ActionRegistryContribution = EditorContribution<unknown> & {
  readonly actions: readonly ActionContribution[];
};

export const coreActionContribution = {
  id: 'core.actions',
  actions: [
    actionContribution('file.import', 'Import SVG', (kernel) => kernel.ui.svgImport?.openDialog(), {
      isEnabled: hasImportDialog
    }),
    modalActionContribution('file.export', 'Export', 'export'),
    actionContribution('file.save-svg', 'Save SVG', (kernel) => kernel.ui.downloadSvg?.(), {
      isEnabled: hasDownload
    }),
    actionContribution('file.new-tab', 'New tab', (kernel) => kernel.documents.createNewTab()),
    actionContribution('edit.undo', 'Undo', (kernel) => kernel.commands.undo(), {
      isEnabled: (kernel) => kernel.commands.canUndo()
    }),
    actionContribution('edit.redo', 'Redo', (kernel) => kernel.commands.redo(), {
      isEnabled: (kernel) => kernel.commands.canRedo()
    }),
    actionContribution('edit.copy-svg', 'Copy SVG text', (kernel) => void kernel.ui.copySvgText?.(), {
      isEnabled: hasCopySvgText
    }),
    actionContribution('edit.select-all', 'Select all', (kernel) => kernel.selection.selectAll()),
    modalActionContribution('command.palette', 'Command palette', 'command-palette'),
    actionContribution('view.zoom-in', 'Zoom in', (kernel) => kernel.viewport.zoomBy(Math.SQRT2)),
    actionContribution('view.zoom-out', 'Zoom out', (kernel) => kernel.viewport.zoomBy(1 / Math.SQRT2)),
    actionContribution('view.reset-zoom', 'Reset zoom', (kernel) => kernel.viewport.centerFrame()),
    actionContribution('view.toggle-grid', 'Toggle grid', (kernel) =>
      kernel.settings.setSettings((settings) => ({ ...settings, showGrid: !settings.showGrid }))
    ),
    actionContribution('view.toggle-handles', 'Toggle handles', (kernel) =>
      kernel.settings.setSettings((settings) => ({ ...settings, showHandles: !settings.showHandles }))
    ),
    modalActionContribution('help.settings', 'Settings', 'settings'),
    modalActionContribution('help.shortcuts', 'Shortcuts', 'shortcuts'),
    modalActionContribution('help.about', 'About', 'about'),
    modalActionContribution('help.donate', 'Donate', 'donate')
  ]
} as const satisfies ActionRegistryContribution;

function actionContribution(
  id: ActionContribution['id'],
  label: string,
  run: (kernel: EditorContributionContext) => void,
  options: Pick<ActionContribution, 'isEnabled'> = {}
): ActionContribution {
  return { id, label, run, ...options };
}

function modalActionContribution(
  id: ActionContribution['id'],
  label: string,
  modalId: Exclude<ModalId, undefined>,
  options: Pick<ActionContribution, 'isEnabled'> = {}
): ActionContribution {
  return { kind: 'modal', id, label, modalId, ...options };
}

function hasImportDialog(kernel: EditorContributionContext): boolean {
  return kernel.ui.svgImport !== undefined;
}

function hasDownload(kernel: EditorContributionContext): boolean {
  return kernel.ui.downloadSvg !== undefined;
}

function hasCopySvgText(kernel: EditorContributionContext): boolean {
  return kernel.ui.copySvgText !== undefined;
}
