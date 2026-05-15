import { createBodyCursor } from '@solid-primitives/cursor';
import { throttle } from '@solid-primitives/scheduled';
import {
  createDragOverlay,
  createDragSensor,
  createFlip,
  createNestable,
  createTreeDisplayList,
  GAP_KEY,
  GapKey,
  isGapKey,
  Place,
  Rect,
  Tree,
  Vec2,
  type FlipAnimateEntry
} from 'solid-dnd';
import { batch, createEffect, createMemo, createSignal, For, on, Show, type JSX } from 'solid-js';
import { AnimationControls } from '../components/AnimationControls';
import EventLog, { createEventLogger } from '../components/EventLog';
import { FlipDebugOverlay } from '../components/FlipDebugOverlay';
import { GroupNode } from '../components/GroupNode';
import { LeafItem } from '../components/LeafItem';
import { NestedOverlayItem } from '../components/NestedOverlayItem';
import { StateCard } from '../components/StateCard';
import { TreeDisplay } from '../components/TreeDisplay';
import { createInitialTree, NODES } from '../data';

export default function NestedOverlayDemo(): JSX.Element {
  const logger = createEventLogger();

  // ── State ───────────────────────────────────────────────────────────────
  const [tree, setTree] = createSignal(createInitialTree());
  const [draggedId, setDraggedId] = createSignal<string | null>(null);
  const [dropPlace, setDropPlace] = createSignal<Place.Place<string> | undefined>(undefined, {
    equals: Place.equals
  });
  const [gapHeight, setGapHeight] = createSignal(0);
  const [animEnabled, setAnimEnabled] = createSignal(true);
  const [animDuration, setAnimDuration] = createSignal(200);
  const [debugEnabled, setDebugEnabled] = createSignal(false);
  const [flipEntries, setFlipEntries] = createSignal<FlipAnimateEntry<string | GapKey>[]>([]);
  let pendingDragId: string | null = null;

  // ── Element refs ────────────────────────────────────────────────────────
  const itemRefs = new Map<string, HTMLDivElement>();
  const containerRefs = new Map<string, HTMLDivElement>();

  // ── Derived: parent lookup ──────────────────────────────────────────────
  const parents = createMemo(() => Tree.parentMap(tree()));
  const getParent = (key: string): string | undefined => parents().get(key);

  // ── Build NestableContainers from tree ──────────────────────────────────
  const containers = createMemo(() =>
    Tree.buildContainers(tree(), {
      isContainer: (id) => NODES[id]?.isGroup ?? false,
      getItemRect: (key) => Rect.fromElement(itemRefs.get(key)),
      getContainerRect: (key) => Rect.fromElement(containerRefs.get(key))
    })
  );

  // ── Nestable primitive ──────────────────────────────────────────────────
  const nestable = createNestable<string>({
    containers,
    dragTags: () => undefined,
    draggedKeys: () => {
      const id = draggedId();
      return id ? [id] : [];
    },
    getParent
  });

  // ── Tree display list (live gap) ─────────────────────────────────────────
  const display = createTreeDisplayList<string>({
    tree,
    draggedKeys: () => {
      const id = draggedId();
      return id ? [id] : [];
    },
    place: dropPlace
  });

  // ── FLIP animation ─────────────────────────────────────────────────────
  const flip = createFlip({
    elements: itemRefs as Map<string, HTMLElement>,
    onAnimate: (entries) => setFlipEntries([...entries])
  });

  // ── Drag overlay ────────────────────────────────────────────────────────
  const overlay = createDragOverlay({
    currentPosition: () => sensor.position() ?? Vec2.Zero
  });

  // ── Throttled drop-place update ─────────────────────────────────────────
  const throttledSetDropPlace = throttle((pos: { x: number; y: number }) => {
    setDropPlace(nestable.getInsertionPoint(pos));
  }, 16);

  // ── Animate display key changes during drag ─────────────────────────────
  createEffect(
    on(
      () => {
        // Access all display lists to trigger on any change
        const place = dropPlace();
        if (!place) return null;
        return display.getDisplayKeys(place.parent);
      },
      () => {
        if (sensor.isDragging() && animEnabled()) {
          flip.playFromFirst();
        }
      },
      { defer: true }
    )
  );

  function resetDragState() {
    throttledSetDropPlace.clear();
    pendingDragId = null;
    setDraggedId(null);
    setDropPlace(undefined);
    setGapHeight(0);
    overlay.stop();
    // Clean up stale gap refs to prevent GC leaks of detached DOM nodes
    for (const key of itemRefs.keys()) {
      if (key.startsWith('__gap_')) itemRefs.delete(key);
    }
  }

  function applyDrop(id: string, place: Place.Place<string>) {
    setTree((prev) => Tree.move(prev, id, place));
  }

  // ── Drag sensor ─────────────────────────────────────────────────────────
  const sensor = createDragSensor({
    threshold: 5,
    proxyCapture: true,
    onClick: () => {
      pendingDragId = null;
    },
    onDragStart: (e) => {
      const id = pendingDragId;
      if (!id) return;

      // 1. Measure source element BEFORE any state changes
      const sourceEl = itemRefs.get(id);
      if (sourceEl) {
        setGapHeight(sourceEl.getBoundingClientRect().height);
        overlay.start(sourceEl, e.position);
      }

      // 2. Capture FLIP positions before DOM changes
      if (animEnabled()) flip.captureFirst();

      // 3. Set drag state (batched so display keys compute once with final state)
      batch(() => {
        setDraggedId(id);
        const node = NODES[id];
        const tag = node?.isGroup ? '📁' : '📄';
        logger.addLog(`▶ DRAG  ${tag} "${id}" at (${e.position.x.toFixed(0)}, ${e.position.y.toFixed(0)})`);
        setDropPlace(nestable.getInsertionPoint(e.position));
      });
    },
    onDragMove: (e) => {
      // Skip recalculation while FLIP is animating — mid-animation rects
      // give wrong container hit-testing in nested layouts, causing oscillation.
      if (flip.isAnimating()) return;
      if (animEnabled()) flip.captureFirst();
      throttledSetDropPlace(e.position);
    },
    onDragEnd: () => {
      const place = dropPlace();
      const id = draggedId();
      const dur = animEnabled() ? animDuration() : 0;
      if (place && id) {
        const doApply = () => {
          applyDrop(id, place);
          resetDragState();
        };
        flip.animate(doApply, { duration: dur });
        logger.addLog(`■ DROP  "${id}" → ${Place.label(place)}`);
      } else {
        flip.animate(() => resetDragState(), { duration: dur });
      }
    },
    onDragCancel: () => {
      logger.addLog('✕ CANCEL');
      flip.animate(() => resetDragState(), { duration: animEnabled() ? animDuration() : 0 });
    }
  });

  createBodyCursor(() => (sensor.isDragging() ? 'grabbing' : null));

  function handlePointerDown(id: string, ev: PointerEvent) {
    pendingDragId = id;
    sensor.onPointerDown(ev);
  }

  // ── Recursive rendering using display keys ──────────────────────────────

  function NodeChildren(props: { parentId: string; depth: number }): JSX.Element {
    const displayKeys = () => display.getDisplayKeys(props.parentId);

    return (
      <div
        ref={(el) => containerRefs.set(props.parentId, el)}
        role="listbox"
        aria-label={`${props.parentId} contents`}
        class="relative flex flex-col gap-1.5"
      >
        <For each={displayKeys()}>
          {(key) => {
            if (key === GAP_KEY) {
              return (
                <div
                  ref={(el) => itemRefs.set(`__gap_${props.parentId}__`, el)}
                  class="rounded-lg border border-dashed border-blue-500/30 bg-blue-500/5"
                  style={{ height: `${gapHeight()}px` }}
                />
              );
            }

            const node = NODES[key];
            if (!node) return null;
            const isDragged = () => display.isDragged(key) && sensor.isDragging();

            if (node.isGroup) {
              return (
                <GroupNode
                  id={key}
                  node={node}
                  depth={props.depth}
                  isDragged={isDragged()}
                  onPointerDown={(ev) => handlePointerDown(key, ev)}
                  ref={(el) => itemRefs.set(key, el)}
                >
                  <NodeChildren parentId={key} depth={props.depth + 1} />
                </GroupNode>
              );
            }

            return (
              <LeafItem
                id={key}
                node={node}
                isDragged={isDragged()}
                onPointerDown={(ev) => handlePointerDown(key, ev)}
                ref={(el) => itemRefs.set(key, el)}
              />
            );
          }}
        </For>

        {/* Empty state */}
        <Show when={displayKeys().filter((k) => !isGapKey(k)).length === 0}>
          <div class="py-3 text-center text-xs text-neutral-600 italic">Drop items here</div>
        </Show>
      </div>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────
  return (
    <div class="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h2 class="mb-1 text-sm font-semibold text-neutral-300">Nested Containers — Drag Overlay</h2>
        <p class="mb-4 text-xs text-neutral-500">
          Items pop out as a floating overlay. A gap opens at the drop position across all containers. Combines{' '}
          <code class="rounded bg-white/10 px-1">createTreeDisplayList</code> +{' '}
          <code class="rounded bg-white/10 px-1">createDragOverlay</code> +{' '}
          <code class="rounded bg-white/10 px-1">createNestable</code> +{' '}
          <code class="rounded bg-white/10 px-1">createFlip</code>.
        </p>
      </div>

      {/* ── Animation controls ─────────────────────────────────────── */}
      <AnimationControls
        enabled={animEnabled()}
        setEnabled={setAnimEnabled}
        duration={animDuration()}
        setDuration={setAnimDuration}
        isAnimating={flip.isAnimating()}
        debugEnabled={debugEnabled()}
        setDebugEnabled={setDebugEnabled}
      />

      {/* ── Nested tree ──────────────────────────────────────────── */}
      <div class="rounded-xl border border-white/10 bg-white/2 p-3">
        <NodeChildren parentId="root" depth={0} />
      </div>

      {/* ── Drag overlay ──────────────────────────────────────────── */}
      <Show when={overlay.active()}>
        <div
          class="pointer-events-none fixed z-10000"
          style={{
            left: `${overlay.rect.x}px`,
            top: `${overlay.rect.y}px`,
            width: `${overlay.rect.width}px`
          }}
        >
          <NestedOverlayItem draggedId={draggedId()} />
        </div>
      </Show>

      {/* ── FLIP debug overlay ────────────────────────────────────── */}
      <FlipDebugOverlay
        entries={flipEntries()}
        getElement={(key) => (typeof key === 'string' ? itemRefs.get(key) : undefined)}
        isAnimating={flip.isAnimating()}
        enabled={debugEnabled()}
        isDragging={sensor.isDragging()}
      />

      {/* ── Controls ──────────────────────────────────────────────── */}
      <button
        onClick={() => setTree(createInitialTree())}
        class="self-start rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-neutral-400 hover:bg-white/10 hover:text-neutral-200"
      >
        ↺ Reset tree
      </button>

      {/* ── State readout ─────────────────────────────────────────── */}
      <div class="grid grid-cols-3 gap-3">
        <StateCard label="isDragging" value={sensor.isDragging() ? 'true' : 'false'} active={sensor.isDragging()} />
        <StateCard label="dragging" value={draggedId() ?? 'none'} active={draggedId() !== null} />
        <StateCard label="dropPlace" value={Place.label(dropPlace())} active={dropPlace() !== undefined} />
      </div>

      {/* ── Tree structure readout ────────────────────────────────── */}
      <TreeDisplay tree={tree()} nodes={NODES} />

      <EventLog logger={logger} />
    </div>
  );
}
