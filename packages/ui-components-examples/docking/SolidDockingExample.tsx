import { cn } from '@app-game/utils/cn';
import { createDragSensor } from 'solid-dnd';
import { For, Show, createEffect, createMemo, createSignal, type JSX } from 'solid-js';
import { Component1, Component2, Component3, Component4, Component5 } from './solid-docking/TestComponents';

/**
 * Should have:
 * - Sash - the draggable divider
 * - Panels - where the user content goes
 * - Tabs - multiple panels in one view
 * - grid-view
 *
 * View can be put on
 * - left or right (split horizontal)
 * - top or bottom (split vertical)
 * - center (new tab)
 * Should work the same way for floating windows.
 *
 * Example structure:
 * ```
 * ┌─────────┬─────┬───────┬────────┐
 * │ Panel 1 │     │       │        │
 * │         │     ├───┬───┤        │
 * │         │     │   │   │        │
 * │         ├─────┴───┴─┬─┴────────┤
 * │         │           │          │
 * │         │           │          │
 * └─────────┴───────────┴──────────┘
 * grid-view
 *  └─branch split-view-container horizontal
 *     ├─sash
 *     ├─view (panel 1)
 *     └─view
 *        └─branch split-view-container vertical
 * ```
 */

/**
 * 1
 *
 * column[1,2]
 *
 *
 * column[1, row[2, 3]]
 *
 * column[1, row[2, column[3,5], 4]]
 *
 * column[1, row[2, column[3, row[5, 6]], 4]]
 */

// direction: 'column',
// children: [
//   {
//     direction: 'row',
//     children: [
//       {},
//       {
//         direction: 'column',
//         children: [
//           {},
//           {
//             direction: 'row',
//             children: [{}, {}]
//           }
//         ]
//       },
//       {}
//     ]
//   },
//   {}
// ]

export type DockingItem = {
  title: string;
  render: () => JSX.Element;
  closable?: boolean;
};

export type DockingTabsNode = {
  type: 'tabs';
  id: string;
  activeId?: string;
  children: ReadonlyArray<string>;
};

export type DockingSplitNode = {
  type: 'split';
  id: string;
  direction: 'row' | 'column';
  sizes?: ReadonlyArray<number>;
  children: ReadonlyArray<DockingNode>;
};

export type DockingNode = DockingSplitNode | DockingTabsNode;

export type DockingProps = {
  items: Record<string, DockingItem>;
  layout: DockingNode;
  class?: string;
  onLayoutChange?: (layout: DockingNode) => void;
};

type DockingDragState =
  | {
      kind: 'panel';
      panelId: string;
      sourceNodeId: string;
      position: { x: number; y: number };
    }
  | {
      kind: 'group';
      sourceNodeId: string;
      node: DockingTabsNode;
      position: { x: number; y: number };
    };

type DockingDropZone = 'center' | 'left' | 'right' | 'top' | 'bottom';

type DockingDropTarget = {
  nodeId: string;
  zone: DockingDropZone;
};

const ROOT_DROP_TARGET_ID = 'dock-root';

export function SolidDockingExample(): JSX.Element {
  const [layout, setLayout] = createSignal<DockingNode>(DEMO_LAYOUT);
  const items = createMemo<Record<string, DockingItem>>(() => ({
    'component-1': {
      title: 'Explorer',
      render: () => <Component1 />
    },
    'component-2': {
      title: 'Search',
      closable: true,
      render: () => <Component2 />
    },
    'component-3': {
      title: 'Preview',
      render: () => <Component3 layout={layout()} />
    },
    'component-4': {
      title: 'Console',
      render: () => <Component4 />
    },
    'component-5': {
      title: 'Problems',
      closable: true,
      render: () => <Component5 />
    }
  }));

  return (
    <div class="flex flex-col gap-3 bg-neutral-950 p-2 text-white">
      <div class="border border-neutral-800 p-3 text-sm text-neutral-300">
        Static docking shell: item registry plus shared layout tree, live split resize, persisted tab reorder, and group
        drag with root-edge docking.
      </div>

      <Docking items={items()} layout={layout()} onLayoutChange={setLayout} class="h-[34rem]" />
    </div>
  );
}

