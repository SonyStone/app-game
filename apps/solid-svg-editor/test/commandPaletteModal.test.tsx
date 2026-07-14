import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { describe, expect, it } from 'vitest';

import { createEditorRegistries } from '../src/editor/contributions';
import { defaultSettings } from '../src/editor/defaults';
import {
  createExtensionPackageMigrationKey,
  createExtensionPackageUpdateKey,
  currentEditorExtensionApiVersion
} from '../src/editor/extension-packages';
import type { EditorAvailablePackageUpdate, EditorContribution, EditorInstalledPackage } from '../src/editor/kernel';
import { createSvgDocument } from '../src/editor/svg-document';
import type { EditorTab, ModalId } from '../src/editor/types';
import { CommandPaletteModal } from '../src/features/modals/EditorModals';
import { EditorModalStack } from '../src/features/modals/EditorModalStack';
import { coreModalContribution } from '../src/features/modals/modalContribution';
import { coreSettingsSectionContribution } from '../src/features/modals/settingsContribution';
import type { EditorPanelContext } from '../src/features/panels/panelRegistry';
import { createEditorKernel } from '../src/features/shell/createEditorKernel';
import { createDefaultRoot, findNode } from '../src/svg-model';

describe('CommandPaletteModal', () => {
  it('filters and runs registered action contributions from the kernel', () => {
    let runs = 0;
    let closes = 0;
    const extension = createMagicExtension(() => {
      runs += 1;
    });
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(
      () => (
        <CommandPaletteModal
          kernel={createKernelFixture([extension])}
          close={() => {
            closes += 1;
          }}
        />
      ),
      container
    );

    updateInput(container, 'command-palette-search', 'magic');

    const item = requireElement(container, 'command-palette-item-action-test-magic-action');

    expect(item.textContent).toContain('Magic action');
    expect(item.textContent).toContain('Ctrl+M');

    item.click();

    expect(runs).toBe(1);
    expect(closes).toBe(1);

    dispose();
    container.remove();
  });

  it('renders installed shortcut contributions in the shortcuts modal', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(() => <ModalStackFixture modal="shortcuts" />, container);

    const row = requireElement(container, 'shortcut-row-test-magic-action');

    expect(row.textContent).toContain('Magic action');
    expect(row.textContent).toContain('Ctrl+M');

    dispose();
    container.remove();
  });

  it('renders installed shortcut contributions in settings shortcuts', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(() => <ModalStackFixture modal="settings" />, container);

    requireElement(container, 'settings-tab-shortcuts').click();

    const row = requireElement(container, 'shortcut-row-test-magic-action');

    expect(row.textContent).toContain('Magic action');
    expect(row.textContent).toContain('Ctrl+M');

    dispose();
    container.remove();
  });

  it('renders installed package inventory and diagnostics in settings extensions', () => {
    const extension = createMagicExtension(() => undefined);
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(
      () => (
        <EditorModalStack
          kernel={createKernelFixture(
            [coreModalContribution, coreSettingsSectionContribution, extension],
            createDefaultRoot(),
            {
              activeModal: 'settings',
              packages: [
                {
                  manifest: {
                    id: 'test.package',
                    name: 'Test Package',
                    version: '1.0.0',
                    editorApiVersion: currentEditorExtensionApiVersion,
                    dependencies: [{ id: 'test.base-package', version: '2.0.0' }]
                  },
                  contributionIds: [extension.id]
                },
                {
                  manifest: {
                    id: 'test.package',
                    name: 'Duplicate Package',
                    version: '1.0.1',
                    editorApiVersion: currentEditorExtensionApiVersion
                  },
                  contributionIds: []
                }
              ]
            }
          )}
        />
      ),
      container
    );

    requireElement(container, 'settings-tab-extensions').click();

    expect(requireElement(container, 'settings-extension-health-status').textContent).toBe('error');
    expect(requireElement(container, 'settings-extension-health-packages').textContent).toBe(
      'packages 0 active, 0 disabled, 2 blocked'
    );
    expect(requireElement(container, 'settings-extension-health-issues').textContent).toBe('issues 2 errors, 1 warnings');
    expect(requireElement(container, 'settings-extension-package-count').textContent).toBe('2');
    expect(requireElement(container, 'settings-extension-packages').textContent).toContain('Test Package 1.0.0');
    expect(requireElement(container, 'settings-extension-packages').textContent).toContain('status blocked by 3 issues');
    expect(requireElement(container, 'settings-extension-packages').textContent).toContain(
      'test.package - api 1 - contributes test.palette-extension'
    );
    expect(requireElement(container, 'settings-extension-packages').textContent).toContain(
      'compatibility compatible - Targets current editor extension API 1.'
    );
    expect(requireElement(container, 'settings-extension-packages').textContent).toContain('migrations none');
    expect(requireElement(container, 'settings-extension-packages').textContent).toContain('updates none');
    expect(requireElement(container, 'settings-extension-packages').textContent).toContain(
      'depends on test.base-package@2.0.0'
    );
    expect(requireElement(container, 'settings-extension-packages').textContent).toContain('load order not loaded');
    expect(requireElement(container, 'settings-extension-packages').textContent).toContain('required by none');
    expect(requireElement(container, 'settings-extension-diagnostic-count').textContent).toBe('3');
    expect(requireElement(container, 'settings-extension-diagnostics').textContent).toContain(
      'Duplicate extension package "test.package".'
    );
    expect(requireElement(container, 'settings-extension-diagnostics').textContent).toContain(
      'Missing extension package "test.base-package".'
    );
    expect(requireElement(container, 'settings-extension-diagnostics').textContent).toContain(
      'Extension packages must install at least one contribution.'
    );

    dispose();
    container.remove();
  });

  it('renders package update candidates in settings extensions', () => {
    const extension = createMagicExtension(() => undefined);
    const packageId = 'test.package';
    const kernel = createKernelFixture(
      [coreModalContribution, coreSettingsSectionContribution, extension],
      createDefaultRoot(),
      {
        activeModal: 'settings',
        packages: [
          {
            manifest: {
              id: packageId,
              name: 'Test Package',
              version: '1.0.0',
              editorApiVersion: currentEditorExtensionApiVersion
            },
            contributionIds: [extension.id]
          }
        ],
        availablePackageUpdates: [
          {
            packageId,
            version: '1.1.0',
            editorApiVersion: currentEditorExtensionApiVersion,
            notes: 'Adds update workflow metadata.'
          }
        ]
      }
    );
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(() => <EditorModalStack kernel={kernel} />, container);

    requireElement(container, 'settings-tab-extensions').click();

    expect(requireElement(container, `settings-extension-package-updates-${packageId}`).textContent).toContain(
      'updates 1.1.0 ready - Update 1.0.0 -> 1.1.0 targets current editor extension API 1.'
    );
    expect(requireElement(container, `settings-extension-package-update-policy-${packageId}`).textContent).toBe(
      'update policy pending'
    );

    requireElement(container, `settings-extension-package-apply-update-${packageId}`).click();

    expect(kernel.settings.appliedExtensionPackageUpdateKeys()).toEqual([
      createExtensionPackageUpdateKey(packageId, '1.1.0')
    ]);
    expect(requireElement(container, `settings-extension-package-update-policy-${packageId}`).textContent).toBe(
      'update policy applied'
    );
    expect(requireElement(container, 'settings-extension-diagnostic-count').textContent).toBe('1');
    expect(requireElement(container, 'settings-extension-diagnostics').textContent).toContain(
      'Extension package update available for "test.package".'
    );

    dispose();
    container.remove();
  });

  it('updates persisted package enablement from settings extensions', () => {
    const extension = createMagicExtension(() => undefined);
    const packageId = 'test.package';
    const kernel = createKernelFixture(
      [coreModalContribution, coreSettingsSectionContribution, extension],
      createDefaultRoot(),
      {
        activeModal: 'settings',
        packages: [
          {
            manifest: {
              id: packageId,
              name: 'Test Package',
              version: '1.0.0',
              editorApiVersion: currentEditorExtensionApiVersion
            },
            contributionIds: [extension.id]
          }
        ]
      }
    );
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(() => <EditorModalStack kernel={kernel} />, container);

    requireElement(container, 'settings-tab-extensions').click();

    const checkbox = requireInput(container, `settings-extension-package-enabled-${packageId}`);

    expect(checkbox.checked).toBe(true);
    expect(requireElement(container, `settings-extension-package-enablement-${packageId}`).textContent).toBe(
      'launch policy enabled'
    );

    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(kernel.settings.disabledExtensionPackageIds()).toEqual([packageId]);
    expect(requireElement(container, `settings-extension-package-enablement-${packageId}`).textContent).toBe(
      'launch policy disabled'
    );

    dispose();
    container.remove();
  });

  it('marks package migrations applied from settings extensions', () => {
    const extension = createMagicExtension(() => undefined);
    const packageId = 'test.stale-package';
    const migrationId = 'test.migrate-stale-package-v0-v1';
    const kernel = createKernelFixture(
      [coreModalContribution, coreSettingsSectionContribution, extension],
      createDefaultRoot(),
      {
        activeModal: 'settings',
        packages: [
          {
            manifest: {
              id: packageId,
              name: 'Stale Package',
              version: '1.0.0',
              editorApiVersion: currentEditorExtensionApiVersion - 1,
              migrations: [
                {
                  id: migrationId,
                  fromEditorApiVersion: currentEditorExtensionApiVersion - 1,
                  toEditorApiVersion: currentEditorExtensionApiVersion,
                  description: 'Update stale package command metadata.'
                }
              ]
            },
            contributionIds: [extension.id]
          }
        ]
      }
    );
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(() => <EditorModalStack kernel={kernel} />, container);

    requireElement(container, 'settings-tab-extensions').click();

    expect(requireElement(container, `settings-extension-package-compatibility-${packageId}`).textContent).toContain(
      'needs migration'
    );
    expect(requireElement(container, `settings-extension-package-migration-policy-${packageId}`).textContent).toBe(
      'migration policy pending'
    );

    requireElement(container, `settings-extension-package-apply-migrations-${packageId}`).click();

    expect(kernel.settings.appliedExtensionPackageMigrationKeys()).toEqual([
      createExtensionPackageMigrationKey(packageId, migrationId)
    ]);
    expect(requireElement(container, `settings-extension-package-migration-policy-${packageId}`).textContent).toBe(
      'migration policy applied'
    );

    dispose();
    container.remove();
  });

  it('renders custom modal contributions from the kernel registry', () => {
    let closes = 0;
    const extension = {
      id: 'test.modals',
      modals: [
        {
          id: 'test.magic-modal',
          render: (context) => (
            <button type="button" data-testid="custom-modal-action" onClick={context.close}>
              Magic modal
            </button>
          )
        }
      ]
    } satisfies EditorContribution<EditorPanelContext>;
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(
      () => (
        <EditorModalStack
          kernel={createKernelFixture([extension], createDefaultRoot(), {
            activeModal: 'test.magic-modal',
            onClose: () => {
              closes += 1;
            }
          })}
        />
      ),
      container
    );

    const action = requireElement(container, 'custom-modal-action');

    expect(action.textContent).toContain('Magic modal');
    action.click();
    expect(closes).toBe(1);

    dispose();
    container.remove();
  });

  it('renders custom settings sections in the settings modal', () => {
    const extension = {
      id: 'test.settings-sections',
      settingsSections: [
        {
          id: 'test-magic',
          label: 'magic',
          order: 5,
          render: () => <div data-testid="settings-section-test-magic">Magic settings</div>
        }
      ]
    } satisfies EditorContribution<EditorPanelContext>;
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(
      () => (
        <EditorModalStack
          kernel={createKernelFixture([coreModalContribution, coreSettingsSectionContribution, extension], createDefaultRoot(), {
            activeModal: 'settings'
          })}
        />
      ),
      container
    );

    requireElement(container, 'settings-tab-test-magic').click();

    expect(requireElement(container, 'settings-section-test-magic').textContent).toContain('Magic settings');

    dispose();
    container.remove();
  });
});

