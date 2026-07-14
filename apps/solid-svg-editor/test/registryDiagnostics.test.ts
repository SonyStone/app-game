import { describe, expect, it } from 'vitest';

import { createEditorRegistryDiagnostics } from '../src/editor/registry-diagnostics';
import type { EditorContributionSource, EditorRegistryIssue } from '../src/editor/kernel';

describe('registry diagnostics', () => {
  it('projects registry issues into actionable diagnostics', () => {
    const issues = [
      {
        kind: 'duplicate-package-id',
        id: 'test.package',
        count: 2
      },
      {
        kind: 'invalid-package',
        id: 'test.empty-package',
        message: 'Extension packages must install at least one contribution.'
      },
      {
        kind: 'missing-package-dependency',
        id: 'test.addon',
        dependencyId: 'test.base',
        dependencyVersion: '2.0.0'
      },
      {
        kind: 'incompatible-package-dependency',
        id: 'test.versioned-addon',
        dependencyId: 'test.base',
        requiredVersion: '2.0.0',
        installedVersions: ['1.0.0']
      },
      {
        kind: 'blocked-package-dependency',
        id: 'test.dependent',
        dependencyId: 'test.base',
        dependencyIssueCount: 1
      },
      {
        kind: 'cyclic-package-dependency',
        id: 'test.first-cycle',
        cycleIds: ['test.first-cycle', 'test.second-cycle', 'test.first-cycle']
      },
      {
        kind: 'package-api-migration-required',
        id: 'test.stale',
        editorApiVersion: 0,
        currentEditorApiVersion: 1,
        migrationIds: ['test.migrate-v0-v1']
      },
      {
        kind: 'incompatible-package-api',
        id: 'test.future',
        editorApiVersion: 2,
        currentEditorApiVersion: 1,
        reason: 'newer-api'
      },
      {
        kind: 'package-update-available',
        id: 'test.update',
        installedVersion: '1.0.0',
        availableVersion: '1.1.0',
        updateStatus: 'ready',
        migrationIds: []
      },
      {
        kind: 'incompatible-package-update',
        id: 'test.future-update',
        installedVersion: '1.0.0',
        availableVersion: '2.0.0',
        editorApiVersion: 2,
        currentEditorApiVersion: 1,
        reason: 'newer-api'
      },
      {
        kind: 'duplicate-contribution-id',
        id: 'test.extension',
        count: 2
      },
      {
        kind: 'duplicate-registry-id',
        registry: 'actions',
        id: 'test.run',
        contributionIds: ['test.first', 'test.second']
      },
      {
        kind: 'missing-registry-reference',
        registry: 'appMenus',
        id: 'test.menu',
        contributionId: 'test.extension',
        referencedRegistry: 'actions',
        referencedId: 'test.missing-action'
      },
      {
        kind: 'invalid-registry-item',
        registry: 'commands',
        id: 'test.legacy',
        contributionId: 'test.extension',
        message: 'Legacy command contributions must provide a non-empty durability reason.'
      }
    ] satisfies readonly EditorRegistryIssue[];

    expect(createEditorRegistryDiagnostics(issues)).toEqual([
      {
        id: 'duplicate-package-id:test.package',
        severity: 'error',
        message: 'Duplicate extension package "test.package".',
        detail: '2 packages share this ID.',
        fix: 'Give each installed extension package a unique manifest id.',
        issue: issues[0]
      },
      {
        id: 'invalid-package:test.empty-package:Extension packages must install at least one contribution.',
        severity: 'warning',
        message: 'Invalid extension package "test.empty-package".',
        detail: 'Extension packages must install at least one contribution.',
        fix: 'Update the package manifest or contribution list before publishing the extension.',
        issue: issues[1]
      },
      {
        id: 'missing-package-dependency:test.addon:test.base:2.0.0',
        severity: 'error',
        message: 'Missing extension package "test.base".',
        detail: 'test.addon depends on test.base@2.0.0.',
        fix: 'Install the required extension package before enabling "test.addon".',
        issue: issues[2]
      },
      {
        id: 'incompatible-package-dependency:test.versioned-addon:test.base:2.0.0',
        severity: 'error',
        message: 'Incompatible extension package "test.base".',
        detail: 'test.versioned-addon requires test.base@2.0.0, but 1.0.0 is installed.',
        fix: 'Install a compatible dependency version or update the package requirement.',
        issue: issues[3]
      },
      {
        id: 'blocked-package-dependency:test.dependent:test.base',
        severity: 'error',
        message: 'Blocked extension package "test.base".',
        detail: 'test.dependent depends on test.base, which has 1 blocking issue.',
        fix: 'Resolve "test.base" package diagnostics before enabling "test.dependent".',
        issue: issues[4]
      },
      {
        id: 'cyclic-package-dependency:test.first-cycle:test.first-cycle>test.second-cycle>test.first-cycle',
        severity: 'error',
        message: 'Cyclic extension package dependency "test.first-cycle".',
        detail: 'Dependency cycle: test.first-cycle -> test.second-cycle -> test.first-cycle.',
        fix: 'Break the dependency cycle before enabling these packages.',
        issue: issues[5]
      },
      {
        id: 'package-api-migration-required:test.stale:0:1',
        severity: 'warning',
        message: 'Extension package "test.stale" needs migration.',
        detail: 'test.stale targets editor extension API 0; current host API is 1. Migration path: test.migrate-v0-v1.',
        fix: 'Run the package migration path before enabling this extension.',
        issue: issues[6]
      },
      {
        id: 'incompatible-package-api:test.future:2:1',
        severity: 'error',
        message: 'Incompatible extension package "test.future".',
        detail: 'test.future targets newer editor extension API 2; current host API is 1.',
        fix: 'Upgrade the editor host before enabling this extension.',
        issue: issues[7]
      },
      {
        id: 'package-update-available:test.update:1.1.0',
        severity: 'warning',
        message: 'Extension package update available for "test.update".',
        detail: 'test.update can update from 1.0.0 to 1.1.0.',
        fix: 'Review and install the package update when ready.',
        issue: issues[8]
      },
      {
        id: 'incompatible-package-update:test.future-update:2.0.0',
        severity: 'warning',
        message: 'Incompatible extension package update for "test.future-update".',
        detail:
          'test.future-update can update from 1.0.0 to 2.0.0, but the update targets newer editor extension API 2; current host API is 1.',
        fix: 'Upgrade the editor host before installing this package update.',
        issue: issues[9]
      },
      {
        id: 'duplicate-contribution-id:test.extension',
        severity: 'error',
        message: 'Duplicate contribution "test.extension".',
        detail: '2 contributions share this ID.',
        fix: 'Give each installed contribution a unique id.',
        issue: issues[10]
      },
      {
        id: 'duplicate-registry-id:actions:test.run',
        severity: 'error',
        message: 'Duplicate actions item "test.run".',
        detail: 'Declared by: test.first, test.second.',
        fix: 'Rename or remove duplicate actions items before publishing the extension.',
        issue: issues[11]
      },
      {
        id: 'missing-registry-reference:appMenus:test.menu:actions:test.missing-action',
        severity: 'error',
        message: 'Missing actions item "test.missing-action".',
        detail: 'appMenus item "test.menu" from "test.extension" references it.',
        fix: 'Install the referenced actions contribution or update the appMenus target id.',
        issue: issues[12]
      },
      {
        id: 'invalid-registry-item:commands:test.legacy:test.extension',
        severity: 'warning',
        message: 'Invalid commands item "test.legacy".',
        detail: 'test.extension: Legacy command contributions must provide a non-empty durability reason.',
        fix: 'Update the commands contribution to satisfy the editor contract.',
        issue: issues[13]
      }
    ]);
  });

  it('adds contribution source context when registry sources are available', () => {
    const issues = [
      {
        kind: 'duplicate-contribution-id',
        id: 'test.extension',
        count: 2
      },
      {
        kind: 'duplicate-registry-id',
        registry: 'actions',
        id: 'test.run',
        contributionIds: ['test.extension', 'test.raw-extension']
      },
      {
        kind: 'missing-registry-reference',
        registry: 'appMenus',
        id: 'test.menu',
        contributionId: 'test.extension',
        referencedRegistry: 'actions',
        referencedId: 'test.missing-action'
      },
      {
        kind: 'invalid-registry-item',
        registry: 'commands',
        id: 'test.legacy',
        contributionId: 'test.raw-extension',
        message: 'Legacy command contributions must provide a non-empty durability reason.'
      }
    ] satisfies readonly EditorRegistryIssue[];
    const contributionSources = [
      {
        kind: 'package',
        contributionId: 'test.extension',
        packageId: 'test.package'
      },
      {
        kind: 'raw',
        contributionId: 'test.raw-extension'
      }
    ] satisfies readonly EditorContributionSource[];

    expect(createEditorRegistryDiagnostics(issues, { contributionSources }).map((diagnostic) => diagnostic.detail)).toEqual([
      '2 contributions share this ID. Sources: test.extension (package test.package).',
      'Declared by: test.extension (package test.package), test.raw-extension (raw external install).',
      'appMenus item "test.menu" from "test.extension (package test.package)" references it.',
      'test.raw-extension (raw external install): Legacy command contributions must provide a non-empty durability reason.'
    ]);
  });
});
