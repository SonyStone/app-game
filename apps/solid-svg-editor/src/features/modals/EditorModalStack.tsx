import { Show, type Setter } from 'solid-js';

import type { AppSettings, ModalId } from '../../editor/types';
import type { ShortcutDescriptor } from '../shortcuts/shortcutRegistry';
import type { FormatterSettings } from '../../formatter';
import type { SvgElementNode } from '../../svg-model';
import type { ImportReview } from '../import/createImportReview';
import type { AlertMessage } from '../files/createFileBinding';
import {
  AboutModal,
  AlertModal,
  CloseTabModal,
  DonateModal,
  ExportModal,
  ImportProblemsModal,
  SettingsModal,
  ShortcutPanelConfigModal,
  ShortcutsModal
} from './EditorModals';

export function EditorModalStack(props: {
  readonly modal: ModalId;
  readonly settings: AppSettings;
  readonly setSettings: Setter<AppSettings>;
  readonly root: SvgElementNode;
  readonly exportText: string;
  /** Name of the active tab, used for export file names. */
  readonly tabName: string;
  readonly close: () => void;
  readonly reformatActiveCode: (formatter?: FormatterSettings) => void;
  /** Name of the unsaved tab waiting to close, shown by the `close-tab` dialog. */
  readonly pendingCloseTabName: string | undefined;
  readonly resolveCloseTab: (choice: 'save' | 'discard' | 'cancel') => void;
  /** The import held for review by the `import-problems` dialog. */
  readonly pendingImport: ImportReview | undefined;
  /** Paragraphs of the `alert` dialog. */
  readonly alertMessages: readonly AlertMessage[];
  /** Imports the held text (`true`) or drops it. */
  readonly resolveImport: (accept: boolean) => void;
  /** Editor shortcut actions, shown and edited by the Settings tab and the Shortcuts dialog. */
  readonly shortcuts: readonly ShortcutDescriptor[];
  readonly setShortcutBindings: Parameters<typeof SettingsModal>[0]['shortcuts']['setBindings'];
}) {

  return (
    <>
      <Show when={props.modal === 'settings'}>
        <SettingsModal
          settings={props.settings}
          setSettings={props.setSettings}
          close={props.close}
          reformatActiveCode={props.reformatActiveCode}
          shortcuts={{ descriptors: props.shortcuts, setBindings: props.setShortcutBindings }}
        />
      </Show>
      <Show when={props.modal === 'export'}>
        <ExportModal root={props.root} exportText={props.exportText} tabName={props.tabName} close={props.close} />
      </Show>
      <Show when={props.modal === 'about'}>
        <AboutModal close={props.close} />
      </Show>
      <Show when={props.modal === 'donate'}>
        <DonateModal close={props.close} />
      </Show>
      <Show when={props.modal === 'close-tab' ? props.pendingCloseTabName : undefined}>
        {(tabName) => (
          <CloseTabModal
            tabName={tabName()}
            save={() => props.resolveCloseTab('save')}
            discard={() => props.resolveCloseTab('discard')}
            close={() => props.resolveCloseTab('cancel')}
          />
        )}
      </Show>
      <Show when={props.modal === 'import-problems' ? props.pendingImport : undefined}>
        {(review) => <ImportProblemsModal review={review()} resolve={props.resolveImport} />}
      </Show>
      <Show when={props.modal === 'alert'}>
        <AlertModal messages={props.alertMessages} close={props.close} />
      </Show>
      <Show when={props.modal === 'shortcut-panel-config'}>
        <ShortcutPanelConfigModal
          panel={props.settings.shortcutPanel}
          setPanel={(update) => props.setSettings((settings) => ({ ...settings, shortcutPanel: update(settings.shortcutPanel) }))}
          descriptors={props.shortcuts}
          close={props.close}
        />
      </Show>
      <Show when={props.modal === 'shortcuts'}>
        <ShortcutsModal close={props.close} shortcuts={{ descriptors: props.shortcuts, setBindings: props.setShortcutBindings }} />
      </Show>
    </>
  );
}
