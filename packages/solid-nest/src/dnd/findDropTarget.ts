import { Place } from '../events';
import { BlockItem, ContainerItem, ItemId } from '../Item';
import { Vec2 } from '../util/types';
import { VirtualTree } from '../virtual-tree';

/** Where dragged blocks would land and where to draw the marker, both in viewport coordinates. */
export type DropTarget<K> = {
  place: Place<K>;
  /** `line` marks a place between blocks; `into` outlines a collapsed block that receives the drop. */
  kind: 'line' | 'into';
  indicator: DOMRect;
};

/**
 * Hit-tests the pointer against the rendered layout, which stays static while dragging.
 *
 * The deepest accepting container under the pointer wins. Inside a container, blocks are
 * read in document order and the pointer goes before the first block it precedes: cells that
 * share a row split at their horizontal centre, full-width rows at their vertical centre.
 * Pointing at the header of a block whose container accepts the drag drops into that block,
 * except near the header's outer edges, which still mean "before" or "after" the block.
 *
 * @param measure Returns the current viewport rect of a rendered item, or `undefined` when it isn't mounted.
 * @returns `undefined` when no accepting container is under the pointer.
 */
export function findDropTarget<K, T>(
  tree: VirtualTree<K, T>,
  dragged: ReadonlySet<K>,
  tags: string[],
  pointer: Vec2,
  measure: (id: ItemId) => DOMRect | undefined
): DropTarget<K> | undefined {
  const accepts = (container: ContainerItem<K>) => tags.every((tag) => container.accepts.includes(tag));

  const searchContainer = (container: ContainerItem<K>, rect: DOMRect): DropTarget<K> | undefined => {
    const blocks = measuredBlocks(container);
    const hit = blocks.find((block) => contains(block.rect, pointer));
    if (hit) {
      const target = searchBlock(hit, container);
      if (target) {
        return target;
      }
    }

    if (!accepts(container)) {
      return undefined;
    }

    return placeInFlow(container, rect, blocks, pointer);
  };

  const searchBlock = (block: MeasuredBlock<K, T>, parent: ContainerItem<K>): DropTarget<K> | undefined => {
    const containers = tree
      .children(block.item.id)
      .filter((item) => item.kind === 'container')
      .map((item) => ({ item, rect: measure(item.id) }));

    for (const { item, rect } of containers) {
      if (rect && contains(rect, pointer)) {
        const target = searchContainer(item, rect);
        if (target) {
          return target;
        }
      }
    }

    // Only containers that explicitly accept the drag turn a block into a drop target;
    // otherwise every leaf of the legacy API, which always gets a container, would swallow drops.
    const inner = containers.find(({ item }) => item.accepts.length > 0 && accepts(item));
    if (!inner) {
      return undefined;
    }

    const expanded = inner.rect;
    const headerBottom = expanded ? expanded.top : block.rect.bottom;
    if (pointer.y > headerBottom) {
      return expanded ? placeInFlow(inner.item, expanded, measuredBlocks(inner.item), pointer) : undefined;
    }

    if (accepts(parent)) {
      const edge = (headerBottom - block.rect.top) * EdgeFraction;
      const nearTop = pointer.y < block.rect.top + edge;
      const nearBottom = !expanded && pointer.y > headerBottom - edge;
      if (nearTop || nearBottom) {
        return undefined;
      }
    }

    if (expanded) {
      const first = measuredBlocks(inner.item)[0];
      return {
        place: { parent: inner.item.key, before: first?.item.key ?? null },
        kind: 'line',
        indicator: horizontalLine(expanded.left, expanded.width, first ? first.rect.top : expanded.top)
      };
    }

    return { place: { parent: inner.item.key, before: null }, kind: 'into', indicator: block.rect };
  };

  const measuredBlocks = (container: ContainerItem<K>) =>
    tree.children(container.id).flatMap((item) => {
      if (item.kind !== 'block' || dragged.has(item.key)) {
        return [];
      }

      const rect = measure(item.id);
      return rect ? [{ item, rect }] : [];
    });

  const rootRect = measure(tree.root.id);
  return rootRect && searchContainer(tree.root, rootRect);
}

/** Share of a block header, from each edge, that means "beside" rather than "into" the block. */
const EdgeFraction = 0.25;

/** Marker thickness, in pixels. */
const LineWidth = 3;

type MeasuredBlock<K, T> = { item: BlockItem<K, T>; rect: DOMRect };

/** Inserts before the first block that follows the pointer in reading order. */
function placeInFlow<K, T>(
  container: ContainerItem<K>,
  rect: DOMRect,
  blocks: MeasuredBlock<K, T>[],
  pointer: Vec2
): DropTarget<K> {
  const index = blocks.findIndex((block) => isAfterPointer(block.rect, rect, pointer));
  const next = blocks[index];
  const prev = index < 0 ? blocks.at(-1) : blocks[index - 1];
  const half = container.spacing / 2;
  const place = { parent: container.key, before: next?.item.key ?? null };

  // Pointing past the end of a row reads better as "after the row's last cell" than as
  // "before the next row's first cell", although both describe the same place.
  const anchorAfter = prev && (!next || (pointer.y < next.rect.top && !isFullWidth(prev.rect, rect)));
  if (anchorAfter) {
    const indicator = isFullWidth(prev.rect, rect)
      ? horizontalLine(prev.rect.left, prev.rect.width, prev.rect.bottom + half)
      : verticalLine(prev.rect.right + half, prev.rect.top, prev.rect.height);
    return { place, kind: 'line', indicator };
  }

  if (next) {
    const indicator = isFullWidth(next.rect, rect)
      ? horizontalLine(next.rect.left, next.rect.width, next.rect.top - half)
      : verticalLine(next.rect.left - half, next.rect.top, next.rect.height);
    return { place, kind: 'line', indicator };
  }

  return { place, kind: 'line', indicator: horizontalLine(rect.left, rect.width, rect.top) };
}

function isAfterPointer(block: DOMRect, container: DOMRect, pointer: Vec2) {
  if (pointer.y < block.top) {
    return true;
  }

  if (pointer.y >= block.bottom) {
    return false;
  }

  return isFullWidth(block, container)
    ? pointer.y < block.top + block.height / 2
    : pointer.x < block.left + block.width / 2;
}

/** Rows that fill their container stack vertically; anything narrower shares a row with siblings. */
function isFullWidth(block: DOMRect, container: DOMRect) {
  return block.width >= container.width * 0.75;
}

function contains(rect: DOMRect, point: Vec2) {
  return point.x >= rect.left && point.x < rect.right && point.y >= rect.top && point.y < rect.bottom;
}

function horizontalLine(x: number, width: number, y: number) {
  return new DOMRect(x, y - LineWidth / 2, width, LineWidth);
}

function verticalLine(x: number, y: number, height: number) {
  return new DOMRect(x - LineWidth / 2, y, LineWidth, height);
}
