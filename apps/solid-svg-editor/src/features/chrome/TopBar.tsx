import { Key } from '@solid-primitives/keyed';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';

import { createAppMenuItems, topBarMenuSlots, type AppMenuItem } from '../../editor/app-menu';
import type { EditorKernel } from '../../editor/kernel';
import { decorativeIconProps, type SvgIcon } from '../../editor/svg-icon';
import type { PanelId } from '../../editor/types';
import type { EditorPanelDescriptor } from '../panels/panelRegistry';
import { IconButton } from '../ui/IconButton';
import { MenuButton, MenuLink } from '../ui/MenuItem';
import MoreIcon from './icons/More.svg';

export function TopBar<TPanelContext>(props: { readonly kernel: EditorKernel<TPanelContext> }) {
  const [moreOpen, setMoreOpen] = createSignal(false);
  const menuItems = createMemo(() => createAppMenuItems(props.kernel));
  const menuItemsFor = (slot: AppMenuItem['slot']) => menuItems().filter((item) => item.slot === slot);
  const tabs = () => props.kernel.documents.tabs();
  const activeTabId = () => props.kernel.documents.activeTabId();
  const setActiveTabId = props.kernel.documents.setActiveTabId;
  const closeTab = props.kernel.documents.closeTab;

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
            <For each={menuItemsFor(topBarMenuSlots.more)}>
              {(item) => <TopBarMenuItem item={item} onRun={() => setMoreOpen(false)} />}
            </For>
          </div>
        </Show>
        <For each={menuItemsFor(topBarMenuSlots.primary)}>{(item) => <TopBarMenuItem item={item} />}</For>
      </div>
      <div
        class="tabs-strip flex h-full min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]"
        data-testid="tabs-strip"
      >
        <Key each={tabs()} by="id">
          {(tab) => (
            <div
              role="tab"
              tabIndex={0}
              class="tab-button relative flex h-6.5 max-w-52.5 cursor-pointer items-center gap-1.5 rounded-t-[5px] border border-[#22283d] bg-[#151928] py-0 pr-1.5 pl-2.5 text-[var(--muted)] [&.active]:border-[#415177] [&.active]:bg-[#24304d] [&.active]:text-[#f4f7ff] [&.dirty>span::after]:text-[var(--warning)] [&.dirty>span::after]:content-['*']"
              classList={{ active: activeTabId() === tab().id, dirty: tab().dirty }}
              data-testid={`tab-${tab().id}`}
              onClick={() => setActiveTabId(tab().id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setActiveTabId(tab().id);
                }
              }}
              onAuxClick={(event) => {
                if (event.button === 1) {
                  closeTab(tab().id);
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
                  closeTab(tab().id);
                }}
              >
                ×
              </button>
            </div>
          )}
        </Key>
        <For each={menuItemsFor(topBarMenuSlots.tabs)}>{(item) => <TopBarMenuItem item={item} />}</For>
      </div>
      <div class="flex min-w-0 items-center gap-1" data-testid="topbar-file-actions">
        <For each={menuItemsFor(topBarMenuSlots.file)}>{(item) => <TopBarMenuItem item={item} />}</For>
      </div>
    </header>
  );
}

function TopBarMenuItem(props: { readonly item: AppMenuItem; readonly onRun?: () => void }) {
  if (props.item.kind === 'link') {
    return (
      <MenuLink
        {...iconProps(props.item.icon)}
        {...testIdDataProps(props.item.testId)}
        {...(props.item.target === undefined ? {} : { target: props.item.target })}
        {...(props.item.rel === undefined ? {} : { rel: props.item.rel })}
        href={props.item.href}
      >
        {props.item.displayLabel}
      </MenuLink>
    );
  }

  const item = props.item;
  const onClick = () => {
    if (item.run()) {
      props.onRun?.();
    }
  };

  if (item.presentation === 'icon-button' && item.icon !== undefined) {
    return (
      <IconButton
        icon={item.icon}
        label={item.label}
        onClick={onClick}
        disabled={!item.enabled}
        {...testIdIconProps(item.testId)}
      />
    );
  }

  if (item.presentation === 'status-button') {
    return (
      <button
        class="size-button h-6.5 cursor-pointer rounded-[5px] border border-[color-mix(in_srgb,var(--warning)_50%,var(--soft-border))] bg-[var(--panel-2)] px-2 py-0 text-[var(--warning)] disabled:cursor-default disabled:opacity-[0.42]"
        type="button"
        title={item.label}
        disabled={!item.enabled}
        onClick={onClick}
        {...testIdDataProps(item.testId)}
      >
        {item.displayLabel}
      </button>
    );
  }

  if (item.presentation === 'text-button' || item.presentation === 'icon-button') {
    return <TopBarTextButton item={item} onClick={onClick} />;
  }

  return (
    <MenuButton
      {...iconProps(item.icon)}
      {...testIdDataProps(item.testId)}
      type="button"
      disabled={!item.enabled}
      onClick={onClick}
    >
      {item.displayLabel}
    </MenuButton>
  );
}

function TopBarTextButton(props: {
  readonly item: Extract<AppMenuItem, { readonly kind: 'action' }>;
  readonly onClick: () => void;
}) {
  return (
    <button
      class="toolbar-action inline-flex h-6.5 cursor-pointer items-center gap-1.5 rounded-[5px] border border-[color-mix(in_srgb,var(--accent)_44%,var(--soft-border))] bg-[var(--panel-2)] px-2.25 py-0 text-[var(--text)] hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_18%,var(--panel-2))] disabled:cursor-default disabled:opacity-[0.42]"
      type="button"
      disabled={!props.item.enabled}
      onClick={props.onClick}
      {...testIdDataProps(props.item.testId)}
    >
      <Show when={props.item.icon}>{(Icon) => <Dynamic component={Icon()} {...decorativeIconProps} />}</Show>
      {props.item.displayLabel}
    </button>
  );
}

function iconProps(icon: SvgIcon | undefined): { readonly icon?: SvgIcon } {
  return icon === undefined ? {} : { icon };
}

function testIdDataProps(testId: string | undefined): { readonly 'data-testid'?: string } {
  return testId === undefined ? {} : { 'data-testid': testId };
}

function testIdIconProps(testId: string | undefined): { readonly testId?: string } {
  return testId === undefined ? {} : { testId };
}

export function PanelTabs(props: {
  readonly panels: readonly EditorPanelDescriptor[];
  readonly activePanel: PanelId;
  readonly setActivePanel: (panel: PanelId) => void;
}) {
  return (
    <div class="panel-tabs flex min-w-0 items-center justify-center gap-1.5" data-testid="panel-tabs">
      <For each={props.panels}>
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
