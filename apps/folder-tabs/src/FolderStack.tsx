import { createMediaQuery } from '@solid-primitives/media';
import type { JSX } from '@solidjs/web';
import { createMemo, createSignal, For } from 'solid-js';
import { createHorizontalRail } from './createHorizontalRail';
import { createTabMotion } from './createTabMotion';
import { createVerticalGesture, type VerticalGesture } from './createVerticalGesture';
import ArrowRightIcon from './icons/arrow-right.svg';
import FolderTabShape from './icons/folder-tab.svg';

/** A folder's stable identity, accessible label, color, and staggered tab position. */
export type Folder = {
  id: string;
  number: string;
  name: string;
  detail: string;
  color: string;
  dark: boolean;
  /** Horizontal position in the expanded stack; the scrollable compact rail retains this left-to-right order and tab size. */
  left: number;
};

/**
 * Controlled folder deck. The last ID in `order` is open; all panels stay mounted.
 * Arrow keys, Home, and End select and focus tabs in their visible order.
 * Selection moves all intervening cards behind the target in one concurrent batch.
 * Consumers must update `order` synchronously. Upward gestures collapse the current
 * deck into a tab strip without selecting another card; downward gestures expand it.
 * Each folder has one animated wrapper containing its tab and panel. The tablist owns
 * the buttons through aria-owns while the panel keeps its separate accessibility role.
 * The child's `next` callback shares the gesture transition sequence.
 */
