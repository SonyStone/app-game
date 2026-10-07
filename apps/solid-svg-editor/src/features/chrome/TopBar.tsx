import { Dynamic } from '@solidjs/web';
import { createSignal, For, Show } from 'solid-js';

import { decorativeIconProps } from '../../editor/svg-icon';
import type { EditorTab, PanelId } from '../../editor/types';
import { editorPanels } from '../panels/panelRegistry';
import { createDismissible } from '../ui/createDismissible';
import { IconButton } from '../ui/IconButton';
import CopyIcon from '../ui/icons/Copy.svg';
import ExportIcon from '../ui/icons/Export.svg';
import GodSvgIcon from '../ui/icons/GodSvg.svg';
import HeartIcon from '../ui/icons/Heart.svg';
import ImportIcon from '../ui/icons/Import.svg';
import { MenuButton, MenuLink } from '../ui/MenuItem';
import CreateTabIcon from './icons/CreateTab.svg';
import GearIcon from './icons/Gear.svg';
import LinkIcon from './icons/Link.svg';
import MoreIcon from './icons/More.svg';
import RedoIcon from './icons/Redo.svg';
import SaveIcon from './icons/Save.svg';
import ShortcutPanelIcon from './icons/ShortcutPanel.svg';
import UndoIcon from './icons/Undo.svg';
import { useI18n } from '../../i18n/I18nProvider';
import { tabsToClose, type TabCloseGroup } from '../documents/tab-groups';
import { godSvgRepositoryUrl, godSvgWebsiteUrl } from '../../editor/links';

