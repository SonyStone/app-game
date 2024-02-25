import { batch, createEffect, JSX, mergeProps, untrack } from 'solid-js'
import { createStore } from 'solid-js/store'

import { CollisionDetector, mostIntersecting } from './utils/collision'
import createContextProvider from './utils/create-context-provider'
import {
  elementLayout,
  Layout,
  layoutsAreEqual,
  noopTransform,
  Transform,
  transformLayout,
} from './utils/layout'

export type Id = string | number

export interface Coordinates {
  x: number
  y: number
}

export type SensorActivator<K extends keyof HTMLElementEventMap> = (
  event: HTMLElementEventMap[K],
  draggableId: Id,
) => void

interface Sensor {
  id: Id
  activators: { [K in keyof HTMLElementEventMap]?: SensorActivator<K> }
  coordinates: {
    origin: Coordinates
    current: Coordinates
    get delta(): Coordinates
  }
}

type TransformerCallback = (transform: Transform) => Transform

export interface Transformer {
  id: Id
  order: number
  callback: TransformerCallback
}

export interface Item {
  id: Id
  node: HTMLElement
  layout: Layout
  data: Record<string, any>
  transformers: Record<Id, Transformer>
  get transform(): Transform
  get transformed(): Layout
  _pendingCleanup?: boolean
}

export interface Draggable extends Item {}

export interface Droppable extends Item {}

export interface Overlay extends Item {}

export type DragEvent = {
  draggable: Draggable
  droppable?: Droppable | null
  overlay?: Overlay | null
}

export type Listeners = Record<
  string,
  (event: HTMLElementEventMap[keyof HTMLElementEventMap]) => void
>

export type DragEventHandler = (event: DragEvent) => void

