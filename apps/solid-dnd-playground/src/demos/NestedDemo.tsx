import { createBodyCursor } from '@solid-primitives/cursor';
import { throttle } from '@solid-primitives/scheduled';
import { createDragSensor, createFlip, createNestable, Place, Rect, Tree } from 'solid-dnd';
import { batch, createMemo, createSignal, For, Show, type JSX } from 'solid-js';
import { DropIndicator } from '../components/DropIndicator';
import EventLog, { createEventLogger } from '../components/EventLog';
import { GroupNode } from '../components/GroupNode';
import { LeafItem } from '../components/LeafItem';
import { StateCard } from '../components/StateCard';
import { TreeDisplay } from '../components/TreeDisplay';
import { createInitialTree, NODES } from '../data';

// ============================================================================
// MARK: Nested Demo
// ============================================================================

export default function NestedDemo(): JSX.Element {
  const logger = createEventLogger();

  // ── State ───────────────────────────────────────────────────────────────
  const [tree, setTree] = createSignal(createInitialTree());
  const [draggedId, setDraggedId] = createSignal<string | null>(null);
  const [dropPlace, setDropPlace] = createSignal<Place.Place<string> | undefined>(undefined, {
    equals: Place.equals
  });
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

  // ── FLIP animation ─────────────────────────────────────────────────────
  const flip = createFlip({ elements: itemRefs as Map<string, HTMLElement> });

  // ── Throttled drop-place update ─────────────────────────────────────────
  const throttledSetDropPlace = throttle((pos: { x: number; y: number }) => {
    setDropPlace(nestable.getInsertionPoint(pos));
  }, 16);

  function resetDragState() {
    throttledSetDropPlace.clear();
    pendingDragId = null;
    setDraggedId(null);
    setDropPlace(undefined);
  }

  // ── Apply drop: move node in the tree ───────────────────────────────────
  function applyDrop(id: string, place: Place.Place<string>) {
    setTree((prev) => Tree.move(prev, id, place));
  }

  // ── Drag sensor ─────────────────────────────────────────────────────────
  const sensor = createDragSensor({
    threshold: 5,
    onClick: () => {
      pendingDragId = null;
    },
    onDragStart: (e) => {
      const id = pendingDragId;
      if (!id) return;
      batch(() => {
        setDraggedId(id);
        const node = NODES[id];
        const tag = node?.isGroup ? '📁' : '📄';
        logger.addLog(`▶ DRAG  ${tag} "${id}" at (${e.position.x.toFixed(0)}, ${e.position.y.toFixed(0)})`);
        setDropPlace(nestable.getInsertionPoint(e.position));
      });
    },
    onDragMove: (e) => {
      throttledSetDropPlace(e.position);
    },
    onDragEnd: () => {
      const place = dropPlace();
      const id = draggedId();
      if (place && id) {
        flip.animate(() => applyDrop(id, place), { duration: 200 });
        logger.addLog(`■ DROP  "${id}" → ${Place.label(place)}`);
      }
      resetDragState();
    },
    onDragCancel: () => {
      logger.addLog('✕ CANCEL');
      resetDragState();
    }
  });

  createBodyCursor(() => (sensor.isDragging() ? 'grabbing' : null));

  function handlePointerDown(id: string, ev: PointerEvent) {
    pendingDragId = id;
    sensor.onPointerDown(ev);
  }

  // ── Indicator position per container ────────────────────────────────────
  function indicatorFor(containerKey: string): number | undefined {
    if (!sensor.isDragging()) return undefined;
    const result = nestable.getIndicatorOffset(dropPlace());
    if (!result || result.containerKey !== containerKey) return undefined;
    return result.offset;
  }

  // ── Recursive rendering ─────────────────────────────────────────────────

  function NodeChildren(props: { parentId: string; depth: number }): JSX.Element {
    return (
      <div
        ref={(el) => containerRefs.set(props.parentId, el)}
        role="listbox"
        aria-label={`${props.parentId} contents`}
        class="relative flex flex-col gap-1.5"
      >
        <For each={tree()[props.parentId] ?? []}>
          {(childId) => {
            const node = NODES[childId];
            if (!node) return null;

            if (node.isGroup) {
              return (
                <GroupNode
                  id={childId}
                  node={node}
                  depth={props.depth}
                  isDragged={childId === draggedId() && sensor.isDragging()}
                  onPointerDown={(ev) => handlePointerDown(childId, ev)}
                  ref={(el) => itemRefs.set(childId, el)}
                >
                  <NodeChildren parentId={childId} depth={props.depth + 1} />
                </GroupNode>
              );
            }

            return (
              <LeafItem
                id={childId}
                node={node}
                isDragged={childId === draggedId() && sensor.isDragging()}
                onPointerDown={(ev) => handlePointerDown(childId, ev)}
                ref={(el) => itemRefs.set(childId, el)}
              />
            );
          }}
        </For>

        {/* Empty state */}
        <Show when={(tree()[props.parentId] ?? []).length === 0}>
          <div class="py-3 text-center text-xs text-neutral-600 italic">Drop items here</div>
        </Show>

        {/* Drop indicator */}
        <Show when={indicatorFor(props.parentId) !== undefined}>
          <DropIndicator y={indicatorFor(props.parentId)!} />
        </Show>
      </div>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────
  return (
    <div class="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h2 class="mb-1 text-sm font-semibold text-neutral-300">Nested Containers</h2>
        <p class="mb-4 text-xs text-neutral-500">
          Drag items between groups. Drag groups to reorder or nest them inside other groups. Cycle prevention stops you
          from dropping a group into its own descendant. Combines{' '}
          <code class="rounded bg-white/10 px-1">createDragSensor</code> +{' '}
          <code class="rounded bg-white/10 px-1">createNestable</code> +{' '}
          <code class="rounded bg-white/10 px-1">createFlip</code>.
        </p>
      </div>

      {/* ── Nested tree ──────────────────────────────────────────── */}
      <div class="rounded-xl border border-white/10 bg-white/2 p-3">
        <NodeChildren parentId="root" depth={0} />
      </div>

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

      {/* ── Event log ─────────────────────────────────────────────── */}
      <EventLog logger={logger} />
    </div>
  );
}