export function Docking(props: DockingProps): JSX.Element {
  const [layout, setLayout] = createSignal(props.layout);
  const [dragState, setDragState] = createSignal<DockingDragState>();
  const dropTargetRefs = new Map<string, HTMLElement>();

  const dropTarget = createMemo(() => resolveDropTarget(dragState(), dropTargetRefs));
  const rootDropTarget = createMemo(() => (dropTarget()?.nodeId === ROOT_DROP_TARGET_ID ? dropTarget() : undefined));

  createEffect(() => {
    setLayout(props.layout);
  });

  function updateLayout(nextLayout: DockingNode): void {
    setLayout(nextLayout);
    props.onLayoutChange?.(nextLayout);
  }

  function registerDropTarget(nodeId: string, element: HTMLElement): void {
    dropTargetRefs.set(nodeId, element);
  }

  function handleTabDragStart(nextDragState: DockingDragState): void {
    setDragState(nextDragState);
  }

  function handleTabDragMove(position: { x: number; y: number }): void {
    setDragState((current) => (current ? { ...current, position } : current));
  }

  function handleTabDragEnd(): void {
    const currentDragState = dragState();
    const currentDropTarget = dropTarget();

    if (currentDragState && currentDropTarget) {
      updateLayout(
        currentDragState.kind === 'panel'
          ? movePanelInLayout(layout(), {
              panelId: currentDragState.panelId,
              sourceNodeId: currentDragState.sourceNodeId,
              targetNodeId: currentDropTarget.nodeId,
              zone: currentDropTarget.zone
            })
          : moveGroupInLayout(layout(), {
              sourceNodeId: currentDragState.sourceNodeId,
              targetNodeId: currentDropTarget.nodeId,
              zone: currentDropTarget.zone,
              node: currentDragState.node
            })
      );
    }

    setDragState(undefined);
  }

  return (
    <div
      ref={(element) => registerDropTarget(ROOT_DROP_TARGET_ID, element)}
      class={cn('relative flex min-h-120 w-full overflow-hidden', props.class)}
    >
      <Show when={rootDropTarget()}>{(target) => <DockingDropOverlay zone={target().zone} />}</Show>
      <DockingNodeView
        node={layout()}
        items={props.items}
        onNodeChange={updateLayout}
        dragState={dragState()}
        dropTarget={dropTarget()}
        registerDropTarget={registerDropTarget}
        onTabDragStart={handleTabDragStart}
        onTabDragMove={handleTabDragMove}
        onTabDragEnd={handleTabDragEnd}
      />
    </div>
  );
}

function DockingNodeView(props: {
  node: DockingNode;
  items: Record<string, DockingItem>;
  onNodeChange: (node: DockingNode) => void;
  dragState: DockingDragState | undefined;
  dropTarget: DockingDropTarget | undefined;
  registerDropTarget: (nodeId: string, element: HTMLElement) => void;
  onTabDragStart: (dragState: DockingDragState) => void;
  onTabDragMove: (position: { x: number; y: number }) => void;
  onTabDragEnd: () => void;
}): JSX.Element {
  return props.node.type === 'split' ? (
    <DockingSplitView
      node={props.node}
      items={props.items}
      onNodeChange={props.onNodeChange}
      dragState={props.dragState}
      dropTarget={props.dropTarget}
      registerDropTarget={props.registerDropTarget}
      onTabDragStart={props.onTabDragStart}
      onTabDragMove={props.onTabDragMove}
      onTabDragEnd={props.onTabDragEnd}
    />
  ) : (
    <DockingTabsView
      node={props.node}
      items={props.items}
      onNodeChange={props.onNodeChange}
      dragState={props.dragState}
      dropTarget={props.dropTarget}
      registerDropTarget={props.registerDropTarget}
      onTabDragStart={props.onTabDragStart}
      onTabDragMove={props.onTabDragMove}
      onTabDragEnd={props.onTabDragEnd}
    />
  );
}

