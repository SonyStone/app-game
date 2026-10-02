import { cn } from '@app-game/utils/cn';
import type { JSX } from '@solidjs/web';
import { Dock, type DockGroupApi, type DockNodeId, type DockTabApi, openPanel, useDock } from 'solid-dock';
import { createEffect, createSignal, For, Show } from 'solid-js';
import { CloseIcon, type DemoDockTheme, type DemoLayout, GroupHandle } from './DemoDock';

/** A selectable design: its theme plus how panel titles should look in it. */
export type DemoDesign = {
  id: string;
  label: string;
  /** One line about what the design demonstrates. */
  description: string;
  theme: DemoDockTheme;
  /** Show titles as file names with type badges, like an editor. */
  fileTitles: boolean;
};

/**
 * Creates every design for one dock. Must run under an owner: some themes keep
 * local state (the focused group), and dockview's `+` action edits `layout`.
 */
export function createDesigns(layout: DemoLayout): DemoDesign[] {
  return [
    {
      id: 'minimal',
      label: 'Minimal',
      description: 'Plain borders and an underline: about thirty lines of classes. Start here.',
      theme: minimalTheme,
      fileTitles: false
    },
    {
      id: 'round-out',
      label: 'Round-out',
      description: 'Browser tabs: the active tab flows into its panel through outward rounded corners.',
      theme: createRoundOutTheme(false),
      fileTitles: false
    },
    {
      id: 'round-out-outlined',
      label: 'Round-out outlined',
      description: 'The same tabs with an outline that continues around the panel.',
      theme: createRoundOutTheme(true),
      fileTitles: false
    },
    {
      id: 'pills',
      label: 'Pills',
      description: 'A segmented control instead of tabs: the white pill slides to the active panel.',
      theme: pillTheme,
      fileTitles: false
    },
    {
      id: 'vscode',
      label: 'VS Code',
      description: 'Current VS Code: floating editor cards, rounded tab chips and a breadcrumb row.',
      theme: createVsCodeTheme(),
      fileTitles: true
    },
    {
      id: 'vscode-classic',
      label: 'VS Code classic',
      description: 'Flat editor tabs with an accent line on the active tab of the focused group.',
      theme: createVsCodeClassicTheme(),
      fileTitles: true
    },
    {
      id: 'dockview',
      label: 'dockview',
      description: "dockview's abyss theme with group actions: + reopens a closed panel in that group.",
      theme: createDockviewTheme(layout),
      fileTitles: false
    }
  ];
}

// MARK: Minimal

/** The least styling that still works: borders, an underline and a dashed drop preview. */
export const minimalTheme: DemoDockTheme = {
  root: 'border border-neutral-300 bg-white text-neutral-800 [--dock-gap:1px]',
  group: (group, content) => (
    <section {...group.props} class="flex flex-col">
      <div class="flex shrink-0 border-b border-neutral-300">
        <div
          ref={group.tabListRef}
          role="tablist"
          class="flex min-w-0 flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
        >
          <For each={group.panels()}>
            {(panelId) => (
              <Dock.Tab id={panelId}>
                {(tab) => (
                  <div
                    {...tab.props}
                    class={cn(
                      '-mb-px flex shrink-0 cursor-default items-center gap-1.5 border-b-2 px-3 py-1.5 text-sm whitespace-nowrap select-none',
                      tab.active()
                        ? 'border-neutral-900'
                        : 'border-transparent text-neutral-500 hover:text-neutral-900',
                      tab.dragging() && 'opacity-40'
                    )}
                  >
                    {tab.title()}
                    <Show when={tab.closable()}>
                      <span {...tab.closeProps} role="button" class="text-neutral-400 hover:text-neutral-900">
                        ×
                      </span>
                    </Show>
                  </div>
                )}
              </Dock.Tab>
            )}
          </For>
        </div>
        <GroupHandle group={group} class="w-7 text-neutral-400 hover:text-neutral-900" />
      </div>
      {content}
    </section>
  ),
  sash: (sash) => (
    <div
      {...sash.props}
      class={cn(
        "bg-neutral-300 outline-none before:absolute before:content-[''] hover:bg-neutral-900",
        sash.direction() === 'row'
          ? 'cursor-col-resize before:-inset-x-1 before:inset-y-0'
          : 'cursor-row-resize before:inset-x-0 before:-inset-y-1'
      )}
    />
  ),
  panel: 'bg-white',
  indicator: 'border-2 border-dashed border-neutral-900 bg-neutral-900/5',
  dragLabel: 'border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-800 shadow'
};

// MARK: Round-out

