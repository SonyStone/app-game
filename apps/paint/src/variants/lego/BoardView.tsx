import { createEventListener } from '@solid-primitives/event-listener';
import { createElementSize } from '@solid-primitives/resize-observer';
import { Portal } from '@solidjs/web';
import { createMemo, createSignal, For, onCleanup, Show } from 'solid-js';
import {
  cellGap,
  cellSize,
  findPart,
  frameAt,
  nearestCell,
  newId,
  ownedFrame,
  ownedPanel,
  panelFrame,
  panelPadding,
  partsBounds,
  pinPanels,
  pitch,
  placeBlock,
  placePart,
  pruneOwned,
  putPanel,
  removePart,
  replacePanel,
  resizePart,
  spanAfter,
  type Board,
  type Cell,
  type Panel,
  type Part,
  type Point,
  type Rect,
  type Span
} from './board';
import type { createBoard } from './createBoard';
import { describeKit, swatchPanelParts, unpackKit, type createKits, type Kit } from './kits';
import styles from './LegoStudio.module.css';
import { kindLabel, lookOf, partLooks, PartView, type Popup, type Session } from './parts';
import type { createSheet } from './createSheet';
import { BlockView, PartsTray } from './PartsTray';
import { SpawnMenu } from './SpawnMenu';

/**
 * The board over the drawing: its panels, and in edit mode the studs, the box of parts and kits, and the drags that
 * change them. While editing the drawing takes no strokes. The box is a sheet pulled up from the bottom (see
 * `PartsTray`), the drawing shrinking to a card above it, but whatever is carried off it is placed at full size: the
 * sheet sinks to a put-away strip and the card springs back while it lasts, and a part taken from the box and placed
 * on the board closes it, as Android's widget picker does. Held over the strip a while, the sheet rises again, so a
 * part from the board can reach the workbench: the board's bench panel, one plate filling its place in the sheet at
 * full size, where parts lie where they are put. Dragged across its free studs, a band selects the parts it touches;
 * pressed, a selected part or the selection's free space carries them all as one block, as a kit is carried, onto the
 * board or elsewhere on the bench. Dropped on the box's kits, a part or group from the board or the bench is kept as
 * a kit and stays where it was.
 *
 * While editing, a part dragged anywhere lifts and follows the pointer: over a panel, or touching one by an edge, it
 * takes the nearest cell and pushes the parts in its way aside, which also grows the panel; panels keep still on
 * screen until the drag ends, even at the view's edge. Over the bare drawing it starts a panel of its own; over the
 * box it is put away. A kit from the box lands the same way, as one block of its parts.
 * Its corner handle sizes a part in whole cells, pushing neighbours right and down; a part with several looks also
 * has a handle opening their chooser. A panel dragged by its rim moves freely, and its button keeps it as a kit.
 *
 * A swatch owns a panel of its own, which lies beside it while open, like an Android folder: a tap opens and closes
 * it, while editing too, and a press elsewhere closes it (while editing, only a press on the bare drawing does, so
 * parts can be carried into it). Parts are carried into and out of it as into any panel; a new swatch comes with
 * the default one. Each drag shows its result while it lasts and is kept on lift. Outside edit mode parts simply work.
 *
 * A long press on the bare drawing or on a panel's free cells (or a right click) opens the `SpawnMenu` there; a part
 * tapped in it lands at the press, as if dropped there.
 */
