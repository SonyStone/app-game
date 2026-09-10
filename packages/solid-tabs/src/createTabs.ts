import { createElementSize } from '@solid-primitives/resize-observer';
import type { JSX } from '@solidjs/web';
import { createEffect, createMemo, createSignal, createUniqueId, untrack } from 'solid-js';
import { fitTabSlots, reorderTab, tabRows } from './layout';
import { createFreeDrag } from './primitives/createFreeDrag';
import { createHorizontalRail } from './primitives/createHorizontalRail';
import { createTabMotion } from './primitives/createTabMotion';
import { createVerticalGesture, type VerticalGesture } from './primitives/createVerticalGesture';
import styles from './Tabs.module.css';

/** Stable identity; labels, visuals and application data belong to the caller. */
export type TabItem = { id: string };

/** Reactive inputs for a deck. IDs must be unique and stable for its mounted lifetime. */
export type TabsOptions<T extends TabItem> = {
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
  /** Reserve content for native scrolling, restricting deck drags to handles. Defaults true. */
  scrollableContent?: boolean;
};

/**
 * Owns selection, independent rail sorting, interruptible motion and pointer lifetime.
 * Create under a Solid owner. Render with Tabs or bind the returned part props once
 * to the corresponding native elements and preserve their generated module classes.
 * All real panels stay mounted; outgoing echoes are inert DOM snapshots.
 */
