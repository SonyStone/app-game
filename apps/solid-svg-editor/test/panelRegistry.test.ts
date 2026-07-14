import { createSignal } from 'solid-js';
import { createComponent, render } from 'solid-js/web';
import { describe, expect, it } from 'vitest';

import { createSvgCapabilityRegistry } from '../src/editor/capabilities';
import type { EditorCommand } from '../src/editor/commands';
import { createEditorRegistries } from '../src/editor/contributions';
import { defaultSettings } from '../src/editor/defaults';
import { currentEditorExtensionApiVersion } from '../src/editor/extension-packages';
import type {
  EditorInstalledPackage,
  SvgCapabilityContribution,
  SvgNodeRendererAdapter,
  WorkbenchService
} from '../src/editor/kernel';
import { isOperationBackedEditorCommand } from '../src/editor/operations';
import type { SelectionTarget } from '../src/editor/selection-targets';
import { createSvgDocument } from '../src/editor/svg-document';
import { coreSvgCapabilityContribution } from '../src/editor/svg-capabilities/coreSvgContribution';
import type { SvgIcon } from '../src/editor/svg-icon';
import type { EditorTab, PanelId } from '../src/editor/types';
import { createEditorKernel } from '../src/features/shell/createEditorKernel';
import {
  corePanelContribution,
  createEditorPanelRegistry,
  editorPanels,
  getEditorPanel,
  type EditorPanelContribution,
  type EditorPanelContext
} from '../src/features/panels/panelRegistry';
import { EditorSidebar } from '../src/features/panels/EditorSidebar';
import { createDefaultRoot, createElementNode, findNode } from '../src/svg-model';

const TestPanelIcon: SvgIcon = () => null;

