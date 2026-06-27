import { PropsProxy } from '@app-game/solid-props-proxy';
import { cn } from '@app-game/utils';
import { DragSensor } from 'solid-dnd';
import { children, createSignal, Index, JSX } from 'solid-js';
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
    <DragSensor.Scope threshold={6}>
      {(dragScope) => (
        <div class="bg-neutral-925 flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
          <div class="relative flex shrink-0 items-center">
            <div class="me-1 h-6 w-6 rounded-lg border border-white"></div>
            {/* <div class="absolute inset-0 border border-white"></div> */}
            <Index each={resolved.toArray()}>
              {(_, index) => {
                let ref: HTMLButtonElement | null = null;

                return (
                  // <DockingTabButton
                  //   index={index}
                  //   border={index === 1}
                  //   title={'Component ' + (index + 1)}
                  //   isActive={activeId() === index}

                  //   // isDragged={() => draggedId() === index()}
                  // />
                  <DragSensor
                    data={{ index }}
                    onDragStart={(event) => {
                      console.log('Drag start', event.source.element, event.source.data.index);
                    }}
                  >
                    <button
                      type="button"
                      ref={(element) => {
                        ref = element;
                      }}
                      class={cn(
                        'group outward-b-lg relative flex touch-none items-center gap-2 px-3 py-1.5 text-sm text-white',
                        'not-[.active]:hover:bg-neutral-850 not-[.active]:text-neutral-400 not-[.active]:hover:text-neutral-200',
                        '[&.active]:outward-bg-neutral-700 [&.active]:z-1 [&.active]:bg-neutral-700',
                        activeId() === index && `active`,
                        index === 1 && 'outward-border-1 [&.active]:outward-border-white'
                        // props.isDragged?.() && 'cursor-grabbing opacity-60',
                        // !props.isDragged?.() && 'cursor-grab'
                      )}
                      onClick={() => setActiveId(index)}
                    >
                      <span>{'Component ' + (index + 1)}</span>
                    </button>
                  </DragSensor>
                );
              }}
            </Index>
          </div>

          {resolved.toArray()[activeId()]}

          <PropsProxy
            target={dragScope.activeSource()?.element}
            aria-description="Selected view"
            style={{
              transform: `translateX(${dragScope.delta()?.x ?? 0}px)`
            }}
          />
        </div>
      )}
    </DragSensor.Scope>
  );
}
