import { createEventListener } from '@solid-primitives/event-listener';
import { createMemo, createSignal, For, onCleanup, Show, untrack, type Accessor, type Setter } from 'solid-js';
import { HueTriangle } from '../../../../features/hue-triangle';
import { tools } from '../../kit/catalog';
import { blendLabel, type Point } from '../../kit/createSketchCanvas';
import { LayerThumb } from '../../kit/LayerThumb';
import { navigationDrag } from '../../kit/navigationDrag';
import { pressHandlers, type Press } from '../../kit/pressHandlers';
import { StrokePreview } from '../../kit/StrokePreview';
import { formatValue, fractionOf, nearestPreset, stepPreset, valueAt } from '../../kit/values';
import { galleryUi, type Summon, type VariantProps } from '../../kit/variant';
import { CellContent, cellFill, readTarget as readValue, recentColors, settingText, targetSetting } from './contents';
import { distanceTo, hexagon, lensPoint, lensPower, lensScale, SQRT3 } from './geometry';
import styles from './Hive.module.css';
import {
  flyoutCells,
  hiveCells,
  opacitySetting,
  paletteLift,
  type ChoiceSetting,
  type Flyout,
  type HiveAct,
  type HiveCell,
  type ValueTarget
} from './layout';
import { grey, paletteColor, type PaletteState } from './palette';

/**
 * Hive: the whole cluster as one honeycomb growing out of the pen, after the Apple Watch's app grid, hexagonal colour
 * pickers and strategy-game maps. The Puck is the big hexagon under the pen (six wedges: pan, zoom, rotate, undo,
 * redo, size); tools, colour, brush and settings, layers and view extras are groups of cells tessellated around it.
 * A fisheye follows the pointer (or a pressing finger) and magnifies the cells near it, never moving what lies under
 * the pointer. Value cells scrub by dragging and unfold a clock of stops when tapped; a layer unfolds its actions.
 *
 * The palette's turn and middle grey outlive an opening, so that the palette stays as the user left it.
 */
export function HiveVariant(props: VariantProps) {
  const [palette, setPalette] = createSignal<PaletteState>({ hue: 0, light: 1 });
  let release: (() => boolean) | undefined;
  untrack(() => props.onHoldRelease(() => release?.() ?? false));

  return (
    <Show when={props.summon}>
      {(summon) => (
        <Hive
          variant={props}
          summon={summon}
          palette={palette}
          setPalette={setPalette}
          bindRelease={(handler) => {
            release = handler;
          }}
        />
      )}
    </Show>
  );
}

