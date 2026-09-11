import { createElementSize } from '@solid-primitives/resize-observer';
import type { JSX } from '@solidjs/web';
import { createEffect, createMemo, createSignal, createUniqueId, untrack } from 'solid-js';
import styles from './CardStack.module.css';
import { fitTabSlots, reorderTab, tabRows } from './layout';
import { createFreeDrag } from './primitives/createFreeDrag';
import { createHorizontalRail } from './primitives/createHorizontalRail';
import { createTabMotion } from './primitives/createTabMotion';
import { createVerticalGesture, type VerticalGesture } from './primitives/createVerticalGesture';

/** Stable identity; labels, visuals and application data belong to the caller. */
export type CardStackItem = { id: string };

/** Reactive inputs for a deck. IDs must be unique and stable for its mounted lifetime. */
export type CardStackOptions<T extends CardStackItem> = {
  items: readonly T[];
  /** Back-to-front depth. When supplied, onOrderChange must synchronously update it. */
  order?: readonly string[];
  /** Initial depth, defaulting to items order. The last item is active. */
  defaultOrder?: readonly string[];
  onOrderChange?: (order: readonly string[]) => void;
  /** Initial left-to-right order, independent of depth. Defaults to items order. */
  initialTabOrder?: readonly string[];
  /** Stable DOM prefix. Auto-generated when omitted; empty preserves unprefixed IDs. */
  id?: string;
  /** Pixels per geometry unit; omitted means one percent of container width. */
  geometryUnit?: number | undefined;
  /** Handle width and height in geometry units. Defaults to 30 and 6. */
  tabWidth?: number;
  tabHeight?: number;
  /** Overlap of adjacent compact handles, in geometry units. Defaults to 2. */
  tabOverlap?: number;
  initiallyCollapsed?: boolean;
  /** Maximum exposed cards in the expanded stack, including the active/held card. Defaults 8.
   * Clamped to at least 2. Other cards stay mounted and accessible in the compact row. Infinity exposes all cards. */
  maxExpandedCards?: number | undefined;
  /** Multiplier for resting expanded vertical distances. Defaults to 1; positive finite values only.
   * Values below 1 compress the stack and may partially overlap handles. Does not resize handles or the compact row.
   * Updates animate in place; an active pointer gesture retains its captured spacing until release. */
  expandedSpacing?: number | undefined;
  /** Reserve content for native scrolling, restricting deck drags to handles. Defaults true. */
  scrollableContent?: boolean;
};

/**
 * Owns selection, independent rail sorting, interruptible motion and pointer lifetime.
 * Create under a Solid owner. Render with CardStack or bind the returned part props once
 * to the corresponding native elements and preserve their generated module classes.
 * All real panels stay mounted. Cards change depth only while outside the viewport.
 */
