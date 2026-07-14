import type { JSX } from 'solid-js';

import type {
  ContextMenuContributionContext,
  EditorContributionContext,
  ModalRenderContext,
  SvgAttributeControlContext,
  SvgDiagnostic,
  SvgElementContribution
} from '../editor/kernel';
import { currentEditorExtensionApiVersion, type EditorExtensionPackage } from '../editor/extension-packages';
import { toSvgNodeId, type EditorOperation } from '../editor/operations';
import { nodeSelectionTarget, type SelectionTarget } from '../editor/selection-targets';
import type { SvgIcon } from '../editor/svg-icon';
import type { EditorPanelContext } from '../features/panels/panelRegistry';
import type { EditorAppContribution } from '../features/shell/editorAppContributions';
import type { ViewportToolContribution } from '../features/viewport/tools/defaultViewportTools';
import type { ViewportTool } from '../features/viewport/tools/toolRegistry';
import { createElementNode, findNode, getAttribute, type SvgElementNode } from '../svg-model';

type SampleExtensionContribution = Omit<EditorAppContribution, 'tools'> & {
  readonly tools: readonly ViewportToolContribution[];
};

export const sampleExtensionIds = {
  contribution: 'sample.extension',
  svg: 'sample.svg',
  element: 'sampleBadge',
  resourceElement: 'sampleToken',
  panel: 'sample.panel',
  settingsSection: 'sample.settings',
  tool: 'sample.inspect-tool',
  renderer: 'sample.renderer',
  command: 'sample.set-badge-tone',
  action: 'sample.open-guide',
  appMenu: 'sample.menu.set-badge-tone',
  modalAppMenu: 'sample.menu.open-guide',
  contextMenu: 'sample.context.set-badge-tone',
  shortcut: 'sample.shortcut.set-badge-tone',
  modal: 'sample.guide',
  overlay: 'sample.overlay'
} as const;

export const sampleExtensionNodeIdAttribute = 'data-sample-extension-node-id';
export const sampleExtensionResourceKind = 'sample-token';
export const sampleExtensionTokenAttribute = 'sample-token';

const sampleBadgeToneValues = ['info', 'success', 'warning'] as const;
const sampleBadgeToneSet: ReadonlySet<string> = new Set(sampleBadgeToneValues);

const SampleExtensionIcon: SvgIcon = (props) => (
  <svg viewBox="0 0 24 24" {...props}>
    <path
      d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5zM7 9.2v5.6l5 2.8 5-2.8V9.2l-5-2.8z"
      fill="currentColor"
    />
  </svg>
);

const sampleBadgeElement = {
  name: sampleExtensionIds.element,
  defaults: {
    x: '24',
    y: '24',
    width: '96',
    height: '40',
    tone: 'info'
  },
  allowedChildren: [],
  attributes: ['x', 'y', 'width', 'height', 'tone', sampleExtensionTokenAttribute],
  icon: SampleExtensionIcon,
  addable: true,
  addableOrder: -100,
  createNode: () =>
    createElementNode(sampleExtensionIds.element, [
      { name: 'x', value: '24' },
      { name: 'y', value: '24' },
      { name: 'width', value: '96' },
      { name: 'height', value: '40' },
      { name: 'tone', value: 'info' }
    ]),
  getBounds: ({ node }) => ({
    x: numericAttribute(node, 'x', 0),
    y: numericAttribute(node, 'y', 0),
    width: Math.max(0, numericAttribute(node, 'width', 0)),
    height: Math.max(0, numericAttribute(node, 'height', 0))
  }),
  validate: (node) => validateSampleBadgeTone(node)
} satisfies SvgElementContribution;

const sampleTokenElement = {
  name: sampleExtensionIds.resourceElement,
  defaults: {
    id: 'sample-token',
    tone: 'info'
  },
  allowedChildren: [],
  attributes: ['id', 'tone'],
  icon: SampleExtensionIcon,
  resourceKind: sampleExtensionResourceKind,
  createNode: () =>
    createElementNode(sampleExtensionIds.resourceElement, [
      { name: 'id', value: 'sample-token' },
      { name: 'tone', value: 'info' }
    ])
} satisfies SvgElementContribution;

