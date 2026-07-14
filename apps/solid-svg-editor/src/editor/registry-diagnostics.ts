import type { EditorContributionSource, EditorRegistryIssue } from './kernel';

export type EditorRegistryDiagnosticSeverity = 'error' | 'warning';

export interface EditorRegistryDiagnostic {
  readonly id: string;
  readonly severity: EditorRegistryDiagnosticSeverity;
  readonly message: string;
  readonly detail: string;
  readonly fix: string;
  readonly issue: EditorRegistryIssue;
}

export interface CreateEditorRegistryDiagnosticsOptions {
  readonly contributionSources?: readonly EditorContributionSource[];
}

export function createEditorRegistryDiagnostics(
  issues: readonly EditorRegistryIssue[],
  options: CreateEditorRegistryDiagnosticsOptions = {}
): readonly EditorRegistryDiagnostic[] {
  return issues.map((issue) => {
    switch (issue.kind) {
      case 'duplicate-package-id':
        return {
          id: `duplicate-package-id:${issue.id}`,
          severity: 'error',
          message: `Duplicate extension package "${issue.id}".`,
          detail: `${issue.count} packages share this ID.`,
          fix: 'Give each installed extension package a unique manifest id.',
          issue
        } satisfies EditorRegistryDiagnostic;
      case 'invalid-package':
        return {
          id: `invalid-package:${issue.id}:${issue.message}`,
          severity: 'warning',
          message: `Invalid extension package "${issue.id}".`,
          detail: issue.message,
          fix: 'Update the package manifest or contribution list before publishing the extension.',
          issue
        } satisfies EditorRegistryDiagnostic;
      case 'missing-package-dependency':
        return {
          id: `missing-package-dependency:${issue.id}:${issue.dependencyId}:${issue.dependencyVersion ?? ''}`,
          severity: 'error',
          message: `Missing extension package "${issue.dependencyId}".`,
          detail: `${issue.id} depends on ${formatDependencyTarget(issue.dependencyId, issue.dependencyVersion)}.`,
          fix: `Install the required extension package before enabling "${issue.id}".`,
          issue
        } satisfies EditorRegistryDiagnostic;
      case 'incompatible-package-dependency':
        return {
          id: `incompatible-package-dependency:${issue.id}:${issue.dependencyId}:${issue.requiredVersion}`,
          severity: 'error',
          message: `Incompatible extension package "${issue.dependencyId}".`,
          detail: `${issue.id} requires ${issue.dependencyId}@${issue.requiredVersion}, but ${formatInstalledVersions(issue.installedVersions)} installed.`,
          fix: 'Install a compatible dependency version or update the package requirement.',
          issue
        } satisfies EditorRegistryDiagnostic;
      case 'blocked-package-dependency':
        return {
          id: `blocked-package-dependency:${issue.id}:${issue.dependencyId}`,
          severity: 'error',
          message: `Blocked extension package "${issue.dependencyId}".`,
          detail: `${issue.id} depends on ${issue.dependencyId}, which has ${formatIssueCount(issue.dependencyIssueCount)}.`,
          fix: `Resolve "${issue.dependencyId}" package diagnostics before enabling "${issue.id}".`,
          issue
        } satisfies EditorRegistryDiagnostic;
      case 'cyclic-package-dependency':
        return {
          id: `cyclic-package-dependency:${issue.id}:${issue.cycleIds.join('>')}`,
          severity: 'error',
          message: `Cyclic extension package dependency "${issue.id}".`,
          detail: `Dependency cycle: ${issue.cycleIds.join(' -> ')}.`,
          fix: 'Break the dependency cycle before enabling these packages.',
          issue
        } satisfies EditorRegistryDiagnostic;
      case 'package-api-migration-required':
        return {
          id: `package-api-migration-required:${issue.id}:${issue.editorApiVersion}:${issue.currentEditorApiVersion}`,
          severity: 'warning',
          message: `Extension package "${issue.id}" needs migration.`,
          detail: `${issue.id} targets editor extension API ${issue.editorApiVersion}; current host API is ${issue.currentEditorApiVersion}. Migration path: ${issue.migrationIds.join(', ')}.`,
          fix: 'Run the package migration path before enabling this extension.',
          issue
        } satisfies EditorRegistryDiagnostic;
      case 'incompatible-package-api':
        return {
          id: `incompatible-package-api:${issue.id}:${issue.editorApiVersion}:${issue.currentEditorApiVersion}`,
          severity: 'error',
          message: `Incompatible extension package "${issue.id}".`,
          detail: formatIncompatiblePackageApiDetail(issue),
          fix:
            issue.reason === 'newer-api'
              ? 'Upgrade the editor host before enabling this extension.'
              : 'Install an updated package or provide a migration path to the current editor extension API.',
          issue
        } satisfies EditorRegistryDiagnostic;
      case 'package-update-available':
        return {
          id: `package-update-available:${issue.id}:${issue.availableVersion}`,
          severity: 'warning',
          message: `Extension package update available for "${issue.id}".`,
          detail: formatPackageUpdateAvailableDetail(issue),
          fix:
            issue.updateStatus === 'needs-migration'
              ? 'Review the update and run its migration path before installing it.'
              : 'Review and install the package update when ready.',
          issue
        } satisfies EditorRegistryDiagnostic;
      case 'incompatible-package-update':
        return {
          id: `incompatible-package-update:${issue.id}:${issue.availableVersion}`,
          severity: 'warning',
          message: `Incompatible extension package update for "${issue.id}".`,
          detail: formatIncompatiblePackageUpdateDetail(issue),
          fix:
            issue.reason === 'newer-api'
              ? 'Upgrade the editor host before installing this package update.'
              : 'Wait for an update that targets the current editor API or provides a migration path.',
          issue
        } satisfies EditorRegistryDiagnostic;
      case 'duplicate-contribution-id':
        return {
          id: `duplicate-contribution-id:${issue.id}`,
          severity: 'error',
          message: `Duplicate contribution "${issue.id}".`,
          detail: `${issue.count} contributions share this ID.${formatContributionSourceSuffix(
            contributionSourcesForIds(options.contributionSources, [issue.id])
          )}`,
          fix: 'Give each installed contribution a unique id.',
          issue
        } satisfies EditorRegistryDiagnostic;
      case 'duplicate-registry-id':
        return {
          id: `duplicate-registry-id:${issue.registry}:${issue.id}`,
          severity: 'error',
          message: `Duplicate ${issue.registry} item "${issue.id}".`,
          detail: `Declared by: ${formatContributionIdsWithSources(options.contributionSources, issue.contributionIds)}.`,
          fix: `Rename or remove duplicate ${issue.registry} items before publishing the extension.`,
          issue
        } satisfies EditorRegistryDiagnostic;
      case 'missing-registry-reference':
        return {
          id: `missing-registry-reference:${issue.registry}:${issue.id}:${issue.referencedRegistry}:${issue.referencedId}`,
          severity: 'error',
          message: `Missing ${issue.referencedRegistry} item "${issue.referencedId}".`,
          detail: `${issue.registry} item "${issue.id}" from "${formatContributionIdWithSource(
            options.contributionSources,
            issue.contributionId
          )}" references it.`,
          fix: `Install the referenced ${issue.referencedRegistry} contribution or update the ${issue.registry} target id.`,
          issue
        } satisfies EditorRegistryDiagnostic;
      case 'invalid-registry-item':
        return {
          id: `invalid-registry-item:${issue.registry}:${issue.id}:${issue.contributionId}`,
          severity: 'warning',
          message: `Invalid ${issue.registry} item "${issue.id}".`,
          detail: `${formatContributionIdWithSource(options.contributionSources, issue.contributionId)}: ${issue.message}`,
          fix: `Update the ${issue.registry} contribution to satisfy the editor contract.`,
          issue
        } satisfies EditorRegistryDiagnostic;
      default: {
        const exhaustive: never = issue;
        return exhaustive;
      }
    }
  });
}

