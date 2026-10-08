import { createSignal, For, Show } from 'solid-js';
import { SketchIcon, type SketchIconName } from '../../../../shared/ui/SketchIcon';
import { blendLabel, blendModes, type Layer, type LayerId, type Point } from '../../kit/createSketchCanvas';
import type { Studio } from '../../kit/createStudio';
import { LayerThumb } from '../../kit/LayerThumb';
import { pressHandlers } from '../../kit/pressHandlers';
import { galleryUi } from '../../kit/variant';
import { clamp, openSide, shiftRect, unionRect, type Rect } from './geometry';
import styles from './Hud.module.css';
import { createTrembleGuard, placeStrip, type StripContext } from './strip';
import { createWheelSteps, rectStyle } from './ValueStrip';

/**
 * Opens the layer stack, top layer first, with the active layer's row at `context.home` and the pen near the row's
 * edge on the open side. Beyond that edge lies a second tier for the row under the pen: visibility, opacity and
 * blend mode.
 *
 * Dragging: slide up and down to choose a layer, lift to select it. Slide on into the second tier to work on that
 * row instead: lift on the eye to show or hide it; in the opacity or blend cell, slide up and down to change it live.
 * In tap mode every row has its eye, the active row its opacity and blend, and actions follow below the stack.
 */
