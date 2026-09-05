import {
  orbitOrientation,
  rotateOrientation,
  sameOrientation,
  type Vec3,
  type ViewNavigation,
  type ViewOrientation,
  type ViewReferenceFrame
} from './orientation'

/** One captured pointer owns a gesture. Click remains a native button action. */
export function createPointerGesture(options: {
  orientation: () => ViewOrientation
  disabled: () => boolean
  emit: (request: ViewNavigation) => void
  finish: (orientation: ViewOrientation) => void
  referenceFrame?: () => ViewReferenceFrame | undefined
}) {
  let active:
    | {
        pointerId: number
        element: Element
        startX: number
        startY: number
        initial: ViewOrientation
        current: ViewOrientation
        observed: ViewOrientation
        dragged: boolean
        source: 'drag' | 'compass-drag' | 'roll-drag'
        compass:
          | {
              axis: Vec3
              angle: (x: number, y: number) => number | undefined
              last: number | undefined
              total: number
            }
          | undefined
        scale: number
      }
    | undefined
  let suppressClick = false

  const emit = (phase: 'start' | 'move' | 'end' | 'cancel') => {
    if (active)
      options.emit({
        source: active.source,
        phase,
        orientation: active.current,
        transition: 'instant'
      })
  }

  const end = (cancel: boolean) => {
    if (!active) return
    const gesture = active
    // Clear ownership before releasePointerCapture can emit lostpointercapture.
    active = undefined
    if (gesture.element.hasPointerCapture?.(gesture.pointerId))
      gesture.element.releasePointerCapture(gesture.pointerId)
    if (gesture.dragged) {
      suppressClick = true
      options.emit({
        source: gesture.source,
        phase: cancel ? 'cancel' : 'end',
        orientation: gesture.current,
        transition: 'instant'
      })
      if (!cancel && gesture.source === 'drag') options.finish(gesture.current)
    }
  }

  return {
    start(
      event: PointerEvent,
      element: Element,
      size: number,
      compass?: {
        axis: Vec3
        angle: (x: number, y: number) => number | undefined
        source?: 'compass-drag' | 'roll-drag'
      }
    ) {
      if (active || options.disabled() || event.button !== 0 || !event.isPrimary) return
      suppressClick = false
      const initial = options.orientation()
      const initialAngle = compass?.angle(event.clientX, event.clientY)
      if (compass && initialAngle === undefined) return
      active = {
        pointerId: event.pointerId,
        element,
        startX: event.clientX,
        startY: event.clientY,
        initial,
        current: initial,
        observed: initial,
        dragged: false,
        source: compass ? (compass.source ?? 'compass-drag') : 'drag',
        scale: Math.PI / size,
        compass: compass ? { ...compass, last: initialAngle!, total: 0 } : undefined
      }
      element.setPointerCapture?.(event.pointerId)
      event.stopPropagation()
    },
    move(event: PointerEvent) {
      if (!active || active.pointerId !== event.pointerId) return
      const dx = event.clientX - active.startX,
        dy = event.clientY - active.startY
      if (!active.dragged && Math.hypot(dx, dy) < 4) return
      if (!active.dragged) {
        active.dragged = true
        emit('start')
      }
      if (!active) return
      if (active.compass) {
        const angle = active.compass.angle(event.clientX, event.clientY)
        if (angle === undefined || active.compass.last === undefined) {
          active.compass.last = angle
          event.preventDefault()
          event.stopPropagation()
          return
        }
        const delta = angle - active.compass.last
        active.compass.total += Math.atan2(Math.sin(delta), Math.cos(delta))
        active.compass.last = angle
        active.current = rotateOrientation(
          active.initial,
          active.compass.axis,
          active.compass.total
        )
      } else
        active.current = orbitOrientation(
          active.initial,
          dx * active.scale,
          dy * active.scale,
          options.referenceFrame?.()
        )
      event.preventDefault()
      event.stopPropagation()
      emit('move')
    },
    up(event: PointerEvent) {
      if (active?.pointerId === event.pointerId) end(false)
    },
    cancel(event?: PointerEvent) {
      if (!event || active?.pointerId === event.pointerId) end(true)
    },
    sync(orientation: ViewOrientation, disabled: boolean) {
      if (!active) return
      if (
        disabled ||
        (!sameOrientation(orientation, active.observed) &&
          !sameOrientation(orientation, active.current))
      ) {
        // External navigation wins; cancel must not overwrite the external pose.
        active.current = orientation
        end(true)
      } else active.observed = orientation
    },
    click(event: MouseEvent) {
      const suppressed = event.detail !== 0 && suppressClick
      suppressClick = false
      return !options.disabled() && event.button === 0 && !suppressed
    },
    dispose() {
      // Unmount releases resources without calling back into an unmounted host.
      const gesture = active
      active = undefined
      if (gesture?.element.hasPointerCapture?.(gesture.pointerId))
        gesture.element.releasePointerCapture(gesture.pointerId)
    }
  }
}
