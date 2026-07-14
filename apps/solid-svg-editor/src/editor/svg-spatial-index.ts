import { svgCapabilities, type SvgCapabilityRegistry } from './capabilities';
import {
  multiplyMatrices,
  parseTransformList,
  rectFromPoints,
  transformPoint,
  type Matrix2D,
  type Point,
  type Rect
} from './geometry';
import { getSvgAttribute } from './svg-attributes';
import type { SvgElementNode, SvgNodeId } from '../svg-model';

export type SvgSpatialQueryMode = 'contain' | 'intersect';

export interface SvgSpatialIndexEntry {
  readonly nodeId: SvgNodeId;
  readonly elementName: string;
  readonly bounds: Rect;
  readonly depth: number;
}

export interface SvgSpatialIndex {
  readonly entries: readonly SvgSpatialIndexEntry[];
  readonly boundsForNode: (nodeId: SvgNodeId) => Rect | undefined;
  readonly nodesInRect: (rect: Rect, mode?: SvgSpatialQueryMode) => readonly SvgSpatialIndexEntry[];
  readonly hitTestPoint: (point: Point) => SvgSpatialIndexEntry | undefined;
}

export type SvgSpatialIndexCapabilityIndex = Pick<SvgCapabilityRegistry, 'getElementBounds'>;

export function createSvgSpatialIndex(
  root: SvgElementNode,
  capabilities: SvgSpatialIndexCapabilityIndex = svgCapabilities
): SvgSpatialIndex {
  const entries: SvgSpatialIndexEntry[] = [];
  const byNodeId = new Map<SvgNodeId, SvgSpatialIndexEntry>();

  visitElements(root, identityTransform, -1, (node, transform, depth) => {
    const localBounds = capabilities.getElementBounds(root, node);

    if (!localBounds) {
      return;
    }

    const transformedBounds = transformRect(localBounds, transform);

    if (!transformedBounds) {
      return;
    }

    const entry = {
      nodeId: node.id,
      elementName: node.name,
      bounds: transformedBounds,
      depth
    } satisfies SvgSpatialIndexEntry;
    entries.push(entry);
    byNodeId.set(node.id, entry);
  });

  function boundsForNode(nodeId: SvgNodeId): Rect | undefined {
    return byNodeId.get(nodeId)?.bounds;
  }

  function nodesInRect(rect: Rect, mode: SvgSpatialQueryMode = 'intersect'): readonly SvgSpatialIndexEntry[] {
    return entries.filter((entry) => (mode === 'contain' ? rectContainsRect(rect, entry.bounds) : rectsIntersect(rect, entry.bounds)));
  }

  function hitTestPoint(point: Point): SvgSpatialIndexEntry | undefined {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];

      if (entry && rectContainsPoint(entry.bounds, point)) {
        return entry;
      }
    }

    return undefined;
  }

  return {
    entries,
    boundsForNode,
    nodesInRect,
    hitTestPoint
  } satisfies SvgSpatialIndex;
}

const identityTransform = parseTransformList('');

function visitElements(
  node: SvgElementNode,
  inheritedTransform: Matrix2D,
  depth: number,
  visitor: (node: SvgElementNode, transform: Matrix2D, depth: number) => void
): void {
  const transform = multiplyMatrices(inheritedTransform, parseTransformList(getSvgAttribute(node, 'transform')));

  if (depth >= 0) {
    visitor(node, transform, depth);
  }

  for (const child of node.children) {
    if (child.kind === 'element') {
      visitElements(child, transform, depth + 1, visitor);
    }
  }
}

function transformRect(rect: Rect, transform: Matrix2D): Rect | undefined {
  return rectFromPoints([
    transformPoint(transform, { x: rect.x, y: rect.y }),
    transformPoint(transform, { x: rect.x + rect.width, y: rect.y }),
    transformPoint(transform, { x: rect.x + rect.width, y: rect.y + rect.height }),
    transformPoint(transform, { x: rect.x, y: rect.y + rect.height })
  ]);
}

function rectContainsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y >= outer.y &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function rectContainsPoint(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function rectsIntersect(left: Rect, right: Rect): boolean {
  return (
    right.x + right.width >= left.x &&
    right.x <= left.x + left.width &&
    right.y + right.height >= left.y &&
    right.y <= left.y + left.height
  );
}
