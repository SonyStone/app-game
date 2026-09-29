import type { SceneFrame } from '../createFrame';
import type { PaintNode } from './paintTree';

/** Integer framebuffer bounds, including the antialiasing fringe. */
export type PixelRect = { x: number; y: number; width: number; height: number };

/** Page-space box as left, bottom, right, top; empty when left > right. */
type Bounds = readonly [number, number, number, number];

/** A contiguous-range hierarchy preserves PDF paint order while skipping offscreen instances. */
export function createPaintBounds(
  instances: ArrayBuffer,
  pages: { x: number; y: number }[],
  prepared?: ReturnType<typeof buildPaintBounds>
) {
  const { leaves, tree } = prepared ?? buildPaintBounds(instances, pages);
  const nodes = new WeakMap<PaintNode, Bounds>();

  return (frame: SceneFrame) => {
    const screen = new WeakMap<PaintNode, PixelRect | undefined>();
    const [a, b, c, d] = frame.rotation;
    const [mulX, mulY] = frame.mul;
    const [addX, addY] = frame.add;
    // Pixel-space extent of the most recently projected box, before the fringe and viewport clamp.
    let minX = 0;
    let minY = 0;
    let maxX = 0;
    let maxY = 0;

    return {
      /** Conservative screen bounds; masks may widen a group but can never shrink its content. */
      rect(node: PaintNode) {
        if (!screen.has(node)) {
          const bounds = nodeBounds(node);
          screen.set(node, extent(bounds[0], bounds[1], bounds[2], bounds[3]) ? clippedRect() : undefined);
        }

        return screen.get(node);
      },
      /** Visible contiguous spans; returns source order, including overlapping translucent objects. */
      ranges(first: number, count: number) {
        const spans: { first: number; count: number }[] = [];
        const end = first + count;
        visit(tree);
        return spans;

        function visit(branch: Branch) {
          const [left, bottom, right, top] = branch.bounds;

          if (branch.end <= first || branch.first >= end || !extent(left, bottom, right, top) || !overlaps()) {
            return;
          }

          // Every instance of a fully visible branch is visible too, so skip per-instance tests.
          if (contained()) {
            append(Math.max(first, branch.first), Math.min(end, branch.end));
            return;
          }

          if (branch.children) {
            branch.children.forEach(visit);
            return;
          }

          for (let index = Math.max(first, branch.first); index < Math.min(end, branch.end); index++) {
            const offset = index * 4;

            if (extent(leaves[offset]!, leaves[offset + 1]!, leaves[offset + 2]!, leaves[offset + 3]!) && overlaps()) {
              append(index, index + 1);
            }
          }
        }

        function append(from: number, to: number) {
          const previous = spans.at(-1);

          if (previous && previous.first + previous.count === from) {
            previous.count += to - from;
          } else {
            spans.push({ first: from, count: to - from });
          }
        }
      }
    };

    /**
     * Projects a page box's corners into pixels, storing the extent in `minX`..`maxY`; false when empty.
     * The corners form a product set and the transform is affine, so each extreme is a sum of per-axis extremes.
     */
    function extent(left: number, bottom: number, right: number, top: number) {
      if (left > right || bottom > top) {
        return false;
      }

      const x0 = left * mulX + addX;
      const x1 = right * mulX + addX;
      const y0 = bottom * mulY + addY;
      const y1 = top * mulY + addY;
      const ax0 = a * x0;
      const ax1 = a * x1;
      const cy0 = c * y0;
      const cy1 = c * y1;
      const bx0 = b * x0;
      const bx1 = b * x1;
      const dy0 = d * y0;
      const dy1 = d * y1;
      minX = ((Math.min(ax0, ax1) + Math.min(cy0, cy1) + 1) * frame.width) / 2;
      maxX = ((Math.max(ax0, ax1) + Math.max(cy0, cy1) + 1) * frame.width) / 2;
      minY = ((1 - Math.max(bx0, bx1) - Math.max(dy0, dy1)) * frame.height) / 2;
      maxY = ((1 - Math.min(bx0, bx1) - Math.min(dy0, dy1)) * frame.height) / 2;
      return true;
    }

    // Covers rotated quad expansion, one-pixel hairlines and f32 transform rounding.
    function clippedRect(): PixelRect | undefined {
      const x = Math.max(0, Math.floor(minX - 2));
      const y = Math.max(0, Math.floor(minY - 2));
      const width = Math.min(frame.width, Math.ceil(maxX + 2)) - x;
      const height = Math.min(frame.height, Math.ceil(maxY + 2)) - y;
      return width > 0 && height > 0 ? { x, y, width, height } : undefined;
    }

    /** Whether the last extent, with its fringe, intersects the viewport (as `clippedRect` would). */
    function overlaps() {
      return (
        Math.min(frame.width, Math.ceil(maxX + 2)) > Math.max(0, Math.floor(minX - 2)) &&
        Math.min(frame.height, Math.ceil(maxY + 2)) > Math.max(0, Math.floor(minY - 2))
      );
    }

    /** Whether the last extent, with its fringe, lies entirely inside the viewport. */
    function contained() {
      return (
        Math.floor(minX - 2) >= 0 &&
        Math.floor(minY - 2) >= 0 &&
        Math.ceil(maxX + 2) <= frame.width &&
        Math.ceil(maxY + 2) <= frame.height
      );
    }
  };

  function nodeBounds(node: PaintNode): Bounds {
    const previous = nodes.get(node);

    if (previous) {
      return previous;
    }

    const bounds =
      'children' in node
        ? node.children.reduce<Bounds>((result, child) => union(result, nodeBounds(child)), empty)
        : rangeBounds(tree, node.first, node.first + node.count);
    nodes.set(node, bounds);
    return bounds;
  }

  function rangeBounds(branch: Branch, first: number, end: number): Bounds {
    if (first <= branch.first && end >= branch.end) {
      return branch.bounds;
    }

    if (first >= branch.end || end <= branch.first) {
      return empty;
    }

    if (branch.children) {
      return union(rangeBounds(branch.children[0], first, end), rangeBounds(branch.children[1], first, end));
    }

    let result = empty;

    for (let index = Math.max(first, branch.first); index < Math.min(end, branch.end); index++) {
      result = union(result, at(index));
    }

    return result;
  }

  function at(index: number): Bounds {
    return [leaves[index * 4]!, leaves[index * 4 + 1]!, leaves[index * 4 + 2]!, leaves[index * 4 + 3]!];
  }
}

