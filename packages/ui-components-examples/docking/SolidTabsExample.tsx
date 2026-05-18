import { cn } from '@app-game/utils';
import { createDragSensor } from 'solid-dnd';
import { children, ComponentProps, createSignal, Index, JSX, Show } from 'solid-js';
import { DockingNode } from './SolidDockingExample';
import { Component1, Component2, Component3 } from './solid-docking/TestComponents';

export function SolidTabsExample(): JSX.Element {
  return (
    <div class="flex flex-col gap-3 bg-neutral-950 p-2 text-white">
      <DockingTabsView>
        <Component1 />
        <Component2 />
        <Component3 />
      </DockingTabsView>
    </div>
  );
}

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

type DockingDropTarget = {
  nodeId: string;
  zone: DockingDropZone;
};

type DockingDropZone = 'center' | 'left' | 'right' | 'top' | 'bottom';

function DockingTabsView(
  props: Partial<{
    children: JSX.Element;
    node: DockingTabsNode;
    items: Record<string, DockingItem>;
    onNodeChange: (node: DockingNode) => void;
    dragState: DockingDragState | undefined;
    dropTarget: DockingDropTarget | undefined;
    registerDropTarget: (nodeId: string, element: HTMLElement) => void;
    onTabDragStart: (dragState: DockingDragState) => void;
    onTabDragMove: (position: { x: number; y: number }) => void;
    onTabDragEnd: () => void;
  }>
): JSX.Element {
  const resolved = children(() => props.children);
  const [activeId, setActiveId] = createSignal(0);

  return (
    <div class="bg-neutral-925 flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div class="flex shrink-0 items-center">
        <div class="me-1 h-6 w-6 rounded-lg border border-white"></div>
        <Index each={resolved.toArray()}>
          {(_, index) => {
            return (
              <DockingTabButton
                index={index}
                border={index === 1}
                title={'Component ' + (index + 1)}
                isActive={activeId() === index}
                onClick={() => setActiveId(index)}
                // isDragged={() => draggedId() === index()}
              />
            );
          }}
        </Index>
      </div>

      {resolved.toArray()[activeId()]}
    </div>
  );
}

function DockingTabButton(
  props: Partial<{
    index?: number;
    panelId: string;
    title: string;
    closable?: boolean;
    isActive?: boolean;
    border?: boolean;
    isDragged: () => boolean;
    setTabRef: (panelId: string, element: HTMLButtonElement) => void;
    onActivate: (panelId: string) => void;
    onDragStart: (event: { position: { x: number; y: number } }) => void;
    onDragMove: (event: { position: { x: number; y: number } }) => void;
    onDragEnd: (event: { position: { x: number; y: number } }) => void;
    onDragCancel: () => void;
  }> &
    ComponentProps<'button'>
): JSX.Element {
  const sensor = createDragSensor({
    threshold: 6,
    onClick: () => {
      // props.onActivate?.(props.panelId);
    },
    onDragStart: (event) => {
      props.onClick?.();
      props.onDragStart?.({
        position: {
          x: event.position.x,
          y: event.position.y
        }
      });
    },
    onDragMove: (event) => {
      props.onDragMove?.({
        position: {
          x: event.position.x,
          y: event.position.y
        }
      });
    },
    onDragEnd: (event) => {
      props.onDragEnd?.({
        position: {
          x: event.position.x,
          y: event.position.y
        }
      });
    },
    onDragCancel: () => {
      props.onDragCancel?.();
    }
  });

  return (
    <button
      type="button"
      class={cn(
        'group outward-b relative flex touch-none items-center gap-2 px-3 py-1.5 text-sm text-white',
        'not-[.active]:hover:bg-neutral-850 not-[.active]:text-neutral-400 not-[.active]:hover:text-neutral-200',
        '[&.active]:outward-bg-neutral-700 [&.active]:z-1 [&.active]:bg-neutral-700',
        props.isActive && `active`,
        props.border && 'outward-border-1 [&.active]:outward-border-white',
        props.isDragged?.() && 'cursor-grabbing opacity-60',
        !props.isDragged?.() && 'cursor-grab'
      )}
      onPointerDown={sensor.onPointerDown}
      onClick={props.onClick}
      style={{
        transform: `translateX(${sensor.delta()?.x ?? 0}px)`
      }}
    >
      <span>{props.title}</span>
      <Show when={props.closable}>
        <span class="text-xs text-neutral-500">x</span>
      </Show>
    </button>
  );
}
