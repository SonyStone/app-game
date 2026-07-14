import type {
  EditorAvailablePackageUpdate,
  EditorContribution,
  EditorExtensionPackageActivation,
  EditorExtensionPackageDisabledReason,
  EditorExtensionPackageDependency,
  EditorExtensionPackageManifest,
  EditorExtensionPackageMigration,
  EditorInstalledPackageCompatibility,
  EditorInstalledPackageDependencyGraphEntry,
  EditorInstalledPackage,
  EditorInstalledPackageState,
  EditorInstalledPackageUpdate,
  EditorRegistryIssue
} from './kernel';

export const currentEditorExtensionApiVersion = 1;

export interface EditorExtensionPackage<TPanelContext = unknown> {
  readonly manifest: EditorExtensionPackageManifest;
  readonly contributions: readonly EditorContribution<TPanelContext>[];
}

export interface EditorExtensionPackageActivationOptions {
  readonly disabledPackageIds?: readonly string[];
  readonly appliedMigrationKeys?: readonly string[];
  readonly availablePackageUpdates?: readonly EditorAvailablePackageUpdate[];
}

export function normalizeExtensionPackageIds(packageIds: readonly string[]): readonly string[] {
  return [...new Set(packageIds.map((packageId) => packageId.trim()).filter(Boolean))];
}

export function mergeExtensionPackageIds(...packageIdLists: readonly (readonly string[])[]): readonly string[] {
  return normalizeExtensionPackageIds(packageIdLists.flat());
}

export function normalizeExtensionPackageMigrationKeys(migrationKeys: readonly string[]): readonly string[] {
  return [...new Set(migrationKeys.map((migrationKey) => migrationKey.trim()).filter(Boolean))];
}

export function normalizeExtensionPackageUpdateKeys(updateKeys: readonly string[]): readonly string[] {
  return [...new Set(updateKeys.map((updateKey) => updateKey.trim()).filter(Boolean))];
}

export function mergeExtensionPackageMigrationKeys(
  ...migrationKeyLists: readonly (readonly string[])[]
): readonly string[] {
  return normalizeExtensionPackageMigrationKeys(migrationKeyLists.flat());
}

export function mergeExtensionPackageUpdateKeys(
  ...updateKeyLists: readonly (readonly string[])[]
): readonly string[] {
  return normalizeExtensionPackageUpdateKeys(updateKeyLists.flat());
}

export function createExtensionPackageMigrationKey(packageId: string, migrationId: string): string {
  const normalizedPackageId = packageId.trim();
  const normalizedMigrationId = migrationId.trim();

  return normalizedPackageId && normalizedMigrationId ? `${normalizedPackageId}:${normalizedMigrationId}` : '';
}

export function createExtensionPackageUpdateKey(packageId: string, version: string): string {
  const normalizedPackageId = packageId.trim();
  const normalizedVersion = version.trim();

  return normalizedPackageId && normalizedVersion ? `${normalizedPackageId}:${normalizedVersion}` : '';
}

export function isExtensionPackageUpdateApplied(
  appliedUpdateKeys: readonly string[],
  packageId: string,
  version: string
): boolean {
  const updateKey = createExtensionPackageUpdateKey(packageId, version);

  return updateKey ? normalizeExtensionPackageUpdateKeys(appliedUpdateKeys).includes(updateKey) : false;
}

export function setAppliedExtensionPackageUpdate(
  appliedUpdateKeys: readonly string[],
  packageId: string,
  version: string,
  applied: boolean
): readonly string[] {
  const normalizedUpdateKeys = normalizeExtensionPackageUpdateKeys(appliedUpdateKeys);
  const updateKey = createExtensionPackageUpdateKey(packageId, version);

  if (!updateKey) {
    return normalizedUpdateKeys;
  }

  if (applied) {
    return mergeExtensionPackageUpdateKeys(normalizedUpdateKeys, [updateKey]);
  }

  return normalizedUpdateKeys.filter((appliedUpdateKey) => appliedUpdateKey !== updateKey);
}

export function areExtensionPackageMigrationsApplied(
  appliedMigrationKeys: readonly string[],
  packageId: string,
  migrationIds: readonly string[]
): boolean {
  const appliedMigrationKeySet = new Set(normalizeExtensionPackageMigrationKeys(appliedMigrationKeys));
  const migrationKeys = migrationIds
    .map((migrationId) => createExtensionPackageMigrationKey(packageId, migrationId))
    .filter(Boolean);

  return migrationKeys.length > 0 && migrationKeys.every((migrationKey) => appliedMigrationKeySet.has(migrationKey));
}

export function setAppliedExtensionPackageMigrations(
  appliedMigrationKeys: readonly string[],
  packageId: string,
  migrationIds: readonly string[],
  applied: boolean
): readonly string[] {
  const currentMigrationKeys = normalizeExtensionPackageMigrationKeys(appliedMigrationKeys);
  const nextMigrationKeys = migrationIds
    .map((migrationId) => createExtensionPackageMigrationKey(packageId, migrationId))
    .filter(Boolean);

  if (nextMigrationKeys.length === 0) {
    return currentMigrationKeys;
  }

  if (applied) {
    return mergeExtensionPackageMigrationKeys(currentMigrationKeys, nextMigrationKeys);
  }

  const removedMigrationKeys = new Set(nextMigrationKeys);

  return currentMigrationKeys.filter((migrationKey) => !removedMigrationKeys.has(migrationKey));
}

export function isExtensionPackageIdDisabled(disabledPackageIds: readonly string[], packageId: string): boolean {
  return normalizeExtensionPackageIds(disabledPackageIds).includes(packageId.trim());
}

