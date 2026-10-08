import { createSignal, flush, For, Show, untrack } from 'solid-js';
import { SketchIcon } from '../../../../shared/ui/SketchIcon';
import { blendLabel, blendModes, type BlendMode, type LayerId } from '../../kit/createSketchCanvas';
import type { Studio } from '../../kit/createStudio';
import { LayerThumb } from '../../kit/LayerThumb';
import { pressHandlers } from '../../kit/pressHandlers';
import type { NumberSetting } from '../../kit/values';
import { galleryUi } from '../../kit/variant';
import { PillScrubber, TapButton } from './controls';
import css from './glass.module.css';
import styles from './LayersCard.module.css';
import { placed, type Box } from './layout';

/**
 * Procreate's Layers popover: layer cards with a live thumbnail, the name, the blend mode's letter (tap it for the
 * layer's blend mode and opacity) and a visibility checkbox; the active layer in blue and "+" at the top.
 *
 * Rows: tap to make a layer active (finishes), or tap its letter or checkbox; swipe left from anywhere on the row to
 * reveal Lock, Duplicate and Delete; drag by the grip, or anywhere while the list does not scroll, to reorder. A
 * vertical drag on a row of a list that scrolls scrolls it. The row owns all its presses, so that a swipe may start
 * on the letter or the checkbox.
 *
 * `onEscape` receives a handler that closes the blend sheet or the revealed actions first and reports whether it did.
 */
