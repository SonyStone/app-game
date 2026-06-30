import {
  For,
  createMemo,
  onCleanup,
} from 'solid-js'
import {
  clamp,
  getCameraBasis,
  type NavigationCubeCamera,
  type Vec3,
} from './navigationMath'
import styles from './NavigationCube.module.css'

export type NavigationCubeTarget = {
  label: string
  direction: Vec3
}

export type NavigationCubeActionOptions = {
  animate?: boolean
}

export type NavigationCubeProps = {
  animateViewChanges?: boolean
  camera: NavigationCubeCamera
  focalLength?: string
  onHome: (options?: NavigationCubeActionOptions) => void
  onOrbit: (deltaX: number, deltaY: number) => void
  onRoll: (angle: number, options?: NavigationCubeActionOptions) => void
  onSetView: (
    target: NavigationCubeTarget,
    options?: NavigationCubeActionOptions,
  ) => void
}

type FaceKey = 'back' | 'bottom' | 'front' | 'left' | 'right' | 'top'
type ZoneOffset = -1 | 0 | 1
type DragMode = 'compass' | 'cube'

type FaceDef = {
  key: FaceKey
  label: string
  normal: Vec3
  targetU: Vec3
  targetV: Vec3
  transform: string
}

type DragGesture = {
  didDrag: boolean
  element: HTMLElement
  lastX: number
  lastY: number
  mode: DragMode
  pointerId: number
  startX: number
  startY: number
  target?: NavigationCubeTarget
}

const QUARTER_TURN = Math.PI / 2
const DEFAULT_FOCAL_LENGTH = '34rem'
const COMPASS_BOTTOM_HIDE_END = 0.34
const COMPASS_BOTTOM_HIDE_START = 0.08
const DRAG_THRESHOLD_PX = 4
const zoneOffsets = [-1, 0, 1] as const
const compassMarks = [
  { key: 'north', label: 'N', className: styles.compassNorth },
  { key: 'east', label: 'E', className: styles.compassEast },
  { key: 'south', label: 'S', className: styles.compassSouth },
  { key: 'west', label: 'W', className: styles.compassWest },
] as const

const faceDefs: readonly FaceDef[] = [
  {
    key: 'top',
    label: 'Top',
    normal: [0, 0, 1],
    targetU: [1, 0, 0],
    targetV: [0, -1, 0],
    transform: 'translateZ(var(--view-cube-half))',
  },
  {
    key: 'bottom',
    label: 'Bottom',
    normal: [0, 0, -1],
    targetU: [-1, 0, 0],
    targetV: [0, 1, 0],
    transform: 'rotateY(180deg) translateZ(var(--view-cube-half))',
  },
  {
    key: 'front',
    label: 'Front',
    normal: [0, -1, 0],
    targetU: [1, 0, 0],
    targetV: [0, 0, 1],
    transform: 'rotateX(90deg) translateZ(var(--view-cube-half))',
  },
  {
    key: 'back',
    label: 'Back',
    normal: [0, 1, 0],
    targetU: [1, 0, 0],
    targetV: [0, 0, -1],
    transform: 'rotateX(-90deg) translateZ(var(--view-cube-half))',
  },
  {
    key: 'right',
    label: 'Right',
    normal: [1, 0, 0],
    targetU: [0, 0, -1],
    targetV: [0, 1, 0],
    transform: 'rotateY(90deg) translateZ(var(--view-cube-half))',
  },
  {
    key: 'left',
    label: 'Left',
    normal: [-1, 0, 0],
    targetU: [0, 0, 1],
    targetV: [0, 1, 0],
    transform: 'rotateY(-90deg) translateZ(var(--view-cube-half))',
  },
]

const faceClassByKey = {
  back: styles.faceBack,
  bottom: styles.faceBottom,
  front: styles.faceFront,
  left: styles.faceLeft,
  right: styles.faceRight,
  top: styles.faceTop,
} satisfies Record<FaceKey, string>