export function setDisabledExtensionPackageId(
  disabledPackageIds: readonly string[],
  packageId: string,
  disabled: boolean
): readonly string[] {
  const normalizedPackageId = packageId.trim();

  if (!normalizedPackageId) {
    return normalizeExtensionPackageIds(disabledPackageIds);
  }

  if (disabled) {
    return mergeExtensionPackageIds(disabledPackageIds, [normalizedPackageId]);
  }

  return normalizeExtensionPackageIds(disabledPackageIds).filter((disabledPackageId) => disabledPackageId !== normalizedPackageId);
}

export function extensionPackageContributions<TPanelContext>(
  packages: readonly EditorExtensionPackage<TPanelContext>[] = []
): readonly EditorContribution<TPanelContext>[] {
  return packages.flatMap((extensionPackage) => extensionPackage.contributions);
}

export function activeExtensionPackageContributions<TPanelContext>(
  packages: readonly EditorExtensionPackage<TPanelContext>[] = [],
  options: EditorExtensionPackageActivationOptions = {}
): readonly EditorContribution<TPanelContext>[] {
  return extensionPackageContributions(activeExtensionPackages(packages, options));
}

export function activeExtensionPackages<TPanelContext>(
  packages: readonly EditorExtensionPackage<TPanelContext>[] = [],
  options: EditorExtensionPackageActivationOptions = {}
): readonly EditorExtensionPackage<TPanelContext>[] {
  const installedPackages = installedExtensionPackages(packages);
  const states = createInstalledPackageStates(installedPackages, createPackageRegistryIssues(installedPackages, options), options);
  const activePackages = packages.filter((_, index) => states[index]?.activation.status === 'active');

  return sortPackagesByDependencies(activePackages);
}

export function installedExtensionPackages<TPanelContext>(
  packages: readonly EditorExtensionPackage<TPanelContext>[] = []
): readonly EditorInstalledPackage[] {
  return packages.map((extensionPackage) => ({
    manifest: extensionPackage.manifest,
    contributionIds: extensionPackage.contributions.map((contribution) => contribution.id)
  }));
}

export function createPackageRegistryIssues(
  packages: readonly EditorInstalledPackage[],
  options: EditorExtensionPackageActivationOptions = {}
): readonly EditorRegistryIssue[] {
  const directIssues = [
    ...duplicatePackageIssues(packages),
    ...invalidPackageIssues(packages),
    ...packageCompatibilityIssues(packages, options),
    ...packageDependencyIssues(packages),
    ...packageDependencyCycleIssues(packages),
    ...packageUpdateIssues(packages, options)
  ];

  return [...directIssues, ...blockedPackageDependencyIssues(packages, directIssues)];
}

export function createInstalledPackageStates(
  packages: readonly EditorInstalledPackage[],
  packageIssues: readonly EditorRegistryIssue[] | undefined = undefined,
  options: EditorExtensionPackageActivationOptions = {}
): readonly EditorInstalledPackageState[] {
  const resolvedPackageIssues = packageIssues ?? createPackageRegistryIssues(packages, options);
  const disabledPackageIds = normalizedPackageIdSet(options.disabledPackageIds ?? []);
  const packageStates = packages.map((installedPackage) => {
    const blockingIssues = resolvedPackageIssues.filter((issue) => packageIssueTargetsPackage(issue, installedPackage));

    return {
      installedPackage,
      activation: createPackageActivation(installedPackage, blockingIssues, disabledPackageIds)
    } satisfies EditorInstalledPackageState;
  });

  return propagateDisabledPackageDependencies(packageStates);
}

export function createActivePackageLoadOrder(
  packages: readonly EditorInstalledPackage[],
  packageIssues: readonly EditorRegistryIssue[] | undefined = undefined,
  options: EditorExtensionPackageActivationOptions = {}
): readonly string[] {
  const resolvedPackageIssues = packageIssues ?? createPackageRegistryIssues(packages, options);
  const packageStates = createInstalledPackageStates(packages, resolvedPackageIssues, options);
  const activePackages = packages.filter((_, index) => packageStates[index]?.activation.status === 'active');

  return sortPackagesByDependencies(activePackages).map((installedPackage) => installedPackage.manifest.id.trim());
}

export function createInstalledPackageDependencyGraph(
  packages: readonly EditorInstalledPackage[]
): readonly EditorInstalledPackageDependencyGraphEntry[] {
  const installedPackageIds = new Set(packages.map((installedPackage) => installedPackage.manifest.id.trim()).filter(Boolean));
  const dependencyIdsByPackageId = new Map<string, readonly string[]>();
  const dependentIdsByPackageId = new Map<string, string[]>();

  for (const installedPackage of packages) {
    const packageId = installedPackage.manifest.id.trim();

    if (!packageId) {
      continue;
    }

    const dependencyIds = uniqueDependencyIds(installedPackage.manifest.dependencies ?? [], packageId);
    dependencyIdsByPackageId.set(packageId, dependencyIds);

    for (const dependencyId of dependencyIds) {
      if (!installedPackageIds.has(dependencyId)) {
        continue;
      }

      const dependentIds = dependentIdsByPackageId.get(dependencyId);

      if (dependentIds) {
        dependentIds.push(packageId);
      } else {
        dependentIdsByPackageId.set(dependencyId, [packageId]);
      }
    }
  }

  return packages.map((installedPackage) => {
    const packageId = installedPackage.manifest.id.trim();

    return {
      packageId,
      dependencyIds: dependencyIdsByPackageId.get(packageId) ?? [],
      dependentIds: dependentIdsByPackageId.get(packageId) ?? []
    } satisfies EditorInstalledPackageDependencyGraphEntry;
  });
}

