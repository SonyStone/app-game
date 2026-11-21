import { createEventListener } from '@solid-primitives/event-listener';
import { createElementSize } from '@solid-primitives/resize-observer';
import { createEffect, createMemo, createSignal, For, onCleanup, Show, untrack } from 'solid-js';
import type { PaintSession } from '../../features/session';
import { PickerScale } from '../../shared/ui/createPickerPixels';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import {
  canDock,
  cellGap,
  dockedLayout,
  dockedRoom,
  findPart,
  floatingGripHeight,
  frameAt,
  freeSpot,
  nearestCell,
  newId,
  ownedFrame,
  ownedPanel,
  panelFrame,
  panelPadding,
  partData,
  partsBounds,
  pinPanels,
  placeBlock,
  placePart,
  pruneOwned,
  putPanel,
  removePart,
  replacePanel,
  resizePart,
  safeArea,
  spanAfter,
  type Board,
  type Cell,
  type DockSide,
  type Panel,
  type Part,
  type Point,
  type Rect,
  type Span
} from './board';
import type { createBoard } from './createBoard';
import type { FileCommandSet } from './FileMenu';
import { FloatingGrip } from './FloatingGrip';
import { joinsAttribute, panelEdges, partEdges, partJoins, sameCells } from './fusion';
import { useGrid } from './grid';
import { nameKit } from './kitNames';
import { kitOf, unpackKit, type createKits, type Kit } from './kits';
import styles from './LegoStudio.module.css';
import { PartFrame } from './PartFrame';
import {
  currentKind,
  kindLabel,
  lookOf,
  partDefaultSpan,
  partDefinition,
  partGroup,
  partLooks,
  partStretch
} from './parts';
import type { Popup } from './parts/definition';
import { BlockView, PartsTray, type CatalogTarget } from './PartsTray';
import { SelectionBar } from './SelectionBar';
import { SpawnMenu } from './SpawnMenu';
import { canDropParts, openChain, visiblePanels } from './windows';

/**
 * The board over the drawing, always at 1:1 scale: its panels, and in edit mode the studs, the floating draggable
 * Edit bar, the modal Parts catalog, and the drags that arrange them. While editing, the drawing takes no strokes.
 *
 * Edit mode is entered from outside (File → Edit layout, or Parts & Options → Interface → Edit layout); a press on a
 * live panel or part never enters it. While editing, a compact `[ ⠿  ＋ Parts  Done ]` bar is placed via `freeSpot` so
 * it covers no existing panel and can be dragged freely by its grip.
 *
 * Opening `Parts` shows the Sidebar catalog (`PartsTray`): dragging a part or kit out slides the catalog away via
 * `data-away` to reveal the live 1:1 board with studs, and dropping it onto the board closes the catalog (cancelling
 * or dropping on the top discard capsule brings the catalog back). Dragging an existing board part onto the top red
 * "Drop to put away" capsule removes it from the board; `SelectionBar` also puts selections away, duplicates them,
 * keeps them as kits, or chooses looks.
 *
 * A long press on the bare drawing or a panel's free cells (or a right click) opens `SpawnMenu` there; a part tapped
 * in it lands at the press. Other surfaces (such as the brush studio) lift new parts onto the board through `ref`'s
 * `lift`, in edit mode or not.
 */