export function NavigationCube(props: NavigationCubeProps) {
  const cubeMatrix = createMemo(() => createCubeMatrix(props.camera))
  const compassState = createMemo(() => createCompassState(props.camera))
  let dragGesture: DragGesture | undefined
  let removeWindowDragListeners: (() => void) | undefined

  const actionOptions = (): NavigationCubeActionOptions => ({
    animate: props.animateViewChanges ?? false,
  })

  const addWindowDragListeners = () => {
    if (removeWindowDragListeners) return

    window.addEventListener('pointermove', moveDragGesture, { passive: false })
    window.addEventListener('pointerup', endDragGesture, { passive: false })
    window.addEventListener('pointercancel', cancelDragGesture, {
      passive: false,
    })
    removeWindowDragListeners = () => {
      window.removeEventListener('pointermove', moveDragGesture)
      window.removeEventListener('pointerup', endDragGesture)
      window.removeEventListener('pointercancel', cancelDragGesture)
      removeWindowDragListeners = undefined
    }
  }

  onCleanup(() => {
    removeWindowDragListeners?.()
    dragGesture = undefined
  })

  const startDragGesture = (
    event: PointerEvent,
    mode: DragMode,
    target?: NavigationCubeTarget,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    const element = event.currentTarget as HTMLElement
    addWindowDragListeners()
    capturePointer(element, event.pointerId)
    dragGesture = {
      didDrag: false,
      element,
      lastX: event.clientX,
      lastY: event.clientY,
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      target,
    }
  }

  const moveDragGesture = (event: PointerEvent) => {
    if (!dragGesture || dragGesture.pointerId !== event.pointerId) return

    event.preventDefault()
    event.stopPropagation()

    const totalDeltaX = event.clientX - dragGesture.startX
    const totalDeltaY = event.clientY - dragGesture.startY
    if (
      !dragGesture.didDrag &&
      Math.hypot(totalDeltaX, totalDeltaY) < DRAG_THRESHOLD_PX
    ) {
      return
    }

    dragGesture.didDrag = true
    const deltaX = event.clientX - dragGesture.lastX
    const deltaY = event.clientY - dragGesture.lastY
    dragGesture.lastX = event.clientX
    dragGesture.lastY = event.clientY

    if (dragGesture.mode === 'compass') {
      props.onOrbit(deltaX, 0)
      return
    }

    props.onOrbit(deltaX, deltaY)
  }

  const endDragGesture = (event: PointerEvent) => {
    if (!dragGesture || dragGesture.pointerId !== event.pointerId) return

    event.preventDefault()
    event.stopPropagation()
    releasePointer(dragGesture.element, event.pointerId)
    removeWindowDragListeners?.()

    if (!dragGesture.didDrag && dragGesture.target) {
      props.onSetView(dragGesture.target, actionOptions())
    }
    dragGesture = undefined
  }

  const cancelDragGesture = (event: PointerEvent) => {
    if (!dragGesture || dragGesture.pointerId !== event.pointerId) return

    event.preventDefault()
    event.stopPropagation()
    releasePointer(dragGesture.element, event.pointerId)
    removeWindowDragListeners?.()
    dragGesture = undefined
  }

  return (
    <div
      class={styles.panel}
      aria-label="View cube"
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <button
        class={styles.home}
        type="button"
        title="Home view"
        onPointerDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
          props.onHome(actionOptions())
        }}
      >
        Home
      </button>

      <button
        class={`${styles.roll} ${styles.rollLeft}`}
        type="button"
        title="Rotate view counterclockwise"
        aria-label="Rotate view counterclockwise"
        onPointerDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
          props.onRoll(QUARTER_TURN, actionOptions())
        }}
      >
        <span class={styles.rollIcon} aria-hidden="true" />
      </button>
      <button
        class={`${styles.roll} ${styles.rollRight}`}
        type="button"
        title="Rotate view clockwise"
        aria-label="Rotate view clockwise"
        onPointerDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
          props.onRoll(-QUARTER_TURN, actionOptions())
        }}
      >
        <span class={styles.rollIcon} aria-hidden="true" />
      </button>

      <div
        class={styles.stage}
        aria-label="Camera orientation"
        style={{
          '--view-cube-focal-length':
            props.focalLength ?? DEFAULT_FOCAL_LENGTH,
        }}
      >
        <div class={styles.center}>
          <div class={styles.body} style={{ transform: cubeMatrix() }}>
            <div
              class={styles.compassPlane}
              style={{ opacity: compassState() }}
              aria-hidden="true"
            >
              <div class={styles.compassDisc} />
              <For each={compassMarks}>
                {(mark) => (
                  <span class={`${styles.compassMark} ${mark.className}`}>
                    {mark.label}
                  </span>
                )}
              </For>
            </div>
            <For each={faceDefs}>
              {(face) => (
                <div
                  class={`${styles.face} ${faceClassByKey[face.key]}`}
                  style={{ transform: face.transform }}
                >
                  <span class={styles.faceLabel}>{face.label}</span>
                </div>
              )}
            </For>
          </div>
        </div>
        <button
          class={styles.compassHit}
          type="button"
          title="Orbit view around top axis"
          aria-label="Orbit view around top axis"
          onPointerDown={(event) => startDragGesture(event, 'compass')}
          onPointerMove={moveDragGesture}
          onPointerUp={endDragGesture}
          onPointerCancel={cancelDragGesture}
        />
        <div class={styles.hitCenter}>
          <div class={styles.hitBody} style={{ transform: cubeMatrix() }}>
            <For each={faceDefs}>
              {(face) => (
                <div
                  class={styles.hitFace}
                  style={{ transform: face.transform }}
                >
                  <For each={zoneOffsets}>
                    {(row) => (
                      <For each={zoneOffsets}>
                        {(col) => {
                          const target = faceTarget(face, row, col)
                          return (
                            <button
                              class={styles.hitZone}
                              type="button"
                              title={`${target.label} view`}
                              aria-label={`${target.label} view`}
                              onPointerDown={(event) =>
                                startDragGesture(event, 'cube', target)}
                              onPointerMove={moveDragGesture}
                              onPointerUp={endDragGesture}
                              onPointerCancel={cancelDragGesture}
                            />
                          )
                        }}
                      </For>
                    )}
                  </For>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </div>
  )
}

