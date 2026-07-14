import { coreActionContribution } from '../../editor/actions/coreActionContribution';
import { coreCommandContribution } from '../../editor/commands/coreCommandContribution';
import { createSvgCapabilityRegistry, type SvgCapabilityRegistry } from '../../editor/capabilities';
import { createEditorRegistries } from '../../editor/contributions';
import {
  activeExtensionPackages,
  createExtensionPackageUpdateKey,
  installedExtensionPackages,
  normalizeExtensionPackageUpdateKeys,
  type EditorExtensionPackage,
  type EditorExtensionPackageActivationOptions
} from '../../editor/extension-packages';
import type { EditorAvailablePackageUpdate, EditorContribution, EditorContributionSource } from '../../editor/kernel';
import { coreSvgCapabilityContributions } from '../../editor/svg-capabilities/coreSvgContribution';
import { coreTopBarMenuContribution } from '../chrome/topBarMenuContribution';
import { coreModalContribution } from '../modals/modalContribution';
import { coreSettingsSectionContribution } from '../modals/settingsContribution';
import { corePanelContribution, type EditorPanelContext } from '../panels/panelRegistry';
import { coreContextMenuContribution } from '../selection/contextMenuContribution';
import { coreShortcutContribution } from '../shortcuts/shortcutRegistry';
import { coreViewportLayerContribution } from '../viewport/viewportLayerContribution';
import { coreViewportOverlayContribution } from '../viewport/viewportOverlayContribution';
import { coreViewportToolbarContribution } from '../viewport/viewportToolbarContribution';
import { coreViewportToolContribution } from '../viewport/tools/defaultViewportTools';

export type EditorAppContribution = EditorContribution<EditorPanelContext>;
export type EditorAppExtensionPackage = EditorExtensionPackage<EditorPanelContext>;

export interface EditorAppExtensionPackageUpdate {
  readonly package: EditorAppExtensionPackage;
  readonly migrationIds?: readonly string[];
  readonly notes?: string;
  readonly url?: string;
}

export interface EditorAppContributionInstallOptions extends EditorExtensionPackageActivationOptions {
  readonly contributions?: readonly EditorAppContribution[];
  readonly packages?: readonly EditorAppExtensionPackage[];
  readonly packageUpdates?: readonly EditorAppExtensionPackageUpdate[];
  readonly appliedUpdateKeys?: readonly string[];
}

type EditorAppContributionInstallInput =
  | readonly EditorAppContribution[]
  | EditorAppContributionInstallOptions;

export const coreEditorAppContributions = [
  coreActionContribution,
  coreCommandContribution,
  coreTopBarMenuContribution,
  coreContextMenuContribution,
  coreModalContribution,
  coreSettingsSectionContribution,
  corePanelContribution,
  coreShortcutContribution,
  coreViewportToolbarContribution,
  coreViewportLayerContribution,
  coreViewportOverlayContribution,
  coreViewportToolContribution,
  { id: 'core.svg', svg: coreSvgCapabilityContributions }
] as const satisfies readonly EditorAppContribution[];

interface EditorAppContributionEntry {
  readonly contribution: EditorAppContribution;
  readonly source: EditorContributionSource;
}

export function createEditorAppContributions(
  options: EditorAppContributionInstallInput = []
): readonly EditorAppContribution[] {
  return createEditorAppContributionEntries(options).map((entry) => entry.contribution);
}

export function createEditorAppRegistries(
  options: EditorAppContributionInstallInput = []
) {
  const contributionEntries = createEditorAppContributionEntries(options);

  return createEditorRegistries<EditorPanelContext>(contributionEntries.map((entry) => entry.contribution), {
    packages: installedExtensionPackages(externalEditorAppPackages(options)),
    disabledPackageIds: disabledEditorAppPackageIds(options),
    appliedMigrationKeys: appliedEditorAppMigrationKeys(options),
    availablePackageUpdates: availableEditorAppPackageUpdates(options),
    contributionSources: contributionEntries.map((entry) => entry.source)
  });
}

export function createEditorAppSvgCapabilities(
  options: EditorAppContributionInstallInput = []
): SvgCapabilityRegistry {
  return createSvgCapabilityRegistry(createEditorAppRegistries(options).svg);
}

function createEditorAppContributionEntries(
  options: EditorAppContributionInstallInput
): readonly EditorAppContributionEntry[] {
  return [
    ...coreEditorAppContributions.map(
      (contribution) =>
        ({
          contribution,
          source: {
            kind: 'core',
            contributionId: contribution.id
          }
        }) satisfies EditorAppContributionEntry
    ),
    ...externalEditorAppContributionEntries(options)
  ];
}

