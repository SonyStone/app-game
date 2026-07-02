import { Key } from '@solid-primitives/keyed';
import { createSignal, For, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';

import { decorativeIconProps } from '../../editor/svg-icon';
import type { EditorTab, PanelId } from '../../editor/types';
import { editorPanels } from '../panels/panelRegistry';
import CopyIcon from '../ui/icons/Copy.svg';
import ExportIcon from '../ui/icons/Export.svg';
import GodSvgIcon from '../ui/icons/GodSvg.svg';
import HeartIcon from '../ui/icons/Heart.svg';
import ImportIcon from '../ui/icons/Import.svg';
import { IconButton } from '../ui/IconButton';
import { MenuButton, MenuLink } from '../ui/MenuItem';
import CreateTabIcon from './icons/CreateTab.svg';
import GearIcon from './icons/Gear.svg';
import LinkIcon from './icons/Link.svg';
import MoreIcon from './icons/More.svg';
import RedoIcon from './icons/Redo.svg';
import SaveIcon from './icons/Save.svg';
import ShortcutPanelIcon from './icons/ShortcutPanel.svg';
import UndoIcon from './icons/Undo.svg';

export function TopBar(props: {
  readonly activeTab: EditorTab | undefined;
  readonly tabs: readonly EditorTab[];
  readonly activeTabId: string;
  readonly fileSize: string;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly setActiveTabId: (id: string) => void;
  readonly closeTab: (id: string) => void;
  readonly createNewTab: () => void;
  readonly openImportDialog: () => void;
  readonly downloadSvg: () => void;
  readonly copySvgText: () => void;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly optimizeActive: () => void;
  readonly openExport: () => void;
  readonly openSettings: () => void;
  readonly openAbout: () => void;
  readonly openDonate: () => void;
  readonly openShortcuts: () => void;
}) {
  const [moreOpen, setMoreOpen] = createSignal(false);

  return (
    <header
      class="topbar relative z-20 grid h-8 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b-2 border-b-[#20263a] bg-[#0c0e18] px-2 py-0.5"
      data-testid="topbar"
    >
      <div class="flex min-w-0 items-center gap-1" data-testid="topbar-left-actions">
        <IconButton
          icon={MoreIcon}
          label="More"
          testId="topbar-more-button"
          onClick={() => setMoreOpen(!moreOpen())}
          active={moreOpen()}
        />
        <Show when={moreOpen()}>
          <div
            class="popover top-popover absolute top-7.75 left-2 z-50 grid min-w-47.5 gap-0.5 rounded-md border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_96%,#000)] p-1.25 shadow-[0_12px_28px_#0008]"
            data-testid="topbar-more-popover"
          >
            <MenuButton
              type="button"
              icon={ShortcutPanelIcon}
              data-testid="topbar-menu-shortcuts"
              onClick={props.openShortcuts}
            >
              Shortcuts
            </MenuButton>
            <MenuButton type="button" icon={GodSvgIcon} data-testid="topbar-menu-about" onClick={props.openAbout}>
              About
            </MenuButton>
            <MenuButton type="button" icon={HeartIcon} data-testid="topbar-menu-donate" onClick={props.openDonate}>
              Donate
            </MenuButton>
            <MenuLink
              icon={LinkIcon}
              href="https://github.com/MewPurPur/GodSVG"
              target="_blank"
              rel="noreferrer"
              data-testid="topbar-menu-repository"
            >
              Repository
            </MenuLink>
            <MenuLink
              icon={LinkIcon}
              href="https://godsvg.com"
              target="_blank"
              rel="noreferrer"
              data-testid="topbar-menu-website"
            >
              Website
            </MenuLink>
          </div>
        </Show>
        <IconButton icon={GearIcon} label="Settings" testId="topbar-settings-button" onClick={props.openSettings} />
        <IconButton
          icon={UndoIcon}
          label="Undo"
          testId="topbar-undo-button"
          onClick={props.undo}
          disabled={!props.canUndo}
        />
        <IconButton
          icon={RedoIcon}
          label="Redo"
          testId="topbar-redo-button"
          onClick={props.redo}
          disabled={!props.canRedo}
        />
        <button
          class="size-button h-6.5 cursor-pointer rounded-[5px] border border-[color-mix(in_srgb,var(--warning)_50%,var(--soft-border))] bg-[var(--panel-2)] px-2 py-0 text-[var(--warning)]"
          type="button"
          onClick={props.optimizeActive}
          title="Optimize"
          data-testid="topbar-optimize-button"
        >
          {props.fileSize}
        </button>
      </div>
      <div
        class="tabs-strip flex h-full min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]"
        data-testid="tabs-strip"
      >
        <Key each={props.tabs} by="id">
          {(tab) => (
            <div
              role="tab"
              tabIndex={0}
              class="tab-button relative flex h-6.5 max-w-52.5 cursor-pointer items-center gap-1.5 rounded-t-[5px] border border-[#22283d] bg-[#151928] py-0 pr-1.5 pl-2.5 text-[var(--muted)] [&.active]:border-[#415177] [&.active]:bg-[#24304d] [&.active]:text-[#f4f7ff] [&.dirty>span::after]:text-[var(--warning)] [&.dirty>span::after]:content-['*']"
              classList={{ active: props.activeTabId === tab().id, dirty: tab().dirty }}
              data-testid={`tab-${tab().id}`}
              onClick={() => props.setActiveTabId(tab().id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  props.setActiveTabId(tab().id);
                }
              }}
              onAuxClick={(event) => {
                if (event.button === 1) {
                  props.closeTab(tab().id);
                }
              }}
            >
              <span class="overflow-hidden text-ellipsis whitespace-nowrap" data-testid={`tab-label-${tab().id}`}>
                {tab().name}
              </span>
              <button
                type="button"
                class="tab-close grid h-4.5 w-4.5 cursor-pointer place-items-center rounded border-0 bg-transparent text-inherit hover:bg-[#33405f]"
                data-testid={`tab-close-${tab().id}`}
                onClick={(event) => {
                  event.stopPropagation();
                  props.closeTab(tab().id);
                }}
              >
                ×
              </button>
            </div>
          )}
        </Key>
        <IconButton icon={CreateTabIcon} label="New tab" testId="new-tab-button" onClick={props.createNewTab} />
      </div>
      <div class="flex min-w-0 items-center gap-1" data-testid="topbar-file-actions">
        <button
          class="toolbar-action inline-flex h-6.5 cursor-pointer items-center gap-1.5 rounded-[5px] border border-[color-mix(in_srgb,var(--accent)_44%,var(--soft-border))] bg-[var(--panel-2)] px-2.25 py-0 text-[var(--text)] hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_18%,var(--panel-2))]"
          type="button"
          data-testid="import-button"
          onClick={props.openImportDialog}
        >
          <ImportIcon {...decorativeIconProps} /> Import
        </button>
        <IconButton icon={SaveIcon} label="Save SVG" testId="save-svg-button" onClick={props.downloadSvg} />
        <IconButton icon={CopyIcon} label="Copy SVG text" testId="copy-svg-button" onClick={props.copySvgText} />
        <IconButton icon={ExportIcon} label="Export" testId="export-button" onClick={props.openExport} />
      </div>
    </header>
  );
}

export function PanelTabs(props: {
  readonly activePanel: PanelId;
  readonly setActivePanel: (panel: PanelId) => void;
}) {
  return (
    <div class="panel-tabs flex min-w-0 items-center justify-center gap-1.5" data-testid="panel-tabs">
      <For each={editorPanels}>
        {(panel) => (
          <button
            type="button"
            class="flex h-7 cursor-pointer items-center gap-1.25 rounded-t-[5px] border border-transparent bg-transparent px-1 py-0 text-[var(--muted)] [&.active]:border-[var(--soft-border)] [&.active]:bg-[var(--panel-2)] [&.active]:text-[var(--text)]"
            classList={{ active: props.activePanel === panel.id }}
            data-testid={`panel-tab-${panel.id}`}
            onClick={() => props.setActivePanel(panel.id)}
          >
            <Dynamic component={panel.icon} {...decorativeIconProps} />
            <span class="whitespace-nowrap">{panel.label}</span>
          </button>
        )}
      </For>
    </div>
  );
}
