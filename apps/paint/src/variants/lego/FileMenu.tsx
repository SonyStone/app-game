import { SketchIcon, type SketchIconName } from '../../shared/ui/SketchIcon';
import type { LegoServices } from './LegoServices';
import styles from './LegoStudio.module.css';

/**
 * The drawing's file commands, which the File part opens beside itself: open a drawing (`.paint` or Photoshop), place
 * an image as a new layer, save the drawing, and export the visible canvas as PNG or every layer as PSD. Saved and
 * exported files are browser downloads, or land in Downloads/Paint in the Android app. Each command waits for the
 * engine; `onDone` closes the menu once one ran or a file was picked.
 */
export function FileMenu(props: {
  ready: boolean;
  edit: LegoServices['files']['edit'];
  place: LegoServices['files']['place'];
  onDone: () => void;
  run: (command: () => unknown) => void;
}) {
  let drawing!: HTMLInputElement;
  let image!: HTMLInputElement;
  const ready = () => props.ready;
  const run = (command: () => unknown) =>
    props.run(() => {
      const result = command();
      props.onDone();
      return result;
    });

  return (
    <div class={styles.fileMenu} role="menu" aria-label="File">
      <input
        ref={drawing}
        type="file"
        accept=".paint,.psd,application/json,image/vnd.adobe.photoshop"
        hidden
        onChange={(event) => {
          const picked = takeFile(event.currentTarget);
          if (picked) {
            run(() => props.edit({ type: 'import', file: picked }));
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
        onSelect={() => props.run(() => drawing.click())}
      />
      <Item
        icon="newLayer"
        label="Place image"
        detail="New layer"
        disabled={!ready()}
        onSelect={() => props.run(() => image.click())}
      />
      <Item
        icon="check"
        label="Save drawing"
        detail=".paint"
        disabled={!ready()}
        onSelect={() => run(() => props.edit({ type: 'download' }))}
      />
      <Item
        icon="scene"
        label="Export picture"
        detail="PNG"
        disabled={!ready()}
        onSelect={() => run(() => props.edit({ type: 'png' }))}
      />
      <Item
        icon="layers"
        label="Export layers"
        detail="PSD"
        disabled={!ready()}
        onSelect={() => run(() => props.edit({ type: 'psd' }))}
      />
    </div>
  );
}

function Item(props: { icon: SketchIconName; label: string; detail: string; disabled: boolean; onSelect: () => void }) {
  return (
    <button type="button" role="menuitem" disabled={props.disabled} onClick={() => props.onSelect()}>
      <SketchIcon name={props.icon} size={20} />
      <span>{props.label}</span>
      <small>{props.detail}</small>
    </button>
  );
}

/** The file picked in `input`, if any; the input is emptied so the same file can be picked again. */
function takeFile(input: HTMLInputElement) {
  const file = input.files?.[0];
  input.value = '';
  return file;
}
