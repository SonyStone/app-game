import type { LayerAction, LayerInfo } from '@app-game/paint-core/document';
import { closestCenter, createDragContext, createDraggable, createDroppable } from '@solid-primitives/drag-drop';
import { createEffect, createMemo, For, Show, untrack } from 'solid-js';
import { SketchIcon, type SketchIconName } from '../../shared/ui/SketchIcon';
import type { DocumentState } from './LayersPanel';
import styles from './LayersPanel.module.css';

/**
 * Shared scrollable layer list. The host owns thumbnail demand and may supply its own classes and compact rows.
 * Selection and order changes reveal the active row after DOM updates; unrelated reports preserve manual scrolling.
 */
export function LayerList(props: {
  state: DocumentState;
  ready: boolean;
  thumbnail?: (id: string) => string | undefined;
  onAction: (action: LayerAction) => void;
  shown?: (id: string) => boolean;
  classes?: typeof styles;
  narrow?: boolean;
}) {
  let list!: HTMLDivElement;
  const scrollTarget = createMemo(() =>
    JSON.stringify([props.state.activeId, props.state.layers.map((layer) => layer.id)])
  );
  createEffect(scrollTarget, () => {
    list.querySelector('[aria-current="true"]')?.parentElement?.scrollIntoView?.({ block: 'nearest' });
  });

  const drag = createDragContext({
    collisionDetection: closestCenter,
    onDragEnd(item, over) {
      const index = props.state.layers.findIndex((layer) => layer.id === over?.id);
      if (index >= 0 && over?.id !== item.id) {
        props.onAction({ type: 'reorder', id: String(item.id), index });
      }
    }
  });

  return (
    <drag.Provider>
      <div ref={list} class={(props.classes ?? styles).layerList}>
        <For
          each={[...props.state.layers].reverse().filter((layer) => props.shown?.(layer.id) ?? true)}
          keyed={(item) => item.id}
        >
          {(item) => (
            <LayerRow
              layer={item()}
              thumbnail={props.thumbnail?.(item().id)}
              selected={item().id === props.state.activeId}
              ready={props.ready}
              onAction={props.onAction}
              narrow={props.narrow}
              classes={props.classes ?? styles}
            />
          )}
        </For>
      </div>
    </drag.Provider>
  );
}

