import { cn } from '@app-game/utils/cn';
import { makeEventListener } from '@solid-primitives/event-listener';
import { makeResizeObserver } from '@solid-primitives/resize-observer';
import type { JSX } from '@solidjs/web';
import {
  activePanelOf,
  createDockTab,
  Dock,
  DOCK_FLIP_ATTRIBUTE,
  DOCK_OVERLAY_Z_INDEX,
  type DockController,
  type DockDropTargetResolver,
  type DockGroupApi,
  type DockPanelView,
  type DockRect,
  type DockSashApi,
  findDropTarget,
  flipTransition,
  listGroups,
  rectStyle,
  useDock
} from 'solid-dock';
import { createEffect, createMemo, createSignal, createStore, onCleanup, Show } from 'solid-js';
import { CloseIcon, createDemoLayout, DemoButton, DemoSection } from './DemoDock';
import { CounterPanel, FilesPanel, NotesPanel, SketchPanel } from './demo-panels';

/**
 * Tabs without windows, after the `card-stack` notebook: every panel is a card
 * that draws its own tab, and the cards of a group lie on top of each other.
 * Tabs keep their horizontal order; depth is separate and rotates like a deck
 * when a card is chosen, the chosen card in front. A spread group steps its
 * cards down over whatever lies below it; one group is spread at a time, and it
 * gathers again when focus or a click goes elsewhere. Clicking the front tab
 * toggles the spread; clicking another tab chooses its card: the cards in front
 * drop away and return behind it.
 *
 * Dragging a tab first pulls on the stack: the card follows the pointer and the
 * cards behind stretch after it, while sideways movement sorts the tabs. A
 * release there keeps the new tab order and spreads the group (pulled down,
 * choosing the card) or gathers it (pulled up). Pulled out of the stack, the
 * card tears off into a floating card that drops like any tab, and the stack
 * gathers behind it.
 */
export function StackedTabsExample(): JSX.Element {
  const layout = createDemoLayout({
    row: [
      { group: ['files'] },
      { column: [{ group: ['notes', 'counter', 'sketch'] }, { group: ['ideas'] }], sizes: [3, 1] }
    ],
    sizes: [1, 2]
  });
  const [spacing, setSpacing] = createSignal(48);
  let notebook: Notebook | undefined;
  // No drops while a card is still tethered to its stack: the drag is a pull.
  const resolveDropTarget: DockDropTargetResolver = (point, subject, root, groups) =>
    notebook?.tethered() ? undefined : findDropTarget(point, subject, root, groups);

  return (
    <DemoSection
      title="Tabs inside panels"
      description="No group windows: each panel is a card with its own tab. Click a tab to bring its card forward; click the front tab or pull a tab down to fan the stack out over what lies below, pull up or click elsewhere to gather it. Drag a tab sideways to sort; pull it out of the stack and the card tears off, floats, and docks wherever you drop it."
      actions={
        <>
          <label class="flex items-center gap-2 text-xs text-neutral-700">
            Spread spacing
            <input
              type="range"
              min={16}
              max={120}
              step={4}
              value={spacing()}
              onInput={(event) => setSpacing(event.currentTarget.valueAsNumber)}
            />
            <span class="w-10 tabular-nums">{spacing()} px</span>
          </label>
          <DemoButton onClick={layout.reopen}>Reopen closed ({layout.closed().length})</DemoButton>
          <DemoButton onClick={layout.reset}>Reset layout</DemoButton>
        </>
      }
    >
      <Dock.Root
        state={layout.state}
        setState={layout.setState}
        transition={flipTransition({ duration: 200 })}
        resolveDropTarget={resolveDropTarget}
        class="h-[560px] overflow-hidden rounded-xl bg-neutral-100 p-2 text-neutral-800 [--dock-gap:8px]"
        panels={
          <>
            <Dock.Panel id="files" title="Files" minWidth={160}>
              <FilesPanel />
            </Dock.Panel>
            <Dock.Panel id="notes" title="Notes" closable>
              <NotesPanel />
            </Dock.Panel>
            <Dock.Panel id="counter" title="Counter" closable>
              <CounterPanel />
            </Dock.Panel>
            <Dock.Panel id="sketch" title="Sketch" closable>
              <SketchPanel />
            </Dock.Panel>
            <Dock.Panel id="ideas" title="Ideas" closable>
              <NotesPanel />
            </Dock.Panel>
          </>
        }
      >
        <NotebookLayers spacing={spacing()} onReady={(model) => (notebook = model)} />
        <Dock.DropIndicator class="rounded-[10px] border-2 border-dashed border-sky-500 bg-sky-500/10 transition-[transform,width,height] duration-100 ease-out" />
      </Dock.Root>
    </DemoSection>
  );
}

/**
 * Visible layers of the notebook dock. Creates the notebook model and hands it
 * to `onReady` once, so the root's drop resolver can read it.
 */
function NotebookLayers(props: { spacing: number; onReady: (notebook: Notebook) => void }): JSX.Element {
  const dock = useDock();
  const notebook = createNotebook(dock, () => props.spacing);
  const outlines = createOutlines();
  props.onReady(notebook);

  return (
    <>
      <Dock.Windows>{(group) => <TabListArea group={group} />}</Dock.Windows>
      <Dock.Panels>{(panel) => <CardPanel panel={panel} notebook={notebook} outlines={outlines} />}</Dock.Panels>
      <Dock.Sashes>{(sash) => <CardSash sash={sash} />}</Dock.Sashes>
    </>
  );
}

