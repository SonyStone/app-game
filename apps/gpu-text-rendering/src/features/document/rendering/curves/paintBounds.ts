import type { SceneFrame } from '../createFrame';
import type { PaintNode } from './paintTree';

/** Integer framebuffer bounds, including the antialiasing fringe. */
export type PixelRect = { x: number; y: number; width: number; height: number };

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

    return {
      /** Conservative screen bounds; masks may widen a group but can never shrink its content. */
      rect(node: PaintNode) {
        if (!screen.has(node)) {
          screen.set(node, project(nodeBounds(node)));
        }

        return screen.get(node);
      },
      /** Visible contiguous spans; returns source order, including overlapping translucent objects. */
      ranges(first: number, count: number) {
        const spans: { first: number; count: number }[] = [];
        visit(tree);
        return spans;

        function visit(branch: Branch) {
          if (branch.end <= first || branch.first >= first + count || !project(branch.bounds)) {
            return;
          }

          if (branch.children) {
            branch.children.forEach(visit);
            return;
          }

          for (let index = Math.max(first, branch.first); index < Math.min(first + count, branch.end); index++) {
            if (!project(at(index))) {
              continue;
            }

            const previous = spans.at(-1);

            if (previous && previous.first + previous.count === index) {
              previous.count++;
            } else {
              spans.push({ first: index, count: 1 });
            }
          }
        }
      }
    };

    function project(bounds: Bounds): PixelRect | undefined {
      const [left, bottom, right, top] = bounds;

      if (left > right || bottom > top) {
        return undefined;
      }

      const [a, b, c, d] = frame.rotation;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (const [x, y] of [
        [left, bottom],
        [right, bottom],
        [left, top],
        [right, top]
      ]) {
        const px = x! * frame.mul[0] + frame.add[0];
        const py = y! * frame.mul[1] + frame.add[1];
        const sx = ((a! * px + c! * py + 1) * frame.width) / 2;
        const sy = ((1 - b! * px - d! * py) * frame.height) / 2;
        minX = Math.min(minX, sx);
        maxX = Math.max(maxX, sx);
        minY = Math.min(minY, sy);
        maxY = Math.max(maxY, sy);
      }

      // Covers rotated quad expansion, one-pixel hairlines and f32 transform rounding.
      const x = Math.max(0, Math.floor(minX - 2));
      const y = Math.max(0, Math.floor(minY - 2));
      const width = Math.min(frame.width, Math.ceil(maxX + 2)) - x;
      const height = Math.min(frame.height, Math.ceil(maxY + 2)) - y;
      return width > 0 && height > 0 ? { x, y, width, height } : undefined;
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

type Branch = { first: number; end: number; bounds: Bounds; children?: [Branch, Branch] };
