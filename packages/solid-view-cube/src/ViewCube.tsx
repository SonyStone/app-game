import type { JSX } from '@solidjs/web'
import { createMemo, createSignal, createTrackedEffect, For, onCleanup, Show } from 'solid-js'
import {
  alignedFace,
  compassAngle,
  compassHitPath,
  cubeLayout,
  cubeMatrix,
  faces,
  faceVisible,
  snapOrientation
} from './cubeGeometry'
import {
  adjacentOrientation,
  compassOrientation,
  dot,
  normalizeOrientation,
  presetOrientation,
  referenceAxes,
  rollOrientation,
  type AdjacentSide,
  type ViewNavigation,
  type ViewOrientation,
  type ViewReferenceFrame
} from './orientation'
import { createPointerGesture } from './pointerGesture'
import styles from './ViewCube.module.css'

/** Controlled SolidJS 2 orientation widget. The host owns camera state and transitions. */
export function ViewCube(props: ViewCubeProps) {
  const orientation = createMemo(() => normalizeOrientation(props.orientation))
  const transform = createMemo(() => cubeMatrix(orientation(), props.referenceFrame))
  const [dragging, setDragging] = createSignal(false)
  const [hoveredTarget, setHoveredTarget] = createSignal<string>()
  const [focusedTarget, setFocusedTarget] = createSignal<string>()
  // An edge or corner has one target ID shared by buttons on its adjoining faces.
  const highlightedTarget = createMemo(() =>
    props.disabled || dragging() ? undefined : (hoveredTarget() ?? focusedTarget())
  )
  const face = createMemo(() => alignedFace(orientation(), props.referenceFrame))
  const compassVisible = createMemo(
    () =>
      props.compass !== false &&
      dot(orientation().direction, referenceAxes(props.referenceFrame).z) > 0.08
  )
  const size = () => {
    const value = props.size ?? 160
    if (!Number.isFinite(value) || value < 100)
      throw new RangeError('ViewCube: size must be at least 100 CSS pixels')
    return value
  }
  let stage!: HTMLDivElement

  const navigate = (
    next: ViewOrientation,
    source: Extract<ViewNavigation, { source: 'preset' | 'adjacent' | 'roll' | 'snap' }>['source']
  ) => {
    if (props.disabled) return
    gesture.cancel()
    props.onNavigate({
      source,
      orientation: next,
      transition:
        props.animated && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
          ? 'animated'
          : 'instant'
    })
  }
  const gesture = createPointerGesture({
    orientation,
    referenceFrame: () => props.referenceFrame,
    disabled: () => props.disabled ?? false,
    emit: (request) => {
      if ('phase' in request) {
        setDragging(request.phase === 'start' || request.phase === 'move')
        if (request.phase === 'start') {
          setHoveredTarget(undefined)
          setFocusedTarget(undefined)
        }
      }
      props.onNavigate(request)
    },
    finish: (next) => {
      if (!props.snap) return
      const snapped = snapOrientation(next, props.referenceFrame)
      if (snapped) navigate(snapped, 'snap')
    }
  })
  createTrackedEffect(() => gesture.sync(orientation(), props.disabled ?? false))
  onCleanup(gesture.dispose)

  const start = (event: PointerEvent, compass = false) => {
    const current = orientation()
    const axes = referenceAxes(props.referenceFrame)
    const rect = stage.getBoundingClientRect()
    const em = rect.width / cubeLayout.stage
    const angle = (x: number, y: number) =>
      compassAngle(
        current,
        (x - rect.left - rect.width / 2) / em,
        (y - rect.top - rect.height / 2) / em,
        props.referenceFrame
      )
    gesture.start(
      event,
      event.currentTarget as Element,
      size(),
      compass ? { axis: axes.z, angle } : undefined
    )
  }

  return (
    <div
      class={`${styles.panel} ${props.class ?? ''}`}
      role="group"
      aria-label="View cube"
      style={{
        ...props.style,
        width: `${size()}px`,
        height: `${size()}px`,
        'font-size': `${size() / 10}px`
      }}
      onPointerMove={gesture.move}
      onPointerUp={gesture.up}
      onPointerCancel={gesture.cancel}
      onLostPointerCapture={gesture.cancel}
      onContextMenu={(event) => event.stopPropagation()}
    >
      <Show when={props.onHome}>
        <button
          type="button"
          class={styles.home}
          title="Home view"
          aria-label="Home"
          disabled={props.disabled}
          onClick={(event) => {
            event.stopPropagation()
            if (gesture.click(event)) {
              gesture.cancel()
              props.onHome?.()
            }
          }}
        >
          <svg class={styles.homeIcon} viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 10.5 12 3l9 7.5M5.5 9v12h5v-7h3v7h5V9" />
          </svg>
        </button>
      </Show>
      <For each={rollControls}>
        {(control) => (
          <button
            type="button"
            class={`${styles.roll} ${styles[control.className]}`}
            title={`${control.label}: click 90°; hold and drag to roll freely`}
            aria-label={control.label}
            disabled={props.disabled}
            onPointerDown={(event) => {
              const rect = stage.getBoundingClientRect()
              gesture.start(event, event.currentTarget, size(), {
                source: 'roll-drag',
                axis: orientation().direction,
                angle: (x, y) => {
                  const dx = x - rect.left - rect.width / 2
                  const dy = y - rect.top - rect.height / 2
                  return Math.hypot(dx, dy) < Math.max(8, size() * 0.06)
                    ? undefined
                    : Math.atan2(dy, dx)
                }
              })
            }}
            onClick={(event) => {
              event.stopPropagation()
              if (gesture.click(event))
                navigate(rollOrientation(orientation(), control.angle), 'roll')
            }}
          >
            <svg class={styles.rollIcon} viewBox="0 0 32 32" aria-hidden="true">
              <path d={control.path} />
            </svg>
          </button>
        )}
      </For>
      <div
        ref={stage}
        class={styles.stage}
        aria-label="Camera orientation"
        style={{
          '--view-cube-size': `${cubeLayout.cube}em`,
          '--view-cube-stage-size': `${cubeLayout.stage}em`,
          '--view-cube-compass-size': `${cubeLayout.compass}em`,
          '--view-cube-compass-depth': `${cubeLayout.depth}em`,
          '--view-cube-focal-length': `${cubeLayout.perspective}em`
        }}
      >
        <Show when={compassVisible()}>
          <svg class={styles.compassHitArea} viewBox="0 0 100 100" aria-hidden="true">
            <path
              d={compassHitPath(orientation(), props.referenceFrame)}
              onPointerDown={(event) => start(event, true)}
            />
          </svg>
        </Show>
        <div class={styles.hitCenter}>
          <div class={styles.hitBody} style={{ transform: transform() }}>
            <Show when={compassVisible()}>
              <div class={styles.compassPlane}>
                <svg class={styles.compassRing} viewBox="0 0 100 100" aria-hidden="true">
                  <circle cx="50" cy="50" r="44" class={styles.compassStroke} />
                </svg>
                <For each={compassMarks}>
                  {(mark) => (
                    <button
                      type="button"
                      class={`${styles.compassMark} ${styles[mark.className]}`}
                      aria-label={`${mark.name} view`}
                      disabled={props.disabled}
                      onPointerDown={(event) => start(event, true)}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (gesture.click(event))
                          navigate(
                            compassOrientation(orientation(), mark.direction, props.referenceFrame),
                            'preset'
                          )
                      }}
                    >
                      {mark.label}
                    </button>
                  )}
                </For>
              </div>
            </Show>
            <For each={faces}>
              {(face) => (
                <div
                  class={`${styles.face} ${styles.hitFace} ${styles[`face${face.label}`]}`}
                  style={{
                    transform: face.transform,
                    visibility: faceVisible(face, orientation(), props.referenceFrame)
                      ? 'visible'
                      : 'hidden'
                  }}
                >
                  <span class={styles.faceLabel} aria-hidden="true">
                    {face.label}
                  </span>
                  <For each={face.zones}>
                    {(zone) => (
                      <button
                        type="button"
                        class={styles.hitZone}
                        title={`${zone.label} view`}
                        aria-label={`${zone.label} view`}
                        data-view-target={zone.id}
                        data-highlighted={highlightedTarget() === zone.id ? '' : undefined}
                        onPointerEnter={(event) => {
                          if (event.pointerType !== 'touch') setHoveredTarget(zone.id)
                        }}
                        onPointerLeave={() => setHoveredTarget(undefined)}
                        onFocus={(event) => {
                          if (event.currentTarget.matches(':focus-visible')) {
                            setHoveredTarget(undefined)
                            setFocusedTarget(zone.id)
                          }
                        }}
                        onBlur={() => setFocusedTarget(undefined)}
                        disabled={props.disabled}
                        onPointerDown={(event) => start(event)}
                        onClick={(event) => {
                          event.stopPropagation()
                          if (gesture.click(event))
                            navigate(
                              presetOrientation(zone.direction, props.referenceFrame),
                              'preset'
                            )
                        }}
                      />
                    )}
                  </For>
                </div>
              )}
            </For>
          </div>
        </div>
        <Show when={!dragging() && face()}>
          <For each={adjacentControls}>
            {(control) => (
              <button
                type="button"
                class={`${styles.adjacent} ${styles[control.className]}`}
                aria-label={`View adjacent face ${control.side}`}
                title={`View adjacent face ${control.side}`}
                disabled={props.disabled}
                onClick={(event) => {
                  event.stopPropagation()
                  if (gesture.click(event))
                    navigate(adjacentOrientation(orientation(), control.side), 'adjacent')
                }}
              >
                <span aria-hidden="true" />
              </button>
            )}
          </For>
        </Show>
      </div>
    </div>
  )
}