export function BoardView(props: {
  board: ReturnType<typeof createBoard>;
  kits: ReturnType<typeof createKits>;
  session: Pick<PaintSession, 'size' | 'library' | 'brush'>;
  editing: boolean;
  /** Which section the unified Options & Parts dialog is open on, or `undefined` while closed. */
  catalog: CatalogTarget | undefined;
  /** The drawing's file commands for the dialog's File section, guarded by the host. */
  files: FileCommandSet;
  onOpenCatalog: (target: CatalogTarget) => void;
  onCloseCatalog: () => void;
  /** Enters layout edit mode (from Parts & Options → Interface → Edit layout). */
  onEnterEdit: () => void;
  /** Exits layout edit mode (from the floating Edit bar's Done button). */
  onExitEdit: () => void;
  /** The swatch whose panel is open; the panels of the swatches it lies in show too. */
  openPanel: string | undefined;
  onOpenPanel: (owner: string | undefined) => void;
  onPopup: (anchor: Element, popup: Popup) => void;
  /** Receives the board's commands for other surfaces once it is made, and `undefined` when it is disposed. */
  ref?: (controls: BoardControls | undefined) => void;
}) {
  const grid = useGrid();
  const [layer, setLayer] = createSignal<HTMLElement>();
  const [discardZone, setDiscardZone] = createSignal<HTMLElement>();
  const [editBar, setEditBar] = createSignal<HTMLElement>();
  const editBarMeasured = createElementSize(editBar);
  const [drag, setDrag] = createSignal<Drag>();
  /** The kit just kept, or the one a kept part or group already matched, lit for a moment; see `keepKit`. */
  const [flashKit, setFlashKit] = createSignal<string>();
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(flashTimer));
  /** The selected parts on the board, reset when leaving edit mode. */
  const [selected, setSelected] = createSignal<ReadonlySet<string>>(() => {
    void props.editing;
    return new Set<string>();
  });
  /** Whether the edit mode's hint still shows; it goes for good once something is selected. */
  const [hinted, setHinted] = createSignal(readHinted());
  createEffect(
    () => !hinted() && selected().size > 0,
    (learned) => {
      if (learned) {
        setHinted(true);
        try {
          localStorage.setItem(hintKey, '1');
        } catch {
          // The hint shows again on the next visit.
        }
      }
    }
  );
  /** The open spawn menu: where it was opened, and the pointer of the press while it is held. */
  const [spawn, setSpawn] = createSignal<{ at: Point; held?: number } | undefined>(() => {
    void props.editing;
    return undefined;
  });

  /** The view's size, always 1:1 with the drawing, and where the board lies on the page. */
  const view = () => {
    const { width, height } = props.session.size();
    const rect = layer()?.getBoundingClientRect();
    return { left: rect?.left ?? 0, top: rect?.top ?? 0, width, height };
  };
  /** `point` on the page in the board's 1:1 pixels. */
  const toView = (point: Point) => {
    const { left, top } = view();
    return { x: point.x - left, y: point.y - top };
  };
  /** Where the layer the ghost, edit bar and menus lie in starts on the page. */
  const overlay = () => {
    const rect = layer()?.parentElement?.getBoundingClientRect();
    return { x: rect?.left ?? 0, y: rect?.top ?? 0 };
  };
  const editBarSize = () => ({
    width: editBarMeasured.width || defaultEditBarWidth,
    height: editBarMeasured.height || defaultEditBarHeight
  });
  /**
   * Position of the floating Edit bar in view pixels. Computed once via `freeSpot` when entering edit mode so it
   * overlaps no existing panel, and freely movable by dragging its grip.
   */
  const [editBarPos, setEditBarPos] = createSignal<Point | undefined>(() =>
    props.editing ? untrack(initialEditBarSpot) : undefined
  );
  /** The Edit bar's box in the board's pixels while it shows, for the selection's bar to keep clear of. */
  const editBarRect = (): Rect | undefined => {
    const pos = editBarPos();
    if (!pos || !props.editing || props.catalog !== undefined) {
      return undefined;
    }

    const shift = overlay();
    const { left, top } = view();
    return { left: pos.x + shift.x - left, top: pos.y + shift.y - top, ...editBarSize() };
  };
  let stopBarDrag: (() => void) | undefined;
  onCleanup(() => stopBarDrag?.());

  const shown = createMemo(() => {
    const current = drag();
    if (!current) {
      return props.board.board();
    }

    if (current.type === 'part' && !current.carried) {
      return current.before;
    }

    if (current.type === 'select') {
      return props.board.board();
    }

    if (current.type === 'part') {
      return partDrop(current, current.settled, current.joinedTarget !== undefined).board;
    }

    if (current.type === 'panel' && current.joined) {
      return current.joined.board;
    }

    return result(current);
  });
  /** The panels on screen, with where each lies; see `visiblePanels`. */
  const visible = createMemo(() =>
    visiblePanels(grid.pitch(), shown(), props.openPanel, props.editing, view(), pinned(drag()), partStretch)
  );
  /** Remaining viewport inside docked sidebars, for SelectionBar and Edit bar clamping. */
  const boardSafeArea = createMemo(() => safeArea(grid.pitch(), shown(), view(), props.editing, partStretch));
  /** Part kinds currently on the board, for the catalog's "On board" mark. */
  const onBoardKinds = createMemo(
    () => new Set(props.board.board().panels.flatMap((panel) => panel.parts.map((part) => currentKind(part.kind))))
  );
  /** The band being dragged across the board, in its pixels. */
  const band = () => {
    const current = drag();
    return current?.type === 'select' ? bandRect(current.start, current.point) : undefined;
  };
  /** The selected parts, or those the band touches while it is dragged. */
  const selection = createMemo<ReadonlySet<string>>(() => {
    const dragged = band();
    if (!dragged) {
      return selected();
    }

    return new Set(
      visible().flatMap(({ panel, frame }) =>
        panel.parts
          .filter((part) => overlap(dragged, partRect(grid.pitch(), part, frame.origin)) > 0)
          .map((part) => part.id)
      )
    );
  });
  /**
   * The one part selected while editing, with the panel it lies on as shown: it alone has a resize handle, and its
   * look is chosen from the selection's bar. None while several are selected, a band is dragged or a part carried.
   */
  const sizable = () => {
    const ids = selection();
    if (!props.editing || band() || lifted() || ids.size !== 1) {
      return undefined;
    }

    return findPart(shown(), [...ids][0]!);
  };
  /**
   * The sides the one selected part fuses along, so the selection's outline takes the part's square corners there;
   * see `fusion.ts`.
   */
  const sizableJoins = () => {
    const found = sizable();
    return found && joinsAttribute(partJoins(found.panel.parts, partGroup).get(found.part.id));
  };
  /** Where the selected parts on the board lie together, in its pixels, while nothing is carried. */
  const boardSelectionRect = () => {
    const rects = visible().flatMap(({ panel, frame }) =>
      panel.parts.filter((part) => selection().has(part.id)).map((part) => partRect(grid.pitch(), part, frame.origin))
    );
    if (rects.length === 0 || lifted()) {
      return undefined;
    }

    const left = Math.min(...rects.map((rect) => rect.left));
    const top = Math.min(...rects.map((rect) => rect.top));
    const right = Math.max(...rects.map((rect) => rect.left + rect.width));
    const bottom = Math.max(...rects.map((rect) => rect.top + rect.height));
    return {
      left: left - selectionPadding,
      top: top - selectionPadding,
      width: right - left + selectionPadding * 2,
      height: bottom - top + selectionPadding * 2
    };
  };
  const chain = () => openChain(props.board.board(), props.openPanel);

  /** The drop a lifted part or dragged panel waits on before pushing/merging; see `reorderDelay` / `joinDelay`. */
  let pending: { key: string; origin: Point; timer: ReturnType<typeof setTimeout> } | undefined;
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
  const panelDrag = () => {
    const current = drag();
    return current?.type === 'panel' ? current : undefined;
  };
  /** The panel currently highlighted as an intentional merge target while waiting on `joinDelay`. */
  const joinHoverId = () => {
    const current = drag();
    if (current?.type === 'part' || current?.type === 'panel') {
      return current.hoverTarget;
    }

    return undefined;
  };
  /**
   * The ids of the carried parts, one per line: a string, so what reads it reruns when a carry starts or ends, not
   * as the pointer moves.
   */
  const carriedIds = createMemo(() => {
    const current = lifted();
    return current?.carried ? [current.id, ...(current.block?.parts.map((part) => part.id) ?? [])].join('\n') : '';
  });

  // Closes open swatch panels on outside press.
  createEventListener(
    window,
    'pointerdown',
    (event) => {
      const target = event.target instanceof Element ? event.target : undefined;
      const part = target?.closest<HTMLElement>('[data-part]')?.dataset.part;
      if (props.openPanel && !target?.closest('[data-owned]') && !(part && chain().has(part))) {
        if (!props.editing || !target?.closest('[data-keeps-panel]')) {
          props.onOpenPanel(undefined);
        }
      }
    },
    { capture: true }
  );

  createEventListener(window, 'pointermove', followPointer, { capture: true });
  function followPointer(event: PointerEvent) {
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
      setDrag({ ...current, point: toView(point) });
      return;
    }

    if (current.type === 'resize') {
      setDrag({ ...current, point });
      return;
    }

    if (current.type === 'panel') {
      const moved = Math.hypot(point.x - current.start.x, point.y - current.start.y) >= tapDistance;
      const carried = current.carried || moved;
      if (current.owned || !props.editing) {
        setDrag({ ...current, point, carried });
        return;
      }

      const panel = current.base.panels.find((candidate) => candidate.id === current.panel);
      if (!panel) {
        setDrag({ ...current, point, carried });
        return;
      }

      if (overDiscard(point)) {
        stopWaiting();
        setDrag({ ...current, point, carried, dockPreview: undefined, hoverTarget: undefined, joined: undefined });
        return;
      }

      const size = view();
      const pitch = grid.pitch();
      const pointer = toView(point);
      const layout = dockedLayout(pitch, { ...panel, dock: undefined }, size, partStretch);
      const rect = frameAt(pitch, layout, { x: 0, y: 0 }).rect;
      const panelLeft = pointer.x - current.grab.x + rect.left;
      const panelRight = panelLeft + rect.width;
      const dockPreview = resolveDockPreview(current.dockPreview, panelLeft, panelRight, size.width, pitch, (side) =>
        canDock(pitch, current.base, panel.id, side, size, partStretch)
      );

      // Free panels can intentionally merge into another panel by dwelling `joinDelay` over it. Over a docked panel
      // that wins over docking beside it: the pointer there is at the screen edge, where a dock would preview too.
      const candidateTarget = carried && !panel.floating ? panelJoinTarget(current, panel, pointer) : undefined;
      if (dockPreview && !candidateTarget?.panel.dock) {
        stopWaiting();
        setDrag({ ...current, point, carried, dockPreview, hoverTarget: undefined, joined: undefined });
        return;
      }

      if (!candidateTarget) {
        stopWaiting();
        setDrag({ ...current, point, carried, dockPreview: undefined, hoverTarget: undefined, joined: undefined });
        return;
      }

      if (current.joined?.targetId === candidateTarget.panel.id) {
        const merged = mergePanelInto(current, panel, candidateTarget, pointer);
        setDrag({
          ...current,
          point,
          carried,
          dockPreview: undefined,
          hoverTarget: candidateTarget.panel.id,
          joined: { targetId: candidateTarget.panel.id, board: merged }
        });
        return;
      }

      const dwellKey = `panel-join:${candidateTarget.panel.id}`;
      const drifted = !pending || Math.hypot(point.x - pending.origin.x, point.y - pending.origin.y) >= pitch * 0.5;
      if (pending?.key !== dwellKey || drifted) {
        stopWaiting();
        pending = {
          key: dwellKey,
          origin: point,
          timer: setTimeout(() => {
            pending = undefined;
            const latest = drag();
            if (latest?.type !== 'panel') {
              return;
            }

            const host = latest.base.panels.find((candidate) => candidate.id === latest.panel);
            if (!host) {
              return;
            }

            const latestPointer = toView(latest.point);
            const target = panelJoinTarget(latest, host, latestPointer);
            if (!target || target.panel.id !== candidateTarget.panel.id) {
              return;
            }

            const merged = mergePanelInto(latest, host, target, latestPointer);
            setDrag({
              ...latest,
              dockPreview: undefined,
              hoverTarget: target.panel.id,
              joined: { targetId: target.panel.id, board: merged }
            });
          }, joinDelay)
        };
      }

      setDrag({
        ...current,
        point,
        carried,
        dockPreview: undefined,
        hoverTarget: candidateTarget.panel.id,
        joined: undefined
      });
      return;
    }

    // A swatch carried off closes its panel; a part carried off the catalog or spawn menu hides it.
    const moved = Math.hypot(point.x - current.start.x, point.y - current.start.y) >= tapDistance;
    if (moved && chain().has(current.id)) {
      props.onOpenPanel(findPart(props.board.board(), current.id)?.panel.owner);
    }

    const carried = current.carried || moved;

    // Evaluate what lies under the pointer; cross-panel merges that expand/push wait on `joinDelay` without moving parts.
    const drop = partDrop(current, point, true);
    const sameTargetJoined = drop.targetId !== undefined && current.joinedTarget === drop.targetId;
    const needsJoinWait =
      drop.targetId !== undefined &&
      drop.targetId !== current.sourcePanel &&
      (drop.pushes || drop.expands) &&
      !sameTargetJoined;

    if (needsJoinWait) {
      const pitch = grid.pitch();
      const dwellKey = `part-join:${drop.targetId}`;
      const drifted = !pending || Math.hypot(point.x - pending.origin.x, point.y - pending.origin.y) >= pitch * 0.5;
      if (pending?.key !== dwellKey || drifted) {
        stopWaiting();
        pending = {
          key: dwellKey,
          origin: point,
          timer: setTimeout(() => {
            pending = undefined;
            const latest = drag();
            if (latest?.type === 'part') {
              setDrag({ ...latest, settled: latest.point, joinedTarget: drop.targetId, hoverTarget: undefined });
            }
          }, joinDelay)
        };
      }

      setDrag({
        ...current,
        point,
        settled: point,
        carried,
        joinedTarget: undefined,
        hoverTarget: drop.targetId
      });
      return;
    }

    if (!drop.pushes) {
      stopWaiting();
      setDrag({
        ...current,
        point,
        settled: point,
        carried,
        joinedTarget: drop.targetId,
        hoverTarget: undefined
      });
      return;
    }

    if (drop.key !== pending?.key) {
      stopWaiting();
      pending = {
        key: drop.key,
        origin: point,
        timer: setTimeout(() => {
          pending = undefined;
          const latest = drag();
          if (latest?.type === 'part') {
            setDrag({ ...latest, settled: latest.point, joinedTarget: drop.targetId, hoverTarget: undefined });
          }
        }, reorderDelay)
      };
    }

    setDrag({ ...current, point, carried, hoverTarget: undefined });
  }

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
    if (current.type === 'select') {
      // A band selects what it touched; a tap on the bare drawing clears the selection, and closes a swatch's open
      // panel.
      const end = toView(point);
      const tapped = Math.hypot(end.x - current.start.x, end.y - current.start.y) < tapDistance;
      setSelected(tapped ? new Set<string>() : selection());
      if (tapped) {
        props.onOpenPanel(undefined);
      }

      return;
    }

    if (current.type === 'panel') {
      const tapped = Math.hypot(point.x - current.start.x, point.y - current.start.y) < tapDistance;
      if (tapped) {
        if (current.tappedPartId !== undefined) {
          const found = findPart(current.base, current.tappedPartId);
          if (found) {
            setSelected(new Set([current.tappedPartId]));
          }

          if (found && (ownedPanel(current.base, current.tappedPartId) || partDefinition(found.part.kind)?.owned)) {
            toggle(current.tappedPartId);
          }

          return;
        }

        if (!current.owned) {
          props.onOpenPanel(undefined);
        }

        return;
      }

      if (props.editing && !current.owned && overDiscard(point)) {
        const next = pruneOwned({
          ...current.base,
          panels: current.base.panels.filter((panel) => panel.id !== current.panel)
        });
        props.board.set(next);
        setSelected(new Set<string>());
        return;
      }

      // WYSIWYG: commit the settled preview (merged only if `joinDelay` elapsed, else moved/docked panel).
      if (current.joined) {
        props.board.set(pruneOwned(pinPanels(grid.pitch(), current.joined.board, current.pinned, view())));
        const kept = props.board.latest();
        setSelected(new Set([...selected()].filter((id) => findPart(kept, id) !== undefined)));
        return;
      }

      props.board.set(result({ ...current, point }));
      return;
    }

    if (current.type === 'resize') {
      const ended = result({ ...current, point });
      props.board.set(pinPanels(grid.pitch(), ended, current.pinned, view()));
      return;
    }

    const tapped = Math.hypot(point.x - current.start.x, point.y - current.start.y) < tapDistance;
    // A tap on a part selects it alone, as a band around it would; a swatch also opens or closes.
    const tappedId = tapped ? (current.pressed ?? (current.fromBox ? undefined : current.id)) : undefined;
    if (tappedId !== undefined) {
      const part = findPart(current.before, tappedId);
      if (part) {
        setSelected(new Set([tappedId]));
      }

      if (part && (ownedPanel(current.before, tappedId) || partDefinition(part.part.kind)?.owned)) {
        toggle(tappedId);
      }

      return;
    }

    // A part tapped in the spawn menu lands where the menu was opened; one tapped in the catalog stays there.
    if (current.spawnAt) {
      setSpawn(undefined);
      point = tapped ? current.spawnAt : point;
    } else if (tapped) {
      return;
    }

    // WYSIWYG: drop commits the exact preview state (`settled` + whether dwell join unlocked).
    const dropPoint = overDiscard(point) || (current.spawnAt && tapped) ? point : current.settled;
    const drop = partDrop(current, dropPoint, current.joinedTarget !== undefined);
    if (drop.where === 'discard' && current.fromBox) {
      // Cancelled drag from the catalog: board stays unchanged and catalog returns.
      return;
    }

    if (current.fromBox && !current.spawnAt && drop.where === 'board') {
      props.onCloseCatalog();
    }

    let next = drop.board;
    const defaults = current.fromBox ? partDefinition(current.kind)?.owned : undefined;
    if (defaults && findPart(next, current.id)) {
      const { parts } = unpackKit({ parts: defaults.parts, owned: [] });
      next = putPanel(next, {
        id: newId('panel'),
        at: { x: 0, y: 0 },
        owner: current.id,
        parts
      });
    }

    props.board.set(pruneOwned(pinPanels(grid.pitch(), next, current.pinned, view())));
    // What was selected stays so where it landed, to be carried on.
    const kept = props.board.latest();
    setSelected(new Set([...selected()].filter((id) => findPart(kept, id) !== undefined)));
  };
  createEventListener(window, 'pointerup', finish, { capture: true });
  createEventListener(
    window,
    'pointercancel',
    (event) => {
      if (event.pointerId === press?.pointer) {
        stopPress();
      }

      if (event.pointerId === drag()?.pointer) {
        stopWaiting();
        setDrag(undefined);
      }
    },
    { capture: true }
  );

  props.ref?.({
    lift: (event, kind, span) =>
      startPartDrag(event, { id: newId('part'), kind, span: span ?? { columns: 1, rows: 1 } }, { fromBox: true }),
    place: (kind, span = { columns: 1, rows: 1 }) => {
      const board = props.board.latest();
      props.board.set(
        putPanel(board, {
          id: newId('panel'),
          at: freeSpot(grid.pitch(), board, view(), span),
          parts: [{ id: newId('part'), kind, cell: { column: 0, row: 0 }, span }]
        })
      );
    },
    carrying: () => lifted()?.carried === true
  });
  onCleanup(() => props.ref?.(undefined));

  /** A panel of the board, with its parts and, while editing, their handles. */
  function PanelView(entryProps: { entry: { panel: Panel; frame: ReturnType<typeof panelFrame> } }) {
    const panel = () => entryProps.entry.panel;
    const frame = () => entryProps.entry.frame;
    // The sides each part fuses along, from the parts' cells alone: recomputed as parts move, never per frame. A
    // carried part's landing place fuses with nothing, nor does a part that failed to load.
    const fusing = createMemo(
      () => {
        const carried = new Set(carriedIds().split('\n'));
        return panel().parts.filter((part) => !carried.has(part.id) && !part[partData]?.invalid);
      },
      { equals: sameCells }
    );
    const joins = createMemo(() => partJoins(fusing(), partGroup));
    const edges = createMemo(() => panelEdges(frame().rect, view()));
    const panelBounds = createMemo(() => partsBounds(panel().parts));
    const isDockPreview = () => {
      const current = panelDrag();
      return current?.panel === panel().id && current.dockPreview !== undefined;
    };
    const partHeightPx = (part: Part) => {
      const base = grid.length(part.span.rows);
      if (!panel().dock || partStretch(part.kind) !== 'rows') {
        return base;
      }

      const bounds = panelBounds();
      const isBottommost = part.cell.row + part.span.rows === bounds.row + bounds.rows;
      if (!isBottommost) {
        return base;
      }

      const handle = panel().floating ? floatingGripHeight : 0;
      const available = frame().rect.height - panelPadding * 2 - handle - (part.cell.row - bounds.row) * grid.pitch();
      return Math.max(base, available);
    };
    return (
      <div
        class={[styles.panel, panel().owner !== undefined && styles.owned]}
        data-panel={panel().id}
        data-dock={panel().dock}
        data-dock-preview={isDockPreview() ? '' : undefined}
        data-moving={panelDrag()?.panel === panel().id ? '' : undefined}
        data-join-target={joinHoverId() === panel().id ? '' : undefined}
        data-floating={panel().floating ? '' : undefined}
        data-empty={panel().parts.length === 0 ? '' : undefined}
        data-owned={panel().owner !== undefined ? '' : undefined}
        data-edges={joinsAttribute(edges())}
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
        <Show when={panel().floating && (!panel().dock || props.editing)}>
          <FloatingGrip onDrag={(event) => startPanelDrag(event, panel(), frame().origin)} />
        </Show>
        <Show when={props.editing && panel().parts.length === 0}>
          <span class={styles.emptyPanel}>Drop parts here</span>
        </Show>
        {/*
         * The parts lie from the panel's cell (0, 0), which stays still while the panel grows or shrinks around a
         * carried part: the panel's edge moves at once, and only parts that change cells slide.
         */}
        <div
          class={styles.cells}
          style={{
            left: `${frame().origin.x - frame().rect.left}px`,
            top: `${frame().origin.y - frame().rect.top}px`
          }}
        >
          <For each={panel().parts} keyed={(part) => part.id}>
            {(part) => {
              // The lifted part, or a carried block's parts, show only where they would land.
              const isLifted = () => isCarried(part().id);
              return (
                <div
                  class={styles.part}
                  data-part={part().id}
                  data-joins={joinsAttribute(joins().get(part().id))}
                  data-edges={joinsAttribute(partEdges(part(), panel().parts, edges(), panel().floating))}
                  data-lifted={isLifted() ? '' : undefined}
                  data-open={chain().has(part().id) ? '' : undefined}
                  data-selected={props.editing && !isLifted() && selection().has(part().id) ? '' : undefined}
                  style={{
                    left: `${part().cell.column * grid.pitch()}px`,
                    top: `${part().cell.row * grid.pitch()}px`,
                    width: `${grid.length(part().span.columns)}px`,
                    height: `${partHeightPx(part())}px`
                  }}
                  onPointerDown={(event) => {
                    if (!props.editing) {
                      return;
                    }

                    if (selection().has(part().id)) {
                      const whole = selectedWholePanel();
                      if (whole && whole.id === panel().id) {
                        startPanelDrag(event, panel(), frame().origin, part().id);
                        return;
                      }

                      startBoardSelectionDrag(event, part().id);
                      return;
                    }

                    if (panel().parts.length === 1 && panel().owner === undefined) {
                      startPanelDrag(event, panel(), frame().origin, part().id);
                      return;
                    }

                    startPartDrag(event, part());
                  }}
                >
                  <div class={styles.content}>
                    <PartFrame
                      mode={props.editing ? 'edit' : 'live'}
                      kind={part().kind}
                      missing={!!part()[partData]?.invalid}
                      span={part().span}
                      look={lookOf(part(), grid.room(part().span))}
                      onPopup={props.onPopup}
                      open={chain().has(part().id)}
                      onOpen={() => toggle(part().id)}
                    />
                  </div>
                </div>
              );
            }}
          </For>
          {/* Outside the part, which clips its print, so the handle can be larger than a small part's corner. */}
          {/*
           * The part as the panel shows it, not as it is stored: a docked or view-clamped part is shorter on screen
           * than its stored span, and the handle must sit on the corner the user sees and resize from that size.
           */}
          <Show
            when={
              sizable()?.panel.id === panel().id &&
              panel().parts.find((candidate) => candidate.id === sizable()?.part.id)
            }
          >
            {(part) => (
              <span
                class={styles.corner}
                aria-label="Resize"
                style={{
                  left: `${(part().cell.column + part().span.columns) * grid.pitch() - cellGap}px`,
                  top: `${part().cell.row * grid.pitch() + partHeightPx(part())}px`
                }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  startResize(event, panel().id, part().id, part().span);
                }}
              />
            )}
          </Show>
        </div>
      </div>
    );
  }

  /** Whether part `id` is carried, alone or in a block, and shows only where it would land. */
  function isCarried(id: string) {
    const current = lifted();
    return (
      current?.carried === true &&
      (current.id === id || current.block?.parts.some((inBlock) => inBlock.id === id) === true)
    );
  }

  /** Returns the single non-owned panel whose parts exactly equal the current selection, if any. */
  function selectedWholePanel() {
    const ids = selection();
    if (ids.size === 0) {
      return undefined;
    }

    return props.board
      .board()
      .panels.find(
        (panel) =>
          panel.owner === undefined &&
          panel.parts.length === ids.size &&
          panel.parts.every((part) => ids.has(part.id))
      );
  }

  /** Toggles screen-edge docking on `panel`: undocks if docked, else docks to the nearer edge if `canDock`. */
  function toggleDockPanel(panel: Panel) {
    const board = props.board.latest();
    if (panel.dock) {
      props.board.set(replacePanel(board, panel.id, { ...panel, dock: undefined }));
      return;
    }

    const size = view();
    const frame = visible().find((entry) => entry.panel.id === panel.id)?.frame;
    const centerX = frame ? frame.rect.left + frame.rect.width / 2 : panel.at.x * size.width;
    const preferred: DockSide = centerX <= size.width / 2 ? 'left' : 'right';
    const fallback: DockSide = preferred === 'left' ? 'right' : 'left';
    const side = canDock(grid.pitch(), board, panel.id, preferred, size, partStretch)
      ? preferred
      : canDock(grid.pitch(), board, panel.id, fallback, size, partStretch)
        ? fallback
        : undefined;
    if (side) {
      props.board.set(replacePanel(board, panel.id, { ...panel, dock: side }));
    }
  }

  /** The selection's bar over its outline in the board's safe area. */
  function Bar(barProps: { rect: Rect; area: Rect }) {
    const whole = () => selectedWholePanel();
    const dockAction = (): 'dock' | 'undock' | undefined => {
      const host = whole();
      if (!host) {
        return undefined;
      }

      if (host.dock) {
        return 'undock';
      }

      const board = props.board.board();
      const size = view();
      const fitsEither =
        canDock(grid.pitch(), board, host.id, 'left', size, partStretch) ||
        canDock(grid.pitch(), board, host.id, 'right', size, partStretch);
      return fitsEither ? 'dock' : undefined;
    };

    return (
      <SelectionBar
        rect={barProps.rect}
        area={barProps.area}
        avoid={editBarRect()}
        looks={!sizable()?.part[partData]?.invalid && partLooks(sizable()?.part.kind ?? '') !== undefined}
        dock={dockAction()}
        kept={flashKit() !== undefined}
        onPutAway={putAwaySelected}
        onDuplicate={duplicateSelected}
        onKeep={keepSelected}
        onToggleDock={() => {
          const host = whole();
          if (host) {
            toggleDockPanel(host);
          }
        }}
        onLooks={() => {
          const id = sizable()?.part.id;
          const element = id ? document.querySelector(`[data-part="${CSS.escape(id)}"]`) : undefined;
          if (id && element) {
            props.onPopup(element, { kind: 'looks', id });
          }
        }}
      />
    );
  }

  return (
    <>
      <div
        ref={setLayer}
        class={styles.board}
        data-editing={props.editing ? '' : undefined}
        data-carrying={lifted()?.carried ? '' : undefined}
      >
        <Show when={props.editing}>
          <div
            class={styles.bare}
            onPointerDown={(event) => {
              pressBoard(event);
              armLongPress(event);
            }}
            onContextMenu={openSpawnFromMenuKey}
          />
        </Show>
        <For each={visible()} keyed={(entry) => entry.panel.id}>
          {(entry) => <PanelView entry={entry()} />}
        </For>
        <Show when={props.editing}>
          <Show when={!hinted() && !drag() && props.catalog === undefined}>
            <p class={styles.editHint} role="status">
              Tap a part to select it · drag to move · long press for quick menu
            </p>
          </Show>
          <Show when={band()}>
            {(dragged) => <div class={styles.band} style={rectStyle(dragged())} />}
          </Show>
          <Show when={!band() && boardSelectionRect()}>
            {(rect) => (
              <>
                <div class={styles.selection} data-joins={sizableJoins()} style={rectStyle(rect())} />
                <Show when={!drag()}>
                  <Bar rect={rect()} area={boardSafeArea()} />
                </Show>
              </>
            )}
          </Show>
        </Show>
      </div>

      <Show when={props.editing && props.catalog === undefined && !drag() && editBarPos()}>
        {(pos) => (
          <div
            ref={setEditBar}
            class={styles.editBar}
            role="toolbar"
            aria-label="Edit layout"
            data-keeps-panel
            style={{ left: `${pos().x}px`, top: `${pos().y}px` }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              class={styles.editBarGrip}
              aria-label="Move edit bar"
              onPointerDown={(event) => dragEditBar(event)}
            >
              <SketchIcon name="grip" size={16} />
            </button>
            <button type="button" class={styles.editBarParts} onClick={() => props.onOpenCatalog('parts')}>
              <SketchIcon name="plus" size={16} />
              Parts
            </button>
            <button type="button" class={styles.editBarDone} onClick={() => props.onExitEdit()}>
              Done
            </button>
          </div>
        )}
      </Show>

      <Show
        when={
          ((props.editing || props.catalog !== undefined) && lifted()?.carried && lifted()) ||
          (props.editing && panelDrag()?.carried && !panelDrag()?.owned && panelDrag())
        }
      >
        {(current) => {
          const fromBox = () => {
            const active = current();
            return active.type === 'part' && active.fromBox;
          };
          return (
            <div
              ref={setDiscardZone}
              class={styles.discardZone}
              role="status"
              data-over={overDiscard(current().point) ? '' : undefined}
            >
              <SketchIcon name={fromBox() ? 'close' : 'trash'} size={16} />
              <span>{fromBox() ? 'Drop to cancel' : 'Drop to put away'}</span>
            </div>
          );
        }}
      </Show>

      <Show when={lifted()?.carried && lifted()}>
        {(current) => (
          <div
            class={[styles.ghost, current().block ? styles.ghostBlock : styles.part]}
            data-discard={overDiscard(current().point) ? '' : undefined}
            style={{
              left: `${current().point.x - overlay().x - current().grab.x}px`,
              top: `${current().point.y - overlay().y - current().grab.y}px`,
              width: `${grid.length(current().span.columns)}px`,
              height: `${grid.length(current().span.rows)}px`,
              // As large as it will be on the 1:1 board, held where it was taken.
              'transform-origin': `${current().grab.x}px ${current().grab.y}px`,
              scale: '1.06'
            }}
          >
            <PickerScale value={() => 1}>
              <Show
                when={current().block}
                fallback={
                  <div class={styles.content} inert>
                    <PartFrame
                      mode="preview"
                      immediate
                      kind={current().kind}
                      missing={!!current()[partData]?.invalid}
                      span={current().span}
                      look={lookOf(current(), grid.room(current().span))}
                      onPopup={() => {}}
                    />
                  </div>
                }
              >
                {(block) => <BlockView parts={block().parts} immediate />}
              </Show>
            </PickerScale>
          </div>
        )}
      </Show>

      <PartsTray
        open={props.catalog !== undefined}
        initial={props.catalog}
        away={lifted()?.carried === true}
        presets={props.session.library.presets}
        kits={props.kits}
        files={props.files}
        onBoard={onBoardKinds()}
        flashKit={flashKit()}
        onLift={(event, kind) => startNewPart(event, kind)}
        onLiftKit={(event, kit) => startKitDrag(event, kit)}
        onReset={() => props.board.reset()}
        onEditLayout={() => props.onEnterEdit()}
        onClose={() => props.onCloseCatalog()}
      />

      <Show when={props.editing && spawn()}>
        {(open) => (
          <SpawnMenu
            at={{ x: open().at.x - overlay().x, y: open().at.y - overlay().y }}
            held={open().held}
            view={props.session.size()}
            hidden={lifted()?.carried === true}
            presets={props.session.library.presets}
            kits={props.kits}
            onLift={(event, kind) => startNewPart(event, kind, open().at)}
            onLiftKit={(event, kit) => startKitDrag(event, kit, open().at)}
            onClose={() => setSpawn(undefined)}
          />
        )}
      </Show>
    </>
  );

  /** Finds an unoccupied spot for the Edit bar via `freeSpot` inside `safeArea` so it covers no existing panel. */
  function initialEditBarSpot(): Point {
    const size = view();
    const area = safeArea(grid.pitch(), props.board.latest(), size, true, partStretch);
    const bar = editBarSize();
    const kept = readEditBarAt();
    if (kept) {
      return clampEditBar({ x: kept.x * size.width, y: kept.y * size.height }, bar, area);
    }

    const span = grid.minimumSpan(bar);
    const at = freeSpot(grid.pitch(), props.board.latest(), size, span, 16, partStretch);
    return clampEditBar({ x: at.x * size.width - panelPadding, y: at.y * size.height - panelPadding }, bar, area);
  }

  /** Moves the floating Edit bar freely while its grip is dragged. */
  function dragEditBar(event: PointerEvent) {
    if (event.button !== 0) {
      return;
    }

    const origin = editBarPos();
    if (!origin) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();
    stopBarDrag?.();
    const element = event.currentTarget as Element;
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      // Unsupported in jsdom; window listeners still follow the pointer.
    }

    const pointer = event.pointerId;
    const start = { x: event.clientX, y: event.clientY };
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointer) {
        return;
      }

      setEditBarPos(
        clampEditBar(
          { x: origin.x + next.clientX - start.x, y: origin.y + next.clientY - start.y },
          editBarSize(),
          boardSafeArea()
        )
      );
    };
    const end = (next: PointerEvent) => {
      if (next.pointerId !== pointer) {
        return;
      }

      cleanup();
      const left = editBarPos();
      const size = view();
      if (left && size.width > 0 && size.height > 0) {
        keepEditBarAt({ x: left.x / size.width, y: left.y / size.height });
      }
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', end, true);
      window.removeEventListener('pointercancel', end, true);
      if (stopBarDrag === cleanup) {
        stopBarDrag = undefined;
      }
    };
    stopBarDrag = cleanup;
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', end, true);
    window.addEventListener('pointercancel', end, true);
  }

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

  /** Lifts a new part of `kind` at its default span from the catalog, or from the spawn menu opened at `spawnAt`. */
  function startNewPart(event: PointerEvent, kind: string, spawnAt?: Point) {
    const span = partDefaultSpan(kind);
    if (kind === 'floating') {
      startPartDrag(
        event,
        { id: newId('panel'), kind: 'kit', span },
        { fromBox: true, spawnAt, block: { parts: [], panels: [], floating: true } }
      );
      return;
    }

    startPartDrag(event, { id: newId('part'), kind, span }, { fromBox: true, spawnAt });
  }

  /** Toggles the swatch folder chain with its ancestor folders. */
  function toggle(id: string) {
    if (!chain().has(id)) {
      props.onOpenPanel(id);
      return;
    }

    props.onOpenPanel(findPart(props.board.board(), id)?.panel.owner);
  }

  /** Lifts a part from the board, or a new one or a kit's block from the catalog. */
  function startPartDrag(
    event: PointerEvent,
    part: Lifted,
    from: {
      fromBox?: boolean;
      block?: { parts: Part[]; panels: Panel[]; floating?: Panel['floating'] };
      spawnAt?: Point;
      /** Where it is held, from its top-left corner, instead of where the press is on the pressed element. */
      grab?: Point;
      /** The board it is carried over, instead of the board without it. */
      base?: Board;
      /** For a selection carried from the board, the selected part the press was on, if any. */
      pressed?: string;
    } = {}
  ) {
    event.preventDefault();
    const element = event.currentTarget as Element;
    const rect = element.getBoundingClientRect();
    const board = props.board.latest();
    const point = { x: event.clientX, y: event.clientY };
    const offset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const full = { width: grid.length(part.span.columns), height: grid.length(part.span.rows) };
    // A scaled catalog tile maps the press proportionally onto the 1:1 ghost; blocks/spawn menu hold near the first cell.
    const scaledOffset =
      from.fromBox && rect.width > 0 && rect.height > 0 && rect.width < full.width
        ? { x: (offset.x / rect.width) * full.width, y: (offset.y / rect.height) * full.height }
        : { x: Math.max(0, Math.min(offset.x, full.width)), y: Math.max(0, Math.min(offset.y, full.height)) };
    const grab =
      from.grab ??
      (from.block || from.spawnAt
        ? { x: Math.min(offset.x, grid.cell() / 2), y: Math.min(offset.y, grid.cell() / 2) }
        : from.fromBox
          ? scaledOffset
          : offset);
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
      sourcePanel: findPart(board, part.id)?.panel.id,
      newPanel: newId('panel'),
      fromBox: from.fromBox ?? false,
      block: from.block,
      spawnAt: from.spawnAt,
      pressed: from.pressed,
      carried: false,
      ...part
    });
  }

  /** Lifts a copy of `kit` from the catalog, or from the spawn menu opened at `spawnAt`. */
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
    const host = visible().find((entry) => entry.panel.parts.some((part) => part.id === panel.owner));
    const anchor = host?.panel.parts.find((part) => part.id === panel.owner);
    const point = { x: event.clientX, y: event.clientY };
    const pressed = toView(point);
    if (panel.parts.length === 0 || !host || !anchor) {
      return;
    }

    event.preventDefault();
    const board = props.board.latest();
    setDrag({
      type: 'panel',
      pointer: event.pointerId,
      point,
      grab: { x: pressed.x - origin.x, y: pressed.y - origin.y },
      base: board,
      pinned: origins(board),
      panel: panel.id,
      start: point,
      carried: false,
      owned: {
        anchor: {
          x: host.frame.origin.x + anchor.cell.column * grid.pitch(),
          y: host.frame.origin.y + anchor.cell.row * grid.pitch()
        }
      }
    });
  }

  /** Moves a free plate from its grip, from its rim, or when carrying a single-part / whole-panel selection in Edit. */
  function startPanelDrag(event: PointerEvent, panel: Panel, origin: Point, tappedPartId?: string) {
    event.preventDefault();
    const point = { x: event.clientX, y: event.clientY };
    const pressed = toView(point);
    const board = props.board.latest();
    setDrag({
      type: 'panel',
      pointer: event.pointerId,
      point,
      grab: { x: pressed.x - origin.x, y: pressed.y - origin.y },
      base: board,
      pinned: origins(board),
      panel: panel.id,
      start: point,
      carried: false,
      tappedPartId,
      dockPreview: panel.dock
    });
  }

  /**
   * A press on the bare drawing while editing: inside the board's selection it carries the selected parts (or moves
   * the whole panel when the selection covers all parts of one free panel), elsewhere it drags a selection band.
   */
  function pressBoard(event: PointerEvent) {
    const at = toView({ x: event.clientX, y: event.clientY });
    const rect = boardSelectionRect();
    if (rect && overlap({ left: at.x, top: at.y, width: 1, height: 1 }, rect) > 0) {
      const whole = selectedWholePanel();
      const entry = whole ? visible().find((candidate) => candidate.panel.id === whole.id) : undefined;
      if (whole && entry) {
        startPanelDrag(event, whole, entry.frame.origin);
        return;
      }

      startBoardSelectionDrag(event);
      return;
    }

    event.preventDefault();
    setDrag({
      type: 'select',
      pointer: event.pointerId,
      point: at,
      start: at,
      base: props.board.latest()
    });
  }

  /**
   * Carries the selected parts on the board, from one panel or several, as one block held where the press is, laid
   * out as they lie on screen in whole cells; they land as a panel, in a panel, or in the discard capsule.
   */
  function startBoardSelectionDrag(event: PointerEvent, pressed?: string) {
    const block = boardSelectionBlock();
    if (!block) {
      return;
    }

    const pressedAt = toView({ x: event.clientX, y: event.clientY });
    startPartDrag(
      event,
      { id: newId('block'), kind: 'kit', span: block.span },
      {
        block: { parts: block.parts, panels: [] },
        grab: { x: pressedAt.x - block.origin.x, y: pressedAt.y - block.origin.y },
        base: block.ids.reduce((next, id) => removePart(next, id), props.board.latest()),
        pressed
      }
    );
  }

  /**
   * The selected parts on the board as one block, laid out as they lie on screen in whole cells and counted from its
   * top-left at cell (0, 0), with where that cell lies in view pixels; undefined while none on the board is selected.
   */
  function boardSelectionBlock() {
    const chosen = visible().flatMap(({ panel, frame }) =>
      panel.parts
        .filter((part) => selected().has(part.id))
        .map((part) => ({
          part,
          at: { x: frame.origin.x + part.cell.column * grid.pitch(), y: frame.origin.y + part.cell.row * grid.pitch() }
        }))
    );
    if (chosen.length === 0) {
      return undefined;
    }

    const left = Math.min(...chosen.map(({ at }) => at.x));
    const top = Math.min(...chosen.map(({ at }) => at.y));
    // Parts of panels out of step with each other may round onto the same cells; placing them in turn pushes apart.
    const laid = chosen.reduce<Part[]>(
      (parts, { part, at }) =>
        placePart(parts, {
          ...part,
          cell: { column: Math.round((at.x - left) / grid.pitch()), row: Math.round((at.y - top) / grid.pitch()) }
        }),
      []
    );
    const bounds = partsBounds(laid);
    return {
      parts: fromOrigin(laid),
      origin: { x: left + bounds.column * grid.pitch(), y: top + bounds.row * grid.pitch() },
      span: { columns: bounds.columns, rows: bounds.rows },
      ids: chosen.map(({ part }) => part.id)
    };
  }

  /** Puts the selected parts away, with the panels of the swatches among them. */
  function putAwaySelected() {
    const next = [...selected()].reduce((board, id) => removePart(board, id), props.board.latest());
    props.board.set(pruneOwned(next));
    setSelected(new Set<string>());
  }

  /**
   * Places a copy of the selected parts, with their swatches' panels, beside them as a panel of its own where there is
   * room. The copy is selected, to be carried on.
   */
  function duplicateSelected() {
    const board = props.board.latest();
    const block = boardSelectionBlock();
    if (!block) {
      return;
    }

    const copy = unpackKit(kitOf(board, { id: 'copy', at: { x: 0, y: 0 }, parts: block.parts }, ''));
    const at = besideBlock(grid.pitch(), block.origin, block.span, view());
    const next: Board = { ...board, panels: [...board.panels, { id: newId('panel'), at, parts: copy.parts }] };
    props.board.set({ ...next, panels: [...next.panels, ...copy.panels] });
    setSelected(new Set(copy.parts.map((part) => part.id)));
  }

  /** Keeps the selected parts, with their swatches' panels, as a kit; they stay where they are. */
  function keepSelected() {
    const block = boardSelectionBlock();
    if (block) {
      const board = props.board.latest();
      const host = board.panels.find(
        (panel) =>
          panel.parts.length > 0 &&
          panel.parts.every((part) => selected().has(part.id)) &&
          block.parts.every((part) => panel.parts.some((other) => other.id === part.id))
      );
      keepKit(board, { ...host, id: 'kept', at: { x: 0, y: 0 }, parts: block.parts });
    }
  }

  /** Where each panel on screen has its cell (0, 0) now, to keep it there through a drag; see `frameAt`. */
  function origins(board: Board) {
    const frames = visiblePanels(grid.pitch(), board, props.openPanel, props.editing, view());
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

      const span = spanAfter(grid.pitch(), drag.span, {
        x: drag.point.x - drag.start.x,
        y: drag.point.y - drag.start.y
      });
      const part = panel.parts.find((candidate) => candidate.id === drag.id);
      if (panel.dock && part && partStretch(part.kind) === 'rows') {
        // A docked part's rows follow the view. Dragging its corner up takes the panel off the edge at the dragged
        // size, where it stood; otherwise only its columns change and the stored rows wait for an undock.
        if (span.rows >= drag.span.rows) {
          const columns = { columns: span.columns, rows: part.span.rows };
          return replacePanel(drag.base, panel.id, { ...panel, parts: resizePart(panel.parts, drag.id, columns) });
        }

        return replacePanel(drag.base, panel.id, {
          ...panel,
          dock: undefined,
          parts: resizePart(panel.parts, drag.id, span)
        });
      }

      return replacePanel(drag.base, panel.id, { ...panel, parts: resizePart(panel.parts, drag.id, span) });
    }

    const panel = drag.base.panels.find((candidate) => candidate.id === drag.panel);
    if (!panel) {
      return drag.base;
    }

    if (drag.owned) {
      const pointer = toView(drag.point);
      const offset = {
        column: Math.round((pointer.x - drag.grab.x - drag.owned.anchor.x) / grid.pitch()),
        row: Math.round((pointer.y - drag.grab.y - drag.owned.anchor.y) / grid.pitch())
      };
      return replacePanel(drag.base, panel.id, { ...panel, offset });
    }

    const pointer = toView(drag.point);
    const undocked = dockedLayout(grid.pitch(), { ...panel, dock: undefined }, size, partStretch);
    const offset = frameAt(grid.pitch(), undocked, { x: 0, y: 0 }).rect;
    const at = {
      x: (pointer.x - drag.grab.x + (panel.floating ? offset.left : 0)) / size.width,
      y: (pointer.y - drag.grab.y + (panel.floating ? offset.top : 0)) / size.height
    };
    const nextDock = drag.dockPreview;
    return replacePanel(drag.base, panel.id, {
      ...panel,
      at: nextDock ? panel.at : at,
      dock: nextDock
    });
  }

  /** Finds another free/owned panel under `pointer` (with `0.5 * pitch` halo) that can accept `panel`'s parts. */
  function panelJoinTarget(drag: Extract<Drag, { type: 'panel' }>, panel: Panel, pointer: Point) {
    const size = view();
    const pitch = grid.pitch();
    const carried = new Set(panel.parts.map((part) => part.id));
    const entries = visiblePanels(pitch, drag.base, props.openPanel, props.editing, size, drag.pinned, partStretch)
      .filter(
        (entry) =>
          entry.panel.id !== panel.id &&
          canDropParts(drag.base, entry.panel, carried)
      );
    return pointerTarget(entries, pointer, pitch);
  }

  /** Merges `panel`'s parts as one block into `target` at `pointer` and removes the source panel. */
  function mergePanelInto(
    drag: Extract<Drag, { type: 'panel' }>,
    panel: Panel,
    target: ReturnType<typeof visiblePanels>[number],
    pointer: Point
  ): Board {
    const pitch = grid.pitch();
    const corner = { x: pointer.x - drag.grab.x, y: pointer.y - drag.grab.y };
    const cell = nearestCell(pitch, target.frame.origin, corner);
    const withoutSource: Board = {
      ...drag.base,
      panels: drag.base.panels.filter((candidate) => candidate.id !== panel.id)
    };
    const block = fromOrigin(panel.parts);
    const room = target.panel.dock
      ? dockedRoom(target.panel.parts, cell, partsBounds(block), partStretch)
      : { parts: target.panel.parts, cell };
    return putPanel(withoutSource, { ...target.panel, parts: placeBlock(room.parts, block, room.cell) });
  }

  /**
   * Where a lifted part or block held at `point` would land: the board with it there, `where` it lands (`discard` on
   * the top capsule, or `board`), a `key` naming the spot, target panel id, and whether it `pushes` or `expands`.
   */
  function partDrop(drag: Extract<Drag, { type: 'part' }>, point: Point, allowJoin = true) {
    const size = view();
    const pitch = grid.pitch();
    const carried = new Set(drag.block ? drag.block.parts.map((part) => part.id) : [drag.id]);
    const ancestry = { panels: [...drag.before.panels, ...(drag.block?.panels ?? [])] };
    const accepts = (panel: Panel) => canDropParts(ancestry, panel, carried);
    const part = { id: drag.id, kind: drag.kind, span: drag.span, looks: drag.looks, [partData]: drag[partData] };
    const withOwned = (board: Board, anchor: Rect) =>
      drag.block
        ? {
            ...board,
            panels: [
              ...board.panels,
              ...drag.block.panels.map((panel) => {
                if (panel.owner) {
                  return panel;
                }

                const { rect } = ownedFrame(pitch, panel, anchor, size, safeArea(pitch, board, size, true, partStretch));
                return { ...panel, at: { x: rect.left / size.width, y: rect.top / size.height } };
              })
            ]
          }
        : board;
    /** `drag` placed on `panel` with its top-left at `cell`. */
    const placeOn = (panel: Panel, wanted: Cell) => {
      const prevBounds = panel.parts.length > 0 ? partsBounds(panel.parts) : undefined;
      const blockBounds = drag.block ? partsBounds(drag.block.parts) : undefined;
      const room = panel.dock
        ? dockedRoom(panel.parts, wanted, blockBounds ?? drag.span, partStretch)
        : { parts: panel.parts, cell: wanted };
      const cell = room.cell;
      const placed = drag.block
        ? placeBlock(room.parts, drag.block.parts, cell)
        : placePart(room.parts, { ...part, cell });
      const nextBounds = partsBounds(placed);
      const expands =
        prevBounds !== undefined &&
        (nextBounds.column < prevBounds.column ||
          nextBounds.row < prevBounds.row ||
          nextBounds.column + nextBounds.columns > prevBounds.column + prevBounds.columns ||
          nextBounds.row + nextBounds.rows > prevBounds.row + prevBounds.rows);
      const before = new Map(panel.parts.map((other) => [other.id, other.cell]));
      const host = { ...panel, parts: placed };
      const origin = drag.pinned.get(panel.id) ?? panelFrame(pitch, host, size, true, undefined, partStretch).origin;
      const anchor = {
        left: origin.x + cell.column * pitch,
        top: origin.y + cell.row * pitch,
        width: grid.length(drag.span.columns),
        height: grid.length(drag.span.rows)
      };
      return {
        board: withOwned(putPanel(drag.base, host), anchor),
        key: `${panel.id}:${cell.column},${cell.row}`,
        targetId: panel.id,
        pushes: placed.some((other) => before.has(other.id) && before.get(other.id) !== other.cell),
        expands
      };
    };

    if (overDiscard(point)) {
      return {
        where: 'discard' as const,
        board: drag.base,
        key: 'discard',
        targetId: undefined,
        pushes: false,
        expands: false
      };
    }

    // The lifted part's top-left corner, in view pixels.
    const pointer = toView(point);
    const corner = { x: pointer.x - drag.grab.x, y: pointer.y - drag.grab.y };

    const target = drag.block?.floating
      ? undefined
      : pointerTarget(
          visiblePanels(pitch, drag.base, props.openPanel, props.editing, size, drag.pinned, partStretch).filter(
            (entry) => accepts(entry.panel)
          ),
          pointer,
          pitch
        );
    if (target && allowJoin) {
      return {
        where: 'board' as const,
        ...placeOn(target.panel, nearestCell(pitch, target.frame.origin, corner))
      };
    }

    const placedAt = { x: corner.x / size.width, y: corner.y / size.height };
    const parts = drag.block ? drag.block.parts : [{ ...part, cell: { column: 0, row: 0 } }];
    return {
      where: 'board' as const,
      board: withOwned(
        {
          ...drag.base,
          panels: [...drag.base.panels, { id: drag.newPanel, at: placedAt, parts, floating: drag.block?.floating }]
        },
        panelFrame(
          pitch,
          { id: drag.newPanel, at: placedAt, parts, floating: drag.block?.floating },
          size,
          true,
          undefined,
          partStretch
        ).rect
      ),
      key: 'new',
      targetId: target?.panel.id,
      pushes: false,
      expands: false
    };
  }

  /** Whether `point` on the page is over the top discard capsule while editing or dragging from the catalog. */
  function overDiscard(point: Point) {
    if (!props.editing && props.catalog === undefined) {
      return false;
    }

    const rect = discardZone()?.getBoundingClientRect();
    return rect !== undefined && rect.width > 0 && rect.height > 0 && inside(point, rect);
  }

  /**
   * Keeps `panel` of `board` as a new kit, named after what it holds, unless a kit of the same parts laid out the
   * same way is there already: that one lights up instead, as does a new one.
   */
  function keepKit(board: Board, panel: Panel) {
    const same = props.kits.findSame(panel.parts, panel.floating);
    if (!same) {
      props.kits.save(board, panel, kitName(panel.parts));
    }

    const kit = same ?? props.kits.findSame(panel.parts, panel.floating);
    clearTimeout(flashTimer);
    setFlashKit(kit?.id);
    flashTimer = setTimeout(() => setFlashKit(undefined), flashTime);
  }

  /** A name for a new kit of `parts`, after what it holds and unlike the user's other kits; see `nameKit`. */
  function kitName(parts: readonly Part[]) {
    const label = (kind: string) => kindLabel(kind, props.session.library.presets());
    return props.kits.uniqueName(nameKit(parts, { label, color: props.session.brush().color }));
  }
}

