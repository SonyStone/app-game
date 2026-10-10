import type { BlendMode, LayerAction, LayerInfo } from '@app-game/paint-core/document';
import { createSignal, For, Show, untrack } from 'solid-js';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import css from './cluster.module.css';
import { PillScrubber, SwitchRow, TapButton } from './controls';
import styles from './LayersCard.module.css';
import { placed, type Box } from './layout';
import { pressHandlers } from '../../shared/ui/pressHandlers';
import { percentSetting } from './values';

/**
 * Procreate's Layers popover on the drawing's layers: layer cards with the name, the blend mode's letter (tap it for
 * the layer's blend mode, opacity, clipping, alpha lock and Merge down) and a visibility checkbox; the active layer
 * is lighter and "+" adds a layer at the top. Making a layer active finishes; the other changes keep the card open.
 *
 * Rows: tap to make a layer active, or tap its letter or checkbox; swipe left from anywhere on the row to reveal
 * Alpha lock, Duplicate and Delete; drag by the grip, or anywhere while the list does not scroll, to reorder. A
 * vertical drag on a row of a list that scrolls scrolls it. The row owns all its presses, so that a swipe may start
 * on the letter or the checkbox.
 *
 * `onEscape` receives a handler that closes the blend sheet or the revealed actions first and reports whether it did.
 */