describe('panel registry contributions', () => {
  it('installs the core editor panels through a contribution', () => {
    expect(corePanelContribution.id).toBe('core.panels');
    expect(editorPanels.map((panel) => panel.id)).toEqual(['inspector', 'code', 'previews', 'debug']);
    expect(getEditorPanel('missing.panel')).toBe(editorPanels[0]);
  });

  it('appends custom panel contributions in registry order', () => {
    const registry = createEditorPanelRegistry([
      corePanelContribution,
      {
        id: 'test.panels',
        panels: [
          {
            id: 'test.custom-panel',
            label: 'Custom',
            icon: TestPanelIcon,
            render: (context) => (context.kernel.registries.contributions.length > 0 ? null : null)
          }
        ]
      }
    ]);

    expect(registry.contributions.map((contribution) => contribution.id)).toEqual(['core.panels', 'test.panels']);
    expect(registry.panels.map((panel) => panel.id)).toEqual([
      'inspector',
      'code',
      'previews',
      'debug',
      'test.custom-panel'
    ]);
    expect(registry.getPanel('test.custom-panel').label).toBe('Custom');
  });

  it('orders custom panel contributions around core panels when requested', () => {
    const registry = createEditorPanelRegistry([
      corePanelContribution,
      {
        id: 'test.ordered-panels',
        panels: [
          {
            id: 'test.before-core',
            label: 'Before core',
            icon: TestPanelIcon,
            order: 5,
            render: () => null
          },
          {
            id: 'test.between-code-and-previews',
            label: 'Between code and previews',
            icon: TestPanelIcon,
            order: 25,
            render: () => null
          },
          {
            id: 'test.unordered',
            label: 'Unordered',
            icon: TestPanelIcon,
            render: () => null
          }
        ]
      }
    ]);

    expect(registry.panels.map((panel) => panel.id)).toEqual([
      'test.before-core',
      'inspector',
      'code',
      'test.between-code-and-previews',
      'previews',
      'debug',
      'test.unordered'
    ]);
  });

  it('renders custom panel contributions in the sidebar tabs', () => {
    const extension = {
      id: 'test.sidebar-panels',
      panels: [
        {
          id: 'test.custom-panel',
          label: 'Custom',
          icon: TestPanelIcon,
          render: () => customPanelElement()
        }
      ]
    } satisfies EditorPanelContribution;
    const [activePanel, setActivePanel] = createSignal<PanelId>('inspector');
    const context = createPanelContext({
      contributions: [corePanelContribution, extension],
      workbench: createWorkbenchFixture(activePanel, setActivePanel)
    });
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(
      () =>
        createComponent(EditorSidebar, {
          kernel: context.kernel
        }),
      container
    );

    requireElement(container, 'panel-tab-test.custom-panel', HTMLButtonElement).click();

    expect(activePanel()).toBe('test.custom-panel');
    expect(container.querySelector('[data-testid="custom-panel"]')?.textContent).toContain('Custom panel');

    dispose();
    container.remove();
  });

  it('renders the code panel from kernel document services', () => {
    const root = createDefaultRoot();
    const svgDocument = createSvgDocument(root);
    const tab = {
      id: 'tab-1',
      name: 'Code.svg',
      document: svgDocument,
      code: '<svg />',
      dirty: false,
      parseError: 'Broken SVG'
    } satisfies EditorTab;
    const [settings, setSettings] = createSignal(defaultSettings());
    let appliedCode = '';
    let reformatted = 0;
    let copied = 0;
    const context = createPanelContext({
      kernel: createEditorKernel<EditorPanelContext>({
        documents: {
          tabs: () => [tab],
          activeTabId: () => tab.id,
          setActiveTabId: () => undefined,
          activeTab: () => tab,
          activeDocument: () => svgDocument,
          activeRoot: () => root,
          activeSpatialIndex: () => svgDocument.spatialIndex,
          activeCode: () => tab.code,
          exportText: () => tab.code,
          elementCount: () => 1,
          applyCode: (text) => {
            appliedCode = text;
          },
          reformatActiveCode: () => {
            reformatted += 1;
          },
          createNewTab: () => undefined,
          closeTab: () => undefined,
          importSvgText: () => undefined,
          markActiveTabClean: () => undefined
        },
        selection: {
          selectedIds: () => [],
          selectedTargets: () => [],
          selectedPathAnchor: () => undefined,
          selectedNodes: () => [],
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
          dispatch: () => undefined,
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
          activeResources: () => svgDocument.resources,
          activeResourceGraph: () => svgDocument.resourceGraph,
          resolveNode: (nodeId) => findNode(root, nodeId)
        },
        input: {
          heldKeys: () => [],
          viewportPointer: () => inactivePointerState
        },
        ui: {
          copySvgText: () => {
            copied += 1;
          }
        }
      }),
    });
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(() => getEditorPanel('code').render(context), container);

    const textarea = requireElement(container, 'svg-code-textarea', HTMLTextAreaElement);
    expect(textarea.value).toBe('<svg />');
    expect(container.querySelector('[data-testid="code-error-bar"]')?.textContent).toContain('Broken SVG');

    textarea.value = '<svg><rect /></svg>';
    textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
    requireElement(container, 'code-format-pretty-button', HTMLButtonElement).click();
    requireElement(container, 'code-format-compact-button', HTMLButtonElement).click();
    requireElement(container, 'code-copy-button', HTMLButtonElement).click();

    expect(appliedCode).toBe('<svg><rect /></svg>');
    expect(reformatted).toBe(2);
    expect(copied).toBe(1);

    dispose();
    container.remove();
  });

  it('renders preview selections from kernel selection services', () => {
    const rect = createElementNode('rect');
    const root = createElementNode('svg', [], [rect]);
    const svgDocument = createSvgDocument(root);
    const [settings, setSettings] = createSignal(defaultSettings());
    const context = createPanelContext({
      kernel: createEditorKernel<EditorPanelContext>({
        documents: {
          tabs: () => [],
          activeTabId: () => '',
          setActiveTabId: () => undefined,
          activeTab: () => undefined,
          activeDocument: () => svgDocument,
          activeRoot: () => root,
          activeSpatialIndex: () => svgDocument.spatialIndex,
          activeCode: () => '',
          exportText: () => '<svg><rect /></svg>',
          elementCount: () => 2,
          applyCode: () => undefined,
          reformatActiveCode: () => undefined,
          createNewTab: () => undefined,
          closeTab: () => undefined,
          importSvgText: () => undefined,
          markActiveTabClean: () => undefined
        },
        selection: {
          selectedIds: () => [rect.id],
          selectedTargets: () => [{ kind: 'node', nodeId: rect.id }],
          selectedPathAnchor: () => undefined,
          selectedNodes: () => [rect],
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
          dispatch: () => undefined,
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
          activeResources: () => svgDocument.resources,
          activeResourceGraph: () => svgDocument.resourceGraph,
          resolveNode: (nodeId) => findNode(root, nodeId)
        },
        input: {
          heldKeys: () => [],
          viewportPointer: () => inactivePointerState
        },
        ui: {}
      })
    });
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(() => getEditorPanel('previews').render(context), container);

    expect(container.querySelector(`[data-testid="selected-preview-tile-${rect.id}"]`)).toBeInstanceOf(HTMLElement);

    dispose();
    container.remove();
  });

  it('renders previews through the kernel SVG node renderer service', () => {
    const rect = createElementNode('rect');
    const root = createElementNode('svg', [], [rect]);
    const svgDocument = createSvgDocument(root);
    const [settings, setSettings] = createSignal(defaultSettings());
    const svgNodeRenderer = {
      renderNode: (props) => customPreviewElement(props.node.id)
    } satisfies SvgNodeRendererAdapter;
    const context = createPanelContext({
      kernel: createEditorKernel<EditorPanelContext>({
        documents: {
          tabs: () => [],
          activeTabId: () => '',
          setActiveTabId: () => undefined,
          activeTab: () => undefined,
          activeDocument: () => svgDocument,
          activeRoot: () => root,
          activeSpatialIndex: () => svgDocument.spatialIndex,
          activeCode: () => '',
          exportText: () => '<svg><rect /></svg>',
          elementCount: () => 2,
          applyCode: () => undefined,
          reformatActiveCode: () => undefined,
          createNewTab: () => undefined,
          closeTab: () => undefined,
          importSvgText: () => undefined,
          markActiveTabClean: () => undefined
        },
        selection: {
          selectedIds: () => [rect.id],
          selectedTargets: () => [{ kind: 'node', nodeId: rect.id }],
          selectedPathAnchor: () => undefined,
          selectedNodes: () => [rect],
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
          dispatch: () => undefined,
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
          activeResources: () => svgDocument.resources,
          activeResourceGraph: () => svgDocument.resourceGraph,
          resolveNode: (nodeId) => findNode(root, nodeId)
        },
        rendering: {
          svgNodeRenderer,
          viewportRenderer: undefined
        },
        input: {
          heldKeys: () => [],
          viewportPointer: () => inactivePointerState
        },
        ui: {}
      })
    });
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(() => getEditorPanel('previews').render(context), container);

    expect(container.querySelector(`[data-testid="kernel-preview-renderer-${rect.id}"]`)).toBeInstanceOf(SVGElement);

    dispose();
    container.remove();
  });

  it('renders extension registry diagnostics in the debug panel', () => {
    const first = {
      id: 'test.duplicate',
      actions: [
        {
          id: 'test.same-action',
          label: 'Same action',
          run: () => undefined
        }
      ]
    } satisfies EditorPanelContribution;
    const second = {
      id: 'test.duplicate',
      actions: [
        {
          id: 'test.same-action',
          label: 'Same action again',
          run: () => undefined
        }
      ]
    } satisfies EditorPanelContribution;
    const context = createPanelContext({
      contributions: [first, second],
      installedPackages: [
        {
          manifest: {
            id: 'test.package',
            name: 'Test Package',
            version: '1.0.0',
            editorApiVersion: currentEditorExtensionApiVersion
          },
          contributionIds: [first.id, second.id]
        }
      ]
    });
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(() => getEditorPanel('debug').render(context), container);

    expect(container.querySelector('[data-testid="debug-contribution-count"]')?.textContent).toBe('2');
    expect(container.querySelector('[data-testid="debug-contribution-source-count"]')?.textContent).toBe('2');
    expect(container.querySelector('[data-testid="debug-contribution-sources"]')?.textContent).toContain(
      'test.duplicate from direct install'
    );
    expect(container.querySelector('[data-testid="debug-registry-health-status"]')?.textContent).toBe('error');
    expect(container.querySelector('[data-testid="debug-registry-health-packages"]')?.textContent).toBe(
      '1 active / 0 disabled / 0 blocked'
    );
    expect(container.querySelector('[data-testid="debug-registry-health-issues"]')?.textContent).toBe('2 errors / 0 warnings');
    expect(container.querySelector('[data-testid="debug-package-count"]')?.textContent).toBe('1');
    expect(container.querySelector('[data-testid="debug-installed-packages"]')?.textContent).toContain(
      'Test Package 1.0.0'
    );
    expect(container.querySelector('[data-testid="debug-installed-packages"]')?.textContent).toContain('status active');
    expect(container.querySelector('[data-testid="debug-installed-packages"]')?.textContent).toContain(
      'test.package - api 1 - contributes test.duplicate, test.duplicate'
    );
    expect(container.querySelector('[data-testid="debug-installed-packages"]')?.textContent).toContain(
      'compatibility compatible - Targets current editor extension API 1.'
    );
    expect(container.querySelector('[data-testid="debug-installed-packages"]')?.textContent).toContain('migrations none');
    expect(container.querySelector('[data-testid="debug-installed-packages"]')?.textContent).toContain('updates none');
    expect(container.querySelector('[data-testid="debug-installed-packages"]')?.textContent).toContain(
      'depends on none'
    );
    expect(container.querySelector('[data-testid="debug-installed-packages"]')?.textContent).toContain('load order 1');
    expect(container.querySelector('[data-testid="debug-installed-packages"]')?.textContent).toContain('required by none');
    expect(container.querySelector('[data-testid="debug-registry-issue-count"]')?.textContent).toBe('2');
    expect(container.querySelector('[data-testid="debug-registry-issues"]')?.textContent).toContain(
      'Duplicate contribution "test.duplicate".'
    );
    expect(container.querySelector('[data-testid="debug-registry-issues"]')?.textContent).toContain(
      'Sources: test.duplicate (direct install), test.duplicate (direct install).'
    );
    expect(container.querySelector('[data-testid="debug-registry-issues"]')?.textContent).toContain(
      'Duplicate actions item "test.same-action".'
    );
    expect(container.querySelector('[data-testid="debug-registry-issues"]')?.textContent).toContain(
      'Declared by: test.duplicate (direct install), test.duplicate (direct install).'
    );
    expect(container.querySelector('[data-testid="debug-registry-issues"]')?.textContent).toContain(
      'Give each installed contribution a unique id.'
    );
    expect(container.querySelector('[data-testid="debug-registry-issues"]')?.textContent).toContain(
      'Rename or remove duplicate actions items before publishing the extension.'
    );

    dispose();
    container.remove();
  });

  it('routes inspector add-element intent through kernel commands and selection', () => {
    const extension = {
      id: 'test.svg',
      elements: [
        {
          name: 'badge',
          defaults: { tone: 'warm' },
          attributes: ['tone'],
          addable: true,
          addableOrder: -1
        }
      ]
    } satisfies SvgCapabilityContribution;
    const capabilities = createSvgCapabilityRegistry([coreSvgCapabilityContribution, extension]);
    const root = capabilities.createElement('svg');
    const svgDocument = createSvgDocument(root, capabilities);
    const [settings, setSettings] = createSignal(defaultSettings());
    const commands: EditorCommand[] = [];
    let selectedTargets: readonly SelectionTarget[] = [];
    const context = createPanelContext({
      kernel: createEditorKernel<EditorPanelContext>({
        documents: {
          tabs: () => [],
          activeTabId: () => '',
          setActiveTabId: () => undefined,
          activeTab: () => undefined,
          activeDocument: () => svgDocument,
          activeRoot: () => root,
          activeSpatialIndex: () => svgDocument.spatialIndex,
          activeCode: () => '',
          exportText: () => '',
          elementCount: () => 1,
          applyCode: () => undefined,
          reformatActiveCode: () => undefined,
          createNewTab: () => undefined,
          closeTab: () => undefined,
          importSvgText: () => undefined,
          markActiveTabClean: () => undefined
        },
        selection: {
          selectedIds: () => [],
          selectedTargets: () => [],
          selectedPathAnchor: () => undefined,
          selectedNodes: () => [],
          selectNode: () => undefined,
          selectTarget: () => undefined,
          setSelectedIds: () => undefined,
          setSelectedTargets: (targets) => {
            selectedTargets = targets;
          },
          clearSelection: () => undefined,
          selectAll: () => undefined
        },
        commands: {
          canUndo: () => false,
          canRedo: () => false,
          recentEvent: () => undefined,
          events: { listen: () => undefined },
          dispatch: (command) => {
            commands.push(command);
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
          activeResources: () => svgDocument.resources,
          activeResourceGraph: () => svgDocument.resourceGraph,
          resolveNode: (nodeId) => findNode(root, nodeId)
        },
        capabilities: {
          svg: capabilities
        },
        input: {
          heldKeys: () => [],
          viewportPointer: () => inactivePointerState
        },
        ui: {}
      })
    });
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(() => getEditorPanel('inspector').render(context), container);

    requireElement(container, 'add-element-button', HTMLButtonElement).click();
    requireElement(container, 'add-element-option-badge', HTMLButtonElement).click();

    const command = commands[0];
    const operations = command && isOperationBackedEditorCommand(command) ? command.resolveOperations(root) : [];

    expect(command?.id).toBe('svg.add-element');
    expect(operations).toMatchObject([
      {
        kind: 'svg.insert-node',
        parentId: root.id,
        node: { kind: 'element', name: 'badge' }
      }
    ]);
    expect(selectedTargets).toEqual([
      {
        kind: 'node',
        nodeId: operations[0]?.kind === 'svg.insert-node' ? operations[0].node.id : ''
      }
    ]);

    dispose();
    container.remove();
  });
});

function createPanelContext(
  overrides: Partial<EditorPanelContext> & {
    readonly contributions?: readonly EditorPanelContribution[];
    readonly installedPackages?: readonly EditorInstalledPackage[];
    readonly workbench?: WorkbenchService;
  } = {}
): EditorPanelContext {
  const root = createDefaultRoot();
  const svgDocument = createSvgDocument(root);
  const [settings, setSettings] = createSignal(defaultSettings());

  return {
    kernel:
      overrides.kernel ??
      createEditorKernel<EditorPanelContext>({
        documents: {
          tabs: () => [],
          activeTabId: () => '',
          setActiveTabId: () => undefined,
          activeTab: () => undefined,
          activeDocument: () => svgDocument,
          activeRoot: () => root,
          activeSpatialIndex: () => svgDocument.spatialIndex,
          activeCode: () => '',
          exportText: () => '',
          elementCount: () => 0,
          applyCode: () => undefined,
          reformatActiveCode: () => undefined,
          createNewTab: () => undefined,
          closeTab: () => undefined,
          importSvgText: () => undefined,
          markActiveTabClean: () => undefined
        },
        selection: {
          selectedIds: () => [],
          selectedTargets: () => [],
          selectedPathAnchor: () => undefined,
          selectedNodes: () => [],
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
          dispatch: () => undefined,
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
          activeResources: () => svgDocument.resources,
          activeResourceGraph: () => svgDocument.resourceGraph,
          resolveNode: (nodeId) => findNode(root, nodeId)
        },
        input: {
          heldKeys: () => [],
          viewportPointer: () => inactivePointerState
        },
        ui: {
          ...(overrides.workbench === undefined ? {} : { workbench: overrides.workbench })
        },
        registries: createEditorRegistries<EditorPanelContext>(overrides.contributions ?? [], {
          packages: overrides.installedPackages
        }),
        contributions: overrides.contributions
      }),
    ...overrides
  } satisfies EditorPanelContext;
}

function createWorkbenchFixture(
  activePanel: () => PanelId,
  setActivePanel: (panel: PanelId) => void
): WorkbenchService {
  return {
    activePanel,
    setActivePanel,
    sidebar: {
      width: () => 360,
      onPointerDown: () => undefined,
      onPointerMove: () => undefined,
      onPointerUp: () => undefined
    }
  };
}

function customPreviewElement(nodeId: string): SVGGElement {
  const element = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  element.setAttribute('data-node-id', nodeId);
  element.setAttribute('data-testid', `kernel-preview-renderer-${nodeId}`);
  return element;
}

function customPanelElement(): HTMLElement {
  const element = document.createElement('section');
  element.dataset.testid = 'custom-panel';
  element.textContent = 'Custom panel';
  return element;
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

function requireElement<TElement extends Element>(
  container: HTMLElement,
  testId: string,
  constructor: { new (...args: never[]): TElement }
): TElement {
  const element = container.querySelector(`[data-testid="${testId}"]`);

  if (!(element instanceof constructor)) {
    throw new Error(`Expected element ${testId}`);
  }

  return element;
}
