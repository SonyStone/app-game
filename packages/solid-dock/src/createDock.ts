import { makeResizeObserver } from '@solid-primitives/resize-observer';
import type { JSX } from '@solidjs/web';
import { createDragSensorFactory, type DragSensorHandle } from 'solid-dnd';
import {
  type Accessor,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  createStore,
  deep,
  reconcile,
  snapshot,
  type Store,
  type StoreSetter,
  useContext
} from 'solid-js';
import {
  type DockDragSubject,
  type DockGroupGeometry,
  type DockPoint,
  type DockRect,
  dropPreviewRect,
  findDropTarget,
  sameDropTarget
} from './geometry';
import {
  activatePanel,
  closePanel,
  type DockDropTarget,
  type DockEdge,
  type DockMoveSubject,
  type DockNodeId,
  type DockSizeLimits,
  type DockState,
  findPanelGroup,
  listGroups,
  moveGroup,
  movePanel,
  nodeLimits,
  openPanel,
  type PanelId,
  resizeSplit,
  sameMoveResult,
  wouldChangeLayout
} from './state';

/** Panel declared with `<Dock.Panel>`; `children` is read once, when the panel mounts. */
export type DockPanelDefinition = {
  id: PanelId;
  /** Tab label. Defaults to the id in the bundled examples. */
  title?: JSX.Element;
  /** Whether the UI should offer a close action. */
  closable?: boolean;
  /** Smallest and largest size of the panel's group, in pixels. Sashes and flex layout respect them. */
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  /** Keeps the panel alone in its group: nothing merges into it and it merges into nothing. */
  standalone?: boolean;
  /** Whether the panel's tab can be dragged. @default true */
  draggable?: boolean;
  children?: JSX.Element;
};

/**
 * Decides whether a drop is allowed, on top of the built-in rules (no-op drops
 * and standalone panels). Return `false` to hide and refuse it, for example to
 * keep a console on the bottom edge or to forbid merging panels into tabs.
 */
export type DockDropPolicy = (drop: { subject: DockMoveSubject; target: DockDropTarget; state: DockState }) => boolean;

/** Inputs of {@link createDock}. Accessors are read reactively. */
export type CreateDockOptions = {
  state: Accessor<Store<DockState>>;
  setState: StoreSetter<DockState>;
  panels: Accessor<readonly DockPanelDefinition[]>;
  /** Positioned root element that every layer is placed in. */
  root: Accessor<HTMLElement | undefined>;
  /** Smallest pane size a sash may produce, in pixels. */
  minPaneSize: Accessor<number>;
  /** Drop-target resolver; `undefined` selects {@link findDropTarget}. */
  resolveDropTarget: Accessor<DockDropTargetResolver | undefined>;
  /** Whether panel drags rearrange the layout while the pointer moves (see {@link createDockDrag}). */
  liveMove: Accessor<boolean>;
  /** Whether a dragged panel leaves the layout until it is dropped (see {@link createDockDrag}). */
  detachOnDrag: Accessor<boolean>;
  /** Wraps every layout change a drag makes, for example in {@link flipTransition}. */
  transition: Accessor<DockTransition | undefined>;
  /** Extra drop rules; `undefined` allows every drop the built-in rules allow. */
  acceptDrop: Accessor<DockDropPolicy | undefined>;
};

/**
 * Runs `apply`, which writes the new layout, to animate the change. `root` is the
 * dock root. Implementations must call `apply` exactly once, synchronously, and
 * may return a promise that settles when the animation ends: until then the
 * dragged window stays above the others (see {@link DockController.layers}).
 */
export type DockTransition = (apply: () => void, root: HTMLElement | undefined) => Promise<unknown> | void;

/** Signature shared by {@link findDropTarget} and custom resolvers such as {@link findGuideDropTarget}. */
export type DockDropTargetResolver = typeof findDropTarget;

/** Controller shared by every part of one dock through {@link useDock}. */
export type DockController = ReturnType<typeof createDock>;

/**
 * Creates the controller behind `<Dock.Root>`: lookups, layout commands, slot
 * measurement and the drag session. Must run under an owner; everything it
 * creates is released with that owner.
 */
