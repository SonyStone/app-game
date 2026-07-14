import type { EditorContribution, SettingsSectionContribution } from '../../editor/kernel';
import {
  areExtensionPackageMigrationsApplied,
  formatExtensionPackageActivation,
  formatExtensionPackageDependencies,
  formatInstalledPackageCompatibility,
  formatInstalledPackageContributions,
  formatInstalledPackageDependents,
  formatInstalledPackageLoadOrder,
  formatInstalledPackageMigrations,
  formatInstalledPackageUpdates,
  isExtensionPackageUpdateApplied,
  isExtensionPackageIdDisabled
} from '../../editor/extension-packages';
import { createEditorRegistryDiagnostics } from '../../editor/registry-diagnostics';
import { themePresetSettings } from '../../editor/tree-utils';
import type { FormatterSettings } from '../../formatter';
import type { ThemePreset } from '../../editor/types';
import type { EditorPanelContext } from '../panels/panelRegistry';
import { PanelButton } from '../ui/PanelButton';
import { shortcutItemsFromShortcuts } from '../shortcuts/shortcutRegistry';
import {
  CheckboxField,
  FormInput,
  FormSelect,
  FormatterSettingsView,
  SettingsField,
  ShortcutTable
} from './EditorModals';

export type SettingsSectionRegistryContribution = EditorContribution<EditorPanelContext> & {
  readonly settingsSections: readonly SettingsSectionContribution<EditorPanelContext>[];
};

export const coreSettingsSectionContribution = {
  id: 'core.settings-sections',
  settingsSections: [
    {
      id: 'formatting',
      label: 'formatting',
      order: 10,
      render: (context) => <FormattingSettingsSection context={context} />
    },
    {
      id: 'optimizer',
      label: 'optimizer',
      order: 20,
      render: (context) => <OptimizerSettingsSection context={context} />
    },
    {
      id: 'palettes',
      label: 'palettes',
      order: 30,
      render: (context) => <PaletteSettingsSection context={context} />
    },
    {
      id: 'shortcuts',
      label: 'shortcuts',
      order: 40,
      render: (context) => <ShortcutSettingsSection context={context} />
    },
    {
      id: 'extensions',
      label: 'extensions',
      order: 45,
      render: (context) => <ExtensionsSettingsSection context={context} />
    },
    {
      id: 'theming',
      label: 'theming',
      order: 50,
      render: (context) => <ThemingSettingsSection context={context} />
    },
    {
      id: 'tabbar',
      label: 'tabbar',
      order: 60,
      render: (context) => <TabBarSettingsSection context={context} />
    },
    {
      id: 'other',
      label: 'other',
      order: 70,
      render: (context) => <OtherSettingsSection context={context} />
    }
  ]
} as const satisfies SettingsSectionRegistryContribution;

function FormattingSettingsSection(props: { readonly context: EditorPanelContext }) {
  const settings = () => props.context.kernel.settings.settings();
  const updateFormatter = (key: keyof FormatterSettings, value: FormatterSettings[keyof FormatterSettings], exportFormatter = false) => {
    props.context.kernel.settings.setSettings((current) => {
      const formatter = { ...(exportFormatter ? current.exportFormatter : current.formatter), [key]: value } satisfies FormatterSettings;
      return exportFormatter ? { ...current, exportFormatter: formatter } : { ...current, formatter };
    });
  };

  return (
    <>
      <FormatterSettingsView
        label="Editor formatter"
        formatter={settings().formatter}
        update={(key, value) => updateFormatter(key, value)}
      />
      <FormatterSettingsView
        label="Export formatter"
        formatter={settings().exportFormatter}
        update={(key, value) => updateFormatter(key, value, true)}
      />
      <PanelButton
        type="button"
        data-testid="settings-apply-editor-formatter-button"
        onClick={() => props.context.kernel.documents.reformatActiveCode(settings().formatter)}
      >
        Apply editor formatter
      </PanelButton>
    </>
  );
}

