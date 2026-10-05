import { createToken, resolveTokens } from '@solid-primitives/jsx-tokenizer';
import { type ComponentProps, type JSX, Portal } from '@solidjs/web';
import {
  type Accessor,
  createMemo,
  createSignal,
  For,
  omit,
  onCleanup,
  Show,
  type Store,
  type StoreSetter,
  untrack
} from 'solid-js';
import {
  createDock,
  DOCK_OVERLAY_Z_INDEX,
  type DockController,
  type DockDragSession,
  type DockDropPolicy,
  type DockDropPreview,
  type DockDropTargetResolver,
  type DockPanelDefinition,
  DockProvider,
  type DockTransition,
  useDock
} from './createDock';
import { DOCK_FLIP_ATTRIBUTE } from './flip';
import type { DockRect } from './geometry';
import { activePanelOf, type DockNodeId, type DockState, listGroups, type PanelId, resizeWeights } from './state';

/**
 * Hosts one dock: owns the controller, renders a positioned `<div>` with the
 * invisible layout layer inside, and provides context to every `Dock.*` part.
 *
 * The layout layer fills the root's content box, so the root needs a definite
 * size; its padding frames the layout. Splits leave `--dock-gap` (default `0px`)
 * between children, where `<Dock.Sashes>` places the sashes.
 *
 * `panels` takes `<Dock.Panel>` declarations; `children` take the visible layer:
 * `<Dock.Windows>`, `<Dock.Panels>`, `<Dock.Sashes>` and indicators. Remaining
 * props go to the `<div>`, merged with `position: relative` and
 * `isolation: isolate`. Drag options are reactive and may change between drags.
 */
export function DockRoot(
  props: {
    state: Store<DockState>;
    setState: StoreSetter<DockState>;
    panels: JSX.Element;
    /** Smallest pane a sash may produce, in pixels. @default 48 */
    minPaneSize?: number;
    /** Decides where a drag drops. @default findDropTarget */
    resolveDropTarget?: DockDropTargetResolver;
    /** Rearranges the layout while a tab is dragged instead of on release. @default false */
    liveMove?: boolean;
    /** Takes a dragged panel out of the layout until it is dropped. Ignored with `liveMove`. @default false */
    detachOnDrag?: boolean;
    /** Wraps layout changes made by drags, e.g. `flipTransition` to animate them. */
    transition?: DockTransition;
    /** Extra drop rules; see {@link DockDropPolicy}. */
    acceptDrop?: DockDropPolicy;
  } & ComponentProps<'div'>
): JSX.Element {
  const [root, setRoot] = createSignal<HTMLDivElement>();
  const tokens = resolveTokens(DockPanel, () => props.panels);
  const dock = createDock({
    state: () => props.state,
    setState: (operation) => props.setState(operation),
    panels: createMemo(() => tokens().map((token) => token.data)),
    root,
    minPaneSize: () => props.minPaneSize ?? 48,
    resolveDropTarget: () => props.resolveDropTarget,
    liveMove: () => props.liveMove ?? false,
    detachOnDrag: () => props.detachOnDrag ?? false,
    transition: () => props.transition,
    acceptDrop: () => props.acceptDrop
  });
  const others = omit(
    props,
    'state',
    'setState',
    'panels',
    'minPaneSize',
    'resolveDropTarget',
    'liveMove',
    'detachOnDrag',
    'transition',
    'acceptDrop',
    'children',
    'ref',
    'style'
  );

  return (
    <DockProvider value={dock}>
      <div {...others} ref={[setRoot, props.ref]} style={withRootPosition(props.style)}>
        <DockLayout />
        {props.children}
      </div>
    </DockProvider>
  );
}

/**
 * Prepends `position: relative` and `isolation: isolate`, which keeps the
 * layers' z-indices inside the dock; the caller's style may override both.
 */
function withRootPosition(style: ComponentProps<'div'>['style']): JSX.CSSProperties | string {
  if (typeof style === 'string') {
    return `position: relative; isolation: isolate; ${style}`;
  }

  return { position: 'relative', isolation: 'isolate', ...(style || {}) };
}