/** The open Hive: layout, lens, input and drawing for one opening (a new `serial` resets its flyouts and focus). */
function Hive(props: {
  variant: VariantProps;
  summon: Accessor<Summon>;
  palette: Accessor<PaletteState>;
  setPalette: Setter<PaletteState>;
  /** Registers what lifting Space does while this Hive is mounted. */
  bindRelease: (handler: (() => boolean) | undefined) => void;
}) {
  const studio = untrack(() => props.variant.studio);
  const navigation = navigationDrag(studio);
  const serial = createMemo(() => props.summon().serial);
  const hand = () => props.variant.hand;
  const [viewport, setViewport] = createSignal({ width: innerWidth, height: innerHeight });
  const layerIds = createMemo(() => studio.layers().map((entry) => entry.id), {
    equals: (a, b) => a.length === b.length && a.every((id, index) => id === b[index])
  });

  /** The cells at full size, or scaled down (to 70% at most) when the window cannot hold them. */
  const layout = createMemo(() => {
    const input = { hand: hand(), settings: studio.settings(), layers: layerIds() };
    const full = hiveCells({ ...input, unit: baseUnit });
    const box = bounds(full);
    const { width, height } = viewport();
    const fit = Math.min(
      1,
      (height - margin.top - margin.edge) / (box.bottom - box.top),
      (width - margin.edge * 2) / (box.right - box.left)
    );
    if (fit >= 1) {
      return { cells: full, unit: baseUnit, box };
    }

    const unit = baseUnit * Math.max(0.7, fit);
    const cells = hiveCells({ ...input, unit });
    return { cells, unit, box: bounds(cells) };
  });

  /** The Puck's centre on screen: the opening point, moved just enough to keep the whole Hive in the window. */
  const origin = createMemo(() => {
    const at = props.summon().at;
    const { box } = layout();
    const { width, height } = viewport();
    return {
      x: clampInto(at.x, margin.edge - box.left, width - margin.edge - box.right),
      y: clampInto(at.y, margin.top - box.top, height - margin.edge - box.bottom)
    };
  });

  const [flyouts, setFlyouts] = createSignal<readonly Flyout[]>(() => {
    serial();
    return [];
  });

  /** The topmost unfolded flyout and its cells, shifted into the window; a layer's flyout follows its layer. */
  const flyout = createMemo(() => {
    const top = flyouts().at(-1);
    if (!top) {
      return undefined;
    }

    if (top.kind === 'wheel') {
      return { top, cells: [] };
    }

    const { unit, cells: hive } = layout();
    const anchored =
      top.kind === 'layer' ? { ...top, at: hive.find((cell) => cell.id === `layer:${top.layer}`)?.at ?? top.at } : top;
    const placed = flyoutCells(anchored, unit, hand());
    const box = bounds(placed);
    const center = origin();
    const { width, height } = viewport();
    const dx = shiftInto(center.x + box.left, center.x + box.right, margin.edge, width - margin.edge);
    const dy = shiftInto(center.y + box.top, center.y + box.bottom, margin.top, height - margin.edge);
    if (dx === 0 && dy === 0) {
      return { top: anchored, cells: placed };
    }

    const shifted = { ...anchored, at: { x: anchored.at.x + dx, y: anchored.at.y + dy } };
    return { top: shifted, cells: flyoutCells(shifted, unit, hand()) };
  });

  /** What the pointer is doing: navigating and sizing hide everything but the Puck. */
  const [mode, setMode] = createSignal<'idle' | 'nav' | 'size' | 'scrub'>('idle');
  const [hovered, setHovered] = createSignal<string>();
  const [pressed, setPressed] = createSignal<string>();
  const [keyFocus, setKeyFocus] = createSignal<string | undefined>(() => {
    serial();
    return undefined;
  });
  /** A finger's position while it presses, so that the caption shows above it rather than under it. */
  const [finger, setFinger] = createSignal<Point>();

  const [focus, setFocus] = createSignal<Point>({ x: 0, y: 0 });
  const [amount, setAmount] = createSignal(0);
  /** Everything the projection needs; unchanged by focus moves while the lens is off, so nothing redraws then. */
  const lens = createMemo(() => ({ origin: origin(), focus: focus(), amount: amount() }), {
    equals: (a, b) =>
      a.origin.x === b.origin.x &&
      a.origin.y === b.origin.y &&
      a.amount === b.amount &&
      (a.amount === 0 || (a.focus.x === b.focus.x && a.focus.y === b.focus.y))
  });

  const away = (cell: HiveCell) => (mode() === 'nav' || mode() === 'size') && cell.group !== 'puck';
  /** The cells that take input: the flyout's while one is open, otherwise the Hive's. */
  const liveCells = () => flyout()?.cells ?? layout().cells;
  const cellById = (id: string | undefined) =>
    id === undefined ? undefined : (liveCells().find((cell) => cell.id === id) ?? undefined);

  let lensGoal = 0;
  let lensFrame: number | undefined;
  let lensTime = 0;
  let press: PressState | undefined;
  /** The last cell a press or key activated, which lifting Space must not activate again. */
  let lastActivated: string | undefined;
  let lastPointer: Point = untrack(() => props.summon().at);
  let wheelRest = 0;
  /** The opening whose held pointer (see `Summon.heldPointer`) has lifted. */
  let liftedFor: number | undefined;

  onCleanup(() => {
    if (lensFrame !== undefined) {
      cancelAnimationFrame(lensFrame);
    }

    clearTimeout(press?.timer);
  });

  const handlers = pressHandlers({
    start(started) {
      const cell = probe(started.point).cell;
      lastPointer = started.point;
      press = { cell, gesture: gestureOf(cell), travel: 0, unfolded: false };
      lastActivated = cell?.id;
      setPressed(cell?.id);
      if (started.pointerType === 'touch') {
        setFinger(started.point);
        hover(started.point);
      }

      prepare(press, started);
    },
    move(current) {
      lastPointer = current.point;
      if (press) {
        drag(press, current);
      }
    },
    tap() {
      const ended = endPress();
      if (ended?.unfolded) {
        return;
      }

      if (ended?.cell) {
        activate(ended.cell);
      } else if (flyouts().length > 0) {
        setFlyouts([]);
      }
    },
    end(current) {
      const ended = endPress();
      if (ended?.gesture !== 'slide') {
        return;
      }

      const lifted = probe(current.point).cell;
      if (lifted && lifted.id === ended.cell?.id && !ended.unfolded) {
        activate(lifted);
      } else if (lifted && pickable(lifted)) {
        activate(lifted);
      }
    },
    cancel() {
      endPress();
    }
  });

  createEventListener(window, 'resize', () => setViewport({ width: innerWidth, height: innerHeight }));
  createEventListener(window, 'pointermove', (event) => {
    const point = { x: event.clientX, y: event.clientY };
    if (holding(event)) {
      lastPointer = point;
      hover(point, event.pointerType === 'touch');
      return;
    }

    if (press || event.pointerType === 'touch') {
      return;
    }

    lastPointer = point;
    hover(point);
  });
  createEventListener(window, 'pointerout', (event) => {
    if (!event.relatedTarget && !press && event.pointerType !== 'touch') {
      setHovered(undefined);
      aimLens(0);
    }
  });
  // A press-drag-release from the opening press (right button, long-press): lifting over a cell picks it.
  createEventListener(window, 'pointerup', (event) => {
    if (!holding(event)) {
      return;
    }

    liftedFor = serial();
    const point = { x: event.clientX, y: event.clientY };
    const opened = props.summon().at;
    setFinger(undefined);
    if (Math.hypot(point.x - opened.x, point.y - opened.y) < heldTravel) {
      return;
    }

    const cell = probe(point).cell;
    if (cell && pickable(cell)) {
      activate(cell);
    }
  });
  createEventListener(window, 'pointercancel', (event) => {
    if (holding(event)) {
      liftedFor = serial();
    }
  });
  createEventListener(window, 'keydown', onKey, { capture: true });

  props.bindRelease(() => {
    if (flyouts().length > 0) {
      return true;
    }

    const cell = cellById(hovered());
    const opened = props.summon().at;
    const moved = Math.hypot(lastPointer.x - opened.x, lastPointer.y - opened.y) >= heldTravel;
    if (cell && moved && cell.id !== lastActivated && confirmsOnRelease(cell)) {
      activate(cell);
    }

    return false;
  });
  onCleanup(() => props.bindRelease(undefined));

  const [root, setRoot] = createSignal<HTMLDivElement>();
  createEventListener(root, 'wheel', onWheel, { passive: false });

  const project = (point: Point, view = lens()) => {
    const mapped = lensPoint(point, view.focus, view.amount);
    return { x: view.origin.x + mapped.x, y: view.origin.y + mapped.y };
  };
  const pointsOf = (shape: readonly Point[]) => {
    const view = lens();
    return shape
      .map((point) => {
        const mapped = project(point, view);
        return `${mapped.x.toFixed(1)},${mapped.y.toFixed(1)}`;
      })
      .join(' ');
  };
  /** A cell's lensed centre and the lens's magnification there, for its contents. */
  const placeOf = (cell: HiveCell) => {
    const view = lens();
    const at = project(cell.at, view);
    return { ...at, scale: lensScale(cell.at, view.focus, view.amount) };
  };
  const contentTransform = (cell: HiveCell) => {
    const place = placeOf(cell);
    return `translate(${place.x.toFixed(1)} ${place.y.toFixed(1)}) scale(${place.scale.toFixed(3)})`;
  };
  const stateOf = (cell: HiveCell) => ({
    hovered: hovered() === cell.id,
    pressed: pressed() === cell.id,
    on: isOn(cell)
  });

  const onCells = createMemo(() => [...layout().cells, ...(flyout()?.cells ?? [])].filter(isOn));
  const canvasCells = createMemo(() =>
    layout().cells.filter((cell) => cell.act.kind === 'preset' || cell.act.kind === 'layer')
  );
  const puckHalo = createMemo(() => hexagon({ x: 0, y: 0 }, ((layout().unit / SQRT3) * 4) / SQRT3 + haloWidth, true));

  /** The caption: what the hovered, pressed or focused cell is and does, above it (or above a pressing finger). */
  const caption = createMemo(() => {
    const scrubbing = mode() !== 'idle';
    const cell = scrubbing ? cellById(pressed()) : (cellById(hovered()) ?? cellById(keyFocus()));
    if (!cell || mode() === 'nav' || cell.act.kind === 'empty') {
      return undefined;
    }

    const text = captionFor(cell);
    const place = placeOf(cell);
    const touch = finger();
    // Above a pressing finger; above the whole Puck for its wedges, so that scrubbing the size hides nothing.
    const top =
      cell.group === 'puck'
        ? origin().y - (layout().unit / SQRT3) * 2 - 8
        : place.y - (cell.size / SQRT3) * place.scale - 7;
    const y = touch ? Math.min(touch.y - 58, top) : top;
    const x = Math.min(viewport().width - 90, Math.max(90, touch?.x ?? place.x));
    return { ...text, x, y };
  });

  /** Where the colour wheel's middle sits on screen while it is unfolded, kept inside the window. */
  const wheelAt = () => {
    const top = flyout()?.top;
    if (top?.kind !== 'wheel') {
      return undefined;
    }

    const center = origin();
    const { width, height } = viewport();
    const half = wheelSize / 2;
    return {
      x: clampInto(center.x + top.at.x, margin.edge + half, width - margin.edge - half),
      y: clampInto(center.y + top.at.y, margin.top + half, height - margin.edge - half)
    };
  };

  const sizeRing = () => {
    if (mode() !== 'size') {
      return undefined;
    }

    return (studio.number('size') * studio.view().scale) / 2;
  };

  return (
    <div ref={setRoot} class={[styles.hive, { [styles.hidden!]: props.variant.hidden }]}>
      <svg
        class={[styles.layer, { [styles.dimmed!]: !!flyout() }]}
        style={{ 'transform-origin': `${origin().x}px ${origin().y}px` }}
      >
        <g {...galleryUi} {...handlers} class={styles.live}>
          <g class={styles.halo}>
            <polygon points={pointsOf(puckHalo())} />
            <For each={layout().cells} keyed={(cell) => cell.id}>
              {(cell) => (
                <Show when={cell().group !== 'puck'}>
                  <polygon points={pointsOf(grow(cell().hit, cell().at))} class={{ [styles.away!]: away(cell()) }} />
                </Show>
              )}
            </For>
          </g>
          <For each={layout().cells} keyed={(cell) => cell.id}>
            {(cell) => <CellView cell={cell()} />}
          </For>
        </g>
      </svg>

      <div class={[styles.layer, { [styles.dimmed!]: !!flyout() }]}>
        <For each={canvasCells()} keyed={(cell) => cell.id}>
          {(cell) => {
            const box = () => ({ width: cell().size - 2, height: ((cell().size - 2) * 2) / SQRT3 });
            const act = () => cell().act;
            const place = createMemo(() => placeOf(cell()));
            return (
              <div
                class={[styles.canvasCell, { [styles.away!]: away(cell()) }]}
                style={{
                  width: `${box().width}px`,
                  height: `${box().height}px`,
                  transform: `translate(${place().x - box().width / 2}px, ${place().y - box().height / 2}px) scale(${place().scale})`
                }}
              >
                <Show when={act().kind === 'preset' && (act() as Extract<HiveAct, { kind: 'preset' }>)}>
                  {(preset) => (
                    <div class={styles.stroke}>
                      <StrokePreview preset={preset().preset} color={studio.color()} height={28} />
                    </div>
                  )}
                </Show>
                <Show when={act().kind === 'layer' && (act() as Extract<HiveAct, { kind: 'layer' }>)}>
                  {(layer) => (
                    <LayerThumb
                      studio={studio}
                      layer={layer().layer}
                      width={Math.round(box().height / sheetAspect)}
                      height={Math.round(box().height)}
                      class={
                        studio.layers().find((entry) => entry.id === layer().layer)?.visible === false
                          ? styles.layerHidden
                          : undefined
                      }
                    />
                  )}
                </Show>
              </div>
            );
          }}
        </For>
      </div>

      <svg class={styles.layer} style={{ 'transform-origin': `${origin().x}px ${origin().y}px` }}>
        <Show when={!flyout()}>
          <For each={onCells().filter((cell) => !away(cell))} keyed={(cell) => cell.id}>
            {(cell) => <polygon points={pointsOf(inset(cell().shape, cell().at))} class={styles.outline} />}
          </For>
          <For each={layout().cells.filter((cell) => cell.act.kind === 'layer')} keyed={(cell) => cell.id}>
            {(cell) => (
              <Show
                when={
                  studio.layers().find((entry) => entry.id === (cell().act as { layer: string }).layer)?.locked &&
                  !away(cell())
                }
              >
                <g transform={contentTransform(cell())} class={styles.badge}>
                  <circle cx={0} cy={13} r={6.5} fill="#000c" />
                  <path d="M-2.5 13h5v3.5h-5zM-1.5 13v-1.6a1.5 1.5 0 0 1 3 0V13" fill="none" stroke="#fff" />
                </g>
              </Show>
            )}
          </For>
        </Show>
        <Show when={flyout()}>
          {(open) => (
            <g {...galleryUi} {...handlers} class={styles.live}>
              <g class={styles.halo}>
                <For each={open().cells} keyed={(cell) => cell.id}>
                  {(cell) => <polygon points={pointsOf(grow(cell().hit, cell().at))} />}
                </For>
              </g>
              <For each={open().cells} keyed={(cell) => cell.id}>
                {(cell) => <CellView cell={cell()} />}
              </For>
              <For each={onCells().filter((cell) => cell.group === 'flyout')} keyed={(cell) => cell.id}>
                {(cell) => <polygon points={pointsOf(inset(cell().shape, cell().at))} class={styles.outline} />}
              </For>
            </g>
          )}
        </Show>
        <Show when={cellById(hovered())?.group === 'color' && cellById(hovered())}>
          {(cell) => <polygon points={pointsOf(inset(cell().shape, cell().at, 1.5))} class={styles.hoverOutline} />}
        </Show>
        <Show when={cellById(keyFocus())}>
          {(cell) => <polygon points={pointsOf(grow(cell().hit, cell().at, 2))} class={styles.focusRing} />}
        </Show>
        <Show when={sizeRing()}>
          {(radius) => (
            <>
              <circle cx={origin().x} cy={origin().y} r={radius()} class={styles.sizeRingShadow} />
              <circle cx={origin().x} cy={origin().y} r={radius()} class={styles.sizeRing} />
            </>
          )}
        </Show>
      </svg>

      <Show when={wheelAt()}>
        {(at) => (
          <div
            {...galleryUi}
            class={styles.wheel}
            style={{ transform: `translate(${at().x - wheelSize / 2}px, ${at().y - wheelSize / 2}px)` }}
          >
            <div class={styles.wheelPlate}>
              <HueTriangle color={studio.color()} onChange={studio.setColor} onSettle={studio.commitColor} />
            </div>
          </div>
        )}
      </Show>

      <Show when={caption()}>
        {(shown) => (
          <div class={styles.caption} style={{ transform: `translate(${shown().x}px, ${shown().y}px)` }}>
            {shown().text}
            <Show when={shown().hint}>
              <small>{shown().hint}</small>
            </Show>
          </div>
        )}
      </Show>
    </div>
  );

  /** One cell: its socket (for small cells), its hexagon in the seam colour's stroke, and its contents. */
  function CellView(cellProps: { cell: HiveCell }) {
    const cell = () => cellProps.cell;
    return (
      <g class={{ [styles.away!]: away(cell()) }}>
        <Show when={cell().hit !== cell().shape}>
          <polygon points={pointsOf(cell().hit)} class={styles.socket} />
        </Show>
        <polygon
          data-cell={cell().id}
          points={pointsOf(cell().shape)}
          class={styles.cell}
          fill={cellFill(cell(), studio, props.palette(), stateOf(cell()))}
        />
        <g transform={contentTransform(cell())} class={styles.content}>
          <CellContent cell={cell()} studio={studio} palette={props.palette()} />
        </g>
      </g>
    );
  }

  /** The live cell under `point` (on screen, as drawn), or the nearest one within a seam's width of it. */
  function probe(point: Point): { cell?: HiveCell; nearest?: HiveCell; distance: number } {
    const view = lens();
    let nearest: HiveCell | undefined;
    let distance = Infinity;
    for (const cell of liveCells()) {
      const gap = distanceTo(
        cell.hit.map((vertex) => project(vertex, view)),
        point
      );
      if (gap === 0) {
        return { cell, nearest: cell, distance: 0 };
      }

      if (gap < distance) {
        distance = gap;
        nearest = cell;
      }
    }

    return { cell: distance <= seamTolerance ? nearest : undefined, nearest, distance };
  }

  /** The pointer hovers (or a finger slides) at `point`: the lens follows it, off over the Puck and away from cells. */
  function hover(point: Point, touch = false) {
    const center = origin();
    setFocus({ x: point.x - center.x, y: point.y - center.y });
    const found = probe(point);
    setHovered(found.cell?.id);
    setKeyFocus(undefined);
    if (touch) {
      setFinger(point);
    }

    aimLens(found.distance <= lensEnvelope && found.nearest?.group !== 'puck' ? lensPower : 0);
  }

  /** Eases the lens toward `goal` (0 off, `lensPower` on) over a few frames. */
  function aimLens(goal: number) {
    lensGoal = goal;
    if (lensFrame === undefined && untrack(amount) !== goal) {
      lensTime = performance.now();
      lensFrame = requestAnimationFrame(stepLens);
    }
  }

  function stepLens(now: number) {
    const current = untrack(amount);
    const share = 1 - Math.exp(-(now - lensTime) / lensEase);
    lensTime = now;
    const next = Math.abs(lensGoal - current) < 0.003 ? lensGoal : current + (lensGoal - current) * share;
    setAmount(next);
    lensFrame = next === lensGoal ? undefined : requestAnimationFrame(stepLens);
  }

  /** Whether an event belongs to the press that opened this Hive and has not lifted yet. */
  function holding(event: PointerEvent) {
    const summon = props.summon();
    return summon.heldPointer === event.pointerId && liftedFor !== summon.serial;
  }

  /** How a press on `cell` behaves when it moves: navigates, scrubs, turns the palette, or slides to another cell. */
  function gestureOf(cell: HiveCell | undefined): Gesture {
    const act = cell?.act;
    if (!act) {
      return 'slide';
    }

    if (act.kind === 'nav') {
      return 'nav';
    }

    if (act.kind === 'size') {
      return 'size';
    }

    if (act.kind === 'paletteCenter') {
      return 'palette';
    }

    return valueTargetOf(act) || choiceOf(act) ? 'scrub' : 'slide';
  }

  /** The number a press on `act` scrubs, if any. */
  function valueTargetOf(act: HiveAct): ValueTarget | undefined {
    if (act.kind === 'setting' && act.setting.kind === 'number') {
      return { kind: 'setting', setting: act.setting };
    }

    if (act.kind === 'size') {
      const size = sizeSetting();
      return size ? { kind: 'setting', setting: size } : undefined;
    }

    if (act.kind === 'layerAction' && act.action === 'opacity') {
      return { kind: 'opacity', layer: act.layer };
    }

    if (act.kind === 'back' && act.of.kind === 'number') {
      return act.of.target;
    }

    return undefined;
  }

  /** The choice a press on `act` scrubs through, if any. */
  function choiceOf(act: HiveAct): ChoiceSetting | undefined {
    if (act.kind === 'setting' && act.setting.kind === 'choice') {
      return act.setting;
    }

    return act.kind === 'back' && act.of.kind === 'choice' ? act.of.setting : undefined;
  }

  function sizeSetting() {
    const found = studio.settings().find((entry) => entry.key === 'size');
    return found?.kind === 'number' ? found : undefined;
  }

  /** Readies a press: starts navigation, notes where a scrub starts and arms the long press that unfolds stops. */
  function prepare(state: PressState, started: Press) {
    const act = state.cell?.act;
    if (!act) {
      return;
    }

    if (act.kind === 'nav') {
      navigation.start(act.nav, started.point, act.nav === 'pan' ? undefined : origin());
      return;
    }

    const target = valueTargetOf(act);
    const choice = choiceOf(act);
    if (target) {
      state.target = target;
      state.travel = fractionOf(targetSetting(target), readTarget(target));
    } else if (choice) {
      state.choice = choice;
      state.travel = Math.max(0, choice.options.indexOf(String(studio.value(choice.key)))) * choiceStep;
    }

    const unfold = act.kind === 'back' ? undefined : unfoldingOf(state.cell!);
    if (unfold) {
      state.timer = setTimeout(() => {
        if (press === state) {
          openFlyout(unfold, act.kind === 'layerAction');
          state.unfolded = true;
          state.gesture = 'slide';
          setPressed(undefined);
        }
      }, longPress);
    }
  }

  /** A press moved: navigation and scrubs apply live; slides move the lens and the hover with the pointer. */
  function drag(state: PressState, current: Press) {
    if (state.gesture === 'nav') {
      navigation.move(current.point, current.shift);
      if (current.moved) {
        setMode('nav');
      }

      return;
    }

    if (state.gesture === 'slide') {
      hover(current.point, current.pointerType === 'touch');
      return;
    }

    if (!current.moved) {
      return;
    }

    clearTimeout(state.timer);
    const along = current.delta.x - current.delta.y;
    if (state.gesture === 'palette') {
      setMode('scrub');
      props.setPalette((palette) => ({
        hue: (palette.hue + current.delta.x * 1.2 + 360) % 360,
        light: Math.min(1, Math.max(0, palette.light - current.delta.y / 160))
      }));
      return;
    }

    setMode(state.gesture === 'size' ? 'size' : 'scrub');
    if (state.target) {
      const setting = targetSetting(state.target);
      state.travel = Math.min(1, Math.max(0, state.travel + along / (current.shift ? scrubLength * 4 : scrubLength)));
      writeTarget(state.target, valueAt(setting, state.travel));
    } else if (state.choice) {
      const options = state.choice.options;
      state.travel = Math.min((options.length - 1) * choiceStep, Math.max(0, state.travel + along));
      studio.setValue(state.choice.key, options[Math.round(state.travel / choiceStep)]!);
    }
  }

  /** Ends the press in progress, whichever way it ended, and returns it. */
  function endPress() {
    const ended = press;
    clearTimeout(ended?.timer);
    if (ended?.gesture === 'nav') {
      navigation.end();
    }

    press = undefined;
    setPressed(undefined);
    setMode('idle');
    if (finger()) {
      setFinger(undefined);
      setHovered(undefined);
      aimLens(0);
    }

    return ended;
  }

  /** The flyout a cell unfolds on a tap or a long press, if any. */
  function unfoldingOf(cell: HiveCell): Flyout | undefined {
    const act = cell.act;
    if (act.kind === 'setting' && act.setting.kind === 'number') {
      return { kind: 'number', at: cell.at, target: { kind: 'setting', setting: act.setting } };
    }

    if (act.kind === 'setting' && act.setting.kind === 'choice') {
      return { kind: 'choice', at: cell.at, setting: act.setting };
    }

    if (act.kind === 'size') {
      const size = sizeSetting();
      return size ? { kind: 'number', at: { x: 0, y: 0 }, target: { kind: 'setting', setting: size } } : undefined;
    }

    if (act.kind === 'layerAction' && act.action === 'opacity') {
      return { kind: 'number', at: cell.at, target: { kind: 'opacity', layer: act.layer } };
    }

    if (act.kind === 'layerAction' && act.action === 'blend') {
      return { kind: 'blend', at: cell.at, layer: act.layer };
    }

    if (act.kind === 'layer' && studio.activeLayer() === act.layer) {
      return { kind: 'layer', at: cell.at, layer: act.layer };
    }

    return undefined;
  }

  /** Opens a flyout, on top of the current one when `nested` (a layer's opacity or blend), else in its place. */
  function openFlyout(next: Flyout, nested = false) {
    setFlyouts((list) => (nested ? [...list, next] : [next]));
    setKeyFocus(undefined);
    setHovered(undefined);
  }

  function foldFlyout() {
    setFlyouts((list) => list.slice(0, -1));
    setKeyFocus(undefined);
  }

  /** A finished pick: a toggled Hive closes; a held or pinned one stays, folded up. */
  function finish() {
    setFlyouts([]);
    props.variant.done();
  }

  /** What a tap, a lift, Enter or lifting Space on `cell` does. */
  function activate(cell: HiveCell) {
    const act = cell.act;
    const center = origin();
    lastActivated = cell.id;
    switch (act.kind) {
      case 'nav':
        if (act.nav === 'zoom') {
          studio.zoomTo(1, center);
          studio.notify('Zoom 100%');
        } else if (act.nav === 'rotate') {
          studio.rotateBy(-studio.view().angle, center);
          studio.notify('Rotation reset');
        } else {
          studio.notify('Pan: press and drag');
        }

        return;
      case 'undo':
        studio.undo();
        return;
      case 'redo':
        studio.redo();
        return;
      case 'core':
        props.variant.close();
        return;
      case 'tool':
        studio.setTool(act.tool);
        studio.notify(tools[act.index]!.label);
        finish();
        return;
      case 'view':
        if (act.view === 'fit') {
          studio.fit();
        } else if (act.view === 'flip') {
          studio.flip();
        } else {
          studio.toggleSymmetry();
        }

        return;
      case 'palette':
      case 'paletteCenter':
      case 'grey':
      case 'recent': {
        const color = colorOf(act);
        if (color) {
          studio.chooseColor(color);
          finish();
        }

        return;
      }
      case 'current':
        openFlyout({ kind: 'wheel', at: { x: 0, y: -paletteLift * layout().unit } });
        return;
      case 'previous':
        studio.swapColors();
        finish();
        return;
      case 'preset':
        studio.choosePreset(act.preset.id);
        studio.notify(act.preset.name);
        finish();
        return;
      case 'setting':
        if (act.setting.kind === 'toggle') {
          studio.setValue(act.setting.key, studio.value(act.setting.key) !== true);
        } else if (act.setting.kind === 'choice' && act.setting.options.length <= 2) {
          nudge(cell, 1, true);
        } else {
          openFlyout(unfoldingOf(cell)!);
        }

        return;
      case 'size': {
        const unfold = unfoldingOf(cell);
        if (unfold) {
          openFlyout(unfold);
        } else {
          studio.notify(`${studio.toolInfo().label} has no size`);
        }

        return;
      }
      case 'layer':
        if (studio.activeLayer() === act.layer) {
          openFlyout(unfoldingOf(cell)!);
        } else {
          studio.selectLayer(act.layer);
          finish();
        }

        return;
      case 'eye': {
        const layer = studio.layers().find((entry) => entry.id === act.layer);
        if (layer) {
          studio.updateLayer(layer.id, { visible: !layer.visible });
        }

        return;
      }
      case 'addLayer':
        studio.addLayer();
        return;
      case 'value':
        writeTarget(act.target, act.value);
        foldFlyout();
        return;
      case 'option':
        studio.setValue(act.setting.key, act.option);
        foldFlyout();
        return;
      case 'blend':
        studio.updateLayer(act.layer, { blend: act.mode });
        foldFlyout();
        return;
      case 'layerAction':
        layerAction(cell, act);
        return;
      case 'back':
        foldFlyout();
        return;
      case 'empty':
        return;
    }
  }

  function layerAction(cell: HiveCell, act: Extract<HiveAct, { kind: 'layerAction' }>) {
    const layer = studio.layers().find((entry) => entry.id === act.layer);
    if (!layer) {
      return;
    }

    if (act.action === 'opacity' || act.action === 'blend') {
      openFlyout(unfoldingOf(cell)!, true);
    } else if (act.action === 'lock') {
      studio.updateLayer(layer.id, { locked: !layer.locked });
    } else if (act.action === 'up' || act.action === 'down') {
      studio.moveLayer(act.action);
    } else if (act.action === 'duplicate') {
      studio.duplicateLayer();
      setFlyouts([]);
    } else {
      studio.deleteLayer();
      studio.notify(`Deleted ${layer.name}`);
      setFlyouts([]);
    }
  }

  /** The wheel, the + and − keys: steps a value by its presets, turns the palette, zooms, rotates or scrubs history. */
  function nudge(cell: HiveCell, steps: number, wrap = false) {
    const act = cell.act;
    const center = origin();
    const target = valueTargetOf(act) ?? (act.kind === 'value' ? act.target : undefined);
    const choice = choiceOf(act) ?? (act.kind === 'option' ? act.setting : undefined);
    if (target) {
      writeTarget(target, stepPreset(targetSetting(target), readTarget(target), steps));
    } else if (choice) {
      const options = choice.options;
      const index = options.indexOf(String(studio.value(choice.key))) + steps;
      const next = wrap ? (index + options.length) % options.length : Math.min(options.length - 1, Math.max(0, index));
      studio.setValue(choice.key, options[next]!);
    } else if (act.kind === 'setting' && act.setting.kind === 'toggle') {
      studio.setValue(act.setting.key, steps > 0);
    } else if (act.kind === 'nav' && act.nav === 'zoom') {
      studio.zoomBy(1.15 ** steps, center);
    } else if (act.kind === 'nav' && act.nav === 'rotate') {
      studio.rotateBy(steps * 15, center);
    } else if (act.kind === 'undo' || act.kind === 'redo') {
      if (steps > 0) {
        studio.redo();
      } else {
        studio.undo();
      }
    } else if (act.kind === 'paletteCenter') {
      props.setPalette((palette) => ({ ...palette, light: Math.min(1, Math.max(0, palette.light + steps * 0.1)) }));
    } else if (act.kind === 'palette' || act.kind === 'grey' || act.kind === 'recent') {
      props.setPalette((palette) => ({ ...palette, hue: (palette.hue + steps * 15 + 360) % 360 }));
    } else if (act.kind === 'layer') {
      const layer = studio.layers().find((entry) => entry.id === act.layer);
      if (layer) {
        studio.updateLayer(layer.id, { opacity: stepPreset(opacitySetting, layer.opacity, steps) });
      }
    }
  }

  function onWheel(event: WheelEvent) {
    event.preventDefault();
    const cell = probe({ x: event.clientX, y: event.clientY }).cell;
    wheelRest += event.deltaMode === 0 ? event.deltaY || event.deltaX : (event.deltaY || event.deltaX) * 40;
    if (!cell || Math.abs(wheelRest) < wheelStep) {
      return;
    }

    const steps = wheelRest < 0 ? 1 : -1;
    wheelRest = 0;
    nudge(cell, steps);
  }

  /** Keys while open: 1–8 tools, arrows move the focus over the cells, Enter activates, Esc folds a flyout, +/−. */
  function onKey(event: KeyboardEvent) {
    if (event.defaultPrevented || props.variant.hidden || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    const digit = /^Digit([1-8])$/.exec(event.code);
    const arrow = arrows[event.key];
    if (digit) {
      event.preventDefault();
      const tool = tools[Number(digit[1]) - 1]!;
      studio.setTool(tool.id);
      studio.notify(tool.label);
      finish();
    } else if (arrow) {
      event.preventDefault();
      moveFocus(arrow);
    } else if (event.key === 'Enter') {
      const cell = cellById(keyFocus()) ?? cellById(hovered());
      if (cell) {
        event.preventDefault();
        activate(cell);
      }
    } else if (event.key === 'Escape' && flyouts().length > 0) {
      event.preventDefault();
      foldFlyout();
    } else if (event.key === '+' || event.key === '=' || event.key === '-') {
      const cell = cellById(keyFocus()) ?? cellById(hovered());
      if (cell) {
        event.preventDefault();
        nudge(cell, event.key === '-' ? -1 : 1);
      }
    }
  }

  /** Moves the keyboard focus to the nearest live cell in `direction`; the lens follows it. */
  function moveFocus(direction: Point) {
    const cells = liveCells();
    const from = cellById(keyFocus()) ?? cellById(hovered());
    const start = from?.at ?? flyout()?.top.at ?? { x: 0, y: 0 };
    let best: HiveCell | undefined;
    let bestScore = Infinity;
    for (const cell of cells) {
      if (cell === from || (cell.at.x === start.x && cell.at.y === start.y)) {
        continue;
      }

      const dx = cell.at.x - start.x;
      const dy = cell.at.y - start.y;
      const along = dx * direction.x + dy * direction.y;
      const across = Math.abs(dx * direction.y - dy * direction.x);
      if (along <= 1 || across > along * 1.25) {
        continue;
      }

      const score = along + across * 0.8;
      if (score < bestScore) {
        best = cell;
        bestScore = score;
      }
    }

    if (best) {
      setKeyFocus(best.id);
      setHovered(undefined);
      setFocus(best.at);
      aimLens(best.group === 'puck' ? 0 : lensPower);
    }
  }

  function readTarget(target: ValueTarget) {
    return readValue(studio, target);
  }

  function writeTarget(target: ValueTarget, value: number) {
    if (target.kind === 'setting') {
      studio.setValue(target.setting.key, value);
    } else {
      studio.updateLayer(target.layer, { opacity: value });
    }
  }

  function colorOf(act: HiveAct) {
    if (act.kind === 'palette') {
      return paletteColor(props.palette(), act.ring, act.angle);
    }

    if (act.kind === 'paletteCenter') {
      return paletteColor(props.palette(), 0, 0);
    }

    if (act.kind === 'grey') {
      return grey(act.level);
    }

    return act.kind === 'recent' ? recentColors(studio)[act.index] : undefined;
  }

  /** Whether a cell is on: the tool, the preset, the layer, the colour, a view toggle, a flyout's current stop. */
  function isOn(cell: HiveCell) {
    const act = cell.act;
    switch (act.kind) {
      case 'tool':
        return studio.tool() === act.tool;
      case 'preset':
        return studio.preset() === act.preset.id;
      case 'layer':
        return studio.activeLayer() === act.layer;
      case 'view':
        return act.view === 'symmetry' ? studio.symmetry() : act.view === 'flip' && studio.view().flipped;
      case 'palette':
      case 'paletteCenter':
      case 'grey':
      case 'recent':
        return colorOf(act) === studio.color();
      case 'setting':
        return act.setting.kind === 'toggle' && studio.value(act.setting.key) === true;
      case 'value': {
        const setting = targetSetting(act.target);
        const stops = untrack(flyout)?.cells.flatMap((entry) => (entry.act.kind === 'value' ? [entry.act.value] : []));
        const current = readTarget(act.target);
        return !!stops && stops[nearestStop(setting, current, stops)] === act.value;
      }
      case 'option':
        return studio.value(act.setting.key) === act.option;
      case 'blend':
        return studio.layers().find((entry) => entry.id === act.layer)?.blend === act.mode;
      case 'layerAction':
        return act.action === 'lock' && !!studio.layers().find((entry) => entry.id === act.layer)?.locked;
      default:
        return false;
    }
  }

  /** The caption's name and hint for a cell. */
  function captionFor(cell: HiveCell): { text: string; hint?: string } {
    const act = cell.act;
    const view = studio.view();
    const layerOf = (id: string) => studio.layers().find((entry) => entry.id === id);
    switch (act.kind) {
      case 'nav':
        return act.nav === 'pan'
          ? { text: 'Pan', hint: 'drag' }
          : act.nav === 'zoom'
            ? { text: `Zoom ${Math.round(view.scale * 100)}%`, hint: 'drag ↕ · tap 100%' }
            : { text: `Rotate ${Math.round(view.angle)}°`, hint: 'drag around · tap resets' };
      case 'undo':
        return { text: 'Undo', hint: `${studio.history().done} left · wheel scrubs` };
      case 'redo':
        return { text: 'Redo', hint: `${studio.history().undone} left` };
      case 'size':
        return sizeSetting()
          ? { text: `Size ${formatValue(studio.number('size'))} px`, hint: 'drag ↕ · tap for stops' }
          : { text: 'No size for this tool' };
      case 'core':
        return { text: 'Close', hint: 'tap' };
      case 'tool': {
        const tool = tools[act.index]!;
        return { text: tool.label, hint: `${act.index + 1} · ${tool.key}` };
      }
      case 'view':
        return act.view === 'fit'
          ? { text: 'Fit view' }
          : act.view === 'flip'
            ? { text: 'Flip view', hint: view.flipped ? 'on' : 'off' }
            : { text: 'Symmetry', hint: studio.symmetry() ? 'on' : 'off' };
      case 'palette':
        return { text: colorOf(act)!, hint: 'wheel turns hues' };
      case 'paletteCenter':
        return { text: `Middle ${colorOf(act)}`, hint: 'drag ↕ tints–shades · ↔ hues' };
      case 'grey':
        return { text: colorOf(act)!, hint: `grey ${Math.round(act.level * 100)}%` };
      case 'recent': {
        const color = colorOf(act);
        return color ? { text: color, hint: 'recent' } : { text: 'No recent colour yet' };
      }
      case 'current':
        return { text: `Current ${studio.color()}`, hint: 'tap for the colour wheel' };
      case 'previous':
        return { text: `Previous ${studio.previous()}`, hint: 'tap swaps · X' };
      case 'preset':
        return { text: act.preset.name, hint: act.preset.set };
      case 'setting': {
        const setting = act.setting;
        const hint =
          setting.kind === 'number'
            ? 'drag ↕ · tap for stops'
            : setting.kind === 'choice'
              ? setting.options.length <= 2
                ? 'tap switches · hold for all'
                : 'tap for options · drag'
              : 'tap';
        return { text: `${setting.label} ${settingText(setting, studio)}`, hint };
      }
      case 'layer': {
        const layer = layerOf(act.layer);
        if (!layer) {
          return { text: 'Layer' };
        }

        const details = `${blendLabel(layer.blend)} ${layer.opacity}%${layer.locked ? ' · locked' : ''}`;
        return {
          text: layer.name,
          hint: studio.activeLayer() === layer.id ? `${details} · tap for options` : details
        };
      }
      case 'eye': {
        const layer = layerOf(act.layer);
        return { text: `${layer?.visible === false ? 'Show' : 'Hide'} ${layer?.name ?? ''}` };
      }
      case 'addLayer':
        return { text: 'New layer' };
      case 'value': {
        const setting = targetSetting(act.target);
        return { text: `${formatValue(act.value)}${setting.unit}`, hint: setting.label };
      }
      case 'option':
        return { text: act.option, hint: act.setting.label };
      case 'blend':
        return { text: blendLabel(act.mode), hint: 'blend mode' };
      case 'layerAction': {
        const layer = layerOf(act.layer);
        const names = {
          opacity: { text: `Opacity ${layer?.opacity ?? 100}%`, hint: 'drag ↕ · tap for stops' },
          blend: { text: `Blend ${blendLabel(layer?.blend ?? 'normal')}`, hint: 'tap for modes' },
          lock: { text: layer?.locked ? 'Unlock' : 'Lock' },
          up: { text: 'Move up' },
          down: { text: 'Move down' },
          duplicate: { text: 'Duplicate' },
          delete: { text: 'Delete layer', hint: 'tap' }
        };
        return names[act.action];
      }
      case 'back':
        return { text: 'Fold up', hint: 'tap · Esc' };
      case 'empty':
        return { text: '' };
    }
  }
}

/** A press on the Hive in progress. */
type PressState = {
  /** The cell pressed, if any. */
  cell?: HiveCell;
  gesture: Gesture;
  /** A scrub's position: the fraction of the range for numbers, pixels for choices. */
  travel: number;
  target?: ValueTarget;
  choice?: ChoiceSetting;
  /** The long press that unfolds a value's stops. */
  timer?: ReturnType<typeof setTimeout>;
  /** The long press unfolded a flyout; lifting picks from it. */
  unfolded: boolean;
};

type Gesture = 'nav' | 'size' | 'scrub' | 'palette' | 'slide';

/**
 * Cells that lifting a pointer on picks after sliding there (press-slide-lift): choices of every kind, but not the
 * Puck, value cells (they scrub) or deleting a layer.
 */
function pickable(cell: HiveCell) {
  const kind = cell.act.kind;
  if (cell.act.kind === 'layerAction') {
    return cell.act.action !== 'delete';
  }

  return !['nav', 'undo', 'redo', 'size', 'core', 'setting', 'back', 'current', 'empty'].includes(kind);
}

/** Cells that lifting Space over picks, as a marking menu confirms: picks only, never toggles. */
function confirmsOnRelease(cell: HiveCell) {
  return ['tool', 'palette', 'paletteCenter', 'grey', 'recent', 'preset', 'value', 'option', 'blend'].includes(
    cell.act.kind
  );
}

/** The index of the stop nearest `value`, geometrically for log settings. */
function nearestStop(setting: Parameters<typeof nearestPreset>[0], value: number, stops: readonly number[]) {
  return nearestPreset({ ...setting, presets: stops }, value);
}

/** The outline grown outward by `by` pixels around `center`: a halo, or a focus ring. */
function grow(shape: readonly Point[], center: Point, by = haloWidth) {
  return shape.map((point) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: point.x + (dx / length) * by, y: point.y + (dy / length) * by };
  });
}

