import {
  closestCenter,
  createSortable,
  DragDropProvider,
  DragDropSensors,
  DragEventHandler,
  DragOverlay,
  Id,
  SortableProvider,
  useDragDropContext
} from '@thisbeyond/solid-dnd';
import { createSignal, For } from 'solid-js';
import folder from './folder.png?url';

export default function Layers() {
  console.log(folder);
  return (
    <div
      style={{
        '--icon-folder': `url(${folder})`
      }}
    >
      <div class="w-268px bg-[#474747]">
        {/* <For each={[1, 2, 3, 4, 5]}>
          {() => (
            <div class="h-28px cursor-pointer border border-solid border-[#252525]">
              <div class="w-1.7em filter-invert-78 h-full bg-center bg-no-repeat [background-image:var(--icon-folder)] [background-size:15px]"></div>
            </div>
          )}
        </For> */}
        <SortableVerticalListExample />
      </div>
    </div>
  );
}

const Sortable = (props: any) => {
  const sortable = createSortable(props.item);
  const [state] = useDragDropContext();
  return (
    <div
      use:sortable
      class="h-28px flex cursor-pointer border border-solid border-[#252525] text-white"
      classList={{
        'opacity-25': sortable.isActiveDraggable,
        'transition-transform': !!state.active.draggable
      }}
    >
      <div class="w-1.7em filter-invert-78 h-full bg-center bg-no-repeat [background-image:var(--icon-folder)] [background-size:15px]"></div>
      {props.item}
    </div>
  );
};

export const SortableVerticalListExample = () => {
  const [items, setItems] = createSignal<Id[]>([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const [activeItem, setActiveItem] = createSignal<Id | null>(null);
  const ids = () => items();

  const onDragStart: DragEventHandler = ({ draggable }) => setActiveItem(draggable.id);

  const onDragEnd: DragEventHandler = ({ draggable, droppable }) => {
    if (draggable && droppable) {
      const currentItems = ids();
      const fromIndex = currentItems.indexOf(draggable.id);
      const toIndex = currentItems.indexOf(droppable.id);
      if (fromIndex !== toIndex) {
        const updatedItems = currentItems.slice();
        updatedItems.splice(toIndex, 0, ...updatedItems.splice(fromIndex, 1));
        setItems(updatedItems);
      }
    }
  };

  return (
    <DragDropProvider onDragStart={onDragStart} onDragEnd={onDragEnd} collisionDetector={closestCenter}>
      <DragDropSensors />
      <div class="column self-stretch">
        <SortableProvider ids={ids()}>
          <For each={items()}>{(item) => <Sortable item={item} />}</For>
        </SortableProvider>
      </div>
      <DragOverlay>
        <div
          style={{
            '--icon-folder': `url(${folder})`
          }}
          class="h-28px flex cursor-pointer border border-solid border-[#252525] bg-[#474747] text-white"
        >
          <div class="w-1.7em filter-invert-78 h-full bg-center bg-no-repeat [background-image:var(--icon-folder)] [background-size:15px]"></div>
          {activeItem()}
        </div>
      </DragOverlay>
    </DragDropProvider>
  );
};
