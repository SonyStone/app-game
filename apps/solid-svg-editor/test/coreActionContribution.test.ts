import { createRoot, createSignal } from 'solid-js';
import { describe, expect, it } from 'vitest';

import {
  canRunRegisteredAction,
  createRegisteredActionHandlers,
  findRegisteredAction,
  runRegisteredAction
} from '../src/editor/action-registry';
import { coreActionContribution } from '../src/editor/actions/coreActionContribution';
import type { EditorCommand } from '../src/editor/commands';
import { coreCommandContribution } from '../src/editor/commands/coreCommandContribution';
import { createEditorRegistries } from '../src/editor/contributions';
import { defaultSettings } from '../src/editor/defaults';
import type { EditorContribution, EditorKernel, UiService } from '../src/editor/kernel';
import { createSvgDocument } from '../src/editor/svg-document';
import type { EditorTab } from '../src/editor/types';
import { createEditorKernel } from '../src/features/shell/createEditorKernel';
import { createElementNode, findNode, resetIdCounter, type SvgElementNode, type SvgNode } from '../src/svg-model';

describe('core action contribution', () => {
  it('registers built-in user-facing editor actions', () => {
    const registries = createEditorRegistries([coreActionContribution]);

    expect(coreActionContribution.id).toBe('core.actions');
    expect(registries.actions.map((action) => action.id)).toEqual([
      'file.import',
      'file.export',
      'file.save-svg',
      'file.new-tab',
      'edit.undo',
      'edit.redo',
      'edit.copy-svg',
      'edit.select-all',
      'command.palette',
      'view.zoom-in',
      'view.zoom-out',
      'view.reset-zoom',
      'view.toggle-grid',
      'view.toggle-handles',
      'help.settings',
      'help.shortcuts',
      'help.about',
      'help.donate'
    ]);
  });

  it('runs command-targeted extension actions through the command registry', () => {
    createRoot((dispose) => {
      resetIdCounter();
      const root = createElementNode('svg');
      const dispatched: EditorCommand[] = [];
      const contribution = {
        id: 'test.command-action',
        actions: [
          {
            kind: 'command',
            id: 'test.run-command',
            label: 'Run command',
            commandId: 'test.command'
          }
        ],
        commands: [
          {
            id: 'test.command',
            label: 'Command',
            durability: { kind: 'operation' },
            createOperations: () => []
          }
        ]
      } satisfies EditorContribution;
      const kernel = createKernelFixture(root, [], {
        contributions: [contribution],
        dispatch: (command) => {
          dispatched.push(command);
        }
      });

      expect(findRegisteredAction(kernel, 'test.run-command')?.label).toBe('Run command');
      expect(canRunRegisteredAction(kernel, 'test.run-command')).toBe(true);
      expect(runRegisteredAction(kernel, 'test.run-command')).toBe(true);
      expect(dispatched.map((command) => command.id)).toEqual(['test.command']);

      dispose();
    });
  });

  it('disables modal actions when no modal host is installed', () => {
    createRoot((dispose) => {
      resetIdCounter();
      const root = createElementNode('svg');
      const kernel = createKernelFixture(root, []);

      expect(canRunRegisteredAction(kernel, 'file.export')).toBe(false);
      expect(runRegisteredAction(kernel, 'file.export')).toBe(false);
      expect(canRunRegisteredAction(kernel, 'edit.copy-svg')).toBe(false);
      expect(runRegisteredAction(kernel, 'edit.copy-svg')).toBe(false);

      dispose();
    });
  });

  it('runs host and view actions through kernel services', () => {
    createRoot((dispose) => {
      resetIdCounter();
      const root = createElementNode('svg');
      const calls: string[] = [];
      const kernel = createKernelFixture(root, [], {
        ui: {
          svgImport: {
            dropActive: () => false,
            setInputRef: () => undefined,
            openDialog: () => {
              calls.push('import');
            },
            onFile: () => undefined,
            onDragEnter: () => undefined,
            onDragOver: () => undefined,
            onDragLeave: () => undefined,
            onDrop: () => undefined
          },
          downloadSvg: () => {
            calls.push('save');
          },
          modal: {
            active: () => undefined,
            open: (modal) => {
              calls.push(`modal:${modal}`);
            },
            close: () => undefined
          },
          copySvgText: () => {
            calls.push('copy');
          }
        },
        viewport: {
          zoomBy: (factor) => {
            calls.push(factor > 1 ? 'zoom-in' : 'zoom-out');
          },
          centerFrame: () => {
            calls.push('center');
          }
        },
        canUndo: () => true,
        canRedo: () => true,
        undo: () => {
          calls.push('undo');
        },
        redo: () => {
          calls.push('redo');
        }
      });

      expect(canRunRegisteredAction(kernel, 'file.import')).toBe(true);
      expect(runRegisteredAction(kernel, 'file.import')).toBe(true);
      expect(runRegisteredAction(kernel, 'file.save-svg')).toBe(true);
      expect(runRegisteredAction(kernel, 'edit.copy-svg')).toBe(true);
      expect(runRegisteredAction(kernel, 'file.export')).toBe(true);
      expect(runRegisteredAction(kernel, 'command.palette')).toBe(true);
      expect(runRegisteredAction(kernel, 'edit.undo')).toBe(true);
      expect(runRegisteredAction(kernel, 'edit.redo')).toBe(true);
      expect(runRegisteredAction(kernel, 'view.zoom-in')).toBe(true);
      expect(runRegisteredAction(kernel, 'view.zoom-out')).toBe(true);
      expect(runRegisteredAction(kernel, 'view.reset-zoom')).toBe(true);

      expect(calls).toEqual([
        'import',
        'save',
        'copy',
        'modal:export',
        'modal:command-palette',
        'undo',
        'redo',
        'zoom-in',
        'zoom-out',
        'center'
      ]);

      dispose();
    });
  });

  it('creates shortcut-compatible handlers from registered actions', () => {
    createRoot((dispose) => {
      resetIdCounter();
      const rect = createElementNode('rect');
      const root = createElementNode('svg', [], [rect]);
      const calls: string[] = [];
      const kernel = createKernelFixture(root, [rect.id], {
        ui: {
          copySvgText: () => {
            calls.push('copy');
          }
        }
      });
      const handlers = createRegisteredActionHandlers(kernel);

      handlers['edit.copy-svg']?.(new KeyboardEvent('keydown', { key: 'c' }));

      expect(calls).toEqual(['copy']);

      dispose();
    });
  });
});

