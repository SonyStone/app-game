import type { PsdDocumentFonts, PsdFontInfo } from '@app-game/psd/viewer';
import { For, Show } from 'solid-js';
import { ariaState } from '../shared/format';
import type { FontRefusal } from './createFonts';
import styles from './fonts.module.css';

/**
 * The open document's fonts with their status in the library, the ways to add fonts (installed fonts through the Local
 * Font Access API where the browser offers it, and font files), and the "Re-render text" switch. The switch can be
 * turned on only once every font the type layers use is present; it can always be turned off.
 */
export function FontsPanel(props: {
  report: PsdDocumentFonts;
  library: readonly PsdFontInfo[];
  /** Whether type layers re-render from their text: the `typeLayers` render setting. */
  reRender: boolean;
  onReRender: (enabled: boolean) => void;
  /** Whether the library holds every font the document's type layers use. */
  ready: boolean;
  missing: readonly string[];
  /** Whether fonts are being read or added. */
  adding: boolean;
  refusals: readonly FontRefusal[];
  canUseInstalled: boolean;
  /** Called in the click, so the browser sees the user's activation. */
  onUseInstalled: () => void;
  onFiles: (files: File[]) => void;
}) {
  let input!: HTMLInputElement;
  const unreadable = () => props.report.layers.filter((layer) => layer.error);

  return (
    <section class={styles.panel} aria-label="Fonts" aria-busy={ariaState(props.adding)}>
      <header>
        <h2>Fonts</h2>
        <span title={props.library.map((font) => font.name).join('\n')}>{props.library.length} in library</span>
      </header>
      <ul class={styles.fonts} aria-label="Document fonts">
        <For each={props.report.fonts}>
          {(font) => (
            <li data-font-status={font.available ? 'available' : 'missing'}>
              <span class={styles.name} title={`Used by ${layerNames(props.report, font.layers)}`}>
                {font.name}
              </span>
              <span class={font.available ? styles.available : styles.missing}>
                {font.available ? 'available' : 'missing'}
              </span>
            </li>
          )}
        </For>
      </ul>
      <Show when={unreadable().length}>
        <ul class={styles.refusals} aria-label="Unreadable type layers">
          <For each={unreadable()}>
            {(layer) => (
              <li>
                {layer.name || '(unnamed)'}: {layer.error}
              </li>
            )}
          </For>
        </ul>
      </Show>
      <div class={styles.actions}>
        <button
          type="button"
          disabled={!props.canUseInstalled || !props.missing.length || props.adding}
          title={
            props.canUseInstalled
              ? 'Ask the browser for the installed fonts this document is missing (Local Font Access)'
              : 'This browser does not offer Local Font Access; add font files instead'
          }
          onClick={() => props.onUseInstalled()}
        >
          Use installed fonts
        </button>
        <button type="button" disabled={props.adding} onClick={() => input.click()}>
          Add font files…
        </button>
        <input
          ref={(element) => (input = element)}
          type="file"
          accept=".ttf,.otf,font/ttf,font/otf"
          multiple
          hidden
          aria-label="Font files"
          onChange={(event) => {
            props.onFiles([...(event.currentTarget.files ?? [])]);
            event.currentTarget.value = '';
          }}
        />
      </div>
      <label title="Re-render type layers from their text with these fonts instead of the rasters Photoshop cached, exact where Photoshop's text rendering is verified. A layer the renderer does not reproduce fails the render with the reason, or with Approximate keeps its cached raster and is listed below the canvas.">
        <input
          type="checkbox"
          checked={props.reRender}
          disabled={!props.ready && !props.reRender}
          onChange={(event) => props.onReRender(event.currentTarget.checked)}
        />
        Re-render text
      </label>
      <Show when={props.refusals.length}>
        <ul class={styles.refusals} aria-label="Fonts not added">
          <For each={props.refusals}>
            {(refusal) => (
              <li>
                {refusal.file}: {refusal.reason}
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  );
}

/** The names of the type layers of records `indices`, for a tooltip. */
function layerNames(report: PsdDocumentFonts, indices: readonly number[]) {
  return indices
    .map((index) => report.layers.find((layer) => layer.index === index)?.name || `record ${index}`)
    .join(', ');
}
