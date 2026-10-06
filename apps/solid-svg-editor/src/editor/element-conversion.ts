import {
  formatPathData,
  formatPoints,
  isPointOnSegment,
  parsePathData,
  parsePoints,
  straightPathVertices,
  toRelativeCommands,
  type PathCommand
} from '../path-data';
import { getAttribute, type SvgAttribute, type SvgElementNode } from '../svg-model';
import { formatCoordinate, type Point } from './geometry';

/** Element types an element can be converted to, in GodSVG's menu order; empty for other elements. */
export function possibleConversions(element: SvgElementNode): readonly string[] {
  return conversionTargets[element.name] ?? [];
}

const conversionTargets: Readonly<Record<string, readonly string[]>> = {
  circle: ['ellipse', 'rect', 'path'],
  ellipse: ['circle', 'rect', 'path'],
  rect: ['circle', 'ellipse', 'polygon', 'path'],
  line: ['path', 'polyline'],
  polygon: ['path', 'rect'],
  polyline: ['path', 'line'],
  path: ['polygon', 'polyline']
};

/**
 * Converts an element to another type with the same rendered shape, following GodSVG's element replacements.
 *
 * The result keeps the node id, children, and every attribute that is not part of the old or new geometry. Returns
 * `undefined` when the shape would change (an ellipse with unequal radii to a circle, a curved path to a polygon) or
 * when the geometry uses percentages or units, which cannot be converted without the viewport.
 */
export function convertElement(element: SvgElementNode, target: string): SvgElementNode | undefined {
  if (!possibleConversions(element).includes(target)) {
    return undefined;
  }

  const replacement = replacementGeometry(element, target);

  if (!replacement) {
    return undefined;
  }

  const replaced = new Set([...replacement.dropped, ...replacement.attrs.map((attr) => attr.name)]);
  const kept = element.attrs.filter((attr) => !replaced.has(attr.name));
  const defaults = (replacement.defaults ?? []).filter((attr) => !element.attrs.some((item) => item.name === attr.name));

  return { ...element, name: target, attrs: [...replacement.attrs, ...defaults, ...kept] };
}

type Replacement = {
  /** New geometry attributes, written first. */
  readonly attrs: readonly SvgAttribute[];
  /** Old attributes that describe the old geometry and are removed. */
  readonly dropped: readonly string[];
  /** Attributes added only when the element does not set them already. */
  readonly defaults?: readonly SvgAttribute[];
};

function replacementGeometry(element: SvgElementNode, target: string): Replacement | undefined {
  switch (element.name) {
    case 'circle':
      return fromCircle(element, target);
    case 'ellipse':
      return fromEllipse(element, target);
    case 'rect':
      return fromRect(element, target);
    case 'line':
      return fromLine(element, target);
    case 'polygon':
    case 'polyline':
      return fromPoints(element, target);
    case 'path':
      return fromPath(element, target);
    default:
      return undefined;
  }
}

function fromCircle(element: SvgElementNode, target: string): Replacement | undefined {
  const [cx, cy, r] = userNumbers(element, ['cx', 'cy', 'r']);

  if (cx === undefined || cy === undefined || r === undefined) {
    return undefined;
  }

  switch (target) {
    case 'ellipse':
      return { attrs: attributes({ rx: r, ry: r }), dropped: ['r', 'rx', 'ry'] };
    case 'rect':
      return {
        attrs: attributes({ x: cx - r, y: cy - r, width: r * 2, height: r * 2, rx: r, ry: r }),
        dropped: ['r', 'cx', 'cy']
      };
    default:
      return { attrs: [pathData(ellipsePath(cx, cy, r, r))], dropped: ['r', 'cx', 'cy'] };
  }
}

function fromEllipse(element: SvgElementNode, target: string): Replacement | undefined {
  const [cx, cy] = userNumbers(element, ['cx', 'cy']);
  const radii = autoRadii(element, Infinity, Infinity);

  if (cx === undefined || cy === undefined || !radii) {
    return undefined;
  }

  const [rx, ry] = radii;

  switch (target) {
    case 'circle':
      return rx === ry ? { attrs: attributes({ r: rx }), dropped: ['rx', 'ry'] } : undefined;
    case 'rect':
      // The ellipse's rx/ry stay on the rect and round it into the same shape.
      return { attrs: attributes({ x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2 }), dropped: ['cx', 'cy'] };
    default:
      return { attrs: [pathData(ellipsePath(cx, cy, rx, ry))], dropped: ['cx', 'cy', 'rx', 'ry'] };
  }
}

