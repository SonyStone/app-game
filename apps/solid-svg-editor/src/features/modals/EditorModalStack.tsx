import { Show, type Setter } from 'solid-js';

import type { AppSettings, ModalId } from '../../editor/types';
import type { FormatterSettings } from '../../formatter';
import type { SvgElementNode } from '../../svg-model';
import { AboutModal, DonateModal, ExportModal, SettingsModal, ShortcutsModal } from './EditorModals';

export function EditorModalStack(props: {
  readonly modal: ModalId;
  readonly settings: AppSettings;
  readonly setSettings: Setter<AppSettings>;
  readonly root: SvgElementNode;
  readonly exportText: string;
  readonly close: () => void;
  readonly reformatActiveCode: (formatter?: FormatterSettings) => void;
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
      <Show when={props.modal === 'shortcuts'}>
        <ShortcutsModal close={props.close} />
      </Show>
    </>
  );
}