function DockingSplitView(props: {
  node: DockingSplitNode;
  items: Record<string, DockingItem>;
  onNodeChange: (node: DockingNode) => void;
  dragState: DockingDragState | undefined;
  dropTarget: DockingDropTarget | undefined;
  registerDropTarget: (nodeId: string, element: HTMLElement) => void;
  onTabDragStart: (dragState: DockingDragState) => void;
  onTabDragMove: (position: { x: number; y: number }) => void;
  onTabDragEnd: () => void;
}): JSX.Element {
  const isRow = () => props.node.direction === 'row';
  const [containerRef, setContainerRef] = createSignal<HTMLDivElement>();
  const sizes = createMemo(() => normalizeSizes(props.node.sizes, props.node.children.length));

  function handleResize(index: number, deltaPx: number): void {
    const element = containerRef();
    if (!element) {
      return;
    }

    const sizePx = isRow() ? element.clientWidth : element.clientHeight;
    if (sizePx <= 0) {
      return;
    }

    props.onNodeChange({
      ...props.node,
      sizes: resizePaneSizes(sizes(), index, deltaPx, sizePx)
    });
  }

  return (
    <div
      ref={setContainerRef}
      class={cn('flex h-full min-h-0 w-full min-w-0 overflow-hidden', isRow() ? 'flex-row' : 'flex-col')}
    >
      <For each={props.node.children}>
        {(child, index) => (
          <>
            <div class="min-h-0 min-w-0 flex-1 overflow-hidden" style={getPaneStyle(sizes()[index()])}>
              <DockingNodeView
                node={child}
                items={props.items}
                onNodeChange={(nextChild) => props.onNodeChange(replaceSplitChild(props.node, index(), nextChild))}
                dragState={props.dragState}
                dropTarget={props.dropTarget}
                registerDropTarget={props.registerDropTarget}
                onTabDragStart={props.onTabDragStart}
                onTabDragMove={props.onTabDragMove}
                onTabDragEnd={props.onTabDragEnd}
              />
            </div>

            <Show when={index() < props.node.children.length - 1}>
              <DockingSash direction={props.node.direction} onResize={(deltaPx) => handleResize(index(), deltaPx)} />
            </Show>
          </>
        )}
      </For>
    </div>
  );
}

function DockingSash(props: { direction: 'row' | 'column'; onResize: (deltaPx: number) => void }): JSX.Element {
  let startDelta = 0;

  const sensor = createDragSensor({
    threshold: 0,
    onDragStart: () => {
      startDelta = 0;
    },
    onDragMove: (event) => {
      const nextDelta = props.direction === 'row' ? event.delta.x : event.delta.y;
      props.onResize(nextDelta - startDelta);
      startDelta = nextDelta;
    },
    onDragEnd: (event) => {
      const nextDelta = props.direction === 'row' ? event.delta.x : event.delta.y;
      props.onResize(nextDelta - startDelta);
    }
  });

  return (
    <button
      type="button"
      aria-label={props.direction === 'row' ? 'Resize columns' : 'Resize rows'}
      class={cn(
        'group relative shrink-0 touch-none bg-neutral-950 transition-colors hover:bg-neutral-900',
        props.direction === 'row' ? 'h-full w-2 cursor-col-resize' : 'h-2 w-full cursor-row-resize'
      )}
      onPointerDown={sensor.onPointerDown}
    >
      <span
        class={cn(
          'pointer-events-none absolute rounded-full bg-neutral-700 transition-colors group-hover:bg-neutral-500',
          props.direction === 'row'
            ? 'top-1/2 left-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2'
            : 'top-1/2 left-1/2 h-1 w-10 -translate-x-1/2 -translate-y-1/2'
        )}
      />
    </button>
  );
}

