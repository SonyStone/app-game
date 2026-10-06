import { Show, type Setter } from 'solid-js';

import type { AppSettings, ModalId } from '../../editor/types';
import type { FormatterSettings } from '../../formatter';
import type { SvgElementNode } from '../../svg-model';
import { AboutModal, CloseTabModal, DonateModal, ExportModal, SettingsModal, ShortcutsModal } from './EditorModals';

export function EditorModalStack(props: {
  readonly modal: ModalId;
  readonly settings: AppSettings;
  readonly setSettings: Setter<AppSettings>;
  readonly root: SvgElementNode;
  readonly exportText: string;
  readonly close: () => void;
  readonly reformatActiveCode: (formatter?: FormatterSettings) => void;
  /** Name of the unsaved tab waiting to close, shown by the `close-tab` dialog. */
  readonly pendingCloseTabName: string | undefined;
  readonly resolveCloseTab: (choice: 'save' | 'discard' | 'cancel') => void;
}) {
  return (
    <>
      <Show when={props.modal === 'settings'}>
        <SettingsModal
          settings={props.settings}
          setSettings={props.setSettings}
          close={props.close}
          reformatActiveCode={props.reformatActiveCode}
        />
      </Show>
      <Show when={props.modal === 'export'}>
        <ExportModal root={props.root} exportText={props.exportText} close={props.close} />
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
      <Show when={props.modal === 'shortcuts'}>
        <ShortcutsModal close={props.close} />
      </Show>
    </>
  );
}
