import { createLazyMemo } from '@solid-primitives/memo';
import { createContextProvider } from '@utils/createContextProvider';
import { batch, createSignal } from 'solid-js';
import { Path } from './TreeViewUtils';

type DragEvent = globalThis.DragEvent & {
  currentTarget: HTMLElement;
  target: Element;
};

export function createDragAndDrop(
  props: Partial<{
    onMoveNode: (from: Path, to: Path) => void;
  }>
) {
  const [target, setTarget] = createSignal<HTMLElement | null>(null);
  const rect = createLazyMemo(() => getRect(target()) ?? undefined);
  const hasSubnodes = createLazyMemo(() => target()?.dataset.hasSubnodes === 'true');

  const [dragging, setDragging] = createSignal(false);

  const paths = {
    pathFrom: [] as Path,
    pathTo: [] as Path
  };

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
      batch(() => {
        setDragging(false);
        console.log('No data transfer on drop', e.dataTransfer?.getData('application/json'));
        if (!e.dataTransfer) {
          return;
        }
        const target = e.target.closest('[data-droppable]') as HTMLElement | null;
        const pathTo = JSON.parse(`[${target?.dataset?.pathTo ?? ''}]`) as Path;
        paths.pathTo = pathTo;

        props.onMoveNode?.(paths.pathFrom, paths.pathTo);
      });

      // const data = e.dataTransfer?.getData('text/plain');
      // const data2 = e.dataTransfer?.getData('application/json');
      // console.log('Dropped data:', e.dataTransfer, data);
    }
  } as const;

  const dragHandlers = <T>(props: { data: T }) =>
    ({
      draggable: true,
      onDragStart: (e: DragEvent) => {
        if (!e.dataTransfer) {
          return;
        }

        const pathFrom = JSON.parse(`[${(e.target as HTMLElement)?.dataset?.pathFrom ?? ''}]`) as Path;
        paths.pathFrom = pathFrom;

        // e.dataTransfer.dropEffect = 'none';
        e.dataTransfer.setData('application/json', JSON.stringify(props.data));
        e.dataTransfer.setData('text/plain', JSON.stringify(props.data, null, 2));
        // console.log('Drag Start:', e.dataTransfer);
      },
      onDragEnd: (e: DragEvent) => {
        setDragging(false);
        // console.log('Drag End On Source:', e.dataTransfer);
      }
    }) as const;

  const droppable = ({ hasSubnodes = false } = {}) =>
    ({
      'data-droppable': true,
      'data-has-subnodes': hasSubnodes
    }) as const;

  return { rect, dragging, hasSubnodes, setDragging, dropHandlers, dragHandlers, droppable } as const;
}

export const [DragAndDropProvider, useDragAndDropContext, DragAndDropConsumer] = createContextProvider(
  (
    props: Partial<{
      onMoveNode: (from: Path, to: Path) => void;
    }>
  ) => {
    return createDragAndDrop(props);
  }
);

function getRect(element: HTMLElement | null) {
  return element
    ? ({
        top: element.offsetTop,
        left: element.offsetLeft,
        width: element.offsetWidth,
        height: element.offsetHeight
      } as const)
    : undefined;
}