export function createTabs<T extends TabItem>(props: TabsOptions<T>) {
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
  type MovingCard = { id: string; start: number };
  type Transition =
    | { phase: 'departing'; cards: readonly MovingCard[]; complete: () => void; order: readonly string[] }
    | { phase: 'returning'; cards: readonly MovingCard[] };
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
    spread: number;
    compact: boolean;
    rail: number;
    /** Pointer travel needed to move the handle into the bottom edge area. */
    advanceAfter: number;
  };
  const [interruptedGrab, setInterruptedGrab] = createSignal<Grab>();
  const [promoted, setPromoted] = createSignal(false);
  const [passed, setPassed] = createSignal(false);
  const [railDrag, setRailDrag] = createSignal(0);
  let previousPointerX = 0;
  const [tabOrder, setTabOrder] = createSignal<readonly string[]>(
    untrack(() => [...(props.initialTabOrder ?? props.items.map((item) => item.id))])
  );
  const [slots, setSlots] = createSignal<readonly number[]>(
    untrack(() => props.items.map((_, index) => index / Math.max(1, props.items.length - 1)))
  );
  const rowLayouts = createMemo(() => {
    const positions = new Map(tabOrder().map((id) => [id, stackLeftId(id)]));
    const width = tabWidth();
    const depth = [...depthOrder()];
    return new Map(
      depth.map((_, index) => {
        const order = [...depth.slice(index), ...depth.slice(0, index)];
        return [order.join(' '), tabRows(order, (id) => positions.get(id) ?? 0, width, props.tabHeight ?? 6)];
      })
    );
  });
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
  const pulledRearTab = () => {
    if (!gesture.dragging() || passed() || gesture.offset() <= 24) return;
    const origin = gesture.startTarget();
    const id =
      origin instanceof Element ? origin.closest<HTMLElement>('[data-tabs-trigger]')?.dataset.tabsTrigger : undefined;
    return id && id !== activeId() && depthOrder().includes(id) ? id : undefined;
  };
  const selectionProgress = () => Math.min(1, Math.abs(gesture.offset()) / Math.max(90, travel()));
  const revealedId = () => {
    const current = transition();
    return current?.phase === 'departing'
      ? current.order.at(-1)
      : (pulledRearTab() ?? (dragOffset() > 0 ? depthOrder().at(-2) : undefined));
  };
  const shiftProgress = () =>
    transition()?.phase === 'departing' ? 1 : Math.min(1, dragOffset() / Math.max(1, widthUnit() * 22));
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

  // Keep the selected tab visible when the responsive breakpoint changes its width.
  createEffect(tabWidth, () =>
    untrack(() => {
      if (collapsed()) rail.reveal(railLeft(activeId() ?? ''));
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

  // Promotion waits until all covering sheets have physically cleared the held tab.
  // It does not wait for pointer-up, so the same pull can continue to the next sheet.
  createEffect(
    () => ({ dragging: free.dragging(), y: free.position().y, positions: verticalMotion() }),
    (state) => {
      untrack(() => {
        const grab = interruptedGrab();
        if (!state.dragging || !grab) return;
        if (state.y <= 12) {
          if (promoted() || passed()) commitSelection(grab.order.at(-1)!);
          setPromoted(false);
          setPassed(false);
          return;
        }
        const covers = grab.order.slice(grab.order.indexOf(grab.id) + 1);
        if (
          !promoted() &&
          !passed() &&
          covers.length &&
          state.y > 24 &&
          covers.every((id) => (state.positions.get(id) ?? 0) * pixelUnit() >= (size.clientHeight || 868))
        ) {
          commitSelection(grab.id);
          setPromoted(true);
        }
        if (!passed() && (promoted() || !covers.length) && state.y >= grab.advanceAfter) {
          commitCycle({ direction: 'down', offset: state.y });
          setPassed(true);
        }
      });
    }
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
    departingItems,
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
      onAnimationEnd: (event: AnimationEvent) => finishMotion(event, item.id),
      style: {
        '--rank': depthOrder().indexOf(item.id),
        '--exit-start': `${exitStart(item.id)}px`,
        '--offset': length(offsetUnits(item.id)),
        '--painted-offset': length(paintedRow(item.id)),
        '--card-drag-offset': `${paintedDrag(item.id)}px`,
        '--stack-delay': `${Math.max(0, props.items.length - 1 - depthOrder().indexOf(item.id)) * 33.333}ms`,
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
    }),
    echoProps: (item: T) => ({
      class: `${styles.card} ${styles.echo}`,
      'data-tabs-card': item.id,
      'data-tabs-echo': '',
      'aria-hidden': 'true' as const,
      inert: true,
      style: {
        '--offset': length(rearOffset(item.id) * (1 - collapseProgress())),
        '--left': `${tabTarget(item)}%`,
        'z-index': echoRank(item.id)
      } as JSX.CSSProperties
    }),
    /** Snapshot once without mounting application effects a second time. */
    snapshot: (id: string, element: HTMLElement) => {
      queueMicrotask(() => {
        if (!element.isConnected) return;
        const source = panels.get(id);
        if (!source) return;
        const copy = source.cloneNode(true) as HTMLElement;
        copy.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
        element.replaceChildren(...copy.childNodes);
      });
    }
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

  function fieldSpan() {
    return Math.max(1, 94 - tabWidth());
  }

  function stackLeftId(id: string) {
    return 3 + (slots()[tabOrder().indexOf(id)] ?? 0) * fieldSpan();
  }

  /** Capture both painted axes, including unfinished RAF and CSS motion. */
  function startDrag(target: EventTarget | null) {
    const painted = interruptMotion() ?? verticalMotion();
    const id =
      (target instanceof Element
        ? target.closest<HTMLElement>('[data-tabs-trigger]')?.dataset.tabsTrigger
        : undefined) ?? activeId();
    setPromoted(false);
    setPassed(false);
    setRailDrag(0);
    previousPointerX = 0;
    const tabs = [...tabOrder()];
    const fractions =
      collapsed() && id
        ? fitTabSlots(
            tabs.map(
              (_, index) =>
                ((tabMotion().get(id) ?? 3) - 3) / fieldSpan() +
                (index - tabs.indexOf(id)) / Math.max(1, tabs.length - 1)
            )
          )
        : [...slots()];
    const field = new Map(tabs.map((id, index) => [id, 3 + fractions[index]! * fieldSpan()]));
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
    if (result.cancelled || Math.abs(result.y) < 24) {
      if (promoted() || passed()) commitSelection(grab.order.at(-1)!);
    } else if (result.y < 0) {
      if (promoted() || passed()) commitSelection(grab.order.at(-1)!);
    } else {
      const atBottom = result.y >= grab.advanceAfter;
      if (!passed() && atBottom) {
        if (grab.id === activeId()) commitCycle({ direction: 'down', offset: result.y });
        else select(grab.order.at(grab.order.indexOf(grab.id) - 1)!);
      } else if (!passed() && !promoted() && grab.id !== activeId()) select(grab.id);
    }
    // Preserve physical slot positions and the held x after sorting. Depth stays
    // controlled by depthOrder(); rearranging the list never selects another sheet.
    if (!result.cancelled) {
      const order = finalOrder;
      const nextSlots = grab.slots.map((value) => value + shared / widthUnit() / fieldSpan());
      const heldIndex = order.indexOf(grab.id);
      if (heldIndex >= 0) nextSlots[heldIndex] = ((painted.get(grab.id) ?? grab.left) - 3) / fieldSpan();
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
    return offsetUnits(id) + cardDragOffset(id) / pixelUnit();
  }

  /** Cancel the superseded selection, retaining every wrapper's painted coordinates. */
  function interruptMotion() {
    const current = transition();
    if (!current) return;
    const painted = new Map(verticalMotion());
    // At least the selection target is outside the exit/return batch. Its position
    // resolves the shared CSS stack inset, including responsive units and safe areas.
    const anchor = props.items.find((item) => !current.cards.some((card) => card.id === item.id));
    const anchorElement = anchor && panels.get(anchor.id)?.parentElement;
    if (anchor && anchorElement) {
      const inset = anchorElement.getBoundingClientRect().top - (painted.get(anchor.id) ?? 0) * pixelUnit();
      for (const { id } of current.cards) {
        const element = panels.get(id)?.parentElement;
        if (element) painted.set(id, (element.getBoundingClientRect().top - inset) / pixelUnit());
      }
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
    // All cards in front of the target leave and return as one batch.
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
    const cards = front.map((id) => ({
      id,
      start: (panels.get(id)?.parentElement?.getBoundingClientRect().top ?? top) - top
    }));
    completed.clear();
    setTransition({ phase: 'departing', cards, complete, order });
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
      setTransition({ phase: 'returning', cards: current.cards });
      current.complete();
    } else {
      setTransition(undefined);
      continueSelection(selectionTarget());
    }
  }

  function motionClass(id: string) {
    const current = transition();
    return current?.cards.some((card) => card.id === id) ? `is-${current.phase}` : '';
  }

  function exitStart(id: string) {
    const current = transition();
    return current?.phase === 'departing' ? (current.cards.find((card) => card.id === id)?.start ?? 0) : 0;
  }

  function departingItems() {
    const current = transition();
    return current?.phase === 'departing'
      ? props.items.filter((item) => current.cards.some((card) => card.id === item.id))
      : [];
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

  function rearOffset(id: string) {
    const current = transition();
    return current?.phase === 'departing' ? rowPosition(id, current.order) : 0;
  }

  function echoRank(id: string) {
    const current = transition();
    return current?.phase === 'departing' ? current.order.indexOf(id) - current.cards.length : -1;
  }

  /** Preview selection without changing order, so reversing the pointer restores every card. */
  function cardDragOffset(id: string) {
    if (transition()) return 0;
    const target = pulledRearTab();
    if (!target) return id === activeId() ? dragOffset() : 0;
    if (id === target) {
      const unit = pixelUnit();
      const row = rowPosition(id) * unit;
      const initial = collapsed() ? 0 : row;
      return Math.max(0, initial + gesture.offset()) - row * (1 - collapseProgress());
    }
    if (depthOrder().indexOf(id) > depthOrder().indexOf(target)) {
      // All covering cards move together, with enough separation to uncover the pulled sheet.
      return (size.clientHeight || 868) + 8 * pixelUnit();
    }
    return 0;
  }

  function offsetUnits(id: string) {
    const current = rowPosition(id);
    const front = activeId();
    const motion = transition();
    const target = pulledRearTab();
    const index = target ? depthOrder().indexOf(target) : -1;
    const future =
      motion?.phase === 'departing'
        ? motion.order
        : target
          ? [...depthOrder().slice(index + 1), ...depthOrder().slice(0, index + 1)]
          : front
            ? [front, ...depthOrder().slice(0, -1)]
            : depthOrder();
    const shift = target
      ? depthOrder().indexOf(id) < index
        ? (rowPosition(id, future) - current) * selectionProgress()
        : 0
      : id === front
        ? 0
        : (rowPosition(id, future) - current) * shiftProgress();
    return (current + shift) * (1 - collapseProgress());
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
