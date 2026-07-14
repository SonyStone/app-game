import { createRoot, createSignal } from 'solid-js';
import { describe, expect, it } from 'vitest';

import { coreActionContribution } from '../src/editor/actions/coreActionContribution';
import { createCommandPaletteItems, filterCommandPaletteItems, type CommandPaletteItem } from '../src/editor/command-palette';
import type { EditorCommand } from '../src/editor/commands';
import { coreCommandContribution } from '../src/editor/commands/coreCommandContribution';
import { defaultSettings } from '../src/editor/defaults';
import type { EditorKernel } from '../src/editor/kernel';
import { createSvgDocument } from '../src/editor/svg-document';
import type { EditorTab } from '../src/editor/types';
import { coreShortcutContribution } from '../src/features/shortcuts/shortcutRegistry';
import { createEditorKernel } from '../src/features/shell/createEditorKernel';
import { createElementNode, findNode, resetIdCounter, type SvgElementNode, type SvgNode } from '../src/svg-model';

describe('command palette model', () => {
  it('projects registered actions and commands into runnable palette items', () => {
    createRoot((dispose) => {
      resetIdCounter();
      const rect = createElementNode('rect');
      const root = createElementNode('svg', [], [rect]);
      const dispatched: EditorCommand[] = [];
      const kernel = createKernelFixture(root, [rect.id], {
        dispatch: (command) => {
          dispatched.push(command);
        }
      });
      const items = createCommandPaletteItems(kernel);
      const duplicateCommand = requirePaletteItem(items, 'command', 'svg.duplicate-selection');

      expect(duplicateCommand).toMatchObject({
        kind: 'command',
        id: 'svg.duplicate-selection',
        label: 'Duplicate selection',
        enabled: true,
        shortcutKeys: ['Ctrl+D'],
        durability: { kind: 'operation' }
      });

      expect(duplicateCommand.run()).toBe(true);
      expect(dispatched.map((command) => command.id)).toEqual(['svg.duplicate-selection']);

      dispose();
    });
  });

  it('keeps disabled registered contributions visible but non-runnable', () => {
    createRoot((dispose) => {
      resetIdCounter();
      const rect = createElementNode('rect');
      const root = createElementNode('svg', [], [rect]);
      const kernel = createKernelFixture(root, [root.id]);
      const items = createCommandPaletteItems(kernel);
      const deleteCommand = requirePaletteItem(items, 'command', 'svg.delete-selection');

      expect(deleteCommand.enabled).toBe(false);
      expect(deleteCommand.shortcutKeys).toEqual(['Delete']);
      expect(deleteCommand.run()).toBe(false);

      dispose();
    });
  });

  it('filters palette items by label, id, kind, and shortcut keys', () => {
    createRoot((dispose) => {
      resetIdCounter();
      const rect = createElementNode('rect');
      const root = createElementNode('svg', [], [rect]);
      const items = createCommandPaletteItems(createKernelFixture(root, [rect.id]));

      expect(filterCommandPaletteItems(items, 'duplicate').map((item) => `${item.kind}:${item.id}`)).toEqual([
        'command:svg.duplicate-selection'
      ]);
      expect(filterCommandPaletteItems(items, 'ctrl+d').map((item) => `${item.kind}:${item.id}`)).toEqual([
        'command:svg.duplicate-selection'
      ]);
      expect(filterCommandPaletteItems(items, 'ctrl+k').map((item) => `${item.kind}:${item.id}`)).toEqual([
        'action:command.palette'
      ]);
      expect(filterCommandPaletteItems(items, 'svg.').every((item) => item.kind === 'command')).toBe(true);
      const operationItems = filterCommandPaletteItems(items, 'operation');
      expect(operationItems.length).toBeGreaterThan(0);
      expect(operationItems.every((item) => item.kind === 'command')).toBe(true);

      dispose();
    });
  });
});

function createKernelFixture(
  root: SvgElementNode,
  selectedIds: readonly string[],
  overrides: {
    readonly dispatch?: (command: EditorCommand) => void;
  } = {}
): EditorKernel {
  const document = createSvgDocument(root);
  const tab = {
    id: 'tab-1',
    name: 'Palette.svg',
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
      selectedTargets: () => selectedIds.map((nodeId) => ({ kind: 'node', nodeId })),
      selectedPathAnchor: () => undefined,
      selectedNodes: () => selectedIds.map((nodeId) => findNode(root, nodeId)).filter((node): node is SvgNode => node !== undefined),
      selectNode: () => undefined,
      selectTarget: () => undefined,
      setSelectedIds: () => undefined,
      setSelectedTargets: () => undefined,
      clearSelection: () => undefined,
      selectAll: () => undefined
    },
    commands: {
      canUndo: () => false,
      canRedo: () => false,
      recentEvent: () => undefined,
      events: { listen: () => undefined },
      dispatch: overrides.dispatch ?? (() => undefined),
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
    contributions: [coreActionContribution, coreCommandContribution, coreShortcutContribution]
  });
}

function requirePaletteItem(
  items: readonly CommandPaletteItem[],
  kind: string,
  id: string
): CommandPaletteItem {
  const item = items.find((candidate) => candidate.kind === kind && candidate.id === id);

  if (!item) {
    throw new Error(`Expected palette item ${kind}:${id}`);
  }

  return item;
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