/** Keeps the Edit bar inside `bounds` (either full view or `safeArea`) with a small edge margin. */
function clampEditBar(
  point: Point,
  bar: { width: number; height: number },
  bounds: { left?: number; top?: number; width: number; height: number }
) {
  const margin = 8;
  const minX = (bounds.left ?? 0) + margin;
  const minY = (bounds.top ?? 0) + margin;
  const maxX = Math.max(minX, (bounds.left ?? 0) + bounds.width - bar.width - margin);
  const maxY = Math.max(minY, (bounds.top ?? 0) + bounds.height - bar.height - margin);
  return {
    x: Math.max(minX, Math.min(point.x, maxX)),
    y: Math.max(minY, Math.min(point.y, maxY))
  };
}

/**
 * Resolves the screen-edge dock preview with hysteresis: docks within `1 * pitch` of the edge (when `allowed`),
 * and stays docked until pulled inward beyond `1.5 * pitch`.
 */
function resolveDockPreview(
  current: DockSide | undefined,
  panelLeft: number,
  panelRight: number,
  viewWidth: number,
  pitch: number,
  allowed: (side: DockSide) => boolean
): DockSide | undefined {
  if (current === 'left') {
    return panelLeft <= 1.5 * pitch ? 'left' : undefined;
  }

  if (current === 'right') {
    return viewWidth - panelRight <= 1.5 * pitch ? 'right' : undefined;
  }

  if (panelLeft < pitch && allowed('left')) {
    return 'left';
  }

  if (viewWidth - panelRight < pitch && allowed('right')) {
    return 'right';
  }

  return undefined;
}

