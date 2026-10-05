import { describe, expect, it } from 'vitest';
import {
  dockGuides,
  dropZone,
  findDropTarget,
  findGuideDropTarget,
  sameDropTarget,
  type DockGroupGeometry
} from '../src';

const root = { x: 0, y: 0, width: 800, height: 400 };
const groups: DockGroupGeometry[] = [
  {
    id: 'a',
    panels: ['one', 'two'],
    content: { x: 0, y: 30, width: 400, height: 370 },
    tabList: { x: 0, y: 0, width: 400, height: 30 },
    tabs: new Map([
      ['one', { x: 0, y: 0, width: 80, height: 30 }],
      ['two', { x: 80, y: 0, width: 80, height: 30 }]
    ])
  },
  {
    id: 'b',
    panels: ['three'],
    content: { x: 400, y: 30, width: 400, height: 370 },
    tabList: { x: 400, y: 0, width: 400, height: 30 },
    tabs: new Map()
  }
];
const dragOne = { type: 'panel', panelId: 'one', groupId: 'a' } as const;

describe('findDropTarget', () => {
  it('resolves root edges, tab insertion and zones', () => {
    expect(findDropTarget({ x: 4, y: 200 }, dragOne, root, groups)).toEqual({ type: 'root', edge: 'left' });
    expect(findDropTarget({ x: 150, y: 10 }, dragOne, root, groups)).toEqual({
      type: 'group',
      groupId: 'a',
      zone: 'center',
      index: 1
    });
    expect(findDropTarget({ x: 600, y: 215 }, dragOne, root, groups)).toEqual({
      type: 'group',
      groupId: 'b',
      zone: 'center'
    });
    expect(findDropTarget({ x: 780, y: 215 }, dragOne, root, groups)).toEqual({
      type: 'group',
      groupId: 'b',
      zone: 'right'
    });
  });

  it('ignores drops that would not change the layout', () => {
    expect(findDropTarget({ x: 200, y: 215 }, dragOne, root, groups)).toBeUndefined();
    expect(findDropTarget({ x: 600, y: 215 }, { type: 'group', groupId: 'b' }, root, groups)).toBeUndefined();
  });
});

describe('findGuideDropTarget', () => {
  it('drops only over guides', () => {
    const [center, left] = dockGuides(groups[1].content!);

    expect(findGuideDropTarget({ x: center.rect.x + 4, y: center.rect.y + 4 }, dragOne, root, groups)).toEqual({
      type: 'group',
      groupId: 'b',
      zone: 'center'
    });
    expect(findGuideDropTarget({ x: left.rect.x + 4, y: left.rect.y + 4 }, dragOne, root, groups)).toEqual({
      type: 'group',
      groupId: 'b',
      zone: 'left'
    });
    expect(findGuideDropTarget({ x: 780, y: 100 }, dragOne, root, groups)).toBeUndefined();
    expect(findGuideDropTarget({ x: 20, y: 200 }, dragOne, root, groups)).toEqual({ type: 'root', edge: 'left' });
  });
});

describe('helpers', () => {
  it('splits a rectangle into zones', () => {
    expect(dropZone(root, { x: 400, y: 200 })).toBe('center');
    expect(dropZone(root, { x: 10, y: 200 })).toBe('left');
    expect(dropZone(root, { x: 400, y: 395 })).toBe('bottom');
  });

  it('compares targets', () => {
    expect(sameDropTarget({ type: 'root', edge: 'left' }, { type: 'root', edge: 'left' })).toBe(true);
    expect(
      sameDropTarget(
        { type: 'group', groupId: 'a', zone: 'center', index: 1 },
        { type: 'group', groupId: 'a', zone: 'center' }
      )
    ).toBe(false);
    expect(sameDropTarget(undefined, undefined)).toBe(true);
  });
});
