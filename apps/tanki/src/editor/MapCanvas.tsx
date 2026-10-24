import { createEventListener, makeEventListener } from '@solid-primitives/event-listener';
import { createElementSize } from '@solid-primitives/resize-observer';
import { createEffect, createMemo, createSignal } from 'solid-js';
import type { AREA_KINDS, MapBounds, MapObjectKind, MapPoint, TankiMap } from '../map/format';
import type { MapDocument } from './createMapDocument';
import type { MapViewState } from './createMapView';
import { drawEditor, type EditorOverlay } from './draw';
import {
  addItem,
  BUILDING_HEIGHT,
  CAPTURE_RADIUS,
  CRATE_SIZE,
  createId,
  findItem,
  insertVertex,
  isObject,
  itemAt,
  itemsInside,
  moveItems,
  moveVertex,
  rectangle,
  removeVertex,
  ROAD_WIDTH,
  rotateItems,
  SPAWN_SIZE,
  WALL_HEIGHT,
  type MapItem,
  type VertexRef
} from './edits';
import { HANDLE_SIZE, selectionHandles } from './handles';
import type { Tool } from './tools';
import { screenToWorld, worldToScreen } from './view';

/** Kind of outline the rectangle and polygon tools draw. */
export type ShapeKind = (typeof AREA_KINDS)[number];

/**
 * The map on a canvas, with the pointer gestures of the active tool: selecting, moving,
 * turning and reshaping with the select tool, drawing outlines, roads and boxes, placing crates,
 * spawn zones and capture points. A drag previews its edits and commits one undo step when it
 * ends; a new item ends up selected, ready for the select tool's handles. The middle button,
 * Space + drag and the pan tool pan; the wheel and a two-finger pinch zoom.
 *
 * Keys that belong to a gesture (Enter, Escape and Backspace while drawing, Space for panning)
 * are taken here before the editor's shortcuts see them.
 */
