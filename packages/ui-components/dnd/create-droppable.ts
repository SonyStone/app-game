import { createSignal, createTrackedEffect, onCleanup, onSettled, Setter } from 'solid-js';

import { Id, useDragDropContext } from './drag-drop-context';
import { elementLayout, isTransformsAreEqual, noopTransform, Transform } from './utils/layout';
import { transformStyle } from './utils/style';

interface Droppable {
  (element: HTMLElement, accessor?: () => { skipTransform?: boolean }): void;
  ref: Setter<HTMLElement | null>;
  get isActiveDroppable(): boolean;
  get transform(): Transform;
}

export const createDroppable = (id: Id, data: Record<string, any> = {}): Droppable => {
  const [state, { addDroppable, removeDroppable }] = useDragDropContext()!;
  const [node, setNode] = createSignal<HTMLElement | null>(null);

  onSettled(() => {
    const resolvedNode = node();

    if (resolvedNode) {
      addDroppable({
        id,
        node: resolvedNode,
        layout: elementLayout(resolvedNode),
        data
      });
    }
  });

  onCleanup(() => removeDroppable(id));

  const transform = () => {
    return state.droppables[id]?.transform || noopTransform();
  };

  return Object.defineProperties(
    (element: HTMLElement, accessor?: () => { skipTransform?: boolean }) => {
      const config = accessor ? accessor() : {};

      setNode(element);

      if (!config.skipTransform) {
        createTrackedEffect(() => {
          const resolvedTransform = transform();
          if (!isTransformsAreEqual(resolvedTransform, noopTransform())) {
            const style = transformStyle(transform());
            element.style.setProperty('transform', style.transform ?? null);
          } else {
            element.style.removeProperty('transform');
          }
        });
      }
    },
    {
      ref: {
        enumerable: true,
        value: setNode
      },
      isActiveDroppable: {
        enumerable: true,
        get: () => state.active.droppableId === id
      },
      transform: {
        enumerable: true,
        get: transform
      }
    }
  ) as Droppable;
};