/** Value returned by {@link createNotebook}. */
type Notebook = ReturnType<typeof createNotebook>;

/**
 * Group-level state the cards share: the pull of a tab drag, card rows, tab
 * order with a live sorting preview, depth, the one spread group, and the
 * animations that keep cards from jumping.
 *
 * Depth is kept per group, back to front, apart from the tab order. Choosing a
 * card rotates it: the cards in front of the chosen one move to the back in the
 * same order, dropping below the stack and rising from beneath the chosen card.
 *
 * A tab drag starts tethered: `pull()` reports the pointer offset. The pulled
 * card moves with the pointer at its own depth, cards behind it stretch after
 * it, cards in front are pushed further so its tab stays in view, and sideways
 * movement sorts the tabs. Once the pointer leaves the stack (see
 * {@link tearsOff}) the card tears off and floats above everything; the cards
 * that were in front drop away and come back up, and the stack gathers. A torn
 * card released where nothing changes flies back to its place. A pointer press
 * or focus outside the spread group's cards (elements marked
 * `data-card-group`) gathers it.
 */
function createNotebook(dock: DockController, spacing: () => number) {
  const tabWidths = createTabWidths();
  const cards = new Map<string, HTMLElement>();
  const [spreadGroup, setSpreadGroup] = createSignal<string>();
  const [homing, setHoming] = createSignal<string>();

  const pull = createMemo((previous: Pull | undefined) => {
    const session = dock.drag.session();
    if (session?.subject.type !== 'panel') {
      return undefined;
    }

    const dx = session.point.x - session.origin.x;
    const dy = session.point.y - session.origin.y;
    const { panelId, groupId } = session.subject;
    const wasTorn = previous?.panelId === panelId && previous.torn;
    const point = dock.toRootPoint(session.point);
    const frame = dock.slots.frames[groupId];
    return { panelId, groupId, dx, dy, torn: wasTorn || tearsOff(dx, dy, point, frame) };
  });
  // The dock ends the session before it resolves the drop, so release decisions
  // read the pull as of the last move.
  let lastPull: Pull | undefined;
  // Row top of the pulled card without its pull, as of the last tethered move: a torn card floats from there.
  let restingOffset = 0;
  // Row tops of the pulled group as of the last tethered move: cards that drop away afterwards start from there.
  let pulledTops: { groupId: string; tops: ReadonlyMap<string, number> } | undefined;
  const [tornOffset, setTornOffset] = createSignal(0);
  // Where a torn card floated last and the layout it left, to fly it back when nothing changed.
  let floating: { panelId: string; rect: DOMRect; layout: string } | undefined;

  const panelsOf = (groupId: string): readonly string[] => {
    const node = dock.state.nodes[groupId];
    return node?.type === 'group' ? node.panels : [];
  };

  /** Left edge of a tab in `order`: the inset plus the widths and gaps of the tabs before it. */
  const leftIn = (order: readonly string[], panelId: string) => {
    const before = order.slice(0, Math.max(0, order.indexOf(panelId)));
    const widths = before.reduce((sum, id) => sum + (tabWidths.widths[id] ?? 0), 0);
    return TAB_INSET + widths + before.length * TAB_GAP;
  };

  /**
   * `order` with a tethered tab moved to where its centre has been dragged,
   * measured against the other tabs' resting centres.
   */
  const sortBy = (order: readonly string[], current: Pull | undefined) => {
    if (!current || current.torn || Math.abs(current.dx) < SORT_THRESHOLD || !order.includes(current.panelId)) {
      return order;
    }

    const width = (id: string) => tabWidths.widths[id] ?? 0;
    const centre = leftIn(order, current.panelId) + width(current.panelId) / 2 + current.dx;
    const others = order.filter((id) => id !== current.panelId);
    const index = others.findIndex((id) => centre < leftIn(order, id) + width(id) / 2);
    const at = index === -1 ? others.length : index;
    return [...others.slice(0, at), current.panelId, ...others.slice(at)];
  };

  /** Tab order of a group, previewing a tethered sort. */
  const tabOrder = (groupId: string) => {
    const current = pull();
    return sortBy(panelsOf(groupId), current?.groupId === groupId ? current : undefined);
  };

  /**
   * Back-to-front depth of every group. Panels that stay keep their depth, new
   * ones come in front, and the deck rotates so the active panel is in front.
   */
  const depths = createMemo((previous: Record<string, readonly string[]> | undefined) => {
    const next: Record<string, readonly string[]> = {};
    for (const groupId of listGroups(dock.state)) {
      const node = dock.state.nodes[groupId];
      if (node?.type !== 'group') {
        continue;
      }

      const active = activePanelOf(node);
      const kept = (previous?.[groupId] ?? rotateToFront(node.panels, active)).filter((id) => node.panels.includes(id));
      const added = node.panels.filter((id) => !kept.includes(id));
      next[groupId] = rotateToFront([...kept, ...added], active);
    }

    return next;
  });

  // Computed from the depth memo, not from the drawn stack: a store write inside an
  // effect is read back only after the next flush.
  const choreography = createDropAndReturn(cards, (groupId) => {
    const current = pull();
    const torn = current?.groupId === groupId && current.torn ? current.panelId : undefined;
    return {
      height: dock.slots.rects[groupId]?.height ?? 0,
      step: restingStep(groupId),
      depth: (depths()[groupId] ?? []).filter((id) => id !== torn)
    };
  });

  // A new front card with the same members is a choice: the cards in front of it drop away and return behind it.
  createEffect(depths, (next, previous) => {
    if (!previous) {
      return;
    }

    for (const [groupId, depth] of Object.entries(next)) {
      const before = previous[groupId];
      const chosen = depth.at(-1);
      if (!before || !chosen || before.at(-1) === chosen || !sameMembers(before, depth)) {
        continue;
      }

      const departing = before.slice(before.indexOf(chosen) + 1);
      const held = pulledTops?.groupId === groupId ? pulledTops.tops : undefined;
      choreography.play(groupId, before, departing, held && holdsOf(departing, held));
    }

    pulledTops = undefined;
  });

  /** Back-to-front order the cards are drawn in: the old depth while chosen cards drop away, minus a torn-off card. */
  const stack = (groupId: string): readonly string[] => {
    const playing = choreography.state[groupId];
    const order = playing?.phase === 'departing' ? playing.from : (depths()[groupId] ?? []);
    const current = pull();
    return current?.groupId === groupId && current.torn ? order.filter((id) => id !== current.panelId) : order;
  };

  /** Step between the rows of a resting group: the spread spacing, or none. */
  const restingStep = (groupId: string) => (stack(groupId).length > 1 && spreadGroup() === groupId ? spacing() : 0);

  /**
   * Top of a card's row. A tethered pull of `dy` moves the pulled card by `dy`;
   * cards behind it follow by a share that shrinks towards the back, and cards
   * in front are pushed further, so the pulled tab and some of its body show.
   * An upward pull closes the rows towards the back.
   */
  const cardTop = (groupId: string, panelId: string): number => {
    const playing = choreography.state[groupId];
    const held = playing?.phase === 'departing' ? playing.holds[panelId] : undefined;
    if (held !== undefined) {
      return held;
    }

    const order = stack(groupId);
    const rank = order.indexOf(panelId);
    const base = restingStep(groupId);
    const current = pull();
    if (rank === -1) {
      return 0;
    }

    if (!current || current.groupId !== groupId || current.torn) {
      return rank * base;
    }

    const pulled = order.indexOf(current.panelId);
    const dy = current.dy;
    if (rank === pulled) {
      return rank * base + dy;
    }

    if (dy < 0) {
      return Math.max(0, rank * (base + (dy * FOLLOW) / Math.max(1, order.length - 1)));
    }

    if (rank < pulled) {
      return rank * base + (dy * FOLLOW * rank) / pulled;
    }

    return rank * base + dy + (dy * FOLLOW * (rank - pulled)) / Math.max(1, order.length - 1 - pulled);
  };

  /** Lowest row top of a group's cards, leaving out a pulled card; with the group height, the stack's bottom. */
  const stackBottom = (groupId: string) => {
    const current = pull();
    const pulled = current?.groupId === groupId ? current.panelId : undefined;
    return Math.max(0, ...stack(groupId).flatMap((id) => (id === pulled ? [] : [cardTop(groupId, id)])));
  };

  const gather = (groupId: string) => {
    if (spreadGroup() === groupId) {
      setSpreadGroup(undefined);
    }
  };

  createEffect(pull, (next, previous) => {
    if (next) {
      lastPull = next;
      if (!next.torn) {
        restingOffset = cardTop(next.groupId, next.panelId) - next.dy;
        pulledTops = {
          groupId: next.groupId,
          tops: new Map(stack(next.groupId).map((id) => [id, cardTop(next.groupId, id)]))
        };
      } else if (!previous?.torn) {
        tear(next);
      }

      const box = next.torn ? cards.get(next.panelId)?.parentElement : undefined;
      if (box) {
        floating = { panelId: next.panelId, rect: box.getBoundingClientRect(), layout: floating?.layout ?? '' };
      }

      return;
    }

    if (previous?.torn) {
      // Effects run after the release has rendered. A drop that changed the
      // layout animates through `flipTransition` instead.
      flyHome(previous);
      return;
    }

    if (previous) {
      release(previous);
    }
  });

  /** A card tears off: the cards in front of it drop away and come back up, and the stack gathers. */
  function tear(torn: Pull): void {
    const depth = depths()[torn.groupId] ?? [];
    const departing = depth.slice(depth.indexOf(torn.panelId) + 1);
    const held = pulledTops?.groupId === torn.groupId ? pulledTops.tops : undefined;
    setTornOffset(restingOffset);
    floating = { panelId: torn.panelId, rect: new DOMRect(), layout: layoutKey(torn.panelId) };
    choreography.play(torn.groupId, depth, departing, held && holdsOf(departing, held));
    pulledTops = undefined;
    gather(torn.groupId);
  }

  /** Where a panel sits in the layout, to tell whether a drop moved it. */
  function layoutKey(panelId: string): string {
    const groupId = dock.panelGroup(panelId);
    return groupId === undefined ? '' : `${groupId}:${panelsOf(groupId).join(',')}`;
  }

  /**
   * Flies a torn card released where nothing changed from where it floated back
   * to its place: the card box, its tab and its body animate together, with
   * transitions and the stack clip off meanwhile (see `homing`).
   */
  function flyHome(released: Pull): void {
    const element = cards.get(released.panelId);
    const tabElement = element?.querySelector<HTMLElement>('[data-panel-id]');
    const body = tabElement?.nextElementSibling;
    const from = floating?.panelId === released.panelId ? floating : undefined;
    floating = undefined;
    if (
      !element ||
      !tabElement ||
      !(body instanceof HTMLElement) ||
      !from ||
      from.layout !== layoutKey(released.panelId)
    ) {
      return;
    }

    const box = element.parentElement;
    if (!box) {
      return;
    }

    const to = box.getBoundingClientRect();
    const base = getComputedStyle(box).transform;
    const moved = `translate(${from.rect.left - to.left}px, ${from.rect.top - to.top}px)`;
    const timing: KeyframeAnimationOptions = { duration: HOME_DURATION, easing: SETTLE_EASING };
    setHoming(released.panelId);
    const animations = [
      box.animate(
        [
          {
            transform: base === 'none' ? moved : `${moved} ${base}`,
            width: `${from.rect.width}px`,
            height: `${from.rect.height}px`
          },
          { transform: base, width: `${to.width}px`, height: `${to.height}px` }
        ],
        timing
      ),
      tabElement.animate(
        [
          { left: `${TAB_INSET}px`, top: '0px' },
          { left: tabElement.style.left, top: tabElement.style.top }
        ],
        timing
      ),
      body.animate(
        [
          { top: `${TAB_HEIGHT}px`, bottom: '0px' },
          { top: body.style.top, bottom: body.style.bottom }
        ],
        timing
      )
    ];
    void finished(animations).then(() => {
      if (homing() === released.panelId) {
        setHoming(undefined);
      }
    });
  }

  /**
   * Ends a tethered pull: keeps a new tab order, and a vertical pull spreads
   * the stack (choosing the pulled card when it was pulled far enough) or gathers it.
   */
  function release(released: Pull): void {
    const order = panelsOf(released.groupId);
    const sorted = sortBy(order, released);
    if (sorted.some((id, index) => id !== order[index])) {
      dock.update((draft) => {
        const node = draft.nodes[released.groupId];
        if (node?.type === 'group') {
          node.panels = [...sorted];
        }
      });
    }

    const front = depths()[released.groupId]?.at(-1);
    const chooses = released.dy >= CHOOSE_PULL && front !== released.panelId;
    if (released.dy >= PULL_COMMIT) {
      setSpreadGroup(released.groupId);
    } else if (released.dy <= -PULL_COMMIT) {
      gather(released.groupId);
    }

    if (chooses) {
      // The depth effect reads `pulledTops`: the cards in front drop from where the pull left them.
      dock.activate(released.panelId);
    } else {
      pulledTops = undefined;
    }
  }

  const gatherFromOutside = (event: Event) => {
    const groupId = spreadGroup();
    const target = event.target;
    if (groupId === undefined) {
      return;
    }

    if (!(target instanceof Element) || !target.closest(`[data-card-group="${CSS.escape(groupId)}"]`)) {
      setSpreadGroup(undefined);
    }
  };

  makeEventListener(document, 'pointerdown', gatherFromOutside, { capture: true });
  makeEventListener(document, 'focusin', gatherFromOutside);

  return {
    tabWidths,
    pull,
    /** Whether the current or just-released tab drag never tore off. */
    tethered: () => {
      const current = pull() ?? lastPull;
      return current !== undefined && !current.torn;
    },
    /** Tab order of a group as stored in the layout. */
    panelsOf,
    tabOrder,
    leftIn,
    stack,
    cardTop,
    stackBottom,
    /** Row top a torn card floats from: where it rested in its stack when it tore. */
    tornOffset,
    /** Whether a card is part of a running drop-and-return animation. */
    choreographed: (groupId: string, panelId: string) =>
      choreography.state[groupId]?.departing.includes(panelId) ?? false,
    /** Whether a torn card is flying back to its place. */
    homing: (panelId: string) => homing() === panelId,
    /** Registers the element that moves a card (inside its clipped box) for the animations; returns its release. */
    register: (panelId: string, element: HTMLElement) => {
      cards.set(panelId, element);
      return () => {
        if (cards.get(panelId) === element) {
          cards.delete(panelId);
        }
      };
    },
    /** Whether a group fans its cards out. */
    spread: (groupId: string) => spreadGroup() === groupId,
    /** Spreads a gathered group, gathers a spread one. */
    toggle: (groupId: string) => setSpreadGroup(spreadGroup() === groupId ? undefined : groupId),
    gather
  };
}

