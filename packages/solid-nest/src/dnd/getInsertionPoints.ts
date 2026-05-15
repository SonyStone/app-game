import { calculateLayout } from '../calculateLayout';
import { Place } from '../events';
import { Item, ItemId } from '../Item';
import { BlockMeasurements } from '../measure';
import { VirtualTree } from '../virtual-tree';

export type InsertionPoint<K> = {
  id: ItemId;
  place: Place<K>;
  y: number;
  x?: number;
  width?: number;
  height?: number;
  inWrap?: boolean;
};

export function getInsertionPoints<K, T>(
  tree: VirtualTree<K, T>,
  tags: string[],
  measures: Map<ItemId, BlockMeasurements>
): InsertionPoint<K>[] {
  const output: InsertionPoint<K>[] = [];

  const layout = calculateLayout(tree, (id) => measures.get(id));

  const inner = (item: Item<K, T>, parent: K, accepts: boolean, parentIsWrap: boolean) => {
    const { id } = item;

    if (accepts) {
      // Check there's a layout
      const rect = layout.get(item.id);
      if (!rect) return;

      // Push the insertion point
      const place: Place<K> = {
        parent,
        before: item.kind === 'block' ? item.key : null
      };
      const y = rect.top;
      if (parentIsWrap) {
        output.push({ id, place, y, x: rect.left, width: rect.width, height: rect.height, inWrap: true });
      } else {
        output.push({ id, place, y });
      }
    }

    // Iterate children
    if (item.kind === 'container') {
      const accepts = !tags.find((tag) => !item.accepts.includes(tag));
      const isWrap = item.layout === 'wrap';
      for (const child of tree.children(item.id)) {
        inner(child, item.key, accepts, isWrap);
      }
    }

    if (item.kind === 'block') {
      for (const child of tree.children(item.id)) {
        inner(child, item.key, false, false);
      }
    }
  };

  const root = tree.root;
  const accepts = !tags.find((tag) => !root.accepts.includes(tag));
  for (const child of tree.children(root.id)) {
    inner(child, root.key, accepts, root.layout === 'wrap');
  }

  return output;
}
