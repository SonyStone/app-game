import { createEventListener } from '@solid-primitives/event-listener';
import { createMemo, createSignal, For, onCleanup, Show } from 'solid-js';
import {
  cellSize,
  findPart,
  nearestCell,
  newId,
  panelFrame,
  pitch,
  placePart,
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
import styles from './LegoStudio.module.css';
import { boxKinds, kindLabel, PartView, type Popup, type Session } from './parts';

/**
 * The board over the drawing: its panels, and in edit mode the studs, the box of parts and the drags that change it.
 *
 * While editing, a part dragged anywhere lifts and follows the pointer: over a panel (or one cell beside it) it takes
 * the nearest cell and pushes the parts in its way aside, which also grows the panel; over the bare drawing it starts
 * a panel of its own; over the box it is put away. Its corner handle sizes it in whole cells, pushing neighbours right
 * and down. A panel dragged by its rim moves freely. Each drag shows its result while it lasts and is kept on lift.
 * Outside edit mode parts simply work.
 */
export function BoardView(props: {
  board: ReturnType<typeof createBoard>;
  session: Session;
  editing: boolean;
  onPopup: (anchor: Element, popup: Popup) => void;
}) {
  const [layer, setLayer] = createSignal<HTMLElement>();
  const [box, setBox] = createSignal<HTMLElement>();
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
  // A lift drops where the part is, without waiting.
  const finish = (event: PointerEvent) => {
    const current = drag();
    if (!current || event.pointerId !== current.pointer) {
      return;
    }

    stopWaiting();
    const point = { x: event.clientX, y: event.clientY };
    props.board.set(current.type === 'part' ? partDrop(current, point).board : result({ ...current, point }));
    setDrag(undefined);
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
      <For each={shown().panels} keyed={(panel) => panel.id}>
        {(panel) => {
          const frame = () => panelFrame(panel(), view());
          return (
            <div
              class={styles.panel}
              style={{
                left: `${frame().rect.left}px`,
                top: `${frame().rect.top}px`,
                width: `${frame().rect.width}px`,
                height: `${frame().rect.height}px`,
                '--stud-x': `${frame().origin.x - frame().rect.left}px`,
                '--stud-y': `${frame().origin.y - frame().rect.top}px`
              }}
              onPointerDown={(event) => {
                if (props.editing && event.target === event.currentTarget) {
                  startPanelDrag(event, panel(), frame().origin);
                }
              }}
            >
              <For each={panel().parts} keyed={(part) => part.id}>
                {(part) => {
                  const isLifted = () => lifted()?.id === part().id;
                  return (
                    <div
                      class={styles.part}
                      data-lifted={isLifted() ? '' : undefined}
                      style={{
                        left: `${frame().origin.x - frame().rect.left + part().cell.column * pitch}px`,
                        top: `${frame().origin.y - frame().rect.top + part().cell.row * pitch}px`,
                        width: `${part().span.columns * pitch - (pitch - cellSize)}px`,
                        height: `${part().span.rows * pitch - (pitch - cellSize)}px`
                      }}
                      onPointerDown={(event) => {
                        if (props.editing) {
                          startPartDrag(event, { id: part().id, kind: part().kind, span: part().span });
                        }
                      }}
                    >
                      <Show when={!isLifted()}>
                        <div class={styles.content} inert={props.editing || undefined}>
                          <PartView kind={part().kind} span={part().span} session={props.session} onPopup={props.onPopup} />
                        </div>
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
        }}
      </For>

      <Show when={lifted()}>
        {(current) => (
          <div
            class={[styles.part, styles.ghost]}
            data-discard={overBox(current().point) ? '' : undefined}
            style={{
              left: `${current().point.x - current().grab.x - view().left}px`,
              top: `${current().point.y - current().grab.y - view().top}px`,
              width: `${current().span.columns * pitch - (pitch - cellSize)}px`,
              height: `${current().span.rows * pitch - (pitch - cellSize)}px`
            }}
          >
            <div class={styles.content} inert>
              <PartView kind={current().kind} span={current().span} session={props.session} onPopup={() => {}} />
            </div>
          </div>
        )}
      </Show>

      <Show when={props.editing}>
        <aside ref={setBox} class={styles.box} aria-label="Box of parts">
          <p class={styles.boxTitle}>Drag parts out. Drop one here to put it away.</p>
          <div class={styles.boxGrid}>
            <For each={[...boxKinds, ...props.session.library.presets().map((preset) => `preset:${preset.id}`)]}>
              {(kind) => (
                <div
                  class={styles.part}
                  title={kindLabel(kind, props.session)}
                  style={{ position: 'relative', width: `${cellSize}px`, height: `${cellSize}px` }}
                  onPointerDown={(event) =>
                    startPartDrag(event, { id: newId('part'), kind, span: { columns: 1, rows: 1 } })
                  }
                >
                  <div class={styles.content} inert>
                    <PartView kind={kind} span={{ columns: 1, rows: 1 }} session={props.session} onPopup={() => {}} />
                  </div>
                </div>
              )}
            </For>
          </div>
          <button type="button" class={styles.boxButton} onClick={() => props.board.reset()}>
            Reset
          </button>
        </aside>
      </Show>
    </div>
  );

  /** Lifts a part from the board, or a new one from the box. */
  function startPartDrag(event: PointerEvent, part: { id: string; kind: string; span: Span }) {
    event.preventDefault();
    const rect = (event.currentTarget as Element).getBoundingClientRect();
    const board = props.board.latest();
    setDrag({
      type: 'part',
      pointer: event.pointerId,
      point: { x: event.clientX, y: event.clientY },
      grab: { x: event.clientX - rect.left, y: event.clientY - rect.top },
      settled: { x: event.clientX, y: event.clientY },
      base: findPart(board, part.id) ? removePart(board, part.id) : board,
      newPanel: newId('panel'),
      ...part
    });
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
   * Where a lifted part held at `point` would land: the board with it there, a `key` naming the spot, and whether it
   * `pushes` other parts aside to fit.
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
    const part = { id: drag.id, kind: drag.kind, span: drag.span };

    // The top-most panel whose cells, or one ring of cells around them, lie under the part's center.
    for (const panel of [...drag.base.panels].reverse()) {
      const { origin, rect } = panelFrame(panel, size);
      const inside =
        center.x >= rect.left - pitch &&
        center.x <= rect.left + rect.width + pitch &&
        center.y >= rect.top - pitch &&
        center.y <= rect.top + rect.height + pitch;
      if (inside) {
        const cell = nearestCell(origin, corner);
        const placed = placePart(panel.parts, { ...part, cell });
        const moved = (other: Part) => panel.parts.find((before) => before.id === other.id)?.cell !== other.cell;
        return {
          board: replacePanel(drag.base, panel.id, { ...panel, parts: placed }),
          key: `${panel.id}:${cell.column},${cell.row}`,
          pushes: placed.some((other) => other.id !== part.id && moved(other))
        };
      }
    }

    const at = { x: corner.x / size.width, y: corner.y / size.height };
    return {
      board: {
        panels: [...drag.base.panels, { id: drag.newPanel, at, parts: [{ ...part, cell: { column: 0, row: 0 } }] }]
      },
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
 * A drag in progress, by the pointer that started it; `base` is the board without what is being dragged, from which
 * every move computes its result afresh.
 */
type Drag = { pointer: number; point: Point; base: Board } & (
  | {
      type: 'part';
      id: string;
      kind: string;
      span: Span;
      /** Where the pointer holds the part, from its top-left corner. */
      grab: Point;
      /** The pointer position whose drop the board shows; it lags `point` while a drop would push parts aside. */
      settled: Point;
      /** The id a new panel gets if the part lands on the bare drawing. */
      newPanel: string;
    }
  | { type: 'resize'; panel: string; id: string; span: Span; start: Point }
  | { type: 'panel'; panel: string; grab: Point }
);

/**
 * Milliseconds a lifted part must rest over a spot before the parts in its way move aside, after Android's launcher:
 * passing over parts on the way somewhere else leaves them still.
 */
const reorderDelay = 220;