export function createDock(options: CreateDockOptions) {
  const state = () => options.state();
  const update = (operation: (draft: DockState) => void) => options.setState((draft) => operation(draft));

  const panelsById = createMemo(() => new Map(options.panels().map((panel) => [panel.id, panel])));
  const panelGroups = createMemo(() => {
    const groups = new Map<PanelId, DockNodeId>();
    for (const [id, node] of Object.entries(state().nodes)) {
      if (node.type === 'group') {
        node.panels.forEach((panelId) => groups.has(panelId) || groups.set(panelId, id));
      }
    }
    return groups;
  });

  const panelLimits = (panelId: PanelId, axis: 'width' | 'height'): DockSizeLimits => {
    const panel = panelsById().get(panelId);
    return axis === 'width'
      ? { min: panel?.minWidth ?? 0, max: panel?.maxWidth ?? Infinity }
      : { min: panel?.minHeight ?? 0, max: panel?.maxHeight ?? Infinity };
  };

  /** Built-in standalone rule plus the caller's {@link DockDropPolicy}. */
  const permits = (subject: DockDragSubject, target: DockDropTarget): boolean => {
    const current = state();
    const isStandalone = (panelId: PanelId) => panelsById().get(panelId)?.standalone === true;
    const groupPanels = (groupId: DockNodeId) => {
      const node = current.nodes[groupId];
      return node?.type === 'group' ? node.panels : [];
    };

    if (target.type === 'group' && target.zone === 'center') {
      const moving = subject.type === 'panel' ? [subject.panelId] : groupPanels(subject.groupId);
      const staying = groupPanels(target.groupId).filter((panelId) => !moving.includes(panelId));
      if (staying.length > 0 && [...moving, ...staying].some(isStandalone)) {
        return false;
      }
    }

    const policy = options.acceptDrop();
    const move = subject.type === 'panel' ? { type: 'panel' as const, panelId: subject.panelId } : subject;
    return !policy || policy({ subject: move, target, state: snapshot(current) });
  };

  const slots = createDockSlots(options.root, state);
  const [lifted, setLifted] = createSignal<DockDragSubject>();
  const groupOrder = createMemo(() => listGroups(state()));
  const liftedGroup = () => {
    const subject = lifted();
    return subject?.type === 'panel' ? panelGroups().get(subject.panelId) : subject?.groupId;
  };
  /**
   * Stacking order of the visible layer: each window with its panels right above
   * it, in layout order, sashes above every window, and the window a drag just
   * moved above everything until its animation ends, so windows that cross
   * while animating never pass through it.
   */
  const layers = {
    window: (groupId: DockNodeId): number => {
      const count = groupOrder().length;
      return liftedGroup() === groupId ? 2 * count + 2 : 2 * groupOrder().indexOf(groupId) + 1;
    },
    panel: (groupId: DockNodeId): number => layers.window(groupId) + 1,
    sash: (): number => 2 * groupOrder().length + 1
  };
  const drag = createDockDrag({
    state,
    root: options.root,
    slots,
    resolveDropTarget: () => options.resolveDropTarget() ?? findDropTarget,
    liveMove: options.liveMove,
    detachOnDrag: options.detachOnDrag,
    permits,
    onDrop: (subject, target) =>
      transition(
        () =>
          update((draft) =>
            subject.type === 'panel'
              ? movePanel(draft, subject.panelId, target)
              : moveGroup(draft, subject.groupId, target)
          ),
        subject
      ),
    onReplace: (next, subject) => transition(() => options.setState(reconcile(next, null)), subject)
  });

  let lastTransition: object | undefined;

  /** Applies a drag's layout change through the caller's transition, lifting `moving` while it runs. */
  function transition(apply: () => void, moving?: DockDragSubject): void {
    const wrap = options.transition();
    if (!wrap) {
      apply();
      return;
    }

    const token = {};
    lastTransition = token;
    setLifted(moving);
    void Promise.resolve(wrap(apply, options.root())).finally(() => {
      if (lastTransition === token) {
        setLifted(undefined);
      }
    });
  }

  return {
    /** Current layout store. */
    get state() {
      return state();
    },
    panels: options.panels,
    /** Definition of a declared panel. */
    panel: (panelId: PanelId) => panelsById().get(panelId),
    /** Group that shows a panel, or `undefined` when it is closed. */
    panelGroup: (panelId: PanelId) => panelGroups().get(panelId),
    minPaneSize: options.minPaneSize,
    /** Size range of a node along `axis`, from its panels' `min*`/`max*` limits. */
    limits: (nodeId: DockNodeId, axis: 'width' | 'height'): DockSizeLimits =>
      nodeLimits(state(), nodeId, axis, (panelId) => panelLimits(panelId, axis)),
    /** Whether a panel's tab may be dragged. */
    isDraggable: (panelId: PanelId): boolean => panelsById().get(panelId)?.draggable !== false,
    /** z-index of windows, panels and sashes; all stay below {@link DOCK_OVERLAY_Z_INDEX}. */
    layers,
    /** Root element every layer is positioned in. */
    root: options.root,
    /** Converts a client-space point (such as `drag.session().point`) to root space. */
    toRootPoint: (point: DockPoint): DockPoint | undefined => {
      const root = options.root();
      return root ? toRootSpace({ ...point, width: 0, height: 0 }, root) : undefined;
    },
    /** Runs a draft operation from `state.ts` (or your own) against the store. */
    update,
    activate: (panelId: PanelId) => update((draft) => activatePanel(draft, panelId)),
    close: (panelId: PanelId) => update((draft) => closePanel(draft, panelId)),
    open: (panelId: PanelId, target?: DockDropTarget) => update((draft) => openPanel(draft, panelId, target)),
    movePanel: (panelId: PanelId, target: DockDropTarget) => update((draft) => movePanel(draft, panelId, target)),
    moveGroup: (groupId: DockNodeId, target: DockDropTarget) => update((draft) => moveGroup(draft, groupId, target)),
    resize: (splitId: DockNodeId, sizes: readonly number[]) => update((draft) => resizeSplit(draft, splitId, sizes)),
    slots,
    drag
  };
}

