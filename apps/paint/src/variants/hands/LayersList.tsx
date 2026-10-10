import type { BlendMode, LayerAction } from '@app-game/paint-core/document';
import { For, Show } from 'solid-js';
import type { DocumentState } from '../../features/layers';
import { ScrubNumber } from '../../shared/ui/ScrubNumber';
import { SketchIcon, type SketchIconName } from '../../shared/ui/SketchIcon';
import styles from './LayersList.module.css';
import sheet from './Sheet.module.css';

/**
 * The layers tab: the layers top first in large touch rows, each with its visibility and name; tapping a row makes
 * the layer active. The active layer's row opens its settings under it: name, opacity (press and drag), blend mode,
 * alpha lock, clipping, and the commands to duplicate, merge down, move and delete it. Every change is an undoable
 * document command. Layer thumbnails are not shown: the engine does not report them.
 */
export function LayersList(props: {
  state: DocumentState;
  /** Commands wait for the engine. */
  ready: boolean;
  onAction: (action: LayerAction) => void;
}) {
  const topFirst = () => [...props.state.layers].reverse();

  return (
    <section class={sheet.section}>
      <h2 class={sheet.sectionTitle}>
        {props.state.layers.length} {props.state.layers.length === 1 ? 'layer' : 'layers'}
        <button
          class={sheet.iconButton}
          aria-label="Add layer"
          title="Add a layer above the active one"
          disabled={!props.ready}
          onClick={() => props.onAction({ type: 'add' })}
        >
          <SketchIcon name="newLayer" size={22} />
        </button>
      </h2>
      <ul class={styles.list} aria-label="Layers, top first">
        {/* Keyed by position: rows stay while their layers change, so a drag on the opacity keeps its capture. */}
        <For each={topFirst()} keyed={false}>
          {(layer, index) => {
            const active = () => layer().id === props.state.activeId;
            /** Position counted from the bottom, as layer commands count. */
            const fromBottom = () => props.state.layers.length - 1 - index;
            const update = (patch: Extract<LayerAction, { type: 'update' }>['patch']) =>
              props.onAction({ type: 'update', id: layer().id, patch });

            return (
              <li class={styles.item} data-active={active() ? '' : undefined}>
                <div class={styles.row} data-hidden={layer().visible ? undefined : ''}>
                  <button
                    class={sheet.iconButton}
                    role="checkbox"
                    aria-checked={layer().visible ? 'true' : 'false'}
                    aria-label={`Show ${layer().name}`}
                    disabled={!props.ready}
                    onClick={() => update({ visible: !layer().visible })}
                  >
                    <SketchIcon name={layer().visible ? 'eye' : 'hidden'} size={20} />
                  </button>
                  <button
                    class={styles.name}
                    aria-current={active() ? 'true' : undefined}
                    disabled={!props.ready}
                    onClick={() => props.onAction({ type: 'select', id: layer().id })}
                  >
                    <span class={sheet.label}>{layer().name}</span>
                    <span class={sheet.detail}>
                      {[
                        layer().clipping && 'Clipped',
                        layer().alphaLock && 'Locked',
                        layer().blend !== 'normal' && blendNames[layer().blend],
                        `${Math.round(layer().opacity * 100)}%`
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </button>
                </div>
                <Show when={active()}>
                  <div class={styles.settings}>
                    <input
                      class={styles.rename}
                      aria-label="Layer name"
                      maxlength={64}
                      value={layer().name}
                      onChange={(event) => {
                        const name = event.currentTarget.value.trim();
                        if (!name) {
                          event.currentTarget.value = layer().name;
                          return;
                        }

                        update({ name });
                      }}
                    />
                    <div class={styles.opacity}>
                      <span>Opacity</span>
                      <ScrubNumber
                        label="Layer opacity"
                        value={Math.round(layer().opacity * 100)}
                        min={0}
                        max={100}
                        unit="%"
                        disabled={!props.ready}
                        onChange={(percent) => update({ opacity: percent / 100 })}
                      />
                    </div>
                    <div class={sheet.segmented} role="radiogroup" aria-label="Blend mode">
                      <For each={blendModes}>
                        {(mode) => (
                          <button
                            role="radio"
                            aria-checked={layer().blend === mode ? 'true' : 'false'}
                            disabled={!props.ready}
                            onClick={() => update({ blend: mode })}
                          >
                            {blendNames[mode]}
                          </button>
                        )}
                      </For>
                    </div>
                    <div class={styles.commands}>
                      <Command
                        icon="lock"
                        label="Lock alpha"
                        pressed={layer().alphaLock ?? false}
                        disabled={!props.ready}
                        onClick={() => update({ alphaLock: !layer().alphaLock })}
                      />
                      <Command
                        icon="clip"
                        label="Clip"
                        pressed={layer().clipping ?? false}
                        disabled={!props.ready || fromBottom() === 0}
                        onClick={() => update({ clipping: !layer().clipping })}
                      />
                      <Command
                        icon="copy"
                        label="Duplicate"
                        disabled={!props.ready}
                        onClick={() => props.onAction({ type: 'duplicate', id: layer().id })}
                      />
                      <Command
                        icon="layers"
                        label="Merge down"
                        disabled={!props.ready || !canMergeDown(props.state, fromBottom())}
                        onClick={() => props.onAction({ type: 'merge-down', id: layer().id })}
                      />
                      <Command
                        icon="up"
                        label="Move up"
                        disabled={!props.ready || index === 0}
                        onClick={() => props.onAction({ type: 'move', id: layer().id, direction: 1 })}
                      />
                      <Command
                        icon="down"
                        label="Move down"
                        disabled={!props.ready || fromBottom() === 0}
                        onClick={() => props.onAction({ type: 'move', id: layer().id, direction: -1 })}
                      />
                      <Command
                        icon="trash"
                        label="Delete"
                        disabled={!props.ready || props.state.layers.length < 2}
                        onClick={() => props.onAction({ type: 'delete', id: layer().id })}
                      />
                    </div>
                  </div>
                </Show>
              </li>
            );
          }}
        </For>
      </ul>
    </section>
  );
}

/** A layer command: an icon over its name; `pressed` makes it a toggle. */
function Command(props: {
  icon: SketchIconName;
  label: string;
  pressed?: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      class={styles.command}
      aria-pressed={props.pressed === undefined ? undefined : props.pressed ? 'true' : 'false'}
      disabled={props.disabled}
      onClick={() => props.onClick()}
    >
      <SketchIcon name={props.icon} size={20} />
      <span>{props.label}</span>
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
