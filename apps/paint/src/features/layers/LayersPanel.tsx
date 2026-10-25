import type { createDocument, LayerAction } from '@app-game/paint-core/document';
import { Show } from 'solid-js';
import { ScrubNumber } from '../../shared/ui/ScrubNumber';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import { BlendModePicker } from './BlendModePicker';
import { layerCommand, LayerList, LayerName, type LayerCommand } from './LayerControls';
import styles from './LayersPanel.module.css';

/**
 * Edits layer order, names, compositing properties, alpha lock and clipping, and duplicates and merges layers,
 * through undoable document commands.
 */
export function LayersPanel(props: {
  /** Document state reported by the engine; each report clones every layer record. */
  state: DocumentState;
  /** Adding, moving and deleting layers wait for the engine. */
  ready: boolean;
  /** Uses a compact header, a settings menu and icon footer, filling the host's height with a scrolling list. Defaults to false. */
  fillContainer?: boolean;
  /** Read-only thumbnail URL lookup. The caller owns acquiring and releasing the image resource. */
  thumbnail?: (id: string) => string | undefined;
  onAction: (action: LayerAction) => void;
  /** Makes every layer blend in linear light ("Smooth color") or in encoded sRGB; a setting of the document. */
  onLinearBlending: (linear: boolean) => void;
  /**
   * Leaves layers out of the list, such as those without paint in view: `shown` says which are listed, `offScreen`
   * how many the filter leaves out, and a button switches `showAll`. `where` ends the button's label, such as
   * "in view". Omitted, every layer is listed.
   */
  filter?: {
    shown: (id: string) => boolean;
    where: string;
    offScreen: number;
    showAll: boolean;
    onShowAllChange: (showAll: boolean) => void;
  };
}) {
  const command = (name: LayerCommand) => layerCommand(name, props.state, props.ready);
  const selected = () => props.state.layers.find((item) => item.id === props.state.activeId)!;

  return (
    <section class={['paint-layers', { [styles.fillContainer!]: props.fillContainer }]}>
      <div class={styles.panelHeader}>
        <div class={styles.sectionHeading}>
          <span>
            {props.state.layers.length} {props.state.layers.length === 1 ? 'layer' : 'layers'}
          </span>
          <button
            aria-label="Duplicate layer"
            title="Duplicate selected layer"
            disabled={!props.ready}
            onClick={() => props.onAction(command('duplicate').action)}
          >
            <SketchIcon name="copy" size={18} />
          </button>
          <button aria-label="Add layer" disabled={!props.ready} onClick={() => props.onAction(command('add').action)}>
            <SketchIcon name="plus" size={18} />
          </button>
        </div>
        <LayerName layer={selected()} onAction={props.onAction} />
        <Show when={props.fillContainer}>
          <details class={styles.moreSettings}>
            <summary aria-label="Layer settings" title="Layer settings">
              <SketchIcon name="more" size={18} />
            </summary>
            <div class={styles.settingsMenu}>
              <SmoothColor linear={props.state.linearBlending} onChange={props.onLinearBlending} />
            </div>
          </details>
        </Show>
      </div>
      <div class={styles.layerControls}>
        <BlendModePicker
          mode={selected().blend}
          linear={props.state.linearBlending}
          onChange={(blend) => props.onAction({ type: 'update', id: props.state.activeId, patch: { blend } })}
        />
        <ScrubNumber
          label="Layer opacity"
          min={0}
          max={100}
          unit="%"
          value={Math.round(selected().opacity * 100)}
          onChange={(percent) =>
            props.onAction({ type: 'update', id: props.state.activeId, patch: { opacity: percent / 100 } })
          }
        />
        <button
          class={styles.layerToggle}
          aria-label="Lock transparent pixels"
          title="Lock transparent pixels: paint only recolors existing pixels"
          aria-pressed={selected().alphaLock ? 'true' : 'false'}
          onClick={() => props.onAction(command('lock').action)}
        >
          <SketchIcon name={selected().alphaLock ? 'lock' : 'unlock'} size={18} />
        </button>
        <button
          class={styles.layerToggle}
          aria-label="Clip to layer below"
          title="Clip to layer below: show this layer only where the layer below has pixels"
          aria-pressed={selected().clipping ? 'true' : 'false'}
          onClick={() => props.onAction(command('clip').action)}
        >
          <SketchIcon name="clip" size={18} />
        </button>
      </div>
      <Show when={!props.fillContainer}>
        <SmoothColor linear={props.state.linearBlending} onChange={props.onLinearBlending} />
      </Show>
      <LayerList
        state={props.state}
        ready={props.ready}
        thumbnail={props.thumbnail}
        onAction={props.onAction}
        shown={props.filter?.shown}
      />
      <Show when={props.filter && props.filter.offScreen > 0 && props.filter}>
        {(filter) => (
          <button class={styles.offScreen} onClick={() => filter().onShowAllChange(!filter().showAll)}>
            {filter().showAll ? 'Hide' : 'Show'} {filter().offScreen} {filter().offScreen === 1 ? 'layer' : 'layers'}{' '}
            without paint {filter().where}
          </button>
        )}
      </Show>
      <div class={styles.layerActions}>
        <button
          aria-label="Move layer up"
          title="Move layer up"
          disabled={command('up').disabled}
          onClick={() => props.onAction(command('up').action)}
        >
          <SketchIcon name="up" size={18} />
        </button>
        <button
          aria-label="Move layer down"
          title="Move layer down"
          disabled={command('down').disabled}
          onClick={() => props.onAction(command('down').action)}
        >
          <SketchIcon name="down" size={18} />
        </button>
        <button
          aria-label="Merge down"
          title="Merge the selected layer into the layer below"
          disabled={command('merge-down').disabled}
          onClick={() => props.onAction(command('merge-down').action)}
        >
          <Show when={props.fillContainer} fallback="Merge down">
            <SketchIcon name="layers" size={18} />
          </Show>
        </button>
        <button
          aria-label="Delete layer"
          title="Delete selected layer"
          disabled={command('delete').disabled}
          onClick={() => props.onAction(command('delete').action)}
        >
          <Show when={props.fillContainer} fallback="Delete">
            <SketchIcon name="trash" size={18} />
          </Show>
        </button>
      </div>
    </section>
  );
}

/** Document-wide blending preference, shared by the full header and compact settings menu. */
function SmoothColor(props: { linear: boolean; onChange: (linear: boolean) => void }) {
  return (
    <label
      class={styles.smoothColor}
      title="Blend every layer, in every mode, in linear light: brighter mixes without dark edges, as Photoshop's “Blend RGB colors using gamma 1.0”. Saved with the drawing."
    >
      <input type="checkbox" checked={props.linear} onChange={(event) => props.onChange(event.currentTarget.checked)} />
      Smooth color for all layers
    </label>
  );
}

/** Layers, history and the active layer as reported by the engine. */
export type DocumentState = ReturnType<ReturnType<typeof createDocument>['state']>;