export function createInstalledPackageCompatibility(
  packages: readonly EditorInstalledPackage[],
  options: EditorExtensionPackageActivationOptions = {}
): readonly EditorInstalledPackageCompatibility[] {
  return packages.map((installedPackage) => createPackageCompatibility(installedPackage.manifest, options));
}

export function createInstalledPackageUpdates(
  packages: readonly EditorInstalledPackage[],
  updates: readonly EditorAvailablePackageUpdate[] = []
): readonly EditorInstalledPackageUpdate[] {
  return packages.flatMap((installedPackage) =>
    matchingAvailablePackageUpdates(installedPackage, updates).map((update) =>
      createInstalledPackageUpdate(installedPackage, update)
    )
  );
}

function matchingAvailablePackageUpdates(
  installedPackage: EditorInstalledPackage,
  updates: readonly EditorAvailablePackageUpdate[]
): readonly EditorAvailablePackageUpdate[] {
  const packageId = installedPackage.manifest.id.trim();
  const installedVersion = installedPackage.manifest.version.trim();

  if (!packageId || !installedVersion) {
    return [];
  }

  return updates.filter((update) => {
    const updatePackageId = update.packageId.trim();
    const updateVersion = update.version.trim();

    return updatePackageId === packageId && updateVersion.length > 0 && updateVersion !== installedVersion;
  });
}

function createInstalledPackageUpdate(
  installedPackage: EditorInstalledPackage,
  update: EditorAvailablePackageUpdate
): EditorInstalledPackageUpdate {
  const packageId = installedPackage.manifest.id.trim();
  const installedVersion = installedPackage.manifest.version.trim();
  const availableVersion = update.version.trim();
  const migrationIds = normalizeMigrationIds(update.migrationIds ?? []);
  const currentEditorApiVersion = currentEditorExtensionApiVersion;
  const notes = update.notes?.trim();
  const url = update.url?.trim();

  if (update.editorApiVersion === currentEditorApiVersion) {
    return {
      packageId,
      installedVersion,
      availableVersion,
      editorApiVersion: update.editorApiVersion,
      currentEditorApiVersion,
      status: 'ready',
      migrationIds,
      message: `Update ${installedVersion} -> ${availableVersion} targets current editor extension API ${currentEditorApiVersion}.`,
      notes: notes || undefined,
      url: url || undefined
    } satisfies EditorInstalledPackageUpdate;
  }

  if (update.editorApiVersion > currentEditorApiVersion) {
    return {
      packageId,
      installedVersion,
      availableVersion,
      editorApiVersion: update.editorApiVersion,
      currentEditorApiVersion,
      status: 'incompatible',
      migrationIds,
      message: `Update ${installedVersion} -> ${availableVersion} targets newer editor extension API ${update.editorApiVersion}; current host API is ${currentEditorApiVersion}.`,
      notes: notes || undefined,
      url: url || undefined
    } satisfies EditorInstalledPackageUpdate;
  }

  if (migrationIds.length > 0) {
    return {
      packageId,
      installedVersion,
      availableVersion,
      editorApiVersion: update.editorApiVersion,
      currentEditorApiVersion,
      status: 'needs-migration',
      migrationIds,
      message: `Update ${installedVersion} -> ${availableVersion} targets editor extension API ${update.editorApiVersion}; migration path to API ${currentEditorApiVersion}: ${migrationIds.join(', ')}.`,
      notes: notes || undefined,
      url: url || undefined
    } satisfies EditorInstalledPackageUpdate;
  }

  return {
    packageId,
    installedVersion,
    availableVersion,
    editorApiVersion: update.editorApiVersion,
    currentEditorApiVersion,
    status: 'incompatible',
    migrationIds,
    message: `Update ${installedVersion} -> ${availableVersion} targets older editor extension API ${update.editorApiVersion} without a migration path to API ${currentEditorApiVersion}.`,
    notes: notes || undefined,
    url: url || undefined
  } satisfies EditorInstalledPackageUpdate;
}

function normalizeMigrationIds(migrationIds: readonly string[]): readonly string[] {
  return [...new Set(migrationIds.map((migrationId) => migrationId.trim()).filter(Boolean))];
}

function createPackageCompatibility(
  manifest: EditorExtensionPackageManifest,
  options: EditorExtensionPackageActivationOptions = {}
): EditorInstalledPackageCompatibility {
  const packageId = manifest.id.trim();
  const editorApiVersion = manifest.editorApiVersion;
  const currentEditorApiVersion = currentEditorExtensionApiVersion;

  if (editorApiVersion === currentEditorApiVersion) {
    return {
      packageId,
      status: 'compatible',
      editorApiVersion,
      currentEditorApiVersion,
      migrationIds: [],
      message: `Targets current editor extension API ${currentEditorApiVersion}.`
    } satisfies EditorInstalledPackageCompatibility;
  }

  if (editorApiVersion > currentEditorApiVersion) {
    return {
      packageId,
      status: 'incompatible',
      editorApiVersion,
      currentEditorApiVersion,
      migrationIds: [],
      message: `Targets newer editor extension API ${editorApiVersion}; current host API is ${currentEditorApiVersion}.`
    } satisfies EditorInstalledPackageCompatibility;
  }

  const migrationPath = migrationPathToEditorApiVersion(
    manifest.migrations ?? [],
    editorApiVersion,
    currentEditorApiVersion
  );

  if (migrationPath.length > 0) {
    const migrationIds = migrationPath.map((migration) => migration.id.trim());

    if (areExtensionPackageMigrationsApplied(options.appliedMigrationKeys ?? [], packageId, migrationIds)) {
      return {
        packageId,
        status: 'migrated',
        editorApiVersion,
        currentEditorApiVersion,
        migrationIds,
        message: `Targets editor extension API ${editorApiVersion}; migrations applied for API ${currentEditorApiVersion}: ${migrationIds.join(', ')}.`
      } satisfies EditorInstalledPackageCompatibility;
    }

    return {
      packageId,
      status: 'needs-migration',
      editorApiVersion,
      currentEditorApiVersion,
      migrationIds,
      message: `Targets editor extension API ${editorApiVersion}; migration path to API ${currentEditorApiVersion}: ${migrationIds.join(', ')}.`
    } satisfies EditorInstalledPackageCompatibility;
  }

  return {
    packageId,
    status: 'incompatible',
    editorApiVersion,
    currentEditorApiVersion,
    migrationIds: [],
    message: `Targets older editor extension API ${editorApiVersion} without a migration path to API ${currentEditorApiVersion}.`
  } satisfies EditorInstalledPackageCompatibility;
}

