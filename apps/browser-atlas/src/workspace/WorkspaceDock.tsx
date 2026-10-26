import type { JSX } from '@solidjs/web';
import { Dock, type DockState, type PanelId, pointerStyle, useDock } from 'solid-dock';
import { For, onCleanup, Show, type StoreSetter } from 'solid-js';

/**
 * Browser Atlas dock: tabbed panel groups separated by draggable sashes. Drag a
 * tab to move its panel into another group or beside one; drag the grip of a
 * group with several tabs to move all of them. `panels` takes `<Dock.Panel>`
 * declarations with string titles; each open panel stays mounted wherever it moves.
 *
 * Tabs also open while a tree row is dragged over them with native drag and drop,
 * so rows can be dropped into explorers hidden behind another tab.
 */
export function WorkspaceDock(props: {
  state: DockState;
  setState: StoreSetter<DockState>;
  panels: JSX.Element;
  /** Closes a panel from its tab. */
  onClose: (panelId: PanelId) => void;
  /** Extra control before a tab's title, such as the primary-explorer star. */
  tabAccessory?: (panelId: PanelId) => JSX.Element;
  /** Shown in the dock when every panel is closed. */
  empty: JSX.Element;
  class?: string;
}): JSX.Element {
  return (
    <Dock.Root
      state={props.state}
      setState={props.setState}
      panels={props.panels}
      minPaneSize={MIN_PANE_SIZE}
      class={['overflow-hidden [--dock-gap:4px]', props.class]}
      data-browser-atlas-dock
    >
      <Dock.Windows>
        {(group) => (
          <section
            {...group.props}
            class={[
              'flex flex-col overflow-hidden border border-neutral-700 bg-neutral-950',
              { 'opacity-50': group.dragging() }
            ]}
            data-dock-group={group.id}
          >
            <div class="flex h-6 flex-none items-stretch border-b border-neutral-700 bg-neutral-900">
              <div
                ref={group.tabListRef}
                class="flex min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none]"
                role="tablist"
                aria-label="Panels"
              >
                <For each={group.panels()}>
                  {(panelId) => (
                    <WorkspaceTab panelId={panelId} accessory={props.tabAccessory} onClose={props.onClose} />
                  )}
                </For>
              </div>
              <Show when={group.panels().length > 1}>
                <div
                  {...group.handleProps}
                  class="flex w-5 flex-none cursor-grab items-center justify-center text-neutral-500 hover:text-neutral-200 active:cursor-grabbing"
                  role="button"
                  tabindex="-1"
                  aria-label="Move panel group"
                  title="Drag to move every panel of this group"
                >
                  ⠿
                </div>
              </Show>
            </div>
            <div ref={group.contentRef} class="flex min-h-0 flex-1 items-center justify-center">
              <Show when={group.panels().length === 0}>{props.empty}</Show>
            </div>
          </section>
        )}
      </Dock.Windows>
      <Dock.Sashes>
        {(sash) => (
          <div
            {...sash.props}
            class={[
              'outline-none hover:bg-sky-600/50 focus-visible:bg-sky-600/50',
              sash.direction() === 'row' ? 'cursor-col-resize' : 'cursor-row-resize',
              { 'bg-sky-500/70': sash.dragging() }
            ]}
            aria-label="Resize panels"
          />
        )}
      </Dock.Sashes>
      <Dock.Panels>
        {(panel) => (
          <div style={panel.style()} class="overflow-hidden" data-dock-panel={panel.id}>
            {panel.content}
          </div>
        )}
      </Dock.Panels>
      <Dock.DropIndicator class="rounded-sm bg-sky-500/15 ring-2 ring-sky-400 ring-inset" />
      <Dock.DragPreview>
        {(session) => (
          <div
            style={pointerStyle(session())}
            class="z-50 rounded border border-neutral-600 bg-neutral-900 px-2 py-1 text-xs text-neutral-100 shadow-lg"
          >
            <DragLabel subject={session().subject} />
          </div>
        )}
      </Dock.DragPreview>
    </Dock.Root>
  );
}

/** One tab: drag to move the panel, click to show it, × to close it. */
function WorkspaceTab(props: {
  panelId: PanelId;
  accessory: ((panelId: PanelId) => JSX.Element) | undefined;
  onClose: (panelId: PanelId) => void;
}): JSX.Element {
  let springTimer: ReturnType<typeof setTimeout> | undefined;
  const cancelSpring = () => {
    clearTimeout(springTimer);
    springTimer = undefined;
  };

  onCleanup(cancelSpring);

  return (
    <Dock.Tab id={props.panelId}>
      {(tab) => (
        <div
          {...tab.props}
          class={[
            'group/tab flex max-w-56 min-w-0 flex-none cursor-default items-center gap-1 border-r border-neutral-700 pr-0.5 pl-2 text-xs outline-none select-none focus-visible:bg-neutral-800',
            tab.active() ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100',
            { 'opacity-40': tab.dragging() }
          ]}
          aria-label={String(tab.title())}
          title={String(tab.title())}
          data-dock-tab={props.panelId}
          onDragEnter={() => {
            if (!tab.active() && springTimer === undefined) {
              springTimer = setTimeout(() => {
                springTimer = undefined;
                tab.activate();
              }, SPRING_LOADED_TAB_DELAY_MS);
            }
          }}
          onDragLeave={cancelSpring}
          onDrop={cancelSpring}
        >
          {props.accessory?.(props.panelId)}
          <span class="min-w-0 truncate">{tab.title()}</span>
          <button
            type="button"
            class="ml-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-sm text-neutral-500 hover:bg-neutral-700 hover:text-white"
            aria-label="Close panel"
            title={`Close ${String(tab.title())}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              props.onClose(props.panelId);
            }}
          >
            ×
          </button>
        </div>
      )}
    </Dock.Tab>
  );
}

/**
 * Star before an explorer's tab title: filled on the primary explorer, which
 * follows the focused browser window and shows windows revealed from the
 * extension button; hollow elsewhere, where a click makes that explorer primary.
 */
export function PrimaryExplorerButton(props: { primary: boolean; onSelect: () => void }): JSX.Element {
  return (
    <button
      type="button"
      class={[
        'flex h-4 w-4 flex-none items-center justify-center rounded-sm text-[0.7rem] leading-none hover:bg-neutral-700',
        props.primary ? 'text-amber-400' : 'text-neutral-600 hover:text-amber-300'
      ]}
      aria-label={props.primary ? 'Primary explorer' : 'Make primary explorer'}
      aria-pressed={props.primary ? 'true' : 'false'}
      title={
        props.primary
          ? 'Primary explorer: follows the focused browser window and shows windows revealed from the extension button'
          : 'Make this the primary explorer'
      }
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        props.onSelect();
      }}
    >
      {props.primary ? '★' : '☆'}
    </button>
  );
}

/** Title of the dragged panel, or a generic label for a dragged group. */
function DragLabel(props: { subject: { type: 'panel'; panelId: PanelId } | { type: 'group'; groupId: string } }) {
  const dock = useDock();
  const label = () => {
    const subject = props.subject;
    return subject.type === 'panel' ? (dock.panel(subject.panelId)?.title ?? subject.panelId) : 'Panel group';
  };

  return <>{label()}</>;
}

/**
 * Smallest group a sash may produce, in pixels. Panels declare no minimum of their
 * own, so a layout stored in a wide window still fits, scaled down, in a narrow one.
 */
const MIN_PANE_SIZE = 120;

/** Hover time after which a tab under a native drag opens. */
const SPRING_LOADED_TAB_DELAY_MS = 500;