/** Offset of a tab drag from its grab point and whether it has torn off. */
type Pull = { panelId: string; groupId: string; dx: number; dy: number; torn: boolean };

/** Upward pointer travel at which a card tears off, in pixels. */
const TEAR_DISTANCE = 120;

/** Downward travel at which a card tears off; longer, so a downward pull can spread the stack first, in pixels. */
const TEAR_DISTANCE_DOWN = 280;

/** How far the pointer may leave the group sideways before the card tears off, in pixels. */
const TEAR_MARGIN = 24;

/**
 * Whether a pull leaves the stack: {@link TEAR_DISTANCE} up, {@link TEAR_DISTANCE_DOWN}
 * down, or past the group's sides by {@link TEAR_MARGIN}. Within the sides,
 * sideways movement sorts instead.
 */
function tearsOff(dx: number, dy: number, point: { x: number } | undefined, frame: DockRect | undefined): boolean {
  if (dy < -TEAR_DISTANCE || dy > TEAR_DISTANCE_DOWN) {
    return true;
  }

  if (!point || !frame) {
    return Math.abs(dx) > TEAR_DISTANCE;
  }

  return point.x < frame.x - TEAR_MARGIN || point.x > frame.x + frame.width + TEAR_MARGIN;
}

/** Sideways travel before a tethered tab starts sorting, in pixels. */
const SORT_THRESHOLD = 6;

