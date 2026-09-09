import { createElementSize } from '@solid-primitives/resize-observer';
import type { JSX } from '@solidjs/web';
import { createEffect, createMemo, createSignal, For, untrack } from 'solid-js';
import { createFreeDrag } from './createFreeDrag';
import { createHorizontalRail } from './createHorizontalRail';
import { createTabMotion } from './createTabMotion';
import { createVerticalGesture, type VerticalGesture } from './createVerticalGesture';
import { fitFolderSlots, folderRows, reorderTab } from './folderLayout';
import ArrowRightIcon from './icons/arrow-right.svg';
import FolderTabShape from './icons/folder-tab.svg';

/** A folder's stable identity, accessible label, color, and initial rail order. */
export type Folder = {
  id: string;
  number: string;
  name: string;
  detail: string;
  color: string;
  dark: boolean;
  /** Initial spatial ordering hint. Expanded positions are distributed across the available width. */
  left: number;
};

/**
 * Controlled folder deck. The last ID in `order` is open; all panels stay mounted.
 * Arrow keys, Home, and End select and focus tabs in their visible order.
 * Selection moves all intervening cards behind the target in one concurrent batch.
 * A free drag interrupts that batch at its painted positions, replacing any
 * pending selection. Already committed order is retained when return motion is interrupted.
 * Consumers must update `order` synchronously. Upward gestures collapse the current
 * deck into a tab strip without selecting another card; downward gestures expand it
 * and select the pulled rear card. Continuing to the lower edge reveals the card underneath.
 * Horizontal dragging sorts the expanded list independently of depth; neighbors make room.
 * Both coordinates remain live during a gesture; reversing or cancelling restores selection.
 * Each folder has one animated wrapper containing its tab and panel. The tablist owns
 * the buttons through aria-owns while the panel keeps its separate accessibility role.
 * The child's `next` callback shares the gesture transition sequence.
 */