export function FolderStack<T extends Folder>(props: {
  items: readonly T[];
  order: readonly string[];
  onSelect: (id: string) => void;
  onGesture: (gesture: VerticalGesture) => void;
  children: (item: T, active: () => boolean, next: () => void) => JSX.Element;
}) {
  const [tablist, setTablist] = createSignal<HTMLDivElement>();
  // A batch changes order only after every outgoing wrapper has left the screen.
  type MovingCard = { id: string; start: number };
  type Transition =
    | { phase: 'departing'; cards: readonly MovingCard[]; complete: () => void; order: readonly string[] }
    | { phase: 'returning'; cards: readonly MovingCard[] };
  // Completion bookkeeping is not rendered; duplicate events must not finish a batch early.
  const completed = new Set<string>();
  const [transition, setTransition] = createSignal<Transition>();
  const [collapsed, setCollapsed] = createSignal(false);
  const [selectionTarget, setSelectionTarget] = createSignal<string>();
  const panels = new Map<string, HTMLElement>();
  const activeId = () => props.order.at(-1);
  const gesture = createVerticalGesture(
    tablist,
    commitGesture,
    () => !transition(),
    (event) => !collapsed() || !isRailTab(event.target)
  );
  const travel = () => Math.max(1, (rowPosition(activeId() ?? '') * (tablist()?.clientWidth ?? 0)) / 100);
  const collapseProgress = () => Math.min(1, Math.max(0, (collapsed() ? 1 : 0) - gesture.offset() / travel()));
  const dragOffset = () => (collapsed() ? 0 : Math.max(0, gesture.offset()));
  const revealedId = () => {
    const current = transition();
    return current?.phase === 'departing' ? current.order.at(-1) : dragOffset() > 0 ? props.order.at(-2) : undefined;
  };
  const shiftProgress = () =>
    transition()?.phase === 'departing'
      ? 1
      : Math.min(1, dragOffset() / Math.max(1, (tablist()?.clientWidth ?? 0) * 0.22));
  const compactItems = createMemo(() => [...props.items].sort((a, b) => a.left - b.left));
  const railLeft = (id: string) =>
    3 +
    Math.max(
      0,
      compactItems().findIndex((item) => item.id === id)
    ) *
      28;
  const railMax = () => Math.max(0, 6 + (props.items.length - 1) * 28 + 30 - 100);
  const centeredRail = () => Math.max(0, Math.min(railMax(), railLeft(activeId() ?? '') - 35));
  const rail = createHorizontalRail({
    target: tablist,
    enabled: () => collapsed() && !transition() && !gesture.dragging(),
    max: railMax,
    accepts: (target) =>
      target instanceof Element &&
      !target.closest('input, textarea, select, [contenteditable="true"], .search-panel, .rail-controls'),
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

  const reducedMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? createMediaQuery('(prefers-reduced-motion: reduce)')
      : () => false;
  const tabMotion = createTabMotion(
    () => props.items.map((item) => ({ id: item.id, x: tabTarget(item) })),
    () => (rail.direct() ? rail.offset() : undefined),
    reducedMotion
  );

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
    if (transition()) return;
    const origin = gesture.startTarget();
    const tab = origin instanceof Element ? origin.closest<HTMLButtonElement>('button.folder-tab') : null;
    const requested = tab?.id.replace('tab-', '');
    if (requested && requested !== activeId() && props.order.includes(requested)) {
      // Resolve the tab where the gesture started, not the stack that later captures it.
      select(requested);
      setCollapsed(motion.direction === 'up');
      return;
    }
    if (motion.direction === 'up') {
      rail.scrollTo(centeredRail());
      setCollapsed(true);
    } else if (collapsed()) {
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
    const target = railLeft(item.id) - (collapsed() ? rail.offset() : centeredRail());
    return item.left + (target - item.left) * collapseProgress();
  }

  function rowPosition(id: string, order: readonly string[] = props.order): number {
    const initial = props.items.map((item) => item.id);
    const first = initial.indexOf(order[0] ?? '');
    const cyclic =
      initial.length === 8 && order.every((item, index) => item === initial[(first + index) % initial.length]);
    const rank = order.indexOf(id);
    // Measured stable rows after each of the two downward moves in the supplied video.
    if (cyclic && first === initial.length - 1) {
      return [-2.6, 3.33, 4.93, 9.53, 11.53, 16.73, 18.93, 22.3][rank] ?? rowOffset(rank);
    }
    if (cyclic && first === initial.length - 2) {
      return [-2.4, 0, 6, 7.6, 12.2, 14.2, 19.4, 22.3][rank] ?? rowOffset(rank);
    }
    return rowOffset(rank);
  }

  function rearOffset(id: string) {
    const current = transition();
    return current?.phase === 'departing' ? rowPosition(id, current.order) : 0;
  }

  function echoRank(id: string) {
    const current = transition();
    return current?.phase === 'departing' ? current.order.indexOf(id) - current.cards.length : -1;
  }

  function offset(id: string) {
    const current = rowPosition(id);
    const front = activeId();
    const motion = transition();
    const future =
      motion?.phase === 'departing' ? motion.order : front ? [front, ...props.order.slice(0, -1)] : props.order;
    const shift = id === front ? 0 : (rowPosition(id, future) - current) * shiftProgress();
    return `${(current + shift) * (1 - collapseProgress())}cqw`;
  }

  function navigate(event: KeyboardEvent, index: number) {
    const items = collapsed() ? compactItems() : props.items;
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
      class={`folder-stack ${gesture.dragging() ? 'is-dragging' : ''} ${rail.direct() ? 'is-rail-direct' : ''}`}
      ref={setTablist}
      style={{
        '--drag-offset': `${dragOffset()}px`,
        '--collapse': collapseProgress(),
        // Every panel is ready at the rail's full height before it is uncovered.
        '--extra-height': `${rowOffset(props.items.length - 1) * collapseProgress()}cqw`
      }}
      data-motion={transition()?.phase ?? 'idle'}
      data-layout={collapsed() ? 'compact' : 'stacked'}
      data-selection-target={selectionTarget()}
      data-rail-offset={rail.offset()}
    >
      <div class="rail-controls" aria-label="Scroll folders" inert={!collapsed()}>
        <button aria-label="Scroll folders left" disabled={rail.offset() <= 0} onClick={() => rail.scrollBy(-56)}>
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
        aria-owns={props.items.map((item) => `tab-${item.id}`).join(' ')}
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
                '--offset': offset(item.id),
                '--stack-delay': `${Math.max(0, props.items.length - 1 - rank()) * 33.333}ms`,
                '--left': `${tabTarget(item)}%`,
                '--painted-left': `${tabMotion().get(item.id) ?? item.left}cqw`,
                '--folder-color': item.color,
                'z-index': rank() + 1
              }}
            >
              <button
                id={`tab-${item.id}`}
                class="folder-tab"
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
              '--offset': `${rearOffset(item.id) * (1 - collapseProgress())}cqw`,
              '--left': `${tabTarget(item)}%`,
              '--painted-left': `${tabMotion().get(item.id) ?? item.left}cqw`,
              'z-index': echoRank(item.id)
            }}
          >
            <div class="folder-tab">
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

/** Paired rows leave more of each tab exposed, matching the reference's irregular rhythm. */
function rowOffset(rank: number) {
  return [0, 1.6, 6.2, 8.2, 13.4, 15.6, 20.4, 21.8][rank] ?? rank * 3.2;
}