/**
 * Browser-style tabs: the active tab grows into the panel below with outward
 * rounded corners (`outward-b-*` from `unocss/preset-out-rounded`).
 */
function createRoundOutTheme(outlined: boolean): DemoDockTheme {
  return {
    root: 'rounded-xl bg-neutral-950 p-2 text-neutral-200 [color-scheme:dark] [--dock-gap:8px]',
    group: (group, content) => (
      <section {...group.props} class={cn('flex flex-col transition-opacity', group.dragging() && 'opacity-50')}>
        <div class="flex h-9 shrink-0 items-end gap-2 pr-1 pl-5">
          <div ref={group.tabListRef} role="tablist" class="flex h-full min-w-0 flex-1 items-end gap-0.5">
            <For each={group.panels()}>
              {(panelId) => <Dock.Tab id={panelId}>{(tab) => <RoundOutTab tab={tab} outlined={outlined} />}</Dock.Tab>}
            </For>
          </div>
          <GroupHandle
            group={group}
            class="mb-1.5 h-6 w-6 rounded-[6px] text-neutral-600 hover:bg-neutral-800 hover:text-neutral-300"
          />
        </div>
        <div
          class={cn(
            'flex min-h-0 flex-1 flex-col rounded-[10px] bg-neutral-800 p-0.5',
            outlined && 'border border-neutral-400'
          )}
        >
          {content}
        </div>
      </section>
    ),
    sash: (sash) => (
      <div
        {...sash.props}
        class={cn('outline-none', sash.direction() === 'row' ? 'cursor-col-resize' : 'cursor-row-resize')}
      />
    ),
    panel: 'rounded-[6px] bg-neutral-800',
    scroll: 'absolute inset-x-0 top-0 bottom-1.5 overflow-auto [scrollbar-width:thin]',
    indicator: 'rounded-[10px] border-2 border-white/70 bg-white/10',
    dragLabel: 'rounded-t-[10px] bg-neutral-800 px-3 py-1.5 text-sm text-white shadow-xl'
  };
}

function RoundOutTab(props: { tab: DockTabApi; outlined: boolean }): JSX.Element {
  return (
    <div
      {...props.tab.props}
      class={cn(
        'relative flex h-8 min-w-0 cursor-grab items-center gap-2 px-3 text-sm select-none',
        props.tab.active()
          ? cn(
              'outward-b-[10px] outward-bg-neutral-800 z-1 bg-neutral-800 text-white',
              props.outlined && 'outward-border-1 outward-border-neutral-400'
            )
          : 'rounded-t-[10px] text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200',
        props.tab.dragging() && 'opacity-40'
      )}
    >
      <span class="flex items-center gap-1.5 truncate">{props.tab.title()}</span>
      <Show when={props.tab.closable()}>
        <span {...props.tab.closeProps} role="button" class="grid h-4 w-4 place-items-center rounded hover:bg-white/15">
          <CloseIcon />
        </span>
      </Show>
    </div>
  );
}

// MARK: Pills

/** Segmented pill tabs with a sliding highlight, on floating rounded cards. */
const pillTheme: DemoDockTheme = {
  root: 'rounded-2xl bg-black p-1.5 text-neutral-200 [color-scheme:dark] [--dock-gap:6px]',
  group: (group, content) => (
    <section
      {...group.props}
      class={cn(
        'flex flex-col gap-1 rounded-2xl bg-neutral-900 p-1 transition-opacity',
        group.dragging() && 'opacity-50'
      )}
    >
      <div class="flex shrink-0 items-center gap-1">
        <PillTabList group={group} />
        <GroupHandle
          group={group}
          class="ml-auto h-7 w-7 rounded-full text-neutral-600 hover:bg-neutral-800 hover:text-neutral-300"
        />
      </div>
      <div class="flex min-h-0 flex-1 flex-col rounded-xl bg-neutral-800/60">{content}</div>
    </section>
  ),
  sash: (sash) => (
    <div
      {...sash.props}
      class={cn(
        'group flex items-center justify-center outline-none',
        sash.direction() === 'row' ? 'cursor-col-resize' : 'cursor-row-resize'
      )}
    >
      <span
        class={cn(
          'rounded-full bg-neutral-500 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100',
          sash.dragging() && 'bg-white opacity-100',
          sash.direction() === 'row' ? 'h-8 w-0.5' : 'h-0.5 w-8'
        )}
      />
    </div>
  ),
  panel: 'rounded-xl bg-[#1f1f1f]',
  scroll: 'absolute inset-x-0 top-0 bottom-3 overflow-auto [scrollbar-width:thin]',
  indicator: 'rounded-2xl bg-white/10 ring-2 ring-white/50 ring-inset',
  dragLabel: 'rounded-full bg-white px-3 py-1 text-xs font-medium text-neutral-950 shadow-xl'
};

