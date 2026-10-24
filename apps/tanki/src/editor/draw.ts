import type { MapBounds, MapObject, MapObjectKind, MapPoint, TankiMap, Team } from '../map/format';
import { boxCorners, signedArea } from '../map/geometry';
import { findItem, isCapturePoint, isObject, itemBounds, selectionBounds, type MapItem, type VertexRef } from './edits';
import { HANDLE_SIZE, type SelectionHandles } from './handles';
import type { MapView, ScreenSize } from './view';

/**
 * Canvas 2D drawing of a map in the game's style, after the 2017 Moscow level sketches: dark
 * asphalt, light buildings with black outlines whose walls and soft shadows fall south, green
 * parks and pale blue water; then the editor's marks on top.
 */

/** What the editor marks on top of the map. */
export type EditorOverlay = {
  selection: readonly string[];
  hover?: string;
  /** Corner picked for deletion. */
  vertex?: VertexRef;
  /** Handles of the selection, when the select tool shows them. */
  handles?: SelectionHandles;
  /** Outline being drawn: its points so far and where the pointer is. */
  draft?: { points: MapPoint[]; closed: boolean; cursor?: MapPoint };
  /** Rubber band of a box selection. */
  marquee?: MapBounds;
};

/**
 * Draws `map` as seen through `view` onto a canvas of `screen` CSS pixels at `pixelRatio`
 * device pixels each, then the editor overlay.
 */
export function drawEditor(
  context: CanvasRenderingContext2D,
  map: TankiMap,
  view: MapView,
  screen: ScreenSize,
  pixelRatio: number,
  overlay: EditorOverlay
) {
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.fillStyle = COLORS.outside;
  context.fillRect(0, 0, screen.width, screen.height);

  const scale = view.zoom * pixelRatio;
  context.setTransform(
    scale,
    0,
    0,
    scale,
    pixelRatio * (screen.width / 2 - view.x * view.zoom),
    pixelRatio * (screen.height / 2 - view.y * view.zoom)
  );
  drawMap(context, map, view.zoom, pixelRatio);
  drawBounds(context, map.bounds, view.zoom);
  drawMarks(context, map, view.zoom, overlay);

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  drawLabels(context, map, view, screen);

  if (overlay.handles) {
    drawHandles(context, overlay.handles, overlay.vertex);
  }

  if (overlay.marquee) {
    drawMarquee(context, overlay.marquee, view, screen);
  }
}

/**
 * Draws the map itself in world coordinates, layer by layer: ground, water, parks, roads, the
 * walls and shadows of everything solid, its tops, then spawn zones and capture points. The
 * ground and everything flat on it, walls and shadows included, stop at the map's bounds, where
 * the game's world ends; tops of solid things, spawn zones and capture points show past them.
 *
 * @param zoom - Screen pixels per world pixel; keeps outlines visible when zoomed out.
 * @param pixelRatio - Device pixels per CSS pixel; canvas shadows are measured in device pixels.
 */
export function drawMap(context: CanvasRenderingContext2D, map: TankiMap, zoom: number, pixelRatio: number) {
  const outline = Math.max(1, 0.6 / zoom);
  const objects = <K extends MapObjectKind>(kind: K) =>
    map.objects.filter((object): object is Extract<MapObject, { kind: K }> => object.kind === kind);

  context.save();
  context.beginPath();
  context.rect(map.bounds.x, map.bounds.y, map.bounds.width, map.bounds.height);
  context.clip();
  context.fillStyle = COLORS.ground;
  context.fillRect(map.bounds.x, map.bounds.y, map.bounds.width, map.bounds.height);
  context.lineJoin = 'round';
  context.lineCap = 'round';

  for (const water of objects('water')) {
    fillArea(context, water, COLORS.water, COLORS.waterEdge, outline);
  }

  for (const park of objects('park')) {
    fillArea(context, park, COLORS.park, COLORS.parkEdge, outline);
  }

  drawRoads(context, objects('road'), zoom);

  const solids = map.objects.filter(
    (object) => object.kind === 'building' || object.kind === 'wall' || object.kind === 'crate'
  );
  drawSides(context, solids, zoom * pixelRatio);
  context.restore();

  context.lineJoin = 'round';

  for (const object of solids) {
    if (object.kind === 'crate') {
      drawCrate(context, object, outline);
    } else {
      fillArea(context, object, object.kind === 'wall' ? COLORS.wall : COLORS.building, COLORS.outline, outline);
    }
  }

  for (const spawn of map.spawns) {
    fillPath(context, [spawn.points]);
    context.fillStyle = TEAM_COLORS[spawn.team].fill;
    context.fill();
    context.setLineDash([8 / zoom, 5 / zoom]);
    context.lineWidth = 2 / zoom;
    context.strokeStyle = TEAM_COLORS[spawn.team].line;
    context.stroke();
    context.setLineDash([]);
  }

  for (const point of map.capturePoints) {
    context.beginPath();
    context.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
    context.fillStyle = COLORS.captureFill;
    context.fill();
    context.lineWidth = Math.max(3, 2 / zoom);
    context.strokeStyle = COLORS.capture;
    context.stroke();
    context.beginPath();
    context.arc(point.x, point.y, Math.min(point.radius * 0.18, 12), 0, Math.PI * 2);
    context.fillStyle = COLORS.capture;
    context.fill();
    context.lineWidth = outline;
    context.strokeStyle = COLORS.outline;
    context.stroke();
  }
}