function createKernelFixture(
  root: SvgElementNode,
  selectedIds: readonly string[],
  serviceOverrides: {
    readonly ui?: Partial<UiService>;
    readonly viewport?: {
      readonly zoomBy?: (factor: number) => void;
      readonly centerFrame?: () => void;
    };
    readonly canUndo?: () => boolean;
    readonly canRedo?: () => boolean;
    readonly undo?: () => void;
    readonly redo?: () => void;
    readonly dispatch?: (command: EditorCommand) => void;
    readonly contributions?: readonly EditorContribution[];
  } = {}
): EditorKernel {
  const document = createSvgDocument(root);
  const tab = {
    id: 'tab-1',
    name: 'Actions.svg',
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
      canUndo: serviceOverrides.canUndo ?? (() => false),
      canRedo: serviceOverrides.canRedo ?? (() => false),
      recentEvent: () => undefined,
      events: { listen: () => undefined },
      dispatch: serviceOverrides.dispatch ?? (() => undefined),
      beginTransaction: () => undefined,
      updateTransaction: () => undefined,
      commitTransaction: () => undefined,
      cancelTransaction: () => undefined,
      undo: serviceOverrides.undo ?? (() => undefined),
      redo: serviceOverrides.redo ?? (() => undefined)
    },
    settings: { settings, setSettings },
    viewport: {
      zoom: () => 1,
      viewRect: () => ({ x: 0, y: 0, width: 100, height: 100 }),
      handles: () => [],
      zoomBy: serviceOverrides.viewport?.zoomBy ?? (() => undefined),
      centerFrame: serviceOverrides.viewport?.centerFrame ?? (() => undefined)
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
    ui: {
      ...serviceOverrides.ui
    },
    contributions: serviceOverrides.contributions ?? [coreActionContribution, coreCommandContribution]
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
