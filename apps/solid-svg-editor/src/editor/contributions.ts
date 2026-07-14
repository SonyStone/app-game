import type {
  ActionContribution,
  AppMenuItemContribution,
  CommandContribution,
  ContextMenuItemContribution,
  EditorContribution,
  EditorContributionSource,
  EditorRegistries,
  EditorInstalledPackage,
  EditorInstalledPackageState,
  EditorRegistryHealth,
  EditorRegistryIssue,
  EditorRegistryName,
  ShortcutContribution
} from './kernel';
import {
  createActivePackageLoadOrder,
  createInstalledPackageCompatibility,
  createInstalledPackageStates,
  createInstalledPackageDependencyGraph,
  createInstalledPackageUpdates,
  createPackageRegistryIssues,
  type EditorExtensionPackageActivationOptions
} from './extension-packages';
import { createEditorRegistryDiagnostics } from './registry-diagnostics';

interface RegistryEntry<TItem extends { readonly id: string }> {
  readonly contributionId: string;
  readonly item: TItem;
}

export interface CreateEditorRegistriesOptions extends EditorExtensionPackageActivationOptions {
  readonly packages?: readonly EditorInstalledPackage[];
  readonly contributionSources?: readonly EditorContributionSource[];
}

export function createEditorRegistries<TPanelContext = unknown>(
  contributions: readonly EditorContribution<TPanelContext>[] = [],
  options: CreateEditorRegistriesOptions = {}
): EditorRegistries<TPanelContext> {
  const installedContributions = [...contributions];
  const actions = registryEntries(installedContributions, (contribution) => contribution.actions);
  const commands = registryEntries(installedContributions, (contribution) => contribution.commands);
  const tools = registryEntries(installedContributions, (contribution) => contribution.tools);
  const panels = registryEntries(installedContributions, (contribution) => contribution.panels);
  const viewportToolbars = registryEntries(installedContributions, (contribution) => contribution.viewportToolbars);
  const viewportOverlays = registryEntries(installedContributions, (contribution) => contribution.viewportOverlays);
  const viewportLayers = registryEntries(installedContributions, (contribution) => contribution.viewportLayers);
  const shortcuts = registryEntries(installedContributions, (contribution) => contribution.shortcuts);
  const appMenus = registryEntries(installedContributions, (contribution) => contribution.appMenus);
  const modals = registryEntries(installedContributions, (contribution) => contribution.modals);
  const settingsSections = registryEntries(installedContributions, (contribution) => contribution.settingsSections);
  const contextMenus = registryEntries(installedContributions, (contribution) => contribution.contextMenus);
  const svg = registryEntries(installedContributions, (contribution) => contribution.svg);
  const renderers = registryEntries(installedContributions, (contribution) => contribution.renderers);
  const installedPackages = options.packages ?? [];
  const packageIssues = createPackageRegistryIssues(installedPackages, options);
  const packageStates = createInstalledPackageStates(installedPackages, packageIssues, options);
  const registryIssues = [
    ...packageIssues,
    ...duplicateContributionIssues(installedContributions),
    ...duplicateRegistryIssues('actions', actions),
    ...duplicateRegistryIssues('commands', commands),
    ...duplicateRegistryIssues('tools', tools),
    ...duplicateRegistryIssues('panels', panels),
    ...duplicateRegistryIssues('viewportToolbars', viewportToolbars),
    ...duplicateRegistryIssues('viewportOverlays', viewportOverlays),
    ...duplicateRegistryIssues('viewportLayers', viewportLayers),
    ...duplicateRegistryIssues('shortcuts', shortcuts),
    ...duplicateRegistryIssues('appMenus', appMenus),
    ...duplicateRegistryIssues('modals', modals),
    ...duplicateRegistryIssues('settingsSections', settingsSections),
    ...duplicateRegistryIssues('contextMenus', contextMenus),
    ...duplicateRegistryIssues('svg', svg),
    ...duplicateRegistryIssues('renderers', renderers),
    ...invalidCommandDurabilityIssues(commands),
    ...missingActionModalIssues(actions, registryIdSet(modals)),
    ...missingActionCommandIssues(actions, registryIdSet(commands)),
    ...missingAppMenuActionIssues(appMenus, registryIdSet(actions)),
    ...missingAppMenuCommandIssues(appMenus, registryIdSet(commands)),
    ...missingContextMenuActionIssues(contextMenus, registryIdSet(actions)),
    ...missingContextMenuCommandIssues(contextMenus, registryIdSet(commands)),
    ...missingShortcutTargetIssues(shortcuts, {
      actions: registryIdSet(actions),
      commands: registryIdSet(commands)
    })
  ];

  return {
    packages: installedPackages,
    packageStates,
    packageLoadOrder: createActivePackageLoadOrder(installedPackages, packageIssues, options),
    packageDependencyGraph: createInstalledPackageDependencyGraph(installedPackages),
    packageCompatibility: createInstalledPackageCompatibility(installedPackages, options),
    packageUpdates: createInstalledPackageUpdates(installedPackages, options.availablePackageUpdates ?? []),
    contributions: installedContributions,
    contributionSources: normalizeContributionSources(installedContributions, options.contributionSources),
    issues: registryIssues,
    health: createEditorRegistryHealth(packageStates, installedContributions.length, registryIssues),
    actions: actions.map((entry) => entry.item),
    commands: commands.map((entry) => entry.item),
    tools: tools.map((entry) => entry.item),
    panels: panels.map((entry) => entry.item),
    viewportToolbars: viewportToolbars.map((entry) => entry.item),
    viewportOverlays: viewportOverlays.map((entry) => entry.item),
    viewportLayers: viewportLayers.map((entry) => entry.item),
    shortcuts: shortcuts.map((entry) => entry.item),
    appMenus: appMenus.map((entry) => entry.item),
    modals: modals.map((entry) => entry.item),
    settingsSections: settingsSections.map((entry) => entry.item),
    contextMenus: contextMenus.map((entry) => entry.item),
    svg: svg.map((entry) => entry.item),
    renderers: renderers.map((entry) => entry.item)
  } satisfies EditorRegistries<TPanelContext>;
}

