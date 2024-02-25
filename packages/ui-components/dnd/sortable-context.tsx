import { createEffect, JSX, untrack } from 'solid-js'
import { createStore } from 'solid-js/store'

import { Id, useDragDropContext } from './drag-drop-context'
import createContextProvider from './utils/create-context-provider'
import { moveArrayItem } from './utils/move-array-item'

export const [SortableProvider, useSortableContext] = createContextProvider(
  (props: { ids: Array<Id>; children: JSX.Element }) => {
    const [dndState] = useDragDropContext()!

    const [state, setState] = createStore<{
      initialIds: Array<Id>
      sortedIds: Array<Id>
    }>({
      initialIds: [],
      sortedIds: [],
    })

    const isValidIndex = (index: number): boolean => {
      return index >= 0 && index < state.initialIds.length
    }

    createEffect(() => {
      setState('initialIds', [...props.ids])
      setState('sortedIds', [...props.ids])
    })

    createEffect(() => {
      const { draggableId, droppableId } = dndState.active
      if (draggableId && droppableId) {
        console.log(`draggableId, droppableId`, draggableId, droppableId)
        untrack(() => {
          const fromIndex = state.sortedIds.indexOf(draggableId!)
          const toIndex = state.initialIds.indexOf(droppableId!)

          if (!isValidIndex(fromIndex) || !isValidIndex(toIndex)) {
            setState('sortedIds', [...props.ids])
          } else if (fromIndex !== toIndex) {
            const resorted = moveArrayItem(state.sortedIds, fromIndex, toIndex)
            setState('sortedIds', resorted)
          }
        })
      } else {
        setState('sortedIds', [...props.ids])
      }
    })

    return [state, {}] as const
  },
)