export const sampleExtensionContribution = {
  id: sampleExtensionIds.contribution,
  svg: [
    {
      id: sampleExtensionIds.svg,
      elements: [sampleBadgeElement, sampleTokenElement],
      attributes: [
        { name: 'x', type: 'numeric', defaultValue: '0' },
        { name: 'y', type: 'numeric', defaultValue: '0' },
        { name: 'width', type: 'numeric', defaultValue: '0', numberRange: 'positive' },
        { name: 'height', type: 'numeric', defaultValue: '0', numberRange: 'positive' },
        {
          name: 'tone',
          type: 'enum',
          defaultValue: 'info',
          enumValues: sampleBadgeToneValues,
          control: (context) => <SampleBadgeToneControl context={context} />
        },
        {
          name: sampleExtensionTokenAttribute,
          type: 'href',
          defaultValue: '',
          resourceReferenceKind: sampleExtensionResourceKind
        }
      ]
    }
  ],
  actions: [
    {
      kind: 'modal',
      id: sampleExtensionIds.action,
      label: 'Open sample extension',
      modalId: sampleExtensionIds.modal
    }
  ],
  commands: [
    {
      id: sampleExtensionIds.command,
      label: 'Set sample badge tone',
      durability: { kind: 'operation' },
      isEnabled: (kernel) => selectedSampleBadgeNodeIds(kernel).length > 0,
      createOperations: (kernel) => sampleBadgeToneOperations(selectedSampleBadgeNodeIds(kernel), 'success')
    }
  ],
  appMenus: [
    {
      kind: 'registered-command',
      id: sampleExtensionIds.appMenu,
      slot: 'topbar.more',
      label: 'Set sample badge tone',
      commandId: sampleExtensionIds.command,
      order: 1000
    },
    {
      kind: 'action',
      id: sampleExtensionIds.modalAppMenu,
      slot: 'topbar.more',
      label: 'Sample extension',
      actionId: sampleExtensionIds.action,
      order: 1010
    }
  ],
  contextMenus: [
    {
      kind: 'command',
      id: sampleExtensionIds.contextMenu,
      label: 'Warn sample badge',
      commandId: sampleExtensionIds.command,
      order: 1000,
      isVisible: isSampleBadgeContextTarget,
      createOperations: (context) => sampleBadgeToneOperations([context.nodeId], 'warning')
    }
  ],
  shortcuts: [
    {
      id: sampleExtensionIds.shortcut,
      target: { kind: 'command', id: sampleExtensionIds.command },
      category: 'sample',
      action: 'Set sample badge tone',
      keys: 'Ctrl+Shift+B',
      bindings: [{ key: 'b', ctrl: true, shift: true }]
    }
  ],
  modals: [
    {
      id: sampleExtensionIds.modal,
      render: (context) => <SampleExtensionModal context={context} />
    }
  ],
  tools: [
    {
      id: sampleExtensionIds.tool,
      label: 'Sample inspect tool',
      priority: 5,
      createTool: () => createSampleInspectTool()
    }
  ],
  renderers: [
    {
      id: sampleExtensionIds.renderer,
      label: 'Sample renderer adapter',
      createViewportRenderer: (base) => ({
        ...base,
        selectionTargetFromEventTarget: (target) =>
          sampleSelectionTargetFromEventTarget(target) ?? base.selectionTargetFromEventTarget(target)
      })
    }
  ],
  viewportOverlays: [
    {
      id: sampleExtensionIds.overlay,
      placement: 'html',
      order: 1000,
      render: ({ context }) => <SampleExtensionOverlay context={context} />
    }
  ],
  settingsSections: [
    {
      id: sampleExtensionIds.settingsSection,
      label: 'sample',
      order: 1000,
      render: (context) => <SampleExtensionSettingsSection context={context} />
    }
  ],
  panels: [
    {
      id: sampleExtensionIds.panel,
      label: 'Sample',
      icon: SampleExtensionIcon,
      order: 1000,
      render: (context) => <SampleExtensionPanel context={context} />
    }
  ]
} as const satisfies SampleExtensionContribution;

export const sampleExtensionPackage = {
  manifest: {
    id: 'sample.extension-package',
    name: 'Sample Extension',
    version: '0.1.0',
    editorApiVersion: currentEditorExtensionApiVersion,
    description: 'Reference package for Solid SVG Editor extension surfaces.'
  },
  contributions: [sampleExtensionContribution]
} as const satisfies EditorExtensionPackage<EditorPanelContext>;

function SampleExtensionModal(props: { readonly context: ModalRenderContext<EditorPanelContext> }): JSX.Element {
  const contributionCount = () => props.context.kernel.registries.contributions.length;
  const shortcutInstalled = () =>
    props.context.kernel.registries.shortcuts.some((shortcut) => shortcut.id === sampleExtensionIds.shortcut);

  return (
    <section
      class="grid max-h-[min(560px,calc(100vh-32px))] w-[min(520px,calc(100vw-32px))] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[7px] border border-[var(--border)] bg-[var(--panel)] shadow-[0_20px_60px_#000a]"
      data-testid="sample-extension-modal"
    >
      <header class="flex items-center justify-between gap-3 border-b border-[var(--soft-border)] bg-[var(--panel-2)] px-2.5 py-2">
        <h2 class="m-0 text-[15px]">Sample extension</h2>
        <button
          class="grid h-6.5 min-w-14 place-items-center rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel)] px-2 text-[12px]"
          type="button"
          data-testid="sample-extension-modal-close"
          onClick={props.context.close}
        >
          Close
        </button>
      </header>
      <div class="grid min-h-0 gap-3 overflow-auto p-3 text-[12px]">
        <dl class="m-0 grid grid-cols-[minmax(120px,auto)_minmax(0,1fr)] gap-x-3 gap-y-1">
          <dt class="text-[var(--muted)]">Contributions</dt>
          <dd class="m-0" data-testid="sample-extension-modal-contribution-count">
            {contributionCount()}
          </dd>
          <dt class="text-[var(--muted)]">Shortcut</dt>
          <dd class="m-0" data-testid="sample-extension-modal-shortcut-state">
            {shortcutInstalled() ? 'installed' : 'missing'}
          </dd>
        </dl>
      </div>
    </section>
  );
}

