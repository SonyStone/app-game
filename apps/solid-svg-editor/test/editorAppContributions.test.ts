import { describe, expect, it } from 'vitest';

import { createEditorRegistries } from '../src/editor/contributions';
import {
  createExtensionPackageMigrationKey,
  createExtensionPackageUpdateKey,
  currentEditorExtensionApiVersion
} from '../src/editor/extension-packages';
import type { EditorAppContribution, EditorAppExtensionPackage } from '../src/features/shell/editorAppContributions';
import {
  coreEditorAppContributions,
  createEditorAppContributions,
  createEditorAppRegistries,
  createEditorAppSvgCapabilities
} from '../src/features/shell/editorAppContributions';

describe('editor app contributions', () => {
  it('collects first-party editor contributions in shell install order', () => {
    expect(coreEditorAppContributions.map((contribution) => contribution.id)).toEqual([
      'core.actions',
      'core.commands',
      'core.topbar-menus',
      'core.context-menus',
      'core.modals',
      'core.settings-sections',
      'core.panels',
      'core.shortcuts',
      'core.viewport-toolbar',
      'core.viewport-layers',
      'core.viewport-overlays',
      'core.viewport-tools',
      'core.svg'
    ]);

    const registries = createEditorRegistries(coreEditorAppContributions);
    const appRegistries = createEditorAppRegistries();

    expect(registries.issues).toEqual([]);
    expect(registries.health).toEqual({
      status: 'ready',
      packageCount: 0,
      activePackageCount: 0,
      disabledPackageCount: 0,
      blockedPackageCount: 0,
      contributionCount: coreEditorAppContributions.length,
      issueCount: 0,
      errorCount: 0,
      warningCount: 0
    });
    expect(registries.contributionSources[0]).toEqual({ kind: 'direct', contributionId: 'core.actions' });
    expect(appRegistries.contributionSources.slice(0, 2)).toEqual([
      { kind: 'core', contributionId: 'core.actions' },
      { kind: 'core', contributionId: 'core.commands' }
    ]);
    expect(registries.actions.map((action) => action.id)).toContain('edit.copy-svg');
    expect(registries.commands.map((command) => command.id)).toContain('svg.duplicate-selection');
    expect(registries.appMenus.map((item) => item.id)).toContain('topbar.more.command-palette');
    expect(registries.contextMenus.map((item) => item.id)).toContain('context.duplicate');
    expect(registries.modals.map((modal) => modal.id)).toContain('command-palette');
    expect(registries.settingsSections.map((section) => section.id)).toEqual([
      'formatting',
      'optimizer',
      'palettes',
      'shortcuts',
      'extensions',
      'theming',
      'tabbar',
      'other'
    ]);
    expect(registries.panels.map((panel) => panel.id)).toEqual(['inspector', 'code', 'previews', 'debug']);
    expect(registries.shortcuts.map((shortcut) => shortcut.id)).toContain('edit.duplicate');
    expect(registries.viewportToolbars.map((toolbar) => toolbar.id)).toEqual([
      'viewport.left-tools',
      'viewport.zoom-widget'
    ]);
    expect(registries.viewportLayers.map((layer) => layer.id)).toEqual([
      'viewport.background',
      'viewport.grid',
      'viewport.page',
      'viewport.reference-underlay',
      'viewport.document',
      'viewport.reference-overlay'
    ]);
    expect(registries.viewportOverlays.map((overlay) => overlay.id)).toEqual([
      'viewport.selection-overlays',
      'viewport.selection-marquee'
    ]);
    expect(registries.tools.map((tool) => tool.id)).toEqual([
      'touch',
      'view-navigation',
      'element-handle',
      'transform-box',
      'selection'
    ]);
    expect(registries.svg.map((svg) => svg.id)).toEqual([
      'core.svg.structure',
      'core.svg.shapes',
      'core.svg.gradients',
      'core.svg.text',
      'core.svg.images',
      'core.svg.symbols',
      'core.svg.filters',
      'core.svg.masks',
      'core.svg.markers',
      'core.svg.patterns',
      'core.svg.presentation'
    ]);
  });

  it('appends external contributions after core contributions', () => {
    const extension = {
      id: 'test.extension',
      actions: [
        {
          id: 'test.run',
          label: 'Run extension action',
          run: () => undefined
        }
      ],
      shortcuts: [
        {
          id: 'test.run-shortcut',
          target: { kind: 'action', id: 'test.run' },
          category: 'test',
          action: 'Run extension action',
          keys: 'Ctrl+R',
          bindings: [{ key: 'r', ctrl: true }]
        }
      ]
    } satisfies EditorAppContribution;

    const contributions = createEditorAppContributions([extension]);
    const registries = createEditorRegistries(contributions);

    expect(contributions.at(-1)).toBe(extension);
    expect(registries.actions.at(-1)?.id).toBe('test.run');
    expect(registries.shortcuts.at(-1)?.id).toBe('test.run-shortcut');
  });

  it('installs packaged external contributions after raw app contributions', () => {
    const rawContribution = {
      id: 'test.raw-extension',
      actions: [
        {
          id: 'test.raw-action',
          label: 'Run raw action',
          run: () => undefined
        }
      ]
    } satisfies EditorAppContribution;
    const packageContribution = {
      id: 'test.packaged-extension',
      actions: [
        {
          id: 'test.packaged-action',
          label: 'Run packaged action',
          run: () => undefined
        }
      ]
    } satisfies EditorAppContribution;
    const extensionPackage = {
      manifest: {
        id: 'test.package',
        name: 'Test Package',
        version: '1.0.0',
        editorApiVersion: currentEditorExtensionApiVersion
      },
      contributions: [packageContribution]
    } satisfies EditorAppExtensionPackage;

    const contributions = createEditorAppContributions({
      contributions: [rawContribution],
      packages: [extensionPackage]
    });
    const registries = createEditorAppRegistries({
      contributions: [rawContribution],
      packages: [extensionPackage]
    });

    expect(contributions.slice(-2).map((contribution) => contribution.id)).toEqual([
      'test.raw-extension',
      'test.packaged-extension'
    ]);
    expect(registries.actions.slice(-2).map((action) => action.id)).toEqual([
      'test.raw-action',
      'test.packaged-action'
    ]);
    expect(registries.contributionSources.slice(-2)).toEqual([
      { kind: 'raw', contributionId: 'test.raw-extension' },
      { kind: 'package', contributionId: 'test.packaged-extension', packageId: 'test.package' }
    ]);
    expect(registries.packages).toEqual([
      {
        manifest: extensionPackage.manifest,
        contributionIds: ['test.packaged-extension']
      }
    ]);
    expect(registries.packageStates).toEqual([
      {
        installedPackage: {
          manifest: extensionPackage.manifest,
          contributionIds: ['test.packaged-extension']
        },
        activation: { status: 'active' }
      }
    ]);
    expect(registries.packageLoadOrder).toEqual(['test.package']);
    expect(registries.packageCompatibility).toEqual([
      {
        packageId: 'test.package',
        status: 'compatible',
        editorApiVersion: currentEditorExtensionApiVersion,
        currentEditorApiVersion: currentEditorExtensionApiVersion,
        migrationIds: [],
        message: 'Targets current editor extension API 1.'
      }
    ]);
    expect(registries.health).toMatchObject({
      status: 'ready',
      packageCount: 1,
      activePackageCount: 1,
      disabledPackageCount: 0,
      blockedPackageCount: 0,
      issueCount: 0,
      errorCount: 0,
      warningCount: 0
    });
    expect(registries.issues).toEqual([]);
  });

  it('withholds disabled package contributions while keeping package inventory', () => {
    const createContribution = (id: string) =>
      ({
        id,
        actions: [
          {
            id: `${id}.action`,
            label: id,
            run: () => undefined
          }
        ]
      }) satisfies EditorAppContribution;
    const rawContribution = createContribution('test.raw-extension');
    const activePackageContribution = createContribution('test.active-package-contribution');
    const disabledPackageContribution = createContribution('test.disabled-package-contribution');
    const dependentPackageContribution = createContribution('test.dependent-package-contribution');
    const activePackage = {
      manifest: {
        id: 'test.active-package',
        name: 'Active Package',
        version: '1.0.0',
        editorApiVersion: currentEditorExtensionApiVersion
      },
      contributions: [activePackageContribution]
    } satisfies EditorAppExtensionPackage;
    const disabledPackage = {
      manifest: {
        id: 'test.disabled-package',
        name: 'Disabled Package',
        version: '1.0.0',
        editorApiVersion: currentEditorExtensionApiVersion
      },
      contributions: [disabledPackageContribution]
    } satisfies EditorAppExtensionPackage;
    const dependentPackage = {
      manifest: {
        id: 'test.dependent-package',
        name: 'Dependent Package',
        version: '1.0.0',
        editorApiVersion: currentEditorExtensionApiVersion,
        dependencies: [{ id: 'test.disabled-package' }]
      },
      contributions: [dependentPackageContribution]
    } satisfies EditorAppExtensionPackage;

    const options = {
      contributions: [rawContribution],
      packages: [activePackage, disabledPackage, dependentPackage],
      disabledPackageIds: ['test.disabled-package']
    } satisfies Parameters<typeof createEditorAppContributions>[0];
    const contributions = createEditorAppContributions(options);
    const registries = createEditorAppRegistries(options);
    const contributionIds = contributions.map((contribution) => contribution.id);
    const actionIds = registries.actions.map((action) => action.id);

    expect(contributionIds).toContain('test.raw-extension');
    expect(contributionIds).toContain('test.active-package-contribution');
    expect(contributionIds).not.toContain('test.disabled-package-contribution');
    expect(contributionIds).not.toContain('test.dependent-package-contribution');
    expect(registries.contributionSources.slice(-2)).toEqual([
      { kind: 'raw', contributionId: 'test.raw-extension' },
      { kind: 'package', contributionId: 'test.active-package-contribution', packageId: 'test.active-package' }
    ]);
    expect(actionIds).toContain('test.raw-extension.action');
    expect(actionIds).toContain('test.active-package-contribution.action');
    expect(actionIds).not.toContain('test.disabled-package-contribution.action');
    expect(actionIds).not.toContain('test.dependent-package-contribution.action');
    expect(registries.packageStates.map((packageState) => packageState.activation)).toEqual([
      { status: 'active' },
      { status: 'disabled', reason: { kind: 'host-disabled' } },
      {
        status: 'disabled',
        reason: { kind: 'disabled-package-dependency', dependencyId: 'test.disabled-package' }
      }
    ]);
    expect(registries.packageLoadOrder).toEqual(['test.active-package']);
    expect(registries.packageDependencyGraph).toEqual([
      {
        packageId: 'test.active-package',
        dependencyIds: [],
        dependentIds: []
      },
      {
        packageId: 'test.disabled-package',
        dependencyIds: [],
        dependentIds: ['test.dependent-package']
      },
      {
        packageId: 'test.dependent-package',
        dependencyIds: ['test.disabled-package'],
        dependentIds: []
      }
    ]);
    expect(registries.health).toMatchObject({
      status: 'ready',
      packageCount: 3,
      activePackageCount: 1,
      disabledPackageCount: 2,
      blockedPackageCount: 0,
      issueCount: 0
    });
    expect(registries.issues).toEqual([]);
  });

  it('installs active package contributions after their package dependencies', () => {
    const basePackageContribution = {
      id: 'test.base-package-contribution',
      actions: [
        {
          id: 'test.base-package-action',
          label: 'Run base action',
          run: () => undefined
        }
      ]
    } satisfies EditorAppContribution;
    const addonPackageContribution = {
      id: 'test.addon-package-contribution',
      actions: [
        {
          id: 'test.addon-package-action',
          label: 'Run addon action',
          run: () => undefined
        }
      ]
    } satisfies EditorAppContribution;
    const addonPackage = {
      manifest: {
        id: 'test.addon-package',
        name: 'Addon Package',
        version: '1.0.0',
        editorApiVersion: currentEditorExtensionApiVersion,
        dependencies: [{ id: 'test.base-package' }]
      },
      contributions: [addonPackageContribution]
    } satisfies EditorAppExtensionPackage;
    const basePackage = {
      manifest: {
        id: 'test.base-package',
        name: 'Base Package',
        version: '1.0.0',
        editorApiVersion: currentEditorExtensionApiVersion
      },
      contributions: [basePackageContribution]
    } satisfies EditorAppExtensionPackage;

    const contributions = createEditorAppContributions({
      packages: [addonPackage, basePackage]
    });
    const registries = createEditorAppRegistries({
      packages: [addonPackage, basePackage]
    });

    expect(contributions.slice(-2).map((contribution) => contribution.id)).toEqual([
      'test.base-package-contribution',
      'test.addon-package-contribution'
    ]);
    expect(registries.actions.slice(-2).map((action) => action.id)).toEqual([
      'test.base-package-action',
      'test.addon-package-action'
    ]);
    expect(registries.contributionSources.slice(-2)).toEqual([
      { kind: 'package', contributionId: 'test.base-package-contribution', packageId: 'test.base-package' },
      { kind: 'package', contributionId: 'test.addon-package-contribution', packageId: 'test.addon-package' }
    ]);
    expect(registries.packageStates.map((packageState) => packageState.activation.status)).toEqual(['active', 'active']);
    expect(registries.packageLoadOrder).toEqual(['test.base-package', 'test.addon-package']);
    expect(registries.packageDependencyGraph).toEqual([
      {
        packageId: 'test.addon-package',
        dependencyIds: ['test.base-package'],
        dependentIds: []
      },
      {
        packageId: 'test.base-package',
        dependencyIds: [],
        dependentIds: ['test.addon-package']
      }
    ]);
    expect(registries.issues).toEqual([]);
  });

  it('reports invalid extension package manifests through registry diagnostics', () => {
    const firstPackageContribution = {
      id: 'test.first-package-contribution',
      actions: [
        {
          id: 'test.first-package-action',
          label: 'First package action',
          run: () => undefined
        }
      ]
    } satisfies EditorAppContribution;
    const secondPackageContribution = {
      id: 'test.second-package-contribution',
      actions: [
        {
          id: 'test.second-package-action',
          label: 'Second package action',
          run: () => undefined
        }
      ]
    } satisfies EditorAppContribution;
    const incompatiblePackageContribution = {
      id: 'test.incompatible-package-contribution',
      actions: [
        {
          id: 'test.incompatible-package-action',
          label: 'Incompatible package action',
          run: () => undefined
        }
      ]
    } satisfies EditorAppContribution;
    const firstPackage = {
      manifest: {
        id: 'test.duplicate-package',
        name: 'Duplicate package',
        version: '1.0.0',
        editorApiVersion: currentEditorExtensionApiVersion
      },
      contributions: [firstPackageContribution]
    } satisfies EditorAppExtensionPackage;
    const secondPackage = {
      manifest: {
        id: 'test.duplicate-package',
        name: 'Duplicate package again',
        version: '1.0.1',
        editorApiVersion: currentEditorExtensionApiVersion
      },
      contributions: [secondPackageContribution]
    } satisfies EditorAppExtensionPackage;
    const emptyPackage = {
      manifest: {
        id: 'test.empty-package',
        name: 'Empty package',
        version: '1.0.0',
        editorApiVersion: currentEditorExtensionApiVersion
      },
      contributions: []
    } satisfies EditorAppExtensionPackage;
    const incompatiblePackage = {
      manifest: {
        id: 'test.incompatible-package',
        name: 'Incompatible package',
        version: '1.0.0',
        editorApiVersion: currentEditorExtensionApiVersion + 1
      },
      contributions: [incompatiblePackageContribution]
    } satisfies EditorAppExtensionPackage;

    const registries = createEditorAppRegistries({
      packages: [firstPackage, secondPackage, emptyPackage, incompatiblePackage]
    });

    expect(registries.packages.map((extensionPackage) => extensionPackage.manifest.id)).toEqual([
      'test.duplicate-package',
      'test.duplicate-package',
      'test.empty-package',
      'test.incompatible-package'
    ]);
    const actionIds = registries.actions.map((action) => action.id);

    expect(actionIds).not.toContain('test.first-package-action');
    expect(actionIds).not.toContain('test.second-package-action');
    expect(actionIds).not.toContain('test.incompatible-package-action');
    expect(registries.issues).toEqual([
      {
        kind: 'duplicate-package-id',
        id: 'test.duplicate-package',
        count: 2
      },
      {
        kind: 'invalid-package',
        id: 'test.empty-package',
        message: 'Extension packages must install at least one contribution.'
      },
      {
        kind: 'incompatible-package-api',
        id: 'test.incompatible-package',
        editorApiVersion: currentEditorExtensionApiVersion + 1,
        currentEditorApiVersion: currentEditorExtensionApiVersion,
        reason: 'newer-api'
      }
    ]);
    expect(registries.packageCompatibility.find((entry) => entry.packageId === 'test.incompatible-package')).toEqual({
      packageId: 'test.incompatible-package',
      status: 'incompatible',
      editorApiVersion: currentEditorExtensionApiVersion + 1,
      currentEditorApiVersion: currentEditorExtensionApiVersion,
      migrationIds: [],
      message: 'Targets newer editor extension API 2; current host API is 1.'
    });
    expect(registries.packageStates.map((packageState) => packageState.activation.status)).toEqual([
      'blocked',
      'blocked',
      'blocked',
      'blocked'
    ]);
  });

  it('projects package API migration requirements without installing stale packages', () => {
    const staleContribution = {
      id: 'test.stale-package-contribution',
      actions: [
        {
          id: 'test.stale-package-action',
          label: 'Stale package action',
          run: () => undefined
        }
      ]
    } satisfies EditorAppContribution;
    const stalePackage = {
      manifest: {
        id: 'test.stale-package',
        name: 'Stale package',
        version: '1.0.0',
        editorApiVersion: currentEditorExtensionApiVersion - 1,
        migrations: [
          {
            id: 'test.migrate-stale-package-v0-v1',
            fromEditorApiVersion: currentEditorExtensionApiVersion - 1,
            toEditorApiVersion: currentEditorExtensionApiVersion,
            description: 'Update stale package commands to the current command contribution contract.'
          }
        ]
      },
      contributions: [staleContribution]
    } satisfies EditorAppExtensionPackage;

    const registries = createEditorAppRegistries({ packages: [stalePackage] });

    expect(registries.packageCompatibility).toEqual([
      {
        packageId: 'test.stale-package',
        status: 'needs-migration',
        editorApiVersion: currentEditorExtensionApiVersion - 1,
        currentEditorApiVersion: currentEditorExtensionApiVersion,
        migrationIds: ['test.migrate-stale-package-v0-v1'],
        message:
          'Targets editor extension API 0; migration path to API 1: test.migrate-stale-package-v0-v1.'
      }
    ]);
    expect(registries.issues).toEqual([
      {
        kind: 'package-api-migration-required',
        id: 'test.stale-package',
        editorApiVersion: currentEditorExtensionApiVersion - 1,
        currentEditorApiVersion: currentEditorExtensionApiVersion,
        migrationIds: ['test.migrate-stale-package-v0-v1']
      }
    ]);
    expect(registries.packageStates.map((packageState) => packageState.activation.status)).toEqual(['blocked']);
    expect(registries.packageLoadOrder).toEqual([]);
    expect(registries.actions.map((action) => action.id)).not.toContain('test.stale-package-action');
    expect(registries.health).toMatchObject({
      status: 'warning',
      packageCount: 1,
      activePackageCount: 0,
      disabledPackageCount: 0,
      blockedPackageCount: 1,
      issueCount: 1,
      errorCount: 0,
      warningCount: 1
    });
  });

  it('installs migrated packages when their required migration keys are applied', () => {
    const migrationId = 'test.migrate-stale-package-v0-v1';
    const staleContribution = {
      id: 'test.stale-package-contribution',
      actions: [
        {
          id: 'test.stale-package-action',
          label: 'Stale package action',
          run: () => undefined
        }
      ]
    } satisfies EditorAppContribution;
    const stalePackage = {
      manifest: {
        id: 'test.stale-package',
        name: 'Stale package',
        version: '1.0.0',
        editorApiVersion: currentEditorExtensionApiVersion - 1,
        migrations: [
          {
            id: migrationId,
            fromEditorApiVersion: currentEditorExtensionApiVersion - 1,
            toEditorApiVersion: currentEditorExtensionApiVersion,
            description: 'Update stale package commands to the current command contribution contract.'
          }
        ]
      },
      contributions: [staleContribution]
    } satisfies EditorAppExtensionPackage;

    const registries = createEditorAppRegistries({
      packages: [stalePackage],
      appliedMigrationKeys: [createExtensionPackageMigrationKey('test.stale-package', migrationId)]
    });

    expect(registries.packageCompatibility).toEqual([
      {
        packageId: 'test.stale-package',
        status: 'migrated',
        editorApiVersion: currentEditorExtensionApiVersion - 1,
        currentEditorApiVersion: currentEditorExtensionApiVersion,
        migrationIds: [migrationId],
        message: 'Targets editor extension API 0; migrations applied for API 1: test.migrate-stale-package-v0-v1.'
      }
    ]);
    expect(registries.issues).toEqual([]);
    expect(registries.packageStates.map((packageState) => packageState.activation.status)).toEqual(['active']);
    expect(registries.packageLoadOrder).toEqual(['test.stale-package']);
    expect(registries.actions.map((action) => action.id)).toContain('test.stale-package-action');
    expect(registries.health).toMatchObject({
      status: 'ready',
      packageCount: 1,
      activePackageCount: 1,
      disabledPackageCount: 0,
      blockedPackageCount: 0,
      issueCount: 0
    });
  });

  it('projects package update candidates without blocking the installed package', () => {
    const packageContribution = {
      id: 'test.update-package-contribution',
      actions: [
        {
          id: 'test.update-package-action',
          label: 'Update package action',
          run: () => undefined
        }
      ]
    } satisfies EditorAppContribution;
    const extensionPackage = {
      manifest: {
        id: 'test.update-package',
        name: 'Update package',
        version: '1.0.0',
        editorApiVersion: currentEditorExtensionApiVersion
      },
      contributions: [packageContribution]
    } satisfies EditorAppExtensionPackage;

    const registries = createEditorAppRegistries({
      packages: [extensionPackage],
      availablePackageUpdates: [
        {
          packageId: 'test.update-package',
          version: '1.1.0',
          editorApiVersion: currentEditorExtensionApiVersion,
          notes: 'Adds update workflow metadata.'
        },
        {
          packageId: 'test.update-package',
          version: '2.0.0',
          editorApiVersion: currentEditorExtensionApiVersion + 1,
          url: 'https://example.test/update-package'
        }
      ]
    });

    expect(registries.packageUpdates).toEqual([
      {
        packageId: 'test.update-package',
        installedVersion: '1.0.0',
        availableVersion: '1.1.0',
        editorApiVersion: currentEditorExtensionApiVersion,
        currentEditorApiVersion: currentEditorExtensionApiVersion,
        status: 'ready',
        migrationIds: [],
        message: 'Update 1.0.0 -> 1.1.0 targets current editor extension API 1.',
        notes: 'Adds update workflow metadata.',
        url: undefined
      },
      {
        packageId: 'test.update-package',
        installedVersion: '1.0.0',
        availableVersion: '2.0.0',
        editorApiVersion: currentEditorExtensionApiVersion + 1,
        currentEditorApiVersion: currentEditorExtensionApiVersion,
        status: 'incompatible',
        migrationIds: [],
        message: 'Update 1.0.0 -> 2.0.0 targets newer editor extension API 2; current host API is 1.',
        notes: undefined,
        url: 'https://example.test/update-package'
      }
    ]);
    expect(registries.issues).toEqual([
      {
        kind: 'package-update-available',
        id: 'test.update-package',
        installedVersion: '1.0.0',
        availableVersion: '1.1.0',
        updateStatus: 'ready',
        migrationIds: []
      },
      {
        kind: 'incompatible-package-update',
        id: 'test.update-package',
        installedVersion: '1.0.0',
        availableVersion: '2.0.0',
        editorApiVersion: currentEditorExtensionApiVersion + 1,
        currentEditorApiVersion: currentEditorExtensionApiVersion,
        reason: 'newer-api'
      }
    ]);
    expect(registries.packageStates.map((packageState) => packageState.activation.status)).toEqual(['active']);
    expect(registries.packageLoadOrder).toEqual(['test.update-package']);
    expect(registries.actions.map((action) => action.id)).toContain('test.update-package-action');
    expect(registries.health).toMatchObject({
      status: 'warning',
      packageCount: 1,
      activePackageCount: 1,
      disabledPackageCount: 0,
      blockedPackageCount: 0,
      issueCount: 2,
      errorCount: 0,
      warningCount: 2
    });
  });

  it('applies accepted package update payloads before installing package contributions', () => {
    const baseContribution = {
      id: 'test.update-package-contribution',
      actions: [
        {
          id: 'test.update-package-action',
          label: 'Update package action',
          run: () => undefined
        }
      ]
    } satisfies EditorAppContribution;
    const updatedContribution = {
      id: 'test.updated-package-contribution',
      actions: [
        {
          id: 'test.updated-package-action',
          label: 'Updated package action',
          run: () => undefined
        }
      ]
    } satisfies EditorAppContribution;
    const basePackage = {
      manifest: {
        id: 'test.update-package',
        name: 'Update package',
        version: '1.0.0',
        editorApiVersion: currentEditorExtensionApiVersion
      },
      contributions: [baseContribution]
    } satisfies EditorAppExtensionPackage;
    const updatedPackage = {
      manifest: {
        id: 'test.update-package',
        name: 'Update package',
        version: '1.1.0',
        editorApiVersion: currentEditorExtensionApiVersion
      },
      contributions: [updatedContribution]
    } satisfies EditorAppExtensionPackage;

    const contributions = createEditorAppContributions({
      packages: [basePackage],
      packageUpdates: [{ package: updatedPackage, notes: 'Adds update workflow metadata.' }],
      appliedUpdateKeys: [createExtensionPackageUpdateKey('test.update-package', '1.1.0')]
    });
    const registries = createEditorAppRegistries({
      packages: [basePackage],
      packageUpdates: [{ package: updatedPackage, notes: 'Adds update workflow metadata.' }],
      appliedUpdateKeys: [createExtensionPackageUpdateKey('test.update-package', '1.1.0')]
    });

    expect(contributions).toContain(updatedContribution);
    expect(contributions).not.toContain(baseContribution);
    expect(registries.packages).toEqual([
      {
        manifest: updatedPackage.manifest,
        contributionIds: [updatedContribution.id]
      }
    ]);
    expect(registries.packageUpdates).toEqual([]);
    expect(registries.actions.map((action) => action.id)).toContain('test.updated-package-action');
    expect(registries.actions.map((action) => action.id)).not.toContain('test.update-package-action');
    expect(registries.issues).toEqual([]);
    expect(registries.health).toMatchObject({
      status: 'ready',
      activePackageCount: 1,
      warningCount: 0
    });
  });

  it('reports extension package dependency issues through registry diagnostics', () => {
    const createContribution = (id: string) =>
      ({
        id,
        actions: [
          {
            id: `${id}.action`,
            label: id,
            run: () => undefined
          }
        ]
      }) satisfies EditorAppContribution;
    const basePackage = {
      manifest: {
        id: 'test.base-package',
        name: 'Base package',
        version: '1.0.0',
        editorApiVersion: currentEditorExtensionApiVersion
      },
      contributions: [createContribution('test.base-package-contribution')]
    } satisfies EditorAppExtensionPackage;
    const unversionedAddonPackage = {
      manifest: {
        id: 'test.unversioned-addon',
        name: 'Unversioned addon',
        version: '1.0.0',
        editorApiVersion: currentEditorExtensionApiVersion,
        dependencies: [{ id: 'test.base-package' }]
      },
      contributions: [createContribution('test.unversioned-addon-contribution')]
    } satisfies EditorAppExtensionPackage;
    const matchingAddonPackage = {
      manifest: {
        id: 'test.matching-addon',
        name: 'Matching addon',
        version: '1.0.0',
        editorApiVersion: currentEditorExtensionApiVersion,
        dependencies: [{ id: 'test.base-package', version: '1.0.0' }]
      },
      contributions: [createContribution('test.matching-addon-contribution')]
    } satisfies EditorAppExtensionPackage;
    const missingAddonPackage = {
      manifest: {
        id: 'test.missing-addon',
        name: 'Missing addon',
        version: '1.0.0',
        editorApiVersion: currentEditorExtensionApiVersion,
        dependencies: [{ id: 'test.missing-base', version: '1.0.0' }]
      },
      contributions: [createContribution('test.missing-addon-contribution')]
    } satisfies EditorAppExtensionPackage;
    const versionedAddonPackage = {
      manifest: {
        id: 'test.versioned-addon',
        name: 'Versioned addon',
        version: '1.0.0',
        editorApiVersion: currentEditorExtensionApiVersion,
        dependencies: [{ id: 'test.base-package', version: '2.0.0' }]
      },
      contributions: [createContribution('test.versioned-addon-contribution')]
    } satisfies EditorAppExtensionPackage;
    const invalidBasePackage = {
      manifest: {
        id: 'test.invalid-base',
        name: 'Invalid base',
        version: '1.0.0',
        editorApiVersion: currentEditorExtensionApiVersion + 1
      },
      contributions: [createContribution('test.invalid-base-contribution')]
    } satisfies EditorAppExtensionPackage;
    const blockedAddonPackage = {
      manifest: {
        id: 'test.blocked-addon',
        name: 'Blocked addon',
        version: '1.0.0',
        editorApiVersion: currentEditorExtensionApiVersion,
        dependencies: [{ id: 'test.invalid-base', version: '1.0.0' }]
      },
      contributions: [createContribution('test.blocked-addon-contribution')]
    } satisfies EditorAppExtensionPackage;

    const registries = createEditorAppRegistries({
      packages: [
        basePackage,
        unversionedAddonPackage,
        matchingAddonPackage,
        missingAddonPackage,
        versionedAddonPackage,
        invalidBasePackage,
        blockedAddonPackage
      ]
    });

    expect(registries.issues).toEqual([
      {
        kind: 'incompatible-package-api',
        id: 'test.invalid-base',
        editorApiVersion: currentEditorExtensionApiVersion + 1,
        currentEditorApiVersion: currentEditorExtensionApiVersion,
        reason: 'newer-api'
      },
      {
        kind: 'missing-package-dependency',
        id: 'test.missing-addon',
        dependencyId: 'test.missing-base',
        dependencyVersion: '1.0.0'
      },
      {
        kind: 'incompatible-package-dependency',
        id: 'test.versioned-addon',
        dependencyId: 'test.base-package',
        requiredVersion: '2.0.0',
        installedVersions: ['1.0.0']
      },
      {
        kind: 'blocked-package-dependency',
        id: 'test.blocked-addon',
        dependencyId: 'test.invalid-base',
        dependencyIssueCount: 1
      }
    ]);
    expect(registries.packageStates.map((packageState) => packageState.activation.status)).toEqual([
      'active',
      'active',
      'active',
      'blocked',
      'blocked',
      'blocked',
      'blocked'
    ]);
    expect(registries.packageStates[3]?.activation).toEqual({
      status: 'blocked',
      issues: [
        {
          kind: 'missing-package-dependency',
          id: 'test.missing-addon',
          dependencyId: 'test.missing-base',
          dependencyVersion: '1.0.0'
        }
      ]
    });
    const dependencyActionIds = registries.actions.map((action) => action.id);

    expect(dependencyActionIds).toContain('test.base-package-contribution.action');
    expect(dependencyActionIds).toContain('test.unversioned-addon-contribution.action');
    expect(dependencyActionIds).toContain('test.matching-addon-contribution.action');
    expect(dependencyActionIds).not.toContain('test.missing-addon-contribution.action');
    expect(dependencyActionIds).not.toContain('test.versioned-addon-contribution.action');
    expect(dependencyActionIds).not.toContain('test.invalid-base-contribution.action');
    expect(dependencyActionIds).not.toContain('test.blocked-addon-contribution.action');
  });

  it('reports extension package dependency cycles through registry diagnostics', () => {
    const createContribution = (id: string) =>
      ({
        id,
        actions: [
          {
            id: `${id}.action`,
            label: id,
            run: () => undefined
          }
        ]
      }) satisfies EditorAppContribution;
    const firstCyclePackage = {
      manifest: {
        id: 'test.first-cycle-package',
        name: 'First Cycle Package',
        version: '1.0.0',
        editorApiVersion: currentEditorExtensionApiVersion,
        dependencies: [{ id: 'test.second-cycle-package' }]
      },
      contributions: [createContribution('test.first-cycle-package-contribution')]
    } satisfies EditorAppExtensionPackage;
    const secondCyclePackage = {
      manifest: {
        id: 'test.second-cycle-package',
        name: 'Second Cycle Package',
        version: '1.0.0',
        editorApiVersion: currentEditorExtensionApiVersion,
        dependencies: [{ id: 'test.first-cycle-package' }]
      },
      contributions: [createContribution('test.second-cycle-package-contribution')]
    } satisfies EditorAppExtensionPackage;
    const dependentPackage = {
      manifest: {
        id: 'test.cycle-dependent-package',
        name: 'Cycle Dependent Package',
        version: '1.0.0',
        editorApiVersion: currentEditorExtensionApiVersion,
        dependencies: [{ id: 'test.first-cycle-package' }]
      },
      contributions: [createContribution('test.cycle-dependent-package-contribution')]
    } satisfies EditorAppExtensionPackage;

    const registries = createEditorAppRegistries({
      packages: [firstCyclePackage, secondCyclePackage, dependentPackage]
    });

    expect(registries.issues).toEqual([
      {
        kind: 'cyclic-package-dependency',
        id: 'test.first-cycle-package',
        cycleIds: ['test.first-cycle-package', 'test.second-cycle-package', 'test.first-cycle-package']
      },
      {
        kind: 'cyclic-package-dependency',
        id: 'test.second-cycle-package',
        cycleIds: ['test.second-cycle-package', 'test.first-cycle-package', 'test.second-cycle-package']
      },
      {
        kind: 'blocked-package-dependency',
        id: 'test.cycle-dependent-package',
        dependencyId: 'test.first-cycle-package',
        dependencyIssueCount: 1
      }
    ]);
    expect(registries.packageStates.map((packageState) => packageState.activation.status)).toEqual([
      'blocked',
      'blocked',
      'blocked'
    ]);
    expect(registries.packageLoadOrder).toEqual([]);
    expect(registries.health).toMatchObject({
      status: 'error',
      packageCount: 3,
      activePackageCount: 0,
      disabledPackageCount: 0,
      blockedPackageCount: 3,
      issueCount: 3,
      errorCount: 3,
      warningCount: 0
    });
    const actionIds = registries.actions.map((action) => action.id);

    expect(actionIds).not.toContain('test.first-cycle-package-contribution.action');
    expect(actionIds).not.toContain('test.second-cycle-package-contribution.action');
    expect(actionIds).not.toContain('test.cycle-dependent-package-contribution.action');
  });

  it('surfaces extension conflicts through registry diagnostics', () => {
    const extension = {
      id: 'test.conflict',
      actions: [
        {
          id: 'edit.copy-svg',
          label: 'Conflicting copy',
          run: () => undefined
        }
      ]
    } satisfies EditorAppContribution;

    const registries = createEditorRegistries(createEditorAppContributions([extension]));

    expect(registries.issues).toContainEqual({
      kind: 'duplicate-registry-id',
      registry: 'actions',
      id: 'edit.copy-svg',
      contributionIds: ['core.actions', 'test.conflict']
    });
  });

  it('creates app SVG capabilities from installed SVG contributions', () => {
    const extension = {
      id: 'test.svg',
      svg: [
        {
          id: 'test.svg-capabilities',
          elements: [
            {
              name: 'testShape',
              defaults: { width: '10' },
              attributes: ['width'],
              addable: true,
              addableOrder: -1
            }
          ]
        }
      ]
    } satisfies EditorAppContribution;
    const registries = createEditorAppRegistries([extension]);
    const capabilities = createEditorAppSvgCapabilities([extension]);

    expect(registries.svg.map((svg) => svg.id)).toContain('test.svg-capabilities');
    expect(capabilities.addableElements[0]?.name).toBe('testShape');
    expect(capabilities.createElement('testShape').attrs).toEqual([{ name: 'width', value: '10' }]);
  });
});