export function TopBar(props: {
  readonly activeTab: EditorTab | undefined;
  readonly tabs: readonly EditorTab[];
  readonly activeTabId: string;
  readonly fileSize: string;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Activates the tab with this id and clears the selection. */
  readonly selectTab: (id: string) => void;
  /** Closes a tab, asking first when it has unsaved changes. */
  readonly closeTab: (id: string) => void;
  /** Closes several tabs, asking about each unsaved one. */
  readonly closeTabs: (ids: readonly string[]) => void;
  /** Moves a tab to a new position (tab dragging). */
  readonly moveTab: (id: string, toIndex: number) => void;
  /** Downloads a tab's SVG and marks it saved. */
  readonly saveTab: (id: string) => void;
  /** Whether a middle click on a tab closes it (the "Middle click closes tab" setting). */
  readonly middleClickCloses: boolean;
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
  const { t } = useI18n();
  const [moreOpen, setMoreOpen] = createSignal(false);
  let leftActions: HTMLDivElement | undefined;
  const [tabMenu, setTabMenu] = createSignal<{ readonly x: number; readonly y: number; readonly tabId?: string }>();
  const [draggedTabId, setDraggedTabId] = createSignal<string>();
  const [dropTarget, setDropTarget] = createSignal<{ readonly tabId: string; readonly after: boolean }>();

  function dropTab(): void {
    const dragged = draggedTabId();
    const target = dropTarget();
    setDraggedTabId(undefined);
    setDropTarget(undefined);

    if (!dragged || !target || dragged === target.tabId) {
      return;
    }

    const withoutDragged = props.tabs.filter((tab) => tab.id !== dragged);
    const targetIndex = withoutDragged.findIndex((tab) => tab.id === target.tabId);
    props.moveTab(dragged, targetIndex + (target.after ? 1 : 0));
  }
  createDismissible({ open: moreOpen, container: () => leftActions, close: () => setMoreOpen(false) });

  return (
    <header
      class="topbar relative z-20 grid h-8 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b-2 border-b-[#20263a] bg-[#0c0e18] px-2 py-0.5"
      data-testid="topbar"
    >
      <div ref={(element) => (leftActions = element)} class="flex min-w-0 items-center gap-1" data-testid="topbar-left-actions">
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
              {t('Shortcuts')}
            </MenuButton>
            <MenuButton type="button" icon={GodSvgIcon} data-testid="topbar-menu-about" onClick={props.openAbout}>
              {t('About…')}
            </MenuButton>
            <MenuButton type="button" icon={HeartIcon} data-testid="topbar-menu-donate" onClick={props.openDonate}>
              {t('Donate…')}
            </MenuButton>
            <MenuLink
              icon={LinkIcon}
              href={godSvgRepositoryUrl}
              target="_blank"
              rel="noreferrer"
              data-testid="topbar-menu-repository"
            >
              {t('GodSVG repository')}
            </MenuLink>
            <MenuLink
              icon={LinkIcon}
              href={godSvgWebsiteUrl}
              target="_blank"
              rel="noreferrer"
              data-testid="topbar-menu-website"
            >
              {t('GodSVG website')}
            </MenuLink>
          </div>
        </Show>
        <IconButton icon={GearIcon} label={t('Settings')} testId="topbar-settings-button" onClick={props.openSettings} />
        <IconButton
          icon={UndoIcon}
          label={t('Undo')}
          testId="topbar-undo-button"
          onClick={props.undo}
          disabled={!props.canUndo}
        />
        <IconButton
          icon={RedoIcon}
          label={t('Redo')}
          testId="topbar-redo-button"
          onClick={props.redo}
          disabled={!props.canRedo}
        />
        <button
          class="size-button h-6.5 cursor-pointer rounded-[5px] border border-[color-mix(in_srgb,var(--warning)_50%,var(--soft-border))] bg-[var(--panel-2)] px-2 py-0 text-[var(--warning)]"
          type="button"
          onClick={props.optimizeActive}
          title={t('Optimize')}
          data-testid="topbar-optimize-button"
        >
          {props.fileSize}
        </button>
      </div>
      <div
        class="tabs-strip flex h-full min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]"
        data-testid="tabs-strip"
        onDblClick={(event) => {
          if (event.target === event.currentTarget) {
            props.createNewTab();
          }
        }}
        onContextMenu={(event) => {
          if (event.target === event.currentTarget) {
            event.preventDefault();
            setTabMenu({ x: event.clientX, y: event.clientY });
          }
        }}
      >
        <For each={props.tabs} keyed={(tab) => tab.id}>
          {(tab) => (
            <div
              role="tab"
              tabindex={0}
              class={[
                "tab-button relative flex h-6.5 max-w-52.5 data-[drop=after]:shadow-[inset_-2px_0_0_var(--accent)] data-[drop=before]:shadow-[inset_2px_0_0_var(--accent)] cursor-pointer items-center gap-1.5 rounded-t-[5px] border border-[#22283d] bg-[#151928] py-0 pr-1.5 pl-2.5 text-[var(--muted)] [&.active]:border-[#415177] [&.active]:bg-[#24304d] [&.active]:text-[#f4f7ff] [&.dirty>span::after]:text-[var(--warning)] [&.dirty>span::after]:content-['*']",
                { active: props.activeTabId === tab().id, dirty: tab().dirty }
              ]}
              aria-selected={props.activeTabId === tab().id ? 'true' : 'false'}
              data-testid={`tab-${tab().id}`}
              data-drop={dropTarget()?.tabId === tab().id ? (dropTarget()?.after ? 'after' : 'before') : undefined}
              draggable="true"
              onDragStart={(event) => {
                setDraggedTabId(tab().id);
                event.dataTransfer?.setData(tabDragType, tab().id);

                if (event.dataTransfer) {
                  event.dataTransfer.effectAllowed = 'move';
                }
              }}
              onDragOver={(event) => {
                if (!draggedTabId()) {
                  return;
                }

                event.preventDefault();
                const rect = event.currentTarget.getBoundingClientRect();
                setDropTarget({ tabId: tab().id, after: event.clientX > rect.left + rect.width / 2 });
              }}
              onDrop={(event) => {
                event.preventDefault();
                dropTab();
              }}
              onDragEnd={() => {
                setDraggedTabId(undefined);
                setDropTarget(undefined);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                setTabMenu({ x: event.clientX, y: event.clientY, tabId: tab().id });
              }}
              onClick={() => props.selectTab(tab().id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  props.selectTab(tab().id);
                }
              }}
              onAuxClick={(event) => {
                if (event.button === 1 && props.middleClickCloses) {
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
        </For>
        <IconButton icon={CreateTabIcon} label={t('Create a new tab')} testId="new-tab-button" onClick={props.createNewTab} />
      </div>
      <Show when={tabMenu()}>
        {(menu) => (
          <TabMenu
            x={menu().x}
            y={menu().y}
            tabId={menu().tabId}
            tabs={props.tabs}
            createNewTab={props.createNewTab}
            closeTabs={props.closeTabs}
            saveTab={props.saveTab}
            close={() => setTabMenu(undefined)}
          />
        )}
      </Show>
      <div class="flex min-w-0 items-center gap-1" data-testid="topbar-file-actions">
        <button
          class="toolbar-action inline-flex h-6.5 cursor-pointer items-center gap-1.5 rounded-[5px] border border-[color-mix(in_srgb,var(--accent)_44%,var(--soft-border))] bg-[var(--panel-2)] px-2.25 py-0 text-[var(--text)] hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_18%,var(--panel-2))]"
          type="button"
          data-testid="import-button"
          onClick={props.openImportDialog}
        >
          <ImportIcon {...decorativeIconProps} /> {t('Import')}
        </button>
        <IconButton icon={SaveIcon} label={t('Save SVG')} testId="save-svg-button" onClick={props.downloadSvg} />
        <IconButton icon={CopyIcon} label={t('Copy the SVG text')} testId="copy-svg-button" onClick={props.copySvgText} />
        <IconButton icon={ExportIcon} label={t('Export')} testId="export-button" onClick={props.openExport} />
      </div>
    </header>
  );
}

export function PanelTabs(props: { readonly activePanel: PanelId; readonly setActivePanel: (panel: PanelId) => void }) {
  const { t } = useI18n();

  return (
    <div class="panel-tabs flex min-w-0 items-center justify-[safe_center] gap-1.5 overflow-x-auto [scrollbar-width:none]" data-testid="panel-tabs">
      <For each={editorPanels}>
        {(panel) => (
          <button
            type="button"
            class={[
              'flex h-7 cursor-pointer items-center gap-1.25 rounded-t-[5px] border border-transparent bg-transparent px-1 py-0 text-[var(--muted)] [&.active]:border-[var(--soft-border)] [&.active]:bg-[var(--panel-2)] [&.active]:text-[var(--text)]',
              { active: props.activePanel === panel.id }
            ]}
            data-testid={`panel-tab-${panel.id}`}
            onClick={() => props.setActivePanel(panel.id)}
          >
            <Dynamic component={panel.icon} {...decorativeIconProps} />
            <span class="whitespace-nowrap">{t(panel.label)}</span>
          </button>
        )}
      </For>
    </div>
  );
}

const tabMenuGroups = [
  { key: 'close', label: 'Close tab' },
  { key: 'close-others', label: 'Close all other tabs' },
  { key: 'close-left', label: 'Close tabs to the left' },
  { key: 'close-right', label: 'Close tabs to the right' },
  { key: 'close-empty', label: 'Close empty tabs' },
  { key: 'close-saved', label: 'Close saved tabs' }
] as const satisfies readonly { readonly key: TabCloseGroup; readonly label: string }[];

/** Drag data type for tabs, so dropping a tab is never mistaken for dropping SVG text to import. */
const tabDragType = 'application/x-solid-svg-editor-tab';

/**
 * GodSVG's tab bar menu. On a tab: close it, close several (others, to the left, to the right, empty, saved), or
 * save it; on the empty bar: open a new tab. Close actions go through the unsaved-changes dialog.
 */
function TabMenu(props: {
  readonly x: number;
  readonly y: number;
  readonly tabId: string | undefined;
  readonly tabs: readonly EditorTab[];
  readonly createNewTab: () => void;
  readonly closeTabs: (ids: readonly string[]) => void;
  readonly saveTab: (id: string) => void;
  readonly close: () => void;
}) {
  const { t } = useI18n();
  let menu: HTMLDivElement | undefined;
  createDismissible({ open: () => true, container: () => menu, close: () => props.close() });
  const index = () => props.tabs.findIndex((tab) => tab.id === props.tabId);
  const run = (action: () => void) => {
    props.close();
    action();
  };
  const groups = () =>
    tabMenuGroups.map((group) => ({ ...group, ids: tabsToClose(props.tabs, index(), group.key) }));

  return (
    <div
      ref={(element) => (menu = element)}
      class="popover fixed z-50 grid min-w-52 gap-0.5 rounded-md border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_96%,#000)] p-1.25 shadow-[0_12px_28px_#0008]"
      style={{ left: `${props.x}px`, top: `${props.y}px` }}
      data-testid="tab-menu"
    >
      <Show
        when={props.tabId}
        fallback={
          <MenuButton type="button" icon={CreateTabIcon} data-testid="tab-menu-new" onClick={() => run(props.createNewTab)}>
            {t('Create tab')}
          </MenuButton>
        }
      >
        {(tabId) => (
          <>
            <For each={groups()}>
              {(group) => (
                <MenuButton
                  type="button"
                  disabled={group.ids.length === 0}
                  data-testid={`tab-menu-${group.key}`}
                  onClick={() => run(() => props.closeTabs(group.ids))}
                >
                  {t(group.label)}
                </MenuButton>
              )}
            </For>
            <MenuButton type="button" icon={SaveIcon} data-testid="tab-menu-save" onClick={() => run(() => props.saveTab(tabId()))}>
              {t('Save')}
            </MenuButton>
          </>
        )}
      </Show>
    </div>
  );
}