export function LayersCard(props: {
  box: Box;
  /** The layers, bottom first, as the document lists them. */
  layers: readonly LayerInfo[];
  activeId: string;
  /** Layer commands wait while the engine is not ready. */
  ready: boolean;
  onAction: (action: LayerAction) => void;
  done: () => void;
  onEscape: (handler: () => boolean) => void;
}) {
  const [revealed, setRevealed] = createSignal<string>();
  const [sheetFor, setSheetFor] = createSignal<string>();
  const [drag, setDrag] = createSignal<RowDrag>();
  /** Top first, as the card shows them. */
  const rows = () => [...props.layers].reverse();
  const sheetLayer = () => props.layers.find((layer) => layer.id === sheetFor());
  let list!: HTMLDivElement;

  props.onEscape(() => {
    if (sheetFor() !== undefined) {
      setSheetFor(undefined);
      return true;
    }

    if (revealed() !== undefined) {
      setRevealed(undefined);
      return true;
    }

    return false;
  });

  const act = (action: LayerAction) => {
    if (props.ready) {
      props.onAction(action);
    }
  };

  return (
    <section class={[css.card, styles.card]} style={placed(props.box)}>
      <header class={css.cardHeader}>
        <h3>Layers</h3>
        <TapButton
          class={css.headerButton}
          title="Add a layer"
          disabled={!props.ready}
          onTap={() => {
            setSheetFor(undefined);
            act({ type: 'add' });
          }}
        >
          <SketchIcon name="plus" size={20} />
        </TapButton>
      </header>

      <Show
        when={sheetLayer()}
        fallback={
          <div class={styles.list} ref={list}>
            {/* Keyed by position, not by layer: each report replaces every layer record, which would otherwise
                re-create the rows and lose a press in progress. */}
            <For each={rows()} keyed={false}>
              {(layer, index) => {
                const id = () => layer().id;
                /** What this row's press does, decided by its first move. */
                let mode: RowDrag['mode'] | undefined;
                /** The part of the row the press started on, which a tap acts on. */
                let part: string | undefined;
                /** The layer the press started on; the row may show another one once the press reorders. */
                let pressed = '';
                let base = 0;
                let scrollStart = 0;

                const offset = () => {
                  const current = drag();
                  if (current?.id === id() && current.mode === 'swipe') {
                    return swipeOffset(current);
                  }

                  return revealed() === id() ? -actionsWidth : 0;
                };
                const shift = () => {
                  const current = drag();
                  if (!current || current.mode !== 'reorder') {
                    return 0;
                  }

                  const count = rows().length;
                  if (current.id === id()) {
                    return Math.min(
                      (count - 1 - current.index) * rowStep,
                      Math.max(-current.index * rowStep, current.dy)
                    );
                  }

                  const target = targetIndex(current, count);
                  if (current.index < target && index > current.index && index <= target) {
                    return -rowStep;
                  }

                  if (current.index > target && index >= target && index < current.index) {
                    return rowStep;
                  }

                  return 0;
                };
                const press = pressHandlers({
                  start: (_press, event) => {
                    part = (event.target as Element).closest<HTMLElement>('[data-part]')?.dataset.part;
                    mode = part === 'grip' ? 'reorder' : undefined;
                    pressed = id();
                    base = revealed() === pressed ? -actionsWidth : 0;
                    scrollStart = list.scrollTop;
                  },
                  move: (press) => {
                    if (!press.moved) {
                      return;
                    }

                    const unit = rowHeight / press.target.getBoundingClientRect().height;
                    const dx = (press.point.x - press.start.x) * unit;
                    const dy = (press.point.y - press.start.y) * unit;
                    if (!mode) {
                      const scrolls = list.scrollHeight > list.clientHeight + 1;
                      mode = Math.abs(dx) > Math.abs(dy) ? 'swipe' : scrolls ? 'scroll' : 'reorder';
                      if (mode === 'swipe' && revealed() !== pressed) {
                        setRevealed(undefined);
                      }
                    }

                    if (mode === 'scroll') {
                      list.scrollTop = scrollStart - dy;
                      return;
                    }

                    setDrag({ id: pressed, index, mode, dx, dy, base });
                  },
                  end: () => {
                    const finished = drag();
                    setDrag(undefined);
                    mode = undefined;
                    if (finished?.mode === 'swipe') {
                      setRevealed(swipeOffset(finished) < -actionsWidth / 2 ? pressed : undefined);
                    } else if (finished?.mode === 'reorder') {
                      const count = rows().length;
                      const target = targetIndex(finished, count);
                      if (target !== finished.index) {
                        // The card lists layers top first; the document counts from the bottom.
                        act({ type: 'reorder', id: pressed, index: count - 1 - target });
                      }
                    }
                  },
                  tap: () => {
                    mode = undefined;
                    if (revealed() !== undefined) {
                      setRevealed(undefined);
                    } else if (part === 'blend') {
                      setSheetFor(pressed);
                    } else if (part === 'visibility') {
                      act({ type: 'update', id: pressed, patch: { visible: !layer().visible } });
                    } else {
                      act({ type: 'select', id: pressed });
                      props.done();
                    }
                  },
                  cancel: () => {
                    mode = undefined;
                    setDrag(undefined);
                  }
                });

                return (
                  <div
                    class={[styles.row, { [styles.lifted!]: drag()?.id === id() && drag()?.mode === 'reorder' }]}
                    style={{ translate: `0 ${shift()}px` }}
                  >
                    <div class={styles.actions} style={{ width: `${-offset()}px` }}>
                      <TapButton
                        class={styles.action}
                        title="Lock transparent pixels: paint only recolors existing pixels"
                        onTap={() => {
                          act({ type: 'update', id: id(), patch: { alphaLock: !layer().alphaLock } });
                          setRevealed(undefined);
                        }}
                      >
                        <SketchIcon name={layer().alphaLock ? 'unlock' : 'lock'} size={17} />
                        <span>{layer().alphaLock ? 'Unlock' : 'Alpha lock'}</span>
                      </TapButton>
                      <TapButton
                        class={styles.action}
                        onTap={() => {
                          act({ type: 'duplicate', id: id() });
                          setRevealed(undefined);
                        }}
                      >
                        <SketchIcon name="copy" size={17} />
                        <span>Duplicate</span>
                      </TapButton>
                      <TapButton
                        class={[styles.action, styles.danger]}
                        disabled={rows().length <= 1}
                        onTap={() => {
                          act({ type: 'delete', id: id() });
                          setRevealed(undefined);
                        }}
                      >
                        <SketchIcon name="trash" size={17} />
                        <span>Delete</span>
                      </TapButton>
                    </div>

                    <div
                      class={[
                        styles.content,
                        {
                          [styles.active!]: props.activeId === id(),
                          [styles.hiddenLayer!]: !layer().visible,
                          [styles.sliding!]: drag()?.id === id()
                        }
                      ]}
                      style={{ translate: `${offset()}px 0` }}
                      {...press}
                    >
                      <span class={styles.grip} data-part="grip" title="Drag to reorder">
                        <SketchIcon name="grip" size={16} />
                      </span>
                      <Show when={layer().clipping}>
                        <span class={styles.clipped} title="Clipped to the layer below">
                          <SketchIcon name="clip" size={14} />
                        </span>
                      </Show>
                      <span class={styles.text}>
                        <span class={styles.name}>{layer().name}</span>
                        <Show when={layer().alphaLock || layer().opacity < 1}>
                          <span class={styles.detail}>
                            <Show when={layer().alphaLock}>
                              <SketchIcon name="lock" size={11} />
                            </Show>
                            <Show when={layer().opacity < 1}>{Math.round(layer().opacity * 100)}%</Show>
                          </span>
                        </Show>
                      </span>
                      <span
                        class={styles.blend}
                        data-part="blend"
                        title={`${blendLabels[layer().blend]}: tap for blend mode and opacity`}
                      >
                        {blendLetters[layer().blend]}
                      </span>
                      <span class={styles.check} data-part="visibility" title={layer().visible ? 'Hide' : 'Show'}>
                        <span class={[styles.box, { [styles.checked!]: layer().visible }]}>
                          <Show when={layer().visible}>
                            <SketchIcon name="check" size={14} />
                          </Show>
                        </span>
                      </span>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        }
      >
        {(layer) => (
          <BlendSheet layer={layer()} below={belowOf(layer().id)} act={act} back={() => setSheetFor(undefined)} />
        )}
      </Show>
    </section>
  );

  /** The layer under `id`, which Merge down merges it into. */
  function belowOf(id: string) {
    const index = props.layers.findIndex((layer) => layer.id === id);
    return index > 0 ? props.layers[index - 1] : undefined;
  }
}

/**
 * A layer's blend mode, opacity, clipping and alpha lock in place of the list, with Merge down. Opacity is sent once
 * a drag lifts, so that a drag is one undo step.
 */
function BlendSheet(props: {
  layer: LayerInfo;
  below: LayerInfo | undefined;
  act: (action: LayerAction) => void;
  back: () => void;
}) {
  const id = untrack(() => props.layer.id);
  /** The opacity shown during a drag, before it is sent. */
  const [draft, setDraft] = createSignal<number>();
  let dragging = false;
  const update = (patch: Extract<LayerAction, { type: 'update' }>['patch']) => props.act({ type: 'update', id, patch });

  return (
    <div class={styles.sheet}>
      <div class={styles.sheetHeader}>
        <TapButton class={css.headerButton} title="Back to the layers (Esc)" onTap={() => props.back()}>
          <SketchIcon name="left" size={18} />
        </TapButton>
        <b>{props.layer.name}</b>
        <small>{blendLabels[props.layer.blend]}</small>
      </div>
      <PillScrubber
        setting={layerOpacity}
        value={draft() ?? Math.round(props.layer.opacity * 100)}
        onActive={(active) => {
          dragging = active;
          const value = draft();
          if (!active && value !== undefined) {
            setDraft(undefined);
            update({ opacity: value / 100 });
          }
        }}
        onChange={(value) => {
          if (dragging) {
            setDraft(value);
          } else {
            update({ opacity: value / 100 });
          }
        }}
      />
      <div class={styles.modes}>
        <For each={blendModes}>
          {(mode) => (
            <TapButton
              class={[styles.mode, { [styles.on!]: props.layer.blend === mode }]}
              onTap={() => update({ blend: mode })}
            >
              {blendLabels[mode]}
            </TapButton>
          )}
        </For>
      </div>
      <SwitchRow
        label="Clip to layer below"
        on={!!props.layer.clipping}
        onToggle={() => update({ clipping: !props.layer.clipping })}
      />
      <SwitchRow
        label="Lock transparent pixels"
        on={!!props.layer.alphaLock}
        onToggle={() => update({ alphaLock: !props.layer.alphaLock })}
      />
      <TapButton
        class={styles.merge}
        disabled={!props.below || !props.below.visible || !props.layer.visible}
        title="Merge this layer into the layer below"
        onTap={() => {
          props.act({ type: 'merge-down', id });
          props.back();
        }}
      >
        Merge down
      </TapButton>
    </div>
  );
}

/** A row's press after its first move: sliding to reveal actions, reordering, or scrolling the list. */
type RowDrag = {
  id: string;
  /** The row's place, top first, when the press started. */
  index: number;
  mode: 'swipe' | 'reorder' | 'scroll';
  /** The move since the press, in unscaled pixels. */
  dx: number;
  dy: number;
  /** Where the row's content was when the press started: 0, or revealing the actions. */
  base: number;
};

/** A swiped row's horizontal offset: it follows the press, with resistance past the revealed actions. */
function swipeOffset(drag: RowDrag) {
  const offset = drag.base + drag.dx;
  if (offset > 0) {
    return 0;
  }

  return offset < -actionsWidth ? -actionsWidth + (offset + actionsWidth) * 0.3 : offset;
}

/** The place, top first, a reordered row would drop at. */
function targetIndex(drag: Pick<RowDrag, 'index' | 'dy'>, count: number) {
  return Math.min(count - 1, Math.max(0, Math.round(drag.index + drag.dy / rowStep)));
}

const rowHeight = 44;
/** A row and the gap below it. */
const rowStep = rowHeight + 2;
/** The three revealed actions. */
const actionsWidth = 3 * 62;

const blendModes: readonly BlendMode[] = ['normal', 'multiply', 'screen', 'overlay'];

const blendLabels: Record<BlendMode, string> = {
  normal: 'Normal',
  multiply: 'Multiply',
  screen: 'Screen',
  overlay: 'Overlay'
};

/** Blend modes as Procreate abbreviates them on its layer cards. */
const blendLetters: Record<BlendMode, string> = {
  normal: 'N',
  multiply: 'M',
  screen: 'S',
  overlay: 'O'
};

/** A layer's opacity as a setting, for the blend sheet's scrubber. */
const layerOpacity = percentSetting('Opacity');
