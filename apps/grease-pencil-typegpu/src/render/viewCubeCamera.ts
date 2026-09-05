import { interpolateOrientation, type ViewOrientation } from '@app-game/solid-view-cube'
import { getCameraBasis, type CameraState } from './cameraMatrices'
import { cross3, dot3, normalize3, scale3 } from './vector'

/** Converts the renderer's actual camera frame, including locked-plane roll, for ViewCube. */
export function cameraOrientation(camera: CameraState): ViewOrientation {
  const basis = getCameraBasis(camera)
  return { direction: scale3(basis.forward, -1), up: basis.up }
}

/** Applies a complete orientation while preserving pivot/distance and optionally the locked plane. */
export function applyViewOrientation(
  camera: CameraState,
  value: ViewOrientation,
  keepPlane = false
) {
  const direction = normalize3([...value.direction])
  const up = normalize3([...value.up])
  if (keepPlane && camera.mode === '2d' && camera.lockedNormal && camera.lockedUp) {
    const forward = scale3(direction, -1)
    camera.roll = signedAngle(camera.lockedUp, up, forward)
    return
  }
  camera.mode = '3d'
  camera.lockedNormal = undefined
  camera.lockedUp = undefined
  // At a pole keep the current azimuth and recover the remaining rotation through roll.
  if (Math.hypot(direction[0], direction[1]) > 1e-7)
    camera.yaw = Math.atan2(direction[0], -direction[1])
  camera.pitch = Math.atan2(direction[2], Math.hypot(direction[0], direction[1]))
  camera.roll = 0
  const basis = getCameraBasis(camera)
  camera.roll = signedAngle(basis.up, up, basis.forward)
}

/** Interpolates full camera orientation through poles; positional animation stays with the renderer. */
export function interpolateViewOrientation(
  camera: CameraState,
  from: CameraState,
  to: CameraState,
  amount: number
) {
  const orientation = interpolateOrientation(cameraOrientation(from), cameraOrientation(to), amount)
  camera.mode = to.mode
  camera.lockedNormal = to.lockedNormal ? [...to.lockedNormal] : undefined
  camera.lockedUp = to.lockedUp ? [...to.lockedUp] : undefined
  applyViewOrientation(camera, orientation, to.mode === '2d')
}

function signedAngle(
  from: Parameters<typeof cross3>[0],
  to: Parameters<typeof cross3>[1],
  axis: Parameters<typeof dot3>[0]
) {
  return Math.atan2(dot3(axis, cross3(from, to)), dot3(from, to))
}