function formatPackageUpdateAvailableDetail(
  issue: Extract<EditorRegistryIssue, { readonly kind: 'package-update-available' }>
): string {
  const base = `${issue.id} can update from ${issue.installedVersion} to ${issue.availableVersion}.`;

  if (issue.updateStatus === 'needs-migration') {
    return `${base} Migration path: ${issue.migrationIds.join(', ')}.`;
  }

  return base;
}

function formatIncompatiblePackageUpdateDetail(
  issue: Extract<EditorRegistryIssue, { readonly kind: 'incompatible-package-update' }>
): string {
  const base = `${issue.id} can update from ${issue.installedVersion} to ${issue.availableVersion}, but`;

  if (issue.reason === 'newer-api') {
    return `${base} the update targets newer editor extension API ${issue.editorApiVersion}; current host API is ${issue.currentEditorApiVersion}.`;
  }

  return `${base} the update targets older editor extension API ${issue.editorApiVersion} without a migration path to API ${issue.currentEditorApiVersion}.`;
}

function formatIncompatiblePackageApiDetail(
  issue: Extract<EditorRegistryIssue, { readonly kind: 'incompatible-package-api' }>
): string {
  if (issue.reason === 'newer-api') {
    return `${issue.id} targets newer editor extension API ${issue.editorApiVersion}; current host API is ${issue.currentEditorApiVersion}.`;
  }

  return `${issue.id} targets older editor extension API ${issue.editorApiVersion} without a migration path to API ${issue.currentEditorApiVersion}.`;
}