/** Props of {@link DockPanel}; the same object is exposed as {@link DockPanelDefinition}. */
export type DockPanelProps = DockPanelDefinition;

/**
 * Declares a panel for `<Dock.Root panels>`. Renders nothing in place: the root
 * reads its props, and `<Dock.Panels>` mounts `children` once while the panel is
 * open in the layout, wherever it moves.
 */
export const DockPanel = createToken<DockPanelProps>();

/**
 * Invisible layout layer: one flex box per node, sized by the split weights and
 * the panels' limits. The browser lays it out; windows, panels and sashes are
 * placed over its measured boxes, so the visible layer can animate freely.
 */
function DockLayout(): JSX.Element {
  const dock = useDock();

  return (
    <div aria-hidden="true" style={LAYOUT_STYLE}>
      <Show when={dock.state.root} keyed>
        {(rootId) => <DockLayoutBox id={rootId} style={() => ROOT_BOX_STYLE} />}
      </Show>
    </div>
  );
}

const LAYOUT_STYLE: JSX.CSSProperties = {
  display: 'flex',
  width: '100%',
  height: '100%',
  visibility: 'hidden',
  'pointer-events': 'none'
};

const ROOT_BOX_STYLE: JSX.CSSProperties = { flex: '1 1 0px', 'min-width': '0', 'min-height': '0' };

/** Box of one node in the layout layer; a split also lays out its children. `id` is read once. */
function DockLayoutBox(props: { id: DockNodeId; style: () => JSX.CSSProperties }): JSX.Element {
  const dock = useDock();
  const id = untrack(() => props.id);
  const split = () => {
    const node = dock.state.nodes[id];
    return node?.type === 'split' ? node : undefined;
  };
  const register = dock.slots.boxes.ref(id);
  let element: HTMLElement | undefined;

  onCleanup(() => dock.slots.boxes.release(id, element));

  return (
    <div
      ref={(target) => {
        element = target;
        register(target);
      }}
      style={{
        display: 'flex',
        'flex-direction': split()?.direction === 'column' ? 'column' : 'row',
        gap: 'var(--dock-gap, 0px)',
        ...props.style()
      }}
    >
      <For each={split()?.children ?? []}>
        {(child, index) => <DockLayoutBox id={child} style={() => childStyle(dock, id, index())} />}
      </For>
    </div>
  );
}

/**
 * Flex shorthand that sizes child `index` of a split by its share of the
 * weights and lets it shrink below its content, plus the child's size limits
 * along the split. Grow factors are scaled to sum to the child count: flex
 * leaves free space unused when they sum below 1.
 */
function childStyle(dock: DockController, splitId: DockNodeId, index: number): JSX.CSSProperties {
  const node = dock.state.nodes[splitId];
  if (node?.type !== 'split') {
    return {};
  }

  const size = (childIndex: number) => node.sizes[childIndex] ?? 1;
  const count = node.children.length;
  const total = node.children.reduce((sum, _, childIndex) => sum + size(childIndex), 0) || count;
  const grow = (size(index) / total) * count;
  const row = node.direction === 'row';
  const limits = dock.limits(node.children[index], row ? 'width' : 'height');
  const min = limits.min > 0 ? `${limits.min}px` : '0';
  const max = Number.isFinite(limits.max) ? `${limits.max}px` : undefined;
  return {
    flex: `${grow} ${grow} 0px`,
    'min-width': row ? min : '0',
    'min-height': row ? '0' : min,
    'max-width': row ? max : undefined,
    'max-height': row ? undefined : max
  };
}

/**
 * Visible layer of groups: renders `children` once per group, keyed by id. Spread
 * `group.props` on the window element, which places it on the group's box.
 */
export function DockWindows(props: { children: (group: DockGroupApi) => JSX.Element }): JSX.Element {
  const dock = useDock();
  const groups = createMemo(() => listGroups(dock.state));

  return <For each={groups()}>{(groupId) => props.children(createDockGroup(groupId))}</For>;
}

