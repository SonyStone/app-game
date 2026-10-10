import type { BlendMode, LayerAction, LayerInfo } from '@app-game/paint-core/document';
import { createSignal, For, Show } from 'solid-js';
import { pressHandlers } from '../../shared/ui/pressHandlers';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import { Choice, IconButton, ScrubField } from './controls';
import styles from './panels.module.css';

/**
 * Photoshop's Layers panel, dense: the active layer's blend mode, opacity, transparency lock and clipping on top; the
 * layers top first, each with its visibility, name and lock and clipping marks; and New, Duplicate, Merge down and
 * Delete at the bottom.
 *
 * Rows: a press makes the layer active, a press on the eye shows or hides it, a second press on the active layer's
 * name renames it (Enter keeps, Escape cancels), and a vertical drag moves the layer to where it is released. While
 * the list is too long to show whole, a drag scrolls it instead, and a press held still for a moment moves the layer.
 * Opacity is sent when its drag ends, so that a drag is one undo step.
 */
export function LayersPanel(props: {
  /** The layers, bottom first, as the document lists them. */
  layers: readonly LayerInfo[];
  activeId: string;
  /** Layer commands wait while the engine is not ready. */
  ready: boolean;
  onAction: (action: LayerAction) => void;
}) {
  const [renaming, setRenaming] = createSignal<string>();
  const [drag, setDrag] = createSignal<{ id: string; index: number; dy: number }>();
  let list!: HTMLDivElement;
  /** Top first, as the panel shows them. */
  const rows = () => [...props.layers].reverse();
  const active = () => props.layers.find((layer) => layer.id === props.activeId);
  const below = () => {
    const index = props.layers.findIndex((layer) => layer.id === props.activeId);
    return index > 0 ? props.layers[index - 1] : undefined;
  };
  const act = (action: LayerAction) => {
    if (props.ready) {
      props.onAction(action);
    }
  };
  const update = (patch: Extract<LayerAction, { type: 'update' }>['patch']) => {
    const layer = active();
    if (layer) {
      act({ type: 'update', id: layer.id, patch });
    }
  };
  /** The place, top first, a dragged row would drop at. */
  const target = (current: { index: number; dy: number }) =>
    Math.min(rows().length - 1, Math.max(0, Math.round(current.index + current.dy / rowHeight)));

  return (
    <div class={styles.layers}>
      <div class={styles.layerBar}>
        <Choice
          label="Blend mode"
          value={active()?.blend ?? 'normal'}
          options={blendModes}
          disabled={!props.ready || !active()}
          onChange={(blend) => update({ blend })}
        />
        <ScrubField
          caption="Opacity"
          label="Layer opacity"
          value={Math.round((active()?.opacity ?? 1) * 100)}
          min={0}
          max={100}
          unit="%"
          width={58}
          disabled={!props.ready || !active()}
          onChange={(opacity) => update({ opacity: opacity / 100 })}
        />
      </div>
      <div class={styles.layerBar}>
        <span class={styles.caption}>Lock</span>
        <IconButton
          icon="lock"
          label="Lock transparent pixels"
          title="Lock transparent pixels: paint only recolors existing pixels (/)"
          pressed={active()?.alphaLock ?? false}
          disabled={!props.ready || !active()}
          onClick={() => update({ alphaLock: !active()?.alphaLock })}
        />
        <IconButton
          icon="clip"
          label="Clip to the layer below"
          title="Clipping mask: show only where the layer below has paint"
          pressed={active()?.clipping ?? false}
          disabled={!props.ready || !active()}
          onClick={() => update({ clipping: !active()?.clipping })}
        />
      </div>
      <div ref={list} class={styles.layerList} role="listbox" aria-label="Layers">
        {/* Keyed by position: each report replaces every layer record, which would re-create keyed rows and lose
            the press in progress. */}
        <For each={rows()} keyed={false}>
          {(layer, index) => {
            /** The press started on the eye. */
            let onEye = false;
            /** The layer was active already when the press started, so a tap on its name renames it. */
            let wasActive = false;
            let pressed = '';
            /** What the press does once it moves: reorder the layer or scroll the list. */
            let mode: 'reorder' | 'scroll' | undefined;
            let scrollStart = 0;
            // Created once: a spread re-runs when the row's other attributes change, which would forget the press.
            const press = pressHandlers({
              start(_press, event) {
                if (renaming() === layer().id) {
                  return false;
                }

                onEye = (event.target as Element).closest('[data-part="eye"]') !== null;
                mode = undefined;
                scrollStart = list.scrollTop;
                wasActive = layer().id === props.activeId;
                pressed = layer().id;
              },
              move(current, event) {
                if (onEye || !current.moved) {
                  return;
                }

                const dy = current.point.y - current.start.y;
                if (!mode) {
                  const scrolls = list.scrollHeight > list.clientHeight + 1;
                  mode = scrolls && event.timeStamp - current.time < holdToMove ? 'scroll' : 'reorder';
                }

                if (mode === 'scroll') {
                  list.scrollTop = scrollStart - dy;
                } else {
                  setDrag({ id: pressed, index, dy });
                }
              },
              end() {
                const finished = drag();
                setDrag(undefined);
                if (finished) {
                  const place = target(finished);
                  if (place !== finished.index) {
                    // The panel lists layers top first; the document counts from the bottom.
                    act({ type: 'reorder', id: finished.id, index: rows().length - 1 - place });
                  }
                }
              },
              tap() {
                if (onEye) {
                  act({ type: 'update', id: pressed, patch: { visible: !layer().visible } });
                } else if (wasActive) {
                  setRenaming(pressed);
                } else {
                  act({ type: 'select', id: pressed });
                }
              },
              cancel() {
                setDrag(undefined);
              }
            });
            const offset = () => {
              const current = drag();
              if (!current) {
                return 0;
              }

              if (current.index === index) {
                return current.dy;
              }

              const place = target(current);
              if (current.index < place && index > current.index && index <= place) {
                return -rowHeight;
              }

              return current.index > place && index >= place && index < current.index ? rowHeight : 0;
            };

            return (
              <div
                class={styles.layer}
                role="option"
                aria-selected={layer().id === props.activeId ? 'true' : 'false'}
                data-hidden={layer().visible ? 'false' : 'true'}
                data-dragged={drag()?.index === index ? 'true' : 'false'}
                style={{ translate: `0 ${offset()}px` }}
                {...press}
              >
                <span
                  class={styles.eye}
                  data-part="eye"
                  role="checkbox"
                  aria-checked={layer().visible ? 'true' : 'false'}
                  aria-label={`Show ${layer().name}`}
                  title={layer().visible ? 'Hide the layer' : 'Show the layer'}
                >
                  <SketchIcon name={layer().visible ? 'eye' : 'hidden'} size={15} />
                </span>
                <Show when={layer().clipping}>
                  <span class={styles.mark} title="Clipped to the layer below">
                    <SketchIcon name="clip" size={13} />
                  </span>
                </Show>
                <Show
                  when={renaming() === layer().id}
                  fallback={
                    <span class={styles.layerName} title={`${layer().name}: press again to rename, drag to move`}>
                      {layer().name}
                    </span>
                  }
                >
                  <input
                    class={styles.rename}
                    aria-label="Layer name"
                    value={layer().name}
                    ref={(input) =>
                      queueMicrotask(() => {
                        input.focus();
                        input.select();
                      })
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.currentTarget.blur();
                      } else if (event.key === 'Escape') {
                        event.currentTarget.value = layer().name;
                        event.currentTarget.blur();
                      }
                    }}
                    onBlur={(event) => {
                      const name = event.currentTarget.value.trim();
                      setRenaming(undefined);
                      if (name && name !== layer().name) {
                        act({ type: 'update', id: layer().id, patch: { name } });
                      }
                    }}
                  />
                </Show>
                <span class={styles.layerInfo}>
                  <Show when={layer().blend !== 'normal'}>{blendShort[layer().blend]}</Show>
                  <Show when={layer().opacity < 1}> {Math.round(layer().opacity * 100)}%</Show>
                </span>
                <Show when={layer().alphaLock}>
                  <span class={styles.mark} title="Transparent pixels locked">
                    <SketchIcon name="lock" size={13} />
                  </span>
                </Show>
              </div>
            );
          }}
        </For>
      </div>
      <div class={styles.layerFooter}>
        <span class={styles.caption}>
          {props.layers.length} {props.layers.length === 1 ? 'layer' : 'layers'}
        </span>
        <IconButton icon="newLayer" label="New layer" disabled={!props.ready} onClick={() => act({ type: 'add' })} />
        <IconButton
          icon="copy"
          label="Duplicate layer"
          disabled={!props.ready || !active()}
          onClick={() => act({ type: 'duplicate', id: props.activeId })}
        />
        <IconButton
          icon="down"
          label="Merge down"
          title="Merge into the layer below"
          disabled={!props.ready || !below()}
          onClick={() => act({ type: 'merge-down', id: props.activeId })}
        />
        <IconButton
          icon="trash"
          label="Delete layer"
          disabled={!props.ready || props.layers.length <= 1}
          onClick={() => act({ type: 'delete', id: props.activeId })}
        />
      </div>
    </div>
  );
}

/** Milliseconds a press must stay still before a drag moves the layer rather than scrolling a long list. */
const holdToMove = 350;

/** Row height in CSS pixels, which a reorder drag steps by. */
const rowHeight = 26;

const blendModes: readonly { value: BlendMode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' }
];

const blendShort: Record<BlendMode, string> = { normal: '', multiply: 'Mult', screen: 'Scrn', overlay: 'Ovrl' };