function OptimizerSettingsSection(props: { readonly context: EditorPanelContext }) {
  const settings = () => props.context.kernel.settings.settings();

  return (
    <>
      <CheckboxField>
        <FormInput
          type="checkbox"
          data-testid="settings-optimizer-remove-comments"
          checked={settings().optimizer.removeComments}
          onChange={(event) =>
            props.context.kernel.settings.setSettings((current) => ({
              ...current,
              optimizer: { ...current.optimizer, removeComments: event.currentTarget.checked }
            }))
          }
        />
        Remove comments
      </CheckboxField>
      <CheckboxField>
        <FormInput
          type="checkbox"
          data-testid="settings-optimizer-convert-shapes"
          checked={settings().optimizer.convertShapes}
          onChange={(event) =>
            props.context.kernel.settings.setSettings((current) => ({
              ...current,
              optimizer: { ...current.optimizer, convertShapes: event.currentTarget.checked }
            }))
          }
        />
        Convert shapes
      </CheckboxField>
      <CheckboxField>
        <FormInput
          type="checkbox"
          data-testid="settings-optimizer-simplify-path-parameters"
          checked={settings().optimizer.simplifyPathParameters}
          onChange={(event) =>
            props.context.kernel.settings.setSettings((current) => ({
              ...current,
              optimizer: { ...current.optimizer, simplifyPathParameters: event.currentTarget.checked }
            }))
          }
        />
        Simplify path parameters
      </CheckboxField>
    </>
  );
}

function PaletteSettingsSection(props: { readonly context: EditorPanelContext }) {
  const settings = () => props.context.kernel.settings.settings();

  return (
    <div class="palette-list flex flex-wrap gap-2" data-testid="settings-palette-list">
      {settings().palettes.map((color, index) => (
        <FormInput
          type="color"
          data-testid={`settings-palette-color-${index}`}
          value={color}
          onInput={(event) =>
            props.context.kernel.settings.setSettings((current) => ({
              ...current,
              palettes: current.palettes.map((item, itemIndex) => (itemIndex === index ? event.currentTarget.value : item))
            }))
          }
        />
      ))}
    </div>
  );
}

function ShortcutSettingsSection(props: { readonly context: EditorPanelContext }) {
  return <ShortcutTable items={shortcutItemsFromShortcuts(props.context.kernel.registries.shortcuts)} />;
}

