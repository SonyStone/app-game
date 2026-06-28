import type { Accessor, Setter } from 'solid-js'
import type { ToolMode } from '../../shared/toolMode'
import {
  getPointerCenter,
  getPointerDistance,
  getViewAction,
  type PointerCenter,
  type ViewAction,
} from './pointerGestures'
import type { InteractionViewport } from './viewportPort'

type ViewportNavigationParams = {
  mode: Accessor<ToolMode>
  renderer: Accessor<InteractionViewport | undefined>
  setPointerLabel: Setter<string>
}

type PointerMoveResult =
  | { status: 'handled' }
  | { status: 'ignored' }
  | { status: 'unhandled' }

export function createViewportNavigation(params: ViewportNavigationParams) {
  const activePointers = new Map<number, PointerEvent>()
  let viewPointerId: number | undefined
  let viewAction: ViewAction | undefined
  let lastViewPoint: { x: number; y: number } | undefined
  let lastPinchDistance: number | undefined
  let lastPinchCenter: PointerCenter | undefined

  const startPointer = (event: PointerEvent) => {
    activePointers.set(event.pointerId, event)

    if (activePointers.size === 2) {
      viewPointerId = undefined
      viewAction = undefined
      lastViewPoint = undefined
      lastPinchDistance = getPointerDistance(activePointers.values())
      lastPinchCenter = getPointerCenter(activePointers.values())
      params.setPointerLabel('Touch pan/zoom')
      return true
    }

    const nextViewAction = getViewAction(params.mode(), event)
    if (!nextViewAction) return false

    viewPointerId = event.pointerId
    viewAction = nextViewAction
    lastViewPoint = { x: event.clientX, y: event.clientY }
    params.setPointerLabel(
      event.pointerType === 'touch' && nextViewAction === 'orbit'
        ? 'Touch orbit'
        : nextViewAction === 'pan'
          ? 'Pan'
          : 'Orbit',
    )
    return true
  }

  const movePointer = (event: PointerEvent): PointerMoveResult => {
    if (!activePointers.has(event.pointerId)) return { status: 'ignored' }
    activePointers.set(event.pointerId, event)

    if (activePointers.size >= 2) {
      moveTouchViewport()
      return { status: 'handled' }
    }

    if (viewPointerId === event.pointerId && lastViewPoint && viewAction) {
      const dx = event.clientX - lastViewPoint.x
      const dy = event.clientY - lastViewPoint.y
      if (viewAction === 'pan') params.renderer()?.pan(dx, dy)
      else params.renderer()?.orbit(dx, dy)
      lastViewPoint = { x: event.clientX, y: event.clientY }
      return { status: 'handled' }
    }

    return { status: 'unhandled' }
  }

  const releasePointer = (event: PointerEvent) => {
    activePointers.delete(event.pointerId)
    if (viewPointerId === event.pointerId) {
      viewPointerId = undefined
      viewAction = undefined
      lastViewPoint = undefined
      params.setPointerLabel('Ready')
    }
    if (activePointers.size < 2) {
      lastPinchDistance = undefined
      lastPinchCenter = undefined
      startRemainingTouchOrbit()
    }
  }

  const moveTouchViewport = () => {
    const nextDistance = getPointerDistance(activePointers.values())
    if (nextDistance && lastPinchDistance) {
      params.renderer()?.zoom((lastPinchDistance - nextDistance) * 2.2)
    }
    const nextCenter = getPointerCenter(activePointers.values())
    if (nextCenter && lastPinchCenter) {
      params.renderer()?.pan(
        nextCenter.x - lastPinchCenter.x,
        nextCenter.y - lastPinchCenter.y,
      )
    }
    lastPinchDistance = nextDistance
    lastPinchCenter = nextCenter
    params.setPointerLabel('Touch pan/zoom')
  }

  const startRemainingTouchOrbit = () => {
    if (activePointers.size !== 1) return

    const [remainingPointer] = activePointers.values()
    if (!remainingPointer || remainingPointer.pointerType !== 'touch') return

    viewPointerId = remainingPointer.pointerId
    viewAction = 'orbit'
    lastViewPoint = {
      x: remainingPointer.clientX,
      y: remainingPointer.clientY,
    }
    params.setPointerLabel('Touch orbit')
  }

  return {
    movePointer,
    releasePointer,
    startPointer,
  } as const
}
