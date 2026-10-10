import type { BlendMode, LayerAction } from '@app-game/paint-core/document';
import { For, Show } from 'solid-js';
import type { DocumentState } from '../../features/layers';
import { ScrubNumber } from '../../shared/ui/ScrubNumber';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import styles from './panels.module.css';

/**
 * The layers, top first: a tap on a name makes that layer the one painted on, the eye hides or shows it. The header
 * adds, duplicates and deletes layers; the footer moves the active layer and merges it down. Once blending has grown
 * (`blending`), the active layer's opacity, blend mode, alpha lock and clipping follow. Every change is an undoable
 * document command through `onAction`.
 */
export function LayersPanel(props: {
  state: DocumentState;
  /** Commands wait for the engine. */
  ready: boolean;
  blending: boolean;
  onAction: (action: LayerAction) => void;
}) {
  const topFirst = () => [...props.state.layers].reverse();
  const activeIndex = () => props.state.layers.findIndex((layer) => layer.id === props.state.activeId);
  const active = () => props.state.layers[activeIndex()];
  /** A visible layer can be merged into a visible layer below it. */
  const canMergeDown = () => {
    const below = props.state.layers[activeIndex() - 1];
    return below !== undefined && below.visible && active()?.visible === true;
  };

  return (
    <>
      <header class={styles.header}>
        <h2>Layers</h2>
        <button
          class={styles.iconButton}
          aria-label="Delete layer"
          title="Delete the active layer"
          disabled={!props.ready || props.state.layers.length < 2}
          onClick={() => props.onAction({ type: 'delete', id: props.state.activeId })}
        >
          <SketchIcon name="trash" size={18} />
        </button>
        <button
          class={styles.iconButton}
          aria-label="Duplicate layer"
          title="Duplicate the active layer"
          disabled={!props.ready}
          onClick={() => props.onAction({ type: 'duplicate', id: props.state.activeId })}
        >
          <SketchIcon name="copy" size={18} />
        </button>
        <button
          class={styles.iconButton}
          aria-label="Add layer"
          title="Add a layer above the active one"
          disabled={!props.ready}
          onClick={() => props.onAction({ type: 'add' })}
        >
          <SketchIcon name="plus" size={18} />
        </button>
      </header>
      <ul class={styles.layers} aria-label="Layers, top first">
        <For each={topFirst()} keyed={(layer) => layer.id}>
          {(layer) => (
            <li
              class={styles.layer}
              data-active={layer().id === props.state.activeId ? '' : undefined}
              data-hidden={layer().visible ? undefined : ''}
            >
              <button
                class={styles.eye}
                role="checkbox"
                aria-checked={layer().visible ? 'true' : 'false'}
                aria-label={`Show ${layer().name}`}
                disabled={!props.ready}
                onClick={() => props.onAction({ type: 'update', id: layer().id, patch: { visible: !layer().visible } })}
              >
                <SketchIcon name={layer().visible ? 'eye' : 'hidden'} size={16} />
              </button>
              <button
                class={styles.layerName}
                aria-current={layer().id === props.state.activeId ? 'true' : undefined}
                disabled={!props.ready}
                onClick={() => props.onAction({ type: 'select', id: layer().id })}
              >
                <span>{layer().name}</span>
                <Show when={layer().alphaLock || layer().clipping || layer().blend !== 'normal' || layer().opacity < 1}>
                  <small>
                    {[
                      layer().opacity < 1 && `${Math.round(layer().opacity * 100)} %`,
                      layer().blend !== 'normal' && blendNames[layer().blend],
                      layer().clipping && 'clipped',
                      layer().alphaLock && 'alpha locked'
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                </Show>
              </button>
            </li>
          )}
        </For>
      </ul>
      <div class={styles.layerActions}>
        <button
          class={styles.textButton}
          disabled={!props.ready || activeIndex() === props.state.layers.length - 1}
          onClick={() => props.onAction({ type: 'move', id: props.state.activeId, direction: 1 })}
        >
          <SketchIcon name="up" size={16} />
          Up
        </button>
        <button
          class={styles.textButton}
          disabled={!props.ready || activeIndex() <= 0}
          onClick={() => props.onAction({ type: 'move', id: props.state.activeId, direction: -1 })}
        >
          <SketchIcon name="down" size={16} />
          Down
        </button>
        <button
          class={styles.textButton}
          disabled={!props.ready || !canMergeDown()}
          onClick={() => props.onAction({ type: 'merge-down', id: props.state.activeId })}
        >
          Merge down
        </button>
      </div>
      <Show when={props.blending && active()}>
        {(layer) => (
          <div class={styles.blending}>
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
            <div class={styles.toggles}>
              <button
                class={styles.textButton}
                aria-pressed={layer().alphaLock ? 'true' : 'false'}
                disabled={!props.ready}
                onClick={() =>
                  props.onAction({ type: 'update', id: layer().id, patch: { alphaLock: !layer().alphaLock } })
                }
              >
                <SketchIcon name="lock" size={16} />
                Alpha lock
              </button>
              <button
                class={styles.textButton}
                aria-pressed={layer().clipping ? 'true' : 'false'}
                disabled={!props.ready || activeIndex() === 0}
                onClick={() =>
                  props.onAction({ type: 'update', id: layer().id, patch: { clipping: !layer().clipping } })
                }
              >
                <SketchIcon name="clip" size={16} />
                Clip
              </button>
            </div>
          </div>
        )}
      </Show>
    </>
  );
}

const blendModes: readonly BlendMode[] = ['normal', 'multiply', 'screen', 'overlay'];

const blendNames: Record<BlendMode, string> = {
  normal: 'Normal',
  multiply: 'Multiply',
  screen: 'Screen',
  overlay: 'Overlay'
};
