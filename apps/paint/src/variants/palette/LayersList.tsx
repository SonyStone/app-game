import type { BlendMode, LayerAction } from '@app-game/paint-core/document';
import { For, Show } from 'solid-js';
import type { DocumentState } from '../../features/layers/LayersPanel';
import { ScrubNumber } from '../../shared/ui/ScrubNumber';
import { SketchIcon, type SketchIconName } from '../../shared/ui/SketchIcon';
import styles from './LayersList.module.css';

/**
 * The drawing's layers, top first, for the Layers popover: a row per layer with its visibility and name, a tap
 * making it active. The active layer's settings follow the list: opacity, blend mode, alpha lock and clipping, and
 * duplicate, merge down, move and delete. Every change is an undoable document command.
 */
export function LayersList(props: {
  state: DocumentState;
  /** Commands wait for the engine. */
  ready: boolean;
  onAction: (action: LayerAction) => void;
}) {
  const topFirst = () => [...props.state.layers].reverse();
  const active = () => props.state.layers.find((layer) => layer.id === props.state.activeId);
  /** The active layer's position counted from the bottom, as layer commands count. */
  const fromBottom = () => props.state.layers.findIndex((layer) => layer.id === props.state.activeId);

  return (
    <div class={styles.layers}>
      <header class={styles.header}>
        <h2>Layers</h2>
        <button
          class={styles.iconButton}
          aria-label="Add a layer"
          title="Add a layer"
          disabled={!props.ready}
          onClick={() => props.onAction({ type: 'add' })}
        >
          <SketchIcon name="plus" size={18} />
        </button>
      </header>
      <ul class={styles.list} aria-label="Layers, top first">
        <For each={topFirst()} keyed={(layer) => layer.id}>
          {(layer) => (
            <li class={styles.row} data-active={layer().id === props.state.activeId ? 'true' : undefined}>
              <button
                class={styles.visibility}
                role="checkbox"
                aria-checked={layer().visible ? 'true' : 'false'}
                aria-label={`Show ${layer().name}`}
                title={layer().visible ? 'Hide' : 'Show'}
                disabled={!props.ready}
                onClick={() => props.onAction({ type: 'update', id: layer().id, patch: { visible: !layer().visible } })}
              >
                <SketchIcon name={layer().visible ? 'eye' : 'hidden'} size={16} />
              </button>
              <button
                class={styles.name}
                aria-current={layer().id === props.state.activeId ? 'true' : undefined}
                disabled={!props.ready}
                onClick={() => props.onAction({ type: 'select', id: layer().id })}
              >
                <span>{layer().name}</span>
                <small>
                  {[
                    layer().clipping && 'clip',
                    layer().alphaLock && 'lock',
                    layer().blend !== 'normal' && blendNames[layer().blend],
                    layer().opacity < 1 && `${Math.round(layer().opacity * 100)}%`
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
              </button>
            </li>
          )}
        </For>
      </ul>
      <Show when={active()}>
        {(layer) => (
          <div class={styles.settings} aria-label={`${layer().name} settings`}>
            <div class={styles.field}>
              <span>Opacity</span>
              <ScrubNumber
                label="Layer opacity"
                value={Math.round(layer().opacity * 100)}
                min={0}
                max={100}
                unit="%"
                disabled={!props.ready}
                onChange={(percent) =>
                  props.onAction({ type: 'update', id: layer().id, patch: { opacity: percent / 100 } })
                }
              />
            </div>
            <div class={styles.segmented} role="radiogroup" aria-label="Blend mode">
              <For each={blendModes}>
                {(mode) => (
                  <button
                    role="radio"
                    aria-checked={layer().blend === mode ? 'true' : 'false'}
                    disabled={!props.ready}
                    onClick={() => props.onAction({ type: 'update', id: layer().id, patch: { blend: mode } })}
                  >
                    {blendNames[mode]}
                  </button>
                )}
              </For>
            </div>
            <div class={styles.actions}>
              <Action
                icon="lock"
                label="Alpha lock: paint only where the layer has paint"
                pressed={layer().alphaLock ?? false}
                disabled={!props.ready}
                onClick={() =>
                  props.onAction({ type: 'update', id: layer().id, patch: { alphaLock: !layer().alphaLock } })
                }
              />
              <Action
                icon="clip"
                label="Clip to the layer below"
                pressed={layer().clipping ?? false}
                disabled={!props.ready || fromBottom() === 0}
                onClick={() =>
                  props.onAction({ type: 'update', id: layer().id, patch: { clipping: !layer().clipping } })
                }
              />
              <Action
                icon="copy"
                label="Duplicate"
                disabled={!props.ready}
                onClick={() => props.onAction({ type: 'duplicate', id: layer().id })}
              />
              <Action
                icon="newLayer"
                label="Merge down"
                disabled={!props.ready || !canMergeDown(props.state, fromBottom())}
                onClick={() => props.onAction({ type: 'merge-down', id: layer().id })}
              />
              <Action
                icon="up"
                label="Move up"
                disabled={!props.ready || fromBottom() === props.state.layers.length - 1}
                onClick={() => props.onAction({ type: 'move', id: layer().id, direction: 1 })}
              />
              <Action
                icon="down"
                label="Move down"
                disabled={!props.ready || fromBottom() === 0}
                onClick={() => props.onAction({ type: 'move', id: layer().id, direction: -1 })}
              />
              <Action
                icon="trash"
                label="Delete"
                disabled={!props.ready || props.state.layers.length < 2}
                onClick={() => props.onAction({ type: 'delete', id: layer().id })}
              />
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}

/** An icon button of the active layer's actions; `pressed` makes it a toggle. */
function Action(props: {
  icon: SketchIconName;
  label: string;
  pressed?: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      class={styles.iconButton}
      aria-label={props.label}
      title={props.label}
      aria-pressed={props.pressed === undefined ? undefined : props.pressed ? 'true' : 'false'}
      disabled={props.disabled}
      onClick={() => props.onClick()}
    >
      <SketchIcon name={props.icon} size={18} />
    </button>
  );
}

/** A visible layer can be merged into a visible layer below it. */
function canMergeDown(state: DocumentState, fromBottom: number) {
  const layer = state.layers[fromBottom];
  const below = state.layers[fromBottom - 1];
  return layer !== undefined && below !== undefined && layer.visible && below.visible;
}

const blendModes: readonly BlendMode[] = ['normal', 'multiply', 'screen', 'overlay'];

const blendNames: Record<BlendMode, string> = {
  normal: 'Normal',
  multiply: 'Multiply',
  screen: 'Screen',
  overlay: 'Overlay'
};