/** Group view model passed to `<Dock.Windows>` children. */
export type DockGroupApi = ReturnType<typeof createDockGroup>;

/**
 * Reactive view of a group's window.
 *
 * Spread `props` on the window element: it positions the window on the group's
 * box and lets the dock measure it. Attach `contentRef` to the empty element
 * where the active panel should appear (panels follow its rectangle),
 * `tabListRef` to the tab strip (drops there insert at a position), and spread
 * `handleProps` on an element that drags the whole group.
 */
export function createDockGroup(groupId: DockNodeId) {
  const dock = useDock();
  const node = () => {
    const candidate = dock.state.nodes[groupId];
    return candidate?.type === 'group' ? candidate : undefined;
  };
  // A group with an undraggable panel stays where it is.
  const handle = dock.drag.createSensor(() =>
    node()?.panels.every(dock.isDraggable) ? { type: 'group', groupId } : undefined
  );
  const registerWindow = dock.slots.windows.ref(groupId);
  const registerContent = dock.slots.contents.ref(groupId);
  const registerTabList = dock.slots.tabLists.ref(groupId);
  const rect = () => dock.slots.frames[groupId];
  let window: HTMLElement | undefined;
  let content: HTMLElement | undefined;
  let tabList: HTMLElement | undefined;

  onCleanup(() => {
    dock.slots.windows.release(groupId, window);
    dock.slots.contents.release(groupId, content);
    dock.slots.tabLists.release(groupId, tabList);
  });

  return {
    id: groupId,
    panels: () => node()?.panels ?? [],
    /** Visible panel id. */
    active: () => {
      const current = node();
      return current && activePanelOf(current);
    },
    /** The group's box relative to the root, once measured. */
    rect,
    /** Drop target over this group during a drag. */
    dropTarget: () => {
      const target = dock.drag.preview()?.target;
      return target?.type === 'group' && target.groupId === groupId ? target : undefined;
    },
    /** Whether this group is being dragged by its handle. */
    dragging: () => {
      const subject = dock.drag.session()?.subject;
      return subject?.type === 'group' && subject.groupId === groupId;
    },
    props: {
      ref: (element: HTMLElement) => {
        window = element;
        registerWindow(element);
      },
      get style(): JSX.CSSProperties {
        const box = rect();
        return {
          ...rectStyle(box ?? EMPTY_RECT),
          visibility: box ? undefined : 'hidden',
          'z-index': dock.layers.window(groupId)
        };
      },
      [DOCK_FLIP_ATTRIBUTE]: `group:${groupId}`
    } satisfies JSX.HTMLAttributes<HTMLElement> & Record<typeof DOCK_FLIP_ATTRIBUTE, string>,
    contentRef: (element: HTMLElement) => {
      content = element;
      registerContent(element);
    },
    tabListRef: (element: HTMLElement) => {
      tabList = element;
      registerTabList(element);
    },
    handleProps: {
      onPointerDown: handle.onPointerDown,
      style: { 'touch-action': 'none' }
    } satisfies JSX.HTMLAttributes<HTMLElement>
  };
}

const EMPTY_RECT: DockRect = { x: 0, y: 0, width: 0, height: 0 };

/** Tab view model passed to `<Dock.Tab>` children. */
export type DockTabApi = ReturnType<typeof createDockTab>;

/**
 * Behaviour of one tab: click, Enter or Space activates; dragging past 6 px moves
 * the panel. Spread `props` on the tab element (any element: it carries `role`
 * and a roving `tabindex`) and `closeProps` on its close button.
 */