export function BoardView(props: {
  board: ReturnType<typeof createBoard>;
  kits: ReturnType<typeof createKits>;
  session: Session;
  editing: boolean;
  /** The swatch whose panel is open; the panels of the swatches it lies in show too. */
  openPanel: string | undefined;
  onOpenPanel: (owner: string | undefined) => void;
  onPopup: (anchor: Element, popup: Popup) => void;
  /** The box of parts' sheet; this sinks it while something is carried and closes it once a part is taken. */
  sheet: ReturnType<typeof createSheet>;
}) {
  const [layer, setLayer] = createSignal<HTMLElement>();
  const [box, setBox] = createSignal<HTMLElement>();
  const [drag, setDrag] = createSignal<Drag>();
  /** The workbench's place in the sheet, which the bench panel is rendered into. */
  const [bench, setBench] = createSignal<HTMLElement>();
  const benchSize = createElementSize(bench);
  /** The kits in the box, where a part or group from the board or the workbench is dropped to be kept as a kit. */
  const [kitShelf, setKitShelf] = createSignal<HTMLElement>();
  /** The parts on the workbench selected to be carried together or kept as a kit. */
  const [selected, setSelected] = createSignal<ReadonlySet<string>>(new Set());
  /** The open spawn menu: where it was opened, and the pointer of the press while it is held. */
  const [spawn, setSpawn] = createSignal<{ at: Point; held?: number }>();

  /**
   * The view's size, which the board covers, where it lies on the page and how much it is scaled down there; the
   * board's own pixels are the view's, unscaled.
   */
  const view = () => {
    const { width, height } = props.session.size();
    const rect = layer()?.getBoundingClientRect();
    const scale = rect && width > 0 ? rect.width / width : 1;
    return { left: rect?.left ?? 0, top: rect?.top ?? 0, width, height, scale };
  };
  /** `point` on the page in the view's pixels. */
  const toView = (point: Point) => {
    const { left, top, scale } = view();
    return { x: (point.x - left) / scale, y: (point.y - top) / scale };
  };
  /** Where the layer the ghost, the box and the menu lie in starts on the page. */
  const overlay = () => {
    const rect = layer()?.parentElement?.getBoundingClientRect();
    return { x: rect?.left ?? 0, y: rect?.top ?? 0 };
  };
  const shown = createMemo(() => {
    const current = drag();
    if (!current) {
      return props.board.board();
    }

    if (current.type === 'select') {
      return props.board.board();
    }

    return current.type === 'part' ? partDrop(current, current.settled).board : result(current);
  });
  /** The workbench's place in its own pixels, before it is shrunk to fit. */
  const benchView = () => ({
    width: (benchSize.width ?? 0) / benchScale(),
    height: (benchSize.height ?? 0) / benchScale()
  });
  /** Whether something lifted is being carried; it shows at full size. */
  const carrying = () => lifted()?.carried === true;
  /** The panels on screen, with where each lies; see `visiblePanels`. */
  const visible = createMemo(() => visiblePanels(shown(), props.openPanel, props.editing, view(), pinned(drag())));
  /** The workbench as shown, with where it lies in its place in the sheet. */
  /**
   * How much the workbench is shrunk to show all its parts in its place, which never scrolls: 1 while they fit. It
   * follows the kept bench, not a drag's preview, so the plate keeps still under a carried part.
   */
  const benchScale = createMemo(() => {
    const used = benchReach(benchOf(props.board.board()));
    const width = benchSize.width ?? 0;
    const height = benchSize.height ?? 0;
    return Math.min(1, width > 0 ? width / used.width : 1, height > 0 ? height / used.height : 1);
  });
  const benchEntry = createMemo(() => {
    const panel = benchOf(shown());
    return { panel, frame: benchFrame(panel, benchView()) };
  });
  /** The workbench and the open panels of a swatch on it, with where each lies in its pixels. */
  const benchPanels = createMemo(() =>
    benchVisible(shown(), pinned(drag()))
  );
  /** The band being dragged across the workbench, in its place's pixels. */
  const band = () => {
    const current = drag();
    return current?.type === 'select' ? bandRect(current.start, current.point) : undefined;
  };
  /** The selected parts, or those the band touches while it is dragged. */
  const selection = createMemo<ReadonlySet<string>>(() => {
    const rect = band();
    if (!rect) {
      return selected();
    }

    const { panel, frame } = benchEntry();
    return new Set(panel.parts.filter((part) => overlap(rect, partRect(part, frame.origin)) > 0).map((part) => part.id));
  });
  /** Where the selected parts lie together on the workbench, in its place's pixels, while nothing is carried. */
  const selectionRect = () => {
    const { panel, frame } = benchEntry();
    const parts = panel.parts.filter((part) => selection().has(part.id));
    if (parts.length === 0 || lifted()) {
      return undefined;
    }

    const bounds = partsBounds(parts);
    return {
      left: frame.origin.x + bounds.column * pitch - selectionPadding,
      top: frame.origin.y + bounds.row * pitch - selectionPadding,
      width: bounds.columns * pitch - cellGap + selectionPadding * 2,
      height: bounds.rows * pitch - cellGap + selectionPadding * 2
    };
  };
  const chain = () => openChain(props.board.board(), props.openPanel);

  /** The drop a lifted part waits on before the parts in its way move aside; see `reorderDelay`. */
  let pending: { key: string; timer: ReturnType<typeof setTimeout> } | undefined;
  const stopWaiting = () => {
    clearTimeout(pending?.timer);
    pending = undefined;
  };
  onCleanup(stopWaiting);

  /** The wait of a part held over the sunk sheet's strip before the sheet rises again; see `followSheet`. */
  let spring: ReturnType<typeof setTimeout> | undefined;
  const stopSpring = () => {
    clearTimeout(spring);
    spring = undefined;
  };
  onCleanup(stopSpring);

  /** A press waiting to become long enough to open the spawn menu; see `armLongPress`. */
  let press: { pointer: number; start: Point; timer: ReturnType<typeof setTimeout> } | undefined;
  const stopPress = () => {
    clearTimeout(press?.timer);
    press = undefined;
  };
  onCleanup(stopPress);
  const lifted = () => {
    const current = drag();
    return current?.type === 'part' ? current : undefined;
  };

  // A press outside the open panels and their swatches closes them; while editing only one on the bare drawing.
  createEventListener(
    window,
    'pointerdown',
    (event) => {
      const target = event.target instanceof Element ? event.target : undefined;
      const part = target?.closest<HTMLElement>('[data-part]')?.dataset.part;
      if (!props.openPanel || target?.closest('[data-owned]') || (part && chain().has(part))) {
        return;
      }

      if (!props.editing || !target?.closest('[data-keeps-panel]')) {
        props.onOpenPanel(undefined);
      }
    },
    { capture: true }
  );

  createEventListener(window, 'pointermove', (event) => {
    if (press && event.pointerId === press.pointer) {
      if (Math.hypot(event.clientX - press.start.x, event.clientY - press.start.y) >= tapDistance) {
        stopPress();
      }
    }

    const current = drag();
    if (!current || event.pointerId !== current.pointer) {
      return;
    }

    const point = { x: event.clientX, y: event.clientY };
    if (current.type === 'select') {
      setDrag({ ...current, point: inBench(point) ?? current.point });
      return;
    }

    if (current.type !== 'part') {
      setDrag({ ...current, point });
      return;
    }

    // A swatch carried off closes its panel; a part carried off the spawn menu hides it.
    const moved = Math.hypot(point.x - current.start.x, point.y - current.start.y) >= tapDistance;
    if (moved && chain().has(current.id)) {
      props.onOpenPanel(findPart(props.board.board(), current.id)?.panel.owner);
    }

    const carried = current.carried || moved;
    if (carried) {
      followSheet(point);
    }

    // A place with room shows at once; one that pushes parts aside waits until the part rests over it.
    const drop = partDrop(current, point);
    if (!drop.pushes) {
      stopWaiting();
      setDrag({ ...current, point, settled: point, carried });
      return;
    }

    if (drop.key !== pending?.key) {
      stopWaiting();
      pending = {
        key: drop.key,
        timer: setTimeout(() => {
          pending = undefined;
          const latest = drag();
          if (latest?.type === 'part') {
            setDrag({ ...latest, settled: latest.point });
          }
        }, reorderDelay)
      };
    }

    setDrag({ ...current, point, carried });
  });
  // A lift drops where the part is, without waiting; a press that did not move is a tap.
  const finish = (event: PointerEvent) => {
    if (press && event.pointerId === press.pointer) {
      stopPress();
    }

    const current = drag();
    if (!current || event.pointerId !== current.pointer) {
      return;
    }

    stopWaiting();
    stopSpring();
    setDrag(undefined);
    let point = { x: event.clientX, y: event.clientY };
    if (current.type === 'select') {
      // A band selects what it touched; a tap on the bench's free studs clears the selection.
      const end = inBench(point) ?? current.point;
      const tapped = Math.hypot(end.x - current.start.x, end.y - current.start.y) < tapDistance;
      setSelected(tapped ? new Set<string>() : selection());
      return;
    }

    // A panel from the board dropped on the kits is kept as one and stays where it was.
    if (current.type === 'panel' && !current.owned && overKits(point)) {
      const panel = current.base.panels.find((candidate) => candidate.id === current.panel);
      if (panel) {
        props.kits.save(current.base, panel, kitName(panel.parts));
      }

      return;
    }

    if (current.type !== 'part') {
      const ended = result({ ...current, point });
      props.board.set(current.type === 'resize' ? pinPanels(ended, current.pinned, view()) : ended);
      return;
    }

    const tapped = Math.hypot(point.x - current.start.x, point.y - current.start.y) < tapDistance;
    if (tapped && !current.fromBox) {
      if (current.kind === 'color:swatch') {
        toggle(current.id);
      }

      return;
    }

    // A part tapped in the spawn menu lands where the menu was opened; one tapped in the box stays there.
    if (current.spawnAt) {
      setSpawn(undefined);
      point = tapped ? current.spawnAt : point;
    } else if (tapped) {
      return;
    }

    const drop = partDrop(current, point);
    props.sheet.setSunk(false);
    if (drop.where === 'kits') {
      keepAsKit(current);
      return;
    }

    if (current.fromBox && !current.spawnAt && drop.where === 'board') {
      props.sheet.to('closed');
    }

    let next = drop.board;
    if (current.fromBox && current.kind === 'color:swatch' && findPart(next, current.id)) {
      const { parts } = unpackKit({ parts: swatchPanelParts, owned: [] });
      next = putPanel(next, { id: newId('panel'), at: { x: 0, y: 0 }, owner: current.id, parts });
    }

    props.board.set(pruneOwned(pinPanels(next, current.pinned, view())));
    const onBench = new Set(benchOf(props.board.latest()).parts.map((part) => part.id));
    setSelected(new Set([...selected()].filter((id) => onBench.has(id))));
  };
  createEventListener(window, 'pointerup', finish);
  createEventListener(window, 'pointercancel', (event) => {
    if (event.pointerId === press?.pointer) {
      stopPress();
    }

    if (event.pointerId === drag()?.pointer) {
      stopWaiting();
      stopSpring();
      setDrag(undefined);
      props.sheet.setSunk(false);
    }
  });

  /** A panel of the board, or the workbench, with its parts and, while editing, their handles. */
  function PanelView(entryProps: { entry: { panel: Panel; frame: ReturnType<typeof panelFrame> } }) {
    const panel = () => entryProps.entry.panel;
    const frame = () => entryProps.entry.frame;
    return (
      <div
        class={[styles.panel, panel().owner !== undefined && styles.owned]}
        data-owned={panel().owner !== undefined ? '' : undefined}
        data-keeps-panel
        style={{
          left: `${frame().rect.left}px`,
          top: `${frame().rect.top}px`,
          width: `${frame().rect.width}px`,
          height: `${frame().rect.height}px`,
          '--stud-x': `${frame().origin.x - frame().rect.left}px`,
          '--stud-y': `${frame().origin.y - frame().rect.top}px`
        }}
        onPointerDown={(event) => {
          if (!props.editing || event.target !== event.currentTarget) {
            return;
          }

          if (panel().bench) {
            pressBench(event);
          } else if (panel().owner === undefined) {
            startPanelDrag(event, panel(), frame().origin);
          } else {
            startOwnedDrag(event, panel(), frame().origin);
          }

          armLongPress(event);
        }}
        onContextMenu={(event) => {
          if (props.editing && event.target === event.currentTarget) {
            openSpawnFromMenuKey(event);
          }
        }}
      >
        <Show when={panel().parts.length === 0 && !panel().bench}>
          <span class={styles.emptyPanel}>Drop parts here</span>
        </Show>
        <For each={panel().parts} keyed={(part) => part.id}>
          {(part) => {
            // The lifted part, or a carried block's parts, show only where they would land.
            const isLifted = () =>
              lifted()?.id === part().id || lifted()?.block?.parts.some((inBlock) => inBlock.id === part().id) === true;
            return (
              <div
                class={styles.part}
                data-part={part().id}
                data-lifted={isLifted() ? '' : undefined}
                data-open={chain().has(part().id) ? '' : undefined}
                data-selected={panel().bench && !isLifted() && selection().has(part().id) ? '' : undefined}
                style={{
                  left: `${frame().origin.x - frame().rect.left + part().cell.column * pitch}px`,
                  top: `${frame().origin.y - frame().rect.top + part().cell.row * pitch}px`,
                  width: `${part().span.columns * pitch - cellGap}px`,
                  height: `${part().span.rows * pitch - cellGap}px`
                }}
                onPointerDown={(event) => {
                  if (!props.editing) {
                    return;
                  }

                  if (panel().bench && selection().has(part().id)) {
                    startSelectionDrag(event);
                    return;
                  }

                  const { id, kind, span, looks } = part();
                  startPartDrag(event, { id, kind, span, looks });
                }}
              >
                <Show when={!isLifted()}>
                  <div class={styles.content} inert={props.editing || undefined}>
                    <PartView
                      kind={part().kind}
                      span={part().span}
                      look={lookOf(part())}
                      session={props.session}
                      onPopup={props.onPopup}
                      onOpen={() => toggle(part().id)}
                    />
                  </div>
                </Show>
                <Show when={props.editing && !isLifted() && partLooks(part().kind)}>
                  <button
                    type="button"
                    class={styles.looksHandle}
                    aria-label="Choose look"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) =>
                      props.onPopup(event.currentTarget.parentElement!, { kind: 'looks', id: part().id })
                    }
                  >
                    ⇄
                  </button>
                </Show>
                <Show when={props.editing && !isLifted()}>
                  <span
                    class={styles.corner}
                    aria-label="Resize"
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      startResize(event, panel().id, part().id, part().span);
                    }}
                  />
                </Show>
              </div>
            );
          }}
        </For>
      </div>
    );
  }

  return (
    <>
      <div ref={setLayer} class={styles.board} data-editing={props.editing ? '' : undefined}>
        <Show when={props.editing}>
          <div
            class={styles.bare}
            onPointerDown={armLongPress}
            onContextMenu={openSpawnFromMenuKey}
          />
        </Show>
        <For each={visible()} keyed={(entry) => entry.panel.id}>
          {(entry) => <PanelView entry={entry()} />}
        </For>
      </div>

      <Show when={props.editing && bench()}>
        {(slot) => (
          <Portal mount={slot()}>
            <div class={styles.benchPlate} style={{ scale: `${benchScale()}` }}>
              <For each={benchPanels()} keyed={(entry) => entry.panel.id}>
                {(entry) => <PanelView entry={entry()} />}
              </For>
              <Show when={benchEntry().panel.parts.length === 0}>
                <span class={styles.benchHint}>Workbench: lay parts out, drag across them to select</span>
              </Show>
              <Show when={band()}>{(rect) => <div class={styles.band} style={rectStyle(rect())} />}</Show>
              <Show when={!band() && selectionRect()}>
                {(rect) => (
                  <div class={styles.selection} style={rectStyle(rect())} />
                )}
              </Show>
            </div>
          </Portal>
        )}
      </Show>

      <Show when={lifted()}>
        {(current) => (
          <div
            class={[styles.ghost, current().block ? styles.ghostBlock : styles.part]}
            data-discard={overBox(current().point) ? '' : undefined}
            style={{
              left: `${current().point.x - overlay().x - current().grab.x}px`,
              top: `${current().point.y - overlay().y - current().grab.y}px`,
              width: `${current().span.columns * pitch - cellGap}px`,
              height: `${current().span.rows * pitch - cellGap}px`,
              // As large as it will be on the board, held where it was taken.
              'transform-origin': `${current().grab.x}px ${current().grab.y}px`,
              scale: `${ghostScale(current().point) * 1.06}`
            }}
          >
            <Show
              when={current().block}
              fallback={
                <div class={styles.content} inert>
                  <PartView
                    kind={current().kind}
                    span={current().span}
                    look={lookOf(current())}
                    session={props.session}
                    onPopup={() => {}}
                  />
                </div>
              }
            >
              {(block) => <BlockView parts={block().parts} session={props.session} />}
            </Show>
          </div>
        )}
      </Show>

      <Show when={props.editing}>
        <PartsTray
          ref={setBox}
          benchRef={setBench}
          session={props.session}
          kits={props.kits}
          sheet={props.sheet}
          kitsRef={setKitShelf}
          overKits={keepsOverKits()}
          over={lifted() !== undefined && overBox(lifted()!.point)}
          onLift={(event, kind) => startNewPart(event, kind)}
          onLiftKit={(event, kit) => startKitDrag(event, kit)}
          onReset={() => props.board.reset()}
        />
      </Show>

      <Show when={props.editing && spawn()}>
        {(open) => (
          <SpawnMenu
            at={{ x: open().at.x - overlay().x, y: open().at.y - overlay().y }}
            held={open().held}
            view={props.session.size()}
            hidden={lifted()?.carried === true}
            session={props.session}
            kits={props.kits}
            onLift={(event, kind) => startNewPart(event, kind, open().at)}
            onLiftKit={(event, kit) => startKitDrag(event, kit, open().at)}
            onClose={() => setSpawn(undefined)}
          />
        )}
      </Show>
    </>
  );

  /**
   * Waits for the press `event` on the bare drawing or a panel's free cells to last `longPress` without moving, then
   * opens the spawn menu there, dropping the panel drag the press began.
   */
  function armLongPress(event: PointerEvent) {
    if (event.button !== 0) {
      return;
    }

    stopPress();
    const pointer = event.pointerId;
    const start = { x: event.clientX, y: event.clientY };
    press = {
      pointer,
      start,
      timer: setTimeout(() => {
        press = undefined;
        if (drag()?.pointer === pointer) {
          stopWaiting();
          setDrag(undefined);
        }

        setSpawn({ at: start, held: pointer });
      }, longPress)
    };
  }

  /** Opens the spawn menu at a right click, or at a touch's long press when the browser tells of it first. */
  function openSpawnFromMenuKey(event: MouseEvent) {
    event.preventDefault();
    if (spawn()) {
      return;
    }

    const held = press?.pointer;
    stopPress();
    if (held !== undefined && drag()?.pointer === held) {
      stopWaiting();
      setDrag(undefined);
    }

    setSpawn({ at: { x: event.clientX, y: event.clientY }, held });
  }

  /** Lifts a new part of `kind` from the box, or from the spawn menu opened at `spawnAt`. */
  function startNewPart(event: PointerEvent, kind: string, spawnAt?: Point) {
    startPartDrag(event, { id: newId('part'), kind, span: { columns: 1, rows: 1 } }, { fromBox: true, spawnAt });
  }

  /** Opens swatch `id`'s panel, or closes it, leaving open the panels it lies in. */
  function toggle(id: string) {
    if (!chain().has(id)) {
      props.onOpenPanel(id);
      return;
    }

    props.onOpenPanel(findPart(props.board.board(), id)?.panel.owner);
  }

  /** Lifts a part from the board, or a new one or a kit's block from the box. */
  function startPartDrag(
    event: PointerEvent,
    part: Lifted,
    from: {
      fromBox?: boolean;
      block?: { parts: Part[]; panels: Panel[] };
      spawnAt?: Point;
      /** Where it is held, from its top-left corner, instead of where the press is on the pressed element. */
      grab?: Point;
      /** The board it is carried over, instead of the board without it. */
      base?: Board;
    } = {}
  ) {
    event.preventDefault();
    const element = event.currentTarget as Element;
    const rect = element.getBoundingClientRect();
    const board = props.board.latest();
    const point = { x: event.clientX, y: event.clientY };
    // In the board's pixels: a part on the board is scaled with it; the box's and the menu's tiles and the workbench
    // are not.
    const scale = from.fromBox ? 1 : bench()?.contains(element) ? benchScale() : view().scale;
    const offset = { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
    // A block, or a part from the menu, is held by the middle of its first cell, so it lands around the press.
    const grab =
      from.grab ??
      (from.block || from.spawnAt ? { x: Math.min(offset.x, cellSize / 2), y: Math.min(offset.y, cellSize / 2) } : offset);
    setDrag({
      type: 'part',
      pointer: event.pointerId,
      point,
      start: point,
      grab,
      settled: point,
      base: from.base ?? (findPart(board, part.id) ? removePart(board, part.id) : board),
      before: board,
      pinned: origins(board),
      newPanel: newId('panel'),
      fromBox: from.fromBox ?? false,
      block: from.block,
      spawnAt: from.spawnAt,
      carried: false,
      ...part
    });
  }

  /** Lifts a copy of `kit` from the box, or from the spawn menu opened at `spawnAt`. */
  function startKitDrag(event: PointerEvent, kit: Kit, spawnAt?: Point) {
    const block = unpackKit(kit);
    const bounds = partsBounds(block.parts);
    startPartDrag(
      event,
      { id: newId('block'), kind: 'kit', span: { columns: bounds.columns, rows: bounds.rows } },
      { fromBox: true, block, spawnAt }
    );
  }

  function startResize(event: PointerEvent, panel: string, id: string, span: Span) {
    event.preventDefault();
    setDrag({
      type: 'resize',
      pointer: event.pointerId,
      point: { x: event.clientX, y: event.clientY },
      start: { x: event.clientX, y: event.clientY },
      base: props.board.latest(),
      pinned: origins(props.board.latest()),
      panel,
      id,
      span
    });
  }

  /**
   * Moves a swatch's open panel, pressed by its rim, around its swatch in whole cells, over it too; where it ends is
   * kept as its `offset`. An empty panel stays.
   */
  function startOwnedDrag(event: PointerEvent, panel: Panel, origin: Point) {
    const onBench = bench()?.contains(event.currentTarget as Node) === true;
    const host = (onBench ? benchPanels() : visible()).find((entry) =>
      entry.panel.parts.some((part) => part.id === panel.owner)
    );
    const anchor = host?.panel.parts.find((part) => part.id === panel.owner);
    const point = { x: event.clientX, y: event.clientY };
    const pressed = onBench ? inBench(point) : toView(point);
    if (panel.parts.length === 0 || !host || !anchor || !pressed) {
      return;
    }

    event.preventDefault();
    setDrag({
      type: 'panel',
      pointer: event.pointerId,
      point,
      grab: { x: pressed.x - origin.x, y: pressed.y - origin.y },
      base: props.board.latest(),
      panel: panel.id,
      owned: {
        anchor: {
          x: host.frame.origin.x + anchor.cell.column * pitch,
          y: host.frame.origin.y + anchor.cell.row * pitch
        },
        onBench
      }
    });
  }

  function startPanelDrag(event: PointerEvent, panel: Panel, origin: Point) {
    event.preventDefault();
    const point = { x: event.clientX, y: event.clientY };
    const pressed = toView(point);
    setDrag({
      type: 'panel',
      pointer: event.pointerId,
      point,
      grab: { x: pressed.x - origin.x, y: pressed.y - origin.y },
      base: props.board.latest(),
      panel: panel.id
    });
  }

  /**
   * A press on the workbench's free studs: inside the selection it carries the selected parts, elsewhere it drags a
   * band to select parts with.
   */
  function pressBench(event: PointerEvent) {
    const at = inBench({ x: event.clientX, y: event.clientY });
    const rect = selectionRect();
    if (rect && at && overlap({ left: at.x, top: at.y, width: 1, height: 1 }, rect) > 0) {
      startSelectionDrag(event);
      return;
    }

    if (!at) {
      return;
    }

    event.preventDefault();
    setDrag({ type: 'select', pointer: event.pointerId, point: at, start: at, base: props.board.latest() });
  }

  /**
   * Carries the selected parts of the workbench as one block, as a kit is carried, held where the press is; they land
   * as a panel, in a panel, or elsewhere on the bench.
   */
  function startSelectionDrag(event: PointerEvent) {
    const board = props.board.latest();
    const panel = benchOf(board);
    const parts = panel.parts.filter((part) => selected().has(part.id));
    const at = inBench({ x: event.clientX, y: event.clientY });
    if (parts.length === 0 || !at) {
      return;
    }

    const bounds = partsBounds(parts);
    const origin = benchOrigin;
    const rest = { ...panel, parts: panel.parts.filter((part) => !selected().has(part.id)) };
    startPartDrag(
      event,
      { id: newId('block'), kind: 'kit', span: { columns: bounds.columns, rows: bounds.rows } },
      {
        fromBox: true,
        // Counted from the block's top-left, as a kit's parts are.
        block: {
          parts: parts.map((part) => ({
            ...part,
            cell: { column: part.cell.column - bounds.column, row: part.cell.row - bounds.row }
          })),
          panels: []
        },
        grab: { x: at.x - origin.x - bounds.column * pitch, y: at.y - origin.y - bounds.row * pitch },
        base: putPanel({ panels: board.panels.filter((other) => !other.bench) }, rest)
      }
    );
  }

  /** The workbench of `board` and the open chain of a swatch on it; see `visiblePanels`. */
  function benchVisible(board: Board, pins?: ReadonlyMap<string, Point>) {
    const panel = benchOf(board);
    const bench = { panel, frame: benchFrame(panel, benchView()) };
    return visiblePanels(board, props.openPanel, props.editing, benchView(), pins, bench);
  }

  /** How large a part carried at `point` shows: as the workbench under it, the board, or at full size once carried. */
  function ghostScale(point: Point) {
    if (overBench(point)) {
      return benchScale();
    }

    return carrying() ? 1 : view().scale;
  }

  /** `point` on the page in the workbench's own pixels, before it is shrunk to fit, if its place is there. */
  function inBench(point: Point) {
    const rect = bench()?.getBoundingClientRect();
    if (!rect) {
      return undefined;
    }

    return { x: (point.x - rect.left) / benchScale(), y: (point.y - rect.top) / benchScale() };
  }

  /**
   * Sinks the sheet while a carried part at `point` is above it, so the board shows at full size, and raises it again
   * once the part rests on the strip it left for `springDelay`, opening a closed sheet to the middle.
   */
  function followSheet(point: Point) {
    const rect = box()?.getBoundingClientRect();
    const over = rect !== undefined && point.y >= rect.top;
    if (!props.sheet.sunk()) {
      if (!over) {
        props.sheet.setSunk(true);
      }

      return;
    }

    if (!over) {
      stopSpring();
      return;
    }

    spring ??= setTimeout(() => {
      spring = undefined;
      props.sheet.setSunk(false);
      if (props.sheet.height() <= 0) {
        props.sheet.to('middle');
      }
    }, springDelay);
  }

  /** Where each panel on screen has its cell (0, 0) now, to keep it there through a drag; see `frameAt`. */
  function origins(board: Board) {
    const frames = [...visiblePanels(board, props.openPanel, props.editing, view()), ...benchVisible(board)];
    return new Map(frames.map(({ panel, frame }) => [panel.id, frame.origin]));
  }

  /** The board a resize or a panel move would leave if it ended now. */
  function result(drag: Extract<Drag, { type: 'resize' | 'panel' }>): Board {
    const size = view();

    if (drag.type === 'resize') {
      const panel = drag.base.panels.find((candidate) => candidate.id === drag.panel);
      if (!panel) {
        return drag.base;
      }

      // The workbench, with the panels of its swatches, is sized apart from the board.
      // From the drag's own board: `benchPanels` follows `shown`, which this computes.
      const inBenchPlace = benchVisible(drag.base).some((entry) => entry.panel.id === panel.id);
      const scale = inBenchPlace ? benchScale() : size.scale;
      const span = spanAfter(drag.span, {
        x: (drag.point.x - drag.start.x) / scale,
        y: (drag.point.y - drag.start.y) / scale
      });
      return replacePanel(drag.base, panel.id, { ...panel, parts: resizePart(panel.parts, drag.id, span) });
    }

    const panel = drag.base.panels.find((candidate) => candidate.id === drag.panel);
    if (!panel) {
      return drag.base;
    }

    if (drag.owned) {
      const pointer = (drag.owned.onBench ? inBench(drag.point) : undefined) ?? toView(drag.point);
      const offset = {
        column: Math.round((pointer.x - drag.grab.x - drag.owned.anchor.x) / pitch),
        row: Math.round((pointer.y - drag.grab.y - drag.owned.anchor.y) / pitch)
      };
      return replacePanel(drag.base, panel.id, { ...panel, offset });
    }

    const pointer = toView(drag.point);
    const at = { x: (pointer.x - drag.grab.x) / size.width, y: (pointer.y - drag.grab.y) / size.height };
    return replacePanel(drag.base, panel.id, { ...panel, at });
  }

  /**
   * Where a lifted part or block held at `point` would land: the board with it there, `where` it lands (on the
   * workbench, in the box, put away, or on the board), a `key` naming the spot, and whether it `pushes` other parts
   * aside to fit.
   */
  function partDrop(drag: Extract<Drag, { type: 'part' }>, point: Point) {
    const size = view();
    const part = { id: drag.id, kind: drag.kind, span: drag.span, looks: drag.looks };
    const withOwned = (board: Board) => (drag.block ? { panels: [...board.panels, ...drag.block.panels] } : board);
    /** `drag` placed on `panel` with its top-left at `cell`. */
    const placeOn = (panel: Panel, cell: Cell) => {
      const placed = drag.block
        ? placeBlock(panel.parts, drag.block.parts, cell)
        : placePart(panel.parts, { ...part, cell });
      const before = new Map(panel.parts.map((other) => [other.id, other.cell]));
      return {
        board: withOwned(putPanel(drag.base, { ...panel, parts: placed })),
        key: `${panel.id}:${cell.column},${cell.row}`,
        pushes: placed.some((other) => before.has(other.id) && before.get(other.id) !== other.cell)
      };
    };

    /**
     * The panel among `entries` the part with its top-left at `corner` covers most of, counting half a cell around
     * it, so a part, however long, joins a panel as soon as an edge of it touches; on a tie the top-most one.
     */
    const touched = (entries: ReturnType<typeof visiblePanels>, corner: Point) => {
      const lifted = { left: corner.x, top: corner.y, width: drag.span.columns * pitch, height: drag.span.rows * pitch };
      return entries.reduce<{ entry?: (typeof entries)[number]; area: number }>(
        (best, entry) => {
          const area = overlap(lifted, grow(entry.frame.rect, pitch / 2));
          return area > 0 && area >= best.area ? { entry, area } : best;
        },
        { area: 0 }
      ).entry;
    };

    // Anywhere over the workbench lands on the bench where it is, at full size, in the place's own pixels; its
    // plate starts at cell (0, 0).
    const at = overBench(point) ? inBench(point) : undefined;
    if (at) {
      // An open swatch panel on the bench takes what touches it, as on the board; the bench takes the rest.
      const corner = { x: at.x - drag.grab.x, y: at.y - drag.grab.y };
      const owned = benchVisible(drag.base, drag.pinned).filter((entry) => !entry.panel.bench);
      const into = touched(owned, corner);
      if (into) {
        return { where: 'bench' as const, ...placeOn(into.panel, nearestCell(into.frame.origin, corner)) };
      }

      const nearest = nearestCell(benchOrigin, corner);
      const cell = { column: Math.max(0, nearest.column), row: Math.max(0, nearest.row) };
      return { where: 'bench' as const, ...placeOn(benchOf(drag.base), cell) };
    }

    // Over the kits, something already on the board or the bench stays where it was, and is kept as a kit too.
    if (overKits(point) && keepable(drag)) {
      return { where: 'kits' as const, board: drag.before, key: 'kits', pushes: false };
    }

    if (overBox(point)) {
      return { where: 'box' as const, board: drag.base, key: 'box', pushes: false };
    }

    // The lifted part's top-left corner, in view pixels.
    const pointer = toView(point);
    const corner = { x: pointer.x - drag.grab.x, y: pointer.y - drag.grab.y };

    const target = touched(visiblePanels(drag.base, props.openPanel, props.editing, size, drag.pinned), corner);
    if (target) {
      return { where: 'board' as const, ...placeOn(target.panel, nearestCell(target.frame.origin, corner)) };
    }

    const placedAt = { x: corner.x / size.width, y: corner.y / size.height };
    const parts = drag.block ? drag.block.parts : [{ ...part, cell: { column: 0, row: 0 } }];
    return {
      where: 'board' as const,
      board: withOwned({ panels: [...drag.base.panels, { id: drag.newPanel, at: placedAt, parts }] }),
      key: 'new',
      pushes: false
    };
  }

  /** The workbench's place on the page if `point` is over it while the sheet shows it, otherwise undefined. */
  function overBench(point: Point) {
    const rect = bench()?.getBoundingClientRect();
    const shown = !props.sheet.sunk() && props.sheet.height() > 0;
    return shown && rect && inside(point, rect) ? rect : undefined;
  }

  /** Whether `point` on the page is over the box, where a part is put away; the workbench and the kits in it are not. */
  function overBox(point: Point) {
    const rect = box()?.getBoundingClientRect();
    return rect !== undefined && inside(point, rect) && !overBench(point) && !overKits(point);
  }

  /** Whether what is carried now, a part, group or panel from the board or the bench, would be kept as a kit. */
  function keepsOverKits() {
    const current = drag();
    if (current?.type === 'part') {
      return overKits(current.point) && keepable(current);
    }

    return current?.type === 'panel' && !current.owned && overKits(current.point);
  }

  /** Whether `point` on the page is over the box's kits while the sheet shows them. */
  function overKits(point: Point) {
    const rect = kitShelf()?.getBoundingClientRect();
    return !props.sheet.sunk() && rect !== undefined && rect.height > 0 && inside(point, rect);
  }

  /** Whether carried `drag` was already on the board or the bench, rather than new from the box or a kit. */
  function keepable(drag: Extract<Drag, { type: 'part' }>) {
    const first = drag.block ? drag.block.parts[0]?.id : drag.id;
    return first !== undefined && findPart(drag.before, first) !== undefined;
  }

  /**
   * Keeps what `drag` carries as a new kit, with the panels of the swatches among it, named after what it holds; the
   * board stays as it was.
   */
  function keepAsKit(drag: Extract<Drag, { type: 'part' }>) {
    const parts = drag.block?.parts ?? [{ id: drag.id, kind: drag.kind, span: drag.span, looks: drag.looks, cell: { column: 0, row: 0 } }];
    props.kits.save(drag.before, { id: 'kept', at: { x: 0, y: 0 }, parts }, kitName(parts));
  }

  /** A name for a new kit of `parts`, after what it holds and unlike the user's other kits; see `describeKit`. */
  function kitName(parts: readonly Part[]) {
    return props.kits.uniqueName(describeKit(parts, (kind) => kindLabel(kind, props.session)));
  }
}