/** Rotates `order` so `front` comes last, keeping the cyclic order: the deck's move when a card is chosen. */
function rotateToFront(order: readonly string[], front: string | undefined): string[] {
  const index = front === undefined ? -1 : order.indexOf(front);
  return index === -1 ? [...order] : [...order.slice(index + 1), ...order.slice(0, index + 1)];
}

/** Share of the pull the neighbouring cards add; below 1 they lag like a rubber band. */
const FOLLOW = 0.6;

/** Vertical pull that spreads (down) or gathers (up) a stack on release; shorter pulls keep it as it was, in pixels. */
const PULL_COMMIT = 24;

/** Downward pull on a card behind that also chooses it on release, in pixels. */
const CHOOSE_PULL = 48;

/** Held row tops of `departing` cards, taken from `tops`. */
function holdsOf(departing: readonly string[], tops: ReadonlyMap<string, number>): Record<string, number> {
  return Object.fromEntries(departing.map((id) => [id, tops.get(id) ?? 0]));
}

/** Time a torn card takes to fly back to its place, in milliseconds. */
const HOME_DURATION = 380;

/** A running drop-and-return animation of one group. */
type Choreography = {
  /** Depth drawn until the departing cards are gone. */
  from: readonly string[];
  /** Cards that drop away and come back, back to front. */
  departing: readonly string[];
  /** Row tops the departing cards keep until they are gone, so they fall from where they are. */
  holds: Record<string, number>;
  phase: 'departing' | 'returning';
};