/**
 * Finds the top-most panel whose box (expanded by `0.5 * pitch`) contains the pointer point itself, rather than
 * testing the entire footprint of a tall lifted part.
 */
function pointerTarget(entries: ReturnType<typeof visiblePanels>, pointer: Point, pitch: number) {
  const halo = pitch / 2;
  let found: (typeof entries)[number] | undefined;
  for (const entry of entries) {
    const rect = grow(entry.frame.rect, halo);
    if (
      pointer.x >= rect.left &&
      pointer.x <= rect.left + rect.width &&
      pointer.y >= rect.top &&
      pointer.y <= rect.top + rect.height
    ) {
      found = entry;
    }
  }

  return found;
}

/** Whether the edit mode's hint was learned on this device. */
function readHinted() {
  try {
    return localStorage.getItem(hintKey) === '1';
  } catch {
    return false;
  }
}

const hintKey = 'paint.lego.hinted';

/**
 * Where the user last left the Edit bar, as fractions of the view, kept on the device: the bar comes back there the
 * next time editing starts, shifted into the view if it no longer fits. Absent until the bar is first moved.
 */
const editBarKey = 'paint.lego.editBar';

function readEditBarAt(): Point | undefined {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(editBarKey) ?? 'null');
    if (stored && typeof stored === 'object' && 'x' in stored && 'y' in stored) {
      const { x, y } = stored;
      return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)
        ? { x, y }
        : undefined;
    }
  } catch {
    // Unreadable: the bar takes a free spot.
  }

  return undefined;
}