/** Props are reactive values, not accessors. No camera object or rendering engine is required. */
export type ViewCubeProps = {
  /** Actual displayed camera orientation, updated also during external orbit and animation. */
  orientation: ViewOrientation
  /** Synchronously applies drag requests; discrete requests may be animated by the host. */
  onNavigate: (request: ViewNavigation) => void
  /** Restores the host's saved camera. Omit to hide Home. */
  onHome?: () => void
  /** Label directions in the world; defaults to Z-up, Front=−Y. */
  referenceFrame?: ViewReferenceFrame
  /** Request animated discrete transitions; default false, overridden by reduced motion. */
  animated?: boolean
  /** Snap within eight degrees of a preset after drag; default false. */
  snap?: boolean
  /** Show the compass on the upper side of the cube; default true. */
  compass?: boolean
  /** Disable all interaction while continuing to display orientation. */
  disabled?: boolean
  /** Widget size in CSS pixels, at least 100; default 160. */
  size?: number
  /** Host-controlled placement and theme overrides. */
  class?: string
  /** Container styles; width/height/font-size are controlled by size. */
  style?: JSX.CSSProperties
}

const rollControls = [
  {
    label: 'Rotate view counterclockwise',
    angle: -Math.PI / 2,
    className: 'rollLeft',
    path: 'M28 22 A27 27 0 0 0 10 9 L11 4 L2 11 L10 20 L9 15 A21 21 0 0 1 23 25 Z'
  },
  {
    label: 'Rotate view clockwise',
    angle: Math.PI / 2,
    className: 'rollRight',
    path: 'M7 4 A27 27 0 0 1 20 22 L25 21 L18 30 L9 22 L14 23 A21 21 0 0 0 4 9 Z'
  }
] as const

const adjacentControls = [
  { side: 'up', className: 'adjacentUp' },
  { side: 'down', className: 'adjacentDown' },
  { side: 'left', className: 'adjacentLeft' },
  { side: 'right', className: 'adjacentRight' }
] satisfies { side: AdjacentSide; className: string }[]

const compassMarks = [
  { label: 'N', name: 'North', className: 'compassNorth', direction: [0, 1, 0] },
  { label: 'E', name: 'East', className: 'compassEast', direction: [1, 0, 0] },
  { label: 'S', name: 'South', className: 'compassSouth', direction: [0, -1, 0] },
  { label: 'W', name: 'West', className: 'compassWest', direction: [-1, 0, 0] }
] as const