function createCompassState(camera: NavigationCubeCamera) {
  const { forward } = getCameraBasis(camera)
  const bottomViewAmount = forward[2]
  return String(1 - smoothstep(
    COMPASS_BOTTOM_HIDE_START,
    COMPASS_BOTTOM_HIDE_END,
    bottomViewAmount,
  ))
}

function createCubeMatrix(camera: NavigationCubeCamera) {
  const { forward, right, up } = getCameraBasis(camera)
  const viewToCamera = scaleVec3(forward, -1)
  const matrix = [
    right[0],
    -up[0],
    viewToCamera[0],
    0,
    right[1],
    -up[1],
    viewToCamera[1],
    0,
    right[2],
    -up[2],
    viewToCamera[2],
    0,
    0,
    0,
    0,
    1,
  ]

  return `matrix3d(${matrix.map(formatMatrixNumber).join(',')})`
}

function scaleVec3(vector: Vec3, scalar: number): Vec3 {
  return [vector[0] * scalar, vector[1] * scalar, vector[2] * scalar]
}

function faceTarget(
  face: FaceDef,
  row: ZoneOffset,
  col: ZoneOffset,
): NavigationCubeTarget {
  const direction: Vec3 = [
    face.normal[0] + face.targetU[0] * col + face.targetV[0] * row,
    face.normal[1] + face.targetU[1] * col + face.targetV[1] * row,
    face.normal[2] + face.targetU[2] * col + face.targetV[2] * row,
  ]

  return {
    direction,
    label: viewLabel(direction[0], direction[1], direction[2]),
  }
}

function viewLabel(x: number, y: number, z: number) {
  if (z !== 0) {
    return [
      z > 0 ? 'Top' : 'Bottom',
      x < 0 ? 'Left' : x > 0 ? 'Right' : '',
      y < 0 ? 'Front' : y > 0 ? 'Back' : '',
    ]
      .filter(Boolean)
      .join(' ')
  }

  return [
    y < 0 ? 'Front' : y > 0 ? 'Back' : '',
    x < 0 ? 'Left' : x > 0 ? 'Right' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

function formatMatrixNumber(value: number) {
  return Number(value.toFixed(6))
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function capturePointer(element: HTMLElement, pointerId: number) {
  try {
    element.setPointerCapture?.(pointerId)
  }
  catch {
    // Some synthetic/browser-dispatched pointer events have no active pointer.
  }
}

function releasePointer(element: HTMLElement, pointerId: number) {
  try {
    element.releasePointerCapture?.(pointerId)
  }
  catch {
    // Ignore release failures for pointers that were never captured.
  }
}