/**
 * Drops cards below their stack and brings them back. Departing cards fall
 * front first, {@link EXIT_STAGGER} ms apart, from the row tops they are held
 * at (given, or their rows in `from`); then `from` stops being drawn and they rise into their
 * rows: from just beneath the nearest card that stays in front of them, hidden
 * by its body, or from below the group when none does. A new play in the same
 * group cancels the running one. Animates each card element's `translate` with
 * the Web Animations API.
 */
function createDropAndReturn(
  cards: ReadonlyMap<string, HTMLElement>,
  geometry: (groupId: string) => {
    height: number;
    /** Step between resting rows. */
    step: number;
    /** Back-to-front depth the cards return into. */
    depth: readonly string[];
  }
) {
  const [state, setState] = createStore<Record<string, Choreography>>({});
  const running = new Map<string, Animation[]>();

  async function run(
    groupId: string,
    from: readonly string[],
    departing: readonly string[],
    holds: Record<string, number> | undefined
  ): Promise<void> {
    running.get(groupId)?.forEach((animation) => animation.cancel());
    const frontFirst = [...departing].reverse();
    const start = geometry(groupId);
    const held = holds ?? Object.fromEntries(departing.map((id) => [id, from.indexOf(id) * start.step]));
    const lowest = Math.max((from.length - 1) * start.step, ...Object.values(held));
    setState((draft) => {
      draft[groupId] = { from, departing, holds: held, phase: 'departing' };
    });

    const exits = animate(frontFirst, (index) => ({
      keyframes: [{ translate: '0px 0px' }, { translate: `0px ${start.height + lowest + TAB_HEIGHT}px` }],
      timing: {
        duration: EXIT_DURATION + index * 20,
        delay: index * EXIT_STAGGER,
        easing: EXIT_EASING,
        fill: 'forwards'
      }
    }));
    running.set(groupId, exits);
    if (!(await finished(exits))) {
      return;
    }

    setState((draft) => {
      draft[groupId].phase = 'returning';
    });

    const end = geometry(groupId);
    const top = (panelId: string) => end.depth.indexOf(panelId) * end.step;
    const bottom = (end.depth.length - 1) * end.step;
    const returns = animate(frontFirst, (index, panelId) => {
      const rank = end.depth.indexOf(panelId);
      const cover = end.depth.findLast((id, coverRank) => coverRank > rank && !departing.includes(id));
      const origin =
        cover === undefined ? end.height + bottom + TAB_HEIGHT - top(panelId) : top(cover) + TAB_HEIGHT - top(panelId);
      return {
        keyframes: [{ translate: `0px ${origin}px` }, { translate: '0px 0px' }],
        timing: {
          duration: RETURN_DURATION + index * 20,
          delay: RETURN_DELAY + index * EXIT_STAGGER,
          easing: SETTLE_EASING,
          fill: 'backwards'
        }
      };
    });
    exits.forEach((animation) => animation.cancel());
    running.set(groupId, returns);
    if (!(await finished(returns))) {
      return;
    }

    running.delete(groupId);
    setState((draft) => {
      delete draft[groupId];
    });
  }

  function animate(
    panelIds: readonly string[],
    frame: (index: number, panelId: string) => { keyframes: Keyframe[]; timing: KeyframeAnimationOptions }
  ): Animation[] {
    return panelIds.flatMap((panelId, index) => {
      const element = cards.get(panelId);
      if (!element) {
        return [];
      }

      const { keyframes, timing } = frame(index, panelId);
      return [element.animate(keyframes, timing)];
    });
  }

  return {
    state,
    /**
     * Drops `departing` (back to front) below the group's stack and brings them
     * back, holding them at `holds` until they are gone; nothing to drop does nothing.
     */
    play: (groupId: string, from: readonly string[], departing: readonly string[], holds?: Record<string, number>) => {
      if (departing.length > 0) {
        void run(groupId, from, departing, holds);
      }
    }
  };
}