function DockingTabsView(props: {
  node: DockingTabsNode;
  items: Record<string, DockingItem>;
  onNodeChange: (node: DockingNode) => void;
  dragState: DockingDragState | undefined;
  dropTarget: DockingDropTarget | undefined;
  registerDropTarget: (nodeId: string, element: HTMLElement) => void;
  onTabDragStart: (dragState: DockingDragState) => void;
  onTabDragMove: (position: { x: number; y: number }) => void;
  onTabDragEnd: () => void;
}): JSX.Element {
  const [draggedId, setDraggedId] = createSignal<string | undefined>(undefined);
  const tabRefs = new Map<string, HTMLButtonElement>();
  const [headerRef, setHeaderRef] = createSignal<HTMLDivElement>();

  const activeId = createMemo(() => props.node.activeId ?? props.node.children[0]);
  const isGroupDragged = createMemo(
    () => props.dragState?.kind === 'group' && props.dragState.sourceNodeId === props.node.id
  );
  const activeDropTarget = createMemo(() =>
    props.dropTarget?.nodeId === props.node.id && props.dragState?.sourceNodeId !== props.node.id
      ? props.dropTarget
      : undefined
  );

  const groupSensor = createDragSensor({
    threshold: 6,
    onDragStart: (event) => {
      props.onTabDragStart({
        kind: 'group',
        sourceNodeId: props.node.id,
        node: props.node,
        position: {
          x: event.position.x,
          y: event.position.y
        }
      });
    },
    onDragMove: (event) => {
      props.onTabDragMove({ x: event.position.x, y: event.position.y });
    },
    onDragEnd: (event) => {
      props.onTabDragMove({ x: event.position.x, y: event.position.y });
      props.onTabDragEnd();
    },
    onDragCancel: () => {
      props.onTabDragEnd();
    }
  });

  function setActive(panelId: string): void {
    props.onNodeChange({
      ...props.node,
      activeId: panelId
    });
  }

  function setTabRef(panelId: string, element: HTMLButtonElement): void {
    tabRefs.set(panelId, element);
  }

  function updatePreviewOrder(panelId: string, clientX: number): void {
    const header = headerRef();
    if (!header) {
      return;
    }

    const rect = header.getBoundingClientRect();
    if (props.dragState && (props.dragState.position.y < rect.top || props.dragState.position.y > rect.bottom)) {
      return;
    }

    const nextIndex = getTabInsertionIndex(props.node.children, panelId, clientX, tabRefs);
    const nextChildren = reorderTabIds(props.node.children, panelId, nextIndex);
    if (arePanelIdsEqual(nextChildren, props.node.children)) {
      return;
    }

    props.onNodeChange({
      ...props.node,
      children: nextChildren,
      activeId: activeId()
    });
  }

  function clearDrag(): void {
    setDraggedId(undefined);
  }

  const activeItem = createMemo(() => {
    const panelId = activeId();
    return panelId ? props.items[panelId] : undefined;
  });

  return (
    <div class="bg-neutral-925 flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div ref={setHeaderRef} class="flex shrink-0 items-center gap-1">
        <For each={props.node.children}>
          {(panelId, index) => {
            const item = () => props.items[panelId];

            return (
              <DockingTabButton
                index={index()}
                panelId={panelId}
                title={item()?.title ?? panelId}
                closable={item()?.closable}
                isActive={() => activeId() === panelId}
                isDragged={() => draggedId() === panelId}
                setTabRef={setTabRef}
                onActivate={setActive}
                onDragStart={(event) => {
                  setDraggedId(panelId);
                  props.onTabDragStart({
                    kind: 'panel',
                    panelId,
                    sourceNodeId: props.node.id,
                    position: {
                      x: event.position.x,
                      y: event.position.y
                    }
                  });
                }}
                onDragMove={(event) => {
                  props.onTabDragMove({ x: event.position.x, y: event.position.y });
                  updatePreviewOrder(panelId, event.position.x);
                }}
                onDragEnd={(event) => {
                  props.onTabDragMove({ x: event.position.x, y: event.position.y });
                  updatePreviewOrder(panelId, event.position.x);
                  clearDrag();
                  props.onTabDragEnd();
                }}
                onDragCancel={() => {
                  clearDrag();
                  props.onTabDragEnd();
                }}
              />
            );
          }}
        </For>

        <div class="ml-auto" />

        <button
          type="button"
          aria-label="Move group"
          class={cn(
            'flex h-8 shrink-0 touch-none items-center justify-center rounded-md px-2 text-[11px] font-semibold tracking-wide uppercase transition-colors',
            isGroupDragged()
              ? 'cursor-grabbing bg-neutral-800 text-white opacity-70'
              : 'hover:bg-neutral-850 cursor-grab text-neutral-500 hover:text-neutral-200'
          )}
          onPointerDown={groupSensor.onPointerDown}
        >
          move
        </button>
      </div>

      <div ref={(element) => props.registerDropTarget(props.node.id, element)}>
        <Show when={activeDropTarget()}>{(target) => <DockingDropOverlay zone={target().zone} />}</Show>
      </div>
      <Show
        when={activeItem()}
        fallback={
          <div class="flex h-full items-center justify-center rounded-lg border border-dashed border-neutral-800 text-sm text-neutral-500">
            Missing panel for {activeId() ?? 'unknown id'}
          </div>
        }
      >
        {(item) => item().render()}
      </Show>
    </div>
  );
}

