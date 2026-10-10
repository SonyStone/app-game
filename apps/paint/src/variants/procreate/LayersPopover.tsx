import type { BlendMode, LayerAction } from '@app-game/paint-core/document';
import { createSignal, For, Show } from 'solid-js';
import type { DocumentState } from '../../features/layers';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import { ProcreateIcon } from './icons';
import styles from './LayersPopover.module.css';
import menu from './menu.module.css';
import { PopoverHeader } from './Popover';
import { Slider } from './Slider';

/**
 * Procreate's Layers popover: the layers top first, each with its name, the blend mode's letter and a visibility
 * checkbox; the active layer in blue and `+` in the header adds a layer above it. Tapping a layer makes it active;
 * tapping the active layer opens its options (rename, alpha lock, clipping mask, duplicate, merge down, move,
 * delete) under it, and tapping its letter opens its opacity and blend mode. Every change is an undoable document
 * command; layer thumbnails are not shown, as the engine does not report them.
 */
export function LayersPopover(props: {
  state: DocumentState;
  /** Commands wait for the engine. */
  ready: boolean;
  onAction: (action: LayerAction) => void;
}) {
  /** The layer whose options or blend settings are open under its row. */
  const [open, setOpen] = createSignal<{ id: string; panel: 'options' | 'blend' }>();
  const topFirst = () => [...props.state.layers].reverse();
  const toggle = (id: string, panel: 'options' | 'blend') => {
    const current = open();
    setOpen(current?.id === id && current.panel === panel ? undefined : { id, panel });
  };

  return (
    <>
      <PopoverHeader title="Layers">
        <button
          class={styles.add}
          aria-label="Add layer"
          title="Add a layer"
          disabled={!props.ready}
          onClick={() => props.onAction({ type: 'add' })}
        >
          <SketchIcon name="plus" size={22} />
        </button>
      </PopoverHeader>
      <ul class={styles.list} aria-label="Layers, top first">
        <For each={topFirst()} keyed={(layer) => layer.id}>
          {(layer, index) => {
            const active = () => layer().id === props.state.activeId;
            const panel = () => (open()?.id === layer().id ? open()!.panel : undefined);
            /** Position counted from the bottom, as layer commands count. */
            const fromBottom = () => props.state.layers.length - 1 - index();

            return (
              <li class={styles.item}>
                <div
                  class={styles.row}
                  data-active={active() ? '' : undefined}
                  data-hidden={layer().visible ? undefined : ''}
                >
                  <button
                    class={styles.name}
                    aria-current={active() ? 'true' : undefined}
                    aria-expanded={active() ? (panel() === 'options' ? 'true' : 'false') : undefined}
                    disabled={!props.ready}
                    onClick={() => {
                      if (active()) {
                        toggle(layer().id, 'options');
                        return;
                      }

                      setOpen(undefined);
                      props.onAction({ type: 'select', id: layer().id });
                    }}
                  >
                    <span>{layer().name}</span>
                    <Show when={layer().alphaLock || layer().clipping}>
                      <small>
                        {[layer().clipping && 'Clipped', layer().alphaLock && 'Alpha locked']
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                    </Show>
                  </button>
                  <button
                    class={styles.blend}
                    aria-label={`Blend mode and opacity: ${blendNames[layer().blend]}, ${Math.round(layer().opacity * 100)} %`}
                    aria-expanded={panel() === 'blend' ? 'true' : 'false'}
                    disabled={!props.ready}
                    onClick={() => toggle(layer().id, 'blend')}
                  >
                    {blendLetters[layer().blend]}
                  </button>
                  <button
                    class={styles.visible}
                    role="checkbox"
                    aria-checked={layer().visible ? 'true' : 'false'}
                    aria-label={`Show ${layer().name}`}
                    disabled={!props.ready}
                    onClick={() =>
                      props.onAction({ type: 'update', id: layer().id, patch: { visible: !layer().visible } })
                    }
                  >
                    <Show when={layer().visible}>
                      <ProcreateIcon name="check" size={16} />
                    </Show>
                  </button>
                </div>
                <Show when={panel() === 'blend'}>
                  <BlendSettings
                    opacity={layer().opacity}
                    blend={layer().blend}
                    disabled={!props.ready}
                    onOpacity={(opacity) => props.onAction({ type: 'update', id: layer().id, patch: { opacity } })}
                    onBlend={(blend) => props.onAction({ type: 'update', id: layer().id, patch: { blend } })}
                  />
                </Show>
                <Show when={panel() === 'options'}>
                  <div class={styles.options}>
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

                        props.onAction({ type: 'update', id: layer().id, patch: { name } });
                      }}
                    />
                    <button
                      class={menu.row}
                      role="switch"
                      aria-checked={layer().alphaLock ? 'true' : 'false'}
                      disabled={!props.ready}
                      onClick={() =>
                        props.onAction({ type: 'update', id: layer().id, patch: { alphaLock: !layer().alphaLock } })
                      }
                    >
                      <span class={menu.label}>Alpha Lock</span>
                      <span class={menu.switch} />
                    </button>
                    <button
                      class={menu.row}
                      role="switch"
                      aria-checked={layer().clipping ? 'true' : 'false'}
                      disabled={!props.ready || fromBottom() === 0}
                      onClick={() =>
                        props.onAction({ type: 'update', id: layer().id, patch: { clipping: !layer().clipping } })
                      }
                    >
                      <span class={menu.label}>Clipping Mask</span>
                      <span class={menu.switch} />
                    </button>
                    <button
                      class={menu.row}
                      disabled={!props.ready}
                      onClick={() => props.onAction({ type: 'duplicate', id: layer().id })}
                    >
                      <span class={menu.label}>Duplicate</span>
                    </button>
                    <button
                      class={menu.row}
                      disabled={!props.ready || !canMergeDown(props.state, fromBottom())}
                      onClick={() => props.onAction({ type: 'merge-down', id: layer().id })}
                    >
                      <span class={menu.label}>Merge Down</span>
                    </button>
                    <button
                      class={menu.row}
                      disabled={!props.ready || index() === 0}
                      onClick={() => props.onAction({ type: 'move', id: layer().id, direction: 1 })}
                    >
                      <span class={menu.label}>Move Up</span>
                    </button>
                    <button
                      class={menu.row}
                      disabled={!props.ready || fromBottom() === 0}
                      onClick={() => props.onAction({ type: 'move', id: layer().id, direction: -1 })}
                    >
                      <span class={menu.label}>Move Down</span>
                    </button>
                    <button
                      class={[menu.row, styles.delete]}
                      disabled={!props.ready || props.state.layers.length < 2}
                      onClick={() => {
                        setOpen(undefined);
                        props.onAction({ type: 'delete', id: layer().id });
                      }}
                    >
                      <span class={menu.label}>Delete</span>
                    </button>
                  </div>
                </Show>
              </li>
            );
          }}
        </For>
      </ul>
    </>
  );
}

