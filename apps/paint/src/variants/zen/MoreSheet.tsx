import type { LayerAction } from '@app-game/paint-core/document';
import { For, Show } from 'solid-js';
import type { DocumentState } from '../../features/layers';
import { SketchIcon, type SketchIconName } from '../../shared/ui/SketchIcon';
import type { Hand } from './createZenSettings';
import styles from './ZenStudio.module.css';

/**
 * What the fan's "more" opens, without titles: the layers, top first, with the active one's commands under them;
 * then the drawing's file commands (export, save, open, insert an image); then brush import, the drawing hand, full
 * screen and the way back to the other variants. Layer changes are undoable document commands.
 */
export function MoreSheet(props: {
  state: DocumentState;
  /** Commands wait for the engine. */
  ready: boolean;
  onLayer: (action: LayerAction) => void;
  onExport: (format: 'png' | 'psd' | 'download') => void;
  /** Receives a chosen `.paint`, legacy JSON or Photoshop file. */
  onOpen: (file: File) => void;
  onInsertImage: (file: File) => void;
  onImportBrushes: () => void;
  hand: Hand;
  onHand: (hand: Hand) => void;
  fullscreen: { active: boolean; supported: boolean };
  onFullscreen: () => void;
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
  const topFirst = () => [...props.state.layers].reverse();
  const active = () => props.state.layers.find((layer) => layer.id === props.state.activeId);
  const activeIndex = () => props.state.layers.findIndex((layer) => layer.id === props.state.activeId);

  return (
    <>
      <input
        ref={(element) => (drawing = element)}
        type="file"
        accept=".paint,.psd,application/json,image/vnd.adobe.photoshop"
        hidden
        onChange={(event) => picked(event, props.onOpen)}
      />
      <input
        ref={(element) => (image = element)}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => picked(event, props.onInsertImage)}
      />
      <ul class={styles.layers} aria-label="Layers, top first">
        <For each={topFirst()} keyed={(layer) => layer.id}>
          {(layer) => {
            const isActive = () => layer().id === props.state.activeId;
            return (
              <li class={styles.layer} data-active={isActive() ? '' : undefined}>
                <button
                  class={styles.layerName}
                  aria-current={isActive() ? 'true' : undefined}
                  disabled={!props.ready}
                  onClick={() => props.onLayer({ type: 'select', id: layer().id })}
                >
                  {layer().name}
                </button>
                <button
                  class={styles.iconButton}
                  role="checkbox"
                  aria-checked={layer().visible ? 'true' : 'false'}
                  aria-label={`Show ${layer().name}`}
                  disabled={!props.ready}
                  onClick={() =>
                    props.onLayer({ type: 'update', id: layer().id, patch: { visible: !layer().visible } })
                  }
                >
                  <SketchIcon name={layer().visible ? 'eye' : 'hidden'} size={16} />
                </button>
              </li>
            );
          }}
        </For>
      </ul>
      <div class={styles.layerTools} role="toolbar" aria-label="Layer">
        <LayerButton
          icon="plus"
          label="New layer"
          disabled={!props.ready}
          onClick={() => props.onLayer({ type: 'add' })}
        />
        <Show when={active()}>
          {(layer) => (
            <>
              <LayerButton
                icon="up"
                label="Move up"
                disabled={!props.ready || activeIndex() >= props.state.layers.length - 1}
                onClick={() => props.onLayer({ type: 'move', id: layer().id, direction: 1 })}
              />
              <LayerButton
                icon="down"
                label="Move down"
                disabled={!props.ready || activeIndex() <= 0}
                onClick={() => props.onLayer({ type: 'move', id: layer().id, direction: -1 })}
              />
              <LayerButton
                icon="copy"
                label="Duplicate"
                disabled={!props.ready}
                onClick={() => props.onLayer({ type: 'duplicate', id: layer().id })}
              />
              <LayerButton
                icon="newLayer"
                label="Merge down"
                disabled={!props.ready || activeIndex() <= 0}
                onClick={() => props.onLayer({ type: 'merge-down', id: layer().id })}
              />
              <LayerButton
                icon="trash"
                label="Delete layer"
                disabled={!props.ready || props.state.layers.length <= 1}
                onClick={() => props.onLayer({ type: 'delete', id: layer().id })}
              />
            </>
          )}
        </Show>
      </div>
      <hr class={styles.rule} />
      <div class={styles.chips} role="group" aria-label="Export">
        <button class={styles.chip} disabled={!props.ready} onClick={() => props.onExport('png')}>
          PNG
        </button>
        <button class={styles.chip} disabled={!props.ready} onClick={() => props.onExport('psd')}>
          PSD
        </button>
        <button class={styles.chip} disabled={!props.ready} onClick={() => props.onExport('download')}>
          Save
        </button>
      </div>
      <button class={styles.row} disabled={!props.ready} onClick={() => drawing.click()}>
        <span>Open a drawing…</span>
        <small>.paint .psd</small>
      </button>
      <button class={styles.row} disabled={!props.ready} onClick={() => image.click()}>
        <span>Insert an image…</span>
      </button>
      <button class={styles.row} onClick={() => props.onImportBrushes()}>
        <span>Import brushes…</span>
        <small>.abr</small>
      </button>
      <hr class={styles.rule} />
      <div class={styles.chips} role="radiogroup" aria-label="Drawing hand">
        <For each={hands}>
          {(hand) => (
            <button
              class={styles.chip}
              role="radio"
              aria-checked={props.hand === hand.id ? 'true' : 'false'}
              onClick={() => props.onHand(hand.id)}
            >
              {hand.label}
            </button>
          )}
        </For>
      </div>
      <Show when={props.fullscreen.supported}>
        <button
          class={styles.row}
          role="switch"
          aria-checked={props.fullscreen.active ? 'true' : 'false'}
          onClick={() => props.onFullscreen()}
        >
          <span>Full screen</span>
          <small>{props.fullscreen.active ? 'on' : 'off'}</small>
        </button>
      </Show>
      <Show when={props.experimentsHref}>
        {(href) => (
          <a class={styles.row} href={href()}>
            <span>Other variants</span>
          </a>
        )}
      </Show>
    </>
  );
}

const hands: { id: Hand; label: string }[] = [
  { id: 'left', label: 'Left hand' },
  { id: 'right', label: 'Right hand' }
];

/** A small icon button of the active layer's commands. */
function LayerButton(props: { icon: SketchIconName; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      class={styles.iconButton}
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={() => props.onClick()}
    >
      <SketchIcon name={props.icon} size={16} />
    </button>
  );
}