const BEFORE_OUT =
  'before:content-[""] before:out-es before:out-rounded-lg before:out-border-white before:out-bg-neutral-800';
const AFTER_OUT =
  'after:content-[""] after:out-ee after:out-rounded-lg after:out-border-white after:out-bg-neutral-800';

function DockingTabButton(props: {
  index?: number;
  panelId: string;
  title: string;
  closable?: boolean;
  isActive: () => boolean;
  isDragged: () => boolean;
  setTabRef: (panelId: string, element: HTMLButtonElement) => void;
  onActivate: (panelId: string) => void;
  onDragStart: (event: { position: { x: number; y: number } }) => void;
  onDragMove: (event: { position: { x: number; y: number } }) => void;
  onDragEnd: (event: { position: { x: number; y: number } }) => void;
  onDragCancel: () => void;
}): JSX.Element {
  const sensor = createDragSensor({
    threshold: 6,
    onClick: () => {
      props.onActivate(props.panelId);
    },
    onDragStart: (event) => {
      props.onDragStart({
        position: {
          x: event.position.x,
          y: event.position.y
        }
      });
    },
    onDragMove: (event) => {
      props.onDragMove({
        position: {
          x: event.position.x,
          y: event.position.y
        }
      });
    },
    onDragEnd: (event) => {
      props.onDragEnd({
        position: {
          x: event.position.x,
          y: event.position.y
        }
      });
    },
    onDragCancel: () => {
      props.onDragCancel();
    }
  });

  return (
    <button
      type="button"
      ref={(element) => props.setTabRef(props.panelId, element)}
      class={cn(
        'relative flex touch-none items-center gap-2 rounded-t-lg border-x border-t border-transparent px-3 py-1.5 text-sm transition-colors',
        props.isActive()
          ? `${AFTER_OUT} ${props.index === 0 ? '' : BEFORE_OUT} border-white bg-neutral-800 text-white`
          : 'hover:bg-neutral-850 text-neutral-400 hover:text-neutral-200',
        props.isDragged() && 'cursor-grabbing opacity-60',
        !props.isDragged() && 'cursor-grab'
      )}
      onPointerDown={sensor.onPointerDown}
    >
      <span>{props.title}</span>
      <Show when={props.closable}>
        <span class="text-xs text-neutral-500">x</span>
      </Show>

      <div class={cn(props.isActive() ? 'absolute inset-x-0 bottom-[-1px] h-[1px] bg-neutral-800' : '')}></div>
    </button>
  );
}

function DockingDropOverlay(props: { zone: DockingDropZone }): JSX.Element {
  return (
    <div
      class={cn(
        'pointer-events-none absolute rounded-lg border-2 border-sky-400 bg-sky-400/12',
        getDropOverlayPositionClass(props.zone)
      )}
    />
  );
}

function getPaneStyle(size: number | undefined): JSX.CSSProperties | undefined {
  if (size === undefined) {
    return undefined;
  }

  return {
    flex: `${size} ${size} 0%`
  };
}