/** Fill colors of each terrain kind, for swatches next to the map. */
export const KIND_COLORS: Record<MapObjectKind, string> = {
  building: '#ecebe8',
  wall: '#cdc6b8',
  crate: '#999999',
  road: '#4b4b4b',
  park: '#41603a',
  water: '#a9cdf5'
};

/** Fill and line colors of each team. */
export const TEAM_COLORS: Record<Team, { fill: string; line: string; label: string }> = {
  red: { fill: 'rgba(229, 72, 77, 0.28)', line: '#ff5a5f', label: 'RED SPAWN' },
  blue: { fill: 'rgba(62, 140, 255, 0.28)', line: '#4f9bff', label: 'BLUE SPAWN' }
};

const COLORS = {
  outside: '#2f2f2f',
  ground: '#646464',
  outline: '#1b1b1b',
  building: KIND_COLORS.building,
  wall: KIND_COLORS.wall,
  side: '#a7a39b',
  shadow: 'rgba(0, 0, 0, 0.32)',
  road: KIND_COLORS.road,
  roadLine: 'rgba(255, 255, 255, 0.4)',
  park: KIND_COLORS.park,
  parkEdge: '#2b4126',
  water: KIND_COLORS.water,
  waterEdge: '#5f8fc7',
  crate: KIND_COLORS.crate,
  capture: '#ffd34d',
  captureFill: 'rgba(255, 211, 77, 0.16)',
  accent: '#ffb020',
  accentSoft: 'rgba(255, 176, 32, 0.55)',
  bounds: 'rgba(255, 255, 255, 0.7)'
};

/** Sideways reach of a wall per unit of height: walls and shadows fall south and a little east. */
const SUN = { x: 0.12, y: 0.3 };

/** Height of a crate in world pixels, for its sides. */
const CRATE_HEIGHT = 14;

function fillArea(
  context: CanvasRenderingContext2D,
  area: { points: MapPoint[]; holes: MapPoint[][] },
  fill: string,
  stroke: string,
  lineWidth: number
) {
  fillPath(context, [area.points, ...area.holes]);
  context.fillStyle = fill;
  context.fill('evenodd');
  context.lineWidth = lineWidth;
  context.strokeStyle = stroke;
  context.stroke();
}

/** Starts a path of closed rings. */
function fillPath(context: CanvasRenderingContext2D, rings: readonly (readonly MapPoint[])[]) {
  context.beginPath();

  for (const ring of rings) {
    ring.forEach((point, index) => (index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y)));
    context.closePath();
  }
}

/** Paved bands with a thin light center line, like the 2017 sketches' street lines. */
function drawRoads(context: CanvasRenderingContext2D, roads: Extract<MapObject, { kind: 'road' }>[], zoom: number) {
  context.strokeStyle = COLORS.road;

  for (const road of roads) {
    linePath(context, road.points);
    context.lineWidth = road.width;
    context.stroke();
  }

  context.beginPath();

  for (const road of roads) {
    road.points.forEach((point, index) =>
      index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y)
    );
  }

  context.lineWidth = Math.max(0.8, 0.6 / zoom);
  context.strokeStyle = COLORS.roadLine;
  context.stroke();
}

function linePath(context: CanvasRenderingContext2D, points: readonly MapPoint[]) {
  context.beginPath();
  points.forEach((point, index) => (index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y)));
}