export function LayersCard(props: {
  studio: Studio;
  box: Box;
  done: () => void;
  onEscape: (handler: () => boolean) => void;
}) {
  const [revealed, setRevealed] = createSignal<LayerId>();
  const [sheetFor, setSheetFor] = createSignal<LayerId>();
  const [drag, setDrag] = createSignal<RowDrag>();
  const sheetLayer = () => props.studio.layers().find((layer) => layer.id === sheetFor());
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

  /** Runs a command on a layer: commands of the kit act on the active layer, so it becomes active first. */
  const onLayer = (id: LayerId, command: () => void) => {
    flush(() => props.studio.selectLayer(id));
    command();
    setRevealed(undefined);
  };

  return (
    <section class={[css.card, styles.card]} style={placed(props.box)} {...galleryUi}>
      <header class={css.cardHeader}>
        <h3>Layers</h3>
        <TapButton
          class={css.headerButton}
          title="Add a layer"
          onTap={() => {
            setSheetFor(undefined);
            props.studio.addLayer();
          }}
        >
          <SketchIcon name="plus" size={20} />
        </TapButton>
      </header>

      <Show
        when={sheetLayer()}
        fallback={
          <div class={styles.list} ref={list}>
            <For each={props.studio.layers()} keyed={(layer) => layer.id}>
              {(layer, index) => {
                const id = untrack(() => layer().id);
                /** What this row's press does, decided by its first move. */
                let mode: RowDrag['mode'] | undefined;
                /** The part of the row the press started on, which a tap acts on. */
                let part: string | undefined;
                let base = 0;
                let scrollStart = 0;

                const offset = () => {
                  const current = drag();
                  if (current?.id === id && current.mode === 'swipe') {
                    return swipeOffset(current);
                  }

                  return revealed() === id ? -actionsWidth : 0;
                };
                const shift = () => {
                  const current = drag();
                  if (!current || current.mode !== 'reorder') {
                    return 0;
                  }

                  const count = props.studio.layers().length;
                  if (current.id === id) {
                    return Math.min(
                      (count - 1 - current.index) * rowStep,
                      Math.max(-current.index * rowStep, current.dy)
                    );
                  }

                  const target = targetIndex(current, count);
                  const at = index();
                  if (current.index < target && at > current.index && at <= target) {
                    return -rowStep;
                  }

                  if (current.index > target && at >= target && at < current.index) {
                    return rowStep;
                  }

                  return 0;
                };
                const press = pressHandlers({
                  start: (_press, event) => {
                    part = (event.target as Element).closest<HTMLElement>('[data-part]')?.dataset.part;
                    mode = part === 'grip' ? 'reorder' : undefined;
                    base = revealed() === id ? -actionsWidth : 0;
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
                      if (mode === 'swipe' && revealed() !== id) {
                        setRevealed(undefined);
                      }
                    }

                    if (mode === 'scroll') {
                      list.scrollTop = scrollStart - dy;
                      return;
                    }

                    setDrag({ id, index: index(), mode, dx, dy, base });
                  },
                  end: () => {
                    const finished = drag();
                    setDrag(undefined);
                    mode = undefined;
                    if (finished?.mode === 'swipe') {
                      setRevealed(swipeOffset(finished) < -actionsWidth / 2 ? id : undefined);
                    } else if (finished?.mode === 'reorder') {
                      const steps = targetIndex(finished, props.studio.layers().length) - finished.index;
                      flush(() => props.studio.selectLayer(id));
                      for (let step = 0; step < Math.abs(steps); step++) {
                        flush(() => props.studio.moveLayer(steps < 0 ? 'up' : 'down'));
                      }
                    }
                  },
                  tap: () => {
                    mode = undefined;
                    if (revealed() !== undefined) {
                      setRevealed(undefined);
                    } else if (part === 'blend') {
                      setSheetFor(id);
                    } else if (part === 'visibility') {
                      props.studio.updateLayer(id, { visible: !layer().visible });
                    } else {
                      props.studio.selectLayer(id);
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
                    class={[styles.row, { [styles.lifted!]: drag()?.id === id && drag()?.mode === 'reorder' }]}
                    style={{ translate: `0 ${shift()}px` }}
                  >
                    <div class={styles.actions} style={{ width: `${-offset()}px` }}>
                      <TapButton
                        class={styles.action}
                        onTap={() => {
                          props.studio.updateLayer(id, { locked: !layer().locked });
                          setRevealed(undefined);
                        }}
                      >
                        <SketchIcon name={layer().locked ? 'unlock' : 'lock'} size={17} />
                        <span>{layer().locked ? 'Unlock' : 'Lock'}</span>
                      </TapButton>
                      <TapButton class={styles.action} onTap={() => onLayer(id, () => props.studio.duplicateLayer())}>
                        <SketchIcon name="copy" size={17} />
                        <span>Duplicate</span>
                      </TapButton>
                      <TapButton
                        class={[
                          styles.action,
                          styles.danger,
                          { [styles.unavailable!]: props.studio.layers().length <= 1 }
                        ]}
                        onTap={() => onLayer(id, () => props.studio.deleteLayer())}
                      >
                        <SketchIcon name="trash" size={17} />
                        <span>Delete</span>
                      </TapButton>
                    </div>

                    <div
                      class={[
                        styles.content,
                        {
                          [styles.active!]: props.studio.activeLayer() === id,
                          [styles.hiddenLayer!]: !layer().visible,
                          [styles.sliding!]: drag()?.id === id
                        }
                      ]}
                      style={{ translate: `${offset()}px 0` }}
                      {...press}
                    >
                      <span class={styles.grip} data-part="grip" title="Drag to reorder">
                        <SketchIcon name="grip" size={16} />
                      </span>
                      <LayerThumb studio={props.studio} layer={id} width={44} height={30} class={styles.thumb} />
                      <span class={styles.text}>
                        <span class={styles.name}>{layer().name}</span>
                        <Show when={layer().locked || layer().opacity < 100}>
                          <span class={styles.detail}>
                            <Show when={layer().locked}>
                              <SketchIcon name="lock" size={11} />
                            </Show>
                            <Show when={layer().opacity < 100}>{Math.round(layer().opacity)}%</Show>
                          </span>
                        </Show>
                      </span>
                      <span
                        class={styles.blend}
                        data-part="blend"
                        title={`${blendLabel(layer().blend)}: tap for blend mode and opacity`}
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
          <div class={styles.sheet}>
            <div class={styles.sheetHeader}>
              <TapButton class={css.headerButton} title="Back to the layers (Esc)" onTap={() => setSheetFor(undefined)}>
                <SketchIcon name="left" size={18} />
              </TapButton>
              <b>{layer().name}</b>
              <small>{blendLabel(layer().blend)}</small>
            </div>
            <PillScrubber
              setting={layerOpacity}
              value={layer().opacity}
              onChange={(opacity) => props.studio.updateLayer(layer().id, { opacity })}
            />
            <div class={styles.modes}>
              <For each={blendModes}>
                {(mode) => (
                  <TapButton
                    class={[styles.mode, { [styles.on!]: layer().blend === mode }]}
                    onTap={() => props.studio.updateLayer(layer().id, { blend: mode })}
                  >
                    {blendLabel(mode)}
                  </TapButton>
                )}
              </For>
            </div>
          </div>
        )}
      </Show>
    </section>
  );
}

/** A row's press after its first move: sliding to reveal actions, reordering, or scrolling the list. */
type RowDrag = {
  id: LayerId;
  /** The row's place when the press started. */
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

/** The place a reordered row would drop at. */
function targetIndex(drag: RowDrag, count: number) {
  return Math.min(count - 1, Math.max(0, Math.round(drag.index + drag.dy / rowStep)));
}

const rowHeight = 44;
/** A row and the gap below it. */
const rowStep = rowHeight + 2;
/** The three revealed actions. */
const actionsWidth = 3 * 58;

/** Blend modes as Procreate abbreviates them on its layer cards. */
const blendLetters: Record<BlendMode, string> = {
  normal: 'N',
  darken: 'D',
  multiply: 'M',
  'color-burn': 'Cb',
  lighten: 'L',
  screen: 'S',
  'color-dodge': 'Cd',
  overlay: 'O',
  'soft-light': 'Sl',
  'hard-light': 'Hl',
  difference: 'Di',
  hue: 'H',
  saturation: 'Sa',
  color: 'C',
  luminosity: 'Lu'
};

/** A layer's opacity as a setting, for the blend sheet's scrubber. */
const layerOpacity: NumberSetting = {
  kind: 'number',
  key: 'opacity',
  label: 'Opacity',
  short: 'Op',
  min: 0,
  max: 100,
  unit: '%',
  presets: [0, 5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 75, 80, 85, 90, 95, 100]
};
