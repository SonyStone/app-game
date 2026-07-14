import { createRoot, createSignal } from 'solid-js';
import { describe, expect, it } from 'vitest';

import type { EditorCommand } from '../src/editor/commands';
import {
  canRunRegisteredCommand,
  createRegisteredCommand,
  dispatchRegisteredCommand,
  findRegisteredCommand,
  isRegisteredCommandEnabled
} from '../src/editor/command-registry';
import { coreCommandContribution } from '../src/editor/commands/coreCommandContribution';
import { createEditorRegistries } from '../src/editor/contributions';
import { defaultSettings } from '../src/editor/defaults';
import type { CommandContribution, EditorKernel } from '../src/editor/kernel';
import { isOperationBackedEditorCommand } from '../src/editor/operations';
import { nodeSelectionTarget, pathCommandSelectionTarget, type SelectionTarget } from '../src/editor/selection-targets';
import { createSvgDocument } from '../src/editor/svg-document';
import type { EditorTab } from '../src/editor/types';
import { createEditorKernel } from '../src/features/shell/createEditorKernel';
import { createElementNode, createId, findNode, resetIdCounter, type SvgElementNode, type SvgNode } from '../src/svg-model';

describe('core command contribution', () => {
  it('registers built-in document mutation commands', () => {
    const registries = createEditorRegistries([coreCommandContribution]);

    expect(coreCommandContribution.id).toBe('core.commands');
    expect(registries.commands.map((command) => command.id)).toEqual([
      'svg.optimize',
      'svg.delete-selection',
      'svg.duplicate-selection',
      'svg.move-selection-up',
      'svg.move-selection-down'
    ]);
    expect(registries.commands.map((command) => command.durability.kind)).toEqual([
      'operation',
      'operation',
      'operation',
      'operation',
      'operation'
    ]);
  });

  it('creates selection-aware operation-backed commands from the kernel', () => {
    createRoot((dispose) => {
      resetIdCounter();
      const rect = createElementNode('rect');
      const root = createElementNode('svg', [], [rect]);
      const kernel = createKernelFixture(root, [root.id, rect.id]);

      const deleteContribution = requireCommand(kernel, 'svg.delete-selection');
      expect(deleteContribution.durability.kind === 'operation' ? deleteContribution.createOperations(kernel) : []).toEqual([
        { kind: 'svg.remove-node', nodeId: rect.id }
      ]);

      const deleteCommand = createRegisteredCommand(kernel, deleteContribution);
      expect(isOperationBackedEditorCommand(deleteCommand)).toBe(true);
      expect(isOperationBackedEditorCommand(deleteCommand) ? deleteCommand.resolveOperations(root) : []).toEqual([
        { kind: 'svg.remove-node', nodeId: rect.id }
      ]);

      const duplicateContribution = requireCommand(kernel, 'svg.duplicate-selection');
      expect(duplicateContribution.durability.kind === 'operation' ? duplicateContribution.createOperations(kernel) : []).toMatchObject([
        { kind: 'svg.insert-node', parentId: root.id, index: 1 }
      ]);

      const duplicateCommand = createRegisteredCommand(kernel, duplicateContribution);
      expect(isOperationBackedEditorCommand(duplicateCommand)).toBe(true);
      expect(isOperationBackedEditorCommand(duplicateCommand) ? duplicateCommand.resolveOperations(root) : []).toMatchObject([
        { kind: 'svg.insert-node', parentId: root.id, index: 1 }
      ]);

      const moveUpContribution = requireCommand(kernel, 'svg.move-selection-up');
      expect(moveUpContribution.durability.kind === 'operation' ? moveUpContribution.createOperations(kernel) : []).toEqual([
        { kind: 'svg.move-node-in-parent', nodeId: rect.id, direction: -1 }
      ]);

      const moveDownContribution = requireCommand(kernel, 'svg.move-selection-down');
      expect(moveDownContribution.durability.kind === 'operation' ? moveDownContribution.createOperations(kernel) : []).toEqual([
        { kind: 'svg.move-node-in-parent', nodeId: rect.id, direction: 1 }
      ]);

      dispose();
    });
  });

  it('creates an optimize command from kernel settings', () => {
    createRoot((dispose) => {
      resetIdCounter();
      const comment = { id: createId(), kind: 'comment', text: ' remove me ' } satisfies SvgNode;
      const rect = createElementNode('rect', [{ name: 'fill', value: '' }]);
      const root = createElementNode('svg', [], [comment, rect]);
      const kernel = createKernelFixture(root, []);
      const command = createRegisteredCommand(kernel, requireCommand(kernel, 'svg.optimize'));

      expect(command.id).toBe('svg.optimize');
      expect(isOperationBackedEditorCommand(command)).toBe(true);
      expect(command.apply(root).children).toEqual([{ ...rect, attrs: [] }]);

      dispose();
    });
  });

  it('reports registered command enablement from kernel state', () => {
    createRoot((dispose) => {
      resetIdCounter();
      const rect = createElementNode('rect');
      const root = createElementNode('svg', [], [rect]);
      const rootOnlyKernel = createKernelFixture(root, [root.id]);
      const selectedKernel = createKernelFixture(root, [rect.id]);
      const deleteCommand = requireCommand(rootOnlyKernel, 'svg.delete-selection');

      expect(findRegisteredCommand(selectedKernel, 'svg.delete-selection')?.label).toBe('Delete selection');
      expect(isRegisteredCommandEnabled(rootOnlyKernel, deleteCommand)).toBe(false);
      expect(canRunRegisteredCommand(rootOnlyKernel, 'svg.delete-selection')).toBe(false);
      expect(canRunRegisteredCommand(selectedKernel, 'svg.delete-selection')).toBe(true);
      expect(canRunRegisteredCommand(rootOnlyKernel, 'svg.move-selection-up')).toBe(false);
      expect(canRunRegisteredCommand(selectedKernel, 'svg.move-selection-up')).toBe(true);

      dispose();
    });
  });

  it('creates delete commands from selected path-command targets', () => {
    createRoot((dispose) => {
      resetIdCounter();
      const path = createElementNode('path', [{ name: 'd', value: 'M 0 0 L 10 20' }]);
      const root = createElementNode('svg', [], [path]);
      const selectedPathKernel = createKernelFixture(root, [], {
        selectedTargets: [pathCommandSelectionTarget(path.id, 1)]
      });
      const deleteContribution = requireCommand(selectedPathKernel, 'svg.delete-selection');

      expect(canRunRegisteredCommand(selectedPathKernel, 'svg.delete-selection')).toBe(true);
      expect(deleteContribution.durability.kind === 'operation' ? deleteContribution.createOperations(selectedPathKernel) : []).toEqual([
        { kind: 'svg.set-attribute', nodeId: path.id, name: 'd', value: 'M 0 0' }
      ]);

      const deleteCommand = createRegisteredCommand(selectedPathKernel, deleteContribution);

      expect(isOperationBackedEditorCommand(deleteCommand)).toBe(true);
      expect(isOperationBackedEditorCommand(deleteCommand) ? deleteCommand.resolveOperations(root) : []).toEqual([
        { kind: 'svg.set-attribute', nodeId: path.id, name: 'd', value: 'M 0 0' }
      ]);

      dispose();
    });
  });

  it('adds durability reasons to registered legacy commands', () => {
    createRoot((dispose) => {
      resetIdCounter();
      const root = createElementNode('svg');
      const kernel = createKernelFixture(root, []);
      const command = createRegisteredCommand(kernel, {
        id: 'test.legacy-command',
        label: 'Legacy command',
        durability: { kind: 'legacy', reason: 'Plugin command depends on an opaque document mutation.' },
        createCommand: () => ({
          id: 'test.legacy-command',
          label: 'Legacy command',
          apply: (currentRoot) => currentRoot
        })
      });

      expect(command.durability).toEqual({
        kind: 'legacy',
        reason: 'Plugin command depends on an opaque document mutation.'
      });
      dispose();
    });
  });

  it('dispatches enabled registered commands through the kernel command service', () => {
    createRoot((dispose) => {
      resetIdCounter();
      const rect = createElementNode('rect');
      const root = createElementNode('svg', [], [rect]);
      let dispatched: EditorCommand | undefined;
      const kernel = createKernelFixture(root, [rect.id], {
        dispatch: (command) => {
          dispatched = command;
        }
      });

      expect(dispatchRegisteredCommand(kernel, 'svg.delete-selection')).toBe(true);
      expect(dispatched?.id).toBe('svg.delete-selection');
      expect(dispatched && isOperationBackedEditorCommand(dispatched) ? dispatched.resolveOperations(root) : []).toEqual([
        { kind: 'svg.remove-node', nodeId: rect.id }
      ]);

      dispatched = undefined;
      const disabledKernel = createKernelFixture(root, [root.id], {
        dispatch: (command) => {
          dispatched = command;
        }
      });

      expect(dispatchRegisteredCommand(disabledKernel, 'svg.delete-selection')).toBe(false);
      expect(dispatched).toBeUndefined();

      dispose();
    });
  });
});

function createKernelFixture(
  root: SvgElementNode,
  selectedIds: readonly string[],
  overrides: {
    readonly dispatch?: (command: EditorCommand) => void;
    readonly selectedTargets?: readonly SelectionTarget[];
  } = {}
): EditorKernel {
  const document = createSvgDocument(root);
  const tab = {
    id: 'tab-1',
    name: 'Commands.svg',
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
      selectedTargets: () => overrides.selectedTargets ?? selectedIds.map(nodeSelectionTarget),
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
    contributions: [coreCommandContribution]
  });
}

function requireCommand(kernel: EditorKernel, id: CommandContribution['id']): CommandContribution {
  const contribution = kernel.registries.commands.find((command) => command.id === id);

  if (!contribution) {
    throw new Error(`Expected command contribution ${id}`);
  }

  return contribution;
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
