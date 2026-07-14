import { createRoot, createSignal } from 'solid-js';
import { describe, expect, it } from 'vitest';

import type { EditorCommand } from '../src/editor/commands';
import { coreCommandContribution } from '../src/editor/commands/coreCommandContribution';
import { createContextMenuItems } from '../src/editor/context-menu';
import { defaultSettings } from '../src/editor/defaults';
import type { EditorContribution } from '../src/editor/kernel';
import { isOperationBackedEditorCommand } from '../src/editor/operations';
import {
  nodeSelectionTarget,
  pathAnchorSelectionTarget,
  pathCommandSelectionTarget,
  type SelectionTarget
} from '../src/editor/selection-targets';
import { createSvgDocument } from '../src/editor/svg-document';
import type { EditorTab } from '../src/editor/types';
import { coreContextMenuContribution } from '../src/features/selection/contextMenuContribution';
import { createEditorKernel } from '../src/features/shell/createEditorKernel';
import { createDefaultRoot, createElementNode, findNode, resetIdCounter, type SvgElementNode, type SvgNode } from '../src/svg-model';

describe('context menu contributions', () => {
  it('resolves custom context menu items in contribution order', () => {
    createRoot((dispose) => {
      resetIdCounter();
      const rect = createElementNode('rect');
      const root = createElementNode('svg', [], [rect]);
      const runs: string[] = [];
      const contribution = {
        id: 'test.context-menu',
        contextMenus: [
          {
            id: 'test.second',
            label: 'Second',
            order: 20,
            run: (context) => runs.push(`second:${context.nodeId}`)
          },
          {
            id: 'test.first',
            label: 'First',
            order: 10,
            run: (context) => runs.push(`first:${context.nodeId}`)
          }
        ]
      } satisfies EditorContribution;
      const kernel = createKernelFixture(root, [rect.id], [contribution]);
      const items = createContextMenuItems(kernel, rect.id);

      expect(items.map((item) => item.id)).toEqual(['test.first', 'test.second']);
      expect(items[0]?.run()).toBe(true);
      expect(runs).toEqual([`first:${rect.id}`]);

      dispose();
    });
  });

  it('filters hidden items and prevents disabled items from running', () => {
    createRoot((dispose) => {
      resetIdCounter();
      const rect = createElementNode('rect');
      const root = createElementNode('svg', [], [rect]);
      const runs: string[] = [];
      const contribution = {
        id: 'test.context-menu-states',
        contextMenus: [
          {
            id: 'test.visible',
            label: 'Visible',
            run: () => runs.push('visible')
          },
          {
            id: 'test.hidden',
            label: 'Hidden',
            isVisible: () => false,
            run: () => runs.push('hidden')
          },
          {
            id: 'test.disabled',
            label: 'Disabled',
            isEnabled: () => false,
            run: () => runs.push('disabled')
          }
        ]
      } satisfies EditorContribution;
      const kernel = createKernelFixture(root, [rect.id], [contribution]);
      const items = createContextMenuItems(kernel, rect.id);
      const disabledItem = items.find((item) => item.id === 'test.disabled');

      expect(items.map((item) => item.id)).toEqual(['test.visible', 'test.disabled']);
      expect(disabledItem?.enabled).toBe(false);
      expect(disabledItem?.run()).toBe(false);
      expect(items.find((item) => item.id === 'test.visible')?.run()).toBe(true);
      expect(runs).toEqual(['visible']);

      dispose();
    });
  });

  it('passes typed selection targets into context menu contributions', () => {
    createRoot((dispose) => {
      resetIdCounter();
      const path = createElementNode('path');
      const root = createElementNode('svg', [], [path]);
      const target = pathCommandSelectionTarget(path.id, 2);
      const runs: string[] = [];
      const contribution = {
        id: 'test.target-context-menu',
        contextMenus: [
          {
            id: 'test.target',
            label: 'Target item',
            isVisible: (context) => context.target.kind === 'path-command' && context.target.index === 2,
            run: (context) => runs.push(`${context.nodeId}:${context.target.kind}`)
          }
        ]
      } satisfies EditorContribution;
      const kernel = createKernelFixture(root, [path.id], [contribution]);
      const items = createContextMenuItems(kernel, target);

      expect(items.map((item) => item.id)).toEqual(['test.target']);
      expect(items[0]?.run()).toBe(true);
      expect(runs).toEqual([`${path.id}:path-command`]);

      dispose();
    });
  });

  it('runs action-backed context menu items through the action registry', () => {
    createRoot((dispose) => {
      resetIdCounter();
      const rect = createElementNode('rect');
      const root = createElementNode('svg', [], [rect]);
      const runs: string[] = [];
      const contribution = {
        id: 'test.action-context-menu',
        actions: [
          {
            id: 'test.enabled-action',
            label: 'Enabled action',
            run: () => runs.push('enabled')
          },
          {
            id: 'test.disabled-action',
            label: 'Disabled action',
            isEnabled: () => false,
            run: () => runs.push('disabled')
          }
        ],
        contextMenus: [
          {
            kind: 'action',
            id: 'test.enabled-item',
            label: 'Enabled item',
            actionId: 'test.enabled-action'
          },
          {
            kind: 'action',
            id: 'test.disabled-item',
            label: 'Disabled item',
            actionId: 'test.disabled-action'
          },
          {
            kind: 'action',
            id: 'test.missing-item',
            label: 'Missing item',
            actionId: 'test.missing-action'
          }
        ]
      } satisfies EditorContribution;
      const kernel = createKernelFixture(root, [rect.id], [contribution]);
      const items = createContextMenuItems(kernel, rect.id);

      expect(items.map((item) => ({ id: item.id, enabled: item.enabled }))).toEqual([
        { id: 'test.enabled-item', enabled: true },
        { id: 'test.disabled-item', enabled: false },
        { id: 'test.missing-item', enabled: false }
      ]);
      expect(items.find((item) => item.id === 'test.enabled-item')?.run()).toBe(true);
      expect(items.find((item) => item.id === 'test.disabled-item')?.run()).toBe(false);
      expect(items.find((item) => item.id === 'test.missing-item')?.run()).toBe(false);
      expect(runs).toEqual(['enabled']);

      dispose();
    });
  });

  it('runs registered-command context menu items through the command registry', () => {
    createRoot((dispose) => {
      resetIdCounter();
      const rect = createElementNode('rect');
      const root = createElementNode('svg', [], [rect]);
      const commands: EditorCommand[] = [];
      const contribution = {
        id: 'test.registered-command-context-menu',
        commands: [
          {
            id: 'test.enabled-command',
            label: 'Enabled command',
            durability: { kind: 'operation' },
            createOperations: () => []
          },
          {
            id: 'test.disabled-command',
            label: 'Disabled command',
            durability: { kind: 'operation' },
            isEnabled: () => false,
            createOperations: () => []
          }
        ],
        contextMenus: [
          {
            kind: 'registered-command',
            id: 'test.enabled-item',
            label: 'Enabled item',
            commandId: 'test.enabled-command'
          },
          {
            kind: 'registered-command',
            id: 'test.disabled-item',
            label: 'Disabled item',
            commandId: 'test.disabled-command'
          },
          {
            kind: 'registered-command',
            id: 'test.missing-item',
            label: 'Missing item',
            commandId: 'test.missing-command'
          }
        ]
      } satisfies EditorContribution;
      const kernel = createKernelFixture(root, [rect.id], [contribution], (command) => commands.push(command));
      const items = createContextMenuItems(kernel, rect.id);

      expect(items.map((item) => ({ id: item.id, enabled: item.enabled }))).toEqual([
        { id: 'test.enabled-item', enabled: true },
        { id: 'test.disabled-item', enabled: false },
        { id: 'test.missing-item', enabled: false }
      ]);
      expect(items.find((item) => item.id === 'test.enabled-item')?.run()).toBe(true);
      expect(items.find((item) => item.id === 'test.disabled-item')?.run()).toBe(false);
      expect(items.find((item) => item.id === 'test.missing-item')?.run()).toBe(false);
      expect(commands.map((command) => command.id)).toEqual(['test.enabled-command']);

      dispose();
    });
  });

  it('runs core context menu items through registered commands', () => {
    createRoot((dispose) => {
      resetIdCounter();
      const rect = createElementNode('rect');
      const root = createDefaultRoot();
      const tree = { ...root, children: [rect] } satisfies SvgElementNode;
      const commands: EditorCommand[] = [];
      const kernel = createKernelFixture(
        tree,
        [rect.id],
        [coreCommandContribution, coreContextMenuContribution],
        (command) => commands.push(command)
      );
      const items = createContextMenuItems(kernel, rect.id);

      expect(items.map((item) => item.id)).toEqual([
        'context.duplicate',
        'context.move-up',
        'context.move-down',
        'context.insert-group-after',
        'context.delete'
      ]);

      expect(items.find((item) => item.id === 'context.duplicate')?.run()).toBe(true);
      expect(items.find((item) => item.id === 'context.move-up')?.run()).toBe(true);
      expect(items.find((item) => item.id === 'context.move-down')?.run()).toBe(true);
      expect(items.find((item) => item.id === 'context.delete')?.run()).toBe(true);
      expect(commands.map((command) => command.id)).toEqual([
        'svg.duplicate-selection',
        'svg.move-selection-up',
        'svg.move-selection-down',
        'svg.delete-selection'
      ]);

      expect(items.find((item) => item.id === 'context.insert-group-after')?.run()).toBe(true);
      const insertCommand = commands.find((command) => command.id === 'svg.insert-group-after');
      expect(insertCommand).toBeDefined();
      expect(insertCommand && isOperationBackedEditorCommand(insertCommand) ? insertCommand.resolveOperations(tree) : []).toMatchObject([
        { kind: 'svg.insert-node', parentId: root.id, index: 1 }
      ]);

      dispose();
    });
  });

  it('runs target-specific core path command context menu items', () => {
    createRoot((dispose) => {
      resetIdCounter();
      const path = createElementNode('path', [{ name: 'd', value: 'M 0 0 L 10 20 C 1 2 3 4 5 6' }]);
      const root = createElementNode('svg', [], [path]);
      const target = pathCommandSelectionTarget(path.id, 1);
      const commands: EditorCommand[] = [];
      const selectedTargets: SelectionTarget[] = [];
      let clearCount = 0;
      const kernel = createKernelFixture(
        root,
        [],
        [coreContextMenuContribution],
        (command) => commands.push(command),
        [target],
        (selectionTarget) => selectedTargets.push(selectionTarget),
        () => {
          clearCount += 1;
        }
      );
      const anchorItems = createContextMenuItems(kernel, pathAnchorSelectionTarget(path.id, 2, 'x'));
      const items = createContextMenuItems(kernel, target);

      expect(anchorItems.map((item) => item.id)).toEqual(['context.delete-path-command']);
      expect(items.map((item) => ({ id: item.id, enabled: item.enabled }))).toEqual([
        { id: 'context.delete-path-command', enabled: true }
      ]);
      expect(items[0]?.run()).toBe(true);
      expect(commands.map((command) => command.id)).toEqual(['svg.delete-path-command']);
      expect(
        commands[0] && isOperationBackedEditorCommand(commands[0]) ? commands[0].resolveOperations(root) : []
      ).toEqual([{ kind: 'svg.set-attribute', nodeId: path.id, name: 'd', value: 'M 0 0 C 1 2 3 4 5 6' }]);
      expect(selectedTargets).toEqual([pathCommandSelectionTarget(path.id, 1)]);
      expect(clearCount).toBe(0);

      dispose();
    });
  });
});