function externalEditorAppContributionEntries(
  options: EditorAppContributionInstallInput
): readonly EditorAppContributionEntry[] {
  const packages = externalEditorAppPackages(options);
  const activePackages = activeExtensionPackages(packages, {
    disabledPackageIds: disabledEditorAppPackageIds(options),
    appliedMigrationKeys: appliedEditorAppMigrationKeys(options)
  });

  return [
    ...externalRawEditorAppContributions(options).map(
      (contribution) =>
        ({
          contribution,
          source: {
            kind: 'raw',
            contributionId: contribution.id
          }
        }) satisfies EditorAppContributionEntry
    ),
    ...activePackages.flatMap((extensionPackage) =>
      extensionPackage.contributions.map(
        (contribution) =>
          ({
            contribution,
            source: {
              kind: 'package',
              contributionId: contribution.id,
              packageId: extensionPackage.manifest.id
            }
          }) satisfies EditorAppContributionEntry
      )
    )
  ];
}

function isEditorAppContributionArray(
  options: EditorAppContributionInstallInput
): options is readonly EditorAppContribution[] {
  return Array.isArray(options);
}

function externalRawEditorAppContributions(
  options: EditorAppContributionInstallInput
): readonly EditorAppContribution[] {
  return isEditorAppContributionArray(options) ? options : options.contributions ?? [];
}

function externalEditorAppPackages(
  options: EditorAppContributionInstallInput
): readonly EditorAppExtensionPackage[] {
  if (isEditorAppContributionArray(options)) {
    return [];
  }

  return applyEditorAppPackageUpdates(options.packages ?? [], options.packageUpdates ?? [], appliedEditorAppUpdateKeys(options));
}

function disabledEditorAppPackageIds(
  options: EditorAppContributionInstallInput
): readonly string[] {
  return isEditorAppContributionArray(options) ? [] : options.disabledPackageIds ?? [];
}

function appliedEditorAppMigrationKeys(
  options: EditorAppContributionInstallInput
): readonly string[] {
  return isEditorAppContributionArray(options) ? [] : options.appliedMigrationKeys ?? [];
}

function availableEditorAppPackageUpdates(
  options: EditorAppContributionInstallInput
): readonly EditorAvailablePackageUpdate[] {
  if (isEditorAppContributionArray(options)) {
    return [];
  }

  return [...(options.availablePackageUpdates ?? []), ...availableEditorAppPackageUpdatesFromPackages(options.packageUpdates ?? [])];
}

function appliedEditorAppUpdateKeys(
  options: EditorAppContributionInstallInput
): readonly string[] {
  return isEditorAppContributionArray(options) ? [] : options.appliedUpdateKeys ?? [];
}

function availableEditorAppPackageUpdatesFromPackages(
  packageUpdates: readonly EditorAppExtensionPackageUpdate[]
): readonly EditorAvailablePackageUpdate[] {
  return packageUpdates.map((packageUpdate) => {
    const manifest = packageUpdate.package.manifest;

    return {
      packageId: manifest.id,
      version: manifest.version,
      editorApiVersion: manifest.editorApiVersion,
      ...(packageUpdate.migrationIds === undefined ? {} : { migrationIds: packageUpdate.migrationIds }),
      ...(packageUpdate.notes === undefined ? {} : { notes: packageUpdate.notes }),
      ...(packageUpdate.url === undefined ? {} : { url: packageUpdate.url })
    } satisfies EditorAvailablePackageUpdate;
  });
}

function applyEditorAppPackageUpdates(
  packages: readonly EditorAppExtensionPackage[],
  packageUpdates: readonly EditorAppExtensionPackageUpdate[],
  appliedUpdateKeys: readonly string[]
): readonly EditorAppExtensionPackage[] {
  const appliedUpdateKeySet = new Set(normalizeExtensionPackageUpdateKeys(appliedUpdateKeys));

  return packages.map((extensionPackage) => {
    const packageId = extensionPackage.manifest.id.trim();
    const appliedUpdate = [...packageUpdates]
      .reverse()
      .find((packageUpdate) => {
        const updateManifest = packageUpdate.package.manifest;

        return (
          updateManifest.id.trim() === packageId &&
          appliedUpdateKeySet.has(createExtensionPackageUpdateKey(packageId, updateManifest.version))
        );
      });

    return appliedUpdate?.package ?? extensionPackage;
  });
}