/**
 * Walls of solid objects as their outlines swept south by their height, under one soft shadow.
 * The sweep of every edge is a quad; wound the same way, the quads fill their union in one call.
 *
 * @param deviceScale - Device pixels per world pixel; canvas shadow sizes ignore the transform.
 */
function drawSides(context: CanvasRenderingContext2D, solids: MapObject[], deviceScale: number) {
  context.beginPath();

  for (const solid of solids) {
    const height = solid.kind === 'crate' ? CRATE_HEIGHT : 'height' in solid ? solid.height : 0;
    const offset = { x: SUN.x * height, y: SUN.y * height };
    const rings =
      solid.kind === 'crate'
        ? [boxCorners(solid, solid.size, solid.rotation)]
        : 'holes' in solid
          ? [solid.points, ...solid.holes]
          : [];

    for (const ring of rings) {
      ring.forEach((a, index) => {
        const b = ring[(index + 1) % ring.length];
        const quad = [a, b, { x: b.x + offset.x, y: b.y + offset.y }, { x: a.x + offset.x, y: a.y + offset.y }];
        const ordered = signedArea(quad) < 0 ? quad.reverse() : quad;

        ordered.forEach((point, corner) =>
          corner === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y)
        );
        context.closePath();
      });
    }
  }

  context.save();
  context.shadowColor = COLORS.shadow;
  context.shadowBlur = 10 * deviceScale;
  context.shadowOffsetX = 2 * deviceScale;
  context.shadowOffsetY = 5 * deviceScale;
  context.fillStyle = COLORS.side;
  context.fill('nonzero');
  context.restore();
}

/** The game's crate: a gray box crossed by its diagonals. */
function drawCrate(context: CanvasRenderingContext2D, crate: Extract<MapObject, { kind: 'crate' }>, lineWidth: number) {
  const corners = boxCorners(crate, crate.size, crate.rotation);
  fillPath(context, [corners]);
  context.fillStyle = COLORS.crate;
  context.fill();
  context.moveTo(corners[0].x, corners[0].y);
  context.lineTo(corners[2].x, corners[2].y);
  context.moveTo(corners[1].x, corners[1].y);
  context.lineTo(corners[3].x, corners[3].y);
  context.lineWidth = lineWidth;
  context.strokeStyle = COLORS.outline;
  context.stroke();
}

/** Dims everything outside the playable rectangle and rims it with a dashed line. */
function drawBounds(context: CanvasRenderingContext2D, bounds: MapBounds, zoom: number) {
  const far = 1e6;

  context.beginPath();
  context.rect(-far, -far, far * 2, far * 2);
  context.rect(bounds.x, bounds.y, bounds.width, bounds.height);
  context.fillStyle = 'rgba(20, 20, 20, 0.55)';
  context.fill('evenodd');
  context.setLineDash([6 / zoom, 6 / zoom]);
  context.lineWidth = 1.5 / zoom;
  context.strokeStyle = COLORS.bounds;
  context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
  context.setLineDash([]);
}

/** Outlines the hovered and selected items and the outline being drawn, in world coordinates. */
function drawMarks(context: CanvasRenderingContext2D, map: TankiMap, zoom: number, overlay: EditorOverlay) {
  const hovered =
    overlay.hover && !overlay.selection.includes(overlay.hover) ? findItem(map, overlay.hover) : undefined;

  if (hovered) {
    traceItem(context, hovered);
    context.lineWidth = 1.5 / zoom;
    context.strokeStyle = COLORS.accentSoft;
    context.stroke();
  }

  for (const id of overlay.selection) {
    const item = findItem(map, id);

    if (!item) {
      continue;
    }

    traceItem(context, item);
    context.lineWidth = 2 / zoom;
    context.strokeStyle = COLORS.accent;
    context.stroke();
  }

  if (overlay.selection.length > 1) {
    const box = selectionBounds(map, overlay.selection)!;

    context.setLineDash([4 / zoom, 4 / zoom]);
    context.lineWidth = 1 / zoom;
    context.strokeStyle = COLORS.accent;
    context.strokeRect(box.x, box.y, box.width, box.height);
    context.setLineDash([]);
  }

  const draft = overlay.draft;

  if (draft && draft.points.length > 0) {
    const points = draft.cursor ? [...draft.points, draft.cursor] : draft.points;

    linePath(context, points);

    if (draft.closed) {
      context.closePath();
      context.fillStyle = 'rgba(255, 176, 32, 0.18)';
      context.fill();
    }

    context.lineWidth = 2 / zoom;
    context.strokeStyle = COLORS.accent;
    context.stroke();

    for (const point of draft.points) {
      context.beginPath();
      context.arc(point.x, point.y, 3.5 / zoom, 0, Math.PI * 2);
      context.fillStyle = '#ffffff';
      context.fill();
      context.lineWidth = 1.5 / zoom;
      context.stroke();
    }
  }
}

