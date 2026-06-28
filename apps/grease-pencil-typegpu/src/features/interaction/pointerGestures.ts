import type { ToolMode } from '../../shared/toolMode'
import { isStylusBarrelButton } from './strokeInput'

export type ViewAction = 'orbit' | 'pan'

export type PointerCenter = {
  x: number
  y: number
}

export function getViewAction(
  mode: ToolMode,
  event: PointerEvent,
): ViewAction | undefined {
  if (event.pointerType === 'touch') return 'orbit'
  if (mode === 'pan' || event.button === 2) return 'pan'
  if (
    mode === 'orbit' ||
    event.button === 1 ||
    event.altKey ||
    event.metaKey ||
    isStylusBarrelButton(event)
  ) {
    return 'orbit'
  }
  if (event.shiftKey && mode === 'draw') return 'pan'
  return undefined
}

export function getPointerDistance(
  pointers: Iterable<PointerEvent>,
): number | undefined {
  const [first, second] = [...pointers]
  if (!first || !second) return undefined
  return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY)
}

export function getPointerCenter(
  pointers: Iterable<PointerEvent>,
): PointerCenter | undefined {
  const [first, second] = [...pointers]
  if (!first || !second) return undefined
  return {
    x: (first.clientX + second.clientX) / 2,
    y: (first.clientY + second.clientY) / 2,
  }
}