/** The outline pulled inward, so that a white outline sits inside the seam. */
function inset(shape: readonly Point[], center: Point, by = 1.25) {
  return grow(shape, center, -by);
}

/** The extent of cells' outlines around the Puck. */
function bounds(cells: readonly HiveCell[]) {
  const box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (const cell of cells) {
    for (const point of cell.hit) {
      box.left = Math.min(box.left, point.x);
      box.top = Math.min(box.top, point.y);
      box.right = Math.max(box.right, point.x);
      box.bottom = Math.max(box.bottom, point.y);
    }
  }

  return box;
}

/** `value` clamped to `[low, high]`, or their middle when the range is empty. */
function clampInto(value: number, low: number, high: number) {
  return low > high ? (low + high) / 2 : Math.min(high, Math.max(low, value));
}

/** How far to move a span `[from, to]` to bring it inside `[low, high]`. */
function shiftInto(from: number, to: number, low: number, high: number) {
  if (to - from > high - low) {
    return (low + high) / 2 - (from + to) / 2;
  }

  return from < low ? low - from : to > high ? high - to : 0;
}

/** The colour wheel's plate, a flat-top hexagon this wide. */
const wheelSize = 272;
/** A main cell's width at full size. */
const baseUnit = 42;
/** A layer thumbnail's height over its width: the sheet's proportions. */
const sheetAspect = 33 / 48;
/** Room kept free at the window's edges; the top keeps clear of the gallery's bar. */
const margin = { edge: 12, top: 52 };
const haloWidth = 3;
/** How far a press may land outside every cell and still count for the nearest one: a little beyond the halo. */
const seamTolerance = 5;
/** How near a cell the pointer must be for the lens to come on. */
const lensEnvelope = 26;
/** The lens's easing time constant, in milliseconds. */
const lensEase = 40;
/** Pixels of drag across a number's whole range; Shift is four times finer. */
const scrubLength = 260;
/** Pixels of drag per option of a choice. */
const choiceStep = 26;
/** Milliseconds a still press on a value cell takes to unfold its stops. */
const longPress = 380;
/** Pixels the opening press must travel before its lift picks a cell. */
const heldTravel = 14;
/** Pixels of wheel travel per step. */
const wheelStep = 30;
const arrows: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 }
};