/** Whether every animation finished; `false` once any was cancelled. */
async function finished(animations: readonly Animation[]): Promise<boolean> {
  const results = await Promise.allSettled(animations.map((animation) => animation.finished));
  return results.every((result) => result.status === 'fulfilled');
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id) => right.includes(id));
}

/** Time a departing card takes to drop below the stack, in milliseconds. */
const EXIT_DURATION = 600;

/** Delay between departing cards, front first, in milliseconds. */
const EXIT_STAGGER = 40;

/** Slow start, strong acceleration: a card pulled out from under the hand. */
const EXIT_EASING = 'cubic-bezier(0.55, 0, 0.75, 0.2)';

/** Pause before the departed cards rise again, in milliseconds. */
const RETURN_DELAY = 80;

/** Time a departed card takes to rise into its row, in milliseconds. */
const RETURN_DURATION = 500;

/** Height of a card's tab, in pixels. */
const TAB_HEIGHT = 32;

/**
 * Distance of the first tab from the card's left edge, in pixels: the body's
 * 10 px corner radius plus the tab's 11 px outward corner, so the corner lands
 * on the straight top edge.
 */
const TAB_INSET = 22;

/** Space between neighbouring tabs, in pixels. */
const TAB_GAP = 2;

/** How long a card takes to ease to its row, in milliseconds. */
const SETTLE_DURATION = 450;

/** Delay between neighbouring cards easing to their rows, front first, in milliseconds. */
const SETTLE_STAGGER = 35;

/** Easing of cards settling into their rows, without overshoot. */
const SETTLE_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

/** Time a tab takes to slide to its place while sorting, in milliseconds. */
const SORT_DURATION = 200;

/** How long a covered card keeps rendering its content, in milliseconds. */
const HIDE_CONTENT_DELAY = 700;

/** Largest size of a torn-off card, in pixels. */
const FLOATING_CARD = { width: 360, height: 240 };

/**
 * z-indices per dock layer. Cards of one group need their own order, but the
 * dock gives a group a single panel layer, so every layer is multiplied by this
 * and a card adds its rank. Holds up to 15 cards per group, and up to 29 groups
 * before cards would reach the overlay z-index (1000).
 */
const Z_STRIDE = 16;

/** Card colours by panel id; the tab and body of a card share one. */
const CARD_COLORS: Record<string, string> = {
  files: '#e4ebe7',
  notes: '#dce8e1',
  counter: '#f3e5cf',
  sketch: '#dde3ef',
  ideas: '#ece0ee'
};

/** Outline colours of the cards that offer an outline; each card has its own. */
const CARD_OUTLINES: Record<string, string> = {
  notes: '#2f9e6b',
  sketch: '#6366f1'
};

/** Outline switches of the cards that offer one (see {@link CARD_OUTLINES}); outlines start on. */
function createOutlines() {
  const [off, setOff] = createStore<Record<string, boolean>>({});

  return {
    /** Whether a card has an outline switch. */
    offers: (panelId: string) => panelId in CARD_OUTLINES,
    /** Outline colour of a card, while its outline is on. */
    color: (panelId: string): string | undefined => (off[panelId] ? undefined : CARD_OUTLINES[panelId]),
    toggle: (panelId: string) =>
      setOff((draft) => {
        draft[panelId] = !draft[panelId];
      })
  };
}

/**
 * Widths of the rendered tabs keyed by panel id, kept current by one shared
 * observer. Observed elements must carry `data-panel-id`. Widths of closed
 * panels stay behind; offsets only read the panels of a group, so they are harmless.
 */
function createTabWidths() {
  const [widths, setWidths] = createStore<Record<string, number>>({});
  const observer = makeResizeObserver<HTMLElement>((entries) =>
    setWidths((draft) => {
      for (const entry of entries) {
        const panelId = entry.target.dataset.panelId;
        if (panelId !== undefined) {
          draft[panelId] = entry.target.offsetWidth;
        }
      }
    })
  );

  return { widths, observe: observer.observe, unobserve: observer.unobserve };
}

/**
 * One panel as a card in the round-out style: a tab whose outward rounded
 * corners flow into its body, even when a card in front hides that body; the
 * cards' layers keep the corners from covering other tabs. The tab sits at its
 * row (see `cardTop`) and at its place in the tab order; the body keeps the
 * group's height below it, so a spread stack runs past the group's bottom over
 * the groups below, lifted above them. Each card is clipped at the bottom of
 * its stack, so cards dropping away vanish there. Cards behind show a strip of
 * their body, content included while the stack is spread, pulled or moving;
 * clicking it chooses them. Fully covered cards keep their state but skip
 * rendering.
 *
 * Every card has a 1 px border around its tab, outward corners and body; it is
 * the card colour unless the card offers an outline, which also puts a switch
 * in the tab that turns it off without changing any size.
 *
 * A tethered card stays at its depth and moves by its `top` and `translate`,
 * not by its box, so on release it eases back from where it was let go. Torn
 * off, it floats above everything, shrunk to {@link FLOATING_CARD}.
 */