/** Instance range with its union bounds; leaves hold at most 32 instances. */
type Branch = { first: number; end: number; bounds: Bounds; children?: [Branch, Branch] };

/** Builds transferable spatial data once; query closures stay on the render thread. */
export function buildPaintBounds(instances: ArrayBuffer, pages: { x: number; y: number }[]) {
  const data = new DataView(instances);
  const count = instances.byteLength / 80;
  const leaves = new Float64Array(count * 4);

  for (let index = 0; index < count; index++) {
    const offset = index * 80;
    const a = data.getFloat32(offset, true);
    const b = data.getFloat32(offset + 4, true);
    const c = data.getFloat32(offset + 8, true);
    const d = data.getFloat32(offset + 12, true);
    const tx = data.getFloat32(offset + 16, true);
    const ty = data.getFloat32(offset + 20, true);
    const page = pages[data.getUint32(offset + 76, true)]!;
    // Include the whole outline; clipping its box before adding the pixel fringe can lose thin edges.
    const left = tx + Math.min(0, a) + Math.min(0, c);
    const right = tx + Math.max(0, a) + Math.max(0, c);
    const top = ty + Math.min(0, b) + Math.min(0, d);
    const bottom = ty + Math.max(0, b) + Math.max(0, d);
    leaves.set([left - page.x, 1 - bottom - page.y, right - page.x, 1 - top - page.y], index * 4);
  }

  const tree = build(0, count);
  return { leaves, tree };

  function build(first: number, end: number): Branch {
    if (end - first <= 32) {
      let bounds = empty;

      for (let index = first; index < end; index++) {
        bounds = union(bounds, at(index));
      }

      return { first, end, bounds };
    }

    const middle = Math.floor((first + end) / 2);
    const children: [Branch, Branch] = [build(first, middle), build(middle, end)];
    return { first, end, children, bounds: union(children[0].bounds, children[1].bounds) };
  }

  function at(index: number): Bounds {
    return [leaves[index * 4]!, leaves[index * 4 + 1]!, leaves[index * 4 + 2]!, leaves[index * 4 + 3]!];
  }
}

function union(a: Bounds, b: Bounds): Bounds {
  if (b[0] > b[2] || b[1] > b[3]) {
    return a;
  }

  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

const empty: Bounds = [Infinity, Infinity, -Infinity, -Infinity];
