import { createEventListener } from '@solid-primitives/event-listener';
import { createMemo, createSignal, For, onCleanup, Show } from 'solid-js';
import {
  cellGap,
  cellSize,
  findPart,
  nearestCell,
  newId,
  ownedFrame,
  ownedPanel,
  panelFrame,
  partsBounds,
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
  type Span
} from './board';
import type { createBoard } from './createBoard';
import { swatchPanelParts, unpackKit, type createKits, type Kit } from './kits';
import styles from './LegoStudio.module.css';
import { lookOf, partLooks, PartView, type Popup, type Session } from './parts';
import { BlockView, PartsDrawer } from './PartsDrawer';

/**
 * The board over the drawing: its panels, and in edit mode the studs, the box of parts and kits, and the drags that
 * change them.
 *
 * While editing, a part dragged anywhere lifts and follows the pointer: over a panel (or one cell beside it) it takes
 * the nearest cell and pushes the parts in its way aside, which also grows the panel; over the bare drawing it starts
 * a panel of its own; over the box it is put away. A kit from the box lands the same way, as one block of its parts.
 * Its corner handle sizes a part in whole cells, pushing neighbours right and down; a part with several looks also
 * has a handle opening their chooser. A panel dragged by its rim moves freely, and its button keeps it as a kit.
 *
 * A swatch owns a panel of its own, which lies beside it while open, like an Android folder: a tap opens and closes
 * it, while editing too, and a press elsewhere closes it (while editing, only a press on the bare drawing does, so
 * parts can be carried into it). Parts are carried into and out of it as into any panel; a new swatch comes with
 * the default one. Each drag shows its result while it lasts and is kept on lift. Outside edit mode parts simply work.
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
  /** Whether the box of parts is pulled up; see `PartsDrawer`. It starts closed and closes once a part is taken. */
  const [drawer, setDrawer] = createSignal(false);
  const [drag, setDrag] = createSignal<Drag>();

  /** The view's size, which the board covers, and where it lies on the page. */
  const view = () => {
    const { width, height } = props.session.size();
    const rect = layer()?.getBoundingClientRect();
    return { left: rect?.left ?? 0, top: rect?.top ?? 0, width, height };
  };
  const shown = createMemo(() => {
    const current = drag();
    if (!current) {
      return props.board.board();
    }

    return current.type === 'part' ? partDrop(current, current.settled).board : result(current);
  });
  /** The panels on screen, with where each lies; see `visiblePanels`. */
  const visible = createMemo(() => visiblePanels(shown(), props.openPanel, props.editing, view()));
  const chain = () => openChain(props.board.board(), props.openPanel);

  /** The drop a lifted part waits on before the parts in its way move aside; see `reorderDelay`. */
  let pending: { key: string; timer: ReturnType<typeof setTimeout> } | undefined;
  const stopWaiting = () => {
    clearTimeout(pending?.timer);
    pending = undefined;
  };
  onCleanup(stopWaiting);
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
    const current = drag();
    if (!current || event.pointerId !== current.pointer) {
      return;
    }

    const point = { x: event.clientX, y: event.clientY };
    if (current.type !== 'part') {
      setDrag({ ...current, point });
      return;
    }

    // A swatch carried off closes its panel.
    if (chain().has(current.id) && Math.hypot(point.x - current.start.x, point.y - current.start.y) >= tapDistance) {
      props.onOpenPanel(findPart(props.board.board(), current.id)?.panel.owner);
    }

    // A place with room shows at once; one that pushes parts aside waits until the part rests over it.
    const drop = partDrop(current, point);
    if (!drop.pushes) {
      stopWaiting();
      setDrag({ ...current, point, settled: point });
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

    setDrag({ ...current, point });
  });
  // A lift drops where the part is, without waiting; a press that did not move is a tap.
  const finish = (event: PointerEvent) => {
    const current = drag();
    if (!current || event.pointerId !== current.pointer) {
      return;
    }

    stopWaiting();
    setDrag(undefined);
    const point = { x: event.clientX, y: event.clientY };
    if (current.type !== 'part') {
      props.board.set(result({ ...current, point }));
      return;
    }

    if (!current.fromBox && Math.hypot(point.x - current.start.x, point.y - current.start.y) < tapDistance) {
      if (current.kind === 'color:swatch') {
        toggle(current.id);
      }

      return;
    }

    if (current.fromBox) {
      setDrawer(false);
    }

    let next = partDrop(current, point).board;
    if (current.fromBox && current.kind === 'color:swatch' && findPart(next, current.id)) {
      const { parts } = unpackKit({ parts: swatchPanelParts, owned: [] });
      next = putPanel(next, { id: newId('panel'), at: { x: 0, y: 0 }, owner: current.id, parts });
    }

    props.board.set(pruneOwned(next));
  };
  createEventListener(window, 'pointerup', finish);
  createEventListener(window, 'pointercancel', (event) => {
    if (event.pointerId === drag()?.pointer) {
      stopWaiting();
      setDrag(undefined);
    }
  });

  return (
    <div ref={setLayer} class={styles.board} data-editing={props.editing ? '' : undefined}>
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
                if (props.editing && event.target === event.currentTarget && panel().owner === undefined) {
                  startPanelDrag(event, panel(), frame().origin);
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

      <Show when={lifted()}>
        {(current) => (
          <div
            class={[styles.ghost, current().block ? styles.ghostBlock : styles.part]}
            data-discard={overBox(current().point) ? '' : undefined}
            style={{
              left: `${current().point.x - current().grab.x - view().left}px`,
              top: `${current().point.y - current().grab.y - view().top}px`,
              width: `${current().span.columns * pitch - cellGap}px`,
              height: `${current().span.rows * pitch - cellGap}px`
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
        <PartsDrawer
          ref={setBox}
          session={props.session}
          kits={props.kits}
          open={drawer()}
          onOpen={setDrawer}
          carrying={drag()?.type === 'part'}
          over={lifted() !== undefined && overBox(lifted()!.point)}
          onLift={(event, kind) =>
            startPartDrag(event, { id: newId('part'), kind, span: { columns: 1, rows: 1 } }, { fromBox: true })
          }
          onLiftKit={startKitDrag}
          onReset={() => props.board.reset()}
        />
      </Show>
    </div>
  );

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
    from: { fromBox?: boolean; block?: { parts: Part[]; panels: Panel[] } } = {}
  ) {
    event.preventDefault();
    const rect = (event.currentTarget as Element).getBoundingClientRect();
    const board = props.board.latest();
    const point = { x: event.clientX, y: event.clientY };
    // A block is held by the middle of its first cell, as small as the box's tile it came from.
    const grab = from.block
      ? { x: Math.min(event.clientX - rect.left, cellSize / 2), y: Math.min(event.clientY - rect.top, cellSize / 2) }
      : { x: event.clientX - rect.left, y: event.clientY - rect.top };
    setDrag({
      type: 'part',
      pointer: event.pointerId,
      point,
      start: point,
      grab,
      settled: point,
      base: findPart(board, part.id) ? removePart(board, part.id) : board,
      newPanel: newId('panel'),
      fromBox: from.fromBox ?? false,
      block: from.block,
      ...part
    });
  }

  function startKitDrag(event: PointerEvent, kit: Kit) {
    const block = unpackKit(kit);
    const bounds = partsBounds(block.parts);
    startPartDrag(
      event,
      { id: newId('block'), kind: 'kit', span: { columns: bounds.columns, rows: bounds.rows } },
      { fromBox: true, block }
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
      panel,
      id,
      span
    });
  }

  function startPanelDrag(event: PointerEvent, panel: Panel, origin: Point) {
    event.preventDefault();
    setDrag({
      type: 'panel',
      pointer: event.pointerId,
      point: { x: event.clientX, y: event.clientY },
      grab: { x: event.clientX - view().left - origin.x, y: event.clientY - view().top - origin.y },
      base: props.board.latest(),
      panel: panel.id
    });
  }

  /** The board a resize or a panel move would leave if it ended now. */
  function result(drag: Exclude<Drag, { type: 'part' }>): Board {
    const size = view();

    if (drag.type === 'resize') {
      const panel = drag.base.panels.find((candidate) => candidate.id === drag.panel);
      if (!panel) {
        return drag.base;
      }

      const span = spanAfter(drag.span, { x: drag.point.x - drag.start.x, y: drag.point.y - drag.start.y });
      return replacePanel(drag.base, panel.id, { ...panel, parts: resizePart(panel.parts, drag.id, span) });
    }

    const panel = drag.base.panels.find((candidate) => candidate.id === drag.panel);
    if (!panel) {
      return drag.base;
    }

    const at = {
      x: (drag.point.x - size.left - drag.grab.x) / size.width,
      y: (drag.point.y - size.top - drag.grab.y) / size.height
    };
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
    const corner = { x: point.x - size.left - drag.grab.x, y: point.y - size.top - drag.grab.y };
    const center = {
      x: corner.x + (drag.span.columns * pitch) / 2,
      y: corner.y + (drag.span.rows * pitch) / 2
    };
    const part = { id: drag.id, kind: drag.kind, span: drag.span, looks: drag.looks };
    const withOwned = (board: Board) => (drag.block ? { panels: [...board.panels, ...drag.block.panels] } : board);

    // The top-most panel on screen whose cells, or one ring of cells around them, lie under the part's center.
    for (const { panel, frame } of [...visiblePanels(drag.base, props.openPanel, props.editing, size)].reverse()) {
      const { origin, rect } = frame;
      const inside =
        center.x >= rect.left - pitch &&
        center.x <= rect.left + rect.width + pitch &&
        center.y >= rect.top - pitch &&
        center.y <= rect.top + rect.height + pitch;
      if (inside) {
        const cell = nearestCell(origin, corner);
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
 * empty one to drop parts into.
 */
function visiblePanels(board: Board, open: string | undefined, editing: boolean, view: { width: number; height: number }) {
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
    let frame = panelFrame(panel, view);
    if (host && anchor && depth < 8) {
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
      /** The id a new panel gets if the part lands on the bare drawing. */
      newPanel: string;
      /** Whether it came out of the box rather than off the board. */
      fromBox: boolean;
      /** A kit's parts and owned panels, carried as one block of `span`. */
      block?: { parts: Part[]; panels: Panel[] };
    })
  | { type: 'resize'; panel: string; id: string; span: Span; start: Point }
  | { type: 'panel'; panel: string; grab: Point }
);

/** A part as it is carried: everything but the cell it will land on. */
type Lifted = Omit<Part, 'cell'>;

/** CSS pixels a press may move and still be a tap, which opens a swatch's panel while editing. */
const tapDistance = 6;

/**
 * Milliseconds a lifted part must rest over a spot before the parts in its way move aside, after Android's launcher:
 * passing over parts on the way somewhere else leaves them still.
 */
const reorderDelay = 220;