export function createEditorRegistryHealth(
  packageStates: readonly EditorInstalledPackageState[],
  contributionCount: number,
  issues: readonly EditorRegistryIssue[]
): EditorRegistryHealth {
  const diagnostics = createEditorRegistryDiagnostics(issues);
  const errorCount = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
  const warningCount = diagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length;

  return {
    status: registryHealthStatus(errorCount, warningCount),
    packageCount: packageStates.length,
    activePackageCount: packageStates.filter((packageState) => packageState.activation.status === 'active').length,
    disabledPackageCount: packageStates.filter((packageState) => packageState.activation.status === 'disabled').length,
    blockedPackageCount: packageStates.filter((packageState) => packageState.activation.status === 'blocked').length,
    contributionCount,
    issueCount: issues.length,
    errorCount,
    warningCount
  } satisfies EditorRegistryHealth;
}

function registryHealthStatus(errorCount: number, warningCount: number): EditorRegistryHealth['status'] {
  if (errorCount > 0) {
    return 'error';
  }

  if (warningCount > 0) {
    return 'warning';
  }

  return 'ready';
}

function normalizeContributionSources<TPanelContext>(
  contributions: readonly EditorContribution<TPanelContext>[],
  contributionSources: readonly EditorContributionSource[] | undefined
): readonly EditorContributionSource[] {
  if (contributionSources?.length === contributions.length) {
    return contributionSources;
  }

  return contributions.map(
    (contribution) =>
      ({
        kind: 'direct',
        contributionId: contribution.id
      }) satisfies EditorContributionSource
  );
}

function registryEntries<TPanelContext, TItem extends { readonly id: string }>(
  contributions: readonly EditorContribution<TPanelContext>[],
  selectItems: (contribution: EditorContribution<TPanelContext>) => readonly TItem[] | undefined
): readonly RegistryEntry<TItem>[] {
  return contributions.flatMap((contribution) =>
    (selectItems(contribution) ?? []).map((item) => ({ contributionId: contribution.id, item }))
  );
}

function duplicateContributionIssues<TPanelContext>(
  contributions: readonly EditorContribution<TPanelContext>[]
): readonly EditorRegistryIssue[] {
  const counts = new Map<string, number>();

  for (const contribution of contributions) {
    counts.set(contribution.id, (counts.get(contribution.id) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id, count]) => ({ kind: 'duplicate-contribution-id', id, count }) satisfies EditorRegistryIssue);
}

function duplicateRegistryIssues<TItem extends { readonly id: string }>(
  registry: EditorRegistryName,
  entries: readonly RegistryEntry<TItem>[]
): readonly EditorRegistryIssue[] {
  const contributionIdsByItemId = new Map<string, string[]>();

  for (const entry of entries) {
    const itemId = String(entry.item.id);
    const contributionIds = contributionIdsByItemId.get(itemId);

    if (contributionIds) {
      contributionIds.push(entry.contributionId);
    } else {
      contributionIdsByItemId.set(itemId, [entry.contributionId]);
    }
  }

  return [...contributionIdsByItemId.entries()]
    .filter(([, contributionIds]) => contributionIds.length > 1)
    .map(
      ([id, contributionIds]) =>
        ({
          kind: 'duplicate-registry-id',
          registry,
          id,
          contributionIds
        }) satisfies EditorRegistryIssue
    );
}

function registryIdSet<TItem extends { readonly id: string }>(entries: readonly RegistryEntry<TItem>[]): ReadonlySet<string> {
  return new Set(entries.map((entry) => String(entry.item.id)));
}

function invalidCommandDurabilityIssues(
  entries: readonly RegistryEntry<CommandContribution>[]
): readonly EditorRegistryIssue[] {
  return entries.flatMap((entry) => {
    const item = entry.item;

    if (item.durability.kind !== 'legacy' || item.durability.reason.trim().length > 0) {
      return [];
    }

    return [
      {
        kind: 'invalid-registry-item',
        registry: 'commands',
        id: String(item.id),
        contributionId: entry.contributionId,
        message: 'Legacy command contributions must provide a non-empty durability reason.'
      } satisfies EditorRegistryIssue
    ];
  });
}