function SampleExtensionPanel(props: { readonly context: EditorPanelContext }): JSX.Element {
  const diagnostics = () =>
    props.context.kernel.documents
      .activeDocument()
      .diagnostics.filter((diagnostic) => diagnostic.source === sampleExtensionIds.svg);

  return (
    <section data-testid="sample-extension-panel">
      <h2>Sample</h2>
      <dl>
        <dt>Document root</dt>
        <dd data-testid="sample-extension-root-name">{props.context.kernel.documents.activeRoot().name}</dd>
        <dt>Sample diagnostics</dt>
        <dd data-testid="sample-extension-diagnostic-count">{diagnostics().length}</dd>
      </dl>
    </section>
  );
}

function SampleExtensionOverlay(props: { readonly context: EditorPanelContext }): JSX.Element {
  const selectedBadges = () => selectedSampleBadgeNodeIds(props.context.kernel);

  return (
    <div data-testid="sample-extension-overlay">
      <span data-testid="sample-extension-selected-count">{selectedBadges().length}</span>
    </div>
  );
}

function SampleExtensionSettingsSection(props: { readonly context: EditorPanelContext }): JSX.Element {
  const installed = () => props.context.kernel.capabilities.svg.getElement(sampleExtensionIds.element) !== undefined;

  return (
    <section data-testid="sample-extension-settings">
      <h3>Sample</h3>
      <p data-testid="sample-extension-capability-state">{installed() ? 'installed' : 'missing'}</p>
    </section>
  );
}

function SampleBadgeToneControl(props: { readonly context: SvgAttributeControlContext }): JSX.Element {
  return (
    <div data-testid="sample-extension-tone-control">
      {sampleBadgeToneValues.map((tone) => (
        <button
          type="button"
          data-testid={`sample-extension-tone-${tone}`}
          aria-pressed={props.context.value === tone}
          onClick={() => props.context.update(tone)}
        >
          {tone}
        </button>
      ))}
    </div>
  );
}

function createSampleInspectTool(): ViewportTool {
  return {
    id: sampleExtensionIds.tool,
    label: 'Sample inspect tool',
    priority: 5,
    onSelectionTargetPointerDown: (target, event) => {
      if (!event.altKey || target.kind !== 'node') {
        return false;
      }

      event.preventDefault();
      return true;
    }
  } satisfies ViewportTool;
}

function sampleSelectionTargetFromEventTarget(target: EventTarget | null): SelectionTarget | undefined {
  if (!(target instanceof Element)) {
    return undefined;
  }

  const element = target.closest(`[${sampleExtensionNodeIdAttribute}]`);
  const nodeId = element?.getAttribute(sampleExtensionNodeIdAttribute);
  return nodeId ? nodeSelectionTarget(nodeId) : undefined;
}

function selectedSampleBadgeNodeIds(context: EditorContributionContext): readonly string[] {
  return context.selection
    .selectedTargets()
    .filter((target): target is Extract<SelectionTarget, { readonly kind: 'node' }> => target.kind === 'node')
    .map((target) => target.nodeId)
    .filter((nodeId) => isSampleBadgeNode(context.documents.activeRoot(), nodeId));
}

function isSampleBadgeContextTarget(context: ContextMenuContributionContext): boolean {
  return context.target.kind === 'node' && isSampleBadgeNode(context.documents.activeRoot(), context.nodeId);
}

function isSampleBadgeNode(root: SvgElementNode, nodeId: string): boolean {
  const node = findNode(root, nodeId);
  return node?.kind === 'element' && node.name === sampleExtensionIds.element;
}

function sampleBadgeToneOperations(
  nodeIds: readonly string[],
  tone: (typeof sampleBadgeToneValues)[number]
): readonly EditorOperation[] {
  return nodeIds.map((nodeId) => ({
    kind: 'svg.set-attribute',
    nodeId: toSvgNodeId(nodeId),
    name: 'tone',
    value: tone
  }));
}

function validateSampleBadgeTone(node: SvgElementNode): readonly SvgDiagnostic[] {
  const tone = getAttribute(node, 'tone', true);

  if (isSampleBadgeTone(tone)) {
    return [];
  }

  return [
    {
      kind: 'contribution.sample-extension.invalid-tone',
      severity: 'warning',
      nodeId: node.id,
      message: `Unsupported sample badge tone: ${tone}`,
      source: sampleExtensionIds.svg,
      data: { tone }
    }
  ];
}

function isSampleBadgeTone(value: string): value is (typeof sampleBadgeToneValues)[number] {
  return sampleBadgeToneSet.has(value);
}

function numericAttribute(node: SvgElementNode, name: string, fallback: number): number {
  const value = Number(getAttribute(node, name, true));
  return Number.isFinite(value) ? value : fallback;
}