/**
 * Tab strip with a sliding highlight. The highlight is positioned imperatively
 * after the active tab or the tab set changes, because it depends on measured
 * tab offsets.
 */
function PillTabList(props: { group: DockGroupApi }): JSX.Element {
  const tabs = new Map<string, HTMLElement>();
  let highlight: HTMLDivElement | undefined;

  createEffect(
    () => [props.group.active(), props.group.panels().join()] as const,
    ([active]) => {
      const tab = active === undefined ? undefined : tabs.get(active);
      if (!highlight) {
        return;
      }

      highlight.style.opacity = tab ? '1' : '0';
      if (tab) {
        highlight.style.width = `${tab.offsetWidth}px`;
        highlight.style.transform = `translateX(${tab.offsetLeft}px)`;
      }
    }
  );

  return (
    <div
      ref={props.group.tabListRef}
      role="tablist"
      class="relative flex min-w-0 items-center gap-0.5 overflow-hidden rounded-full bg-neutral-950 p-0.5"
    >
      <div
        ref={(element) => (highlight = element)}
        class="absolute inset-y-0.5 left-0 rounded-full bg-white opacity-0 transition-[transform,width] duration-300 ease-out"
      />
      <For each={props.group.panels()}>
        {(panelId) => (
          <Dock.Tab id={panelId}>
            {(tab) => (
              <div
                {...tab.props}
                ref={[tab.props.ref, (element: HTMLElement) => tabs.set(panelId, element)]}
                class={cn(
                  'relative flex shrink-0 cursor-grab items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors duration-300 select-none',
                  tab.active() ? 'text-neutral-950' : 'text-neutral-400 hover:text-neutral-100',
                  tab.dragging() && 'opacity-40'
                )}
              >
                {tab.title()}
                <Show when={tab.closable()}>
                  <span
                    {...tab.closeProps}
                    role="button"
                    class="-mr-1.5 grid h-4 w-4 place-items-center rounded-full hover:bg-black/10"
                  >
                    <CloseIcon class="h-2.5 w-2.5" />
                  </span>
                </Show>
              </div>
            )}
          </Dock.Tab>
        )}
      </For>
    </div>
  );
}

// MARK: VS Code

/** Current VS Code: groups float as rounded cards, tabs are rounded chips, breadcrumbs under the tabs. */
function createVsCodeTheme(): DemoDockTheme {
  const [focused, setFocused] = createSignal<DockNodeId>();

  return {
    root: 'rounded-[12px] bg-[#141414] p-1.5 text-[#cccccc] [color-scheme:dark] font-[system-ui] [--dock-gap:6px]',
    group: (group, content) => (
      <section
        {...group.props}
        class={cn(
          'flex flex-col rounded-[10px] border bg-[#1e1e1e] transition-colors',
          focused() === group.id ? 'border-[#3a3a3a]' : 'border-[#262626]',
          group.dragging() && 'opacity-60'
        )}
        onPointerDown={() => setFocused(group.id)}
      >
        <div class="flex h-10 shrink-0 items-center gap-1 pr-1 pl-1.5">
          <div
            ref={group.tabListRef}
            role="tablist"
            class="flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]"
          >
            <For each={group.panels()}>
              {(panelId) => <Dock.Tab id={panelId}>{(tab) => <VsCodeChipTab tab={tab} />}</Dock.Tab>}
            </For>
          </div>
          <GroupHandle group={group} class="h-7 w-7 rounded-[6px] text-[#7a7a7a] hover:bg-[#2a2a2a] hover:text-white" />
        </div>
        <Breadcrumbs group={group} />
        {content}
      </section>
    ),
    sash: (sash) => (
      <div
        {...sash.props}
        class={cn(
          'group flex items-center justify-center outline-none',
          sash.direction() === 'row' ? 'cursor-col-resize' : 'cursor-row-resize'
        )}
      >
        <span
          class={cn(
            'rounded-full bg-[#0078d4] opacity-0 transition-opacity delay-150 group-hover:opacity-100 group-focus-visible:opacity-100',
            sash.dragging() && 'opacity-100 delay-0',
            sash.direction() === 'row' ? 'h-full w-0.5' : 'h-0.5 w-full'
          )}
        />
      </div>
    ),
    panel: 'bg-[#1e1e1e]',
    indicator: 'rounded-[10px] bg-[#0078d4]/20 ring-1 ring-[#0078d4]/70 ring-inset',
    dragLabel: 'rounded-[6px] border border-[#3a3a3a] bg-[#2a2a2a] px-2 py-1 text-[13px] text-white shadow-lg'
  };
}