function normalizeSizes(sizes: ReadonlyArray<number> | undefined, count: number): number[] {
  if (count <= 0) {
    return [];
  }

  if (!sizes || sizes.length !== count) {
    return Array.from({ length: count }, () => 1);
  }

  const sanitized = sizes.map((size) => (size > 0 ? size : 1));
  const total = sanitized.reduce((sum, size) => sum + size, 0);

  return total > 0 ? sanitized : Array.from({ length: count }, () => 1);
}

function resizePaneSizes(
  current: ReadonlyArray<number>,
  index: number,
  deltaPx: number,
  containerSizePx: number
): number[] {
  const next = [...current];
  const total = next.reduce((sum, size) => sum + size, 0);
  const minWeight = (total * MIN_PANE_SIZE_PX) / containerSizePx;
  const weightDelta = (deltaPx / containerSizePx) * total;

  const before = next[index] ?? 0;
  const after = next[index + 1] ?? 0;
  if (before <= 0 || after <= 0) {
    return next;
  }

  const maxGrow = after - minWeight;
  const maxShrink = before - minWeight;
  const clampedDelta = Math.max(-maxShrink, Math.min(maxGrow, weightDelta));

  next[index] = before + clampedDelta;
  next[index + 1] = after - clampedDelta;

  return next;
}

function replaceSplitChild(node: DockingSplitNode, childIndex: number, nextChild: DockingNode): DockingSplitNode {
  return {
    ...node,
    children: node.children.map((child, index) => (index === childIndex ? nextChild : child))
  };
}

function reorderTabIds(current: ReadonlyArray<string>, panelId: string, targetIndex: number): string[] {
  const withoutPanel = current.filter((candidateId) => candidateId !== panelId);
  const clampedIndex = Math.max(0, Math.min(targetIndex, withoutPanel.length));

  withoutPanel.splice(clampedIndex, 0, panelId);
  return withoutPanel;
}