function migrationPathToEditorApiVersion(
  migrations: readonly EditorExtensionPackageMigration[],
  fromEditorApiVersion: number,
  toEditorApiVersion: number
): readonly EditorExtensionPackageMigration[] {
  return migrationPathStep(
    migrations.filter(isUsablePackageMigration),
    fromEditorApiVersion,
    toEditorApiVersion,
    new Set([fromEditorApiVersion])
  );
}

function migrationPathStep(
  migrations: readonly EditorExtensionPackageMigration[],
  fromEditorApiVersion: number,
  toEditorApiVersion: number,
  visitedApiVersions: ReadonlySet<number>
): readonly EditorExtensionPackageMigration[] {
  const candidates = migrations.filter((migration) => migration.fromEditorApiVersion === fromEditorApiVersion);

  for (const migration of candidates) {
    if (migration.toEditorApiVersion === toEditorApiVersion) {
      return [migration];
    }

    if (visitedApiVersions.has(migration.toEditorApiVersion)) {
      continue;
    }

    const nextPath = migrationPathStep(
      migrations,
      migration.toEditorApiVersion,
      toEditorApiVersion,
      new Set([...visitedApiVersions, migration.toEditorApiVersion])
    );

    if (nextPath.length > 0) {
      return [migration, ...nextPath];
    }
  }

  return [];
}

function isUsablePackageMigration(migration: EditorExtensionPackageMigration): boolean {
  return (
    migration.id.trim().length > 0 &&
    Number.isInteger(migration.fromEditorApiVersion) &&
    Number.isInteger(migration.toEditorApiVersion) &&
    migration.fromEditorApiVersion < migration.toEditorApiVersion &&
    migration.description.trim().length > 0
  );
}

function createPackageActivation(
  installedPackage: EditorInstalledPackage,
  blockingIssues: readonly EditorRegistryIssue[],
  disabledPackageIds: ReadonlySet<string>
): EditorExtensionPackageActivation {
  if (blockingIssues.length > 0) {
    return {
      status: 'blocked',
      issues: blockingIssues
    };
  }

  if (disabledPackageIds.has(installedPackage.manifest.id.trim())) {
    return {
      status: 'disabled',
      reason: { kind: 'host-disabled' }
    };
  }

  return {
    status: 'active'
  };
}

function propagateDisabledPackageDependencies(
  packageStates: readonly EditorInstalledPackageState[]
): readonly EditorInstalledPackageState[] {
  const nextPackageStates = [...packageStates];
  let changed = true;

  while (changed) {
    changed = false;
    const disabledPackageIds = new Set(
      nextPackageStates
        .filter((packageState) => packageState.activation.status === 'disabled')
        .map((packageState) => packageState.installedPackage.manifest.id.trim())
    );

    for (const [index, packageState] of nextPackageStates.entries()) {
      if (packageState.activation.status !== 'active') {
        continue;
      }

      const disabledDependency = (packageState.installedPackage.manifest.dependencies ?? []).find((dependency) =>
        disabledPackageIds.has(dependency.id.trim())
      );

      if (!disabledDependency) {
        continue;
      }

      nextPackageStates[index] = {
        installedPackage: packageState.installedPackage,
        activation: {
          status: 'disabled',
          reason: {
            kind: 'disabled-package-dependency',
            dependencyId: disabledDependency.id.trim()
          }
        }
      };
      changed = true;
    }
  }

  return nextPackageStates;
}

function normalizedPackageIdSet(packageIds: readonly string[]): ReadonlySet<string> {
  return new Set(normalizeExtensionPackageIds(packageIds));
}

function uniqueDependencyIds(
  dependencies: readonly EditorExtensionPackageDependency[],
  packageId: string
): readonly string[] {
  return [
    ...new Set(
      dependencies
        .map((dependency) => dependency.id.trim())
        .filter((dependencyId) => dependencyId && dependencyId !== packageId)
    )
  ];
}

function duplicatePackageIssues(packages: readonly EditorInstalledPackage[]): readonly EditorRegistryIssue[] {
  const counts = new Map<string, number>();

  for (const extensionPackage of packages) {
    counts.set(extensionPackage.manifest.id, (counts.get(extensionPackage.manifest.id) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id, count]) => ({ kind: 'duplicate-package-id', id, count }) satisfies EditorRegistryIssue);
}