function VsCodeChipTab(props: { tab: DockTabApi }): JSX.Element {
  return (
    <div
      {...props.tab.props}
      class={cn(
        'group/tab flex h-7 shrink-0 cursor-default items-center gap-1 rounded-[6px] pr-1 pl-1 text-[13px] whitespace-nowrap select-none',
        props.tab.active() ? 'bg-[#2c2c2c] text-white' : 'text-[#9d9d9d] hover:bg-[#252525] hover:text-[#cccccc]',
        props.tab.dragging() && 'opacity-50'
      )}
    >
      {props.tab.title()}
      <Show when={props.tab.closable()}>
        <span
          {...props.tab.closeProps}
          role="button"
          class={cn(
            'ml-0.5 grid h-5 w-5 place-items-center rounded-[4px] hover:bg-white/10',
            props.tab.active() ? 'visible' : 'invisible group-hover/tab:visible'
          )}
        >
          <CloseIcon class="h-3.5 w-3.5" />
        </span>
      </Show>
    </div>
  );
}

/** `src › <active title> › …` for the group's visible panel. */
function Breadcrumbs(props: { group: DockGroupApi }): JSX.Element {
  const dock = useDock();
  const active = () => {
    const panelId = props.group.active();
    return panelId === undefined ? undefined : dock.panel(panelId);
  };

  return (
    <div class="flex h-6 shrink-0 items-center gap-1 px-3 text-[12px] text-[#9d9d9d]">
      <Show when={active()}>
        {(panel) => (
          <>
            <span>src</span>
            <span class="opacity-60">›</span>
            <span class="flex items-center gap-1">{panel().title}</span>
            <span class="opacity-60">› …</span>
          </>
        )}
      </Show>
    </div>
  );
}

// MARK: VS Code classic

/** Classic VS Code: flat tabs, an accent line on the active tab of the focused group, 1 px sashes. */
function createVsCodeClassicTheme(): DemoDockTheme {
  const [focused, setFocused] = createSignal<DockNodeId>();

  return {
    root: 'rounded-[10px] border border-[#2b2b2b] bg-[#181818] text-[#cccccc] [color-scheme:dark] font-[system-ui] [--dock-gap:1px]',
    group: (group, content) => (
      <section
        {...group.props}
        class={cn('flex flex-col bg-[#1f1f1f]', group.dragging() && 'opacity-60')}
        onPointerDown={() => setFocused(group.id)}
      >
        <div class="flex h-[35px] shrink-0 bg-[#181818] shadow-[inset_0_-1px_0_#2b2b2b]">
          <div
            ref={group.tabListRef}
            role="tablist"
            class="flex min-w-0 flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
          >
            <For each={group.panels()}>
              {(panelId) => (
                <Dock.Tab id={panelId}>
                  {(tab) => <VsCodeFlatTab tab={tab} focused={focused() === group.id} />}
                </Dock.Tab>
              )}
            </For>
          </div>
          <GroupHandle group={group} class="w-8 text-[#868686] hover:bg-[#2b2b2b] hover:text-white" />
        </div>
        {content}
      </section>
    ),
    sash: (sash) => (
      <div
        {...sash.props}
        class={cn(
          "bg-[#2b2b2b] transition-colors delay-150 outline-none before:absolute before:content-[''] hover:bg-[#0078d4] focus-visible:bg-[#0078d4]",
          sash.dragging() && 'bg-[#0078d4] delay-0',
          sash.direction() === 'row'
            ? 'cursor-col-resize before:-inset-x-1 before:inset-y-0'
            : 'cursor-row-resize before:inset-x-0 before:-inset-y-1'
        )}
      />
    ),
    panel: 'bg-[#1f1f1f]',
    indicator: 'bg-[#53595d80]',
    dragLabel: 'border border-[#2b2b2b] bg-[#252526] px-2 py-1 text-[13px] text-white shadow-lg'
  };
}