export function createLayerStrip(context: StripContext) {
  const { studio, home } = context;
  const side = openSide(context.hand);
  const start = Math.max(
    0,
    studio.layers().findIndex((layer) => layer.id === studio.activeLayer())
  );
  const count = studio.layers().length;
  const main0: Rect = {
    left: side > 0 ? home.x - mainWidth + penInset : home.x - penInset,
    top: home.y - columnInset - start * rowPitch - rowHeight / 2,
    width: mainWidth,
    height: count * rowPitch - (rowPitch - rowHeight) + columnInset * 2
  };
  const tier0: Rect = {
    left: side > 0 ? main0.left + mainWidth + tierGap : main0.left - tierGap - tierWidth,
    top: main0.top,
    width: tierWidth,
    height: main0.height
  };
  const parts = [main0, tier0];
  if (context.via !== 'drag') {
    // Room for a few added layers and the actions below the stack.
    parts.push({ ...main0, top: main0.top + main0.height, height: rowPitch * 2 + actionsHeight });
  }

  const delta = placeStrip(context, unionRect(...parts));
  const main = shiftRect(main0, delta);
  const tierLeft = tier0.left + delta.x;
  /** Top of row `index`, in client pixels. */
  const rowTop = (index: number) => main.top + columnInset + index * rowPitch;
  const rowAt = (point: Point) => {
    const list = studio.layers();
    const y = point.y - main.top - columnInset;
    const inColumn =
      Math.abs(point.x - (main.left + mainWidth / 2)) <= mainWidth / 2 + 40 &&
      y >= -24 &&
      y <= list.length * rowPitch + 24;
    return inColumn ? clamp(Math.floor(y / rowPitch), 0, list.length - 1) : undefined;
  };
  /** The tier cell under `x`, counted from the main column outward, or `undefined` outside the tier. */
  const cellAt = (x: number): TierCell | undefined => {
    const outward = side > 0 ? x - tierLeft : tierLeft + tierWidth - x;
    if (outward < -tierGap / 2 || outward > tierWidth + 40) {
      return undefined;
    }

    return outward < cellWidths.eye + cellGap / 2
      ? 'eye'
      : outward < cellWidths.eye + cellGap + cellWidths.opacity + cellGap / 2
        ? 'opacity'
        : 'blend';
  };

  const guard = createTrembleGuard(context);
  const [hovered, setHovered] = createSignal<number>();
  const [locked, setLocked] = createSignal<number>();
  const [cell, setCell] = createSignal<TierCell>();
  let state: { hovered?: number; locked?: number; cell?: TierCell } = {};
  let entry: { y: number; opacity: number; blend: number } | undefined;
  /** Layers edited in the second tier, as they were before, for `cancel`. */
  const originals = new Map<LayerId, Pick<Layer, 'visible' | 'opacity' | 'blend'>>();
  const show = (next: typeof state) => {
    state = next;
    setHovered(next.hovered);
    setLocked(next.locked);
    setCell(next.cell);
  };
  const edit = (layer: Layer, change: Partial<Pick<Layer, 'visible' | 'opacity' | 'blend'>>) => {
    if (!originals.has(layer.id)) {
      originals.set(layer.id, { visible: layer.visible, opacity: layer.opacity, blend: layer.blend });
    }

    studio.updateLayer(layer.id, change);
  };
  const choose = (point: Point) => {
    const row = state.locked ?? state.hovered;
    const tierCell = row === undefined ? undefined : cellAt(point.x);
    const layer = row === undefined ? undefined : studio.layers()[row];
    if (row === undefined || tierCell === undefined || !layer) {
      show({ hovered: rowAt(point) });
      return;
    }

    if (tierCell !== state.cell) {
      entry = { y: point.y, opacity: layer.opacity, blend: blendModes.indexOf(layer.blend) };
    }

    show({ hovered: row, locked: row, cell: tierCell });
    if (tierCell === 'opacity' && entry) {
      const opacity = clamp(Math.round(entry.opacity + (entry.y - point.y) / 1.5), 0, 100);
      if (opacity !== layer.opacity) {
        edit(layer, { opacity });
      }
    } else if (tierCell === 'blend' && entry) {
      const blend = blendModes[clamp(entry.blend + Math.round((point.y - entry.y) / 18), 0, blendModes.length - 1)]!;
      if (blend !== layer.blend) {
        edit(layer, { blend });
      }
    }
  };

  return {
    kind: 'layers' as const,
    fn: 'layers' as const,
    side,
    main,
    tierLeft,
    rowTop,
    hovered,
    locked,
    cell,
    finishes: true,
    move(point: Point) {
      if (guard(point)) {
        choose(point);
      }
    },
    tap(point: Point) {
      choose(point);
    },
    step(dx: number, dy: number) {
      const from = state.hovered ?? studio.layers().findIndex((layer) => layer.id === studio.activeLayer());
      show({ hovered: clamp(from - (dy || -dx), 0, studio.layers().length - 1) });
    },
    commit() {
      const list = studio.layers();
      let changed = false;
      if (state.cell === 'eye' && state.locked !== undefined && list[state.locked]) {
        const layer = list[state.locked]!;
        edit(layer, { visible: !layer.visible });
        changed = true;
      }

      for (const [id, before] of originals) {
        const layer = list.find((entry) => entry.id === id);
        changed ||= !!layer && (layer.opacity !== before.opacity || layer.blend !== before.blend);
      }

      const picked = state.cell === undefined && state.hovered !== undefined ? list[state.hovered] : undefined;
      if (picked && picked.id !== studio.activeLayer()) {
        studio.selectLayer(picked.id);
        changed = true;
      }

      originals.clear();
      show({});
      return changed;
    },
    cancel() {
      for (const [id, before] of originals) {
        studio.updateLayer(id, before);
      }

      originals.clear();
      show({});
    }
  };
}

/** An open layer strip. */
export type LayerStrip = ReturnType<typeof createLayerStrip>;

/**
 * The layer stack: rows with a live thumbnail, the name and the blend mode and opacity; the active row is marked.
 * The second tier shows beside the row under the pen (dragging) or beside every row (tap mode: the eye everywhere,
 * opacity and blend on the active row), and tap mode adds New, Duplicate, Up, Down and Delete below.
 */