export function MapCanvas(props: {
  document: MapDocument;
  view: MapViewState;
  tool: Tool;
  /** Kind of outline the rectangle and polygon tools draw. */
  shapeKind: ShapeKind;
  selection: readonly string[];
  /** Called with the new selection after clicks and box selections, and with new items. */
  onSelect: (ids: string[]) => void;
  /** Called after a drawing or placing tool made its item, to hand over to the select tool. */
  onCreated: () => void;
  /** Corner picked for deletion, if any. */
  vertex: VertexRef | undefined;
  onVertex: (vertex: VertexRef | undefined) => void;
  /** Reports the world point under the pointer, `undefined` when it leaves. */
  onPointerWorld: (point: MapPoint | undefined) => void;
}) {
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>();
  const size = createElementSize(canvas);
  const [hover, setHover] = createSignal<string>();
  const [cursor, setCursor] = createSignal<MapPoint>();
  const [marquee, setMarquee] = createSignal<MapBounds>();
  const [box, setBox] = createSignal<MapPoint[]>();
  const [draft, setDraft] = createSignal<MapPoint[]>(() => {
    void props.tool; // switching tools drops a half-drawn outline
    return [];
  });
  const pointers = new Map<number, MapPoint>();
  let gesture: Gesture | undefined;
  let spaceHeld = false;
  let lastPress = { time: 0, at: { x: 0, y: 0 } };

  const overlay = createMemo((): EditorOverlay => {
    const points = draft();
    const boxPoints = box();

    return {
      selection: props.selection,
      hover: hover(),
      vertex: props.vertex,
      handles:
        props.tool === 'select' && props.selection.length > 0
          ? selectionHandles(props.document.map(), props.selection, props.view.view(), props.view.screen())
          : undefined,
      draft: boxPoints
        ? { points: boxPoints, closed: true }
        : points.length > 0
          ? { points, closed: props.tool === 'polygon', cursor: cursor() }
          : undefined,
      marquee: marquee()
    };
  });

  createEffect(
    () => ({ width: size.width ?? 0, height: size.height ?? 0 }),
    (screen) => props.view.setScreen(screen)
  );

  createEffect(
    () => ({
      element: canvas(),
      map: props.document.map(),
      view: props.view.view(),
      screen: props.view.screen(),
      overlay: overlay()
    }),
    ({ element, map, view, screen, overlay }) => {
      const context = element?.getContext('2d');

      if (!element || !context || screen.width === 0 || screen.height === 0) {
        return;
      }

      const ratio = window.devicePixelRatio;
      const width = Math.round(screen.width * ratio);
      const height = Math.round(screen.height * ratio);

      if (element.width !== width || element.height !== height) {
        element.width = width;
        element.height = height;
      }

      drawEditor(context, map, view, screen, ratio, overlay);
    }
  );

  makeEventListener(window, 'keydown', handleKey, { capture: true });
  makeEventListener(window, 'keyup', (event) => {
    if (event.code === 'Space') {
      spaceHeld = false;
    }
  });
  createEventListener(
    canvas,
    'wheel',
    (event: WheelEvent) => {
      event.preventDefault();
      props.view.zoomBy(Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015)), local(event));
    },
    { passive: false }
  );

  return (
    <canvas
      ref={setCanvas}
      class={[
        'block h-full w-full touch-none outline-none select-none',
        { 'cursor-grab': props.tool === 'hand', 'cursor-crosshair': props.tool !== 'hand' && props.tool !== 'select' }
      ]}
      tabindex={0}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={(event) => {
        pointers.delete(event.pointerId);
        abandonGesture();
      }}
      onPointerLeave={() => {
        props.onPointerWorld(undefined);
        setHover(undefined);
      }}
      onContextMenu={(event) => event.preventDefault()}
    />
  );

  function pointerDown(event: PointerEvent) {
    const element = event.currentTarget as HTMLCanvasElement;
    const at = local(event);

    element.setPointerCapture(event.pointerId);
    element.focus({ preventScroll: true });
    setHover(undefined);

    if (event.pointerType === 'touch') {
      pointers.set(event.pointerId, at);

      if (pointers.size === 2) {
        abandonGesture();
        gesture = startPinch();
        return;
      }

      if (pointers.size > 2) {
        return;
      }
    }

    if (event.button === 1 || (event.button === 0 && (spaceHeld || props.tool === 'hand'))) {
      gesture = { type: 'pan', last: at };
      return;
    }

    if (event.button !== 0) {
      return;
    }

    const world = toWorld(at);
    const map = props.document.map();

    switch (props.tool) {
      case 'select':
        pressSelect(event, at, world, map);
        return;
      case 'rectangle':
      case 'red-spawn':
      case 'blue-spawn':
        gesture = { type: 'box', start: world, from: at };
        return;
      case 'polygon':
      case 'road':
        pressDraft(at, world);
        return;
      case 'crate':
        add(map, { id: createId('crate'), kind: 'crate', x: world.x, y: world.y, size: CRATE_SIZE, rotation: 0 });
        return;
      case 'capture':
        gesture = { type: 'capture', center: world, from: at, base: map, id: createId('capture') };
        return;
    }
  }

  /** Starts a select-tool gesture: a handle, an item, or a box selection on empty ground. */
  function pressSelect(event: PointerEvent, at: MapPoint, world: MapPoint, map: TankiMap) {
    const handles = overlay().handles;

    if (handles?.rotate && distance(at, handles.rotate.at) <= HANDLE_SIZE) {
      const { center } = handles.rotate;
      gesture = { type: 'rotate', ids: [...props.selection], center, from: angleOf(world, center), base: map };
      return;
    }

    const corner = handles?.vertices.find((handle) => distance(at, handle.at) <= HANDLE_SIZE);

    if (corner) {
      if (event.altKey) {
        props.document.commit(removeVertex(map, corner.ref));
        props.onVertex(undefined);
        return;
      }

      props.onVertex(corner.ref);
      gesture = { type: 'vertex', ref: corner.ref, base: map, from: at };
      return;
    }

    const midpoint = handles?.midpoints.find((handle) => distance(at, handle.at) <= HANDLE_SIZE * 0.75);

    if (midpoint) {
      const base = insertVertex(map, midpoint.ref, midpoint.world);
      props.document.preview(base);
      props.onVertex(midpoint.ref);
      gesture = { type: 'vertex', ref: midpoint.ref, base, from: at, last: base };
      return;
    }

    const hit = itemAt(map, world, HIT_TOLERANCE / props.view.view().zoom);
    const item = hit ? findItem(map, hit) : undefined;
    props.onVertex(undefined);

    // Roads, parks and water cover nearly all of a city, so a drag from one that is not selected
    // draws a selection box; a click still selects it.
    if (!hit || (item && isObject(item) && GROUND_KINDS.includes(item.kind) && !props.selection.includes(hit))) {
      gesture = {
        type: 'marquee',
        start: world,
        from: at,
        additive: event.shiftKey,
        before: [...props.selection],
        hit
      };
      return;
    }

    if (event.shiftKey) {
      const selection = clickSelection(props.selection, hit, true);
      props.onSelect(selection);

      if (selection.includes(hit)) {
        gesture = { type: 'move', ids: selection, start: world, from: at, base: map, hit };
      }

      return;
    }

    const selection = props.selection.includes(hit) ? [...props.selection] : [hit];

    if (!props.selection.includes(hit)) {
      props.onSelect(selection);
    }

    gesture = { type: 'move', ids: selection, start: world, from: at, base: map, hit };
  }

  /** Adds a corner to the outline or road being drawn, or finishes it. */
  function pressDraft(at: MapPoint, world: MapPoint) {
    const points = draft();
    const now = performance.now();
    const doubleClick = now - lastPress.time < DOUBLE_CLICK_MS && distance(at, lastPress.at) < 6;
    lastPress = { time: now, at };

    if (doubleClick) {
      finishDraft(points);
      return;
    }

    const first = points[0] && worldToScreen(props.view.view(), props.view.screen(), points[0]);

    if (props.tool === 'polygon' && points.length >= 3 && first && distance(at, first) <= HANDLE_SIZE * 1.5) {
      finishDraft(points);
      return;
    }

    setDraft([...points, world]);
  }

  /** Turns the drawn corners into a polygon of the chosen kind or a road, if there are enough. */
  function finishDraft(points: MapPoint[]) {
    setDraft([]);

    if (props.tool === 'road' && points.length >= 2) {
      add(props.document.map(), { id: createId('road'), kind: 'road', points, width: ROAD_WIDTH });
    }

    if (props.tool === 'polygon' && points.length >= 3) {
      add(props.document.map(), shape(props.shapeKind, points));
    }
  }

  function pointerMove(event: PointerEvent) {
    const at = local(event);
    const world = toWorld(at);

    props.onPointerWorld(world);
    setCursor(world);

    if (event.pointerType === 'touch' && pointers.has(event.pointerId)) {
      pointers.set(event.pointerId, at);

      if (gesture?.type === 'pinch') {
        movePinch(gesture);
        return;
      }
    }

    if (!gesture) {
      setHover(
        props.tool === 'select'
          ? itemAt(props.document.map(), world, HIT_TOLERANCE / props.view.view().zoom)
          : undefined
      );
      return;
    }

    const current = gesture;

    switch (current.type) {
      case 'pan':
        props.view.panBy({ x: at.x - current.last.x, y: at.y - current.last.y });
        current.last = at;
        return;
      case 'move': {
        if (!current.last && distance(at, current.from) < DRAG_THRESHOLD) {
          return;
        }

        const offset = { x: world.x - current.start.x, y: world.y - current.start.y };

        if (event.shiftKey) {
          offset[Math.abs(offset.x) > Math.abs(offset.y) ? 'y' : 'x'] = 0;
        }

        current.last = moveItems(current.base, current.ids, offset);
        props.document.preview(current.last);
        return;
      }
      case 'rotate': {
        let angle = angleOf(world, current.center) - current.from;

        if (event.shiftKey) {
          angle = Math.round(angle / SNAP_ANGLE) * SNAP_ANGLE;
        }

        current.last = rotateItems(current.base, current.ids, current.center, angle);
        props.document.preview(current.last);
        return;
      }
      case 'vertex':
        if (!current.last && distance(at, current.from) < DRAG_THRESHOLD) {
          return;
        }

        current.last = moveVertex(current.base, current.ref, world);
        props.document.preview(current.last);
        return;
      case 'marquee':
        setMarquee(boundsBetween(current.start, world));
        return;
      case 'box':
        setBox(boxPoints(current.start, world, event.shiftKey));
        return;
      case 'capture':
        if (distance(at, current.from) >= DRAG_THRESHOLD) {
          const radius = distance(world, current.center);
          props.document.preview(addItem(current.base, { id: current.id, ...current.center, radius }));
        }

        return;
    }
  }

  function pointerUp(event: PointerEvent) {
    pointers.delete(event.pointerId);

    const current = gesture;
    gesture = undefined;

    if (!current) {
      return;
    }

    const at = local(event);
    const world = toWorld(at);
    const map = props.document.committed();

    switch (current.type) {
      case 'move':
        if (current.last) {
          props.document.commit(current.last);
        } else if (!event.shiftKey && current.ids.length > 1) {
          props.onSelect([current.hit]);
        }

        return;
      case 'rotate':
      case 'vertex':
        if (current.last) {
          props.document.commit(current.last);
        }

        return;
      case 'marquee': {
        setMarquee(undefined);

        if (distance(at, current.from) < DRAG_THRESHOLD) {
          props.onSelect(clickSelection(current.before, current.hit, current.additive));
          return;
        }

        const inside = itemsInside(map, boundsBetween(current.start, world));
        props.onSelect(current.additive ? [...new Set([...current.before, ...inside])] : inside);
        return;
      }
      case 'box': {
        setBox(undefined);
        const dragged = distance(at, current.from) >= DRAG_THRESHOLD;

        if (props.tool === 'rectangle') {
          if (dragged) {
            add(map, shape(props.shapeKind, boxPoints(current.start, world, event.shiftKey)));
          }

          return;
        }

        const team = props.tool === 'red-spawn' ? 'red' : 'blue';
        const points = dragged
          ? boxPoints(current.start, world, event.shiftKey)
          : rectangle({ x: world.x - SPAWN_SIZE.x / 2, y: world.y - SPAWN_SIZE.y / 2 }, SPAWN_SIZE.x, SPAWN_SIZE.y);
        add(map, { id: createId('spawn'), team, points });
        return;
      }
      case 'capture': {
        const radius = distance(at, current.from) >= DRAG_THRESHOLD ? distance(world, current.center) : CAPTURE_RADIUS;
        add(current.base, { id: current.id, ...current.center, radius });
        return;
      }
    }
  }

  /** Abandons the gesture in progress and its preview. */
  function abandonGesture() {
    gesture = undefined;
    props.document.cancelPreview();
    setMarquee(undefined);
    setBox(undefined);
  }

  function startPinch(): Gesture {
    const [a, b] = [...pointers.values()];

    return { type: 'pinch', distance: distance(a, b), middle: midpointOf(a, b) };
  }

  function movePinch(pinch: Extract<Gesture, { type: 'pinch' }>) {
    const [a, b] = [...pointers.values()];
    const middle = midpointOf(a, b);
    const span = distance(a, b);

    props.view.panBy({ x: middle.x - pinch.middle.x, y: middle.y - pinch.middle.y });
    props.view.zoomBy(span / Math.max(pinch.distance, 1), middle);
    pinch.distance = span;
    pinch.middle = middle;
  }

  /** Takes the keys of a gesture in progress before the editor's shortcuts see them. */
  function handleKey(event: KeyboardEvent) {
    if (isTyping(event)) {
      return;
    }

    if (event.code === 'Space') {
      spaceHeld = true;

      if (event.target === canvas() || event.target === document.body) {
        event.preventDefault();
      }

      return;
    }

    const points = draft();

    if (points.length > 0) {
      if (event.key === 'Enter') {
        finishDraft(points);
      } else if (event.key === 'Escape') {
        setDraft([]);
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        setDraft(points.slice(0, -1));
      } else {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.key === 'Escape' && gesture) {
      abandonGesture();
      event.preventDefault();
      event.stopPropagation();
    }
  }

  /** Adds `item` as one undo step, selects it and reports it made. */
  function add(map: TankiMap, item: MapItem) {
    props.document.commit(addItem(map, item));
    props.onSelect([item.id]);
    props.onCreated();
  }

  function local(event: MouseEvent): MapPoint {
    const rect = canvas()!.getBoundingClientRect();

    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function toWorld(point: MapPoint) {
    return screenToWorld(props.view.view(), props.view.screen(), point);
  }
}

/** A pointer gesture in progress; `last` holds the map it previews. */
type Gesture =
  | { type: 'pan'; last: MapPoint }
  | { type: 'pinch'; distance: number; middle: MapPoint }
  | { type: 'move'; ids: string[]; start: MapPoint; from: MapPoint; base: TankiMap; hit: string; last?: TankiMap }
  | { type: 'rotate'; ids: string[]; center: MapPoint; from: number; base: TankiMap; last?: TankiMap }
  | { type: 'vertex'; ref: VertexRef; base: TankiMap; from: MapPoint; last?: TankiMap }
  | { type: 'marquee'; start: MapPoint; from: MapPoint; additive: boolean; before: string[]; hit?: string }
  | { type: 'box'; start: MapPoint; from: MapPoint }
  | { type: 'capture'; center: MapPoint; from: MapPoint; base: TankiMap; id: string };

/** Terrain that lies flat on the ground and covers most of a city map. */
const GROUND_KINDS: MapObjectKind[] = ['road', 'park', 'water'];

/**
 * Selection after a click on `hit` (or on empty ground): just that item, or with Shift
 * (`additive`) the old selection with `hit` toggled.
 */
function clickSelection(before: readonly string[], hit: string | undefined, additive: boolean) {
  if (!additive) {
    return hit ? [hit] : [];
  }

  if (!hit) {
    return [...before];
  }

  return before.includes(hit) ? before.filter((id) => id !== hit) : [...before, hit];
}

/** Screen pixels a press must travel before it counts as a drag. */
const DRAG_THRESHOLD = 4;

/** Screen pixels around a line or edge that still hit it. */
const HIT_TOLERANCE = 4;

const DOUBLE_CLICK_MS = 350;

/** Rotation step with Shift held: 15 degrees. */
const SNAP_ANGLE = Math.PI / 12;

/** A new outline of `kind` with its default height. */
function shape(kind: ShapeKind, points: MapPoint[]): MapItem {
  const id = createId(kind);

  switch (kind) {
    case 'building':
      return { id, kind, points, holes: [], height: BUILDING_HEIGHT };
    case 'wall':
      return { id, kind, points, holes: [], height: WALL_HEIGHT };
    default:
      return { id, kind, points, holes: [] };
  }
}

/** Corners of the rectangle dragged from `start` to `end`; a square when `square` is set. */
function boxPoints(start: MapPoint, end: MapPoint, square: boolean) {
  let width = end.x - start.x;
  let height = end.y - start.y;

  if (square) {
    const side = Math.max(Math.abs(width), Math.abs(height));
    width = Math.sign(width || 1) * side;
    height = Math.sign(height || 1) * side;
  }

  return rectangle(
    { x: Math.min(start.x, start.x + width), y: Math.min(start.y, start.y + height) },
    Math.abs(width),
    Math.abs(height)
  );
}

function boundsBetween(a: MapPoint, b: MapPoint): MapBounds {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

function angleOf(point: MapPoint, center: MapPoint) {
  return Math.atan2(point.y - center.y, point.x - center.x);
}

function distance(a: MapPoint, b: MapPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpointOf(a: MapPoint, b: MapPoint) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Is the key going into a text field? Then it is not a shortcut. */
export function isTyping(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;

  return !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}
