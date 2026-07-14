import type { EditorContribution, ModalContribution } from '../../editor/kernel';
import type { EditorPanelContext } from '../panels/panelRegistry';
import { shortcutItemsFromShortcuts } from '../shortcuts/shortcutRegistry';
import { AboutModal, CommandPaletteModal, DonateModal, ExportModal, SettingsModal, ShortcutsModal } from './EditorModals';

export type ModalRegistryContribution = EditorContribution<EditorPanelContext> & {
  readonly modals: readonly ModalContribution<EditorPanelContext>[];
};

export const coreModalContribution = {
  id: 'core.modals',
  modals: [
    {
      id: 'settings',
      render: (context) => (
        <SettingsModal
          close={context.close}
          sections={context.kernel.registries.settingsSections}
          context={{ kernel: context.kernel }}
        />
      )
    },
    {
      id: 'export',
      render: (context) => (
        <ExportModal
          root={context.kernel.documents.activeRoot()}
          exportText={context.kernel.documents.exportText()}
          close={context.close}
        />
      )
    },
    {
      id: 'about',
      render: (context) => <AboutModal close={context.close} />
    },
    {
      id: 'donate',
      render: (context) => <DonateModal close={context.close} />
    },
    {
      id: 'shortcuts',
      render: (context) => (
        <ShortcutsModal
          close={context.close}
          shortcutItems={shortcutItemsFromShortcuts(context.kernel.registries.shortcuts)}
        />
      )
    },
    {
      id: 'command-palette',
      render: (context) => <CommandPaletteModal kernel={context.kernel} close={context.close} />
    }
  ]
} as const satisfies ModalRegistryContribution;