function fromRect(element: SvgElementNode, target: string): Replacement | undefined {
  const [x, y, width, height] = userNumbers(element, ['x', 'y', 'width', 'height']);

  if (x === undefined || y === undefined || width === undefined || height === undefined) {
    return undefined;
  }

  const radii = autoRadii(element, width / 2, height / 2, 0);

  if (!radii) {
    return undefined;
  }

  const [rx, ry] = radii;
  const dropped = ['x', 'y', 'width', 'height', 'rx', 'ry'];

  switch (target) {
    case 'circle':
      return width === height && rx >= width / 2 && ry >= height / 2
        ? { attrs: attributes({ cx: x + width / 2, cy: y + height / 2, r: width / 2 }), dropped }
        : undefined;
    case 'ellipse':
      return rx >= width / 2 && ry >= height / 2
        ? { attrs: attributes({ cx: x + width / 2, cy: y + height / 2, rx: width / 2, ry: height / 2 }), dropped }
        : undefined;
    case 'polygon':
      return rx === 0 && ry === 0
        ? {
            attrs: [
              pointsAttribute([
                { x, y },
                { x: x + width, y },
                { x: x + width, y: y + height },
                { x, y: y + height }
              ])
            ],
            dropped
          }
        : undefined;
    default:
      return { attrs: [pathData(roundedRectPath(x, y, width, height, rx, ry))], dropped };
  }
}

function fromLine(element: SvgElementNode, target: string): Replacement | undefined {
  const [x1, y1, x2, y2] = userNumbers(element, ['x1', 'y1', 'x2', 'y2']);

  if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) {
    return undefined;
  }

  const dropped = ['x1', 'y1', 'x2', 'y2'];

  if (target === 'polyline') {
    const points = [
      { x: x1, y: y1 },
      { x: x2, y: y2 }
    ];
    // A line has no fill; a polyline would fill its area unless told otherwise.
    return { attrs: [pointsAttribute(points)], dropped, defaults: [{ name: 'fill', value: 'none' }] };
  }

  return {
    attrs: [
      pathData([
        { command: 'M', values: [x1, y1] },
        { command: 'L', values: [x2, y2] }
      ])
    ],
    dropped
  };
}

function fromPoints(element: SvgElementNode, target: string): Replacement | undefined {
  const closed = element.name === 'polygon';
  const points = parsePoints(getAttribute(element, 'points', true)).map(([x, y]) => ({ x, y }));

  if (target === 'path') {
    const commands = points.map((point, index) => ({ command: index === 0 ? 'M' : 'L', values: [point.x, point.y] }));
    return {
      attrs: [pathData(closed && points.length > 1 ? [...commands, { command: 'Z', values: [] }] : commands)],
      dropped: ['points']
    };
  }

  const merged = mergeCollinearPoints(points, closed);

  if (target === 'line') {
    const [start, end] = merged;
    return merged.length === 2 && start && end
      ? {
          attrs: attributes({ x1: start.x, y1: start.y, x2: end.x, y2: end.y }),
          // A line has no area, so area-only attributes are dropped as in GodSVG.
          dropped: ['points', 'fill', 'fill-opacity', 'stroke-linejoin']
        }
      : undefined;
  }

  const bounds = axisAlignedRect(merged);
  return bounds ? { attrs: attributes(bounds), dropped: ['points', 'rx', 'ry'] } : undefined;
}

function fromPath(element: SvgElementNode, target: string): Replacement | undefined {
  const vertices = straightPathVertices(parsePathData(getAttribute(element, 'd', true)));

  if (!vertices) {
    return undefined;
  }

  if (target === 'polygon') {
    return vertices.closed || vertices.points.length < 2
      ? { attrs: [pointsAttribute(vertices.points)], dropped: ['d'] }
      : undefined;
  }

  const [first] = vertices.points;
  const points = vertices.closed && first ? [...vertices.points, first] : vertices.points;
  return { attrs: [pointsAttribute(points)], dropped: ['d'] };
}

/**
 * Resolves `rx`/`ry` where a missing radius is "auto" and takes the other one, each clamped to its maximum (half the
 * rect size). Returns `fallback` for both when neither is set, or `undefined` for non-numeric values.
 */
function autoRadii(element: SvgElementNode, maxRx: number, maxRy: number, fallback?: number): readonly [number, number] | undefined {
  const rxValue = getAttribute(element, 'rx', true);
  const ryValue = getAttribute(element, 'ry', true);
  const rx = parseUserNumber(rxValue || ryValue);
  const ry = parseUserNumber(ryValue || rxValue);

  if (!rxValue && !ryValue) {
    return fallback === undefined ? undefined : [fallback, fallback];
  }

  return rx === undefined || ry === undefined ? undefined : [Math.min(rx, maxRx), Math.min(ry, maxRy)];
}