function keepEditBarAt(at: Point) {
  try {
    localStorage.setItem(editBarKey, JSON.stringify(at));
  } catch {
    // Storage refused: the place lasts until editing ends.
  }
}

/** `parts` moved so that their bounds start at cell (0, 0). */
function fromOrigin(parts: readonly Part[]) {
  const bounds = partsBounds(parts);
  return parts.map((part) => ({
    ...part,
    cell: { column: part.cell.column - bounds.column, row: part.cell.row - bounds.row }
  }));
}

/**
 * Where a copy of a block of `span` whose cell (0, 0) lies at `origin` goes, as a panel's `at` in a view of `view`
 * size: right of it where there is room, else left, below or above it; right of it, shifted into the view, if
 * nowhere.
 */
function besideBlock(pitch: number, origin: Point, span: Span, view: { width: number; height: number }) {
  const width = span.columns * pitch - cellGap;
  const height = span.rows * pitch - cellGap;
  const gap = pitch / 2 + panelPadding * 2;
  const candidates = [
    { x: origin.x + width + gap, y: origin.y },
    { x: origin.x - width - gap, y: origin.y },
    { x: origin.x, y: origin.y + height + gap },
    { x: origin.x, y: origin.y - height - gap }
  ];
  const fits = ({ x, y }: Point) =>
    x - panelPadding >= 0 &&
    x + width + panelPadding <= view.width &&
    y - panelPadding >= 0 &&
    y + height + panelPadding <= view.height;
  const at = candidates.find(fits) ?? candidates[0]!;
  return { x: at.x / view.width, y: at.y / view.height };
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

/** Where `part` lies on a plate whose cell (0, 0) starts at `origin`. */
function partRect(pitch: number, part: Part, origin: Point): Rect {
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

/** Whether `point` lies in `rect`. */
function inside(point: Point, rect: DOMRect) {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

/** The board's commands for surfaces other than its own panels and catalog; see `BoardView`'s `ref`. */
export type BoardControls = {
  /**
   * Lifts a new part of `kind` and `span` (one cell by default) for the press `event`, as a part taken from the
   * catalog: it follows the pointer and lands where it is let go, on a plate or as a new one, in edit mode or not. The
   * press's `currentTarget` is where the part is held from. The caller keeps the pointer's events coming, as by
   * capturing it.
   */
  lift: (event: PointerEvent, kind: string, span?: Span) => void;
  /**
   * Puts a new part of `kind` and `span` (one cell by default) on the board at once, on a plate of its own where it
   * covers no other panel (see `freeSpot`), as the keyboard's way to do what `lift` does by dragging.
   */
  place: (kind: string, span?: Span) => void;
  /** Whether a lifted part is being carried, having moved off where it was pressed; reactive. */
  carrying: () => boolean;
};

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
      /** The panel this part came from, if lifted off the board. */
      sourcePanel?: string;
      /** Target panel unlocked after dwelling `joinDelay` over a foreign panel. */
      joinedTarget?: string;
      /** Target panel highlighted while waiting on `joinDelay`. */
      hoverTarget?: string;
      /** The id a new panel gets if the part lands on the bare drawing. */
      newPanel: string;
      /** Whether it came out of the catalog or spawn menu rather than off the board. */
      fromBox: boolean;
      /** The board as the drag began. */
      before: Board;
      /** A kit's parts and owned panels, carried as one block of `span`. */
      block?: { parts: Part[]; panels: Panel[]; floating?: Panel['floating'] };
      /** Where the spawn menu it came from was opened, where a tap puts it. */
      spawnAt?: Point;
      /** For a selection carried from the board, the selected part the press was on, if any. */
      pressed?: string;
      /** Whether it moved off where it was pressed. */
      carried: boolean;
    })
  | { type: 'resize'; panel: string; id: string; span: Span; start: Point; pinned: ReadonlyMap<string, Point> }
  /** A band dragged across the bare drawing, `start` and `point` in view pixels. */
  | { type: 'select'; start: Point; base: Board }
  | {
      type: 'panel';
      panel: string;
      grab: Point;
      /** Where the press began, to tell a tap on free studs or a single part from a move. */
      start: Point;
      /** Where each panel had its cell (0, 0) as the drag began. */
      pinned: ReadonlyMap<string, Point>;
      /** Whether it moved off where it was pressed. */
      carried: boolean;
      /** The part that received the press when dragging a single-part or whole-panel selection. */
      tappedPartId?: string;
      /** Screen edge previewed for docking while dragging near a border. */
      dockPreview?: DockSide;
      /** Target panel highlighted while waiting on `joinDelay`. */
      hoverTarget?: string;
      /** Settled merged board once `joinDelay` elapsed over a target panel. */
      joined?: { targetId: string; board: Board };
      /** For a swatch's panel: where its swatch's top-left cell starts on the board. */
      owned?: { anchor: Point };
    }
);

/** A part as it is carried: everything but the cell it will land on. */
type Lifted = Omit<Part, 'cell'>;

/** CSS pixels a press may move and still be a tap, which opens a swatch's panel while editing. */
const tapDistance = 6;

/** Milliseconds a kit just kept, or matched, stays lit. */
const flashTime = 1400;

/** CSS pixels the selection's outline lies out from the selected parts. */
const selectionPadding = 4;

/** Fallback footprint in CSS pixels for placing the Edit bar before ResizeObserver measures it. */
const defaultEditBarWidth = 210;
const defaultEditBarHeight = 56;

/** Milliseconds a still press on the bare drawing or a panel's free cells takes to open the spawn menu. */
const longPress = 420;

/**
 * Milliseconds a dragged panel or foreign part must dwell nearly still (< 0.5 * pitch) over another panel before
 * merging into it, preventing accidental panel explosions while crossing the screen.
 */
const joinDelay = 550;

/**
 * Milliseconds a lifted part must rest over a spot before the parts in its way move aside, after Android's launcher:
 * passing over parts on the way somewhere else leaves them still.
 */
const reorderDelay = 220;
