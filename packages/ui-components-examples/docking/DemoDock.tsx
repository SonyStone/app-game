import { cn } from '@app-game/utils/cn';
import type { JSX } from '@solidjs/web';
import {
  createDockState,
  Dock,
  DOCK_FLIP_ATTRIBUTE,
  type DockController,
  type DockDropPolicy,
  type DockDropTargetResolver,
  type DockGroupApi,
  type DockLayoutDescription,
  type DockPanelView,
  type DockSashApi,
  findPanelGroup,
  flipTransition,
  listGroups,
  openPanel,
  pointerStyle,
  useDock
} from 'solid-dock';
import { createStore, Show } from 'solid-js';

/**
 * Layout store for one demo plus the commands its card exposes.
 * `reset` restores `description`; `reopen` brings closed panels back.
 */
export function createDemoLayout(description: DockLayoutDescription) {
  const initial = createDockState(description);
  const panelIds = listGroups(initial).flatMap((id) => {
    const node = initial.nodes[id];
    return node.type === 'group' ? node.panels : [];
  });
  const [state, setState] = createStore(createDockState(description));

  return {
    state,
    setState,
    /** Declared panels missing from the layout. */
    closed: () => panelIds.filter((panelId) => findPanelGroup(state, panelId) === undefined),
    reopen: () =>
      setState((draft) => {
        panelIds
          .filter((panelId) => findPanelGroup(draft, panelId) === undefined)
          .forEach((id) => openPanel(draft, id));
      }),
    reset: () => setState(() => createDockState(description))
  };
}

/** Value returned by {@link createDemoLayout}. */
export type DemoLayout = ReturnType<typeof createDemoLayout>;

/**
 * Visual decisions of one demo. `solid-dock` supplies behaviour; a theme decides
 * every element around it.
 */
export type DemoDockTheme = {
  /**
   * Classes of the dock root; should set the text colour panels inherit and the
   * space between groups, `--dock-gap`, which sashes fill.
   */
  root: string;
  /**
   * Renders a group's window: spread `group.props` on its outer element and
   * place `content` (the measured slot panels appear over) where the active
   * panel should be.
   */
  group: (group: DockGroupApi, content: JSX.Element) => JSX.Element;
  /** Renders the divider in a gap between groups; spread `sash.props` on it. */
  sash: (sash: DockSashApi) => JSX.Element;
  /** Classes of the element around each panel, which sits over the content slot. */
  panel: string;
  /**
   * Classes of the scroll area inside the panel. The panel element clips to its
   * rounded corners; inset this area from them so scrollbars never cut a corner.
   * @default 'absolute inset-0 overflow-auto'
   */
  scroll?: string;
  /** Classes of the drop preview. */
  indicator: string;
  /** Classes of the label that follows the pointer while dragging. */
  dragLabel: string;
};

/**
 * Dock shell shared by the demos: windows, panels, sashes, drop preview and drag label.
 * Children are `<Dock.Panel>` declarations; the drag props tune how a drag
 * behaves (see the drag-behaviour demo).
 */
export function DemoDock(props: {
  layout: DemoLayout;
  theme: DemoDockTheme;
  class?: string;
  /** Inline style of the root, for example CSS variables a theme reads. */
  style?: JSX.CSSProperties;
  /** Forwarded to `<Dock.Root>`. */
  liveMove?: boolean;
  /** Forwarded to `<Dock.Root>`. */
  resolveDropTarget?: DockDropTargetResolver;
  /** Forwarded to `<Dock.Root>`. */
  detachOnDrag?: boolean;
  /** Forwarded to `<Dock.Root>`. */
  minPaneSize?: number;
  /** Forwarded to `<Dock.Root>`. */
  acceptDrop?: DockDropPolicy;
  /** Animates layout changes made by drags (FLIP on the live elements). */
  animate?: boolean;
  /** Animation length in milliseconds. @default 200 */
  animationDuration?: number;
  /** Hides the drop preview. */
  hideIndicator?: boolean;
  /** Hides the label that follows the pointer. */
  hideDragLabel?: boolean;
  /** Extra style for a panel's element, merged over its slot position. */
  panelStyle?: (panel: DockPanelView, dock: DockController) => JSX.CSSProperties | undefined;
  /** Rendered above everything else inside the root, with dock context. */
  overlay?: JSX.Element;
  children: JSX.Element;
}): JSX.Element {
  return (
    <Dock.Root
      state={props.layout.state}
      setState={props.layout.setState}
      panels={props.children}
      liveMove={props.liveMove}
      resolveDropTarget={props.resolveDropTarget}
      detachOnDrag={props.detachOnDrag}
      minPaneSize={props.minPaneSize}
      acceptDrop={props.acceptDrop}
      transition={props.animate ? flipTransition({ duration: props.animationDuration ?? 200 }) : undefined}
      class={cn('overflow-hidden', props.theme.root, props.class)}
      style={props.style}
    >
      {/* Keyed by theme: switching designs rebuilds windows and sashes while every panel stays mounted. */}
      <Show when={props.theme} keyed>
        {(theme) => (
          <>
            <Dock.Windows>
              {(group) =>
                theme.group(
                  group,
                  <div ref={group.contentRef} class="flex min-h-0 flex-1 items-center justify-center">
                    <Show when={group.panels().length === 0}>
                      <span class="text-xs opacity-50">Drop a tab here</span>
                    </Show>
                  </div>
                )
              }
            </Dock.Windows>
            <Dock.Sashes>{(sash) => theme.sash(sash)}</Dock.Sashes>
          </>
        )}
      </Show>
      <DemoPanels theme={props.theme} panelStyle={props.panelStyle} />
      <Show when={!props.hideIndicator}>
        <Dock.DropIndicator
          class={cn('transition-[transform,width,height] duration-100 ease-out', props.theme.indicator)}
        />
      </Show>
      {props.overlay}
      <Show when={!props.hideDragLabel}>
        <Dock.DragPreview>
          {(session) => (
            <div style={pointerStyle(session())} class={cn('z-50 flex items-center gap-1.5', props.theme.dragLabel)}>
              <DragLabel subject={session().subject} />
            </div>
          )}
        </Dock.DragPreview>
      </Show>
    </Dock.Root>
  );
}

