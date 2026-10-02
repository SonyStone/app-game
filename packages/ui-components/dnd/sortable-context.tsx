import type { JSX } from '@solidjs/web';
import { createStore, createTrackedEffect, untrack } from 'solid-js';

import { Id, useDragDropContext } from './drag-drop-context';
import createContextProvider from './utils/create-context-provider';
import { moveArrayItem } from './utils/move-array-item';

export const [SortableProvider, useSortableContext] = createContextProvider(
  (props: { ids: Array<Id>; children: JSX.Element }) => {
    const [dndState] = useDragDropContext()!;

    const [state, setState] = createStore<{
      initialIds: Array<Id>;
      sortedIds: Array<Id>;
    }>({
      initialIds: [],
      sortedIds: []
    });

    const isValidIndex = (index: number): boolean => {
      return index >= 0 && index < state.initialIds.length;
    };

    createTrackedEffect(() => {
      setState((draft) => {
        draft.initialIds = [...props.ids];
        draft.sortedIds = [...props.ids];
      });
    });

    createTrackedEffect(() => {
      const { draggableId, droppableId } = dndState.active;
      if (draggableId && droppableId) {
        console.log(`draggableId, droppableId`, draggableId, droppableId);
        untrack(() => {
          const fromIndex = state.sortedIds.indexOf(draggableId!);
          const toIndex = state.initialIds.indexOf(droppableId!);

          if (!isValidIndex(fromIndex) || !isValidIndex(toIndex)) {
            setState((draft) => {
              draft.sortedIds = [...props.ids];
            });
          } else if (fromIndex !== toIndex) {
            const resorted = moveArrayItem(state.sortedIds, fromIndex, toIndex);
            setState((draft) => {
              draft.sortedIds = resorted;
            });
          }
        });
      } else {
        setState((draft) => {
          draft.sortedIds = [...props.ids];
        });
      }
    });

    return [state, {}] as const;
  }
);