export const [DragDropProvider, useDragDropContext] = createContextProvider(
  (passedProps: {
    onDragStart?: DragEventHandler
    onDragMove?: DragEventHandler
    onDragOver?: DragEventHandler
    onDragEnd?: DragEventHandler
    collisionDetector?: CollisionDetector
    children?: JSX.Element
  }) => {
    const props = mergeProps({ collisionDetector: mostIntersecting }, passedProps)

    const [state, setState] = createStore<{
      draggables: Record<Id, Draggable>
      droppables: Record<Id, Droppable>
      sensors: Record<Id, Sensor>
      active: {
        draggableId: Id | null
        draggable: Draggable | null | undefined
        droppableId: Id | null
        droppable: Droppable | null | undefined
        sensorId: Id | null
        sensor: Sensor | null | undefined
        overlay: Overlay | null
      }
    }>({
      draggables: {},
      droppables: {},
      sensors: {},
      active: {
        draggableId: null,
        get draggable(): Draggable | null | undefined {
          return state.active.draggableId !== null
            ? state.draggables[state.active.draggableId]
            : null
        },
        droppableId: null,
        get droppable(): Droppable | null | undefined {
          return state.active.droppableId !== null
            ? state.droppables[state.active.droppableId]
            : null
        },
        sensorId: null,
        get sensor(): Sensor | null | undefined {
          return state.active.sensorId !== null ? state.sensors[state.active.sensorId] : null
        },
        overlay: null,
      },
    })

    const addTransformer = (
      type: 'draggables' | 'droppables',
      id: Id,
      transformer: Transformer,
    ): void => {
      if (!untrack(() => state[type][id])) {
        console.warn(`Cannot add transformer to nonexistent ${toDisplay(type)} with id: ${id}`)
        return
      }

      setState(type, id, 'transformers', transformer.id, transformer)
    }

    const removeTransformer = (
      type: 'draggables' | 'droppables',
      id: Id,
      transformerId: Id,
    ): void => {
      if (!untrack(() => state[type][id])) {
        console.warn(`Cannot remove transformer from nonexistent ${toDisplay(type)} with id: ${id}`)
        return
      }

      if (!untrack(() => state[type][id]?.['transformers'][transformerId])) {
        console.warn(
          `Cannot remove from ${toDisplay(
            type,
          )} with id ${id}, nonexistent transformer with id: ${transformerId}`,
        )
        return
      }

      setState(type, id, 'transformers', transformerId, undefined!)
    }

    const addDraggable = ({
      id,
      node,
      layout,
      data,
    }: Omit<Draggable, 'transform' | 'transformed' | 'transformers'>): void => {
      const existingDraggable = state.draggables[id]

      const draggable = {
        id,
        node,
        layout,
        data,
        _pendingCleanup: false,
      }
      let transformer: Transformer | undefined

      if (!existingDraggable) {
        Object.defineProperties(draggable, {
          transformers: {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {},
          },
          transform: {
            enumerable: true,
            configurable: true,
            get: () => {
              if (state.active.overlay) {
                return noopTransform()
              }

              const transformers = Object.values(state.draggables[id]!.transformers)
              transformers.sort((a, b) => a.order - b.order)

              return transformers.reduce((transform: Transform, transformer: Transformer) => {
                return transformer.callback(transform)
              }, noopTransform())
            },
          },
          transformed: {
            enumerable: true,
            configurable: true,
            get: () => {
              return transformLayout(state.draggables[id]!.layout, state.draggables[id]!.transform)
            },
          },
        })
      } else if (state.active.draggableId === id && !state.active.overlay) {
        const layoutDelta = {
          x: existingDraggable.layout.x - layout.x,
          y: existingDraggable.layout.y - layout.y,
        }

        const transformerId = 'addDraggable-existing-offset'
        const existingTransformer = existingDraggable.transformers[transformerId]
        const transformOffset = existingTransformer
          ? existingTransformer.callback(layoutDelta)
          : layoutDelta

        transformer = {
          id: transformerId,
          order: 100,
          callback: transform => {
            return {
              x: transform.x + transformOffset.x,
              y: transform.y + transformOffset.y,
            }
          },
        }

        onDragEnd(() => removeTransformer('draggables', id, transformerId))
      }

      batch(() => {
        setState('draggables', id, draggable)
        if (transformer) {
          addTransformer('draggables', id, transformer)
        }
      })

      if (state.active.draggable) {
        recomputeLayouts()
      }
    }

    const removeDraggable = (id: Id): void => {
      if (!untrack(() => state.draggables[id])) {
        console.warn(`Cannot remove nonexistent draggable with id: ${id}`)
        return
      }

      setState('draggables', id, '_pendingCleanup', true)
      queueMicrotask(() => cleanupDraggable(id))
    }

    const cleanupDraggable = (id: Id): void => {
      if (state.draggables[id]?._pendingCleanup) {
        const cleanupActive = state.active.draggableId === id
        batch(() => {
          if (cleanupActive) {
            setState('active', 'draggableId', null)
          }
          setState('draggables', id, undefined!)
        })
      }
    }

    const addDroppable = ({
      id,
      node,
      layout,
      data,
    }: Omit<Droppable, 'transform' | 'transformed' | 'transformers'>): void => {
      const existingDroppable = state.droppables[id]

      const droppable = {
        id,
        node,
        layout,
        data,
        _pendingCleanup: false,
      }

      if (!existingDroppable) {
        Object.defineProperties(droppable, {
          transformers: {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {},
          },
          transform: {
            enumerable: true,
            configurable: true,
            get: () => {
              const transformers = Object.values(state.droppables[id]!.transformers)
              transformers.sort((a, b) => a.order - b.order)

              return transformers.reduce((transform: Transform, transformer: Transformer) => {
                return transformer.callback(transform)
              }, noopTransform())
            },
          },
          transformed: {
            enumerable: true,
            configurable: true,
            get: () => {
              return transformLayout(state.droppables[id]!.layout, state.droppables[id]!.transform)
            },
          },
        })
      }

      setState('droppables', id, droppable)

      if (state.active.draggable) {
        recomputeLayouts()
      }
    }

    const removeDroppable = (id: Id): void => {
      if (!untrack(() => state.droppables[id])) {
        console.warn(`Cannot remove nonexistent droppable with id: ${id}`)
        return
      }

      setState('droppables', id, '_pendingCleanup', true)
      queueMicrotask(() => cleanupDroppable(id))
    }

    const cleanupDroppable = (id: Id): void => {
      if (state.droppables[id]?._pendingCleanup) {
        const cleanupActive = state.active.droppableId === id
        batch(() => {
          if (cleanupActive) {
            setState('active', 'droppableId', null)
          }
          setState('droppables', id, undefined!)
        })
      }
    }

    /**
     * App pointer douw sensor
     */
    const addSensor = ({ id, activators }: Omit<Sensor, 'coordinates'>): void => {
      setState('sensors', id, {
        id,
        activators,
        coordinates: {
          origin: { x: 0, y: 0 },
          current: { x: 0, y: 0 },
          get delta() {
            const sensor = state.sensors[id]!
            return {
              x: sensor.coordinates.current.x - sensor.coordinates.origin.x,
              y: sensor.coordinates.current.y - sensor.coordinates.origin.y,
            }
          },
        },
      })
    }

    const removeSensor = (id: Id): void => {
      if (!untrack(() => state.sensors[id])) {
        console.warn(`Cannot remove nonexistent sensor with id: ${id}`)
        return
      }

      const cleanupActive = state.active.sensorId === id
      batch(() => {
        if (cleanupActive) {
          setState('active', 'sensorId', null)
        }
        setState('sensors', id, undefined!)
      })
    }

    const setOverlay = ({ node, layout }: Pick<Overlay, 'node' | 'layout'>): void => {
      const existing = state.active.overlay
      const overlay = {
        node,
        layout,
      }

      if (!existing) {
        Object.defineProperties(overlay, {
          id: {
            enumerable: true,
            configurable: true,
            get: () => state.active.draggable?.id,
          },
          data: {
            enumerable: true,
            configurable: true,
            get: () => state.active.draggable?.data,
          },
          transformers: {
            enumerable: true,
            configurable: true,
            get: () =>
              Object.fromEntries(
                Object.entries(
                  state.active.draggable ? state.active.draggable.transformers : {},
                ).filter(([id]) => id !== 'addDraggable-existing-offset'),
              ),
          },
          transform: {
            enumerable: true,
            configurable: true,
            get: () => {
              const transformers = Object.values(
                state.active.overlay ? state.active.overlay.transformers : [],
              )
              transformers.sort((a, b) => a.order - b.order)

              return transformers.reduce((transform: Transform, transformer: Transformer) => {
                return transformer.callback(transform)
              }, noopTransform())
            },
          },
          transformed: {
            enumerable: true,
            configurable: true,
            get: () => {
              return state.active.overlay
                ? transformLayout(state.active.overlay!.layout, state.active.overlay!.transform)
                : new Layout({ x: 0, y: 0, width: 0, height: 0 })
            },
          },
        })
      }

      setState('active', 'overlay', overlay)
    }

    const clearOverlay = (): void => setState('active', 'overlay', null)

    const sensorStart = (id: Id, coordinates: Coordinates): void => {
      batch(() => {
        setState('sensors', id, 'coordinates', {
          origin: { ...coordinates },
          current: { ...coordinates },
        })
        setState('active', 'sensorId', id)
      })
    }

    const sensorMove = (coordinates: Coordinates): void => {
      const sensorId = state.active.sensorId
      if (!sensorId) {
        console.warn('Cannot move sensor when no sensor active.')
        return
      }

      setState('sensors', sensorId, 'coordinates', 'current', {
        ...coordinates,
      })
    }

    const sensorEnd = (): void => setState('active', 'sensorId', null)

    const draggableActivators = (draggableId: Id, asHandlers?: boolean): Listeners => {
      const eventMap: Record<
        string,
        Array<{
          sensor: Sensor
          activator: SensorActivator<keyof HTMLElementEventMap>
        }>
      > = {}

      for (const sensor of Object.values(state.sensors)) {
        if (sensor) {
          for (const [type, activator] of Object.entries(sensor.activators)) {
            eventMap[type] ??= []
            eventMap[type]!.push({
              sensor,
              activator: activator as SensorActivator<keyof HTMLElementEventMap>,
            })
          }
        }
      }

      const listeners: Listeners = {}
      for (const key in eventMap) {
        let handlerKey = key
        if (asHandlers) {
          handlerKey = `on${key}`
        }
        listeners[handlerKey] = event => {
          for (const { activator } of eventMap[key]!) {
            if (state.active.sensor) {
              break
            }
            activator(event, draggableId)
          }
        }
      }

      return listeners
    }

    const recomputeLayouts = (): boolean => {
      let anyLayoutChanged = false

      const draggables = Object.values(state.draggables)
      const droppables = Object.values(state.droppables)
      const overlay = state.active.overlay

      batch(() => {
        const cache: WeakMap<Element, Layout> = new WeakMap()

        for (const draggable of draggables) {
          if (draggable) {
            const currentLayout = draggable.layout

            if (!cache.has(draggable.node)) {
              cache.set(draggable.node, elementLayout(draggable.node))
            }
            const layout = cache.get(draggable.node)!

            if (!layoutsAreEqual(currentLayout, layout)) {
              setState('draggables', draggable.id, 'layout', layout)
              anyLayoutChanged = true
            }
          }
        }

        for (const droppable of droppables) {
          if (droppable) {
            const currentLayout = droppable.layout

            if (!cache.has(droppable.node)) cache.set(droppable.node, elementLayout(droppable.node))
            const layout = cache.get(droppable.node)!

            if (!layoutsAreEqual(currentLayout, layout)) {
              setState('droppables', droppable.id, 'layout', layout)
              anyLayoutChanged = true
            }
          }
        }

        if (overlay) {
          const currentLayout = overlay.layout
          const layout = elementLayout(overlay.node)
          if (!layoutsAreEqual(currentLayout, layout)) {
            setState('active', 'overlay', 'layout', layout)
            anyLayoutChanged = true
          }
        }
      })

      return anyLayoutChanged
    }

    const detectCollisions = (): void => {
      const draggable = state.active.overlay ?? state.active.draggable
      if (draggable) {
        const droppable = props.collisionDetector(draggable, Object.values(state.droppables), {
          activeDroppableId: state.active.droppableId,
        })

        const droppableId: Id | null = droppable ? droppable.id : null

        if (state.active.droppableId !== droppableId) {
          setState('active', 'droppableId', droppableId)
        }
      }
    }

    const dragStart = (draggableId: Id): void => {
      const transformer: Transformer = {
        id: 'sensorMove',
        order: 0,
        callback: transform => {
          if (state.active.sensor) {
            return {
              x: transform.x + state.active.sensor.coordinates.delta.x,
              y: transform.y + state.active.sensor.coordinates.delta.y,
            }
          }
          return transform
        },
      }

      recomputeLayouts()

      batch(() => {
        setState('active', 'draggableId', draggableId)
        addTransformer('draggables', draggableId, transformer)
      })

      detectCollisions()
    }

    const dragEnd = (): void => {
      const draggableId = untrack(() => state.active.draggableId)
      batch(() => {
        if (draggableId !== null) {
          removeTransformer('draggables', draggableId, 'sensorMove')
        }
        setState('active', ['draggableId', 'droppableId'], null)
      })

      recomputeLayouts()
    }

    const onDragStart = (handler: DragEventHandler): void => {
      createEffect(() => {
        const draggable = state.active.draggable
        if (draggable) {
          untrack(() => handler({ draggable }))
        }
      })
    }

    const onDragMove = (handler: DragEventHandler): void => {
      createEffect(() => {
        const draggable = state.active.draggable
        if (draggable) {
          const overlay = untrack(() => state.active.overlay)
          Object.values(overlay ? overlay.transform : draggable.transform)
          untrack(() => handler({ draggable, overlay }))
        }
      })
    }

    const onDragOver = (handler: DragEventHandler): void => {
      createEffect(() => {
        const draggable = state.active.draggable
        const droppable = state.active.droppable
        if (draggable) {
          untrack(() => handler({ draggable, droppable, overlay: state.active.overlay }))
        }
      })
    }

    const onDragEnd = (handler: DragEventHandler): void => {
      createEffect(
        ({ previousDraggable, previousDroppable, previousOverlay }) => {
          const draggable = state.active.draggable
          const droppable = draggable ? state.active.droppable : null
          const overlay = draggable ? state.active.overlay : null

          if (!draggable && previousDraggable) {
            untrack(() =>
              handler({
                draggable: previousDraggable,
                droppable: previousDroppable,
                overlay: previousOverlay,
              }),
            )
          }
          return {
            previousDraggable: draggable,
            previousDroppable: droppable,
            previousOverlay: overlay,
          }
        },
        {
          previousDraggable: null,
          previousDroppable: null,
          previousOverlay: null,
        },
      )
    }

    onDragMove(() => detectCollisions())

    props.onDragStart && onDragStart(props.onDragStart)
    props.onDragMove && onDragMove(props.onDragMove)
    props.onDragOver && onDragOver(props.onDragOver)
    props.onDragEnd && onDragEnd(props.onDragEnd)

    return [
      state,
      {
        addTransformer: addTransformer,
        removeTransformer: removeTransformer,
        addDraggable: addDraggable,
        removeDraggable: removeDraggable,
        addDroppable: addDroppable,
        removeDroppable: removeDroppable,
        addSensor: addSensor,
        removeSensor: removeSensor,
        setOverlay: setOverlay,
        clearOverlay: clearOverlay,
        recomputeLayouts: recomputeLayouts,
        detectCollisions: detectCollisions,
        draggableActivators: draggableActivators,
        sensorStart: sensorStart,
        sensorMove: sensorMove,
        sensorEnd: sensorEnd,
        dragStart: dragStart,
        dragEnd: dragEnd,
        onDragStart: onDragStart,
        onDragMove: onDragMove,
        onDragOver: onDragOver,
        onDragEnd: onDragEnd,
      },
    ] as const
  },
)

const toDisplay = (type: string) => type.substring(0, type.length - 1)