const DockContext = createContext<DockController>(undefined, { name: 'Dock' });

/** Provides a {@link DockController} to `Dock.*` parts and `createDock*` primitives. */
export const DockProvider = DockContext;

/** Returns the controller of the enclosing `<Dock.Root>`. Throws outside of one. */
export function useDock(): DockController {
  return useContext(DockContext);
}

/**
 * z-index at and above which overlays such as drop indicators, guides and
 * floating windows paint over every window, panel and sash.
 */
export const DOCK_OVERLAY_Z_INDEX = 1000;

/** Distances from a window's edges to its content slot. */
type DockInsets = { top: number; right: number; bottom: number; left: number };

const NO_INSETS: DockInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Measures the two layers. The invisible layout layer gives every node its box
 * (`frames`); a group's window sits on its frame, and its panels sit on the
 * content slot, which is the frame minus the slot's insets inside the window.
 *
 * Frames come from elements that never animate, and insets are differences
 * between two boxes of the same window, so neither changes while windows
 * animate. Without a window or a content slot, panels fill the whole frame.
 * Measures when an observed element resizes and after every layout change,
 * which covers boxes that move without resizing.
 */
function createDockSlots(root: Accessor<HTMLElement | undefined>, state: Accessor<DockState>) {
  const boxes = new Map<DockNodeId, HTMLElement>();
  const windows = new Map<DockNodeId, HTMLElement>();
  const contents = new Map<DockNodeId, HTMLElement>();
  const tabLists = new Map<DockNodeId, HTMLElement>();
  const tabs = new Map<PanelId, HTMLElement>();
  const [frames, setFrames] = createStore<Record<DockNodeId, DockRect>>({});
  const [rects, setRects] = createStore<Record<DockNodeId, DockRect>>({});

  // One measurement per observer batch; per-entry callbacks would re-measure every slot for each entry.
  const observer = makeResizeObserver(measure);

  createEffect(root, (element) => {
    if (!element) {
      return;
    }

    observer.observe(element);
    return () => observer.unobserve(element);
  });
  createEffect(() => deep(state()), measure);

  function measure(): void {
    const rootElement = root();
    if (!rootElement) {
      return;
    }

    const nextFrames = new Map(
      [...boxes].map(([id, element]) => [id, toRootSpace(element.getBoundingClientRect(), rootElement)])
    );
    const nodes = state().nodes;
    const nextRects = new Map(
      [...nextFrames]
        .filter(([id]) => nodes[id]?.type === 'group')
        .map(([id, frame]) => [id, inset(frame, measureInsets(windows.get(id), contents.get(id), frame))])
    );
    setFrames((draft) => syncRects(draft, nextFrames));
    setRects((draft) => syncRects(draft, nextRects));
  }

  /** Returns a ref callback paired with a release function for one element map. */
  function registry<K>(map: Map<K, HTMLElement>, observe: boolean) {
    return {
      ref: (key: K) => (element: HTMLElement) => {
        map.set(key, element);
        if (observe) {
          observer.observe(element);
        }
      },
      release: (key: K, element: HTMLElement | undefined) => {
        if (!element || map.get(key) !== element) {
          return;
        }

        // No measure here: release runs while the owner is disposed, mid-update, where store
        // writes are refused and the DOM is half replaced. The layout effect measures
        // after the change, and replacement elements are measured when first observed.
        map.delete(key);
        if (observe) {
          observer.unobserve(element);
        }
      }
    };
  }

  return {
    /** Box of every node in the layout layer, relative to the root. */
    frames,
    /** Content slot rectangles relative to the root, keyed by group id. */
    rects,
    boxes: registry(boxes, true),
    windows: registry(windows, true),
    contents: registry(contents, true),
    tabLists: registry(tabLists, false),
    tabs: registry(tabs, false),
    /** Client-space geometry of the given groups, for hit testing. */
    geometry(state: DockState): DockGroupGeometry[] {
      const rootElement = root();
      return listGroups(state).map((id) => {
        const node = state.nodes[id];
        const panels = node?.type === 'group' ? node.panels : [];
        const tabRects = new Map<PanelId, DockRect>();
        panels.forEach((panelId) => {
          const tab = tabs.get(panelId);
          if (tab?.isConnected) {
            tabRects.set(panelId, clientRect(tab));
          }
        });

        // The content slot comes from the layout layer, so drops hit where groups will be, even mid-animation.
        const content = rects[id];
        return {
          id,
          panels,
          content: content && rootElement ? toClientSpace(content, rootElement) : undefined,
          tabList: connectedRect(tabLists.get(id)),
          tabs: tabRects
        };
      });
    }
  };
}