function invalidPackageIssues(packages: readonly EditorInstalledPackage[]): readonly EditorRegistryIssue[] {
  return packages.flatMap((extensionPackage) => {
    const issues: EditorRegistryIssue[] = [];
    const { manifest } = extensionPackage;

    if (!manifest.id.trim()) {
      issues.push(invalidPackageIssue(manifest.id, 'Extension package manifests must provide a non-empty id.'));
    }

    if (!manifest.name.trim()) {
      issues.push(invalidPackageIssue(manifest.id, 'Extension package manifests must provide a non-empty name.'));
    }

    if (!manifest.version.trim()) {
      issues.push(invalidPackageIssue(manifest.id, 'Extension package manifests must provide a non-empty version.'));
    }

    for (const dependency of manifest.dependencies ?? []) {
      const dependencyId = dependency.id.trim();
      const dependencyVersion = dependency.version?.trim();

      if (!dependencyId) {
        issues.push(invalidPackageIssue(manifest.id, 'Extension package dependencies must provide a non-empty id.'));
      }

      if (dependencyId === manifest.id.trim()) {
        issues.push(invalidPackageIssue(manifest.id, `Extension packages cannot depend on themselves: "${dependencyId}".`));
      }

      if (dependency.version !== undefined && !dependencyVersion) {
        issues.push(
          invalidPackageIssue(manifest.id, `Extension package dependency "${dependency.id}" must provide a non-empty version.`)
        );
      }
    }

    for (const migration of manifest.migrations ?? []) {
      if (!migration.id.trim()) {
        issues.push(invalidPackageIssue(manifest.id, 'Extension package migrations must provide a non-empty id.'));
      }

      if (!Number.isInteger(migration.fromEditorApiVersion) || !Number.isInteger(migration.toEditorApiVersion)) {
        issues.push(
          invalidPackageIssue(manifest.id, `Extension package migration "${migration.id}" must use integer API versions.`)
        );
      }

      if (migration.fromEditorApiVersion === migration.toEditorApiVersion) {
        issues.push(
          invalidPackageIssue(manifest.id, `Extension package migration "${migration.id}" must move between different API versions.`)
        );
      }

      if (!migration.description.trim()) {
        issues.push(
          invalidPackageIssue(manifest.id, `Extension package migration "${migration.id}" must provide a non-empty description.`)
        );
      }
    }

    for (const [migrationId, count] of duplicatePackageMigrationCounts(manifest.migrations ?? [])) {
      if (count > 1) {
        issues.push(
          invalidPackageIssue(manifest.id, `Extension package manifests must not repeat migration "${migrationId}".`)
        );
      }
    }

    for (const [dependencyId, count] of duplicatePackageDependencyCounts(manifest.dependencies ?? [])) {
      if (count > 1) {
        issues.push(
          invalidPackageIssue(manifest.id, `Extension package manifests must not repeat dependency "${dependencyId}".`)
        );
      }
    }

    if (extensionPackage.contributionIds.length === 0) {
      issues.push(invalidPackageIssue(manifest.id, 'Extension packages must install at least one contribution.'));
    }

    return issues;
  });
}

function packageCompatibilityIssues(
  packages: readonly EditorInstalledPackage[],
  options: EditorExtensionPackageActivationOptions
): readonly EditorRegistryIssue[] {
  return packages.flatMap((installedPackage): readonly EditorRegistryIssue[] => {
    const compatibility = createPackageCompatibility(installedPackage.manifest, options);

    switch (compatibility.status) {
      case 'compatible':
      case 'migrated':
        return [];
      case 'needs-migration':
        return [
          {
            kind: 'package-api-migration-required',
            id: compatibility.packageId,
            editorApiVersion: compatibility.editorApiVersion,
            currentEditorApiVersion: compatibility.currentEditorApiVersion,
            migrationIds: compatibility.migrationIds
          } satisfies EditorRegistryIssue
        ];
      case 'incompatible':
        return [
          {
            kind: 'incompatible-package-api',
            id: compatibility.packageId,
            editorApiVersion: compatibility.editorApiVersion,
            currentEditorApiVersion: compatibility.currentEditorApiVersion,
            reason: compatibility.editorApiVersion > compatibility.currentEditorApiVersion ? 'newer-api' : 'older-api'
          } satisfies EditorRegistryIssue
        ];
      default: {
        const exhaustive: never = compatibility.status;
        return exhaustive;
      }
    }
  });
}

function packageUpdateIssues(
  packages: readonly EditorInstalledPackage[],
  options: EditorExtensionPackageActivationOptions
): readonly EditorRegistryIssue[] {
  return createInstalledPackageUpdates(packages, options.availablePackageUpdates ?? []).map((update) => {
    switch (update.status) {
      case 'ready':
      case 'needs-migration':
        return {
          kind: 'package-update-available',
          id: update.packageId,
          installedVersion: update.installedVersion,
          availableVersion: update.availableVersion,
          updateStatus: update.status,
          migrationIds: update.migrationIds
        } satisfies EditorRegistryIssue;
      case 'incompatible':
        return {
          kind: 'incompatible-package-update',
          id: update.packageId,
          installedVersion: update.installedVersion,
          availableVersion: update.availableVersion,
          editorApiVersion: update.editorApiVersion,
          currentEditorApiVersion: update.currentEditorApiVersion,
          reason: update.editorApiVersion > update.currentEditorApiVersion ? 'newer-api' : 'older-api'
        } satisfies EditorRegistryIssue;
      default: {
        const exhaustive: never = update.status;
        return exhaustive;
      }
    }
  });
}