function arePanelIdsEqual(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function getTabInsertionIndex(
  orderedPanelIds: ReadonlyArray<string>,
  draggedPanelId: string,
  clientX: number,
  tabRefs: ReadonlyMap<string, HTMLButtonElement>
): number {
  const candidates = orderedPanelIds.filter((panelId) => panelId !== draggedPanelId);

  for (let index = 0; index < candidates.length; index += 1) {
    const element = tabRefs.get(candidates[index]);
    if (!element) {
      continue;
    }

    const rect = element.getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;
    if (clientX < midpoint) {
      return index;
    }
  }

  return candidates.length;
}

function resolveDropTarget(
  dragState: DockingDragState | undefined,
  dropTargetRefs: ReadonlyMap<string, HTMLElement>
): DockingDropTarget | undefined {
  if (!dragState) {
    return undefined;
  }

  let bestTarget: DockingDropTarget | undefined;
  let bestArea = Number.POSITIVE_INFINITY;

  for (const [nodeId, element] of dropTargetRefs) {
    if (!element.isConnected || nodeId === dragState.sourceNodeId) {
      continue;
    }

    const rect = element.getBoundingClientRect();
    if (!isPointInRect(dragState.position.x, dragState.position.y, rect)) {
      continue;
    }

    const zone = getDropZone(rect, dragState.position.x, dragState.position.y);
    if (nodeId === ROOT_DROP_TARGET_ID && zone === 'center') {
      continue;
    }

    const area = rect.width * rect.height;
    if (area >= bestArea) {
      continue;
    }

    bestArea = area;
    bestTarget = {
      nodeId,
      zone
    };
  }

  return bestTarget;
}

function movePanelInLayout(
  layout: DockingNode,
  options: { panelId: string; sourceNodeId: string; targetNodeId: string; zone: DockingDropZone }
): DockingNode {
  if (options.sourceNodeId === options.targetNodeId) {
    return layout;
  }

  const pruned = removePanelFromLayout(layout, options.sourceNodeId, options.panelId);
  if (!pruned) {
    return layout;
  }

  if (options.zone === 'center') {
    return insertPanelIntoTabs(pruned, options.targetNodeId, options.panelId);
  }

  if (options.targetNodeId === ROOT_DROP_TARGET_ID) {
    return splitRootNode(pruned, options.panelId, options.zone);
  }

  return splitTabsNode(pruned, options.targetNodeId, options.panelId, options.zone);
}

function moveGroupInLayout(
  layout: DockingNode,
  options: { sourceNodeId: string; targetNodeId: string; zone: DockingDropZone; node: DockingTabsNode }
): DockingNode {
  if (options.sourceNodeId === options.targetNodeId) {
    return layout;
  }

  const pruned = removeTabsNodeFromLayout(layout, options.sourceNodeId);
  if (!pruned) {
    return layout;
  }

  if (options.zone === 'center') {
    return mergeTabsNodeIntoTarget(pruned, options.targetNodeId, options.node);
  }

  if (options.targetNodeId === ROOT_DROP_TARGET_ID) {
    return splitRootWithTabsNode(pruned, options.node, options.zone);
  }

  return splitTabsNodeWithNode(pruned, options.targetNodeId, options.node, options.zone);
}

function removePanelFromLayout(node: DockingNode, sourceNodeId: string, panelId: string): DockingNode | null {
  if (node.type === 'tabs') {
    if (node.id !== sourceNodeId) {
      return node;
    }

    const nextChildren = node.children.filter((childId) => childId !== panelId);
    if (nextChildren.length === 0) {
      return null;
    }

    return {
      ...node,
      children: nextChildren,
      activeId: node.activeId === panelId ? nextChildren[0] : node.activeId
    };
  }

  const nextChildren = node.children
    .map((child) => removePanelFromLayout(child, sourceNodeId, panelId))
    .filter((child): child is DockingNode => child !== null);

  if (nextChildren.length === 0) {
    return null;
  }

  if (nextChildren.length === 1) {
    return nextChildren[0];
  }

  return {
    ...node,
    children: nextChildren
  };
}

function removeTabsNodeFromLayout(node: DockingNode, sourceNodeId: string): DockingNode | null {
  if (node.type === 'tabs') {
    return node.id === sourceNodeId ? null : node;
  }

  const nextChildren = node.children
    .map((child) => removeTabsNodeFromLayout(child, sourceNodeId))
    .filter((child): child is DockingNode => child !== null);

  if (nextChildren.length === 0) {
    return null;
  }

  if (nextChildren.length === 1) {
    return nextChildren[0];
  }

  return {
    ...node,
    children: nextChildren
  };
}

function insertPanelIntoTabs(node: DockingNode, targetNodeId: string, panelId: string): DockingNode {
  if (node.type === 'tabs') {
    if (node.id !== targetNodeId) {
      return node;
    }

    return {
      ...node,
      children: node.children.includes(panelId) ? node.children : [...node.children, panelId],
      activeId: panelId
    };
  }

  return {
    ...node,
    children: node.children.map((child) => insertPanelIntoTabs(child, targetNodeId, panelId))
  };
}

function mergeTabsNodeIntoTarget(node: DockingNode, targetNodeId: string, incomingNode: DockingTabsNode): DockingNode {
  if (node.type === 'tabs') {
    if (node.id !== targetNodeId) {
      return node;
    }

    const nextChildren = [...node.children];
    for (const childId of incomingNode.children) {
      if (!nextChildren.includes(childId)) {
        nextChildren.push(childId);
      }
    }

    return {
      ...node,
      children: nextChildren,
      activeId: incomingNode.activeId ?? nextChildren[0]
    };
  }

  return {
    ...node,
    children: node.children.map((child) => mergeTabsNodeIntoTarget(child, targetNodeId, incomingNode))
  };
}

function splitTabsNode(
  node: DockingNode,
  targetNodeId: string,
  panelId: string,
  zone: Exclude<DockingDropZone, 'center'>
): DockingNode {
  if (node.type === 'tabs') {
    if (node.id !== targetNodeId) {
      return node;
    }

    const newTabsNode: DockingTabsNode = {
      type: 'tabs',
      id: nextDockId('tabs'),
      activeId: panelId,
      children: [panelId]
    };

    return {
      type: 'split',
      id: nextDockId('split'),
      direction: zone === 'left' || zone === 'right' ? 'row' : 'column',
      sizes: [1, 1],
      children: zone === 'left' || zone === 'top' ? [newTabsNode, node] : [node, newTabsNode]
    };
  }

  return {
    ...node,
    children: node.children.map((child) => splitTabsNode(child, targetNodeId, panelId, zone))
  };
}

function splitTabsNodeWithNode(
  node: DockingNode,
  targetNodeId: string,
  incomingNode: DockingTabsNode,
  zone: Exclude<DockingDropZone, 'center'>
): DockingNode {
  if (node.type === 'tabs') {
    if (node.id !== targetNodeId) {
      return node;
    }

    return {
      type: 'split',
      id: nextDockId('split'),
      direction: zone === 'left' || zone === 'right' ? 'row' : 'column',
      sizes: [1, 1],
      children: zone === 'left' || zone === 'top' ? [incomingNode, node] : [node, incomingNode]
    };
  }

  return {
    ...node,
    children: node.children.map((child) => splitTabsNodeWithNode(child, targetNodeId, incomingNode, zone))
  };
}

function splitRootNode(node: DockingNode, panelId: string, zone: Exclude<DockingDropZone, 'center'>): DockingNode {
  const newTabsNode: DockingTabsNode = {
    type: 'tabs',
    id: nextDockId('tabs'),
    activeId: panelId,
    children: [panelId]
  };

  return {
    type: 'split',
    id: nextDockId('split'),
    direction: zone === 'left' || zone === 'right' ? 'row' : 'column',
    sizes: [1, 1],
    children: zone === 'left' || zone === 'top' ? [newTabsNode, node] : [node, newTabsNode]
  };
}

function splitRootWithTabsNode(
  node: DockingNode,
  incomingNode: DockingTabsNode,
  zone: Exclude<DockingDropZone, 'center'>
): DockingNode {
  return {
    type: 'split',
    id: nextDockId('split'),
    direction: zone === 'left' || zone === 'right' ? 'row' : 'column',
    sizes: [1, 1],
    children: zone === 'left' || zone === 'top' ? [incomingNode, node] : [node, incomingNode]
  };
}

function isPointInRect(x: number, y: number, rect: DOMRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function getDropZone(rect: DOMRect, x: number, y: number): DockingDropZone {
  const edgeWidth = Math.min(Math.max(rect.width * 0.22, 24), 64);
  const edgeHeight = Math.min(Math.max(rect.height * 0.22, 24), 64);

  if (x < rect.left + edgeWidth) {
    return 'left';
  }
  if (x > rect.right - edgeWidth) {
    return 'right';
  }
  if (y < rect.top + edgeHeight) {
    return 'top';
  }
  if (y > rect.bottom - edgeHeight) {
    return 'bottom';
  }

  return 'center';
}

function getDropOverlayPositionClass(zone: DockingDropZone): string {
  switch (zone) {
    case 'left':
      return 'bottom-2 left-2 top-2 w-[28%]';
    case 'right':
      return 'bottom-2 right-2 top-2 w-[28%]';
    case 'top':
      return 'left-2 right-2 top-2 h-[28%]';
    case 'bottom':
      return 'bottom-2 left-2 right-2 h-[28%]';
    case 'center':
      return 'inset-2';
  }
}

const MIN_PANE_SIZE_PX = 120;
let dockIdCounter = 0;

function nextDockId(prefix: string): string {
  dockIdCounter += 1;
  return `${prefix}-${dockIdCounter}`;
}

const DEMO_LAYOUT = {
  type: 'split',
  id: 'root',
  direction: 'column',
  sizes: [2, 3],
  children: [
    {
      type: 'tabs',
      id: 'left-group',
      activeId: 'component-1',
      children: ['component-1', 'component-2']
    },
    {
      type: 'split',
      id: 'right-split',
      direction: 'row',
      sizes: [2, 3],
      children: [
        {
          type: 'tabs',
          id: 'top-right-group',
          activeId: 'component-3',
          children: ['component-3']
        },
        {
          type: 'tabs',
          id: 'bottom-right-group',
          activeId: 'component-4',
          children: ['component-4', 'component-5', 'component-3']
        }
      ]
    }
  ]
} satisfies DockingNode;
