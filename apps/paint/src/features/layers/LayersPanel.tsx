import type { BlendMode, createDocument, LayerAction } from '@app-game/paint-core/document';
import { For } from 'solid-js';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import styles from './LayersPanel.module.css';

/** Edits layer order, names and compositing properties, and duplicates layers, through undoable document commands. */
export function LayersPanel(props: {
  /** Document state reported by the engine; each report clones every layer record. */
  state: DocumentState;
  /** Adding, moving and deleting layers wait for the engine. */
  ready: boolean;
  onAction: (action: LayerAction) => void;
}) {
  const selected = () => props.state.layers.find((item) => item.id === props.state.activeId)!;
  /** Position of the selected layer, bottom first, for disabling moves past either end. */
  const selectedIndex = () => props.state.layers.findIndex((item) => item.id === props.state.activeId);

  return (
    <section class="paint-layers">
      <div class={styles.sectionHeading}>
        <span>
          {props.state.layers.length} {props.state.layers.length === 1 ? 'layer' : 'layers'}
        </span>
        <button
          aria-label="Duplicate layer"
          title="Duplicate selected layer"
          disabled={!props.ready}
          onClick={() => props.onAction({ type: 'duplicate', id: props.state.activeId })}
        >
          <SketchIcon name="copy" size={18} />
        </button>
        <button aria-label="Add layer" disabled={!props.ready} onClick={() => props.onAction({ type: 'add' })}>
          <SketchIcon name="plus" size={18} />
        </button>
      </div>
      <input
        class={styles.layerName}
        aria-label="Layer name"
        maxlength={64}
        value={selected().name}
        onChange={(e) => {
          const name = e.currentTarget.value.trim();
          if (!name) {
            // An empty name would leave the layer unlabelled in the list.
            e.currentTarget.value = selected().name;
            return;
          }

          if (name !== selected().name) {
            props.onAction({ type: 'update', id: props.state.activeId, patch: { name } });
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          }
        }}
      />
      <div class={styles.layerControls}>
        <select
          aria-label="Layer blend mode"
          value={selected().blend}
          onChange={(e) =>
            props.onAction({
              type: 'update',
              id: props.state.activeId,
              patch: { blend: e.currentTarget.value as BlendMode }
            })
          }
        >
          <option value="linear">Smooth color</option>
          <option value="normal">Normal (classic)</option>
          <option value="multiply">Multiply</option>
          <option value="screen">Screen</option>
          <option value="overlay">Overlay</option>
        </select>
        <input
          aria-label="Layer opacity"
          title="Layer opacity"
          type="number"
          min="0"
          max="100"
          value={Math.round(selected().opacity * 100)}
          onChange={(e) => {
            const percent = parsePercent(e.currentTarget.value);
            if (percent === undefined) {
              // An empty or invalid entry keeps the layer unchanged instead of hiding it at 0%.
              e.currentTarget.value = String(Math.round(selected().opacity * 100));
              return;
            }

            // Show the clamped value: when it equals the current opacity, the bound `value` does not change.
            e.currentTarget.value = String(Math.round(percent));
            props.onAction({ type: 'update', id: props.state.activeId, patch: { opacity: percent / 100 } });
          }}
        />
        <span>%</span>
      </div>
      <p class={styles.blendNote}>
        {selected().blend === 'multiply'
          ? 'Multiply darkens overlaps. Choose Smooth color for brighter color transitions.'
          : selected().blend === 'linear'
            ? 'Blends colors in linear light.'
            : 'Standard layer blend mode.'}
      </p>
      <div class={styles.layerList}>
        <For each={[...props.state.layers].reverse()} keyed={(item) => item.id}>
          {(item) => (
            <div class={[styles.layer, { [styles.selected!]: item().id === props.state.activeId }]}>
              <button
                class={styles.layerEye}
                aria-label={`${item().visible ? 'Hide' : 'Show'} ${item().name}`}
                onClick={() => props.onAction({ type: 'update', id: item().id, patch: { visible: !item().visible } })}
              >
                <SketchIcon name={item().visible ? 'eye' : 'hidden'} size={18} />
              </button>
              <button
                class={styles.layerSelect}
                aria-label={`Select ${item().name}`}
                aria-current={item().id === props.state.activeId ? 'true' : undefined}
                onClick={() => props.onAction({ type: 'select', id: item().id })}
              >
                <SketchIcon name="paper" size={26} />
                <span>
                  {item().name}
                  <small>Raster layer</small>
                </span>
              </button>
            </div>
          )}
        </For>
      </div>
      <div class={styles.layerActions}>
        <button
          aria-label="Move layer up"
          title="Move layer up"
          disabled={!props.ready || selectedIndex() === props.state.layers.length - 1}
          onClick={() => props.onAction({ type: 'move', id: props.state.activeId, direction: 1 })}
        >
          <SketchIcon name="up" size={18} />
        </button>
        <button
          aria-label="Move layer down"
          title="Move layer down"
          disabled={!props.ready || selectedIndex() === 0}
          onClick={() => props.onAction({ type: 'move', id: props.state.activeId, direction: -1 })}
        >
          <SketchIcon name="down" size={18} />
        </button>
        <button
          aria-label="Delete layer"
          title="Delete selected layer"
          disabled={!props.ready || props.state.layers.length <= 1}
          onClick={() => props.onAction({ type: 'delete', id: props.state.activeId })}
        >
          Delete
        </button>
      </div>
    </section>
  );
}

/** Clamps a typed percentage to [0, 100]; returns undefined for an empty or non-numeric entry. */
function parsePercent(text: string): number | undefined {
  const value = text.trim() === '' ? Number.NaN : Number(text);
  if (!Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(0, Math.min(100, value));
}

/** Layers, history and the active layer as reported by the engine. */
export type DocumentState = ReturnType<ReturnType<typeof createDocument>['state']>;