export function createDockTab(panelId: PanelId) {
  const dock = useDock();
  const groupId = () => dock.panelGroup(panelId);
  const active = () => {
    const id = groupId();
    const node = id === undefined ? undefined : dock.state.nodes[id];
    return node?.type === 'group' && activePanelOf(node) === panelId;
  };
  const activate = () => dock.activate(panelId);
  const close = () => dock.close(panelId);
  const sensor = dock.drag.createSensor(() => {
    const id = groupId();
    return id === undefined || !dock.isDraggable(panelId) ? undefined : { type: 'panel', panelId, groupId: id };
  }, activate);
  const registerTab = dock.slots.tabs.ref(panelId);
  let element: HTMLElement | undefined;

  onCleanup(() => dock.slots.tabs.release(panelId, element));

  return {
    id: panelId,
    /** Declared title, or the id when the panel declares none. */
    title: (): JSX.Element => dock.panel(panelId)?.title ?? panelId,
    closable: () => dock.panel(panelId)?.closable ?? false,
    active,
    /** Whether this tab is being dragged. */
    dragging: () => {
      const subject = dock.drag.session()?.subject;
      return subject?.type === 'panel' && subject.panelId === panelId;
    },
    activate,
    close,
    props: {
      ref: (target: HTMLElement) => {
        element = target;
        registerTab(target);
      },
      role: 'tab',
      get 'aria-selected'() {
        return active() ? ('true' as const) : ('false' as const);
      },
      get tabindex() {
        return active() ? 0 : -1;
      },
      onPointerDown: sensor.onPointerDown,
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      },
      [DOCK_FLIP_ATTRIBUTE]: `tab:${panelId}`,
      style: { 'touch-action': 'none' }
    } satisfies JSX.HTMLAttributes<HTMLElement> & Record<typeof DOCK_FLIP_ATTRIBUTE, string>,
    /** Keeps the press from starting a tab drag and closes on click. */
    closeProps: {
      'aria-label': 'Close',
      onPointerDown: (event: PointerEvent) => event.stopPropagation(),
      onClick: (event: MouseEvent) => {
        event.stopPropagation();
        close();
      }
    } satisfies JSX.HTMLAttributes<HTMLElement>
  };
}

/** Render-prop form of {@link createDockTab}. `id` is read once. */
export function DockTab(props: { id: PanelId; children: (tab: DockTabApi) => JSX.Element }): JSX.Element {
  return props.children(createDockTab(untrack(() => props.id)));
}

/**
 * Visible layer of sashes: renders `children` once for every gap between split
 * children. Spread `sash.props` on the divider; it covers the gap, whose size is
 * `--dock-gap`. Draw a wider hit area with a pseudo-element if the gap is thin.
 */
export function DockSashes(props: { children: (sash: DockSashApi) => JSX.Element }): JSX.Element {
  const dock = useDock();
  // Keyed by the child before the gap: every node has one parent, so the key is unique.
  const sashes = createMemo(() =>
    Object.entries(dock.state.nodes).flatMap(([splitId, node]) =>
      node.type === 'split' ? node.children.slice(0, -1).map((before) => ({ splitId, before })) : []
    )
  );

  return (
    <For each={sashes()} keyed={(sash) => sash.before}>
      {(sash) => props.children(createDockSash(untrack(sash).splitId, untrack(sash).before))}
    </For>
  );
}

/** Sash view model passed to `<Dock.Sashes>` children. */
export type DockSashApi = ReturnType<typeof createDockSash>;

/**
 * Behaviour of the sash after child `before` of a split: pointer drags and
 * arrow keys (10 px, 50 px with Shift) move it. Only Escape restores the sizes
 * from the drag start; other cancellations keep the current sizes.
 */
