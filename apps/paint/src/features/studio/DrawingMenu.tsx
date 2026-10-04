import type { JSX } from '@solidjs/web';
import { Show } from 'solid-js';
import styles from './PaintStudio.module.css';

/**
 * Drawing panel: open, save and export the drawing, place an image as a new layer, reset the view, developer tools and
 * host controls.
 */
export function DrawingMenu(props: {
  /** File commands wait for the engine. */
  ready: boolean;
  /** Receives a chosen `.paint`, legacy JSON or Photoshop file. */
  onOpen: (file: File) => void;
  /** Receives a chosen image file to place as a new layer. */
  onPlaceImage: (file: File) => void;
  onSave: () => void;
  onExportPng: () => void;
  /** Exports every layer of the drawn area as a Photoshop document. */
  onExportPsd: () => void;
  onResetView: () => void;
  onDeveloper: () => void;
  /** Host-specific controls, such as PWA installation. */
  applicationControls?: JSX.Element;
  /** Link back to the embedding playground. */
  experimentsHref?: string;
}) {
  let file!: HTMLInputElement;
  let image!: HTMLInputElement;

  return (
    <>
      <input
        ref={file}
        type="file"
        accept=".paint,.psd,application/json,image/vnd.adobe.photoshop"
        hidden
        onChange={(event) => {
          const input = event.currentTarget;
          const picked = input.files?.[0];
          input.value = '';
          if (picked) {
            props.onOpen(picked);
          }
        }}
      />
      <input
        ref={image}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const input = event.currentTarget;
          const picked = input.files?.[0];
          input.value = '';
          if (picked) {
            props.onPlaceImage(picked);
          }
        }}
      />
      <div class={styles.fileActions}>
        <button disabled={!props.ready} onClick={() => file.click()}>
          Open drawing<span>.paint, .psd</span>
        </button>
        <button disabled={!props.ready} onClick={() => image.click()}>
          Place image<span>New layer</span>
        </button>
        <button disabled={!props.ready} onClick={() => props.onSave()}>
          Save drawing<span>.paint</span>
        </button>
        <button disabled={!props.ready} onClick={() => props.onExportPng()}>
          Export visible canvas<span>PNG</span>
        </button>
        <button disabled={!props.ready} onClick={() => props.onExportPsd()}>
          Export layers<span>PSD</span>
        </button>
        <button onClick={() => props.onResetView()}>Reset view</button>
        <button onClick={() => props.onDeveloper()}>Developer</button>
        {props.applicationControls}
        <Show when={props.experimentsHref}>{(href) => <a href={href()}>Paint experiments</a>}</Show>
      </div>
      <p class={styles.panelNote}>
        B · Brush &nbsp; E · Eraser &nbsp; L · Lasso
        <br />
        X · Swap colors &nbsp; D · Reset colors
        <br />
        Space or V · Navigation
      </p>
    </>
  );
}