/**
 * The panels of `board` on screen, in paint order, with where each lies: the free ones, then the open swatch's panel
 * and the panels of the swatches it lies in, outermost first. While editing, an open swatch without a panel shows an
 * empty one to drop parts into. The panels in `pinned` keep their cell (0, 0) at its origin there. The workbench lies
 * in the box instead (see `benchFrame`): given as `bench`, the panels are it and the open chain of a swatch on it,
 * in its pixels within a `view` its size.
 */
function visiblePanels(
  board: Board,
  open: string | undefined,
  editing: boolean,
  view: { width: number; height: number },
  pinned?: ReadonlyMap<string, Point>,
  bench?: { panel: Panel; frame: ReturnType<typeof panelFrame> }
) {
  // An open chain shows where its outermost swatch lies: on the board, or on the workbench.
  const chain = [...openChain(board, open)].reverse();
  const onBench = chain.length > 0 && findPart(board, chain[0]!)?.panel.bench === true;
  const owned = (onBench === (bench !== undefined) ? chain : [])
    .map((owner) => ownedPanel(board, owner) ?? (editing ? emptyPanel(owner) : undefined))
    .filter((panel): panel is Panel => panel !== undefined);
  const roots = bench ? [bench.panel] : board.panels.filter((panel) => panel.owner === undefined && !panel.bench);
  const panels = [...roots, ...owned];

  const frames = new Map<string, ReturnType<typeof panelFrame>>(bench ? [[bench.panel.id, bench.frame]] : []);
  const frameOf = (panel: Panel, depth = 0): ReturnType<typeof panelFrame> => {
    const known = frames.get(panel.id);
    if (known) {
      return known;
    }

    const host = panels.find((other) => other.parts.some((part) => part.id === panel.owner));
    const anchor = host?.parts.find((part) => part.id === panel.owner);
    const pin = pinned?.get(panel.id);
    let frame = pin ? frameAt(panel, pin) : panelFrame(panel, view);
    if (!pin && host && anchor && depth < 8) {
      const { origin } = frameOf(host, depth + 1);
      const at = { x: origin.x + anchor.cell.column * pitch, y: origin.y + anchor.cell.row * pitch };
      // Where the user put it from its swatch, kept in view; otherwise beside the swatch where there is room.
      frame = panel.offset
        ? keptInView(frameAt(panel, { x: at.x + panel.offset.column * pitch, y: at.y + panel.offset.row * pitch }), view)
        : ownedFrame(
            panel,
            {
              left: at.x,
              top: at.y,
              width: anchor.span.columns * pitch - cellGap,
              height: anchor.span.rows * pitch - cellGap
            },
            view
          );
    }

    frames.set(panel.id, frame);
    return frame;
  };

  return panels.map((panel) => ({ panel, frame: frameOf(panel) }));
}