function invalidPackageIssue(id: string, message: string): EditorRegistryIssue {
  return {
    kind: 'invalid-package',
    id,
    message
  };
}

function duplicatePackageDependencyCounts(
  dependencies: readonly { readonly id: string }[]
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();

  for (const dependency of dependencies) {
    const dependencyId = dependency.id.trim();

    if (dependencyId) {
      counts.set(dependencyId, (counts.get(dependencyId) ?? 0) + 1);
    }
  }

  return counts;
}

function duplicatePackageMigrationCounts(
  migrations: readonly EditorExtensionPackageMigration[]
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();

  for (const migration of migrations) {
    const migrationId = migration.id.trim();

    if (migrationId) {
      counts.set(migrationId, (counts.get(migrationId) ?? 0) + 1);
    }
  }

  return counts;
}

function packageDependencyIssues(packages: readonly EditorInstalledPackage[]): readonly EditorRegistryIssue[] {
  const packagesById = installedPackagesById(packages);

  return packages.flatMap((extensionPackage): readonly EditorRegistryIssue[] =>
    (extensionPackage.manifest.dependencies ?? []).flatMap((dependency): readonly EditorRegistryIssue[] => {
      const dependencyId = dependency.id.trim();
      const requiredVersion = dependency.version?.trim();

      if (!dependencyId || dependencyId === extensionPackage.manifest.id.trim()) {
        return [];
      }

      const installedDependencies = packagesById.get(dependencyId) ?? [];

      if (installedDependencies.length === 0) {
        const issue = requiredVersion
          ? ({
              kind: 'missing-package-dependency',
              id: extensionPackage.manifest.id,
              dependencyId,
              dependencyVersion: requiredVersion
            } satisfies EditorRegistryIssue)
          : ({
              kind: 'missing-package-dependency',
              id: extensionPackage.manifest.id,
              dependencyId
            } satisfies EditorRegistryIssue);

        return [issue];
      }

      const dependencyVersionMatches = installedDependencies.some(
        (installedPackage) => installedPackage.manifest.version.trim() === requiredVersion
      );

      if (requiredVersion && !dependencyVersionMatches) {
        return [
          {
            kind: 'incompatible-package-dependency',
            id: extensionPackage.manifest.id,
            dependencyId,
            requiredVersion,
            installedVersions: installedDependencies.map((installedPackage) => installedPackage.manifest.version)
          } satisfies EditorRegistryIssue
        ];
      }

      return [];
    })
  );
}

function packageDependencyCycleIssues(packages: readonly EditorInstalledPackage[]): readonly EditorRegistryIssue[] {
  const packageIds = uniqueInstalledPackageIds(packages);
  const dependenciesByPackageId = packageDependencyGraph(packages, packageIds);
  const issues: EditorRegistryIssue[] = [];

  for (const packageId of packageIds) {
    const cycleIds = dependencyCycleForPackage(packageId, dependenciesByPackageId);

    if (cycleIds) {
      issues.push({
        kind: 'cyclic-package-dependency',
        id: packageId,
        cycleIds
      });
    }
  }

  return issues;
}

function uniqueInstalledPackageIds(packages: readonly EditorInstalledPackage[]): ReadonlySet<string> {
  const packageIdCounts = new Map<string, number>();

  for (const extensionPackage of packages) {
    const packageId = extensionPackage.manifest.id.trim();

    if (packageId) {
      packageIdCounts.set(packageId, (packageIdCounts.get(packageId) ?? 0) + 1);
    }
  }

  return new Set(
    [...packageIdCounts.entries()].filter(([, count]) => count === 1).map(([packageId]) => packageId)
  );
}

function packageDependencyGraph(
  packages: readonly EditorInstalledPackage[],
  packageIds: ReadonlySet<string>
): ReadonlyMap<string, readonly string[]> {
  const dependenciesByPackageId = new Map<string, readonly string[]>();

  for (const extensionPackage of packages) {
    const packageId = extensionPackage.manifest.id.trim();

    if (!packageIds.has(packageId)) {
      continue;
    }

    dependenciesByPackageId.set(packageId, uniqueInstalledDependencyIds(extensionPackage, packageIds));
  }

  return dependenciesByPackageId;
}

function uniqueInstalledDependencyIds(
  extensionPackage: EditorInstalledPackage,
  packageIds: ReadonlySet<string>
): readonly string[] {
  const packageId = extensionPackage.manifest.id.trim();
  const dependencyIds = (extensionPackage.manifest.dependencies ?? [])
    .map((dependency) => dependency.id.trim())
    .filter((dependencyId) => dependencyId && dependencyId !== packageId && packageIds.has(dependencyId));

  return [...new Set(dependencyIds)];
}

function dependencyCycleForPackage(
  packageId: string,
  dependenciesByPackageId: ReadonlyMap<string, readonly string[]>
): readonly string[] | undefined {
  for (const dependencyId of dependenciesByPackageId.get(packageId) ?? []) {
    const cycleIds = dependencyPathToPackage(dependencyId, packageId, dependenciesByPackageId, new Set([packageId]), [
      packageId,
      dependencyId
    ]);

    if (cycleIds) {
      return cycleIds;
    }
  }

  return undefined;
}

