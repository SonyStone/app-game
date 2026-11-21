import type { JSX } from '@solidjs/web';
import { createContext, Show, useContext } from 'solid-js';
import { SettingsRow, SettingsRows } from '../../shared/ui/SettingsList';
import type { SketchIconName } from '../../shared/ui/SketchIcon';
import appStyles from './FileMenu.module.css';
import type { LegoServices } from './LegoServices';
import styles from './LegoStudio.module.css';

/** Optional host content for the last File menu group; embedded studios leave it empty. */
export const FileApplicationControls = createContext<(() => JSX.Element) | null>(null);

/**
 * The drawing's file commands, which the File part opens beside itself: `FileCommands`, then Edit layout, which enters
 * board edit mode, and Options, which opens the unified Parts & Options dialog on Interface (`PartsTray`), neither
 * needing the engine. `onDone` closes the menu once a command ran or a file was picked. The commands are Settings
 * rows (`SettingsRows`), as every list of LEGO's panels.
 */
export function FileMenu(
  props: FileCommandSet & {
    /** Enters LEGO layout edit mode. */
    editLayout: LegoServices['options']['editLayout'];
    /** Opens the Options sheet. */
    options: LegoServices['options']['open'];
    onDone: () => void;
  }
) {
  return (
    <SettingsRows class={styles.fileMenu} role="menu" label="File">
      <FileCommands commands={props} onDone={() => props.onDone()}>
        <Item icon="edit" label="Edit layout" disabled={false} onSelect={() => done(props.editLayout, props.onDone)} />
        <Item icon="options" label="Options" disabled={false} onSelect={() => done(props.options, props.onDone)} />
      </FileCommands>
    </SettingsRows>
  );
}

/**
 * The file commands as menu rows, shared by the File part's menu and the File section of Parts & Options: open a
 * drawing (`.paint` or Photoshop), place an image as a new layer, save the drawing, and export the visible canvas as
 * PNG or every layer as PSD. Saved and exported files are browser downloads, or land in Downloads/Paint in the Android
 * app. Each command waits for the engine (`ready`); `onDone` runs once one ran or a file was picked. `children` are the
 * host's own rows after the commands, and the host's `FileApplicationControls`, when given, come last. Lay it inside a
 * `SettingsRows` of role `menu`.
 */
export function FileCommands(props: { commands: FileCommandSet; onDone: () => void; children?: JSX.Element }) {
  const applicationControls = useContext(FileApplicationControls);
  let drawing!: HTMLInputElement;
  let image!: HTMLInputElement;
  const ready = () => props.commands.ready;
  const run = (command: () => unknown) => done(command, props.onDone);

  return (
    <>
      <input
        ref={drawing}
        type="file"
        accept=".paint,.psd,application/json,image/vnd.adobe.photoshop"
        hidden
        onChange={(event) => {
          const picked = takeFile(event.currentTarget);
          if (picked) {
            run(() => props.commands.import(picked));
          }
        }}
      />
      <input
        ref={image}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const picked = takeFile(event.currentTarget);
          if (picked) {
            run(() => props.commands.place(picked));
          }
        }}
      />
      <Item
        icon="paper"
        label="Open drawing"
        detail=".paint, .psd"
        disabled={!ready()}
        onSelect={() => drawing.click()}
      />
      <Item icon="newLayer" label="Place image" detail="New layer" disabled={!ready()} onSelect={() => image.click()} />
      <Item
        icon="check"
        label="Save drawing"
        detail=".paint"
        disabled={!ready()}
        onSelect={() => run(() => props.commands.download())}
      />
      <Item
        icon="scene"
        label="Export picture"
        detail="PNG"
        disabled={!ready()}
        onSelect={() => run(() => props.commands.png())}
      />
      <Item
        icon="layers"
        label="Export layers"
        detail="PSD"
        disabled={!ready()}
        onSelect={() => run(() => props.commands.psd())}
      />
      {props.children}
      <Show when={applicationControls}>
        {(controls) => (
          <div class={appStyles.applicationGroup} role="group" aria-label="Paint app">
            {controls()()}
          </div>
        )}
      </Show>
    </>
  );
}

/**
 * What `FileCommands` runs: whether the engine is ready, and the commands, each already guarded by the host (a part's
 * `frame.command`, or `services.run`) so failures reach the session's error notice.
 */
export type FileCommandSet = {
  readonly ready: boolean;
  import: (file: File) => unknown;
  download: () => unknown;
  png: () => unknown;
  psd: () => unknown;
  place: (file: File) => unknown;
};

/** Runs `command`, then `onDone`, returning what the command returned. */
function done(command: () => unknown, onDone: () => void) {
  const result = command();
  onDone();

  return result;
}

/** A command of the menu: a Settings row with its icon, name and what it makes, if anything, as the trailing text. */
function Item(props: {
  icon: SketchIconName;
  label: string;
  detail?: string;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <SettingsRow
      id={props.label}
      role="menuitem"
      icon={props.icon}
      label={props.label}
      trailing={props.detail}
      disabled={props.disabled}
      onSelect={() => props.onSelect()}
    />
  );
}

/** The file picked in `input`, if any; the input is emptied so the same file can be picked again. */
function takeFile(input: HTMLInputElement) {
  const file = input.files?.[0];
  input.value = '';
  return file;
}