function DemoPanels(props: {
  theme: DemoDockTheme;
  panelStyle?: (panel: DockPanelView, dock: DockController) => JSX.CSSProperties | undefined;
}): JSX.Element {
  const dock = useDock();

  return (
    <Dock.Panels>
      {(panel) => (
        <div
          {...{ [DOCK_FLIP_ATTRIBUTE]: `panel:${panel.id}` }}
          style={{
            ...panel.style(),
            ...props.panelStyle?.(panel, dock)
          }}
          class={cn('overflow-hidden', props.theme.panel)}
        >
          <div class={props.theme.scroll ?? 'absolute inset-0 overflow-auto'}>{panel.content}</div>
        </div>
      )}
    </Dock.Panels>
  );
}

function DragLabel(props: { subject: { type: 'panel'; panelId: string } | { type: 'group'; groupId: string } }) {
  const dock = useDock();

  return (
    <Show when={props.subject.type === 'panel' && props.subject} fallback={<>Move group</>}>
      {(subject) => dock.panel(subject().panelId)?.title ?? subject().panelId}
    </Show>
  );
}

/** Page section around a demo: heading, description, actions and the dock. */
export function DemoSection(props: {
  title: string;
  description: JSX.Element;
  actions?: JSX.Element;
  children: JSX.Element;
}): JSX.Element {
  return (
    <section class="flex flex-col gap-3">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div class="flex max-w-3xl flex-col gap-1">
          <h2 class="text-xl font-semibold text-neutral-900">{props.title}</h2>
          <p class="text-sm text-neutral-600">{props.description}</p>
        </div>
        <div class="flex flex-wrap gap-2">{props.actions}</div>
      </div>
      {props.children}
    </section>
  );
}

/**
 * Button for the light page chrome. `active` renders it pressed, for segmented
 * controls. Background utilities need `!`: the app resets `button` backgrounds
 * outside of any cascade layer.
 */
export function DemoButton(props: {
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: JSX.Element;
}): JSX.Element {
  return (
    <button
      type="button"
      disabled={props.disabled}
      aria-pressed={props.active === undefined ? undefined : props.active ? 'true' : 'false'}
      class={cn(
        'rounded-[8px] border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-default disabled:opacity-40',
        props.active
          ? 'border-neutral-900 !bg-neutral-900 text-white'
          : 'border-neutral-300 text-neutral-700 hover:!bg-neutral-100 disabled:hover:!bg-transparent'
      )}
      onClick={() => props.onClick()}
    >
      {props.children}
    </button>
  );
}

/** Grip that drags a whole group. */
export function GroupHandle(props: { group: DockGroupApi; class?: string }): JSX.Element {
  return (
    <div
      {...props.group.handleProps}
      role="button"
      tabindex="0"
      aria-label="Move group"
      title="Drag to move the whole group"
      class={cn('grid shrink-0 cursor-grab place-items-center active:cursor-grabbing', props.class)}
    >
      <svg viewBox="0 0 10 16" class="h-3.5 w-2.5" fill="currentColor" aria-hidden="true">
        <circle cx="2.5" cy="3" r="1.25" />
        <circle cx="7.5" cy="3" r="1.25" />
        <circle cx="2.5" cy="8" r="1.25" />
        <circle cx="7.5" cy="8" r="1.25" />
        <circle cx="2.5" cy="13" r="1.25" />
        <circle cx="7.5" cy="13" r="1.25" />
      </svg>
    </div>
  );
}

/** Multiplication-sign glyph for close buttons. */
export function CloseIcon(props: { class?: string }): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" class={cn('h-3 w-3', props.class)} fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke-width="1.5" stroke-linecap="round" />
    </svg>
  );
}