function dependencyPathToPackage(
  currentPackageId: string,
  targetPackageId: string,
  dependenciesByPackageId: ReadonlyMap<string, readonly string[]>,
  visitedPackageIds: Set<string>,
  pathIds: readonly string[]
): readonly string[] | undefined {
  if (currentPackageId === targetPackageId) {
    return pathIds;
  }

  if (visitedPackageIds.has(currentPackageId)) {
    return undefined;
  }

  visitedPackageIds.add(currentPackageId);

  for (const dependencyId of dependenciesByPackageId.get(currentPackageId) ?? []) {
    const nextPathIds = [...pathIds, dependencyId];

    if (dependencyId === targetPackageId) {
      return nextPathIds;
    }

    const cycleIds = dependencyPathToPackage(
      dependencyId,
      targetPackageId,
      dependenciesByPackageId,
      new Set(visitedPackageIds),
      nextPathIds
    );

    if (cycleIds) {
      return cycleIds;
    }
  }

  return undefined;
}

function sortPackagesByDependencies<TPackage extends { readonly manifest: EditorExtensionPackageManifest }>(
  packages: readonly TPackage[]
): readonly TPackage[] {
  const packagesById = new Map(packages.map((extensionPackage) => [extensionPackage.manifest.id.trim(), extensionPackage]));
  const visitedPackageIds = new Set<string>();
  const visitingPackageIds = new Set<string>();
  const sortedPackages: TPackage[] = [];

  for (const extensionPackage of packages) {
    visitPackage(extensionPackage, packagesById, visitedPackageIds, visitingPackageIds, sortedPackages);
  }

  return sortedPackages;
}

function visitPackage<TPackage extends { readonly manifest: EditorExtensionPackageManifest }>(
  extensionPackage: TPackage,
  packagesById: ReadonlyMap<string, TPackage>,
  visitedPackageIds: Set<string>,
  visitingPackageIds: Set<string>,
  sortedPackages: TPackage[]
): void {
  const packageId = extensionPackage.manifest.id.trim();

  if (visitedPackageIds.has(packageId) || visitingPackageIds.has(packageId)) {
    return;
  }

  visitingPackageIds.add(packageId);

  for (const dependency of extensionPackage.manifest.dependencies ?? []) {
    const dependencyPackage = packagesById.get(dependency.id.trim());

    if (dependencyPackage) {
      visitPackage(dependencyPackage, packagesById, visitedPackageIds, visitingPackageIds, sortedPackages);
    }
  }

  visitingPackageIds.delete(packageId);
  visitedPackageIds.add(packageId);
  sortedPackages.push(extensionPackage);
}

function blockedPackageDependencyIssues(
  packages: readonly EditorInstalledPackage[],
  directIssues: readonly EditorRegistryIssue[]
): readonly EditorRegistryIssue[] {
  const packagesById = installedPackagesById(packages);
  const packageIdsWithDirectIssues = packageIdsWithIssues(directIssues);
  const issues: EditorRegistryIssue[] = [...directIssues];
  const blockedDependencyIssueKeys = new Set<string>();
  let hasNewIssue = true;

  while (hasNewIssue) {
    hasNewIssue = false;
    const blockedPackageIds = packageIdsWithIssues(issues);

    for (const extensionPackage of packages) {
      const packageId = extensionPackage.manifest.id.trim();

      if (!packageId) {
        continue;
      }

      if (packageIdsWithDirectIssues.has(packageId)) {
        continue;
      }

      for (const dependency of extensionPackage.manifest.dependencies ?? []) {
        const dependencyId = dependency.id.trim();

        if (
          !dependencyId ||
          dependencyId === packageId ||
          !packagesById.has(dependencyId) ||
          !blockedPackageIds.has(dependencyId)
        ) {
          continue;
        }

        const issueKey = `${packageId}:${dependencyId}`;

        if (blockedDependencyIssueKeys.has(issueKey)) {
          continue;
        }

        issues.push({
          kind: 'blocked-package-dependency',
          id: packageId,
          dependencyId,
          dependencyIssueCount: packageIssueCount(issues, dependencyId)
        });
        blockedDependencyIssueKeys.add(issueKey);
        hasNewIssue = true;
      }
    }
  }

  return issues.slice(directIssues.length);
}

function packageIdsWithIssues(issues: readonly EditorRegistryIssue[]): ReadonlySet<string> {
  const packageIds: string[] = [];

  for (const issue of issues) {
    const packageId = packageIssueTargetId(issue);

    if (packageId) {
      packageIds.push(packageId);
    }
  }

  return new Set(packageIds);
}

function packageIssueCount(issues: readonly EditorRegistryIssue[], packageId: string): number {
  return issues.filter((issue) => packageIssueTargetId(issue) === packageId).length;
}

function packageIssueTargetId(issue: EditorRegistryIssue): string | undefined {
  switch (issue.kind) {
    case 'duplicate-package-id':
    case 'invalid-package':
    case 'missing-package-dependency':
    case 'incompatible-package-dependency':
    case 'blocked-package-dependency':
    case 'cyclic-package-dependency':
    case 'package-api-migration-required':
    case 'incompatible-package-api':
      return issue.id;
    case 'package-update-available':
    case 'incompatible-package-update':
    case 'duplicate-contribution-id':
    case 'duplicate-registry-id':
    case 'missing-registry-reference':
    case 'invalid-registry-item':
      return undefined;
    default: {
      const exhaustive: never = issue;
      return exhaustive;
    }
  }
}

function installedPackagesById(packages: readonly EditorInstalledPackage[]): ReadonlyMap<string, readonly EditorInstalledPackage[]> {
  const packagesById = new Map<string, EditorInstalledPackage[]>();

  for (const extensionPackage of packages) {
    const packageId = extensionPackage.manifest.id.trim();

    if (!packageId) {
      continue;
    }

    const packageGroup = packagesById.get(packageId);

    if (packageGroup) {
      packageGroup.push(extensionPackage);
    } else {
      packagesById.set(packageId, [extensionPackage]);
    }
  }

  return packagesById;
}

