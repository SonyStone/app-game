import { createLazyMemo } from '@solid-primitives/memo';
import { createContextProvider } from '@utils/createContextProvider';
import { batch, createSignal } from 'solid-js';

type DragEvent = globalThis.DragEvent & {
  currentTarget: HTMLElement;
  target: Element;
};

export const [DragAndDropProvider, useDragAndDropContext, DragAndDropConsumer] = createContextProvider(() => {
  const [target, setTarget] = createSignal<HTMLElement | null>(null);
  const rect = createLazyMemo(() => target()?.getBoundingClientRect() ?? undefined);
  const hasSubnodes = createLazyMemo(() => target()?.dataset.hasSubnodes === 'true');

  const [dragging, setDragging] = createSignal(false);

  const dropHandlers = {
    onDragEnter: (e: DragEvent) => {
      e.preventDefault();
      const target = e.target.closest('[data-droppable]') as HTMLElement | null;
      batch(() => {
        setTarget(target);
        setDragging(true);
      });
      return false;
    },
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      return false;
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (!e.dataTransfer) {
        return;
      }
      const data = e.dataTransfer?.getData('text/plain');
      // const data2 = e.dataTransfer?.getData('application/json');
      console.log('Dropped data:', e.dataTransfer, data);
    }
  } as const;

  const dragHandlers = <T>(props: { data: T }) =>
    ({
      draggable: true,
      onDragStart: (e: DragEvent) => {
        if (!e.dataTransfer) {
          return;
        }
        // e.dataTransfer.dropEffect = 'none';
        e.dataTransfer.setData('application/json', JSON.stringify(props.data));
        e.dataTransfer.setData('text/plain', JSON.stringify(props.data));
        console.log('Drag Start:', e.dataTransfer);
      },
      onDragEnd: (e: DragEvent) => {
        console.log('Drag End On Source:', e.dataTransfer);
      }
    }) as const;

  const droppable = ({ hasSubnodes = false } = {}) =>
    ({
      'data-droppable': true,
      'data-has-subnodes': hasSubnodes
    }) as const;

  return { rect, dragging, hasSubnodes, setDragging, dropHandlers, dragHandlers, droppable } as const;
});