function userNumbers(element: SvgElementNode, names: readonly string[]): readonly (number | undefined)[] {
  return names.map((name) => parseUserNumber(getAttribute(element, name)));
}

/** Parses a plain user-space number; percentages, units, and other text return `undefined`. */
function parseUserNumber(value: string): number | undefined {
  return /^\s*[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?\s*$/.test(value) ? Number(value) : undefined;
}

function attributes(values: Readonly<Record<string, number>>): readonly SvgAttribute[] {
  return Object.entries(values).map(([name, value]) => ({ name, value: formatCoordinate(value) }));
}

function pointsAttribute(points: readonly Point[]): SvgAttribute {
  return { name: 'points', value: formatPoints(points.map((point) => [point.x, point.y])) };
}

function pathData(commands: readonly PathCommand[]): SvgAttribute {
  return { name: 'd', value: formatPathData(commands) };
}

/** Two half-ellipse arcs, written relative after the first move like GodSVG. */
function ellipsePath(cx: number, cy: number, rx: number, ry: number): readonly PathCommand[] {
  return toRelativeCommands([
    { command: 'M', values: [cx + rx, cy] },
    { command: 'A', values: [rx, ry, 0, 0, 1, cx - rx, cy] },
    { command: 'A', values: [rx, ry, 0, 0, 1, cx + rx, cy] },
    { command: 'Z', values: [] }
  ]);
}

/** Outline of a rect with rounded corners; corners that meet skip the straight sides between them (GodSVG). */
function roundedRectPath(x: number, y: number, width: number, height: number, rx: number, ry: number): readonly PathCommand[] {
  const right = x + width;
  const bottom = y + height;
  const arc = (endX: number, endY: number) => ({ command: 'A', values: [rx, ry, 0, 0, 1, endX, endY] });
  const hasHorizontalSides = width > rx * 2;
  const hasVerticalSides = height > ry * 2;
  let commands: PathCommand[];

  if (rx === 0 && ry === 0) {
    commands = [
      { command: 'M', values: [x, y] },
      { command: 'H', values: [right] },
      { command: 'V', values: [bottom] },
      { command: 'H', values: [x] }
    ];
  } else if (hasHorizontalSides && hasVerticalSides) {
    commands = [
      { command: 'M', values: [x, y + ry] },
      arc(x + rx, y),
      { command: 'H', values: [right - rx] },
      arc(right, y + ry),
      { command: 'V', values: [bottom - ry] },
      arc(right - rx, bottom),
      { command: 'H', values: [x + rx] },
      arc(x, bottom - ry)
    ];
  } else if (hasHorizontalSides) {
    commands = [
      { command: 'M', values: [x + rx, y] },
      arc(x + rx, bottom),
      { command: 'H', values: [right - rx] },
      arc(right - rx, y)
    ];
  } else if (hasVerticalSides) {
    commands = [
      { command: 'M', values: [x, y + ry] },
      arc(right, y + ry),
      { command: 'V', values: [bottom - ry] },
      arc(x, bottom - ry)
    ];
  } else {
    commands = [{ command: 'M', values: [x + rx, y] }, arc(x + rx, bottom), arc(x + rx, y)];
  }

  return toRelativeCommands([...commands, { command: 'Z', values: [] }]);
}

/** Drops vertices that lie on the segment between their neighbours (GodSVG's `merge_segments`). */
function mergeCollinearPoints(points: readonly Point[], closed: boolean): readonly Point[] {
  const first = points[0];
  const last = points[points.length - 1];

  if (points.length < 3 || !first || !last) {
    return points;
  }

  const merged: Point[] = [first];

  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    const next = points[index + 1];
    const previous = merged[merged.length - 1];

    if (point && next && previous && !isPointOnSegment(point, previous, next)) {
      merged.push(point);
    }
  }

  const previous = merged[merged.length - 1];

  if (!closed || !previous || !isPointOnSegment(last, previous, first)) {
    merged.push(last);
  }

  return merged;
}

/** Bounds of four points that form an axis-aligned rectangle, in either winding order. */
function axisAlignedRect(points: readonly Point[]): { x: number; y: number; width: number; height: number } | undefined {
  const [a, b, c, d] = points;

  if (points.length !== 4 || !a || !b || !c || !d) {
    return undefined;
  }

  const verticalFirst = a.x === b.x && b.y === c.y && c.x === d.x && d.y === a.y;
  const horizontalFirst = a.y === b.y && b.x === c.x && c.y === d.y && d.x === a.x;

  if (!verticalFirst && !horizontalFirst) {
    return undefined;
  }

  return { x: Math.min(a.x, c.x), y: Math.min(a.y, c.y), width: Math.abs(a.x - c.x), height: Math.abs(a.y - c.y) };
}