export function createDockSash(splitId: DockNodeId, before: DockNodeId) {
  const dock = useDock();
  const split = () => {
    const node = dock.state.nodes[splitId];
    return node?.type === 'split' ? node : undefined;
  };
  const direction = () => split()?.direction ?? 'row';
  const index = () => split()?.children.indexOf(before) ?? -1;
  const along = (rect: DockRect | undefined) => (rect ? (direction() === 'row' ? rect.width : rect.height) : 0);
  let startSizes: number[] = [];
  let freeSpace = 0;

  const sensor = dock.drag.sensors.createSensor({
    threshold: 0,
    onDragStart: () => begin(),
    onDragMove: (event) => resizeBy(axis(event.delta)),
    onDragEnd: (event) => resizeBy(axis(event.delta)),
    // Only Escape undoes a resize; a lost pointer capture keeps the sizes reached so far.
    onDragCancel: (event) => {
      if (event.reason === 'escape') {
        dock.resize(splitId, startSizes);
      }
    }
  });

  /** Snapshots weights and the space they share: the children's boxes, without the gaps. */
  function begin(): void {
    const children = split()?.children ?? [];
    startSizes = children.map((_, childIndex) => split()?.sizes[childIndex] ?? 1);
    freeSpace = children.reduce((sum, child) => sum + along(dock.slots.frames[child]), 0);
  }

  function resizeBy(deltaPx: number): void {
    const children = split()?.children ?? [];
    const axis = direction() === 'row' ? 'width' : 'height';
    const limits = [dock.limits(children[index()], axis), dock.limits(children[index() + 1], axis)] as const;
    dock.resize(splitId, resizeWeights(startSizes, index(), deltaPx, freeSpace, dock.minPaneSize(), limits));
  }

  function axis(delta: { x: number; y: number }): number {
    return direction() === 'row' ? delta.x : delta.y;
  }

  function onKeyDown(event: KeyboardEvent): void {
    const step = event.shiftKey ? 50 : 10;
    const keys = direction() === 'row' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
    const key = keys.indexOf(event.key);
    if (key === -1) {
      return;
    }

    event.preventDefault();
    begin();
    resizeBy(key === 0 ? -step : step);
  }

  /** The gap between the boxes on either side of the sash, across the whole split. */
  const rect = (): DockRect | undefined => {
    const box = dock.slots.frames[splitId];
    const first = dock.slots.frames[before];
    const second = dock.slots.frames[split()?.children[index() + 1] ?? ''];
    if (!box || !first || !second) {
      return undefined;
    }

    return direction() === 'row'
      ? { x: first.x + first.width, y: box.y, width: second.x - first.x - first.width, height: box.height }
      : { x: box.x, y: first.y + first.height, width: box.width, height: second.y - first.y - first.height };
  };

  return {
    direction,
    dragging: sensor.isDragging,
    /** The gap the sash covers, relative to the root, once measured. */
    rect,
    props: {
      role: 'separator',
      tabindex: 0,
      get 'aria-orientation'() {
        return direction() === 'row' ? ('vertical' as const) : ('horizontal' as const);
      },
      onPointerDown: sensor.onPointerDown,
      onKeyDown,
      get style(): JSX.CSSProperties {
        const gap = rect();
        return {
          ...rectStyle(gap ?? EMPTY_RECT),
          visibility: gap ? undefined : 'hidden',
          'z-index': dock.layers.sash(),
          'touch-action': 'none'
        };
      }
    } satisfies JSX.HTMLAttributes<HTMLElement>
  };
}

/** Overlay entry passed to `<Dock.Panels>` children. */
export type DockPanelView = {
  id: PanelId;
  /** Panel children, created once per mount. Render it exactly once. */
  content: JSX.Element;
  /** Whether the panel is its group's active panel and its slot is measured. */
  visible: Accessor<boolean>;
  /** Slot rectangle relative to the root, while the panel is open. */
  rect: Accessor<DockRect | undefined>;
  /** Whether this panel's tab is being dragged. */
  dragging: Accessor<boolean>;
  /**
   * Absolute position over the slot, stacked right above the group's window.
   * Inactive panels stay mounted but get `visibility` and
   * `content-visibility: hidden`, which keeps their state.
   */
  style: Accessor<JSX.CSSProperties>;
};

/**
 * Visible layer of panels: mounts each open panel once, keyed by id, and
 * positions it over its group's content slot. Moving a panel between groups
 * changes only its position, so its DOM and state survive. Without children
 * each panel renders in a plain `<div>`.
 */