/** Writes `next` into a rectangle store, keeping unchanged entries and dropping missing ones. */
function syncRects(draft: Record<string, DockRect>, next: Map<string, DockRect>): void {
  for (const id of Object.keys(draft)) {
    if (!next.has(id)) {
      delete draft[id];
    }
  }

  for (const [id, rect] of next) {
    if (!sameRect(draft[id], rect)) {
      draft[id] = rect;
    }
  }
}

/**
 * Content slot insets within a window, rounded so animation rounding never
 * moves panels. A new window's style has not caught up with its `frame` yet, so
 * it is sized here first; otherwise its slot would be laid out in an empty box.
 * The style binding writes the same size on the next update.
 */
function measureInsets(window: HTMLElement | undefined, content: HTMLElement | undefined, frame: DockRect): DockInsets {
  if (!window?.isConnected || !content?.isConnected) {
    return NO_INSETS;
  }

  window.style.width = `${frame.width}px`;
  window.style.height = `${frame.height}px`;

  const outer = window.getBoundingClientRect();
  const inner = content.getBoundingClientRect();
  return {
    top: Math.round(inner.top - outer.top),
    right: Math.round(outer.right - inner.right),
    bottom: Math.round(outer.bottom - inner.bottom),
    left: Math.round(inner.left - outer.left)
  };
}

function inset(rect: DockRect, insets: DockInsets): DockRect {
  return {
    x: rect.x + insets.left,
    y: rect.y + insets.top,
    width: Math.max(0, rect.width - insets.left - insets.right),
    height: Math.max(0, rect.height - insets.top - insets.bottom)
  };
}

/** Converts a client rectangle to the root's padding-box space, compensating for a scaled root. */
export function toRootSpace(rect: DockRect | DOMRect, root: HTMLElement): DockRect {
  const rootRect = root.getBoundingClientRect();
  const scaleX = root.offsetWidth ? rootRect.width / root.offsetWidth : 1;
  const scaleY = root.offsetHeight ? rootRect.height / root.offsetHeight : 1;

  return {
    x: (rect.x - rootRect.x) / scaleX - root.clientLeft,
    y: (rect.y - rootRect.y) / scaleY - root.clientTop,
    width: rect.width / scaleX,
    height: rect.height / scaleY
  };
}