/**
 * A layer's opacity slider and blend modes. The slider shows its value while dragged and commits one change when the
 * press lifts, so a drag is one undo step.
 */
function BlendSettings(props: {
  opacity: number;
  blend: BlendMode;
  disabled: boolean;
  onOpacity: (opacity: number) => void;
  onBlend: (blend: BlendMode) => void;
}) {
  // Follows the layer's opacity, and the drag in between.
  const [draft, setDraft] = createSignal(() => props.opacity);

  return (
    <div class={styles.blendSettings}>
      <div class={styles.opacity}>
        <span>Opacity</span>
        <Slider
          label="Layer opacity"
          min={0}
          max={1}
          value={draft()}
          valueText={`${Math.round(draft() * 100)} %`}
          disabled={props.disabled}
          onInput={setDraft}
          onChange={(opacity) => {
            setDraft(opacity);
            props.onOpacity(opacity);
          }}
        />
        <output>{Math.round(draft() * 100)}%</output>
      </div>
      <div class={styles.modes} role="radiogroup" aria-label="Blend mode">
        <For each={blendModes}>
          {(mode) => (
            <button
              role="radio"
              aria-checked={props.blend === mode ? 'true' : 'false'}
              disabled={props.disabled}
              onClick={() => props.onBlend(mode)}
            >
              {blendNames[mode]}
            </button>
          )}
        </For>
      </div>
    </div>
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

/** The letter Procreate shows for a blend mode on the layer's row. */
const blendLetters: Record<BlendMode, string> = { normal: 'N', multiply: 'M', screen: 'S', overlay: 'O' };
