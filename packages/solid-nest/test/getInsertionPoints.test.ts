import { createRoot } from 'solid-js';
import { Container } from 'src/BlockTree';
import { getInsertionPoints } from 'src/dnd/getInsertionPoints';
import { ItemId } from 'src/Item';
import { BlockMeasurements } from 'src/measure';
import { VirtualTree } from 'src/virtual-tree';
import { describe, expect, it } from 'vitest';

// ============================================================================
// MARK: Test Helpers
// ============================================================================

type TestBlock = { key: string; tag?: string; containers?: Container<string, TestBlock>[] };

function block(key: string, tag?: string): TestBlock {
  return { key, tag };
}

function group(key: string, children: TestBlock[], accepts: string[] = []): TestBlock {
  const container: Container<string, TestBlock> = {
    key,
    spacing: 4,
    accepts,
    getBlocks: () => children
  };
  return { key, tag: 'group', containers: [container] };
}

function buildTree(rootChildren: TestBlock[], accepts: string[] = ['brush']): VirtualTree<string, TestBlock> {
  let tree!: VirtualTree<string, TestBlock>;

  createRoot((dispose) => {
    const root: Container<string, TestBlock> = {
      key: 'root',
      spacing: 4,
      accepts,
      getBlocks: () => rootChildren
    };

    const accessor = VirtualTree.create<string, TestBlock>(
      () => root,
      (b) => b.key,
      (b) => ({ tag: b.tag }),
      (b) => b.containers ?? []
    );

    tree = accessor();
    dispose();
  });

  return tree;
}

function createMeasurements(
  tree: VirtualTree<string, TestBlock>,
  blockHeight: number = 30,
  containerWidth: number = 200
): Map<ItemId, BlockMeasurements> {
  const measures = new Map<ItemId, BlockMeasurements>();
  let y = 0;

  const processContainer = (containerId: ItemId, spacing: number) => {
    const children = tree.children(containerId);
    const blockChildren = children.filter((c) => c.kind === 'block');
    const startY = y;

    const childEntries: BlockMeasurements['children'] = [];

    for (let i = 0; i < children.length; i++) {
      const child = children[i]!;
      if (child.kind === 'block') {
        if (childEntries.length > 0) y += spacing;
        const childStartY = y;
        childEntries.push({ x: 0, y: y - startY, w: 0, id: child.id });

        // Process any nested containers
        const nestedChildren = tree.children(child.id);
        const nestedContainers = nestedChildren.filter((c) => c.kind === 'container');
        const nestedEntries: BlockMeasurements['children'] = [];

        for (const nested of nestedContainers) {
          const nestedStartY = y + blockHeight;
          y = nestedStartY;
          processContainer(nested.id, 4);
          nestedEntries.push({ x: 10, y: blockHeight, w: -20, id: nested.id });
        }

        measures.set(child.id, {
          container: new DOMRect(0, childStartY, containerWidth, blockHeight),
          children: nestedEntries,
          bottom: nestedContainers.length === 0 ? blockHeight : 0
        });

        if (nestedContainers.length === 0) {
          y += blockHeight;
        }
      } else if (child.kind === 'placeholder') {
        // Don't add to y
      }
    }

    measures.set(containerId, {
      container: new DOMRect(0, startY, containerWidth, y - startY),
      children: childEntries,
      bottom: 0
    });
  };

  processContainer(tree.root.id, tree.root.spacing);

  return measures;
}

// ============================================================================
// MARK: getInsertionPoints
// ============================================================================

describe('getInsertionPoints', () => {
  it('returns an insertion point before each block for accepted tags', () => {
    const tree = buildTree([block('a', 'brush'), block('b', 'brush'), block('c', 'brush')], ['brush']);
    const measures = createMeasurements(tree);

    const points = getInsertionPoints(tree, ['brush'], measures);

    // Should have an insertion point before each block, plus one at the end (before: null)
    expect(points.length).toBe(4);
    expect(points[0]!.place.before).toBe('a');
    expect(points[1]!.place.before).toBe('b');
    expect(points[2]!.place.before).toBe('c');
    expect(points[3]!.place.before).toBeNull();
  });

  it('sets the parent key correctly', () => {
    const tree = buildTree([block('a', 'brush'), block('b', 'brush')], ['brush']);
    const measures = createMeasurements(tree);
    const points = getInsertionPoints(tree, ['brush'], measures);

    for (const point of points) {
      expect(point.place.parent).toBe('root');
    }
  });

  it('returns empty when tags are not accepted by the root', () => {
    const tree = buildTree([block('a', 'brush'), block('b', 'brush')], ['group']);
    const measures = createMeasurements(tree);
    const points = getInsertionPoints(tree, ['brush'], measures);

    expect(points.length).toBe(0);
  });

  it('returns insertion points inside nested containers that accept the tag', () => {
    const child1 = block('child1', 'brush');
    const child2 = block('child2', 'brush');
    const parent = group('parent', [child1, child2], ['brush']);
    const tree = buildTree([parent], ['group']);
    const measures = createMeasurements(tree);

    const points = getInsertionPoints(tree, ['brush'], measures);

    // Should have insertion points inside the group (which accepts 'brush')
    // but not in the root (which only accepts 'group')
    const nestedPoints = points.filter((p) => p.place.parent === 'parent');
    expect(nestedPoints.length).toBeGreaterThan(0);
  });

  it('returns insertion points with increasing y values', () => {
    const tree = buildTree([block('a', 'brush'), block('b', 'brush'), block('c', 'brush')], ['brush']);
    const measures = createMeasurements(tree);
    const points = getInsertionPoints(tree, ['brush'], measures);

    for (let i = 1; i < points.length; i++) {
      expect(points[i]!.y).toBeGreaterThanOrEqual(points[i - 1]!.y);
    }
  });

  it('returns an "insert at end" point for wrap-layout containers', () => {
    // Build a tree with a wrap-layout root
    let tree!: VirtualTree<string, TestBlock>;
    createRoot((dispose) => {
      const root: Container<string, TestBlock> = {
        key: 'root',
        spacing: 4,
        accepts: ['brush'],
        layout: 'wrap',
        getBlocks: () => [block('a', 'brush'), block('b', 'brush'), block('c', 'brush')]
      };
      const accessor = VirtualTree.create<string, TestBlock>(
        () => root,
        (b) => b.key,
        (b) => ({ tag: b.tag }),
        (b) => b.containers ?? []
      );
      tree = accessor();
      dispose();
    });

    const childW = 80;
    const childH = 60;
    const spacing = 4;
    const containerW = 300;
    const measures = new Map<ItemId, BlockMeasurements>();

    // Simulate 3 children laid out horizontally
    const children = tree.children(tree.root.id).filter((c) => c.kind === 'block');
    let cx = 0;
    for (const child of children) {
      measures.set(child.id, {
        container: new DOMRect(cx, 0, childW, childH),
        children: [],
        bottom: childH
      });
      cx += childW + spacing;
    }
    measures.set(tree.root.id, {
      container: new DOMRect(0, 0, containerW, childH),
      children: [],
      bottom: 0
    });

    const points = getInsertionPoints(tree, ['brush'], measures);

    // Should have 4 points: before a, before b, before c, and at end (before: null)
    expect(points.length).toBe(4);

    const endPoint = points.find((p) => p.place.before === null);
    expect(endPoint).toBeDefined();
    expect(endPoint!.place.parent).toBe('root');
    expect(endPoint!.inWrap).toBe(true);
    // The end point should be positioned after child c
    expect(endPoint!.x).toBeGreaterThan(0);
  });
});