export function FolderStack<T extends Folder>(props: {
  items: readonly T[];
  /** Pixel scale for the 30 × 6 tab and its stack offsets; omitted in the scaled preview. */
  geometryUnit?: number | undefined;
  /** Initial layout only; route changes preserve the live gesture state. */
  initiallyCollapsed?: boolean;
  /** Allows page scrolling over content, reserving vertical deck gestures for tabs. */
  scrollableContent?: boolean;
  order: readonly string[];
  onSelect: (id: string) => void;
  onGesture: (gesture: VerticalGesture) => void;
  children: (item: T, active: () => boolean, next: () => void) => JSX.Element;
}) {
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
    untrack(() => [...props.items].sort((a, b) => a.left - b.left).map((item) => item.id))
  );
  const [slots, setSlots] = createSignal<readonly number[]>(
    untrack(() => props.items.map((_, index) => index / Math.max(1, props.items.length - 1)))
  );
  const rowLayouts = createMemo(() => {
    const positions = new Map(tabOrder().map((id) => [id, stackLeftId(id)]));
    const width = tabWidth();
    const depth = [...props.order];
    return new Map(
      depth.map((_, index) => {
        const order = [...depth.slice(index), ...depth.slice(0, index)];
        return [order.join(' '), folderRows(order, (id) => positions.get(id) ?? 0, width)];
      })
    );
  });
  const panels = new Map<string, HTMLElement>();
  const activeId = () => props.order.at(-1);
  const free = createFreeDrag({
    target: tablist,
    accepts: (target) =>
      target instanceof Element &&
      !target.closest('input, textarea, select, [contenteditable="true"], .search-panel, .rail-controls') &&
      (!props.scrollableContent || isRailTab(target)),
    onStart: startDrag,
    onFinish: finishDrag
  });
  // Wheel gestures share layout commands, but never compete for pointer ownership.
  createVerticalGesture(
    tablist,
    commitGesture,
    () => !free.dragging(),
    (event) => (!props.scrollableContent || isRailTab(event.target)) && (!collapsed() || !isRailTab(event.target)),
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
    const id = origin instanceof Element ? origin.closest('.folder-tab')?.id.replace('tab-', '') : undefined;
    return id && id !== activeId() && props.order.includes(id) ? id : undefined;
  };
  const selectionProgress = () => Math.min(1, Math.abs(gesture.offset()) / Math.max(90, travel()));
  const revealedId = () => {
    const current = transition();
    return current?.phase === 'departing'
      ? current.order.at(-1)
      : (pulledRearTab() ?? (dragOffset() > 0 ? props.order.at(-2) : undefined));
  };
  const shiftProgress = () =>
    transition()?.phase === 'departing'
      ? 1
      : Math.min(1, dragOffset() / Math.max(1, widthUnit() * 22));
  const compactItems = createMemo(() =>
    tabOrder().flatMap((id) => {
      const item = props.items.find((candidate) => candidate.id === id);
      return item ? [item] : [];
    })
  );
  function tabWidth() {
    return props.geometryUnit ? ((30 * props.geometryUnit) / (size.clientWidth || 1000)) * 100 : 30;
  }
  function fieldSpan() {
    return Math.max(1, 94 - tabWidth());
  }
  function stackLeftId(id: string) {
    return 3 + (slots()[tabOrder().indexOf(id)] ?? 0) * fieldSpan();
  }
  const stackLeft = (item: T) => stackLeftId(item.id);
  const railLeft = (id: string) =>
    3 +
    Math.max(
      0,
      compactItems().findIndex((item) => item.id === id)
    ) *
      ((tabWidth() * 28) / 30);
  const railMax = () =>
    Math.max(0, 6 + (props.items.length - 1) * ((tabWidth() * 28) / 30) + tabWidth() - 100);
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
      const tab = stack?.querySelector<HTMLElement>('button.folder-tab');
      if (!stack || !tab) return rail.offset();
      return (
        railLeft(tab.id.replace('tab-', '')) -
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

  /** Capture both painted axes, including unfinished RAF and CSS motion. */
  function startDrag(target: EventTarget | null) {
    const painted = interruptMotion() ?? verticalMotion();
    const id =
      (target instanceof Element ? target.closest('.folder-tab')?.id.replace('tab-', '') : undefined) ?? activeId();
    setPromoted(false);
    setPassed(false);
    setRailDrag(0);
    previousPointerX = 0;
    const tabs = [...tabOrder()];
    const fractions =
      collapsed() && id
        ? fitFolderSlots(
            tabs.map(
              (_, index) =>
                ((tabMotion().get(id) ?? 3) - 3) / fieldSpan() + (index - tabs.indexOf(id)) / Math.max(1, tabs.length - 1)
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
            order: [...props.order],
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
    return Math.max(48, bottom - top - Math.max(48, (button?.height || 6 * pixelUnit()) * 2));
  }

  // Promotion waits until all covering sheets have physically cleared the held tab.
  // It does not wait for pointer-up, so the same pull can continue to the next sheet.
  createEffect(
    () => ({ dragging: free.dragging(), y: free.position().y, positions: verticalMotion() }),
    (state) => {
      untrack(() => {
        const grab = interruptedGrab();
        if (!state.dragging || !grab) return;
        if (state.y <= 12) {
          if (promoted() || passed()) props.onSelect(grab.order.at(-1)!);
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
          props.onSelect(grab.id);
          setPromoted(true);
        }
        if (!passed() && (promoted() || !covers.length) && state.y >= grab.advanceAfter) {
          props.onGesture({ direction: 'down', offset: state.y });
          setPassed(true);
        }
      });
    }
  );

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
      if (promoted() || passed()) props.onSelect(grab.order.at(-1)!);
    } else if (result.y < 0) {
      if (promoted() || passed()) props.onSelect(grab.order.at(-1)!);
    } else {
      const atBottom = result.y >= grab.advanceAfter;
      if (!passed() && atBottom) {
        if (grab.id === activeId()) props.onGesture({ direction: 'down', offset: result.y });
        else select(grab.order.at(grab.order.indexOf(grab.id) - 1)!);
      } else if (!passed() && !promoted() && grab.id !== activeId()) select(grab.id);
    }
    // Preserve physical slot positions and the held x after sorting. Depth stays
    // controlled by props.order; rearranging the list never selects another sheet.
    if (!result.cancelled) {
      const order = finalOrder;
      const nextSlots = grab.slots.map((value) => value + shared / widthUnit() / fieldSpan());
      const heldIndex = order.indexOf(grab.id);
      if (heldIndex >= 0) nextSlots[heldIndex] = ((painted.get(grab.id) ?? grab.left) - 3) / fieldSpan();
      setSlots(fitFolderSlots(nextSlots));
    }
    if (nextCompact && !result.cancelled) {
      const anchor = 3 + finalOrder.indexOf(grab.id) * ((tabWidth() * 28) / 30) - (painted.get(grab.id) ?? grab.left);
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
    return target instanceof Element && Boolean(target.closest('button.folder-tab'));
  }

  function select(id: string) {
    if (!props.order.includes(id)) return;
    if (collapsed()) rail.reveal(railLeft(id));
    const target = id === activeId() ? undefined : id;
    setSelectionTarget(target);
    if (!transition()) continueSelection(target);
  }

  function continueSelection(target: string | undefined) {
    if (!target || target === activeId() || !props.order.includes(target)) {
      setSelectionTarget(undefined);
      return;
    }
    // All cards in front of the target leave and return as one batch.
    depart(target, () => props.onSelect(target));
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
    const tab = origin instanceof Element ? origin.closest<HTMLButtonElement>('button.folder-tab') : null;
    const requested = tab?.id.replace('tab-', '');
    if (requested && requested !== activeId() && props.order.includes(requested)) {
      // Resolve the tab where the gesture started, not the stack that later captures it.
      select(requested);
      setCollapsed(false);
      return;
    }
    if (collapsed()) {
      const remaining = motion.offset - travel();
      // A single held pull may pass through the expanded pose and continue offscreen.
      if (remaining >= Math.max(36, Math.min(90, (tablist()?.clientHeight ?? 0) * 0.09))) {
        depart(props.order.at(-2), () => props.onGesture({ direction: 'down', offset: remaining }));
      }
      setCollapsed(false);
    } else {
      depart(props.order.at(-2), () => props.onGesture(motion));
    }
  }

  function next() {
    if (!transition()) depart(props.order.at(-2), () => props.onGesture({ direction: 'down', offset: 0 }));
  }

  function depart(target: string | undefined, complete: () => void) {
    const index = target ? props.order.indexOf(target) : -1;
    if (index < 0 || index === props.order.length - 1) return;
    const front = props.order.slice(index + 1);
    const order = [...front, ...props.order.slice(0, index + 1)];
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
    const expected = current.phase === 'departing' ? 'folder-exit' : 'folder-return';
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
        ? 3 + grab.tabs.indexOf(item.id) * ((tabWidth() * 28) / 30) - grab.rail
        : (grab.field.get(item.id) ?? left);
      const anchoredRow =
        railLeft(item.id) - railLeft(grab.id) + grab.left + (free.position().x - railDrag()) / widthUnit();
      return (grab.lefts.get(item.id) ?? initial) + (left + (anchoredRow - left) * progress - initial);
    }
    return left + (target - left) * progress;
  }

  function rowPosition(id: string, order: readonly string[] = props.order): number {
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
    if (props.order.indexOf(id) > props.order.indexOf(target)) {
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
    const index = target ? props.order.indexOf(target) : -1;
    const future =
      motion?.phase === 'departing'
        ? motion.order
        : target
          ? [...props.order.slice(index + 1), ...props.order.slice(0, index + 1)]
          : front
            ? [front, ...props.order.slice(0, -1)]
            : props.order;
    const shift = target
      ? props.order.indexOf(id) < index
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
    tablist()?.querySelector<HTMLButtonElement>(`#tab-${item.id}`)?.focus({ preventScroll: true });
  }

  return (
    <div
      class={`folder-stack ${gesture.dragging() ? 'is-dragging' : ''} ${rail.direct() || free.dragging() ? 'is-rail-direct' : ''}`}
      ref={setTablist}
      style={{
        '--drag-offset': `${dragOffset()}px`,
        '--collapse': collapseProgress(),
        '--tab-width': length(30),
        '--deck-unit': props.geometryUnit ? `${props.geometryUnit}px` : '1cqw',
        '--front-offset': length(rowPosition(activeId() ?? '') * (1 - collapseProgress())),
        // Every panel is ready at the rail's full height before it is uncovered.
        '--extra-height': `${rowPosition(activeId() ?? '') * collapseProgress()}cqw`
      }}
      data-motion={transition()?.phase ?? 'idle'}
      data-layout={collapsed() ? 'compact' : 'stacked'}
      data-selection-target={selectionTarget()}
      data-tab-order={tabOrder().join(' ')}
      data-rail-offset={rail.offset()}
      data-stack-pan={free.dragging() ? -railDrag() / widthUnit() : 0}
    >
      <div class="rail-controls" aria-label="Scroll folders" inert={!collapsed()}>
        <button
          aria-label="Scroll folders left"
          disabled={rail.offset() <= 0}
          onClick={() => rail.scrollBy(-56)}
        >
          <ArrowRightIcon class="rail-arrow-left" aria-hidden="true" />
        </button>
        <button
          aria-label="Scroll folders right"
          disabled={rail.offset() >= railMax()}
          onClick={() => rail.scrollBy(56)}
        >
          <ArrowRightIcon aria-hidden="true" />
        </button>
      </div>
      <div
        class="folder-tabs"
        role="tablist"
        aria-label="Creative folders"
        aria-owns={tabOrder()
          .map((id) => `tab-${id}`)
          .join(' ')}
      />
      <For each={props.items}>
        {(item, index) => {
          const rank = () => props.order.indexOf(item.id);
          const active = () => activeId() === item.id;
          return (
            <div
              class={`folder-card ${revealedId() === item.id ? 'is-revealed' : ''} ${item.dark ? 'is-dark' : ''} ${active() ? 'is-active' : ''} ${motionClass(item.id)}`}
              data-folder={item.id}
              onAnimationEnd={(event) => finishMotion(event, item.id)}
              style={{
                '--rank': rank(),
                '--exit-start': `${exitStart(item.id)}px`,
                '--offset': length(offsetUnits(item.id)),
                '--painted-offset': length(paintedRow(item.id)),
                '--card-drag-offset': `${paintedDrag(item.id)}px`,
                '--stack-delay': `${Math.max(0, props.items.length - 1 - rank()) * 33.333}ms`,
                '--left': `${tabTarget(item)}%`,
                '--folder-color': item.color,
                'z-index': rank() + 1
              }}
            >
              <button
                id={`tab-${item.id}`}
                class="folder-tab"
                style={{ '--painted-left': `${(tabMotion().get(item.id) ?? item.left) + horizontalShift(item.id)}cqw` }}
                role="tab"
                aria-label={`${item.number} ${item.name} ${item.detail}`}
                title={`${item.name} ${item.detail}`}
                aria-controls={`panel-${item.id}`}
                aria-selected={active() ? 'true' : 'false'}
                tabindex={active() ? 0 : -1}
                onFocus={() => {
                  if (collapsed()) rail.reveal(railLeft(item.id));
                }}
                onClick={() => select(item.id)}
                onKeyDown={(event) => navigate(event, index())}
              >
                <FolderTabShape class="tab-shape" aria-hidden="true" />
                <span class="tab-number">{item.number}</span>
                <span class="tab-label">
                  <span class="tab-name">{item.name}</span>
                  <span class="tab-detail">{item.detail}</span>
                </span>
              </button>
              <section
                ref={(element) => panels.set(item.id, element)}
                id={`panel-${item.id}`}
                class="folder-sheet"
                role="tabpanel"
                aria-labelledby={`tab-${item.id}`}
                aria-hidden={active() ? 'false' : 'true'}
                inert={!active()}
                tabindex={active() ? 0 : -1}
              >
                {props.children(item, active, next)}
              </section>
            </div>
          );
        }}
      </For>
      <For each={departingItems()}>
        {(item) => (
          <div
            class={`folder-card folder-echo ${item.dark ? 'is-dark' : ''}`}
            aria-hidden="true"
            inert
            style={{
              '--folder-color': item.color,
              '--offset': length(rearOffset(item.id) * (1 - collapseProgress())),
              '--left': `${tabTarget(item)}%`,
              'z-index': echoRank(item.id)
            }}
          >
            <div
              class="folder-tab"
              style={{ '--painted-left': `${(tabMotion().get(item.id) ?? item.left) + horizontalShift(item.id)}cqw` }}
            >
              <FolderTabShape class="tab-shape" />
              <span class="tab-number">{item.number}</span>
              <span class="tab-label">
                <span class="tab-name">{item.name}</span>
                <span class="tab-detail">{item.detail}</span>
              </span>
            </div>
            <div
              class="folder-sheet"
              ref={(element) => {
                queueMicrotask(() => {
                  if (!element.isConnected) return;
                  const content = panels.get(item.id)?.querySelector('.folder-content')?.cloneNode(true);
                  if (!(content instanceof HTMLElement)) return;
                  content.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
                  element.append(content);
                });
              }}
            />
          </div>
        )}
      </For>
    </div>
  );
}
