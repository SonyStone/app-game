import { createEditorRegistries } from '../../editor/contributions';
import {
  setAppliedExtensionPackageMigrations,
  setAppliedExtensionPackageUpdate,
  setDisabledExtensionPackageId
} from '../../editor/extension-packages';
import { svgCapabilities } from '../../editor/capabilities';
import type {
  CapabilityService,
  CommandService,
  DocumentService,
  EditorContribution,
  EditorKernel,
  EditorRegistries,
  InputStateService,
  RenderingService,
  ResourceService,
  SelectionService,
  SettingsService,
  SettingsStore,
  UiService,
  ViewportService
} from '../../editor/kernel';

export interface CreateEditorKernelOptions<TPanelContext = unknown> {
  readonly documents: DocumentService;
  readonly selection: SelectionService;
  readonly commands: CommandService;
  readonly settings: SettingsStore | SettingsService;
  readonly viewport: ViewportService;
  readonly resources: ResourceService;
  readonly capabilities?: CapabilityService;
  readonly rendering?: RenderingService;
  readonly input: InputStateService;
  readonly ui: UiService;
  readonly registries?: EditorRegistries<TPanelContext>;
  readonly contributions?: readonly EditorContribution<TPanelContext>[];
}

export function createEditorKernel<TPanelContext = unknown>(
  options: CreateEditorKernelOptions<TPanelContext>
): EditorKernel<TPanelContext> {
  const registries = options.registries ?? createEditorRegistries(options.contributions ?? []);
  const settings = createSettingsService(options.settings);

  return {
    documents: options.documents,
    selection: options.selection,
    commands: options.commands,
    settings,
    viewport: options.viewport,
    resources: options.resources,
    capabilities: options.capabilities ?? { svg: svgCapabilities },
    rendering: options.rendering ?? { svgNodeRenderer: undefined, viewportRenderer: undefined },
    input: options.input,
    ui: options.ui,
    registries
  } satisfies EditorKernel<TPanelContext>;
}

function createSettingsService(settings: SettingsStore | SettingsService): SettingsService {
  if (
    'disabledExtensionPackageIds' in settings &&
    'appliedExtensionPackageMigrationKeys' in settings &&
    'appliedExtensionPackageUpdateKeys' in settings &&
    'setExtensionPackageEnabled' in settings &&
    'setExtensionPackageMigrationsApplied' in settings &&
    'setExtensionPackageUpdateApplied' in settings
  ) {
    return settings;
  }

  return {
    settings: settings.settings,
    setSettings: settings.setSettings,
    disabledExtensionPackageIds: () => settings.settings().disabledExtensionPackageIds ?? [],
    appliedExtensionPackageMigrationKeys: () => settings.settings().appliedExtensionPackageMigrationKeys ?? [],
    appliedExtensionPackageUpdateKeys: () => settings.settings().appliedExtensionPackageUpdateKeys ?? [],
    setExtensionPackageEnabled: (packageId, enabled) => {
      settings.setSettings((current) => ({
        ...current,
        disabledExtensionPackageIds: setDisabledExtensionPackageId(
          current.disabledExtensionPackageIds ?? [],
          packageId,
          !enabled
        )
      }));
    },
    setExtensionPackageMigrationsApplied: (packageId, migrationIds, applied) => {
      settings.setSettings((current) => ({
        ...current,
        appliedExtensionPackageMigrationKeys: setAppliedExtensionPackageMigrations(
          current.appliedExtensionPackageMigrationKeys ?? [],
          packageId,
          migrationIds,
          applied
        )
      }));
    },
    setExtensionPackageUpdateApplied: (packageId, version, applied) => {
      settings.setSettings((current) => ({
        ...current,
        appliedExtensionPackageUpdateKeys: setAppliedExtensionPackageUpdate(
          current.appliedExtensionPackageUpdateKeys ?? [],
          packageId,
          version,
          applied
        )
      }));
    }
  } satisfies SettingsService;
}
