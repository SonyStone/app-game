import { describe, expect, it } from 'vitest';
import {
  closePanel,
  createDockState,
  type DockState,
  findPanelGroup,
  listGroups,
  moveGroup,
  movePanel,
  nodeLimits,
  normalizeDockState,
  openPanel,
  resizeWeights,
  sameMoveResult,
  wouldChangeLayout
} from '../src/state';

function layout(): DockState {
  return createDockState({
    id: 'root',
    row: [
      { id: 'left', group: ['explorer', 'search'] },
      {
        id: 'right',
        column: [
          { id: 'editor', group: ['main'] },
          { id: 'bottom', group: ['console', 'problems'] }
        ],
        sizes: [3, 1]
      }
    ],
    sizes: [1, 3]
  });
}

/** Compact tree notation: `row(a,b)`, groups as `[p1 p2]`. */
function describeTree(state: DockState, id = state.root): string {
  const node = state.nodes[id];
  if (!node) {
    return '?';
  }
  if (node.type === 'group') {
    return `[${node.panels.join(' ')}]`;
  }
  return `${node.direction}(${node.children.map((child) => describeTree(state, child)).join(',')})`;
}

describe('createDockState', () => {
  it('builds a normalized tree with the given ids', () => {
    const state = layout();

    expect(describeTree(state)).toBe('row([explorer search],column([main],[console problems]))');
    expect(state.nodes.right).toMatchObject({ sizes: [3, 1] });
    expect(listGroups(state)).toEqual(['left', 'editor', 'bottom']);
  });
});

