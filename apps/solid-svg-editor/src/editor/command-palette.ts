import { isRegisteredActionEnabled, runRegisteredAction } from './action-registry';
import { dispatchRegisteredCommand, isRegisteredCommandEnabled } from './command-registry';
import type { EditorCommandId } from './commands';
import type {
  ActionContribution,
  CommandContribution,
  CommandContributionDurability,
  EditorContributionContext,
  ShortcutContribution,
  ShortcutTarget
} from './kernel';

export type CommandPaletteItemKind = 'action' | 'command';

interface CommandPaletteItemBase {
  readonly id: EditorCommandId;
  readonly label: string;
  readonly enabled: boolean;
  readonly shortcutKeys: readonly string[];
  readonly run: () => boolean;
}

export type CommandPaletteItem =
  | (CommandPaletteItemBase & {
      readonly kind: 'action';
    })
  | (CommandPaletteItemBase & {
      readonly kind: 'command';
      readonly durability: CommandContributionDurability;
    });

export function createCommandPaletteItems(kernel: EditorContributionContext): readonly CommandPaletteItem[] {
  return [
    ...kernel.registries.actions.map((action) => actionPaletteItem(kernel, action)),
    ...kernel.registries.commands.map((command) => commandPaletteItem(kernel, command))
  ];
}

export function filterCommandPaletteItems(
  items: readonly CommandPaletteItem[],
  query: string
): readonly CommandPaletteItem[] {
  const normalizedQuery = normalizePaletteText(query);

  if (!normalizedQuery) {
    return items;
  }

  return items.filter((item) =>
    [item.label, item.id, item.kind, ...durabilitySearchTerms(item), ...item.shortcutKeys].some((value) =>
      normalizePaletteText(value).includes(normalizedQuery)
    )
  );
}

function actionPaletteItem(kernel: EditorContributionContext, action: ActionContribution): CommandPaletteItem {
  return {
    kind: 'action',
    id: action.id,
    label: action.label,
    enabled: isRegisteredActionEnabled(kernel, action),
    shortcutKeys: shortcutKeysForTarget(kernel.registries.shortcuts, { kind: 'action', id: action.id }),
    run: () => runRegisteredAction(kernel, action.id)
  };
}

function commandPaletteItem(kernel: EditorContributionContext, command: CommandContribution): CommandPaletteItem {
  return {
    kind: 'command',
    id: command.id,
    label: command.label,
    enabled: isRegisteredCommandEnabled(kernel, command),
    durability: command.durability,
    shortcutKeys: shortcutKeysForTarget(kernel.registries.shortcuts, { kind: 'command', id: command.id }),
    run: () => dispatchRegisteredCommand(kernel, command.id)
  };
}

function durabilitySearchTerms(item: CommandPaletteItem): readonly string[] {
  if (item.kind !== 'command') {
    return [];
  }

  return item.durability.kind === 'legacy'
    ? [item.durability.kind, item.durability.reason]
    : [item.durability.kind];
}

function shortcutKeysForTarget(
  shortcuts: readonly ShortcutContribution[],
  target: ShortcutTarget
): readonly string[] {
  return shortcuts.filter((shortcut) => sameShortcutTarget(shortcut.target, target)).map((shortcut) => shortcut.keys);
}

function sameShortcutTarget(first: ShortcutTarget, second: ShortcutTarget): boolean {
  return first.kind === second.kind && first.id === second.id;
}

function normalizePaletteText(text: string): string {
  return text.trim().toLowerCase();
}