/** Starts a path along an item's outline: a road's center line, a box, a circle or rings. */
function traceItem(context: CanvasRenderingContext2D, item: MapItem) {
  if (isCapturePoint(item)) {
    context.beginPath();
    context.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
    return;
  }

  if (isObject(item) && item.kind === 'crate') {
    fillPath(context, [boxCorners(item, item.size, item.rotation)]);
    return;
  }

  if (isObject(item) && item.kind === 'road') {
    linePath(context, item.points);
    return;
  }

  fillPath(context, 'holes' in item ? [item.points, ...item.holes] : [item.points]);
}

/** Team names on spawn zones, drawn in screen space so they stay readable at any zoom. */
function drawLabels(context: CanvasRenderingContext2D, map: TankiMap, view: MapView, screen: ScreenSize) {
  context.font = '600 11px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  for (const spawn of map.spawns) {
    const bounds = itemBounds(spawn);
    const label = TEAM_COLORS[spawn.team].label;

    if (context.measureText(label).width + 8 > bounds.width * view.zoom) {
      continue;
    }

    const x = (bounds.x + bounds.width / 2 - view.x) * view.zoom + screen.width / 2;
    const y = (bounds.y + bounds.height / 2 - view.y) * view.zoom + screen.height / 2;

    context.fillStyle = 'rgba(0, 0, 0, 0.55)';
    context.fillText(label, x + 1, y + 1);
    context.fillStyle = '#ffffff';
    context.fillText(label, x, y);
  }
}

function drawHandles(context: CanvasRenderingContext2D, handles: SelectionHandles, vertex: VertexRef | undefined) {
  const half = HANDLE_SIZE / 2;

  context.lineWidth = 1;
  context.strokeStyle = '#1b1b1b';

  for (const midpoint of handles.midpoints) {
    context.beginPath();
    context.arc(midpoint.at.x, midpoint.at.y, 3, 0, Math.PI * 2);
    context.fillStyle = 'rgba(255, 255, 255, 0.75)';
    context.fill();
    context.stroke();
  }

  for (const handle of handles.vertices) {
    const picked =
      vertex !== undefined &&
      vertex.id === handle.ref.id &&
      vertex.ring === handle.ref.ring &&
      vertex.index === handle.ref.index;

    context.fillStyle = picked ? COLORS.accent : '#ffffff';
    context.fillRect(handle.at.x - half, handle.at.y - half, HANDLE_SIZE, HANDLE_SIZE);
    context.strokeRect(handle.at.x - half + 0.5, handle.at.y - half + 0.5, HANDLE_SIZE - 1, HANDLE_SIZE - 1);
  }

  if (handles.rotate) {
    const { anchor, at } = handles.rotate;

    context.beginPath();
    context.moveTo(anchor.x, anchor.y);
    context.lineTo(at.x, at.y);
    context.strokeStyle = COLORS.accent;
    context.stroke();
    context.beginPath();
    context.arc(at.x, at.y, 6, 0, Math.PI * 2);
    context.fillStyle = '#ffffff';
    context.fill();
    context.lineWidth = 2;
    context.stroke();
  }
}

function drawMarquee(context: CanvasRenderingContext2D, marquee: MapBounds, view: MapView, screen: ScreenSize) {
  const x = (marquee.x - view.x) * view.zoom + screen.width / 2;
  const y = (marquee.y - view.y) * view.zoom + screen.height / 2;

  context.fillStyle = 'rgba(255, 176, 32, 0.12)';
  context.fillRect(x, y, marquee.width * view.zoom, marquee.height * view.zoom);
  context.lineWidth = 1;
  context.strokeStyle = COLORS.accent;
  context.strokeRect(x + 0.5, y + 0.5, marquee.width * view.zoom, marquee.height * view.zoom);
}
