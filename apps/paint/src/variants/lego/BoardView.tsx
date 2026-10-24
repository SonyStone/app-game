import { createEventListener } from '@solid-primitives/event-listener';
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
  type Panel,
  type Part,
  type Point,
  type Rect,
  type Span
} from './board';
import type { createBoard } from './createBoard';
import { swatchPanelParts, unpackKit, type createKits, type Kit } from './kits';
import styles from './LegoStudio.module.css';
import { lookOf, partLooks, PartView, type Popup, type Session } from './parts';
import { BlockView, PartsTray } from './PartsTray';
import { SpawnMenu } from './SpawnMenu';

/**
 * The board over the drawing: its panels, and in edit mode the studs, the box of parts and kits, and the drags that
 * change them. While editing, the drawing and the board shrink to a card (see `.cardMode`) with the box docked in
 * the room left beside it, so nothing covers the board; the drawing then takes no strokes.
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
}) {
  const [layer, setLayer] = createSignal<HTMLElement>();
  const [box, setBox] = createSignal<HTMLElement>();
  const [drag, setDrag] = createSignal<Drag>();
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

    return current.type === 'part' ? partDrop(current, current.settled).board : result(current);
  });
  /** The panels on screen, with where each lies; see `visiblePanels`. */
  const visible = createMemo(() => visiblePanels(shown(), props.openPanel, props.editing, view(), pinned(drag())));
  const chain = () => openChain(props.board.board(), props.openPanel);

  /** The drop a lifted part waits on before the parts in its way move aside; see `reorderDelay`. */
  let pending: { key: string; timer: ReturnType<typeof setTimeout> } | undefined;
  const stopWaiting = () => {
    clearTimeout(pending?.timer);
    pending = undefined;
  };
  onCleanup(stopWaiting);

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
    setDrag(undefined);
    let point = { x: event.clientX, y: event.clientY };
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

    let next = partDrop(current, point).board;
    if (current.fromBox && current.kind === 'color:swatch' && findPart(next, current.id)) {
      const { parts } = unpackKit({ parts: swatchPanelParts, owned: [] });
      next = putPanel(next, { id: newId('panel'), at: { x: 0, y: 0 }, owner: current.id, parts });
    }

    props.board.set(pruneOwned(pinPanels(next, current.pinned, view())));
  };
  createEventListener(window, 'pointerup', finish);
  createEventListener(window, 'pointercancel', (event) => {
    if (event.pointerId === press?.pointer) {
      stopPress();
    }

    if (event.pointerId === drag()?.pointer) {
      stopWaiting();
      setDrag(undefined);
    }
  });

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
          {(entry) => {
            const panel = () => entry().panel;
            const frame = () => entry().frame;
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

                  if (panel().owner === undefined) {
                    startPanelDrag(event, panel(), frame().origin);
                  }

                  armLongPress(event);
                }}
                onContextMenu={(event) => {
                  if (props.editing && event.target === event.currentTarget) {
                    openSpawnFromMenuKey(event);
                  }
                }}
              >
                <Show when={panel().parts.length === 0}>
                  <span class={styles.emptyPanel}>Drop parts here</span>
                </Show>
                <For each={panel().parts} keyed={(part) => part.id}>
                  {(part) => {
                    const isLifted = () => lifted()?.id === part().id;
                    return (
                      <div
                        class={styles.part}
                        data-part={part().id}
                        data-lifted={isLifted() ? '' : undefined}
                        data-open={chain().has(part().id) ? '' : undefined}
                        style={{
                          left: `${frame().origin.x - frame().rect.left + part().cell.column * pitch}px`,
                          top: `${frame().origin.y - frame().rect.top + part().cell.row * pitch}px`,
                          width: `${part().span.columns * pitch - cellGap}px`,
                          height: `${part().span.rows * pitch - cellGap}px`
                        }}
                        onPointerDown={(event) => {
                          if (props.editing) {
                            const { id, kind, span, looks } = part();
                            startPartDrag(event, { id, kind, span, looks });
                          }
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
                <Show when={props.editing && panel().parts.length > 0 && !drag()}>
                  <button
                    type="button"
                    class={styles.saveKit}
                    onClick={() => {
                      const name = window.prompt('Name the kit', 'My panel');
                      if (name) {
                        props.kits.save(props.board.latest(), panel(), name);
                      }
                    }}
                  >
                    Save as kit
                  </button>
                </Show>
              </div>
            );
          }}
        </For>

      </div>

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
              scale: `${view().scale * 1.06}`
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
          session={props.session}
          kits={props.kits}
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
    from: { fromBox?: boolean; block?: { parts: Part[]; panels: Panel[] }; spawnAt?: Point } = {}
  ) {
    event.preventDefault();
    const rect = (event.currentTarget as Element).getBoundingClientRect();
    const board = props.board.latest();
    const point = { x: event.clientX, y: event.clientY };
    // In the board's pixels: a part on the board is scaled with it, the box's and the menu's tiles are not.
    const scale = from.fromBox ? 1 : view().scale;
    const offset = { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
    // A block, or a part from the menu, is held by the middle of its first cell, so it lands around the press.
    const grab =
      from.block || from.spawnAt
        ? { x: Math.min(offset.x, cellSize / 2), y: Math.min(offset.y, cellSize / 2) }
        : offset;
    setDrag({
      type: 'part',
      pointer: event.pointerId,
      point,
      start: point,
      grab,
      settled: point,
      base: findPart(board, part.id) ? removePart(board, part.id) : board,
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

  /** Where each panel on screen has its cell (0, 0) now, to keep it there through a drag; see `frameAt`. */
  function origins(board: Board) {
    const frames = visiblePanels(board, props.openPanel, props.editing, view());
    return new Map(frames.map(({ panel, frame }) => [panel.id, frame.origin]));
  }

  /** The board a resize or a panel move would leave if it ended now. */
  function result(drag: Exclude<Drag, { type: 'part' }>): Board {
    const size = view();

    if (drag.type === 'resize') {
      const panel = drag.base.panels.find((candidate) => candidate.id === drag.panel);
      if (!panel) {
        return drag.base;
      }

      const span = spanAfter(drag.span, {
        x: (drag.point.x - drag.start.x) / size.scale,
        y: (drag.point.y - drag.start.y) / size.scale
      });
      return replacePanel(drag.base, panel.id, { ...panel, parts: resizePart(panel.parts, drag.id, span) });
    }

    const panel = drag.base.panels.find((candidate) => candidate.id === drag.panel);
    if (!panel) {
      return drag.base;
    }

    const pointer = toView(drag.point);
    const at = { x: (pointer.x - drag.grab.x) / size.width, y: (pointer.y - drag.grab.y) / size.height };
    return replacePanel(drag.base, panel.id, { ...panel, at });
  }

  /**
   * Where a lifted part or block held at `point` would land: the board with it there, a `key` naming the spot, and
   * whether it `pushes` other parts aside to fit.
   */
  function partDrop(drag: Extract<Drag, { type: 'part' }>, point: Point) {
    const size = view();
    if (overBox(point)) {
      return { board: drag.base, key: 'box', pushes: false };
    }

    // The lifted part's top-left corner, in view pixels.
    const pointer = toView(point);
    const corner = { x: pointer.x - drag.grab.x, y: pointer.y - drag.grab.y };
    const part = { id: drag.id, kind: drag.kind, span: drag.span, looks: drag.looks };
    const withOwned = (board: Board) => (drag.block ? { panels: [...board.panels, ...drag.block.panels] } : board);

    // The panel the part covers most of, counting half a cell around it, so a part, however long, joins a panel as
    // soon as an edge of it touches; on a tie the top-most one.
    const lifted = { left: corner.x, top: corner.y, width: drag.span.columns * pitch, height: drag.span.rows * pitch };
    const panels = visiblePanels(drag.base, props.openPanel, props.editing, size, drag.pinned);
    const target = panels.reduce<{ entry?: (typeof panels)[number]; area: number }>(
      (best, entry) => {
        const area = overlap(lifted, grow(entry.frame.rect, pitch / 2));
        return area > 0 && area >= best.area ? { entry, area } : best;
      },
      { area: 0 }
    ).entry;
    if (target) {
      const { panel, frame } = target;
      const cell = nearestCell(frame.origin, corner);
      const placed = drag.block
        ? placeBlock(panel.parts, drag.block.parts, cell)
        : placePart(panel.parts, { ...part, cell });
      const before = new Map(panel.parts.map((other) => [other.id, other.cell]));
      return {
        board: withOwned(putPanel(drag.base, { ...panel, parts: placed })),
        key: `${panel.id}:${cell.column},${cell.row}`,
        pushes: placed.some((other) => before.has(other.id) && before.get(other.id) !== other.cell)
      };
    }

    const at = { x: corner.x / size.width, y: corner.y / size.height };
    const parts = drag.block ? drag.block.parts : [{ ...part, cell: { column: 0, row: 0 } }];
    return {
      board: withOwned({ panels: [...drag.base.panels, { id: drag.newPanel, at, parts }] }),
      key: 'new',
      pushes: false
    };
  }

  function overBox(point: Point) {
    const rect = box()?.getBoundingClientRect();
    return (
      rect !== undefined &&
      point.x >= rect.left &&
      point.x <= rect.right &&
      point.y >= rect.top &&
      point.y <= rect.bottom
    );
  }
}

/**
 * The panels of `board` on screen, in paint order, with where each lies: the free ones, then the open swatch's panel
 * and the panels of the swatches it lies in, outermost first. While editing, an open swatch without a panel shows an
 * empty one to drop parts into. The panels in `pinned` keep their cell (0, 0) at its origin there.
 */
function visiblePanels(
  board: Board,
  open: string | undefined,
  editing: boolean,
  view: { width: number; height: number },
  pinned?: ReadonlyMap<string, Point>
) {
  const owned = [...openChain(board, open)]
    .reverse()
    .map((owner) => ownedPanel(board, owner) ?? (editing ? emptyPanel(owner) : undefined))
    .filter((panel): panel is Panel => panel !== undefined);
  const panels = [...board.panels.filter((panel) => panel.owner === undefined), ...owned];

  const frames = new Map<string, ReturnType<typeof panelFrame>>();
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
      frame = ownedFrame(
        panel,
        {
          left: origin.x + anchor.cell.column * pitch,
          top: origin.y + anchor.cell.row * pitch,
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
      /** A kit's parts and owned panels, carried as one block of `span`. */
      block?: { parts: Part[]; panels: Panel[] };
      /** Where the spawn menu it came from was opened, where a tap puts it. */
      spawnAt?: Point;
      /** Whether it moved off where it was pressed. */
      carried: boolean;
    })
  | { type: 'resize'; panel: string; id: string; span: Span; start: Point; pinned: ReadonlyMap<string, Point> }
  | { type: 'panel'; panel: string; grab: Point }
);

/** A part as it is carried: everything but the cell it will land on. */
type Lifted = Omit<Part, 'cell'>;

/** CSS pixels a press may move and still be a tap, which opens a swatch's panel while editing. */
const tapDistance = 6;

/** Milliseconds a still press on the bare drawing or a panel's free cells takes to open the spawn menu. */
const longPress = 420;

/**
 * Milliseconds a lifted part must rest over a spot before the parts in its way move aside, after Android's launcher:
 * passing over parts on the way somewhere else leaves them still.
 */
const reorderDelay = 220;