function CardPanel(props: {
  panel: DockPanelView;
  notebook: Notebook;
  outlines: ReturnType<typeof createOutlines>;
}): JSX.Element {
  const dock = useDock();
  const notebook = props.notebook;
  const tab = createDockTab(props.panel.id);
  const groupId = () => dock.panelGroup(props.panel.id);
  const pull = () => {
    const current = notebook.pull();
    return current && current.groupId === groupId() ? current : undefined;
  };
  const dragged = () => pull()?.panelId === props.panel.id;
  const torn = () => dragged() && pull()!.torn;
  const tethered = () => dragged() && !pull()!.torn;
  const homing = () => notebook.homing(props.panel.id);
  const spread = () => groupId() !== undefined && notebook.spread(groupId()!);
  const choreographed = () => groupId() !== undefined && notebook.choreographed(groupId()!, props.panel.id);

  const stack = () => (groupId() === undefined ? [] : notebook.stack(groupId()!));
  const rank = () => Math.max(0, stack().indexOf(props.panel.id));
  const front = () => torn() || rank() === stack().length - 1;
  const top = () => (groupId() === undefined ? 0 : notebook.cardTop(groupId()!, props.panel.id));

  /**
   * The tab's place in the tab order. A dragged tab keeps its resting place
   * and follows the pointer by `translate`, while the others preview the sort.
   */
  const left = () => {
    const id = groupId();
    if (id === undefined) {
      return TAB_INSET;
    }

    return notebook.leftIn(dragged() ? notebook.panelsOf(id) : notebook.tabOrder(id), props.panel.id);
  };

  const color = () => CARD_COLORS[props.panel.id] ?? '#ffffff';
  const outline = () => props.outlines.color(props.panel.id);

  /** Card box relative to the root: the group box, or the floating card once torn off. */
  const box = (): DockRect => {
    const rect = props.panel.rect() ?? EMPTY_RECT;
    const current = pull();
    if (!current || !torn()) {
      return rect;
    }

    const restingTop = notebook.tornOffset();
    return {
      x: rect.x + left() - TAB_INSET + current.dx,
      y: rect.y + restingTop + current.dy,
      width: Math.min(rect.width, FLOATING_CARD.width),
      height: Math.min(rect.height - restingTop, FLOATING_CARD.height)
    };
  };

  /** Tab and body offsets inside the card box; a torn-off card starts at its tab. */
  const tabLeft = () => (torn() ? TAB_INSET : left());
  const tabTop = () => (torn() ? 0 : top());

  const zIndex = () => {
    if (torn()) {
      return DOCK_OVERLAY_Z_INDEX + 1;
    }

    const id = groupId();
    if (id === undefined) {
      return undefined;
    }

    // A spread stack covers the groups below it, and a pulled card may cross its neighbours: both rise above every layer.
    const lifted = spread() || (pull() !== undefined && !pull()!.torn);
    const layer = lifted ? dock.layers.sash() + 1 : dock.layers.panel(id);
    return layer * Z_STRIDE + rank();
  };

  /**
   * Clips the card at the bottom of its stack, leaving everything above and
   * beside it: cards dropping away disappear there. A dragged or homing card is free.
   */
  const clip = () => {
    const id = groupId();
    if (dragged() || homing() || id === undefined) {
      return undefined;
    }

    const bottom = (props.panel.rect()?.height ?? 0) + notebook.stackBottom(id);
    return `polygon(-100vw -100vh, 200vw -100vh, 200vw ${bottom}px, -100vw ${bottom}px)`;
  };

  /**
   * Transitions of the tab and body. During a tethered pull the stack follows
   * the pointer directly and only sorting slides; otherwise cards ease to
   * their rows front first, each card behind starting {@link SETTLE_STAGGER} ms
   * later. A homing card moves by its own animation.
   */
  const settle = (): string | undefined => {
    if (dragged() || homing()) {
      return 'none';
    }

    // A card dropping away or returning moves by its animation; only its tab may still slide sideways.
    if ((pull() && !pull()!.torn) || choreographed()) {
      return `left ${SORT_DURATION}ms ${SETTLE_EASING}`;
    }

    const fromFront = stack().length - 1 - rank();
    const timing = `${SETTLE_DURATION}ms ${SETTLE_EASING} ${fromFront * SETTLE_STAGGER}ms`;
    return `top ${timing}, bottom ${timing}, left ${timing}`;
  };

  /** Whether any of the body can be seen: the front card, or any card of a spread, pulled or moving stack. */
  const showsContent = () => front() || tab.active() || spread() || pull() !== undefined || choreographed() || homing();

  // A card that becomes covered keeps rendering a while: another card may still be flying over it.
  const [contentHidden, setContentHidden] = createSignal(false);
  createEffect(showsContent, (shows) => {
    if (shows) {
      setContentHidden(false);
      return;
    }

    const timer = setTimeout(() => setContentHidden(true), HIDE_CONTENT_DELAY);
    return () => clearTimeout(timer);
  });

  // Pressing the tab of the front card and releasing without a drag toggles the spread.
  let pressedFront = false;

  let tabElement: HTMLElement | undefined;
  let release: (() => void) | undefined;
  onCleanup(() => {
    release?.();
    if (tabElement) {
      notebook.tabWidths.unobserve(tabElement);
    }
  });

  return (
    <div
      {...{ [DOCK_FLIP_ATTRIBUTE]: `panel:${props.panel.id}` }}
      data-card-group={groupId()}
      class={cn('pointer-events-none', torn() && 'drop-shadow-[0_14px_28px_rgb(0_0_0/0.28)]')}
      style={{
        ...rectStyle(box()),
        // A torn-off card shrinks into shape.
        transition: torn() ? 'width 150ms ease-out, height 150ms ease-out' : 'none',
        'clip-path': clip(),
        visibility: props.panel.rect() ? undefined : 'hidden',
        'z-index': zIndex()
      }}
    >
      {/* Moves the card inside its box, so the box's clip stays put: a pull, a drop, a return. */}
      <div
        ref={(element: HTMLElement) => {
          release = notebook.register(props.panel.id, element);
        }}
        class="absolute inset-0"
        style={{
          translate: tethered() ? `${pull()!.dx}px 0px` : '0px 0px',
          // A released tethered card slides back sideways.
          transition: dragged() ? 'none' : `translate ${SETTLE_DURATION}ms ${SETTLE_EASING}`
        }}
      >
        <div
          {...tab.props}
          ref={[
            tab.props.ref,
            (element: HTMLElement) => {
              tabElement = element;
              notebook.tabWidths.observe(element);
            }
          ]}
          id={tabId(props.panel.id)}
          data-panel-id={props.panel.id}
          onPointerDown={(event: PointerEvent) => {
            pressedFront = tab.active();
            tab.props.onPointerDown(event);
          }}
          onClick={() => {
            const id = groupId();
            if (pressedFront && id !== undefined) {
              notebook.toggle(id);
            }
          }}
          style={{
            ...tab.props.style,
            // Inline: the outward-corner utility makes its host `position: relative`.
            position: 'absolute',
            left: `${tabLeft()}px`,
            top: `${tabTop()}px`,
            height: `${TAB_HEIGHT + 1}px`,
            background: color(),
            '--un-outward-bg-color': color(),
            // Every card has the 1px border; without an outline it takes the card colour, so sizes never change.
            '--un-outward-border-width': '1px',
            '--un-outward-border-color': outline() ?? color(),
            transition: settle()
          }}
          class={cn(
            'outward-b-[10px] pointer-events-auto z-10 flex cursor-default items-center gap-2 px-3 text-sm font-medium whitespace-nowrap select-none',
            !front() && 'text-neutral-600 hover:text-neutral-900'
          )}
        >
          {tab.title()}
          <Show when={props.outlines.offers(props.panel.id)}>
            <OutlineSwitch
              on={outline() !== undefined}
              color={CARD_OUTLINES[props.panel.id]}
              onToggle={() => props.outlines.toggle(props.panel.id)}
            />
          </Show>
          <Show when={tab.closable()}>
            <span {...tab.closeProps} role="button" class="grid h-4 w-4 place-items-center rounded hover:bg-black/10">
              <CloseIcon />
            </span>
          </Show>
        </div>
        <div
          role="tabpanel"
          aria-labelledby={tabId(props.panel.id)}
          class={cn('pointer-events-auto absolute inset-x-0 rounded-[10px]', !front() && 'cursor-pointer')}
          style={{
            top: `${tabTop() + TAB_HEIGHT}px`,
            bottom: torn() ? '0px' : `${-tabTop()}px`,
            background: color(),
            border: `1px solid ${outline() ?? color()}`,
            transition: settle()
          }}
          onClick={() => front() || tab.activate()}
        >
          <div
            class="absolute inset-0 overflow-auto rounded-[10px]"
            style={{
              'content-visibility': contentHidden() ? 'hidden' : 'visible',
              'pointer-events': front() ? 'auto' : 'none'
            }}
          >
            {props.panel.content}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Small switch inside a tab. Swallows the press, so it neither drags the tab
 * nor chooses or spreads the card. `color` fills the track while on.
 */
function OutlineSwitch(props: { on: boolean; color: string; onToggle: () => void }): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.on ? 'true' : 'false'}
      aria-label="Outline"
      title="Outline"
      class="relative h-3.5 w-6 shrink-0 rounded-full transition-colors"
      // Inline: the app resets button backgrounds outside any cascade layer.
      style={{ background: props.on ? props.color : 'rgb(0 0 0 / 0.15)' }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        props.onToggle();
      }}
    >
      <span
        class="absolute top-0.5 left-0.5 h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-transform"
        style={{ transform: props.on ? 'translateX(10px)' : undefined }}
      />
    </button>
  );
}