function packageIssueTargetsPackage(issue: EditorRegistryIssue, installedPackage: EditorInstalledPackage): boolean {
  const packageId = installedPackage.manifest.id;

  switch (issue.kind) {
    case 'duplicate-package-id':
      return issue.id === packageId;
    case 'invalid-package':
    case 'missing-package-dependency':
    case 'incompatible-package-dependency':
    case 'blocked-package-dependency':
    case 'cyclic-package-dependency':
    case 'package-api-migration-required':
    case 'incompatible-package-api':
      return issue.id === packageId;
    case 'package-update-available':
    case 'incompatible-package-update':
    case 'duplicate-contribution-id':
    case 'duplicate-registry-id':
    case 'missing-registry-reference':
    case 'invalid-registry-item':
      return false;
    default: {
      const exhaustive: never = issue;
      return exhaustive;
    }
  }
}

export function formatExtensionPackageDependency(dependency: EditorExtensionPackageDependency): string {
  const id = dependency.id.trim();
  const version = dependency.version?.trim();

  return version ? `${id}@${version}` : id;
}

export function formatExtensionPackageDependencies(manifest: EditorExtensionPackageManifest): string {
  const dependencies = manifest.dependencies ?? [];

  return dependencies.length > 0 ? dependencies.map(formatExtensionPackageDependency).join(', ') : 'none';
}

export function formatInstalledPackageContributions(installedPackage: EditorInstalledPackage): string {
  return installedPackage.contributionIds.length > 0 ? installedPackage.contributionIds.join(', ') : 'none';
}

export function formatInstalledPackageLoadOrder(
  installedPackage: EditorInstalledPackage,
  packageLoadOrder: readonly string[]
): string {
  const loadIndex = packageLoadOrder.indexOf(installedPackage.manifest.id.trim());

  return loadIndex >= 0 ? String(loadIndex + 1) : 'not loaded';
}

export function formatInstalledPackageDependents(
  installedPackage: EditorInstalledPackage,
  packageDependencyGraph: readonly EditorInstalledPackageDependencyGraphEntry[]
): string {
  const graphEntry = packageDependencyGraph.find(
    (entry) => entry.packageId === installedPackage.manifest.id.trim()
  );
  const dependentIds = graphEntry?.dependentIds ?? [];

  return dependentIds.length > 0 ? dependentIds.join(', ') : 'none';
}

export function formatInstalledPackageCompatibility(
  installedPackage: EditorInstalledPackage,
  packageCompatibility: readonly EditorInstalledPackageCompatibility[]
): string {
  const compatibility = packageCompatibility.find(
    (entry) => entry.packageId === installedPackage.manifest.id.trim()
  );

  if (!compatibility) {
    return 'unknown';
  }

  switch (compatibility.status) {
    case 'compatible':
      return `compatible - ${compatibility.message}`;
    case 'migrated':
      return `migrated - ${compatibility.message}`;
    case 'needs-migration':
      return `needs migration - ${compatibility.message}`;
    case 'incompatible':
      return `incompatible - ${compatibility.message}`;
    default: {
      const exhaustive: never = compatibility.status;
      return exhaustive;
    }
  }
}

export function formatInstalledPackageMigrations(manifest: EditorExtensionPackageManifest): string {
  const migrations = manifest.migrations ?? [];

  return migrations.length > 0
    ? migrations
        .map(
          (migration) =>
            `${migration.id.trim()} (${migration.fromEditorApiVersion}->${migration.toEditorApiVersion})`
        )
        .join(', ')
    : 'none';
}

export function formatInstalledPackageUpdates(
  installedPackage: EditorInstalledPackage,
  packageUpdates: readonly EditorInstalledPackageUpdate[]
): string {
  const updates = packageUpdates.filter((update) => update.packageId === installedPackage.manifest.id.trim());

  return updates.length > 0 ? updates.map(formatInstalledPackageUpdate).join(', ') : 'none';
}

function formatInstalledPackageUpdate(update: EditorInstalledPackageUpdate): string {
  switch (update.status) {
    case 'ready':
      return `${update.availableVersion} ready - ${update.message}`;
    case 'needs-migration':
      return `${update.availableVersion} needs migration - ${update.message}`;
    case 'incompatible':
      return `${update.availableVersion} incompatible - ${update.message}`;
    default: {
      const exhaustive: never = update.status;
      return exhaustive;
    }
  }
}

export function formatExtensionPackageActivation(activation: EditorExtensionPackageActivation): string {
  switch (activation.status) {
    case 'active':
      return 'active';
    case 'disabled':
      switch (activation.reason.kind) {
        case 'host-disabled':
          return 'disabled';
        case 'disabled-package-dependency':
          return `disabled by ${activation.reason.dependencyId}`;
        default: {
          const exhaustive: never = activation.reason;
          return exhaustive;
        }
      }
    case 'blocked':
      return activation.issues.length === 1 ? 'blocked by 1 issue' : `blocked by ${activation.issues.length} issues`;
    default: {
      const exhaustive: never = activation;
      return exhaustive;
    }
  }
}

export type {
  EditorExtensionPackageActivation,
  EditorAvailablePackageUpdate,
  EditorExtensionPackageDisabledReason,
  EditorExtensionPackageDependency,
  EditorExtensionPackageManifest,
  EditorExtensionPackageMigration,
  EditorInstalledPackage,
  EditorInstalledPackageCompatibility,
  EditorInstalledPackageDependencyGraphEntry,
  EditorInstalledPackageState,
  EditorInstalledPackageUpdate
};
