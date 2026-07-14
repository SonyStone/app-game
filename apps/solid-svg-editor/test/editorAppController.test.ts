import { createRoot } from 'solid-js';
import { describe, expect, it } from 'vitest';

import { defaultSettings } from '../src/editor/defaults';
import {
  createExtensionPackageMigrationKey,
  createExtensionPackageUpdateKey,
  currentEditorExtensionApiVersion
} from '../src/editor/extension-packages';
import { nodeSelectionTarget } from '../src/editor/selection-targets';
import { sampleExtensionIds, sampleExtensionPackage } from '../src/extensions/sampleExtensionContribution';
import { createEditorAppController } from '../src/features/shell/createEditorAppController';
import type { EditorAppContribution, EditorAppExtensionPackage } from '../src/features/shell/editorAppContributions';

const settingsStorageKey = 'solid-svg-editor-settings-v1';

describe('editor app controller', () => {
  it('exposes viewport host, layer, and overlay services through the kernel', () => {
    createRoot((dispose) => {
      const app = createEditorAppController();
      const viewportHost = app.kernel.viewport.host;
      const appHost = app.kernel.ui.appHost;

      if (!viewportHost) {
        throw new Error('Expected viewport host service');
      }
      if (!appHost) {
        throw new Error('Expected app host service');
      }

      expect(appHost.className()).toContain('app-root');
      expect(appHost.themeVars()).toMatchObject({ '--base': app.kernel.settings.settings().baseColor });
      expect(viewportHost.viewportTransform()).toMatch(/^rotate\(/);
      expect(viewportHost.onCanvasWheel).toBeTypeOf('function');
      expect(app.kernel.viewport.layers?.root()).toBe(app.kernel.documents.activeRoot());
      expect(app.kernel.viewport.overlays?.handles()).toBe(app.kernel.viewport.handles());
      expect(app.kernel.input.viewportPointer()).toMatchObject({ isActive: false });
      expect(app.kernel.documents.exportText()).toContain('<svg');

      dispose();
    });
  });

  it('uses app-installed viewport renderer contributions in the live kernel', () => {
    createRoot((dispose) => {
      const extension = {
        id: 'test.viewport-renderer',
        renderers: [
          {
            id: 'test.viewport-renderer-adapter',
            label: 'Test viewport renderer adapter',
            createViewportRenderer: (base) => ({
              ...base,
              hitTestMarqueeTargets: () => [nodeSelectionTarget('extension-hit')]
            })
          }
        ]
      } satisfies EditorAppContribution;
      const app = createEditorAppController({ contributions: [extension] });

      expect(
        app.kernel.rendering.viewportRenderer?.hitTestMarqueeTargets({ x: 0, y: 0, width: 10, height: 10 }, 'contain')
      ).toEqual([nodeSelectionTarget('extension-hit')]);
      expect(app.kernel.registries.renderers.map((renderer) => renderer.id)).toContain('test.viewport-renderer-adapter');

      dispose();
    });
  });

  it('installs packaged extension contributions into the live kernel', () => {
    createRoot((dispose) => {
      const app = createEditorAppController({ packages: [sampleExtensionPackage] });

      expect(app.kernel.registries.contributions.at(-1)).toBe(sampleExtensionPackage.contributions[0]);
      expect(app.kernel.registries.packages).toEqual([
        {
          manifest: sampleExtensionPackage.manifest,
          contributionIds: [sampleExtensionPackage.contributions[0].id]
        }
      ]);
      expect(app.kernel.registries.packageStates).toEqual([
        {
          installedPackage: {
            manifest: sampleExtensionPackage.manifest,
            contributionIds: [sampleExtensionPackage.contributions[0].id]
          },
          activation: { status: 'active' }
        }
      ]);
      expect(app.kernel.registries.packageLoadOrder).toEqual([sampleExtensionPackage.manifest.id]);
      expect(app.kernel.registries.health).toMatchObject({
        status: 'ready',
        packageCount: 1,
        activePackageCount: 1,
        disabledPackageCount: 0,
        blockedPackageCount: 0,
        issueCount: 0
      });
      expect(app.kernel.registries.actions.map((action) => action.id)).toContain(sampleExtensionIds.action);
      expect(app.kernel.capabilities.svg.getElement(sampleExtensionIds.element)?.name).toBe(sampleExtensionIds.element);
      expect(app.kernel.registries.issues).toEqual([]);

      dispose();
    });
  });

  it('withholds disabled packaged extension contributions from the live kernel', () => {
    createRoot((dispose) => {
      const app = createEditorAppController({
        packages: [sampleExtensionPackage],
        disabledPackageIds: [sampleExtensionPackage.manifest.id]
      });

      expect(app.kernel.registries.packageStates).toEqual([
        {
          installedPackage: {
            manifest: sampleExtensionPackage.manifest,
            contributionIds: [sampleExtensionPackage.contributions[0].id]
          },
          activation: { status: 'disabled', reason: { kind: 'host-disabled' } }
        }
      ]);
      expect(app.kernel.registries.packageLoadOrder).toEqual([]);
      expect(app.kernel.registries.health).toMatchObject({
        status: 'ready',
        packageCount: 1,
        activePackageCount: 0,
        disabledPackageCount: 1,
        blockedPackageCount: 0,
        issueCount: 0
      });
      expect(app.kernel.registries.actions.map((action) => action.id)).not.toContain(sampleExtensionIds.action);
      expect(app.kernel.capabilities.svg.getElement(sampleExtensionIds.element)).toBeUndefined();
      expect(app.kernel.registries.issues).toEqual([]);

      dispose();
    });
  });

  it('uses persisted disabled extension package ids as startup package policy', () => {
    window.localStorage.setItem(
      settingsStorageKey,
      JSON.stringify({
        ...defaultSettings(),
        disabledExtensionPackageIds: [sampleExtensionPackage.manifest.id]
      })
    );

    createRoot((dispose) => {
      try {
        const app = createEditorAppController({ packages: [sampleExtensionPackage] });

        expect(app.kernel.settings.disabledExtensionPackageIds()).toEqual([sampleExtensionPackage.manifest.id]);
        expect(app.kernel.registries.packageStates[0]?.activation).toEqual({
          status: 'disabled',
          reason: { kind: 'host-disabled' }
        });
        expect(app.kernel.registries.actions.map((action) => action.id)).not.toContain(sampleExtensionIds.action);

        app.kernel.settings.setExtensionPackageEnabled(sampleExtensionPackage.manifest.id, true);

        expect(app.kernel.settings.disabledExtensionPackageIds()).toEqual([]);
      } finally {
        dispose();
        window.localStorage.removeItem(settingsStorageKey);
      }
    });
  });

  it('uses persisted applied package migrations as startup package policy', () => {
    const packageId = 'test.stale-package';
    const migrationId = 'test.migrate-stale-package-v0-v1';
    const migrationKey = createExtensionPackageMigrationKey(packageId, migrationId);
    const stalePackage = {
      manifest: {
        id: packageId,
        name: 'Stale package',
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
      contributions: [
        {
          id: 'test.stale-package-contribution',
          actions: [
            {
              id: 'test.stale-package-action',
              label: 'Stale package action',
              run: () => undefined
            }
          ]
        }
      ]
    } satisfies EditorAppExtensionPackage;

    window.localStorage.setItem(
      settingsStorageKey,
      JSON.stringify({
        ...defaultSettings(),
        appliedExtensionPackageMigrationKeys: [migrationKey]
      })
    );

    createRoot((dispose) => {
      try {
        const app = createEditorAppController({ packages: [stalePackage] });

        expect(app.kernel.settings.appliedExtensionPackageMigrationKeys()).toEqual([migrationKey]);
        expect(app.kernel.registries.packageCompatibility[0]?.status).toBe('migrated');
        expect(app.kernel.registries.packageStates[0]?.activation).toEqual({ status: 'active' });
        expect(app.kernel.registries.actions.map((action) => action.id)).toContain('test.stale-package-action');

        app.kernel.settings.setExtensionPackageMigrationsApplied(packageId, [migrationId], false);

        expect(app.kernel.settings.appliedExtensionPackageMigrationKeys()).toEqual([]);
      } finally {
        dispose();
        window.localStorage.removeItem(settingsStorageKey);
      }
    });
  });

  it('uses persisted applied package updates as startup package policy', () => {
    const packageId = 'test.update-package';
    const updateKey = createExtensionPackageUpdateKey(packageId, '1.1.0');
    const basePackage = {
      manifest: {
        id: packageId,
        name: 'Update package',
        version: '1.0.0',
        editorApiVersion: currentEditorExtensionApiVersion
      },
      contributions: [
        {
          id: 'test.update-package-contribution',
          actions: [
            {
              id: 'test.update-package-action',
              label: 'Update package action',
              run: () => undefined
            }
          ]
        }
      ]
    } satisfies EditorAppExtensionPackage;
    const updatedPackage = {
      manifest: {
        id: packageId,
        name: 'Update package',
        version: '1.1.0',
        editorApiVersion: currentEditorExtensionApiVersion
      },
      contributions: [
        {
          id: 'test.updated-package-contribution',
          actions: [
            {
              id: 'test.updated-package-action',
              label: 'Updated package action',
              run: () => undefined
            }
          ]
        }
      ]
    } satisfies EditorAppExtensionPackage;

    window.localStorage.setItem(
      settingsStorageKey,
      JSON.stringify({
        ...defaultSettings(),
        appliedExtensionPackageUpdateKeys: [updateKey]
      })
    );

    createRoot((dispose) => {
      try {
        const app = createEditorAppController({
          packages: [basePackage],
          packageUpdates: [{ package: updatedPackage, notes: 'Adds update workflow metadata.' }]
        });

        expect(app.kernel.settings.appliedExtensionPackageUpdateKeys()).toEqual([updateKey]);
        expect(app.kernel.registries.packages[0]?.manifest.version).toBe('1.1.0');
        expect(app.kernel.registries.packageUpdates).toEqual([]);
        expect(app.kernel.registries.actions.map((action) => action.id)).toContain('test.updated-package-action');
        expect(app.kernel.registries.actions.map((action) => action.id)).not.toContain('test.update-package-action');

        app.kernel.settings.setExtensionPackageUpdateApplied(packageId, '1.1.0', false);

        expect(app.kernel.settings.appliedExtensionPackageUpdateKeys()).toEqual([]);
      } finally {
        dispose();
        window.localStorage.removeItem(settingsStorageKey);
      }
    });
  });

  it('exposes modal state through the live kernel UI service', () => {
    createRoot((dispose) => {
      const app = createEditorAppController();
      const modal = app.kernel.ui.modal;

      if (!modal) {
        throw new Error('Expected modal UI service');
      }

      expect(modal.active()).toBeUndefined();

      modal.open('settings');
      expect(modal.active()).toBe('settings');

      modal.close();
      expect(modal.active()).toBeUndefined();

      dispose();
    });
  });

  it('exposes file picker host services through the live kernel UI service', () => {
    createRoot((dispose) => {
      const app = createEditorAppController();
      const svgImport = app.kernel.ui.svgImport;
      const referenceImage = app.kernel.ui.referenceImage;

      if (!svgImport || !referenceImage) {
        throw new Error('Expected import and reference image UI services');
      }

      expect(svgImport.dropActive()).toBe(false);
      expect(svgImport.setInputRef).toBeTypeOf('function');
      expect(svgImport.openDialog).toBeTypeOf('function');
      expect(svgImport.onFile).toBeTypeOf('function');
      expect(svgImport.onDragEnter).toBeTypeOf('function');
      expect(svgImport.onDragOver).toBeTypeOf('function');
      expect(svgImport.onDragLeave).toBeTypeOf('function');
      expect(svgImport.onDrop).toBeTypeOf('function');
      expect(referenceImage.setInputRef).toBeTypeOf('function');
      expect(referenceImage.openDialog).toBeTypeOf('function');
      expect(referenceImage.onFile).toBeTypeOf('function');

      dispose();
    });
  });

  it('exposes workbench sidebar state through the live kernel UI service', () => {
    createRoot((dispose) => {
      const app = createEditorAppController();
      const workbench = app.kernel.ui.workbench;

      if (!workbench) {
        throw new Error('Expected workbench UI service');
      }

      expect(workbench.activePanel()).toBe('inspector');
      expect(workbench.sidebar.width()).toBe(408);

      workbench.setActivePanel('code');
      expect(workbench.activePanel()).toBe('code');

      dispose();
    });
  });

  it('exposes context menu state through the live kernel UI service', () => {
    createRoot((dispose) => {
      const app = createEditorAppController();
      const contextMenu = app.kernel.ui.contextMenu;

      if (!contextMenu) {
        throw new Error('Expected context menu UI service');
      }

      expect(contextMenu.active()).toBeUndefined();

      contextMenu.open(new MouseEvent('contextmenu', { clientX: 12, clientY: 34 }), app.kernel.documents.activeRoot().id);
      expect(contextMenu.active()).toMatchObject({
        x: 12,
        y: 34,
        nodeId: app.kernel.documents.activeRoot().id,
        target: nodeSelectionTarget(app.kernel.documents.activeRoot().id)
      });

      contextMenu.close();
      expect(contextMenu.active()).toBeUndefined();

      dispose();
    });
  });

  it('wires installed shortcut contributions through the live shortcut runtime', () => {
    createRoot((dispose) => {
      const app = createEditorAppController();
      const modal = app.kernel.ui.modal;

      if (!modal) {
        throw new Error('Expected modal UI service');
      }

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));

      expect(modal.active()).toBe('command-palette');

      dispose();
    });
  });
});