function ExtensionsSettingsSection(props: { readonly context: EditorPanelContext }) {
  const packageStates = () => props.context.kernel.registries.packageStates;
  const packageLoadOrder = () => props.context.kernel.registries.packageLoadOrder;
  const packageDependencyGraph = () => props.context.kernel.registries.packageDependencyGraph;
  const packageCompatibility = () => props.context.kernel.registries.packageCompatibility;
  const packageUpdates = () => props.context.kernel.registries.packageUpdates;
  const disabledPackageIds = () => props.context.kernel.settings.disabledExtensionPackageIds();
  const appliedMigrationKeys = () => props.context.kernel.settings.appliedExtensionPackageMigrationKeys();
  const appliedUpdateKeys = () => props.context.kernel.settings.appliedExtensionPackageUpdateKeys();
  const health = () => props.context.kernel.registries.health;
  const diagnostics = () =>
    createEditorRegistryDiagnostics(props.context.kernel.registries.issues, {
      contributionSources: props.context.kernel.registries.contributionSources
    });

  return (
    <div class="grid gap-2.5" data-testid="settings-extensions">
      <section class="grid gap-1.5 rounded-md border border-[var(--soft-border)] p-2">
        <h3 class="m-0 text-[13px]">Health</h3>
        <p class="m-0 text-[var(--muted)]" data-testid="settings-extension-health-status">
          {health().status}
        </p>
        <p class="m-0 text-[var(--muted)]" data-testid="settings-extension-health-packages">
          packages {health().activePackageCount} active, {health().disabledPackageCount} disabled, {health().blockedPackageCount} blocked
        </p>
        <p class="m-0 text-[var(--muted)]" data-testid="settings-extension-health-issues">
          issues {health().errorCount} errors, {health().warningCount} warnings
        </p>
      </section>
      <section class="grid gap-1.5 rounded-md border border-[var(--soft-border)] p-2">
        <h3 class="m-0 text-[13px]">Packages</h3>
        <p class="m-0 text-[var(--muted)]" data-testid="settings-extension-package-count">
          {packageStates().length}
        </p>
        <ul class="m-0 grid list-none gap-1 p-0" data-testid="settings-extension-packages">
          {packageStates().length === 0 ? (
            <li data-testid="settings-extension-package-none">none</li>
          ) : (
            packageStates().map((packageState) => {
              const packageId = packageState.installedPackage.manifest.id;
              const packageDisabled = () => isExtensionPackageIdDisabled(disabledPackageIds(), packageId);
              const compatibility = () => packageCompatibility().find((entry) => entry.packageId === packageId);
              const migrationIds = () => compatibility()?.migrationIds ?? [];
              const migrationsApplied = () =>
                areExtensionPackageMigrationsApplied(appliedMigrationKeys(), packageId, migrationIds());
              const readyUpdate = () =>
                packageUpdates().find((packageUpdate) => packageUpdate.packageId === packageId && packageUpdate.status === 'ready');
              const updateApplied = () => {
                const update = readyUpdate();

                return update ? isExtensionPackageUpdateApplied(appliedUpdateKeys(), packageId, update.availableVersion) : false;
              };

              return (
                <li class="grid gap-0.5" data-testid={`settings-extension-package-${packageId}`}>
                  <span data-testid={`settings-extension-package-label-${packageId}`}>
                    {packageState.installedPackage.manifest.name} {packageState.installedPackage.manifest.version}
                  </span>
                  <CheckboxField>
                    <FormInput
                      type="checkbox"
                      data-testid={`settings-extension-package-enabled-${packageId}`}
                      checked={!packageDisabled()}
                      onChange={(event) =>
                        props.context.kernel.settings.setExtensionPackageEnabled(packageId, event.currentTarget.checked)
                      }
                    />
                    Enabled
                  </CheckboxField>
                  <span class="text-[var(--muted)]" data-testid={`settings-extension-package-enablement-${packageId}`}>
                    launch policy {packageDisabled() ? 'disabled' : 'enabled'}
                  </span>
                  <span class="text-[var(--muted)]" data-testid={`settings-extension-package-status-${packageId}`}>
                    status {formatExtensionPackageActivation(packageState.activation)}
                  </span>
                  <span class="text-[var(--muted)]" data-testid={`settings-extension-package-detail-${packageId}`}>
                    {packageId} - api {packageState.installedPackage.manifest.editorApiVersion} - contributes{' '}
                    {formatInstalledPackageContributions(packageState.installedPackage)}
                  </span>
                  <span class="text-[var(--muted)]" data-testid={`settings-extension-package-compatibility-${packageId}`}>
                    compatibility {formatInstalledPackageCompatibility(packageState.installedPackage, packageCompatibility())}
                  </span>
                  <span class="text-[var(--muted)]" data-testid={`settings-extension-package-migrations-${packageId}`}>
                    migrations {formatInstalledPackageMigrations(packageState.installedPackage.manifest)}
                  </span>
                  <span class="text-[var(--muted)]" data-testid={`settings-extension-package-migration-policy-${packageId}`}>
                    migration policy {migrationIds().length === 0 ? 'none' : migrationsApplied() ? 'applied' : 'pending'}
                  </span>
                  <span class="text-[var(--muted)]" data-testid={`settings-extension-package-updates-${packageId}`}>
                    updates {formatInstalledPackageUpdates(packageState.installedPackage, packageUpdates())}
                  </span>
                  <span class="text-[var(--muted)]" data-testid={`settings-extension-package-update-policy-${packageId}`}>
                    update policy {readyUpdate() ? updateApplied() ? 'applied' : 'pending' : 'none'}
                  </span>
                  {readyUpdate() && !updateApplied() ? (
                    <PanelButton
                      type="button"
                      data-testid={`settings-extension-package-apply-update-${packageId}`}
                      onClick={() => {
                        const update = readyUpdate();

                        if (update) {
                          props.context.kernel.settings.setExtensionPackageUpdateApplied(packageId, update.availableVersion, true);
                        }
                      }}
                    >
                      Apply update on next launch
                    </PanelButton>
                  ) : null}
                  {compatibility()?.status === 'needs-migration' ? (
                    <PanelButton
                      type="button"
                      data-testid={`settings-extension-package-apply-migrations-${packageId}`}
                      onClick={() =>
                        props.context.kernel.settings.setExtensionPackageMigrationsApplied(packageId, migrationIds(), true)
                      }
                    >
                      Mark migrations applied
                    </PanelButton>
                  ) : null}
                  <span class="text-[var(--muted)]" data-testid={`settings-extension-package-dependencies-${packageId}`}>
                    depends on {formatExtensionPackageDependencies(packageState.installedPackage.manifest)}
                  </span>
                  <span class="text-[var(--muted)]" data-testid={`settings-extension-package-load-order-${packageId}`}>
                    load order {formatInstalledPackageLoadOrder(packageState.installedPackage, packageLoadOrder())}
                  </span>
                  <span class="text-[var(--muted)]" data-testid={`settings-extension-package-dependents-${packageId}`}>
                    required by {formatInstalledPackageDependents(packageState.installedPackage, packageDependencyGraph())}
                  </span>
                </li>
              );
            })
          )}
        </ul>
      </section>
      <section class="grid gap-1.5 rounded-md border border-[var(--soft-border)] p-2">
        <h3 class="m-0 text-[13px]">Diagnostics</h3>
        <p class="m-0 text-[var(--muted)]" data-testid="settings-extension-diagnostic-count">
          {diagnostics().length}
        </p>
        <ul class="m-0 grid list-none gap-1 p-0" data-testid="settings-extension-diagnostics">
          {diagnostics().length === 0 ? (
            <li data-testid="settings-extension-diagnostic-none">none</li>
          ) : (
            diagnostics().map((diagnostic) => (
              <li class="grid gap-0.5" data-testid={`settings-extension-diagnostic-${diagnostic.id}`}>
                <span data-testid={`settings-extension-diagnostic-message-${diagnostic.id}`}>
                  {diagnostic.severity}: {diagnostic.message}
                </span>
                <span class="text-[var(--muted)]" data-testid={`settings-extension-diagnostic-detail-${diagnostic.id}`}>
                  {diagnostic.detail}
                </span>
                <span data-testid={`settings-extension-diagnostic-fix-${diagnostic.id}`}>{diagnostic.fix}</span>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}

function ThemingSettingsSection(props: { readonly context: EditorPanelContext }) {
  const settings = () => props.context.kernel.settings.settings();

  return (
    <>
      <SettingsField>
        Theme
        <FormSelect
          value={settings().themePreset}
          data-testid="settings-theme-select"
          onChange={(event) =>
            props.context.kernel.settings.setSettings((current) =>
              themePresetSettings(event.currentTarget.value as ThemePreset, current)
            )
          }
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="black">Black (OLED)</option>
          <option value="gray">Gray</option>
        </FormSelect>
      </SettingsField>
      <SettingsField>
        Accent
        <FormInput
          type="color"
          data-testid="settings-accent-color"
          value={settings().accentColor}
          onInput={(event) =>
            props.context.kernel.settings.setSettings((current) => ({ ...current, accentColor: event.currentTarget.value }))
          }
        />
      </SettingsField>
      <SettingsField>
        Canvas
        <FormInput
          type="color"
          data-testid="settings-canvas-color"
          value={settings().canvasColor}
          onInput={(event) =>
            props.context.kernel.settings.setSettings((current) => ({ ...current, canvasColor: event.currentTarget.value }))
          }
        />
      </SettingsField>
      <SettingsField>
        Grid
        <FormInput
          type="color"
          data-testid="settings-grid-color"
          value={settings().gridColor}
          onInput={(event) =>
            props.context.kernel.settings.setSettings((current) => ({ ...current, gridColor: event.currentTarget.value }))
          }
        />
      </SettingsField>
    </>
  );
}

function TabBarSettingsSection(props: { readonly context: EditorPanelContext }) {
  const settings = () => props.context.kernel.settings.settings();

  return (
    <CheckboxField>
      <FormInput
        type="checkbox"
        data-testid="settings-tab-middle-click-close"
        checked={settings().tabMiddleClickClose}
        onChange={(event) =>
          props.context.kernel.settings.setSettings((current) => ({
            ...current,
            tabMiddleClickClose: event.currentTarget.checked
          }))
        }
      />
      Middle click closes tab
    </CheckboxField>
  );
}

function OtherSettingsSection(props: { readonly context: EditorPanelContext }) {
  const settings = () => props.context.kernel.settings.settings();

  return (
    <>
      <CheckboxField>
        <FormInput
          type="checkbox"
          data-testid="settings-use-ctrl-for-zoom"
          checked={settings().useCtrlForZoom}
          onChange={(event) =>
            props.context.kernel.settings.setSettings((current) => ({ ...current, useCtrlForZoom: event.currentTarget.checked }))
          }
        />
        Ctrl wheel zoom
      </CheckboxField>
      <CheckboxField>
        <FormInput
          type="checkbox"
          data-testid="settings-raster-preview-during-interaction"
          checked={settings().rasterPreviewDuringInteraction}
          onChange={(event) =>
            props.context.kernel.settings.setSettings((current) => ({
              ...current,
              rasterPreviewDuringInteraction: event.currentTarget.checked
            }))
          }
        />
        Raster preview while panning or zooming
      </CheckboxField>
    </>
  );
}
