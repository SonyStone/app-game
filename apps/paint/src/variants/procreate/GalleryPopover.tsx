import { Show } from 'solid-js';
import menu from './menu.module.css';
import { PopoverHeader } from './Popover';

/**
 * What the Gallery button opens in this variant. Paint keeps one drawing rather than a gallery, so the popover holds
 * the drawing's file commands instead: open a `.paint` or Photoshop file, save, export, insert an image as a new
 * layer, reset the view, and the link back to the Paint experiments when there is one.
 */
export function GalleryPopover(props: {
  ready: boolean;
  /** Receives a chosen `.paint`, legacy JSON or Photoshop file. */
  onOpen: (file: File) => void;
  onInsertImage: (file: File) => void;
  onSave: () => void;
  onExportPng: () => void;
  onExportPsd: () => void;
  onResetView: () => void;
  experimentsHref?: string;
}) {
  let drawing!: HTMLInputElement;
  let image!: HTMLInputElement;
  const picked = (event: Event & { currentTarget: HTMLInputElement }, use: (file: File) => void) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (file) {
      use(file);
    }
  };

  return (
    <>
      <PopoverHeader title="Drawing" />
      <input
        ref={drawing}
        type="file"
        accept=".paint,.psd,application/json,image/vnd.adobe.photoshop"
        hidden
        onChange={(event) => picked(event, props.onOpen)}
      />
      <input ref={image} type="file" accept="image/*" hidden onChange={(event) => picked(event, props.onInsertImage)} />
      <div class={menu.list}>
        <button class={menu.row} disabled={!props.ready} onClick={() => drawing.click()}>
          <span class={menu.label}>Open…</span>
          <span class={menu.detail}>.paint, .psd</span>
        </button>
        <button class={menu.row} disabled={!props.ready} onClick={() => props.onSave()}>
          <span class={menu.label}>Save</span>
          <span class={menu.detail}>.paint</span>
        </button>
        <button class={menu.row} disabled={!props.ready} onClick={() => props.onExportPsd()}>
          <span class={menu.label}>Export layers</span>
          <span class={menu.detail}>PSD</span>
        </button>
        <button class={menu.row} disabled={!props.ready} onClick={() => props.onExportPng()}>
          <span class={menu.label}>Export image</span>
          <span class={menu.detail}>PNG</span>
        </button>
        <button class={menu.row} disabled={!props.ready} onClick={() => image.click()}>
          <span class={menu.label}>Insert image…</span>
          <span class={menu.detail}>New layer</span>
        </button>
        <button class={menu.row} onClick={() => props.onResetView()}>
          <span class={menu.label}>Reset view</span>
        </button>
        <Show when={props.experimentsHref}>
          {(href) => (
            <a class={menu.row} href={href()}>
              <span class={menu.label}>Paint experiments</span>
            </a>
          )}
        </Show>
      </div>
    </>
  );
}
