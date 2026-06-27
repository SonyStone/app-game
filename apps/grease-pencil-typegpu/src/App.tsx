import { createEffect, createMemo, createSignal, onCleanup, onMount, type ComponentProps } from 'solid-js'
import {
  GreaseRenderer,
  pointerPressure,
  shouldAppendPoint,
  type Stroke,
  type StrokePoint,
} from './render/greaseRenderer'
import type { Vec4 } from './render/math'
import './index.css'

type ToolMode = 'draw' | 'orbit'

const colorOptions: Array<{ name: string; value: Vec4; swatch: string }> = [
  { name: 'Ink', value: [0.045, 0.044, 0.04, 1], swatch: '#11100f' },
  { name: 'Red', value: [0.88, 0.18, 0.16, 1], swatch: '#dc302b' },
  { name: 'Blue', value: [0.05, 0.32, 0.92, 1], swatch: '#175de8' },
  { name: 'Green', value: [0.02, 0.52, 0.28, 1], swatch: '#148647' },
]

function App() {
  let canvasRef!: HTMLCanvasElement
  let renderer: GreaseRenderer | undefined

  const [mode, setMode] = createSignal<ToolMode>('draw')
  const [status, setStatus] = createSignal('Starting WebGPU...')
  const [strokes, setStrokes] = createSignal<Stroke[]>([])
  const [draftStroke, setDraftStroke] = createSignal<Stroke>()
  const [activeColor, setActiveColor] = createSignal(colorOptions[0])
  const [radius, setRadius] = createSignal(0.045)
  const [pointerLabel, setPointerLabel] = createSignal('Ready')

  const strokeCount = createMemo(() => strokes().length)
  const pointCount = createMemo(() =>
    strokes().reduce((total, stroke) => total + stroke.points.length, 0),
  )

  const activePointers = new Map<number, PointerEvent>()
  let drawingPointerId: number | undefined
  let orbitPointerId: number | undefined
  let lastOrbitPoint: { x: number; y: number } | undefined
  let lastPinchDistance: number | undefined

  onMount(() => {
    let mounted = true
    const handleResize = () => renderer?.resize()
    window.addEventListener('resize', handleResize)

    void (async () => {
      renderer = new GreaseRenderer(canvasRef)
      const result = await renderer.init()
      if (mounted) setStatus(result.message)
    })()

    onCleanup(() => {
      mounted = false
      window.removeEventListener('resize', handleResize)
      renderer?.destroy()
    })
  })

  createEffect(() => {
    renderer?.setStrokes(strokes(), draftStroke())
  })

  const startStroke = (event: PointerEvent) => {
    const position = renderer?.screenToWorld(event.clientX, event.clientY)
    if (!position) return

    drawingPointerId = event.pointerId
    const point: StrokePoint = {
      position: [position[0], position[1], 0.002],
      pressure: pointerPressure(event),
      time: performance.now(),
    }
    setDraftStroke({
      id: crypto.randomUUID(),
      color: activeColor().value,
      radius: radius(),
      points: [point],
    })
    setPointerLabel(`${event.pointerType} pressure ${point.pressure.toFixed(2)}`)
  }

  const appendDraftPoint = (event: PointerEvent) => {
    if (drawingPointerId !== event.pointerId) return
    const position = renderer?.screenToWorld(event.clientX, event.clientY)
    if (!position) return

    setDraftStroke((current) => {
      if (!current) return current
      const point: StrokePoint = {
        position: [position[0], position[1], 0.002],
        pressure: pointerPressure(event),
        time: performance.now(),
      }
      if (!shouldAppendPoint(current.points, point)) return current
      setPointerLabel(`${event.pointerType} pressure ${point.pressure.toFixed(2)}`)
      return {
        ...current,
        points: [...current.points, point],
      }
    })
  }

  const commitDraftStroke = (event: PointerEvent) => {
    if (drawingPointerId !== event.pointerId) return
    const draft = draftStroke()
    drawingPointerId = undefined
    setDraftStroke(undefined)

    if (draft && draft.points.length > 0) {
      setStrokes((items) => [...items, draft])
    }
    setPointerLabel('Ready')
  }

  const onPointerDown = (event: PointerEvent) => {
    canvasRef.setPointerCapture(event.pointerId)
    activePointers.set(event.pointerId, event)

    if (activePointers.size === 2) {
      lastPinchDistance = getPointerDistance()
      return
    }

    const shouldOrbit =
      mode() === 'orbit' || event.button === 1 || event.altKey || event.metaKey
    if (shouldOrbit) {
      orbitPointerId = event.pointerId
      lastOrbitPoint = { x: event.clientX, y: event.clientY }
      setPointerLabel('Orbit')
      return
    }

    startStroke(event)
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!activePointers.has(event.pointerId)) return
    activePointers.set(event.pointerId, event)

    if (activePointers.size >= 2) {
      const nextDistance = getPointerDistance()
      if (nextDistance && lastPinchDistance) {
        renderer?.zoom((lastPinchDistance - nextDistance) * 2.2)
      }
      lastPinchDistance = nextDistance
      setPointerLabel('Pinch zoom')
      return
    }

    if (orbitPointerId === event.pointerId && lastOrbitPoint) {
      const dx = event.clientX - lastOrbitPoint.x
      const dy = event.clientY - lastOrbitPoint.y
      if (event.shiftKey) renderer?.pan(dx, dy)
      else renderer?.orbit(dx, dy)
      lastOrbitPoint = { x: event.clientX, y: event.clientY }
      return
    }

    appendDraftPoint(event)
  }

  const onPointerUp = (event: PointerEvent) => {
    activePointers.delete(event.pointerId)
    if (orbitPointerId === event.pointerId) {
      orbitPointerId = undefined
      lastOrbitPoint = undefined
      setPointerLabel('Ready')
    }
    commitDraftStroke(event)
    if (activePointers.size < 2) lastPinchDistance = undefined
  }

  const undo = () => setStrokes((items) => items.slice(0, -1))
  const clear = () => {
    setDraftStroke(undefined)
    setStrokes([])
  }

  const getPointerDistance = () => {
    const pointers = [...activePointers.values()]
    if (pointers.length < 2) return
    return Math.hypot(
      pointers[0].clientX - pointers[1].clientX,
      pointers[0].clientY - pointers[1].clientY,
    )
  }

  return (
    <main class="grease-pencil-root flex h-dvh w-full flex-col bg-stone-100 text-stone-950">
      <Body class="m-0 overflow-hidden" />
      <header class="flex min-h-14 items-center gap-2 border-b border-stone-300 bg-stone-50 px-3">
        <div class="flex items-center gap-1 rounded-md border border-stone-300 bg-white p-1">
          <button
            class={`tool-button ${mode() === 'draw' ? 'tool-button-active' : ''}`}
            type="button"
            onClick={() => setMode('draw')}
            title="Draw with mouse, touch, or stylus"
          >
            Draw
          </button>
          <button
            class={`tool-button ${mode() === 'orbit' ? 'tool-button-active' : ''}`}
            type="button"
            onClick={() => setMode('orbit')}
            title="Orbit the 3D view"
          >
            Orbit
          </button>
        </div>

        <div class="flex items-center gap-1 rounded-md border border-stone-300 bg-white p-1">
          {colorOptions.map((color) => (
            <button
              class={`h-8 w-8 rounded border ${
                activeColor().name === color.name
                  ? 'border-stone-950'
                  : 'border-stone-300'
              }`}
              style={{ 'background-color': color.swatch }}
              type="button"
              title={color.name}
              onClick={() => setActiveColor(color)}
            />
          ))}
        </div>

        <label class="flex items-center gap-2 rounded-md border border-stone-300 bg-white px-2 py-1 text-sm">
          Size
          <input
            class="w-28 accent-stone-950"
            type="range"
            min="0.015"
            max="0.12"
            step="0.005"
            value={radius()}
            onInput={(event) => setRadius(event.currentTarget.valueAsNumber)}
          />
        </label>

        <button class="command-button ml-auto" type="button" onClick={undo}>
          Undo
        </button>
        <button class="command-button" type="button" onClick={clear}>
          Clear
        </button>
      </header>

      <section class="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          class="h-full w-full touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={(event) => {
            event.preventDefault()
            renderer?.zoom(event.deltaY)
          }}
        />

        <div class="pointer-events-none absolute left-3 top-3 rounded-md border border-stone-300 bg-stone-50/90 px-3 py-2 text-sm text-stone-700 shadow-sm backdrop-blur">
          <div class="font-medium text-stone-950">{status()}</div>
          <div>
            {strokeCount()} strokes · {pointCount()} points · {pointerLabel()}
          </div>
        </div>

        <div class="pointer-events-none absolute bottom-3 left-3 rounded-md border border-stone-300 bg-stone-50/90 px-3 py-2 text-xs text-stone-600 shadow-sm backdrop-blur">
          Draw on the ground plane. Orbit mode rotates. Shift + drag pans. Wheel or
          two-finger pinch zooms.
        </div>
      </section>
    </main>
  )
}

export default App

function Body(props: Pick<ComponentProps<'body'>, 'class'>) {
  const previousClassName = document.body.className
  const previousMargin = document.body.style.margin
  const previousOverflow = document.body.style.overflow

  createEffect(() => {
    document.body.className = props.class ?? ''
    document.body.style.margin = '0'
    document.body.style.overflow = 'hidden'
  })

  onCleanup(() => {
    document.body.className = previousClassName
    document.body.style.margin = previousMargin
    document.body.style.overflow = previousOverflow
  })

  return null
}