/** `frame` moved the least it takes to lie inside `view`, as far as it fits. */
function keptInView(frame: ReturnType<typeof panelFrame>, view: { width: number; height: number }) {
  const { rect, origin } = frame;
  const shift = (start: number, length: number, room: number) => Math.max(0, Math.min(start, room - length)) - start;
  const x = shift(rect.left, rect.width, view.width);
  const y = shift(rect.top, rect.height, view.height);
  return {
    origin: { x: origin.x + x, y: origin.y + y },
    rect: { ...rect, left: rect.left + x, top: rect.top + y }
  };
}

/** Swatch `open` and the swatches whose panels it lies in, innermost first; empty when nothing is open or it is gone. */
function openChain(board: Board, open: string | undefined) {
  const chain = new Set<string>();
  for (let owner = open; owner !== undefined && !chain.has(owner); ) {
    const found = findPart(board, owner);
    if (!found) {
      break;
    }

    chain.add(owner);
    owner = found.panel.owner;
  }

  return chain;
}

/** The area two rectangles share; 0 when they do not meet. */
function overlap(a: Rect, b: Rect) {
  const width = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const height = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return width > 0 && height > 0 ? width * height : 0;
}

/** `rect` with `by` CSS pixels more on every side. */
function grow(rect: Rect, by: number): Rect {
  return { left: rect.left - by, top: rect.top - by, width: rect.width + by * 2, height: rect.height + by * 2 };
}