function missingActionModalIssues(
  entries: readonly RegistryEntry<ActionContribution>[],
  modalIds: ReadonlySet<string>
): readonly EditorRegistryIssue[] {
  return entries.flatMap((entry) => {
    const item = entry.item;

    if (item.kind !== 'modal' || modalIds.has(item.modalId)) {
      return [];
    }

    return [
      missingRegistryReferenceIssue({
        entry,
        registry: 'actions',
        referencedRegistry: 'modals',
        referencedId: item.modalId
      })
    ];
  });
}

function missingActionCommandIssues(
  entries: readonly RegistryEntry<ActionContribution>[],
  commandIds: ReadonlySet<string>
): readonly EditorRegistryIssue[] {
  return entries.flatMap((entry) => {
    const item = entry.item;

    if (item.kind !== 'command' || commandIds.has(item.commandId)) {
      return [];
    }

    return [
      missingRegistryReferenceIssue({
        entry,
        registry: 'actions',
        referencedRegistry: 'commands',
        referencedId: item.commandId
      })
    ];
  });
}

function missingAppMenuActionIssues(
  entries: readonly RegistryEntry<AppMenuItemContribution>[],
  actionIds: ReadonlySet<string>
): readonly EditorRegistryIssue[] {
  return entries.flatMap((entry) => {
    const item = entry.item;

    if (item.kind !== 'action' || actionIds.has(item.actionId)) {
      return [];
    }

    return [
      missingRegistryReferenceIssue({
        entry,
        registry: 'appMenus',
        referencedRegistry: 'actions',
        referencedId: item.actionId
      })
    ];
  });
}

function missingAppMenuCommandIssues(
  entries: readonly RegistryEntry<AppMenuItemContribution>[],
  commandIds: ReadonlySet<string>
): readonly EditorRegistryIssue[] {
  return entries.flatMap((entry) => {
    const item = entry.item;

    if (item.kind !== 'registered-command' || commandIds.has(item.commandId)) {
      return [];
    }

    return [
      missingRegistryReferenceIssue({
        entry,
        registry: 'appMenus',
        referencedRegistry: 'commands',
        referencedId: item.commandId
      })
    ];
  });
}

function missingContextMenuActionIssues(
  entries: readonly RegistryEntry<ContextMenuItemContribution>[],
  actionIds: ReadonlySet<string>
): readonly EditorRegistryIssue[] {
  return entries.flatMap((entry) => {
    const item = entry.item;

    if (item.kind !== 'action' || actionIds.has(item.actionId)) {
      return [];
    }

    return [
      missingRegistryReferenceIssue({
        entry,
        registry: 'contextMenus',
        referencedRegistry: 'actions',
        referencedId: item.actionId
      })
    ];
  });
}

function missingContextMenuCommandIssues(
  entries: readonly RegistryEntry<ContextMenuItemContribution>[],
  commandIds: ReadonlySet<string>
): readonly EditorRegistryIssue[] {
  return entries.flatMap((entry) => {
    const item = entry.item;

    if (item.kind !== 'registered-command' || commandIds.has(item.commandId)) {
      return [];
    }

    return [
      missingRegistryReferenceIssue({
        entry,
        registry: 'contextMenus',
        referencedRegistry: 'commands',
        referencedId: item.commandId
      })
    ];
  });
}

function missingShortcutTargetIssues(
  entries: readonly RegistryEntry<ShortcutContribution>[],
  ids: {
    readonly actions: ReadonlySet<string>;
    readonly commands: ReadonlySet<string>;
  }
): readonly EditorRegistryIssue[] {
  return entries.flatMap((entry) => {
    const target = entry.item.target;

    switch (target.kind) {
      case 'action':
        return ids.actions.has(target.id)
          ? []
          : [
              missingRegistryReferenceIssue({
                entry,
                registry: 'shortcuts',
                referencedRegistry: 'actions',
                referencedId: target.id
              })
            ];
      case 'command':
        return ids.commands.has(target.id)
          ? []
          : [
              missingRegistryReferenceIssue({
                entry,
                registry: 'shortcuts',
                referencedRegistry: 'commands',
                referencedId: target.id
              })
            ];
      case 'handler':
        return [];
      default: {
        const exhaustive: never = target;
        return exhaustive;
      }
    }
  });
}

function missingRegistryReferenceIssue<TItem extends { readonly id: string }>(options: {
  readonly entry: RegistryEntry<TItem>;
  readonly registry: EditorRegistryName;
  readonly referencedRegistry: EditorRegistryName;
  readonly referencedId: string;
}): EditorRegistryIssue {
  return {
    kind: 'missing-registry-reference',
    registry: options.registry,
    id: String(options.entry.item.id),
    contributionId: options.entry.contributionId,
    referencedRegistry: options.referencedRegistry,
    referencedId: options.referencedId
  };
}
