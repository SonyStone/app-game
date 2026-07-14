import { topBarMenuSlots } from '../../editor/app-menu';
import type { AppMenuItemContribution, AppMenuPresentation, EditorContribution, EditorContributionContext } from '../../editor/kernel';
import type { SvgIcon } from '../../editor/svg-icon';
import { humanFileSize } from '../../formatter';
import CopyIcon from '../ui/icons/Copy.svg';
import ExportIcon from '../ui/icons/Export.svg';
import GodSvgIcon from '../ui/icons/GodSvg.svg';
import HeartIcon from '../ui/icons/Heart.svg';
import ImportIcon from '../ui/icons/Import.svg';
import CreateTabIcon from './icons/CreateTab.svg';
import GearIcon from './icons/Gear.svg';
import LinkIcon from './icons/Link.svg';
import RedoIcon from './icons/Redo.svg';
import SaveIcon from './icons/Save.svg';
import ShortcutPanelIcon from './icons/ShortcutPanel.svg';
import UndoIcon from './icons/Undo.svg';

export type AppMenuRegistryContribution = EditorContribution & {
  readonly appMenus: readonly AppMenuItemContribution[];
};

export const coreTopBarMenuContribution = {
  id: 'core.topbar-menus',
  appMenus: [
    actionMenuItem('topbar.more.command-palette', topBarMenuSlots.more, 'command.palette', 10, {
      icon: ShortcutPanelIcon,
      testId: 'topbar-menu-command-palette'
    }),
    actionMenuItem('topbar.more.shortcuts', topBarMenuSlots.more, 'help.shortcuts', 20, {
      label: 'Shortcuts',
      icon: ShortcutPanelIcon,
      testId: 'topbar-menu-shortcuts'
    }),
    actionMenuItem('topbar.more.about', topBarMenuSlots.more, 'help.about', 30, {
      label: 'About',
      icon: GodSvgIcon,
      testId: 'topbar-menu-about'
    }),
    actionMenuItem('topbar.more.donate', topBarMenuSlots.more, 'help.donate', 40, {
      label: 'Donate',
      icon: HeartIcon,
      testId: 'topbar-menu-donate'
    }),
    linkMenuItem('topbar.more.repository', topBarMenuSlots.more, 'Repository', 'https://github.com/MewPurPur/GodSVG', 50, {
      icon: LinkIcon,
      testId: 'topbar-menu-repository'
    }),
    linkMenuItem('topbar.more.website', topBarMenuSlots.more, 'Website', 'https://godsvg.com', 60, {
      icon: LinkIcon,
      testId: 'topbar-menu-website'
    }),
    actionMenuItem('topbar.primary.settings', topBarMenuSlots.primary, 'help.settings', 10, {
      label: 'Settings',
      icon: GearIcon,
      presentation: 'icon-button',
      testId: 'topbar-settings-button'
    }),
    actionMenuItem('topbar.primary.undo', topBarMenuSlots.primary, 'edit.undo', 20, {
      label: 'Undo',
      icon: UndoIcon,
      presentation: 'icon-button',
      testId: 'topbar-undo-button'
    }),
    actionMenuItem('topbar.primary.redo', topBarMenuSlots.primary, 'edit.redo', 30, {
      label: 'Redo',
      icon: RedoIcon,
      presentation: 'icon-button',
      testId: 'topbar-redo-button'
    }),
    registeredCommandMenuItem('topbar.primary.optimize', topBarMenuSlots.primary, 'svg.optimize', 40, {
      label: 'Optimize',
      labelFor: fileSizeLabel,
      presentation: 'status-button',
      testId: 'topbar-optimize-button'
    }),
    actionMenuItem('topbar.tabs.new-tab', topBarMenuSlots.tabs, 'file.new-tab', 10, {
      label: 'New tab',
      icon: CreateTabIcon,
      presentation: 'icon-button',
      testId: 'new-tab-button'
    }),
    actionMenuItem('topbar.file.import', topBarMenuSlots.file, 'file.import', 10, {
      label: 'Import',
      icon: ImportIcon,
      presentation: 'text-button',
      testId: 'import-button'
    }),
    actionMenuItem('topbar.file.save-svg', topBarMenuSlots.file, 'file.save-svg', 20, {
      label: 'Save SVG',
      icon: SaveIcon,
      presentation: 'icon-button',
      testId: 'save-svg-button'
    }),
    actionMenuItem('topbar.file.copy-svg', topBarMenuSlots.file, 'edit.copy-svg', 30, {
      label: 'Copy SVG text',
      icon: CopyIcon,
      presentation: 'icon-button',
      testId: 'copy-svg-button'
    }),
    actionMenuItem('topbar.file.export', topBarMenuSlots.file, 'file.export', 40, {
      label: 'Export',
      icon: ExportIcon,
      presentation: 'icon-button',
      testId: 'export-button'
    })
  ]
} as const satisfies AppMenuRegistryContribution;

interface ActionMenuItemOptions {
  readonly label?: string;
  readonly icon?: SvgIcon;
  readonly presentation?: AppMenuPresentation;
  readonly testId?: string;
  readonly labelFor?: (context: EditorContributionContext) => string;
}

interface LinkMenuItemOptions {
  readonly icon?: SvgIcon;
  readonly testId?: string;
}

function actionMenuItem(
  id: string,
  slot: AppMenuItemContribution['slot'],
  actionId: Extract<AppMenuItemContribution, { readonly kind: 'action' }>['actionId'],
  order: number,
  options: ActionMenuItemOptions = {}
): AppMenuItemContribution {
  return {
    kind: 'action',
    id,
    slot,
    actionId,
    order,
    ...options
  };
}

function registeredCommandMenuItem(
  id: string,
  slot: AppMenuItemContribution['slot'],
  commandId: Extract<AppMenuItemContribution, { readonly kind: 'registered-command' }>['commandId'],
  order: number,
  options: ActionMenuItemOptions = {}
): AppMenuItemContribution {
  return {
    kind: 'registered-command',
    id,
    slot,
    commandId,
    order,
    ...options
  };
}

function linkMenuItem(
  id: string,
  slot: AppMenuItemContribution['slot'],
  label: string,
  href: string,
  order: number,
  options: LinkMenuItemOptions = {}
): AppMenuItemContribution {
  return {
    kind: 'link',
    id,
    slot,
    label,
    href,
    order,
    target: '_blank',
    rel: 'noreferrer',
    ...options
  };
}

function fileSizeLabel(context: EditorContributionContext): string {
  return humanFileSize(new TextEncoder().encode(context.documents.exportText()).byteLength);
}