export function DockPanels(props: { children?: (panel: DockPanelView) => JSX.Element }): JSX.Element {
  const dock = useDock();
  const dragged = () => {
    const subject = dock.drag.session()?.subject;
    return subject?.type === 'panel' ? subject.panelId : undefined;
  };
  // A panel detached by a drag is in no group but stays mounted while it floats.
  const open = createMemo(() =>
    dock.panels().filter((panel) => dock.panelGroup(panel.id) !== undefined || panel.id === dragged())
  );

  return (
    <For each={open()} keyed={(panel) => panel.id}>
      {(panel) => {
        const view = createPanelView(untrack(panel));
        return props.children ? (
          props.children(view)
        ) : (
          <div style={view.style()} {...{ [DOCK_FLIP_ATTRIBUTE]: `panel:${view.id}` }}>
            {view.content}
          </div>
        );
      }}
    </For>
  );
}

function createPanelView(definition: DockPanelDefinition): DockPanelView {
  const dock = useDock();
  const id = definition.id;
  const rect = () => {
    const groupId = dock.panelGroup(id);
    return groupId === undefined ? undefined : dock.slots.rects[groupId];
  };
  const visible = () => {
    const groupId = dock.panelGroup(id);
    const node = groupId === undefined ? undefined : dock.state.nodes[groupId];
    return node?.type === 'group' && activePanelOf(node) === id && rect() !== undefined;
  };

  return {
    id,
    content: definition.children,
    visible,
    rect,
    dragging: () => {
      const subject = dock.drag.session()?.subject;
      return subject?.type === 'panel' && subject.panelId === id;
    },
    style: () => {
      const shown = visible();
      const groupId = dock.panelGroup(id);
      return {
        ...rectStyle(rect() ?? EMPTY_RECT),
        visibility: shown ? 'visible' : 'hidden',
        'content-visibility': shown ? 'visible' : 'hidden',
        'pointer-events': shown ? undefined : 'none',
        'z-index': groupId === undefined ? undefined : dock.layers.panel(groupId)
      };
    }
  };
}

/**
 * Shows where a drag would drop. Without children it renders a `<div>` with
 * `class` at the preview rectangle, at {@link DOCK_OVERLAY_Z_INDEX}.
 */
export function DockDropIndicator(props: {
  class?: string;
  children?: (preview: Accessor<DockDropPreview>) => JSX.Element;
}): JSX.Element {
  const dock = useDock();

  return (
    <Show when={dock.drag.preview()}>
      {(preview) =>
        props.children ? (
          props.children(preview)
        ) : (
          <div
            class={props.class}
            style={{ ...rectStyle(preview().rect), 'pointer-events': 'none', 'z-index': DOCK_OVERLAY_Z_INDEX }}
          />
        )
      }
    </Show>
  );
}

/**
 * Renders content that follows the pointer during a tab or group drag, in a
 * portal on `document.body`. Position it with `session().point` (client
 * coordinates), for example via {@link pointerStyle}.
 */
export function DockDragPreview(props: { children: (session: Accessor<DockDragSession>) => JSX.Element }): JSX.Element {
  const dock = useDock();

  return <Show when={dock.drag.session()}>{(session) => <Portal>{props.children(session)}</Portal>}</Show>;
}

/** Absolute-position style for a rectangle relative to the dock root. */
export function rectStyle(rect: DockRect): JSX.CSSProperties {
  return {
    position: 'absolute',
    left: '0',
    top: '0',
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    transform: `translate(${rect.x}px, ${rect.y}px)`
  };
}

/** Fixed-position style that places an element's top-left corner at the pointer plus `offset`. */
export function pointerStyle(session: DockDragSession, offset = { x: 12, y: 12 }): JSX.CSSProperties {
  return {
    position: 'fixed',
    left: '0',
    top: '0',
    transform: `translate(${session.point.x + offset.x}px, ${session.point.y + offset.y}px)`,
    'pointer-events': 'none'
  };
}

/** All dock parts under one namespace: `<Dock.Root>`, `<Dock.Panel>`, … */
export const Dock = {
  Root: DockRoot,
  Panel: DockPanel,
  Windows: DockWindows,
  Tab: DockTab,
  Panels: DockPanels,
  Sashes: DockSashes,
  DropIndicator: DockDropIndicator,
  DragPreview: DockDragPreview
};