describe('movePanel', () => {
  it('reorders within a group by index', () => {
    const state = layout();
    movePanel(state, 'explorer', { type: 'group', groupId: 'left', zone: 'center', index: 1 });

    expect(state.nodes.left).toMatchObject({ panels: ['search', 'explorer'], active: 'explorer' });
  });

  it('moves into another group and removes the emptied source group', () => {
    const state = layout();
    movePanel(state, 'main', { type: 'group', groupId: 'bottom', zone: 'center', index: 0 });

    expect(describeTree(state)).toBe('row([explorer search],[main console problems])');
    expect(state.nodes.editor).toBeUndefined();
    expect(state.nodes.right).toBeUndefined();
  });

  it('splits a group in the parent direction when it matches', () => {
    const state = layout();
    movePanel(state, 'search', { type: 'group', groupId: 'bottom', zone: 'top' });

    expect(describeTree(state)).toBe('row([explorer],column([main],[search],[console problems]))');
    expect(state.nodes.right).toMatchObject({ sizes: [3, 0.5, 0.5] });
  });

  it('wraps the target in a new split for the other direction', () => {
    const state = layout();
    movePanel(state, 'problems', { type: 'group', groupId: 'bottom', zone: 'right' });

    expect(describeTree(state)).toBe('row([explorer search],column([main],row([console],[problems])))');
  });

  it('flattens same-direction splits after a removal', () => {
    const state = createDockState({
      row: [{ group: ['a'] }, { column: [{ row: [{ group: ['b'] }, { group: ['c'] }] }, { group: ['d'] }] }]
    });
    closePanel(state, 'd');

    expect(describeTree(state)).toBe('row([a],[b],[c])');
    const root = state.nodes[state.root];
    expect(root.type === 'split' && root.sizes).toEqual([1, 0.5, 0.5]);
  });

  it('docks to a root edge with a quarter of the space', () => {
    const state = layout();
    movePanel(state, 'console', { type: 'root', edge: 'bottom' });

    expect(describeTree(state)).toBe('column(row([explorer search],column([main],[problems])),[console])');
    const root = state.nodes[state.root];
    expect(root.type === 'split' && root.sizes).toEqual([0.75, 0.25]);
  });

  it('ignores moves that would not change the layout', () => {
    const state = layout();
    const before = JSON.stringify(state);

    movePanel(state, 'main', { type: 'group', groupId: 'editor', zone: 'left' });
    movePanel(state, 'explorer', { type: 'group', groupId: 'left', zone: 'center' });
    movePanel(state, 'missing', { type: 'root', edge: 'left' });

    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('moveGroup', () => {
  it('merges into the target and keeps the moved active panel visible', () => {
    const state = layout();
    state.nodes.left = { type: 'group', panels: ['explorer', 'search'], active: 'search' };
    moveGroup(state, 'left', { type: 'group', groupId: 'editor', zone: 'center' });

    expect(describeTree(state)).toBe('column([main explorer search],[console problems])');
    expect(state.nodes.editor).toMatchObject({ active: 'search' });
  });

  it('moves the group node beside another group', () => {
    const state = layout();
    moveGroup(state, 'bottom', { type: 'group', groupId: 'left', zone: 'bottom' });

    expect(describeTree(state)).toBe('row(column([explorer search],[console problems]),[main])');
    expect(state.nodes.bottom).toBeDefined();
  });
});

describe('openPanel / closePanel', () => {
  it('keeps an empty root group so panels can be opened again', () => {
    const state = createDockState({ group: ['only'] });
    closePanel(state, 'only');

    expect(describeTree(state)).toBe('[]');

    openPanel(state, 'only');
    expect(describeTree(state)).toBe('[only]');
  });

  it('activates the neighbour when closing the active panel', () => {
    const state = layout();
    state.nodes.bottom = { type: 'group', panels: ['console', 'problems'], active: 'problems' };
    closePanel(state, 'problems');

    expect(state.nodes.bottom).toMatchObject({ panels: ['console'], active: 'console' });
  });

  it('activates an already open panel instead of moving it', () => {
    const state = layout();
    openPanel(state, 'problems', { type: 'root', edge: 'left' });

    expect(findPanelGroup(state, 'problems')).toBe('bottom');
    expect(state.nodes.bottom).toMatchObject({ active: 'problems' });
  });
});

describe('normalizeDockState', () => {
  it('repairs hand-edited state', () => {
    const state: DockState = {
      root: 'r',
      nodes: {
        r: { type: 'split', direction: 'row', children: ['a', 'b', 'gone'], sizes: [] },
        a: { type: 'group', panels: ['x', 'y'], active: 'missing' },
        b: { type: 'group', panels: ['y'] },
        orphan: { type: 'group', panels: ['z'] }
      }
    };
    normalizeDockState(state);

    expect(state).toEqual({ root: 'a', nodes: { a: { type: 'group', panels: ['x', 'y'], active: 'x' } } });
  });
});

describe('weight drift', () => {
  it('keeps weights bounded after many moves', () => {
    const state = createDockState({ row: [{ group: ['a', 'b'] }, { group: ['c'] }] });
    for (let step = 0; step < 40; step++) {
      movePanel(state, 'a', { type: 'root', edge: step % 2 ? 'top' : 'left' });
      movePanel(state, 'a', { type: 'group', groupId: findPanelGroup(state, 'c')!, zone: 'center' });
    }

    for (const node of Object.values(state.nodes)) {
      if (node.type === 'split') {
        const average = node.sizes.reduce((sum, size) => sum + size, 0) / node.sizes.length;
        expect(average).toBeGreaterThanOrEqual(1 / 16);
        expect(average).toBeLessThanOrEqual(16);
      }
    }
  });
});

describe('wouldChangeLayout', () => {
  it('detects moves that leave the structure as it is', () => {
    const state = createDockState({ row: [{ group: ['a', 'b'] }, { group: ['c'] }] });
    const panel = (panelId: string) => ({ type: 'panel', panelId }) as const;
    const groupOf = (panelId: string) => findPanelGroup(state, panelId)!;

    expect(wouldChangeLayout(state, panel('c'), { type: 'root', edge: 'right' })).toBe(false);
    expect(wouldChangeLayout(state, panel('c'), { type: 'group', groupId: groupOf('c'), zone: 'left' })).toBe(false);
    expect(
      wouldChangeLayout(state, panel('a'), { type: 'group', groupId: groupOf('a'), zone: 'center', index: 0 })
    ).toBe(false);
    expect(wouldChangeLayout(state, panel('c'), { type: 'root', edge: 'left' })).toBe(true);
    expect(
      wouldChangeLayout(state, panel('a'), { type: 'group', groupId: groupOf('a'), zone: 'center', index: 1 })
    ).toBe(true);
  });

  it('compares a move from the drag-start layout with the current preview', () => {
    const start = createDockState({ row: [{ group: ['a', 'b'] }, { group: ['c'] }] });
    const detached = structuredClone(start);
    closePanel(detached, 'b');

    expect(wouldChangeLayout(detached, { type: 'panel', panelId: 'b' }, { type: 'root', edge: 'left' }, start)).toBe(
      true
    );
  });
});

describe('sameMoveResult', () => {
  it('matches a group edge with the equivalent dock edge', () => {
    const state = createDockState({ row: [{ group: ['a', 'b'] }, { group: ['c', 'd'] }] });
    const right = findPanelGroup(state, 'c')!;
    const moveA = { type: 'panel', panelId: 'a' } as const;

    expect(
      sameMoveResult(state, moveA, { type: 'group', groupId: right, zone: 'right' }, { type: 'root', edge: 'right' })
    ).toBe(true);
    expect(
      sameMoveResult(state, moveA, { type: 'group', groupId: right, zone: 'top' }, { type: 'root', edge: 'top' })
    ).toBe(false);
  });
});

describe('nodeLimits', () => {
  it('combines panel limits through groups and splits', () => {
    const state = createDockState({
      row: [
        { id: 'side', group: ['tree', 'search'] },
        { id: 'main', column: [{ group: ['editor'] }, { group: ['console'] }] }
      ]
    });
    const limits: Record<string, { min: number; max: number }> = {
      tree: { min: 150, max: 400 },
      search: { min: 200, max: Infinity },
      editor: { min: 300, max: Infinity },
      console: { min: 100, max: 500 }
    };
    const panel = (panelId: string) => limits[panelId] ?? { min: 0, max: Infinity };

    expect(nodeLimits(state, 'side', 'width', panel)).toEqual({ min: 200, max: 400 });
    expect(nodeLimits(state, 'main', 'width', panel)).toEqual({ min: 300, max: 500 });
    expect(nodeLimits(state, state.root, 'width', panel)).toEqual({ min: 500, max: 900 });
  });
});

describe('resizeWeights', () => {
  it('converts pixels to weights and clamps to the minimum size', () => {
    expect(resizeWeights([1, 1], 0, 100, 400, 50)).toEqual([1.5, 0.5]);
    expect(resizeWeights([1, 1], 0, 1000, 400, 50)).toEqual([1.75, 0.25]);
    expect(resizeWeights([1, 1], 0, -1000, 400, 50)).toEqual([0.25, 1.75]);
  });

  it('respects per-child limits', () => {
    const limits = [
      { min: 0, max: 250 },
      { min: 120, max: Infinity }
    ] as const;
    expect(resizeWeights([1, 1], 0, 100, 400, 0, limits)).toEqual([1.25, 0.75]);
    expect(
      resizeWeights([1, 1], 0, -100, 400, 0, [
        { min: 150, max: Infinity },
        { min: 0, max: Infinity }
      ])
    ).toEqual([0.75, 1.25]);
  });
});