function VsCodeFlatTab(props: { tab: DockTabApi; focused: boolean }): JSX.Element {
  return (
    <div
      {...props.tab.props}
      class={cn(
        'group/tab relative flex h-full shrink-0 cursor-pointer items-center gap-1 border-r border-[#2b2b2b] pr-1 pl-1.5 text-[13px] whitespace-nowrap select-none',
        props.tab.active()
          ? cn('bg-[#1f1f1f]', props.focused ? 'text-white' : 'text-[#cccccc]')
          : 'bg-[#181818] text-[#9d9d9d] hover:bg-[#1f1f1f]/60',
        props.tab.dragging() && 'opacity-50'
      )}
    >
      <Show when={props.tab.active()}>
        <span class={cn('absolute inset-x-0 top-0 h-px', props.focused ? 'bg-[#0078d4]' : 'bg-[#5a5a5a]')} />
      </Show>
      {props.tab.title()}
      <Show when={props.tab.closable()}>
        <span
          {...props.tab.closeProps}
          role="button"
          class={cn(
            'ml-1 grid h-5 w-5 place-items-center rounded hover:bg-white/10',
            props.tab.active() ? 'visible' : 'invisible group-hover/tab:visible'
          )}
        >
          <CloseIcon class="h-3.5 w-3.5" />
        </span>
      </Show>
    </div>
  );
}

// MARK: dockview

/** dockview's abyss theme: navy groups, a tab bar with dividers and group actions. */
function createDockviewTheme(layout: DemoLayout): DemoDockTheme {
  return {
    root: 'rounded-[6px] border border-[#2b2b4a] bg-[#000c18] text-[#cccccc] [color-scheme:dark] font-[system-ui] [--dock-gap:1px]',
    group: (group, content) => (
      <section {...group.props} class={cn('flex flex-col bg-[#000c18]', group.dragging() && 'opacity-60')}>
        <div class="flex h-[35px] shrink-0 bg-[#1c1c2a]">
          <div
            ref={group.tabListRef}
            role="tablist"
            class="flex min-w-0 flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
          >
            <For each={group.panels()}>
              {(panelId) => <Dock.Tab id={panelId}>{(tab) => <DockviewTab tab={tab} />}</Dock.Tab>}
            </For>
          </div>
          <DockviewGroupActions group={group} layout={layout} />
        </div>
        {content}
      </section>
    ),
    sash: (sash) => (
      <div
        {...sash.props}
        class={cn(
          "bg-[#2b2b4a] outline-none before:absolute before:content-[''] hover:bg-[#2b79a2] focus-visible:bg-[#2b79a2]",
          sash.dragging() && 'bg-[#2b79a2]',
          sash.direction() === 'row'
            ? 'cursor-col-resize before:-inset-x-1 before:inset-y-0'
            : 'cursor-row-resize before:inset-x-0 before:-inset-y-1'
        )}
      />
    ),
    panel: 'bg-[#000c18]',
    indicator: 'bg-[rgba(83,89,93,0.5)]',
    dragLabel: 'border border-[#2b2b4a] bg-[#000c18] px-2 py-1 text-[13px] text-white shadow-lg'
  };
}

function DockviewTab(props: { tab: DockTabApi }): JSX.Element {
  return (
    <div
      {...props.tab.props}
      class={cn(
        'group/tab flex h-full min-w-[75px] shrink-0 cursor-pointer items-center justify-between gap-2 border-r border-[#2b2b4a] px-2 text-[13px] whitespace-nowrap select-none',
        props.tab.active() ? 'bg-[#000c18] text-white' : 'bg-[#10192c] text-white/50 hover:text-white/80',
        props.tab.dragging() && 'opacity-50'
      )}
    >
      <span class="flex items-center gap-1.5">{props.tab.title()}</span>
      <Show when={props.tab.closable()}>
        <span
          {...props.tab.closeProps}
          role="button"
          class={cn(
            'grid h-4 w-4 place-items-center rounded-[3px] hover:bg-white/10',
            props.tab.active() ? 'visible' : 'invisible group-hover/tab:visible'
          )}
        >
          <CloseIcon />
        </span>
      </Show>
    </div>
  );
}

/** Header actions: reopen a closed panel into this group, and drag the group. */
function DockviewGroupActions(props: { group: DockGroupApi; layout: DemoLayout }): JSX.Element {
  const reopenHere = () => {
    const [panelId] = props.layout.closed();
    if (panelId !== undefined) {
      props.layout.setState((draft) =>
        openPanel(draft, panelId, { type: 'group', groupId: props.group.id, zone: 'center' })
      );
    }
  };

  return (
    <div class="flex shrink-0 items-center gap-0.5 px-1 text-white/50">
      <Show when={props.layout.closed().length > 0}>
        <button
          type="button"
          title={`Reopen ${props.layout.closed()[0]} here`}
          class="grid h-6 w-6 place-items-center rounded-[3px] text-base leading-none hover:!bg-white/10 hover:text-white"
          onClick={reopenHere}
        >
          +
        </button>
      </Show>
      <GroupHandle group={props.group} class="h-6 w-6 rounded-[3px] hover:!bg-white/10 hover:text-white" />
    </div>
  );
}