export function LayerStripView(props: {
  strip: LayerStrip;
  studio: Studio;
  interactive: boolean;
  /** Hears that a tap selected a layer: a finished action. */
  committed: (changed: boolean) => void;
}) {
  const strip = props.strip;
  const studio = props.studio;
  const tierRow = (index: number) => (props.interactive ? undefined : (strip.locked() ?? strip.hovered())) === index;
  const height = () => studio.layers().length * rowPitch - (rowPitch - rowHeight) + columnInset * 2;
  const actions: { icon: SketchIconName; title: string; run: () => void }[] = [
    { icon: 'newLayer', title: 'New layer', run: () => studio.addLayer() },
    { icon: 'copy', title: 'Duplicate layer', run: () => studio.duplicateLayer() },
    { icon: 'up', title: 'Move up', run: () => studio.moveLayer('up') },
    { icon: 'down', title: 'Move down', run: () => studio.moveLayer('down') },
    { icon: 'trash', title: 'Delete layer', run: () => studio.deleteLayer() }
  ];

  return (
    <>
      <div
        {...galleryUi}
        class={[styles.strip, styles.column, { [styles.passive!]: !props.interactive }]}
        style={{ ...rectStyle(strip.main), height: `${height()}px` }}
      />
      <For each={studio.layers()} keyed={(layer) => layer.id}>
        {(layer, index) => {
          const active = () => studio.activeLayer() === layer().id;
          const showTier = () => props.interactive || tierRow(index());
          const select = pressHandlers({
            tap: () => {
              studio.selectLayer(layer().id);
              props.committed(true);
            }
          });
          return (
            <>
              <div
                {...galleryUi}
                {...(props.interactive ? select : {})}
                class={[
                  styles.layerRow,
                  {
                    [styles.hot!]: strip.hovered() === index() && strip.cell() === undefined,
                    [styles.current!]: active(),
                    [styles.dim!]: !layer().visible,
                    [styles.passive!]: !props.interactive,
                    [styles.mirrored!]: strip.side < 0
                  }
                ]}
                style={{
                  left: `${strip.main.left + columnInset}px`,
                  top: `${strip.rowTop(index())}px`,
                  width: `${mainWidth - columnInset * 2}px`,
                  height: `${rowHeight}px`
                }}
              >
                <LayerThumb studio={studio} layer={layer().id} width={40} height={28} class={styles.layerThumb} />
                <span class={styles.layerText}>
                  <b>{layer().name}</b>
                  <small>
                    {blendLabel(layer().blend)} · {layer().opacity}%{layer().locked ? ' · locked' : ''}
                  </small>
                </span>
              </div>
              <Show when={showTier()}>
                <TierCells
                  strip={strip}
                  studio={studio}
                  layer={layer()}
                  top={strip.rowTop(index())}
                  interactive={props.interactive}
                  full={!props.interactive || active()}
                  hot={strip.locked() === index() ? strip.cell() : undefined}
                />
              </Show>
            </>
          );
        }}
      </For>
      <Show when={props.interactive}>
        <div
          class={styles.actions}
          style={{
            left: `${strip.main.left}px`,
            top: `${strip.main.top + height() + 6}px`,
            width: `${mainWidth}px`
          }}
        >
          <For each={actions}>
            {(action) => {
              const press = pressHandlers({ tap: () => action.run() });
              return (
                <button {...galleryUi} {...press} class={styles.button} title={action.title}>
                  <SketchIcon name={action.icon} size={16} />
                </button>
              );
            }}
          </For>
        </div>
      </Show>
    </>
  );
}

/**
 * A row's second tier: the eye, and with `full` the opacity and the blend mode. While dragging these are targets
 * for the pen (`hot` marks the cell under it); in tap mode the eye toggles, opacity scrubs by sliding (the wheel
 * steps 5 %) and the blend button cycles (the wheel steps both ways).
 */
