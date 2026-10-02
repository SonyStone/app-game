import { createRoot } from 'solid-js';
import { Container } from 'src/BlockTree';
import { findDropTarget } from 'src/dnd/findDropTarget';
import { createBlockItemId, createContainerItemId, ItemId } from 'src/Item';
import { VirtualTree } from 'src/virtual-tree';
import { describe, expect, it } from 'vitest';

type TestBlock = { key: string; tag: string; containers: Container<string, TestBlock>[] };

const brush = (key: string): TestBlock => ({ key, tag: 'brush', containers: [] });

function group(key: string, children: TestBlock[]): TestBlock {
  return {
    key,
    tag: 'group',
    containers: [{ key, spacing: 4, accepts: ['group', 'brush'], layout: 'wrap', getBlocks: () => children }]
  };
}

function buildTree(children: TestBlock[]) {
  return createRoot((dispose) => {
    const root: Container<string, TestBlock> = {
      key: 'root',
      spacing: 4,
      accepts: ['group'],
      getBlocks: () => children
    };
    const tree = VirtualTree.create<string, TestBlock>(
      () => root,
      (block) => block.key,
      (block) => ({ tag: block.tag }),
      (block) => block.containers
    )();
    dispose();
    return tree;
  });
}

/**
 * Root list with one expanded group `g` (header 0–30) whose wrap container (y 30–130) holds
 * two rows of 96×46 cells: `a b` at y 30, `c d` at y 80. A collapsed group `h` sits at y 140.
 */
function fixture() {
  const tree = buildTree([group('g', ['a', 'b', 'c', 'd'].map(brush)), group('h', [])]);
  const rects = new Map<ItemId, DOMRect>([
    [createContainerItemId('root'), new DOMRect(0, 0, 200, 170)],
    [createBlockItemId('g'), new DOMRect(0, 0, 200, 130)],
    [createContainerItemId('g'), new DOMRect(0, 30, 200, 100)],
    [createBlockItemId('a'), new DOMRect(0, 30, 98, 46)],
    [createBlockItemId('b'), new DOMRect(102, 30, 98, 46)],
    [createBlockItemId('c'), new DOMRect(0, 80, 98, 46)],
    [createBlockItemId('d'), new DOMRect(102, 80, 98, 46)],
    [createBlockItemId('h'), new DOMRect(0, 140, 200, 30)]
  ]);
  const find = (x: number, y: number, dragged: string[] = [], tags = ['brush']) =>
    findDropTarget(tree, new Set(dragged), tags, { x, y }, (id) => rects.get(id));
  return { find };
}

describe('findDropTarget', () => {
  it('splits wrapped cells at their horizontal centre', () => {
    const { find } = fixture();
    expect(find(130, 50)?.place).toEqual({ parent: 'g', before: 'b' });
    expect(find(180, 50, ['d'])?.place).toEqual({ parent: 'g', before: 'c' });
    expect(find(20, 100)?.place).toEqual({ parent: 'g', before: 'c' });
  });

  it('marks the end of a row after its last cell, not before the next row', () => {
    const { find } = fixture();
    const target = find(180, 50);
    expect(target?.place).toEqual({ parent: 'g', before: 'c' });
    expect(target?.indicator.x).toBeCloseTo(200 + 2 - 1.5);
    expect(target?.indicator.y).toBe(30);
  });

  it('ignores the dragged blocks themselves', () => {
    const { find } = fixture();
    expect(find(20, 50, ['a'])?.place).toEqual({ parent: 'g', before: 'b' });
  });

  it('drops into a collapsed group from the middle of its header', () => {
    const { find } = fixture();
    const target = find(100, 155);
    expect(target?.place).toEqual({ parent: 'h', before: null });
    expect(target?.indicator).toEqual(new DOMRect(0, 140, 200, 30));
  });

  it('places groups beside a group near its header edges', () => {
    const { find } = fixture();
    expect(find(100, 142, [], ['group'])?.place).toEqual({ parent: 'root', before: 'h' });
    expect(find(100, 168, [], ['group'])?.place).toEqual({ parent: 'root', before: null });
  });

  it('drops into an expanded group at its start from the header', () => {
    const { find } = fixture();
    expect(find(100, 15)?.place).toEqual({ parent: 'g', before: 'a' });
  });

  it('has no target where nothing accepts the drag', () => {
    const { find } = fixture();
    expect(find(100, 135)).toBeUndefined();
  });

  it('cannot drop a group into itself', () => {
    const { find } = fixture();
    expect(find(20, 50, ['g'], ['group'])?.place).toEqual({ parent: 'root', before: 'h' });
  });
});