export function createCardStack<T extends CardStackItem>(props: CardStackOptions<T>) {
  const prefix = props.id ?? createUniqueId();
  const tabId = (id: string) => `${prefix ? prefix + '-' : ''}tab-${encodeURIComponent(id)}`;
  const panelId = (id: string) => `${prefix ? prefix + '-' : ''}panel-${encodeURIComponent(id)}`;
  const triggers = new Map<string, HTMLButtonElement>();
  const [localOrder, setLocalOrder] = createSignal<readonly string[]>(
    untrack(() => [...(props.defaultOrder ?? props.items.map((item) => item.id))])
  );
  const depthOrder = () => props.order ?? localOrder();
  const railRatio = () => 1 - (props.tabOverlap ?? 2) / (props.tabWidth ?? 30);
  const [tablist, setTablist] = createSignal<HTMLDivElement>();
  const size = createElementSize(tablist);
  const length = (value: number) => (props.geometryUnit ? `${value * props.geometryUnit}px` : `${value}cqw`);
  // A batch changes order only after every outgoing wrapper has left the screen.
  type MovingCard = { id: string; start: number; index: number };
  type Reveal = { id: string; start: number; end: number };
  type Choreography = {
    cards: readonly MovingCard[];
    reveals: readonly Reveal[];
    /** Shared inset captured before CSS takes ownership of vertical motion. */
    inset: number;
  };
  type Transition =
    | (Choreography & { phase: 'departing'; complete: () => void; order: readonly string[] })
    | (Choreography & { phase: 'returning' });
  // Completion bookkeeping is not rendered; duplicate events must not finish a batch early.
  const completed = new Set<string>();
  const [transition, setTransition] = createSignal<Transition>();
  const [collapsed, setCollapsed] = createSignal(untrack(() => props.initiallyCollapsed ?? false));
  const [selectionTarget, setSelectionTarget] = createSignal<string>();
  type Grab = {
    id: string;
    position: number;
    left: number;
    lefts: ReadonlyMap<string, number>;
    order: readonly string[];
    tabs: readonly string[];
    slots: readonly number[];
    field: ReadonlyMap<string, number>;
    /** Expanded rows stay fixed throughout a grab, even while horizontal sorting changes collisions. */
    rows: ReadonlyMap<string, number>;
    spread: number;
    compact: boolean;
    rail: number;
    /** Pointer travel needed to move the handle into the bottom edge area. */
    advanceAfter: number;
  };
  const [interruptedGrab, setInterruptedGrab] = createSignal<Grab>();
  const [inspectedId, setInspectedId] = createSignal<string>();
  const [fieldStart, setFieldStart] = createSignal(3);
  const [railDrag, setRailDrag] = createSignal(0);
  let previousPointerX = 0;
  const [tabOrder, setTabOrder] = createSignal<readonly string[]>(
    untrack(() => [...(props.initialTabOrder ?? props.items.map((item) => item.id))])
  );
  const [slots, setSlots] = createSignal<readonly number[]>(
    untrack(() => props.items.map((_, index) => index / Math.max(1, props.items.length - 1)))
  );
  const panels = new Map<string, HTMLElement>();
  const activeId = () => depthOrder().at(-1);
  const free = createFreeDrag({
    target: tablist,
    accepts: (target) =>
      target instanceof Element &&
      target.closest('[data-tabs-root]') === tablist() &&
      !target.closest('input, textarea, select, [contenteditable="true"], [data-tabs-no-drag]') &&
      (props.scrollableContent === false || isRailTab(target)),
    onStart: startDrag,
    onFinish: finishDrag
  });
  const rowLayouts = createMemo(() => {
    const depth = [...depthOrder()];
    const requestedSpacing = props.expandedSpacing ?? 1;
    const spacing = Number.isFinite(requestedSpacing) && requestedSpacing > 0 ? requestedSpacing : 1;
    return new Map(
      depth.map((_, index) => {
        const order = [...depth.slice(index), ...depth.slice(0, index)];
        return [
          order.join(' '),
          new Map(
            [...tabRows(expandedOrder(order), (id) => stackLeftId(id, order), tabWidth(), props.tabHeight ?? 6)]
              .map(([id, row]) => [id, row * spacing])
          )
        ];
      })
    );
  });
  // Wheel gestures share layout commands, but never compete for pointer ownership.
  createVerticalGesture(
    tablist,
    commitGesture,
    () => !free.dragging(),
    (event) =>
      (props.scrollableContent === false || isRailTab(event.target)) && (!collapsed() || !isRailTab(event.target)),
    () => false
  );
  const gesture = { dragging: free.dragging, offset: () => free.position().y, startTarget: free.startTarget };
  const travel = () =>
    Math.max(1, free.dragging() ? (interruptedGrab()?.spread ?? 1) : rowPosition(activeId() ?? '') * pixelUnit());
  const gestureCompact = () => (free.dragging() ? (interruptedGrab()?.compact ?? collapsed()) : collapsed());
  const collapseProgress = () => Math.min(1, Math.max(0, (gestureCompact() ? 1 : 0) - gesture.offset() / travel()));
  const dragOffset = () => Math.max(0, gesture.offset() - (gestureCompact() ? travel() : 0));
  // Small vertical pointer noise should not stop a horizontal row scroll.
  const draggingRow = (y: number) => (gestureCompact() ? y <= 12 : y <= -travel());
  const widthUnit = () => Math.max(1, size.clientWidth || tablist()?.clientWidth || 1000) / 100;
  const horizontalShift = (id: string) =>
    free.dragging() ? (id === interruptedGrab()?.id ? free.position().x : railDrag()) / widthUnit() : 0;

  // Accumulate shared movement only while gathered. Keep the accumulated portion
  // when a horizontal gesture turns downward, so the other tabs never jump back.
  createEffect(
    () => ({
      dragging: free.dragging(),
      x: free.position().x,
      y: free.position().y,
      row: draggingRow(free.position().y)
    }),
    (state) =>
      untrack(() => {
        if (!state.dragging) return;
        const delta = state.x - previousPointerX;
        previousPointerX = state.x;
        if (state.row) setRailDrag((value) => value + delta);
        else {
          const grab = interruptedGrab();
          if (!grab) return;
          if (Math.abs(state.x - railDrag()) < 6) {
            if (tabOrder().some((id, index) => id !== grab.tabs[index])) setTabOrder(grab.tabs);
            return;
          }
          const destinations = grab.tabs.map((id) => grab.field.get(id)!);
          const next = reorderTab(
            grab.tabs,
            grab.id,
            grab.field.get(grab.id)! + (state.x - railDrag()) / widthUnit(),
            destinations
          );
          if (next.some((id, index) => id !== tabOrder()[index])) setTabOrder(next);
        }
      })
  );
  const revealedId = () => {
    const current = transition();
    return current?.phase === 'departing' ? current.order.at(-1) : undefined;
  };
  const compactItems = createMemo(() =>
    tabOrder().flatMap((id) => {
      const item = props.items.find((candidate) => candidate.id === id);
      return item ? [item] : [];
    })
  );
  const stackLeft = (item: T) => stackLeftId(item.id);
  const railLeft = (id: string) =>
    3 +
    Math.max(
      0,
      compactItems().findIndex((item) => item.id === id)
    ) *
      (tabWidth() * railRatio());
  const railMax = () => Math.max(0, 6 + (props.items.length - 1) * (tabWidth() * railRatio()) + tabWidth() - 100);
  const centeredRail = () => Math.max(0, Math.min(railMax(), railLeft(activeId() ?? '') - (100 - tabWidth()) / 2));
  const rail = createHorizontalRail({
    target: tablist,
    enabled: () => collapsed() && !gesture.dragging(),
    max: railMax,
    tabWidth,
    accepts: () => false,
    acceptsWheel: isRailTab,
    readPainted: () => {
      const stack = tablist();
      const tab = stack?.querySelector<HTMLElement>('button[data-tabs-trigger]');
      if (!stack || !tab) return rail.offset();
      return (
        railLeft(tab.dataset.tabsTrigger ?? '') -
        ((tab.getBoundingClientRect().left - stack.getBoundingClientRect().left) / Math.max(1, stack.clientWidth)) * 100
      );
    }
  });

  // Only a real resize should reveal the active tab. The first measurement must
  // not send a newly mounted long compact rail scrolling through dozens of tabs.
  let measuredWidth: number | undefined;
  createEffect(
    () => ({ width: tabWidth(), measured: size.clientWidth }),
    ({ width, measured }) =>
      untrack(() => {
        if (!measured) return;
        const resized = measuredWidth !== undefined && measuredWidth !== width;
        measuredWidth = width;
        if (resized && collapsed()) rail.reveal(railLeft(activeId() ?? ''));
      })
  );

  const tabMotion = createTabMotion(
    () => props.items.map((item) => ({ id: item.id, x: tabTarget(item) })),
    () => (rail.direct() ? rail.offset() : undefined),
    // Keep the follower in sync with the always-animated card choreography.
    () => false,
    100,
    directTab
  );

  // Use the same speed-limited follower on the vertical axis. Only the held tab is direct.
  const verticalMotion = createTabMotion(
    () =>
      props.items.map((item) => ({
        id: item.id,
        x: dragDestination(item.id)
      })),
    () => undefined,
    () => false,
    // A screen-length move takes the click exit's 600 ms, including the follower's
    // 1/6 second acceleration/braking overhead. Scale with height, not tab size.
    () => (size.clientHeight || tablist()?.clientHeight || 868) / pixelUnit() / (0.6 - 1 / 6),
    directTab
  );

  return {
    activeId,
    order: depthOrder,
    tabOrder,
    select,
    next,
    collapsed,
    scrollBy: (amount: number) => rail.scrollBy(amount),
    canScrollBack: () => rail.offset() > 0,
    canScrollForward: () => rail.offset() < railMax(),
    rootProps: () => ({
      ref: setTablist,
      'data-tabs-root': '',
      class: styles.root,
      'data-scrollable': props.scrollableContent !== false ? '' : undefined,
      'data-dragging': free.dragging() ? '' : undefined,
      'data-direct': rail.direct() || free.dragging() ? '' : undefined,
      'data-motion': transition()?.phase ?? 'idle',
      'data-layout': collapsed() ? 'compact' : 'stacked',
      'data-selection-target': selectionTarget(),
      'data-tab-order': tabOrder().join(' '),
      'data-rail-offset': rail.offset(),
      'data-stack-pan': free.dragging() ? -railDrag() / widthUnit() : 0,
      style: {
        '--drag-offset': `${dragOffset()}px`,
        '--collapse': collapseProgress(),
        '--tab-width': length(props.tabWidth ?? 30),
        '--tab-height': length(props.tabHeight ?? 6),
        '--deck-unit': props.geometryUnit ? `${props.geometryUnit}px` : '1cqw',
        '--front-offset': length(rowPosition(activeId() ?? '') * (1 - collapseProgress())),
        '--extra-height': `${rowPosition(activeId() ?? '') * collapseProgress()}cqw`
      } as JSX.CSSProperties
    }),
    listProps: () => ({
      class: styles.list,
      role: 'tablist' as const,
      'data-tabs-list': '',
      'aria-owns': tabOrder().map(tabId).join(' ')
    }),
    cardProps: (item: T) => ({
      class: styles.card,
      'data-tabs-card': item.id,
      'data-active': activeId() === item.id ? '' : undefined,
      'data-revealed': revealedId() === item.id ? '' : undefined,
      'data-phase': motionClass(item.id).replace('is-', '') || undefined,
      'data-stack-hidden': stackHidden(item.id) ? '' : undefined,
      inert: stackHidden(item.id),
      onAnimationEnd: (event: AnimationEvent) => finishMotion(event, item.id),
      style: {
        '--rank': depthOrder().indexOf(item.id),
        '--exit-layer': props.items.length + depthOrder().indexOf(item.id) + 1,
        '--exit-start': `${exitStart(item.id)}px`,
        '--offset': length(offsetUnits(item.id)),
        '--painted-offset': length(paintedRow(item.id)),
        '--card-drag-offset': `${paintedDrag(item.id)}px`,
        ...motionStyle(item.id),
        '--left': `${tabTarget(item)}%`,
        'z-index': depthOrder().indexOf(item.id) + 1
      } as JSX.CSSProperties
    }),
    triggerProps: (item: T) => ({
      class: styles.trigger,
      ref: (element: HTMLButtonElement) => {
        triggers.set(item.id, element);
      },
      id: tabId(item.id),
      type: 'button' as const,
      role: 'tab' as const,
      'data-tabs-trigger': item.id,
      'aria-controls': panelId(item.id),
      'aria-selected': activeId() === item.id ? ('true' as const) : ('false' as const),
      tabindex: activeId() === item.id ? 0 : -1,
      style: {
        '--painted-left': `${(tabMotion().get(item.id) ?? stackLeft(item)) + horizontalShift(item.id)}cqw`
      } as JSX.CSSProperties,
      onFocus: () => {
        if (collapsed()) rail.reveal(railLeft(item.id));
      },
      onClick: () => select(item.id),
      onKeyDown: (event: KeyboardEvent) => navigate(event, props.items.indexOf(item))
    }),
    panelProps: (item: T) => ({
      class: styles.panel,
      ref: (element: HTMLElement) => {
        panels.set(item.id, element);
      },
      id: panelId(item.id),
      role: 'tabpanel' as const,
      'data-tabs-panel': '',
      'aria-labelledby': tabId(item.id),
      'aria-hidden': activeId() !== item.id ? ('true' as const) : ('false' as const),
      inert: activeId() !== item.id,
      tabindex: activeId() === item.id ? 0 : -1
    })
  };

  function updateOrder(next: readonly string[]) {
    if (props.order === undefined) setLocalOrder(next);
    props.onOrderChange?.(next);
  }

  function commitSelection(id: string) {
    const previous = depthOrder();
    const index = previous.indexOf(id);
    if (index >= 0 && index < previous.length - 1)
      updateOrder([...previous.slice(index + 1), ...previous.slice(0, index + 1)]);
  }

  function commitCycle(gesture: VerticalGesture) {
    if (gesture.direction !== 'down') return;
    const previous = depthOrder();
    const last = previous.at(-1);
    if (last) updateOrder([last, ...previous.slice(0, -1)]);
  }

  function tabWidth() {
    return props.geometryUnit
      ? (((props.tabWidth ?? 30) * props.geometryUnit) / (size.clientWidth || 1000)) * 100
      : (props.tabWidth ?? 30);
  }

  function expandedLimit() {
    const value = props.maxExpandedCards ?? 8;
    return value === Infinity ? props.items.length : Math.max(2, Math.floor(Number.isFinite(value) ? value : 8));
  }

  /** Keep the nearest front cards, making room for a rear handle currently held from the compact row. */
  function expandedOrder(order: readonly string[] = depthOrder(), held = inspectedId()) {
    const limit = expandedLimit();
    const visible = order.slice(-limit);
    if (!held || visible.includes(held) || !order.includes(held)) return visible;
    const ids = new Set([held, ...visible.slice(1)]);
    return order.filter((id) => ids.has(id));
  }

  function stackHidden(id: string) {
    if (collapseProgress() === 1) return false;
    return !expandedOrder().includes(id);
  }

  function fieldSpan(order: readonly string[] = depthOrder()) {
    return Math.max(1, Math.min(94 - tabWidth(), (expandedOrder(order).length - 1) * tabWidth() * 0.8));
  }

  function fieldOrigin(order: readonly string[] = depthOrder()) {
    return Math.max(3, Math.min(97 - tabWidth() - fieldSpan(order), fieldStart()));
  }

  function stackLeftId(id: string, order: readonly string[] = depthOrder()) {
    const visible = new Set(expandedOrder(order));
    if (visible.size === props.items.length)
      return fieldOrigin(order) + (slots()[tabOrder().indexOf(id)] ?? 0) * fieldSpan(order);
    const visibleIndices = tabOrder().flatMap((id, index) => (visible.has(id) ? [index] : []));
    const index = tabOrder().indexOf(id);
    let before = -1;
    visibleIndices.forEach((position, rank) => {
      if (position <= index) before = rank;
    });
    const last = visibleIndices.length - 1;
    // Hidden slots retain their list order between the exposed handles, so a sort
    // crosses neighbors in the same order as the full compact rail.
    const rank =
      before < 0
        ? index - (visibleIndices[0] ?? 0)
        : before === last
          ? last + index - visibleIndices[last]!
          : before + (index - visibleIndices[before]!) / (visibleIndices[before + 1]! - visibleIndices[before]!);
    return fieldOrigin(order) + (rank / Math.max(1, last)) * fieldSpan(order);
  }

  /** Capture both painted axes, including unfinished RAF and CSS motion. */
  function startDrag(target: EventTarget | null) {
    const painted = interruptMotion() ?? verticalMotion();
    const id =
      (target instanceof Element
        ? target.closest<HTMLElement>('[data-tabs-trigger]')?.dataset.tabsTrigger
        : undefined) ?? activeId();
    setRailDrag(0);
    previousPointerX = 0;
    const tabs = [...tabOrder()];
    if (id && !expandedOrder().includes(id)) setInspectedId(id);
    if (collapsed() && id) {
      const visible = new Set(expandedOrder());
      const visibleTabs = tabs.filter((id) => visible.has(id));
      const rank = Math.max(0, visibleTabs.indexOf(id));
      setFieldStart((tabMotion().get(id) ?? 3) - (rank / Math.max(1, visibleTabs.length - 1)) * fieldSpan());
    }
    const fractions =
      collapsed() && id
        ? fitTabSlots(
            tabs.map(
              (_, index) =>
                ((tabMotion().get(id) ?? 3) - fieldOrigin()) / fieldSpan() +
                (index - tabs.indexOf(id)) / Math.max(1, tabs.length - 1)
            )
          )
        : [...slots()];
    const field = new Map(
      tabs.map((id, index) => [id, collapsed() ? fieldOrigin() + fractions[index]! * fieldSpan() : stackLeftId(id)])
    );
    const spread = rowPosition(activeId() ?? '') * pixelUnit();
    if (collapsed()) setSlots(fractions);
    setInterruptedGrab(
      id
        ? {
            id,
            position: painted.get(id) ?? 0,
            left: tabMotion().get(id) ?? 0,
            lefts: new Map(tabMotion()),
            order: [...depthOrder()],
            tabs,
            slots: fractions,
            field,
            rows: new Map(expandedOrder().map((id) => [id, rowPosition(id)])),
            spread,
            compact: collapsed(),
            rail: rail.offset(),
            advanceAfter: advanceDistance(id, painted.get(id) ?? 0)
          }
        : undefined
    );
  }

  /** The whole handle can cross the lower edge without moving the pointer outside the viewport. */
  function advanceDistance(id: string, painted: number) {
    const bounds = tablist()?.getBoundingClientRect();
    const button = panels.get(id)?.parentElement?.querySelector('button')?.getBoundingClientRect();
    const bottom = Math.min(bounds?.bottom || size.clientHeight || 868, window.innerHeight);
    const top = button?.height ? button.top : (bounds?.top ?? 0) + painted * pixelUnit();
    return Math.max(48, bottom - top - Math.max(48, (button?.height || (props.tabHeight ?? 6) * pixelUnit()) * 2));
  }

  /** Preserve the shared rail displacement and place only the independently dragged handle. */
  function finishDrag(result: { x: number; y: number; cancelled: boolean }) {
    const grab = interruptedGrab();
    if (!grab) return;
    const releasedInRow = draggingRow(result.y);
    const shared = railDrag() + (releasedInRow ? result.x - previousPointerX : 0);
    const painted = new Map(
      [...tabMotion()].map(([id, x]) => [id, x + (id === grab.id ? result.x : shared) / widthUnit()])
    );
    tabMotion.rebase(painted);
    const nextCompact = result.cancelled || Math.abs(result.y) < 24 ? grab.compact : result.y < 0;
    setCollapsed(nextCompact);
    const finalOrder = result.cancelled
      ? grab.tabs
      : !releasedInRow && Math.abs(result.x - shared) >= 6
        ? reorderTab(
            grab.tabs,
            grab.id,
            grab.field.get(grab.id)! + (result.x - shared) / widthUnit(),
            grab.tabs.map((id) => grab.field.get(id)!)
          )
        : tabOrder();
    setTabOrder(finalOrder);
    if (result.cancelled) {
      setTabOrder(grab.tabs);
      setSlots(grab.slots);
    }
    // A held gesture only changes the spread. Commit depth after a deliberate
    // downward release, using the final pointer coordinate even between frames.
    if (!result.cancelled && result.y >= Math.max(48, Math.min(90, grab.spread / 2))) {
      if (grab.id !== activeId()) select(grab.id);
      else if (result.y >= grab.advanceAfter) next();
    }
    // Preserve physical slot positions and the held x after sorting. Depth stays
    // controlled by depthOrder(); rearranging the list never selects another sheet.
    if (!result.cancelled) {
      const order = finalOrder;
      const nextSlots = grab.slots.map((value) => value + shared / widthUnit() / fieldSpan());
      const heldIndex = order.indexOf(grab.id);
      if (heldIndex >= 0) nextSlots[heldIndex] = ((painted.get(grab.id) ?? grab.left) - fieldOrigin()) / fieldSpan();
      setSlots(fitTabSlots(nextSlots));
    }
    if (nextCompact && !result.cancelled) {
      const anchor = 3 + finalOrder.indexOf(grab.id) * (tabWidth() * railRatio()) - (painted.get(grab.id) ?? grab.left);
      // Keep the release position unless it would expose empty space at a rail edge.
      rail.scrollTo(anchor);
    } else rail.scrollTo(grab.rail);
  }

  function dragDestination(id: string) {
    const grab = interruptedGrab();
    if (gesture.dragging() && grab?.id === id && directTab() === id)
      return Math.max(0, grab.position + gesture.offset() / pixelUnit());
    return offsetUnits(id);
  }

  /** Cancel the superseded selection, retaining every wrapper's painted coordinates. */
  function interruptMotion() {
    const current = transition();
    if (!current) return;
    const painted = new Map(verticalMotion());
    const inset = (tablist()?.getBoundingClientRect().top ?? 0) + current.inset;
    for (const { id } of props.items) {
      const element = panels.get(id)?.parentElement;
      if (element) painted.set(id, (element.getBoundingClientRect().top - inset) / pixelUnit());
    }
    completed.clear();
    setSelectionTarget(undefined);
    setTransition(undefined);
    verticalMotion.rebase(painted);
    return painted;
  }

  // Keep displacement beyond the resting row outside layout height, so a pulled
  // card retains its content and footer even when its top passes the screen edge.
  function paintedRow(id: string) {
    return Math.min(verticalMotion().get(id) ?? offsetUnits(id), offsetUnits(id));
  }

  function paintedDrag(id: string) {
    return Math.max(0, (verticalMotion().get(id) ?? offsetUnits(id)) - offsetUnits(id)) * pixelUnit();
  }

  function pixelUnit() {
    return props.geometryUnit ?? widthUnit();
  }

  function directTab() {
    if (!gesture.dragging()) return;
    return interruptedGrab()?.id ?? activeId();
  }

  function isRailTab(target: EventTarget | null) {
    return (
      target instanceof Element &&
      target.closest('[data-tabs-root]') === tablist() &&
      Boolean(target.closest('button[data-tabs-trigger]'))
    );
  }

  function select(id: string) {
    if (!depthOrder().includes(id)) return;
    if (collapsed()) rail.reveal(railLeft(id));
    const target = id === activeId() ? undefined : id;
    setSelectionTarget(target);
    if (!transition()) continueSelection(target);
  }

  function continueSelection(target: string | undefined) {
    if (!target || target === activeId() || !depthOrder().includes(target)) {
      setSelectionTarget(undefined);
      return;
    }
    // Each covering card has its own timing; depth commits once the last one clears.
    depart(target, () => commitSelection(target));
  }

  function commitGesture(motion: VerticalGesture) {
    interruptMotion();
    // Upward pulls gather the deck without selecting the grabbed tab.
    if (motion.direction === 'up') {
      rail.scrollTo(centeredRail());
      setCollapsed(true);
      return;
    }
    const origin = gesture.startTarget();
    const tab = origin instanceof Element ? origin.closest<HTMLButtonElement>('button[data-tabs-trigger]') : null;
    const requested = tab?.dataset.tabsTrigger;
    if (requested && requested !== activeId() && depthOrder().includes(requested)) {
      // Resolve the tab where the gesture started, not the stack that later captures it.
      select(requested);
      setCollapsed(false);
      return;
    }
    if (collapsed()) {
      const remaining = motion.offset - travel();
      // A single held pull may pass through the expanded pose and continue offscreen.
      if (remaining >= Math.max(36, Math.min(90, (tablist()?.clientHeight ?? 0) * 0.09))) {
        depart(depthOrder().at(-2), () => commitCycle({ direction: 'down', offset: remaining }));
      }
      setCollapsed(false);
    } else {
      depart(depthOrder().at(-2), () => commitCycle(motion));
    }
  }

  function next() {
    if (!transition()) depart(depthOrder().at(-2), () => commitCycle({ direction: 'down', offset: 0 }));
  }

  function depart(target: string | undefined, complete: () => void) {
    const index = target ? depthOrder().indexOf(target) : -1;
    if (index < 0 || index === depthOrder().length - 1) return;
    const front = depthOrder().slice(index + 1);
    const order = [...front, ...depthOrder().slice(0, index + 1)];
    const top = tablist()?.getBoundingClientRect().top ?? 0;
    // Capture each painted position, including a collapse or expansion still settling.
    const cards = front.map((id, index) => ({
      id,
      index: front.length - 1 - index,
      start: (panels.get(id)?.parentElement?.getBoundingClientRect().top ?? top) - top
    }));
    const anchor = target!;
    const inset =
      (panels.get(anchor)?.parentElement?.getBoundingClientRect().top ?? top) -
      top -
      (verticalMotion().get(anchor) ?? 0) * pixelUnit();
    const reveals = depthOrder()
      .slice(0, index + 1)
      .map((id) => ({
        id,
        start: (panels.get(id)?.parentElement?.getBoundingClientRect().top ?? top) - top,
        end: rowPosition(id, order) * (1 - collapseProgress())
      }));
    completed.clear();
    setTransition({ phase: 'departing', cards, reveals, inset, complete, order });
  }

  /** Only wrapper completions count; all cards must finish before the batch changes phase. */
  function finishMotion(event: AnimationEvent, id: string) {
    if (event.target !== event.currentTarget) return;
    const current = transition();
    if (!current || !current.cards.some((card) => card.id === id)) return;
    const expected = current.phase === 'departing' ? styles.tabsExit : styles.tabsReturn;
    if (event.animationName !== expected || completed.has(id)) return;
    completed.add(id);
    if (completed.size !== current.cards.length) return;
    completed.clear();
    if (current.phase === 'departing') {
      // CSS has carried the revealed cards to these exact destinations. Seed the
      // follower there before removing that animation, preventing a second drop.
      verticalMotion.rebase(
        new Map(props.items.map(({ id }) => [id, rowPosition(id, current.order) * (1 - collapseProgress())]))
      );
      setTransition({ phase: 'returning', cards: current.cards, reveals: current.reveals, inset: current.inset });
      current.complete();
    } else {
      setTransition(undefined);
      continueSelection(selectionTarget());
    }
  }

  function motionClass(id: string) {
    const current = transition();
    if (current?.cards.some((card) => card.id === id)) return `is-${current.phase}`;
    return current?.phase === 'departing' ? 'is-revealing' : '';
  }

  /** Frontmost leaves first; rear appearances wait until their own card has cleared. */
  function motionStyle(id: string) {
    const motion = transition();
    if (!motion) return {};
    const card = motion.cards.find((card) => card.id === id);
    const last = motion.cards.length - 1;
    const index = card?.index ?? last;
    const stagger = Math.min(1, 7 / Math.max(1, last));
    const reveal = motion.reveals.find((card) => card.id === id);
    return {
      '--exit-delay': `${index * 40 * stagger}ms`,
      '--exit-duration': `${600 + index * 20 * stagger}ms`,
      '--return-delay': `${80 + index * 60 * stagger}ms`,
      '--return-duration': `${500 + index * 30 * stagger}ms`,
      '--return-start-offset': length(
        (rowPosition(
          (motion.phase === 'departing' ? motion.order : depthOrder()).at(-1) ?? '',
          motion.phase === 'departing' ? motion.order : depthOrder()
        ) +
          (props.tabHeight ?? 6)) *
          (1 - collapseProgress()) +
          (props.tabHeight ?? 6)
      ),
      '--return-offset': length(
        rowPosition(id, motion.phase === 'departing' ? motion.order : depthOrder()) * (1 - collapseProgress())
      ),
      '--reveal-start': `${reveal?.start ?? 0}px`,
      '--reveal-end': length(reveal?.end ?? 0),
      '--reveal-delay': `${last * 40 * stagger}ms`,
      '--reveal-duration': `${600 + last * 20 * stagger}ms`
    };
  }

  function exitStart(id: string) {
    const current = transition();
    return current?.phase === 'departing' ? (current.cards.find((card) => card.id === id)?.start ?? 0) : 0;
  }

  function tabTarget(item: T) {
    const grab = interruptedGrab();
    const left = stackLeft(item);
    const target = railLeft(item.id) - rail.offset();
    const progress = collapseProgress();
    if (gesture.dragging() && grab) {
      if (grab.id === item.id) return grab.left;
      const initial = grab.compact
        ? 3 + grab.tabs.indexOf(item.id) * (tabWidth() * railRatio()) - grab.rail
        : (grab.field.get(item.id) ?? left);
      const anchoredRow =
        railLeft(item.id) - railLeft(grab.id) + grab.left + (free.position().x - railDrag()) / widthUnit();
      return (grab.lefts.get(item.id) ?? initial) + (left + (anchoredRow - left) * progress - initial);
    }
    return left + (target - left) * progress;
  }

  function rowPosition(id: string, order: readonly string[] = depthOrder()): number {
    return rowLayouts().get(order.join(' '))?.get(id) ?? 0;
  }

  /** Distribute exposed rear sheets up to the held card and clear its content below. */
  function offsetUnits(id: string) {
    const grab = interruptedGrab();
    const current = free.dragging() && grab ? (grab.rows.get(id) ?? 0) : rowPosition(id);
    if (free.dragging() && grab && gesture.offset() > 0) {
      const spread = Math.max(grab.spread / pixelUnit(), (props.tabHeight ?? 6) * 2);
      const distance = gesture.offset() / pixelUnit();
      const progress = grab.compact ? Math.min(1, distance / spread) : 1;
      const heldRow = grab.rows.get(grab.id) ?? 0;
      const heldPosition = grab.position + distance;
      if (grab.order.indexOf(id) > grab.order.indexOf(grab.id)) {
        // Grow a real content preview, capped at half the deck's height.
        const height = size.clientHeight || tablist()?.clientHeight || 868;
        const preview = Math.min(distance, Math.max((props.tabHeight ?? 6) * 2, height / pixelUnit() / 2));
        return Math.max(current * progress, heldPosition + (current - heldRow) * progress + preview);
      }
      const exposed = [...grab.rows.keys()];
      const rank = exposed.indexOf(id);
      const heldRank = exposed.indexOf(grab.id);
      if (rank < 0 || heldRank <= 0) return current * progress;
      const evenlySpaced = (rank / heldRank) * heldPosition;
      // Blend out the resting collision layout, using fixed ranks so sorting
      // cannot send a sheet up and down while the pointer stays at the same y.
      const unfold = Math.min(1, distance / ((props.tabHeight ?? 6) * 2));
      return current * progress + (evenlySpaced - current * progress) * unfold;
    }
    return current * (1 - collapseProgress());
  }

  function navigate(event: KeyboardEvent, index: number) {
    const items = compactItems();
    const current = items.findIndex((item) => item.id === props.items[index]?.id);
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (current + 1) % items.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (current - 1 + items.length) % items.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = items.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const item = items[next];
    if (!item) return;
    select(item.id);
    triggers.get(item.id)?.focus({ preventScroll: true });
  }
}
