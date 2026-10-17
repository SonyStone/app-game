import type { LayerAction, LayerInfo } from '@app-game/paint-core/document';
import { createSignal, For, Show } from 'solid-js';
import { InfiniteIcon } from './icons';
import { blendName, LayerOptions } from './LayerOptions';
import styles from './LayerPanel.module.css';
import { longPress } from './longPress';
import theme from './theme.module.css';

/**
 * Infinite Painter's layer panel (manual pp. 146–151): a column of layer thumbnails at the screen's right edge, top
 * layer first, with the Paper at the bottom. Collapsed it is only thumbnails, each with a tiny visibility button;
 * expanded it adds the layer controls above and the names beside them. A horizontal slide over the panel collapses it
 * (right) or expands it (left).
 *
 * - A tap on a thumbnail makes its layer active (red frame); a tap on the active one, or on a name, opens the layer
 *   options beside the panel.
 * - A thumbnail shows the layer's blending mode when it is not Normal and its opacity when it is not 100 %, and an
 *   arrow beside it when the layer is clipped to the one below.
 * - A long press picks a layer up; it follows the pointer and drops between the others.
 *
 * Paint's document has no adjustment layers, groups, visibility modes or paper layer: those controls are shown, as
 * Infinite Painter has them, but disabled, and Paper is drawn for its place only. Pinching layers into a group is left
 * out for the same reason.
 */
export function LayerPanel(props: {
  /** The layers, bottom first, as the engine reports them. */
  layers: readonly LayerInfo[];
  activeId: string;
  /** A thumbnail image of layer `id`, such as an object URL; the tile stays blank without one. */
  thumbnail?: (id: string) => string | undefined;
  expanded: boolean;
  onExpanded: (expanded: boolean) => void;
  ready: boolean;
  onAction: (action: LayerAction) => void;
}) {
  /** The layer whose options are open and how far down the panel its row starts, in CSS pixels. */
  const [options, setOptions] = createSignal<{ id: string; top: number }>();
  const [dragging, setDragging] = createSignal<{ id: string; y: number; slot: number }>();
  let panel!: HTMLElement;
  let list!: HTMLDivElement;
  /** The layers top first, as the panel lists them. */
  const listed = () => [...props.layers].reverse();
  const optionsLayer = () => props.layers.find((layer) => layer.id === options()?.id);
  const showsNames = () => props.expanded || dragging() !== undefined;

  const swipe = horizontalSwipe((direction) => {
    setOptions(undefined);
    props.onExpanded(direction === 'left');
  });

  const tapLayer = (id: string, row: Element) => {
    if (swipe.consumeClick()) {
      return;
    }

    if (id !== props.activeId) {
      setOptions(undefined);
      props.onAction({ type: 'select', id });
      return;
    }

    toggleOptions(id, row);
  };
  /** Opens layer `id`'s options beside its row, outside the scrolling list, or closes them. */
  const toggleOptions = (id: string, row: Element) => {
    if (options()?.id === id) {
      setOptions(undefined);
      return;
    }

    setOptions({ id, top: row.getBoundingClientRect().top - panel.getBoundingClientRect().top });
  };

  /** The list slot, top first, that a dragged layer would take at client height `y`. */
  const slotAt = (y: number) => {
    const rect = list.getBoundingClientRect();
    return Math.max(0, Math.min(listed().length - 1, Math.floor((y - rect.top) / rowHeight)));
  };
  const startDrag = (id: string, point: { x: number; y: number }, pointerId: number) => {
    setOptions(undefined);
    setDragging({ id, y: point.y, slot: slotAt(point.y) });
    list.setPointerCapture(pointerId);
  };
  const moveDrag = (event: PointerEvent) => {
    const drag = dragging();
    if (drag) {
      setDragging({ ...drag, y: event.clientY, slot: slotAt(event.clientY) });
    }
  };
  const endDrag = (event: PointerEvent, cancelled: boolean) => {
    const drag = dragging();
    if (!drag) {
      return;
    }

    setDragging(undefined);
    const slot = slotAt(event.clientY);
    const index = props.layers.length - 1 - slot;
    const current = props.layers.findIndex((layer) => layer.id === drag.id);
    if (!cancelled && index !== current) {
      props.onAction({ type: 'reorder', id: drag.id, index });
    }
  };

  return (
    <aside
      ref={panel}
      class={[theme.panel, styles.panel]}
      data-expanded={showsNames() ? '' : undefined}
      aria-label="Layers"
      {...swipe.handlers}
    >
      <Show
        when={showsNames()}
        fallback={
          <button class={[theme.iconButton, styles.add]} aria-label="Add a layer" disabled={!props.ready} onClick={add}>
            <InfiniteIcon name="plus" size={20} />
          </button>
        }
      >
        <div class={styles.controls}>
          <button class={theme.iconButton} aria-label="Add a layer" disabled={!props.ready} onClick={add}>
            <InfiniteIcon name="plus" size={20} />
          </button>
          <button class={theme.iconButton} aria-label="Add an adjustment layer · not in Paint" disabled>
            <InfiniteIcon name="adjustmentLayer" size={20} />
          </button>
          <button class={theme.iconButton} aria-label="New layer group · not in Paint" disabled>
            <InfiniteIcon name="group" size={20} />
          </button>
          <button class={theme.iconButton} aria-label="Visibility mode · not in Paint" disabled>
            <InfiniteIcon name="layers" size={20} />
          </button>
        </div>
      </Show>

      <div
        ref={list}
        class={styles.list}
        onPointerMove={moveDrag}
        onPointerUp={(event) => endDrag(event, false)}
        onPointerCancel={(event) => endDrag(event, true)}
      >
        <For each={listed()}>
          {(layer, index) => {
            const hold = longPress((point, event) => startDrag(layer.id, point, event.pointerId));

            return (
              <div
                class={styles.row}
                data-active={layer.id === props.activeId ? '' : undefined}
                data-lifted={dragging()?.id === layer.id ? '' : undefined}
                data-drop-before={
                  dragging() && dragging()!.slot === index() && dragging()!.id !== layer.id ? '' : undefined
                }
              >
                <Show when={layer.clipping}>
                  <span class={styles.clip} title="Clipped to the layer below">
                    ↳
                  </span>
                </Show>
                <button
                  class={styles.thumbnail}
                  aria-label={`${layer.name}${layer.id === props.activeId ? ' · active, tap for options' : ''}`}
                  aria-pressed={layer.id === props.activeId ? 'true' : 'false'}
                  disabled={!props.ready}
                  onClick={(event) => {
                    if (!hold.consumeClick()) {
                      tapLayer(layer.id, event.currentTarget);
                    }
                  }}
                  {...hold.handlers}
                >
                  <Show when={props.thumbnail?.(layer.id)}>
                    {(src) => <img src={src()} alt="" draggable={false} />}
                  </Show>
                  <Show when={layer.blend !== 'normal'}>
                    <span class={styles.blendBadge}>{blendName(layer.blend)}</span>
                  </Show>
                  <Show when={layer.opacity < 1}>
                    <span class={styles.opacityBadge}>{Math.round(layer.opacity * 100)}%</span>
                  </Show>
                </button>
                <Show when={showsNames()}>
                  <button
                    class={styles.name}
                    disabled={!props.ready}
                    onClick={(event) => toggleOptions(layer.id, event.currentTarget)}
                  >
                    {layer.name}
                  </button>
                </Show>
                <button
                  class={styles.eye}
                  aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                  aria-pressed={layer.visible ? 'false' : 'true'}
                  disabled={!props.ready}
                  onClick={() => props.onAction({ type: 'update', id: layer.id, patch: { visible: !layer.visible } })}
                >
                  <InfiniteIcon name={layer.visible ? 'eye' : 'eyeOff'} size={showsNames() ? 18 : 12} />
                </button>
              </div>
            );
          }}
        </For>
      </div>

      <Show when={optionsLayer()}>
        {(layer) => (
          <div class={styles.optionsAnchor} style={{ top: `${options()?.top ?? 0}px` }}>
            <LayerOptions
              layer={layer()}
              bottom={props.layers[0]?.id === layer().id}
              only={props.layers.length === 1}
              disabled={!props.ready}
              onAction={props.onAction}
              onClose={() => setOptions(undefined)}
            />
          </div>
        )}
      </Show>

      <div class={styles.paper} title="Paper · Paint's paper is not a layer">
        <span class={styles.paperIcon}>
          <InfiniteIcon name="paper" size={20} />
        </span>
        <Show when={showsNames()}>
          <span class={styles.paperName}>Paper</span>
        </Show>
      </div>
    </aside>
  );

  function add() {
    setOptions(undefined);
    props.onAction({ type: 'add' });
  }
}

