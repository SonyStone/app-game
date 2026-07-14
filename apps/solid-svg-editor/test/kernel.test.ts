import { createRoot, createSignal } from 'solid-js';
import { describe, expect, it } from 'vitest';

import { createEditorRegistries } from '../src/editor/contributions';
import { defaultSettings } from '../src/editor/defaults';
import type {
  EditorContribution,
  SvgCapabilityContribution,
  ViewportRendererAdapter
} from '../src/editor/kernel';
import { createSvgDocument } from '../src/editor/svg-document';
import type { EditorTab } from '../src/editor/types';
import { createEditorKernel } from '../src/features/shell/createEditorKernel';
import { createDefaultRoot, findNode } from '../src/svg-model';

describe('editor kernel contracts', () => {
  it('models editor extensions as typed contributions', () => {
    const svgContribution = {
      id: 'test.basic-shape',
      elements: [
        {
          name: 'testShape',
          defaults: { width: '10', height: '10' },
          allowedChildren: [],
          attributes: ['width', 'height']
        }
      ]
    } satisfies SvgCapabilityContribution;

    const contribution = {
      id: 'test.extension',
      svg: [svgContribution],
      tools: [{ id: 'test.tool', label: 'Test tool', priority: 1 }],
      renderers: [{ id: 'test.renderer', label: 'Test renderer' }]
    } satisfies EditorContribution;

    expect(contribution.svg?.[0]?.elements?.[0]?.name).toBe('testShape');
    expect(contribution.tools?.[0]?.id).toBe('test.tool');
    expect(contribution.renderers?.[0]?.label).toBe('Test renderer');
  });

  it('flattens installed contributions into kernel registries', () => {
    const first = {
      id: 'test.first',
      commands: [
        {
          id: 'test.first-command',
          label: 'First command',
          durability: { kind: 'legacy', reason: 'Test fixture command does not mutate document state.' },
          createCommand: () => ({ id: 'test.first-command', label: 'First command', apply: (root) => root })
        }
      ],
      actions: [
        {
          id: 'test.first-action',
          label: 'First action',
          run: () => undefined
        }
      ],
      shortcuts: [
        {
          id: 'test.first-shortcut',
          target: { kind: 'command', id: 'test.first-command' },
          category: 'Test',
          action: 'First shortcut',
          keys: 'Ctrl+1',
          bindings: [{ key: '1', ctrl: true }]
        }
      ],
      appMenus: [
        {
          kind: 'action',
          id: 'test.first-app-menu',
          slot: 'topbar.more',
          actionId: 'test.first-action'
        }
      ],
      modals: [
        {
          id: 'test.first-modal',
          render: () => null
        }
      ],
      settingsSections: [
        {
          id: 'test.first-settings-section',
          label: 'First settings section',
          render: () => null
        }
      ],
      viewportToolbars: [
        {
          id: 'test.first-toolbar',
          render: () => null
        }
      ],
      viewportOverlays: [
        {
          id: 'test.first-overlay',
          placement: 'svg-world',
          render: () => null
        }
      ],
      viewportLayers: [
        {
          id: 'test.first-layer',
          placement: 'svg-world',
          render: () => null
        }
      ],
      contextMenus: [
        {
          id: 'test.first-context-menu',
          label: 'First context menu',
          run: () => undefined
        }
      ]
    } satisfies EditorContribution;
    const second = {
      id: 'test.second',
      tools: [{ id: 'test.second-tool', label: 'Second tool', priority: 10 }],
      panels: [{ id: 'test.second-panel', label: 'Second panel', render: () => null }],
      svg: [{ id: 'test.second-svg' }],
      renderers: [{ id: 'test.second-renderer', label: 'Second renderer' }]
    } satisfies EditorContribution;

    const registries = createEditorRegistries([first, second]);

    expect(registries.contributions.map((contribution) => contribution.id)).toEqual(['test.first', 'test.second']);
    expect(registries.issues).toEqual([]);
    expect(registries.actions.map((action) => action.id)).toEqual(['test.first-action']);
    expect(registries.commands.map((command) => command.id)).toEqual(['test.first-command']);
    expect(registries.shortcuts.map((shortcut) => shortcut.id)).toEqual(['test.first-shortcut']);
    expect(registries.appMenus.map((item) => item.id)).toEqual(['test.first-app-menu']);
    expect(registries.modals.map((modal) => modal.id)).toEqual(['test.first-modal']);
    expect(registries.settingsSections.map((section) => section.id)).toEqual(['test.first-settings-section']);
    expect(registries.viewportToolbars.map((toolbar) => toolbar.id)).toEqual(['test.first-toolbar']);
    expect(registries.viewportOverlays.map((overlay) => overlay.id)).toEqual(['test.first-overlay']);
    expect(registries.viewportLayers.map((layer) => layer.id)).toEqual(['test.first-layer']);
    expect(registries.contextMenus.map((item) => item.id)).toEqual(['test.first-context-menu']);
    expect(registries.tools.map((tool) => tool.id)).toEqual(['test.second-tool']);
    expect(registries.panels.map((panel) => panel.id)).toEqual(['test.second-panel']);
    expect(registries.svg.map((svg) => svg.id)).toEqual(['test.second-svg']);
    expect(registries.renderers.map((renderer) => renderer.id)).toEqual(['test.second-renderer']);
  });

  it('freezes the installed contribution list at registry creation time', () => {
    const contributions: EditorContribution[] = [{ id: 'test.initial' }];
    const registries = createEditorRegistries(contributions);

    contributions.push({ id: 'test.late' });

    expect(registries.contributions.map((contribution) => contribution.id)).toEqual(['test.initial']);
  });

  it('reports duplicate contribution and registry IDs without dropping entries', () => {
    const first = {
      id: 'test.duplicate',
      actions: [
        {
          id: 'test.run',
          label: 'Run action',
          run: () => undefined
        }
      ],
      commands: [
        {
          id: 'test.run',
          label: 'Run',
          durability: { kind: 'legacy', reason: 'Test fixture command only exercises registry aggregation.' },
          createCommand: () => ({ id: 'test.run', label: 'Run', apply: (root) => root })
        }
      ]
    } satisfies EditorContribution;
    const second = {
      id: 'test.duplicate',
      commands: [
        {
          id: 'test.run',
          label: 'Run again',
          durability: { kind: 'legacy', reason: 'Test fixture command only exercises duplicate diagnostics.' },
          createCommand: () => ({ id: 'test.run', label: 'Run again', apply: (root) => root })
        }
      ],
      panels: [
        {
          id: 'test.panel',
          label: 'Panel',
          render: () => null
        }
      ],
      appMenus: [
        {
          kind: 'action',
          id: 'test.app-menu',
          slot: 'topbar.more',
          actionId: 'test.run'
        },
        {
          kind: 'action',
          id: 'test.app-menu',
          slot: 'topbar.file',
          actionId: 'test.run'
        }
      ],
      modals: [
        {
          id: 'test.modal',
          render: () => null
        },
        {
          id: 'test.modal',
          render: () => null
        }
      ],
      settingsSections: [
        {
          id: 'test.settings-section',
          label: 'Settings section',
          render: () => null
        },
        {
          id: 'test.settings-section',
          label: 'Settings section again',
          render: () => null
        }
      ],
      contextMenus: [
        {
          id: 'test.context-menu',
          label: 'Context menu',
          run: () => undefined
        },
        {
          id: 'test.context-menu',
          label: 'Context menu again',
          run: () => undefined
        }
      ]
    } satisfies EditorContribution;

    const registries = createEditorRegistries([first, second]);

    expect(registries.commands.map((command) => command.label)).toEqual(['Run', 'Run again']);
    expect(registries.panels.map((panel) => panel.id)).toEqual(['test.panel']);
    expect(registries.issues).toEqual([
      { kind: 'duplicate-contribution-id', id: 'test.duplicate', count: 2 },
      {
        kind: 'duplicate-registry-id',
        registry: 'commands',
        id: 'test.run',
        contributionIds: ['test.duplicate', 'test.duplicate']
      },
      {
        kind: 'duplicate-registry-id',
        registry: 'appMenus',
        id: 'test.app-menu',
        contributionIds: ['test.duplicate', 'test.duplicate']
      },
      {
        kind: 'duplicate-registry-id',
        registry: 'modals',
        id: 'test.modal',
        contributionIds: ['test.duplicate', 'test.duplicate']
      },
      {
        kind: 'duplicate-registry-id',
        registry: 'settingsSections',
        id: 'test.settings-section',
        contributionIds: ['test.duplicate', 'test.duplicate']
      },
      {
        kind: 'duplicate-registry-id',
        registry: 'contextMenus',
        id: 'test.context-menu',
        contributionIds: ['test.duplicate', 'test.duplicate']
      }
    ]);
  });

  it('reports legacy command contributions without a durability reason', () => {
    const registries = createEditorRegistries([
      {
        id: 'test.legacy-command',
        commands: [
          {
            id: 'test.legacy-no-reason',
            label: 'Legacy no reason',
            durability: { kind: 'legacy', reason: '   ' },
            createCommand: () => ({ id: 'test.legacy-no-reason', label: 'Legacy no reason', apply: (root) => root })
          }
        ]
      }
    ]);

    expect(registries.issues).toEqual([
      {
        kind: 'invalid-registry-item',
        registry: 'commands',
        id: 'test.legacy-no-reason',
        contributionId: 'test.legacy-command',
        message: 'Legacy command contributions must provide a non-empty durability reason.'
      }
    ]);
  });

  it('reports missing menu and shortcut registry references', () => {
    const registries = createEditorRegistries([
      {
        id: 'test.references',
        actions: [
          {
            kind: 'modal',
            id: 'test.open-missing-modal',
            label: 'Open missing modal',
            modalId: 'test.missing-modal'
          },
          {
            kind: 'command',
            id: 'test.run-missing-command',
            label: 'Run missing command',
            commandId: 'test.missing-command'
          }
        ],
        appMenus: [
          {
            kind: 'action',
            id: 'test.missing-menu-action',
            slot: 'topbar.more',
            actionId: 'test.missing-action'
          },
          {
            kind: 'registered-command',
            id: 'test.missing-menu-command',
            slot: 'topbar.more',
            commandId: 'test.missing-command'
          }
        ],
        contextMenus: [
          {
            kind: 'action',
            id: 'test.missing-context-menu-action',
            label: 'Missing context menu action',
            actionId: 'test.missing-action'
          },
          {
            kind: 'registered-command',
            id: 'test.missing-context-menu-command',
            label: 'Missing context menu command',
            commandId: 'test.missing-command'
          }
        ],
        shortcuts: [
          {
            id: 'test.missing-action-shortcut',
            target: { kind: 'action', id: 'test.missing-action' },
            category: 'Test',
            action: 'Missing action',
            keys: 'Ctrl+1',
            bindings: [{ key: '1', ctrl: true }]
          },
          {
            id: 'test.missing-command-shortcut',
            target: { kind: 'command', id: 'test.missing-command' },
            category: 'Test',
            action: 'Missing command',
            keys: 'Ctrl+2',
            bindings: [{ key: '2', ctrl: true }]
          },
          {
            id: 'test.host-shortcut',
            target: { kind: 'handler', id: 'test.host-handler' },
            category: 'Test',
            action: 'Host handler',
            keys: 'Ctrl+3',
            bindings: [{ key: '3', ctrl: true }]
          }
        ]
      }
    ]);

    expect(registries.issues).toEqual([
      {
        kind: 'missing-registry-reference',
        registry: 'actions',
        id: 'test.open-missing-modal',
        contributionId: 'test.references',
        referencedRegistry: 'modals',
        referencedId: 'test.missing-modal'
      },
      {
        kind: 'missing-registry-reference',
        registry: 'actions',
        id: 'test.run-missing-command',
        contributionId: 'test.references',
        referencedRegistry: 'commands',
        referencedId: 'test.missing-command'
      },
      {
        kind: 'missing-registry-reference',
        registry: 'appMenus',
        id: 'test.missing-menu-action',
        contributionId: 'test.references',
        referencedRegistry: 'actions',
        referencedId: 'test.missing-action'
      },
      {
        kind: 'missing-registry-reference',
        registry: 'appMenus',
        id: 'test.missing-menu-command',
        contributionId: 'test.references',
        referencedRegistry: 'commands',
        referencedId: 'test.missing-command'
      },
      {
        kind: 'missing-registry-reference',
        registry: 'contextMenus',
        id: 'test.missing-context-menu-action',
        contributionId: 'test.references',
        referencedRegistry: 'actions',
        referencedId: 'test.missing-action'
      },
      {
        kind: 'missing-registry-reference',
        registry: 'contextMenus',
        id: 'test.missing-context-menu-command',
        contributionId: 'test.references',
        referencedRegistry: 'commands',
        referencedId: 'test.missing-command'
      },
      {
        kind: 'missing-registry-reference',
        registry: 'shortcuts',
        id: 'test.missing-action-shortcut',
        contributionId: 'test.references',
        referencedRegistry: 'actions',
        referencedId: 'test.missing-action'
      },
      {
        kind: 'missing-registry-reference',
        registry: 'shortcuts',
        id: 'test.missing-command-shortcut',
        contributionId: 'test.references',
        referencedRegistry: 'commands',
        referencedId: 'test.missing-command'
      }
    ]);
  });

  it('assembles a runtime editor kernel from concrete services', () => {
    createRoot((dispose) => {
      const root = createDefaultRoot();
      const document = createSvgDocument(root);
      const tab = {
        id: 'tab-1',
        name: 'Kernel.svg',
        document,
        code: '<svg />',
        dirty: false,
        parseError: undefined
      } satisfies EditorTab;
      const [settings, setSettings] = createSignal(defaultSettings());
      let dispatched = 0;
      const viewportRenderer = {
        measureSelectionBox: () => undefined,
        hitTestMarqueeTargets: () => [],
        selectionTargetFromEventTarget: () => undefined,
        clientRectToViewportOverlay: (rect) => rect,
        viewportClientRect: () => undefined
      } satisfies ViewportRendererAdapter;

      const kernel = createEditorKernel({
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
          dispatch: () => {
            dispatched += 1;
          },
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
        rendering: {
          svgNodeRenderer: undefined,
          viewportRenderer
        },
        input: {
          heldKeys: () => [],
          viewportPointer: () => inactivePointerState
        },
        ui: {},
        contributions: [
          {
            id: 'test.runtime',
            actions: [
              {
                id: 'test.registry-aware-action',
                label: 'Registry-aware action',
                isEnabled: (context) =>
                  context.registries.tools.some((tool) => tool.id === 'test.runtime-tool') &&
                  context.registries.panels.length === 0 &&
                  context.registries.viewportLayers.length === 0 &&
                  context.registries.modals.length === 0 &&
                  context.registries.renderers.length === 0,
                run: () => undefined
              }
            ],
            tools: [{ id: 'test.runtime-tool', label: 'Runtime tool', priority: 1 }]
          }
        ]
      });

      kernel.commands.dispatch({ id: 'test.noop', label: 'Noop', apply: (current) => current });

      expect(kernel.documents.activeDocument()).toBe(document);
      expect(kernel.resources.activeResources()).toBe(document.resources);
      expect(kernel.resources.resolveNode(root.id)).toBe(root);
      expect(kernel.rendering.viewportRenderer).toBe(viewportRenderer);
      expect(kernel.selection.selectedIds()).toEqual([root.id]);
      expect(kernel.registries.tools.map((tool) => tool.id)).toEqual(['test.runtime-tool']);
      expect(
        kernel.registries.actions.find((action) => action.id === 'test.registry-aware-action')?.isEnabled?.(kernel)
      ).toBe(true);
      expect(dispatched).toBe(1);

      dispose();
    });
  });
});

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