function TierCells(props: {
  strip: LayerStrip;
  studio: Studio;
  layer: Layer;
  top: number;
  interactive: boolean;
  full: boolean;
  hot: TierCell | undefined;
}) {
  const studio = props.studio;
  const id = () => props.layer.id;
  const cellLeft = (cell: TierCell) => {
    const outward = cell === 'eye' ? 0 : cell === 'opacity' ? cellWidths.eye + cellGap : tierWidth - cellWidths.blend;
    return props.strip.side > 0
      ? props.strip.tierLeft + outward
      : props.strip.tierLeft + tierWidth - outward - cellWidths[cell];
  };
  const box = (cell: TierCell) => ({
    left: `${cellLeft(cell)}px`,
    top: `${props.top}px`,
    width: `${cellWidths[cell]}px`,
    height: `${rowHeight}px`
  });
  let scrub: { opacity: number } | undefined;
  const opacityWheel = createWheelSteps((by) =>
    studio.updateLayer(id(), { opacity: clamp(props.layer.opacity + by * 5, 0, 100) })
  );
  const blendBy = (by: number) => {
    const index = blendModes.indexOf(props.layer.blend);
    studio.updateLayer(id(), { blend: blendModes[(index + by + blendModes.length) % blendModes.length]! });
  };
  const blendWheel = createWheelSteps((by) => blendBy(-by));
  // Created once: a spread that re-ran would replace the handlers and end a scrub in progress.
  const presses = {
    eye: pressHandlers({ tap: () => studio.updateLayer(id(), { visible: !props.layer.visible }) }),
    blend: pressHandlers({ tap: () => blendBy(1) }),
    opacity: pressHandlers({
      start: () => {
        scrub = { opacity: props.layer.opacity };
      },
      move: (press) => {
        const moved = press.point.x - press.start.x - (press.point.y - press.start.y);
        studio.updateLayer(id(), { opacity: clamp(Math.round((scrub?.opacity ?? 100) + moved / 1.5), 0, 100) });
      }
    })
  };
  const handlers = (cell: TierCell) => (props.interactive ? presses[cell] : {});

  return (
    <>
      <div
        {...galleryUi}
        {...handlers('eye')}
        class={[styles.tierCell, { [styles.hot!]: props.hot === 'eye', [styles.passive!]: !props.interactive }]}
        style={box('eye')}
        title={props.layer.visible ? 'Hide' : 'Show'}
      >
        <SketchIcon name={props.layer.visible ? 'eye' : 'hidden'} size={16} />
      </div>
      <Show when={props.full}>
        <div
          {...galleryUi}
          {...handlers('opacity')}
          class={[styles.tierCell, { [styles.hot!]: props.hot === 'opacity', [styles.passive!]: !props.interactive }]}
          style={{ ...box('opacity'), '--fill': `${props.layer.opacity}%` }}
          onWheel={(event) => props.interactive && opacityWheel(event)}
        >
          <span class={styles.tierFill} />
          <b>{props.layer.opacity}%</b>
          <Show when={props.hot === 'opacity'}>
            <i class={styles.scrubHint}>↕</i>
          </Show>
        </div>
        <div
          {...galleryUi}
          {...handlers('blend')}
          class={[styles.tierCell, { [styles.hot!]: props.hot === 'blend', [styles.passive!]: !props.interactive }]}
          style={box('blend')}
          onWheel={(event) => props.interactive && blendWheel(event)}
        >
          <b>{blendLabel(props.layer.blend)}</b>
          <Show when={props.hot === 'blend'}>
            <i class={styles.scrubHint}>↕</i>
          </Show>
        </div>
      </Show>
    </>
  );
}

/** A cell of a row's second tier. */
type TierCell = 'eye' | 'opacity' | 'blend';

const mainWidth = 184;
const rowHeight = 36;
const rowPitch = 38;
/** Padding of the column around its rows. */
const columnInset = 4;
/** How far into the main column's edge on the open side the pen sits. */
const penInset = 34;
const cellGap = 3;
const cellWidths = { eye: 32, opacity: 50, blend: 84 } as const;
const tierWidth = cellWidths.eye + cellWidths.opacity + cellWidths.blend + cellGap * 2;
/** Gap between the main column and the second tier. */
const tierGap = 6;
const actionsHeight = 36;