const EMPTY_RECT: DockRect = { x: 0, y: 0, width: 0, height: 0 };

function tabId(panelId: string): string {
  return `stacked-tab-${panelId}`;
}

/**
 * The only per-group element left: an invisible strip over the top tab row.
 * The dock hit-tests it as the tab list, so drops there insert between tabs,
 * and it is the `tablist` that owns the tabs living inside the cards. Opacity
 * rather than `visibility` hides it, which would drop it from the accessibility tree.
 */
function TabListArea(props: { group: DockGroupApi }): JSX.Element {
  const strip = (): DockRect => {
    const frame = props.group.rect() ?? EMPTY_RECT;
    return { ...frame, height: Math.min(TAB_HEIGHT, frame.height) };
  };

  return (
    <div
      ref={props.group.tabListRef}
      role="tablist"
      aria-owns={props.group.panels().map(tabId).join(' ')}
      style={{ ...rectStyle(strip()), opacity: 0, 'pointer-events': 'none' }}
    />
  );
}

/** Sash raised by {@link Z_STRIDE} like the cards, so it stays above them. */
function CardSash(props: { sash: DockSashApi }): JSX.Element {
  const dock = useDock();

  return (
    <div
      {...props.sash.props}
      style={{ ...props.sash.props.style, 'z-index': dock.layers.sash() * Z_STRIDE }}
      class={cn(
        'rounded-full outline-none hover:bg-sky-500/40',
        props.sash.direction() === 'row' ? 'cursor-col-resize' : 'cursor-row-resize'
      )}
    />
  );
}