function ModalStackFixture(props: { readonly modal: 'settings' | 'shortcuts' }) {
  const root = createDefaultRoot();
  const kernel = createKernelFixture(
    [coreModalContribution, coreSettingsSectionContribution, createMagicExtension(() => undefined)],
    root,
    { activeModal: props.modal }
  );

  return (
    <EditorModalStack kernel={kernel} />
  );
}

function createMagicExtension(run: () => void): EditorContribution {
  return {
    id: 'test.palette-extension',
    actions: [
      {
        id: 'test.magic-action',
        label: 'Magic action',
        run
      }
    ],
    shortcuts: [
      {
        id: 'test.magic-shortcut',
        target: { kind: 'action', id: 'test.magic-action' },
        category: 'test',
        action: 'Magic action',
        keys: 'Ctrl+M',
        bindings: [{ key: 'm', ctrl: true }]
      }
    ]
  } satisfies EditorContribution;
}

function createKernelFixture(
  contributions: readonly EditorContribution<EditorPanelContext>[],
  root = createDefaultRoot(),
  modalOptions: {
    readonly activeModal?: ModalId;
    readonly onOpen?: (modal: Exclude<ModalId, undefined>) => void;
    readonly onClose?: () => void;
    readonly packages?: readonly EditorInstalledPackage[];
    readonly availablePackageUpdates?: readonly EditorAvailablePackageUpdate[];
  } = {}
) {
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
  const [activeModal, setActiveModal] = createSignal<ModalId>(modalOptions.activeModal);

  return createEditorKernel<EditorPanelContext>({
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
      activeResources: () => document.resources,
      activeResourceGraph: () => document.resourceGraph,
      resolveNode: (nodeId) => findNode(root, nodeId)
    },
    input: {
      heldKeys: () => [],
      viewportPointer: () => inactivePointerState
    },
    ui: {
      modal: {
        active: activeModal,
        open: (modal) => {
          setActiveModal(modal);
          modalOptions.onOpen?.(modal);
        },
        close: () => {
          setActiveModal(undefined);
          modalOptions.onClose?.();
        }
      }
    },
    registries: createEditorRegistries<EditorPanelContext>(contributions, {
      packages: modalOptions.packages,
      availablePackageUpdates: modalOptions.availablePackageUpdates
    })
  });
}

function updateInput(container: HTMLElement, testId: string, value: string): void {
  const input = requireInput(container, testId);

  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function requireInput(container: HTMLElement, testId: string): HTMLInputElement {
  const input = requireElement(container, testId);

  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Expected input ${testId}`);
  }

  return input;
}

function requireElement(container: HTMLElement, testId: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);

  if (!element) {
    throw new Error(`Expected element ${testId}`);
  }

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