/** The panel's width collapsed and expanded, in CSS pixels; the stylesheet matches them. */
export const layerPanelWidths = { collapsed: 64, expanded: 176 } as const;

/** One row's height, in CSS pixels, for finding where a dragged layer drops; the stylesheet matches it. */
const rowHeight = 62;

/**
 * A horizontal slide over an element: past {@link swipeDistance} sideways, and more sideways than up or down, it
 * calls `onSwipe` once with its direction, and the click the lift would make is swallowed (`consumeClick`).
 */
function horizontalSwipe(onSwipe: (direction: 'left' | 'right') => void) {
  let start: { x: number; y: number; id: number } | undefined;
  let swiped = false;

  return {
    handlers: {
      onPointerDown(event: PointerEvent) {
        start = { x: event.clientX, y: event.clientY, id: event.pointerId };
        swiped = false;
      },
      onPointerMove(event: PointerEvent) {
        if (!start || start.id !== event.pointerId || swiped) {
          return;
        }

        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (Math.abs(dx) > swipeDistance && Math.abs(dx) > Math.abs(dy) * 1.5) {
          swiped = true;
          onSwipe(dx > 0 ? 'right' : 'left');
        }
      },
      onPointerUp() {
        start = undefined;
      }
    },
    consumeClick() {
      const consumed = swiped;
      swiped = false;
      return consumed;
    }
  };
}

/** CSS pixels a slide must travel sideways to collapse or expand the panel. */
const swipeDistance = 36;
