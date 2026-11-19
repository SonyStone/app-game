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
 * The drawing's file commands, which the File part opens beside itself: open a drawing (`.paint` or Photoshop), place
 * an image as a new layer, save the drawing, and export the visible canvas as PNG or every layer as PSD. Saved and
 * exported files are browser downloads, or land in Downloads/Paint in the Android app. Each command waits for the
 * engine; `onDone` closes the menu once one ran or a file was picked. After them, Options opens the editor's own
 * settings (`OptionsSheet`), which needs no engine. The commands are Settings rows
 * (`SettingsRows`), as every list of LEGO's panels.
 */
export function FileMenu(props: {
  ready: boolean;
  import: LegoServices['files']['import'];
  download: LegoServices['files']['download'];
  png: LegoServices['files']['png'];
  psd: LegoServices['files']['psd'];
  place: LegoServices['files']['place'];
  /** Opens the Options sheet. */
  options: LegoServices['options']['open'];
  onDone: () => void;
}) {
  const applicationControls = useContext(FileApplicationControls);
  let drawing!: HTMLInputElement;
  let image!: HTMLInputElement;
  const ready = () => props.ready;
  const run = (command: () => unknown) => {
    const result = command();
    props.onDone();

    return result;
  };

  return (
    <SettingsRows class={styles.fileMenu} role="menu" label="File">
      <input
        ref={drawing}
        type="file"
        accept=".paint,.psd,application/json,image/vnd.adobe.photoshop"
        hidden
        onChange={(event) => {
          const picked = takeFile(event.currentTarget);
          if (picked) {
            run(() => props.import(picked));
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
            run(() => props.place(picked));
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
        onSelect={() => run(props.download)}
      />
      <Item icon="scene" label="Export picture" detail="PNG" disabled={!ready()} onSelect={() => run(props.png)} />
      <Item icon="layers" label="Export layers" detail="PSD" disabled={!ready()} onSelect={() => run(props.psd)} />
      <Item icon="options" label="Options" disabled={false} onSelect={() => run(props.options)} />
      <Show when={applicationControls}>
        {(controls) => (
          <div class={appStyles.applicationGroup} role="group" aria-label="Paint app">
            {controls()()}
          </div>
        )}
      </Show>
    </SettingsRows>
  );
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