/** Inverse of {@link toRootSpace}. */
function toClientSpace(rect: DockRect, root: HTMLElement): DockRect {
  const rootRect = root.getBoundingClientRect();
  const scaleX = root.offsetWidth ? rootRect.width / root.offsetWidth : 1;
  const scaleY = root.offsetHeight ? rootRect.height / root.offsetHeight : 1;

  return {
    x: (rect.x + root.clientLeft) * scaleX + rootRect.x,
    y: (rect.y + root.clientTop) * scaleY + rootRect.y,
    width: rect.width * scaleX,
    height: rect.height * scaleY
  };
}

function clientRect(element: Element): DockRect {
  const { x, y, width, height } = element.getBoundingClientRect();
  return { x, y, width, height };
}

function connectedRect(element: HTMLElement | undefined): DockRect | undefined {
  return element?.isConnected ? clientRect(element) : undefined;
}

function sameRect(left: DockRect | undefined, right: DockRect): boolean {
  return (
    left !== undefined &&
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

/** Active drag. Points are in client coordinates. */
export type DockDragSession = {
  subject: DockDragSubject;
  /** Current pointer position. */
  point: DockPoint;
  /** Pointer position at pointerdown. */
  origin: DockPoint;
  /**
   * Content slot of the dragged group (or the dragged panel's group) at drag
   * start, relative to the root. Lets a floating preview keep the panel's size
   * and its offset from the pointer.
   */
  sourceRect: DockRect | undefined;
};

/** Drop target plus its preview rectangle relative to the dock root. */
export type DockDropPreview = { target: DockDropTarget; rect: DockRect };

/**
 * Owns the tab/group drag session: one sensor factory, the resolved drop target
 * and its preview.
 *
 * By default the move is committed when the pointer is released. With
 * `liveMove`, panel drags commit each new target as soon as the pointer reaches
 * it. Each live layout is the drag-start
 * layout plus one move, so hovering around never distorts sizes and releasing
 * gives the same result as a plain drop. Only Escape restores the drag-start layout.
 *
 * With `detachOnDrag`, the panel leaves the layout when the drag starts (it stays
 * mounted, so it can float) and is placed on release; a release
 * without a target, or Escape, restores the drag-start layout. Group drags always
 * commit on release.
 */
function createDockDrag(options: {
  state: Accessor<DockState>;
  root: Accessor<HTMLElement | undefined>;
  slots: ReturnType<typeof createDockSlots>;
  resolveDropTarget: Accessor<DockDropTargetResolver>;
  liveMove: Accessor<boolean>;
  detachOnDrag: Accessor<boolean>;
  permits: (subject: DockDragSubject, target: DockDropTarget) => boolean;
  onDrop: (subject: DockDragSubject, target: DockDropTarget) => void;
  /** Replaces the whole layout, keeping store identity where values match. */
  onReplace: (state: DockState, moving?: DockDragSubject) => void;
}) {
  // Proxy capture keeps the pointer stream alive when a live move re-creates the dragged tab.
  const sensors = createDragSensorFactory({ threshold: 6, proxyCapture: true });
  const [session, setSession] = createSignal<DockDragSession>();
  const live = createLiveMove();

  // While a drag runs, page text must not get selected and iframes in the dock must not
  // swallow pointer events: a pointer over an iframe leaves this document and can cancel the drag.
  createEffect(sensors.isActive, (active) => {
    if (!active || typeof document === 'undefined') {
      return;
    }

    const style = document.documentElement.style;
    const previous = style.userSelect;
    style.userSelect = 'none';
    document.getSelection()?.removeAllRanges();
    const frames = [...(options.root()?.querySelectorAll('iframe') ?? [])].map((frame) => ({
      frame,
      pointerEvents: frame.style.pointerEvents
    }));
    frames.forEach(({ frame }) => (frame.style.pointerEvents = 'none'));

    return () => {
      style.userSelect = previous;
      frames.forEach(({ frame, pointerEvents }) => (frame.style.pointerEvents = pointerEvents));
    };
  });

  const preview = createMemo((): DockDropPreview | undefined => {
    const current = session();
    const root = options.root();
    if (!current || !root) {
      return undefined;
    }

    const groups = options.slots.geometry(options.state());
    const subject = currentSubject(current.subject);
    const target = resolveAt(current.point, subject, root, groups);
    if (!target) {
      return undefined;
    }

    const group = target.type === 'group' ? groups.find((candidate) => candidate.id === target.groupId) : undefined;
    const draggedId = subject.type === 'panel' ? subject.panelId : undefined;
    const rect = dropPreviewRect(target, clientRect(root), group, draggedId);
    return rect ? { target, rect: toRootSpace(rect, root) } : undefined;
  });

  /** Refreshes a panel subject's group, which changes during live moves. */
  function currentSubject(subject: DockDragSubject): DockDragSubject {
    if (subject.type === 'group') {
      return subject;
    }

    // A detached panel belongs to no group, so every group accepts it back.
    return { ...subject, groupId: findPanelGroup(options.state(), subject.panelId) ?? '' };
  }

  function resolveAt(
    point: DockPoint,
    subject: DockDragSubject,
    root: HTMLElement,
    groups = options.slots.geometry(options.state())
  ): DockDropTarget | undefined {
    const resolved = options.resolveDropTarget()(point, subject, clientRect(root), groups);
    const target = resolved && groupEquivalent(subject, resolved);
    return target && changesLayoutFor(subject, target) ? target : undefined;
  }

  /**
   * For a root edge `target`, the same edge of a group that already runs along
   * it when that gives the same structure (such as the right column's right
   * edge); otherwise `target`. Equivalent choices resolve the same way wherever
   * the pointer is, so the UI never offers two drops that do one thing.
   */
  function groupEquivalent(subject: DockDragSubject, target: DockDropTarget): DockDropTarget {
    return target.type === 'root' ? (equivalentGroupEdge(subject, target) ?? target) : target;
  }

  function equivalentGroupEdge(
    subject: DockDragSubject,
    target: Extract<DockDropTarget, { type: 'root' }>
  ): DockDropTarget | undefined {
    return listGroups(options.state())
      .map((groupId): DockDropTarget => ({ type: 'group', groupId, zone: target.edge }))
      .find((candidate) => changesLayoutFor(subject, candidate) && sameResult(subject, candidate, target));
  }

  function sameResult(subject: DockDragSubject, left: DockDropTarget, right: DockDropTarget): boolean {
    return sameMoveResult(live.base() ?? snapshot(options.state()), subject, left, right);
  }

  /**
   * Whether dropping `subject` on `target` would change the layout. Targets that
   * would not (such as a root edge the subject already fills) never resolve, so
   * no indicator is shown and nothing is committed.
   */
  function changesLayoutFor(subject: DockDragSubject, target: DockDropTarget): boolean {
    return (
      wouldChangeLayout(snapshot(options.state()), subject, target, live.base()) && options.permits(subject, target)
    );
  }

  /** Resolves the target under `point` for the current subject, or `undefined` without a root. */
  function targetAt(subject: DockDragSubject, point: DockPoint): DockDropTarget | undefined {
    const root = options.root();
    return root ? resolveAt(point, currentSubject(subject), root) : undefined;
  }

  /**
   * Live-move bookkeeping: the layout at drag start (for Escape), the last
   * committed target and the pending delayed commit.
   */
  function createLiveMove() {
    let mode: 'live' | 'detach' | undefined;
    let saved: DockState | undefined;
    let committed: DockDropTarget | undefined;

    /**
     * Applies `target` to the layout from the drag start, not to the current
     * one: intermediate moves would otherwise compound (a split halves a weight
     * that the later removal of the temporary group never gives back).
     */
    function commit(subject: DockDragSubject, target: DockDropTarget): boolean {
      committed = target;
      if (!saved || subject.type !== 'panel') {
        options.onDrop(subject, target);
        return true;
      }

      // A group missing from the start layout was created by this drag.
      if (target.type === 'group' && !saved.nodes[target.groupId]) {
        return false;
      }

      const next = structuredClone(saved);
      movePanel(next, subject.panelId, target);
      options.onReplace(next, subject);
      return true;
    }

    return {
      /** Whether this drag rearranges the layout before release (live or detached). */
      engaged: () => mode !== undefined,
      /** Layout each live or detached move is applied to, while one is active. */
      base: () => saved,
      /** Whether hovering commits targets (live mode). */
      hovers: () => mode === 'live',
      start(subject: DockDragSubject): void {
        if (subject.type !== 'panel' || !(options.liveMove() || options.detachOnDrag())) {
          return;
        }

        mode = options.liveMove() ? 'live' : 'detach';
        saved = structuredClone(snapshot(options.state()));
        committed = undefined;
        if (mode === 'detach') {
          const detached = structuredClone(saved);
          closePanel(detached, subject.panelId);
          options.onReplace(detached, subject);
        }
      },
      /** Applies the target under the pointer unless it is already applied. */
      hover(subject: DockDragSubject, target: DockDropTarget | undefined): void {
        if (target && !sameDropTarget(target, committed)) {
          commit(subject, target);
        }
      },
      /**
       * Applies the final target if it differs from the last committed one. A
       * detached panel without a usable target returns to where it started.
       */
      finish(subject: DockDragSubject, target: DockDropTarget | undefined): void {
        const applied = target !== undefined && !sameDropTarget(target, committed) && commit(subject, target);
        if (mode === 'detach' && !applied && saved) {
          options.onReplace(saved, subject);
        }
        this.stop();
      },
      /**
       * Escape restores the drag-start layout. Other cancellations (a lost pointer
       * capture) keep a live layout as it is; a detached panel has no place of its
       * own, so it returns to where it started.
       */
      cancel(reason: string): void {
        if (saved && (reason === 'escape' || mode === 'detach')) {
          options.onReplace(saved);
        }
        this.stop();
      },
      stop(): void {
        mode = undefined;
        saved = undefined;
        committed = undefined;
      }
    };
  }

  /**
   * Creates a drag sensor for a tab or a group handle. Must run under an owner.
   * `onClick` fires when the pointer is released before the drag threshold.
   */
  function createSensor(subject: Accessor<DockDragSubject | undefined>, onClick?: () => void): DragSensorHandle {
    return sensors.createSensor({
      disabled: () => subject() === undefined,
      onClick,
      onDragStart: (event) => {
        const current = subject();
        if (current) {
          // Captured before a detach removes the panel's slot.
          const sourceRect = options.slots.rects[current.groupId];
          setSession({
            subject: current,
            point: event.position,
            origin: event.origin,
            sourceRect: sourceRect && { ...sourceRect }
          });
          live.start(current);
        }
      },
      onDragMove: (event) => {
        const current = session();
        if (!current) {
          return;
        }

        setSession({ ...current, point: event.position });
        if (live.hovers()) {
          live.hover(current.subject, targetAt(current.subject, event.position));
        }
      },
      onDragEnd: (event) => {
        const current = session();
        setSession(undefined);
        if (!current) {
          return;
        }

        // The memoized preview lags one point behind; resolve the final position directly.
        const target = targetAt(current.subject, event.position);
        if (live.engaged()) {
          live.finish(current.subject, target);
        } else if (target) {
          options.onDrop(current.subject, target);
        }
      },
      onDragCancel: (event) => {
        setSession(undefined);
        live.cancel(event.reason);
      }
    });
  }

  return {
    /** Current drag, or `undefined` when idle. */
    session,
    /**
     * Whether the current drag subject may drop on `target`: the drop changes the
     * layout and every rule allows it. Use it to hide affordances that would not work.
     */
    canDrop: (target: DockDropTarget): boolean => {
      const subject = session()?.subject;
      return subject !== undefined && changesLayoutFor(currentSubject(subject), target);
    },
    /**
     * Whether two targets would give the same layout structure for the current
     * drag subject. Use it to show only one of several equivalent affordances.
     */
    sameResult: (left: DockDropTarget, right: DockDropTarget): boolean => {
      const subject = session()?.subject;
      return subject !== undefined && sameResult(currentSubject(subject), left, right);
    },
    /**
     * Whether a root edge only repeats the same edge of a group that already runs
     * along it. Such edges resolve to the group; hide their affordance.
     */
    isRedundantEdge: (edge: DockEdge): boolean => {
      const subject = session()?.subject;
      return (
        subject !== undefined && equivalentGroupEdge(currentSubject(subject), { type: 'root', edge }) !== undefined
      );
    },
    /** Resolved drop target and preview rectangle for the current pointer position. */
    preview,
    createSensor,
    /** Starts sash drags on the same sensor factory, so only one drag runs at a time. */
    sensors
  };
}
