import { createRoot, createSignal } from 'solid-js';
import { describe, expect, it } from 'vitest';

import { createAppMenuItems, topBarMenuSlots } from '../src/editor/app-menu';
import { coreActionContribution } from '../src/editor/actions/coreActionContribution';
import type { EditorCommand } from '../src/editor/commands';
import { coreCommandContribution } from '../src/editor/commands/coreCommandContribution';
import { defaultSettings } from '../src/editor/defaults';
import type { EditorContribution, EditorKernel, UiService } from '../src/editor/kernel';
import { createSvgDocument } from '../src/editor/svg-document';
import type { EditorTab, ModalId } from '../src/editor/types';
import { coreTopBarMenuContribution } from '../src/features/chrome/topBarMenuContribution';
import { createEditorKernel } from '../src/features/shell/createEditorKernel';
import { createDefaultRoot, findNode } from '../src/svg-model';

describe('app menu contributions', () => {
  it('projects sorted runnable action and link items from installed contributions', () => {
    createRoot((dispose) => {
      const runs: string[] = [];
      const actions = {
        id: 'test.actions',
        actions: [
          {
            id: 'test.enabled',
            label: 'Enabled action',
            run: () => runs.push('enabled')
          },
          {
            id: 'test.disabled',
            label: 'Disabled action',
            isEnabled: () => false,
            run: () => runs.push('disabled')
          }
        ]
      } satisfies EditorContribution;
      const menus = {
        id: 'test.app-menus',
        appMenus: [
          {
            kind: 'action',
            id: 'test.second',
            slot: topBarMenuSlots.more,
            actionId: 'test.enabled',
            labelFor: () => 'Dynamic label',
            order: 20
          },
          {
            kind: 'link',
            id: 'test.link',
            slot: topBarMenuSlots.more,
            label: 'External docs',
            href: 'https://example.com',
            target: '_blank',
            rel: 'noreferrer',
            order: 30
          },
          {
            kind: 'action',
            id: 'test.first',
            slot: topBarMenuSlots.more,
            actionId: 'test.disabled',
            order: 10
          },
          {
            kind: 'action',
            id: 'test.hidden',
            slot: topBarMenuSlots.more,
            actionId: 'test.enabled',
            isVisible: () => false
          }
        ]
      } satisfies EditorContribution;
      const items = createAppMenuItems(createKernelFixture([actions, menus]), topBarMenuSlots.more);

      expect(items.map((item) => item.id)).toEqual(['test.first', 'test.second', 'test.link']);
      expect(items[0]).toMatchObject({
        kind: 'action',
        label: 'Disabled action',
        displayLabel: 'Disabled action',
        enabled: false
      });
      expect(items[1]).toMatchObject({
        kind: 'action',
        label: 'Enabled action',
        displayLabel: 'Dynamic label',
        enabled: true
      });
      expect(items[2]).toMatchObject({
        kind: 'link',
        label: 'External docs',
        href: 'https://example.com',
        target: '_blank',
        rel: 'noreferrer'
      });

      expect(items[0]?.kind === 'action' ? items[0].run() : false).toBe(false);
      expect(items[1]?.kind === 'action' ? items[1].run() : false).toBe(true);
      expect(runs).toEqual(['enabled']);

      dispose();
    });
  });

  it('runs registered-command app menu items through the command registry', () => {
    createRoot((dispose) => {
      const dispatched: EditorCommand[] = [];
      const contribution = {
        id: 'test.command-menu',
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
        appMenus: [
          {
            kind: 'registered-command',
            id: 'test.enabled-item',
            slot: topBarMenuSlots.more,
            commandId: 'test.enabled-command',
            labelFor: () => 'Dynamic command label',
            order: 10
          },
          {
            kind: 'registered-command',
            id: 'test.disabled-item',
            slot: topBarMenuSlots.more,
            commandId: 'test.disabled-command',
            order: 20
          },
          {
            kind: 'registered-command',
            id: 'test.missing-item',
            slot: topBarMenuSlots.more,
            commandId: 'test.missing-command',
            order: 30
          }
        ]
      } satisfies EditorContribution;
      const items = createAppMenuItems(createKernelFixture([contribution], { dispatch: (command) => dispatched.push(command) }));

      expect(items.map((item) => ({ id: item.id, enabled: item.kind === 'action' ? item.enabled : true }))).toEqual([
        { id: 'test.enabled-item', enabled: true },
        { id: 'test.disabled-item', enabled: false },
        { id: 'test.missing-item', enabled: false }
      ]);
      expect(items[0]).toMatchObject({
        kind: 'action',
        label: 'Enabled command',
        displayLabel: 'Dynamic command label'
      });
      expect(items.find((item) => item.id === 'test.enabled-item')?.kind === 'action'
        ? items.find((item) => item.id === 'test.enabled-item')?.run()
        : false).toBe(true);
      expect(items.find((item) => item.id === 'test.disabled-item')?.kind === 'action'
        ? items.find((item) => item.id === 'test.disabled-item')?.run()
        : false).toBe(false);
      expect(items.find((item) => item.id === 'test.missing-item')?.kind === 'action'
        ? items.find((item) => item.id === 'test.missing-item')?.run()
        : false).toBe(false);
      expect(dispatched.map((command) => command.id)).toEqual(['test.enabled-command']);

      dispose();
    });
  });

  it('projects core top bar items through registered actions and commands', () => {
    createRoot((dispose) => {
      const calls: string[] = [];
      const modals: ModalId[] = [];
      const dispatched: EditorCommand[] = [];
      const kernel = createKernelFixture([coreActionContribution, coreCommandContribution, coreTopBarMenuContribution], {
        ui: {
          svgImport: {
            dropActive: () => false,
            setInputRef: () => undefined,
            openDialog: () => calls.push('import'),
            onFile: () => undefined,
            onDragEnter: () => undefined,
            onDragOver: () => undefined,
            onDragLeave: () => undefined,
            onDrop: () => undefined
          },
          downloadSvg: () => calls.push('save'),
          modal: {
            active: () => undefined,
            open: (modal) => modals.push(modal),
            close: () => undefined
          },
          copySvgText: () => calls.push('copy')
        },
        dispatch: (command) => dispatched.push(command)
      });
      const moreItems = createAppMenuItems(kernel, topBarMenuSlots.more);
      const primaryItems = createAppMenuItems(kernel, topBarMenuSlots.primary);
      const tabItems = createAppMenuItems(kernel, topBarMenuSlots.tabs);
      const fileItems = createAppMenuItems(kernel, topBarMenuSlots.file);

      expect(moreItems.map((item) => item.id)).toEqual([
        'topbar.more.command-palette',
        'topbar.more.shortcuts',
        'topbar.more.about',
        'topbar.more.donate',
        'topbar.more.repository',
        'topbar.more.website'
      ]);
      expect(primaryItems.map((item) => item.id)).toEqual([
        'topbar.primary.settings',
        'topbar.primary.undo',
        'topbar.primary.redo',
        'topbar.primary.optimize'
      ]);
      expect(tabItems.map((item) => item.id)).toEqual(['topbar.tabs.new-tab']);
      expect(fileItems.map((item) => item.id)).toEqual([
        'topbar.file.import',
        'topbar.file.save-svg',
        'topbar.file.copy-svg',
        'topbar.file.export'
      ]);

      expect(primaryItems.find((item) => item.id === 'topbar.primary.undo')).toMatchObject({
        kind: 'action',
        enabled: false
      });
      expect(primaryItems.find((item) => item.id === 'topbar.primary.optimize')?.displayLabel).toBe('7 B');
      expect(primaryItems.find((item) => item.id === 'topbar.primary.optimize')?.kind === 'action'
        ? primaryItems.find((item) => item.id === 'topbar.primary.optimize')?.run()
        : false).toBe(true);
      expect(fileItems.find((item) => item.id === 'topbar.file.import')?.kind === 'action'
        ? fileItems.find((item) => item.id === 'topbar.file.import')?.run()
        : false).toBe(true);
      expect(fileItems.find((item) => item.id === 'topbar.file.save-svg')?.kind === 'action'
        ? fileItems.find((item) => item.id === 'topbar.file.save-svg')?.run()
        : false).toBe(true);
      expect(fileItems.find((item) => item.id === 'topbar.file.copy-svg')?.kind === 'action'
        ? fileItems.find((item) => item.id === 'topbar.file.copy-svg')?.run()
        : false).toBe(true);
      expect(moreItems.find((item) => item.id === 'topbar.more.command-palette')?.kind === 'action'
        ? moreItems.find((item) => item.id === 'topbar.more.command-palette')?.run()
        : false).toBe(true);
      expect(calls).toEqual(['import', 'save', 'copy']);
      expect(modals).toEqual(['command-palette']);
      expect(dispatched.map((command) => command.id)).toEqual(['svg.optimize']);

      dispose();
    });
  });
});

function createKernelFixture(
  contributions: readonly EditorContribution[],
  overrides: {
    readonly dispatch?: (command: EditorCommand) => void;
    readonly ui?: Partial<UiService>;
  } = {}
): EditorKernel {
  const root = createDefaultRoot();
  const document = createSvgDocument(root);
  const tab = {
    id: 'tab-1',
    name: 'Menu.svg',
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
      selectedIds: () => [root.id],
      selectedTargets: () => [{ kind: 'node', nodeId: root.id }],
      selectedPathAnchor: () => undefined,
      selectedNodes: () => [root],
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
    ui: {
      ...overrides.ui
    },
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