function formatDependencyTarget(id: string, version: string | undefined): string {
  return version ? `${id}@${version}` : id;
}

function formatInstalledVersions(versions: readonly string[]): string {
  return versions.length === 1 ? `${versions[0]} is` : `${versions.join(', ')} are`;
}

function formatIssueCount(count: number): string {
  return count === 1 ? '1 blocking issue' : `${count} blocking issues`;
}

function formatContributionIdsWithSources(
  contributionSources: readonly EditorContributionSource[] | undefined,
  contributionIds: readonly string[]
): string {
  if (!contributionSources || contributionSources.length === 0) {
    return contributionIds.join(', ');
  }

  const sourceIndexesByContributionId = new Map<string, number>();

  return contributionIds
    .map((contributionId) => {
      const matchingSources = contributionSources.filter((source) => source.contributionId === contributionId);
      const sourceIndex = sourceIndexesByContributionId.get(contributionId) ?? 0;
      const contributionSource = matchingSources[sourceIndex] ?? matchingSources[0];

      sourceIndexesByContributionId.set(contributionId, sourceIndex + 1);

      return contributionSource ? `${contributionId} (${formatContributionSource(contributionSource)})` : contributionId;
    })
    .join(', ');
}

function formatContributionIdWithSource(
  contributionSources: readonly EditorContributionSource[] | undefined,
  contributionId: string
): string {
  const contributionSource = contributionSources?.find((source) => source.contributionId === contributionId);

  return contributionSource ? `${contributionId} (${formatContributionSource(contributionSource)})` : contributionId;
}

function contributionSourcesForIds(
  contributionSources: readonly EditorContributionSource[] | undefined,
  contributionIds: readonly string[]
): readonly EditorContributionSource[] {
  if (!contributionSources || contributionSources.length === 0) {
    return [];
  }

  const contributionIdSet = new Set(contributionIds);

  return contributionSources.filter((source) => contributionIdSet.has(source.contributionId));
}

function formatContributionSourceSuffix(contributionSources: readonly EditorContributionSource[]): string {
  return contributionSources.length > 0
    ? ` Sources: ${contributionSources.map((source) => `${source.contributionId} (${formatContributionSource(source)})`).join(', ')}.`
    : '';
}

function formatContributionSource(source: EditorContributionSource): string {
  switch (source.kind) {
    case 'core':
      return 'core';
    case 'direct':
      return 'direct install';
    case 'raw':
      return 'raw external install';
    case 'package':
      return `package ${source.packageId}`;
    default: {
      const exhaustive: never = source;
      return exhaustive;
    }
  }
}
