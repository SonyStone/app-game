import { canRunRegisteredAction, findRegisteredAction, isRegisteredActionEnabled, runRegisteredAction } from './action-registry';
import {
  canRunRegisteredCommand,
  dispatchRegisteredCommand,
  findRegisteredCommand,
  isRegisteredCommandEnabled
} from './command-registry';
import type { AppMenuItemContribution, AppMenuSlot, EditorContributionContext } from './kernel';
import type { SvgIcon } from './svg-icon';

export const topBarMenuSlots = {
  primary: 'topbar.primary',
  tabs: 'topbar.tabs',
  file: 'topbar.file',
  more: 'topbar.more'
} as const satisfies Record<string, AppMenuSlot>;

export type AppMenuItemPresentation = 'menu-item' | 'icon-button' | 'text-button' | 'status-button';

interface AppMenuItemBase {
  readonly id: string;
  readonly slot: AppMenuSlot;
  readonly label: string;
  readonly displayLabel: string;
  readonly icon?: SvgIcon;
  readonly presentation: AppMenuItemPresentation;
  readonly testId?: string;
}

export type AppMenuItem =
  | (AppMenuItemBase & {
      readonly kind: 'action';
      readonly enabled: boolean;
      readonly run: () => boolean;
    })
  | (AppMenuItemBase & {
      readonly kind: 'link';
      readonly href: string;
      readonly target?: string;
      readonly rel?: string;
    });

export function createAppMenuItems(
  kernel: EditorContributionContext,
  slot?: AppMenuSlot
): readonly AppMenuItem[] {
  return [...kernel.registries.appMenus]
    .sort(compareAppMenuItems)
    .filter((item) => (slot === undefined || item.slot === slot) && (item.isVisible?.(kernel) ?? true))
    .map((item) => createAppMenuItem(kernel, item));
}

function createAppMenuItem(
  kernel: EditorContributionContext,
  contribution: AppMenuItemContribution
): AppMenuItem {
  if (contribution.kind === 'link') {
    return createLinkAppMenuItem(contribution);
  }

  if (contribution.kind === 'registered-command') {
    return createRegisteredCommandAppMenuItem(kernel, contribution);
  }

  return createActionAppMenuItem(kernel, contribution);
}

function createActionAppMenuItem(
  kernel: EditorContributionContext,
  contribution: Extract<AppMenuItemContribution, { readonly kind: 'action' }>
): AppMenuItem {
  const action = findRegisteredAction(kernel, contribution.actionId);
  const label = contribution.label ?? action?.label ?? contribution.actionId;
  const item = {
    kind: 'action',
    id: contribution.id,
    slot: contribution.slot,
    label,
    displayLabel: contribution.labelFor?.(kernel) ?? label,
    presentation: contribution.presentation ?? 'menu-item',
    enabled: action !== undefined && isRegisteredActionEnabled(kernel, action) && (contribution.isEnabled?.(kernel) ?? true),
    run: () => {
      if (!canRunRegisteredAction(kernel, contribution.actionId) || contribution.isEnabled?.(kernel) === false) {
        return false;
      }

      return runRegisteredAction(kernel, contribution.actionId);
    }
  } satisfies AppMenuItem;

  return addOptionalBaseFields(item, contribution);
}

function createRegisteredCommandAppMenuItem(
  kernel: EditorContributionContext,
  contribution: Extract<AppMenuItemContribution, { readonly kind: 'registered-command' }>
): AppMenuItem {
  const command = findRegisteredCommand(kernel, contribution.commandId);
  const label = contribution.label ?? command?.label ?? contribution.commandId;
  const item = {
    kind: 'action',
    id: contribution.id,
    slot: contribution.slot,
    label,
    displayLabel: contribution.labelFor?.(kernel) ?? label,
    presentation: contribution.presentation ?? 'menu-item',
    enabled:
      command !== undefined &&
      isRegisteredCommandEnabled(kernel, command) &&
      (contribution.isEnabled?.(kernel) ?? true),
    run: () => {
      if (!canRunRegisteredCommand(kernel, contribution.commandId) || contribution.isEnabled?.(kernel) === false) {
        return false;
      }

      return dispatchRegisteredCommand(kernel, contribution.commandId);
    }
  } satisfies AppMenuItem;

  return addOptionalBaseFields(item, contribution);
}

function createLinkAppMenuItem(
  contribution: Extract<AppMenuItemContribution, { readonly kind: 'link' }>
): AppMenuItem {
  const item = {
    kind: 'link',
    id: contribution.id,
    slot: contribution.slot,
    label: contribution.label,
    displayLabel: contribution.label,
    presentation: contribution.presentation ?? 'menu-item',
    href: contribution.href
  } satisfies AppMenuItem;

  return addOptionalLinkFields(addOptionalBaseFields(item, contribution), contribution);
}

function addOptionalBaseFields<TItem extends AppMenuItemBase>(
  item: TItem,
  contribution: Pick<AppMenuItemContribution, 'icon' | 'testId'>
): TItem {
  return {
    ...item,
    ...(contribution.icon === undefined ? {} : { icon: contribution.icon }),
    ...(contribution.testId === undefined ? {} : { testId: contribution.testId })
  };
}

function addOptionalLinkFields<TItem extends Extract<AppMenuItem, { readonly kind: 'link' }>>(
  item: TItem,
  contribution: Pick<Extract<AppMenuItemContribution, { readonly kind: 'link' }>, 'target' | 'rel'>
): TItem {
  return {
    ...item,
    ...(contribution.target === undefined ? {} : { target: contribution.target }),
    ...(contribution.rel === undefined ? {} : { rel: contribution.rel })
  };
}

function compareAppMenuItems(first: AppMenuItemContribution, second: AppMenuItemContribution): number {
  return (first.order ?? 0) - (second.order ?? 0);
}