/** Commits nonempty names on blur or Enter, preserving the original on empty input. */
export function LayerName(props: { layer: LayerInfo; onAction: (action: LayerAction) => void; class?: string }) {
  return (
    <input
      class={props.class ?? styles.layerName}
      aria-label="Layer name"
      maxlength={64}
      value={props.layer.name}
      onChange={(e) => {
        const name = e.currentTarget.value.trim();
        if (!name) {
          // An empty name would leave the layer unlabelled in the list.
          e.currentTarget.value = props.layer.name;
          return;
        }

        if (name !== props.layer.name) {
          props.onAction({ type: 'update', id: props.layer.id, patch: { name } });
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/** Shared command identifiers for both Classic and LEGO layer controls. */
export type LayerCommand = 'add' | 'duplicate' | 'delete' | 'merge-down' | 'up' | 'down' | 'lock' | 'clip';

/** Resolves a layer command's availability, toggle state and undoable action from the current document. */
export function layerCommand(command: LayerCommand, state: DocumentState, ready: boolean) {
  const index = state.layers.findIndex((layer) => layer.id === state.activeId);
  const selected = state.layers[index]!;
  const below = state.layers[index - 1];
  const details = {
    add: { label: 'Add layer', icon: 'plus', disabled: !ready, action: { type: 'add' } },
    duplicate: {
      label: 'Duplicate layer',
      icon: 'copy',
      disabled: !ready,
      action: { type: 'duplicate', id: state.activeId }
    },
    delete: {
      label: 'Delete layer',
      icon: 'trash',
      disabled: !ready || state.layers.length <= 1,
      action: { type: 'delete', id: state.activeId }
    },
    'merge-down': {
      label: 'Merge down',
      icon: 'mergeDown',
      disabled: !ready || !below?.visible || !selected.visible,
      action: { type: 'merge-down', id: state.activeId }
    },
    up: {
      label: 'Move layer up',
      icon: 'up',
      disabled: !ready || index === state.layers.length - 1,
      action: { type: 'move', id: state.activeId, direction: 1 }
    },
    down: {
      label: 'Move layer down',
      icon: 'down',
      disabled: !ready || index === 0,
      action: { type: 'move', id: state.activeId, direction: -1 }
    },
    lock: {
      label: 'Lock transparent pixels',
      icon: selected.alphaLock ? 'lock' : 'unlock',
      disabled: false,
      pressed: !!selected.alphaLock,
      action: { type: 'update', id: state.activeId, patch: { alphaLock: !selected.alphaLock } }
    },
    clip: {
      label: 'Clip to layer below',
      icon: 'clip',
      disabled: false,
      pressed: !!selected.clipping,
      action: { type: 'update', id: state.activeId, patch: { clipping: !selected.clipping } }
    }
  } satisfies Record<
    LayerCommand,
    { label: string; icon: SketchIconName; disabled: boolean; pressed?: boolean; action: LayerAction }
  >;
  return details[command];
}

/**
 * One row of the layer list: visibility, selection and a grip that drags the row onto another row's position. The row
 * is a drop target of the panel's drag context; the grip is also keyboard-draggable (Space or Enter, arrows, then
 * Space or Enter). Rows are keyed by layer id, so the drag registration keeps the first id.
 */
function LayerRow(props: {
  layer: LayerInfo;
  thumbnail?: string;
  selected: boolean;
  ready: boolean;
  onAction: (action: LayerAction) => void;
  classes: typeof styles;
  narrow?: boolean;
}) {
  const id = untrack(() => props.layer.id);
  const grip = createDraggable(id, undefined, { disabled: () => !props.ready });
  const drop = createDroppable(id);
  const offset = () => grip.transform()?.y;

  return (
    <div
      ref={drop.ref}
      class={[
        props.classes.layer,
        {
          [props.classes.selected!]: props.selected,
          [props.classes.dragging!]: grip.isDragging(),
          [props.classes.clipped!]: !!props.layer.clipping,
          [props.classes.dropTarget!]: drop.isOver()
        }
      ]}
      style={{ transform: offset() === undefined ? undefined : `translateY(${offset()}px)` }}
    >
      <button
        class={props.classes.layerEye}
        aria-label={`${props.layer.visible ? 'Hide' : 'Show'} ${props.layer.name}`}
        onClick={() => props.onAction({ type: 'update', id: props.layer.id, patch: { visible: !props.layer.visible } })}
      >
        <SketchIcon name={props.layer.visible ? 'eye' : 'hidden'} size={18} />
      </button>
      <button
        class={props.classes.layerSelect}
        aria-label={`Select ${props.layer.name}`}
        aria-current={props.selected ? 'true' : undefined}
        onClick={() => props.onAction({ type: 'select', id: props.layer.id })}
      >
        <Show when={props.thumbnail} fallback={<SketchIcon name="paper" size={26} />}>
          {(src) => <img class={props.classes.layerThumbnail} src={src()} alt="" draggable={false} />}
        </Show>
        <Show when={!props.narrow}>
          <span>
            {props.layer.name}
            <small>
              {[props.layer.clipping ? 'Clipped' : 'Raster layer', props.layer.alphaLock ? 'transparency locked' : '']
                .filter(Boolean)
                .join(' · ')}
            </small>
          </span>
        </Show>
      </button>
      <span
        ref={grip.ref}
        class={props.classes.layerGrip}
        aria-label={`Reorder ${props.layer.name}`}
        title="Drag to reorder"
      >
        <SketchIcon name="grip" size={18} />
      </span>
    </div>
  );
}
