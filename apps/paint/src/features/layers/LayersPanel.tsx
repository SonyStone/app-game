import type { BlendMode, createDocument, LayerAction, LayerInfo } from '@app-game/paint-core/document';
import { closestCenter, createDragContext, createDraggable, createDroppable } from '@solid-primitives/drag-drop';
import { For, untrack } from 'solid-js';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import styles from './LayersPanel.module.css';

/**
 * Edits layer order, names and compositing properties, and duplicates and merges layers, through undoable document
 * commands.
 */
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
  // Dropping a row's grip on another row moves the layer to that row's position.
  const drag = createDragContext({
    collisionDetection: closestCenter,
    onDragEnd(item, over) {
      const index = props.state.layers.findIndex((layer) => layer.id === over?.id);
      if (index >= 0 && over?.id !== item.id) {
        props.onAction({ type: 'reorder', id: String(item.id), index });
      }
    }
  });
  /** A visible layer can be merged into a visible layer below it. */
  const canMergeDown = () => {
    const below = props.state.layers[selectedIndex() - 1];
    return below !== undefined && below.visible && selected().visible;
  };

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
      <drag.Provider>
        <div class={styles.layerList}>
          <For each={[...props.state.layers].reverse()} keyed={(item) => item.id}>
            {(item) => (
              <LayerRow
                layer={item()}
                selected={item().id === props.state.activeId}
                ready={props.ready}
                onAction={props.onAction}
              />
            )}
          </For>
        </div>
      </drag.Provider>
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
          title="Merge the selected layer into the layer below"
          disabled={!props.ready || !canMergeDown()}
          onClick={() => props.onAction({ type: 'merge-down', id: props.state.activeId })}
        >
          Merge down
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

/**
 * One row of the layer list: visibility, selection and a grip that drags the row onto another row's position. The row
 * is a drop target of the panel's drag context; the grip is also keyboard-draggable (Space or Enter, arrows, then
 * Space or Enter). Rows are keyed by layer id, so the drag registration keeps the first id.
 */
function LayerRow(props: {
  layer: LayerInfo;
  selected: boolean;
  ready: boolean;
  onAction: (action: LayerAction) => void;
}) {
  const id = untrack(() => props.layer.id);
  const grip = createDraggable(id, undefined, { disabled: () => !props.ready });
  const drop = createDroppable(id);
  const offset = () => grip.transform()?.y;

  return (
    <div
      ref={drop.ref}
      class={[
        styles.layer,
        {
          [styles.selected!]: props.selected,
          [styles.dragging!]: grip.isDragging(),
          [styles.dropTarget!]: drop.isOver()
        }
      ]}
      style={{ transform: offset() === undefined ? undefined : `translateY(${offset()}px)` }}
    >
      <button
        class={styles.layerEye}
        aria-label={`${props.layer.visible ? 'Hide' : 'Show'} ${props.layer.name}`}
        onClick={() => props.onAction({ type: 'update', id: props.layer.id, patch: { visible: !props.layer.visible } })}
      >
        <SketchIcon name={props.layer.visible ? 'eye' : 'hidden'} size={18} />
      </button>
      <button
        class={styles.layerSelect}
        aria-label={`Select ${props.layer.name}`}
        aria-current={props.selected ? 'true' : undefined}
        onClick={() => props.onAction({ type: 'select', id: props.layer.id })}
      >
        <SketchIcon name="paper" size={26} />
        <span>
          {props.layer.name}
          <small>Raster layer</small>
        </span>
      </button>
      <span ref={grip.ref} class={styles.layerGrip} aria-label={`Reorder ${props.layer.name}`} title="Drag to reorder">
        <SketchIcon name="grip" size={18} />
      </span>
    </div>
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