/** The panel origins drag `drag` keeps still, if any. */
function pinned(drag: Drag | undefined) {
  return drag?.type === 'part' || drag?.type === 'resize' ? drag.pinned : undefined;
}

/**
 * The workbench of `board`, an empty one if nothing is on it yet. Its parts start at cell (0, 0) or after; a bench
 * kept before that was so is moved there.
 */
function benchOf(board: Board): Panel {
  const panel = board.panels.find((candidate) => candidate.bench) ?? emptyBench;
  const bounds = partsBounds(panel.parts);
  const shift = { column: Math.min(0, bounds.column), row: Math.min(0, bounds.row) };
  if (shift.column === 0 && shift.row === 0) {
    return panel;
  }

  return {
    ...panel,
    parts: panel.parts.map((part) => ({
      ...part,
      cell: { column: part.cell.column - shift.column, row: part.cell.row - shift.row }
    }))
  };
}

/**
 * Where the workbench `panel` lies in its place of `size` (before it is shrunk to fit), in the bench's pixels: one
 * plate filling the place `benchInset` in from its edges, its cell (0, 0) in the top-left corner, larger if its parts
 * reach further.
 */
function benchFrame(panel: Panel, size: { width: number; height: number }) {
  // Whole cells only, so the plate ends with its padding rather than mid-stud.
  const bounds = partsBounds(panel.parts);
  const fit = (length: number) => Math.floor((length - (benchInset + panelPadding) * 2 + cellGap) / pitch);
  const columns = Math.max(1, fit(size.width), panel.parts.length > 0 ? bounds.column + bounds.columns : 0);
  const rows = Math.max(1, fit(size.height), panel.parts.length > 0 ? bounds.row + bounds.rows : 0);
  return {
    origin: benchOrigin,
    rect: {
      left: benchInset,
      top: benchInset,
      width: columns * pitch - cellGap + panelPadding * 2,
      height: rows * pitch - cellGap + panelPadding * 2
    }
  };
}

