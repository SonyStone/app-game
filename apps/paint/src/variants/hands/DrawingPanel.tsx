import { Show } from 'solid-js';
import type { Side } from './geometry';
import sheet from './Sheet.module.css';

/**
 * The drawing tab: which hand is free (and so which edge the zone is on), the drawing's file commands (open, save,
 * export, insert an image), the view commands, the guide card again, and the link back to the Paint experiments when
 * there is one.
 */
export function DrawingPanel(props: {
  ready: boolean;
  side: Side;
  onSide: (side: Side) => void;
  /** Receives a chosen `.paint`, legacy JSON or Photoshop file. */
  onOpen: (file: File) => void;
  onInsertImage: (file: File) => void;
  onSave: () => void;
  onExport: (format: 'png' | 'psd') => void;
  onResetView: () => void;
  onFlipView: () => void;
  mirrored: boolean;
  fullscreen: { active: boolean; supported: boolean; toggle: () => void };
  onGuide: () => void;
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
      <section class={sheet.section}>
        <h2 class={sheet.sectionTitle}>Free hand</h2>
        <div class={sheet.segmented} role="radiogroup" aria-label="Free hand">
          <button role="radio" aria-checked={props.side === 'left' ? 'true' : 'false'} onClick={() => props.onSide('left')}>
            Left · pen in the right
          </button>
          <button
            role="radio"
            aria-checked={props.side === 'right' ? 'true' : 'false'}
            onClick={() => props.onSide('right')}
          >
            Right · pen in the left
          </button>
        </div>
      </section>
      <section class={sheet.section}>
        <h2 class={sheet.sectionTitle}>File</h2>
        <input
          ref={drawing}
          type="file"
          accept=".paint,.psd,application/json,image/vnd.adobe.photoshop"
          hidden
          onChange={(event) => picked(event, props.onOpen)}
        />
        <input ref={image} type="file" accept="image/*" hidden onChange={(event) => picked(event, props.onInsertImage)} />
        <button class={sheet.row} disabled={!props.ready} onClick={() => drawing.click()}>
          <span class={sheet.label}>Open…</span>
          <span class={sheet.detail}>.paint, .psd</span>
        </button>
        <button class={sheet.row} disabled={!props.ready} onClick={() => props.onSave()}>
          <span class={sheet.label}>Save</span>
          <span class={sheet.detail}>.paint</span>
        </button>
        <button class={sheet.row} disabled={!props.ready} onClick={() => props.onExport('psd')}>
          <span class={sheet.label}>Export layers</span>
          <span class={sheet.detail}>PSD</span>
        </button>
        <button class={sheet.row} disabled={!props.ready} onClick={() => props.onExport('png')}>
          <span class={sheet.label}>Export image</span>
          <span class={sheet.detail}>PNG</span>
        </button>
        <button class={sheet.row} disabled={!props.ready} onClick={() => image.click()}>
          <span class={sheet.label}>Insert image…</span>
          <span class={sheet.detail}>New layer</span>
        </button>
      </section>
      <section class={sheet.section}>
        <h2 class={sheet.sectionTitle}>View</h2>
        <button class={sheet.row} onClick={() => props.onResetView()}>
          <span class={sheet.label}>Reset view</span>
        </button>
        <button class={sheet.row} role="switch" aria-checked={props.mirrored ? 'true' : 'false'} onClick={() => props.onFlipView()}>
          <span class={sheet.label}>Flip view</span>
          <span class={sheet.switch} />
        </button>
        <Show when={props.fullscreen.supported}>
          <button
            class={sheet.row}
            role="switch"
            aria-checked={props.fullscreen.active ? 'true' : 'false'}
            onClick={() => props.fullscreen.toggle()}
          >
            <span class={sheet.label}>Full screen</span>
            <span class={sheet.switch} />
          </button>
        </Show>
      </section>
      <section class={sheet.section}>
        <button class={sheet.row} onClick={() => props.onGuide()}>
          <span class={sheet.label}>How the free hand works</span>
        </button>
        <Show when={props.experimentsHref}>
          {(href) => (
            <a class={sheet.row} href={href()}>
              <span class={sheet.label}>Paint experiments</span>
            </a>
          )}
        </Show>
      </section>
    </>
  );
}