function createKernelFixture(
  root: SvgElementNode,
  selectedIds: readonly string[],
  contributions: readonly EditorContribution[],
  dispatch: (command: EditorCommand) => void = () => undefined,
  selectedTargets: readonly SelectionTarget[] = selectedIds.map(nodeSelectionTarget),
  selectTarget: (target: SelectionTarget) => void = () => undefined,
  clearSelection: () => void = () => undefined
) {
  const document = createSvgDocument(root);
  const tab = {
    id: 'tab-1',
    name: 'Context.svg',
    document,
    code: '<svg />',
    dirty: false,
    parseError: undefined
  } satisfies EditorTab;
  const [settings, setSettings] = createSignal(defaultSettings());

  return createEditorKernel({
    documents: {
      tabs: () => [tab],
      activeTabId: () => tab.id,
      setActiveTabId: () => undefined,
      activeTab: () => tab,
      activeDocument: () => document,
      activeRoot: () => root,
      activeSpatialIndex: () => document.spatialIndex,
      activeCode: () => tab.code,
      exportText: () => tab.code,
      elementCount: () => 1,
      applyCode: () => undefined,
      reformatActiveCode: () => undefined,
      createNewTab: () => undefined,
      closeTab: () => undefined,
      importSvgText: () => undefined,
      markActiveTabClean: () => undefined
    },
    selection: {
      selectedIds: () => selectedIds,
      selectedTargets: () => selectedTargets,
      selectedPathAnchor: () => undefined,
      selectedNodes: () => selectedIds.map((nodeId) => findNode(root, nodeId)).filter((node): node is SvgNode => node !== undefined),
      selectNode: () => undefined,
      selectTarget,
      setSelectedIds: () => undefined,
      setSelectedTargets: () => undefined,
      clearSelection,
      selectAll: () => undefined
    },
    commands: {
      canUndo: () => false,
      canRedo: () => false,
      recentEvent: () => undefined,
      events: { listen: () => undefined },
      dispatch,
      beginTransaction: () => undefined,
      updateTransaction: () => undefined,
      commitTransaction: () => undefined,
      cancelTransaction: () => undefined,
      undo: () => undefined,
      redo: () => undefined
    },
    settings: { settings, setSettings },
    viewport: {
      zoom: () => 1,
      viewRect: () => ({ x: 0, y: 0, width: 100, height: 100 }),
      handles: () => [],
      zoomBy: () => undefined,
      centerFrame: () => undefined
    },
    resources: {
      activeResources: () => document.resources,
      activeResourceGraph: () => document.resourceGraph,
      resolveNode: (nodeId) => findNode(root, nodeId)
    },
    input: {
      heldKeys: () => [],
      viewportPointer: () => inactivePointerState
    },
    ui: {},
    contributions
  });
}

const inactivePointerState = {
  pressure: 0,
  pointerId: -1,
  tiltX: 0,
  tiltY: 0,
  width: 0,
  height: 0,
  twist: 0,
  pointerType: null,
  x: 0,
  y: 0,
  isActive: false
} as const;