/** How far the parts of workbench `panel` reach from its place's top-left, with its insets and padding. */
function benchReach(panel: Panel) {
  if (panel.parts.length === 0) {
    return { width: 0, height: 0 };
  }

  const bounds = partsBounds(panel.parts);
  const reach = (cells: number) => cells * pitch - cellGap + (panelPadding + benchInset) * 2;
  return { width: reach(bounds.column + bounds.columns), height: reach(bounds.row + bounds.rows) };
}

/** Where `part` lies on a plate whose cell (0, 0) starts at `origin`. */
function partRect(part: Part, origin: Point): Rect {
  return {
    left: origin.x + part.cell.column * pitch,
    top: origin.y + part.cell.row * pitch,
    width: part.span.columns * pitch - cellGap,
    height: part.span.rows * pitch - cellGap
  };
}

/** The rectangle between two corners `a` and `b`. */
function bandRect(a: Point, b: Point): Rect {
  return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

/** `rect` as absolute position styles. */
function rectStyle(rect: Rect) {
  return { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` };
}

/** The workbench before anything is put on it. */
const emptyBench: Panel = { id: 'bench', at: { x: 0, y: 0 }, parts: [], bench: true };

/** Whether `point` lies in `rect`. */
function inside(point: Point, rect: DOMRect) {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

function emptyPanel(owner: string): Panel {
  return { id: `${owner}-panel`, at: { x: 0, y: 0 }, owner, parts: [] };
}

/**
 * A drag in progress, by the pointer that started it; `base` is the board without what is being dragged, from which
 * every move computes its result afresh.
 */
type Drag = { pointer: number; point: Point; base: Board } & (
  | (Lifted & {
      type: 'part';
      /** Where the press began, to tell a tap from a drag. */
      start: Point;
      /** Where the pointer holds the part, from its top-left corner. */
      grab: Point;
      /** The pointer position whose drop the board shows; it lags `point` while a drop would push parts aside. */
      settled: Point;
      /** Where each panel had its cell (0, 0) as the drag began; panels keep still there while parts come and go. */
      pinned: ReadonlyMap<string, Point>;
      /** The id a new panel gets if the part lands on the bare drawing. */
      newPanel: string;
      /** Whether it came out of the box rather than off the board. */
      fromBox: boolean;
      /** The board as the drag began, which a drop on the kits leaves as it was. */
      before: Board;
      /** A kit's parts and owned panels, carried as one block of `span`. */
      block?: { parts: Part[]; panels: Panel[] };
      /** Where the spawn menu it came from was opened, where a tap puts it. */
      spawnAt?: Point;
      /** Whether it moved off where it was pressed. */
      carried: boolean;
    })
  | { type: 'resize'; panel: string; id: string; span: Span; start: Point; pinned: ReadonlyMap<string, Point> }
  /** A band dragged across the workbench's free studs, `start` and `point` in its place's pixels. */
  | { type: 'select'; start: Point; base: Board }
  | {
      type: 'panel';
      panel: string;
      grab: Point;
      /** For a swatch's panel: where its swatch's top-left cell starts, on the board or the workbench. */
      owned?: { anchor: Point; onBench: boolean };
    }
);

/** A part as it is carried: everything but the cell it will land on. */
type Lifted = Omit<Part, 'cell'>;

/** CSS pixels a press may move and still be a tap, which opens a swatch's panel while editing. */
const tapDistance = 6;

/** CSS pixels between the workbench's place in the box and the bench panel. */
const benchInset = 16;

/** Where the workbench's cell (0, 0) starts in its place, which does not move as parts come and go. */
const benchOrigin = { x: benchInset + panelPadding, y: benchInset + panelPadding };

/** CSS pixels the selection's outline lies out from the selected parts. */
const selectionPadding = 4;

/** Milliseconds a carried part rests on the sunk sheet's strip before the sheet rises again. */
const springDelay = 450;

/** Milliseconds a still press on the bare drawing or a panel's free cells takes to open the spawn menu. */
const longPress = 420;

/**
 * Milliseconds a lifted part must rest over a spot before the parts in its way move aside, after Android's launcher:
 * passing over parts on the way somewhere else leaves them still.
 */
const reorderDelay = 220;
