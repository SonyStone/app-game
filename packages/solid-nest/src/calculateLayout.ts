import { Item, ItemId } from './Item';
import { BlockMeasurements } from './measure';
import { VirtualTree } from './virtual-tree';

const ZeroMeasurement = { children: [], bottom: 0 };

export function calculateLayout<K>(
  tree: VirtualTree<K, any>,
  measureItem: (id: ItemId) => BlockMeasurements | undefined
) {
  const output = new Map<ItemId, DOMRect>();

  let nextY = 0;

  const inner = (item: Item<K, any>, x: number, width: number) => {
    const measure = measureItem(item.id) ?? ZeroMeasurement;
    const y = nextY;

    if (item.kind === 'container') {
      const children = tree.children(item.id);

      if (item.layout === 'wrap' && measure.container) {
        // Wrap layout: use measured DOM positions instead of vertical cursor
        const containerRect = measure.container;
        let lastRight = 0;
        let lastY = 0;
        let lastW = 0;
        let lastH = 0;

        for (const child of children) {
          if (child.kind === 'placeholder') {
            // Synthetic rect for the "insert at end" position, placed after the last child
            output.set(child.id, new DOMRect(x + lastRight + (lastW > 0 ? item.spacing : 0), y + lastY, lastW, lastH));
            continue;
          }
          const childMeasure = measureItem(child.id);
          if (!childMeasure?.container) continue;
          const cr = childMeasure.container;
          const rx = cr.x - containerRect.x;
          const ry = cr.y - containerRect.y;
          lastRight = rx + cr.width;
          lastY = ry;
          lastW = cr.width;
          lastH = cr.height;
          nextY = y + ry;
          inner(child, x + rx, cr.width);
        }
        nextY = y + containerRect.height;
      } else {
        // List layout: original vertical stacking
        let first = true;
        for (const child of children) {
          if (!first) {
            if (child.kind === 'placeholder') {
              output.set(child.id, new DOMRect(x, nextY + item.spacing, width, 0));
              break;
            } else {
              nextY += item.spacing;
            }
          }
          inner(child, x, width);
          first = false;
        }
      }
    }

    if (item.kind === 'block') {
      const children = tree.children(item.id);

      for (const offset of measure.children) {
        const child = children.find((c) => c.id === offset.id);
        if (!child) continue;
        nextY += offset.y;
        inner(child, x + offset.x, width + offset.w);
      }

      nextY += measure.bottom;
    }

    if (item.kind === 'placeholder') {
      nextY += measure.bottom;
    }

    if (item.kind === 'gap') {
      nextY += measure.bottom;
    }

    output.set(item.id, new DOMRect(x, y, width, nextY - y));
  };

  const root = measureItem(tree.root.id)!;
  inner(tree.root, 0, root.container.width);

  return output;
}
